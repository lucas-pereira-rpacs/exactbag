// Gateway para Produto Digital - Gerencia downloads seguros
// Abstrai sistema de entrega de produto digital

const crypto = require("crypto");
const { prisma } = require("../config");

// Configurações (mover para .env na produção)
const PRODUCT_CONFIG = {
  downloadBaseUrl:
    process.env.PRODUCT_DOWNLOAD_BASE_URL || "https://downloads.exactbag.com",
  tokenExpirationHours: process.env.PRODUCT_TOKEN_EXPIRATION || 24, // horas
  secretKey: process.env.PRODUCT_SECRET_KEY || "your_secret_key_for_tokens",
};

class ProductGateway {
  constructor() {
    this.downloadLinks = new Map(); // Em memória para MVP, usar Redis na produção
  }

  _shouldUsePersistentStorage() {
    return Boolean(prisma) && process.env.NODE_ENV !== "test";
  }

  /**
   * Gera link seguro de download para um cliente
   * @param {Object} customerData - Dados do cliente
   * @param {Object} submissionData - Dados do formulário preenchido
   * @returns {Object} - Link de download e token
   */
  async generateDownloadLink(customerData, submissionData) {
    try {
      console.log(
        "[ProductGateway] Gerando link de download para:",
        customerData.name,
      );

      // Gera token único e seguro
      const token = this._generateSecureToken();
      const expiresAt = new Date(
        Date.now() + PRODUCT_CONFIG.tokenExpirationHours * 60 * 60 * 1000,
      );

      // Armazena informações do download (em produção: Redis/database)
      const productData = this._generateProductData(
        customerData,
        submissionData,
      );
      const downloadInfo = {
        token,
        saleId: customerData.id || null,
        customerName: customerData.name,
        customerEmail: customerData.email,
        submissionId: submissionData.submissionId,
        productData,
        createdAt: new Date(),
        expiresAt,
        downloaded: false,
        downloadCount: 0,
        maxDownloads: 3, // Limite de downloads por token
      };

      if (this._shouldUsePersistentStorage()) {
        await prisma.downloadToken.create({
          data: {
            token,
            saleId: downloadInfo.saleId,
            submissionId: downloadInfo.submissionId,
            customerName: downloadInfo.customerName,
            customerEmail: downloadInfo.customerEmail,
            productData: JSON.stringify(productData),
            expiresAt,
            maxDownloads: downloadInfo.maxDownloads,
          },
        });
      } else {
        this.downloadLinks.set(token, downloadInfo);
      }

      // Gera URL de download
      const downloadUrl = `${PRODUCT_CONFIG.downloadBaseUrl}/download/${token}`;

      console.log("[ProductGateway] Link gerado:", downloadUrl);

      return {
        downloadUrl,
        token,
        expiresAt,
        maxDownloads: downloadInfo.maxDownloads,
      };
    } catch (error) {
      console.error("[ProductGateway] Erro ao gerar link:", error);
      throw new Error("Erro ao preparar download do produto");
    }
  }

  /**
   * Valida e processa download do produto
   * @param {string} token - Token de download
   * @returns {Object} - Dados do produto ou erro
   */
  async processDownload(token) {
    try {
      console.log("[ProductGateway] Processando download para token:", token);

      const downloadInfo = this._shouldUsePersistentStorage()
        ? await prisma.downloadToken.findUnique({ where: { token } })
        : this.downloadLinks.get(token);

      if (!downloadInfo) {
        throw new Error("Token de download inválido");
      }

      // Verifica expiração
      if (new Date() > downloadInfo.expiresAt) {
        throw new Error("Token de download expirado");
      }

      // Verifica limite de downloads
      if (downloadInfo.downloadCount >= downloadInfo.maxDownloads) {
        throw new Error("Limite de downloads excedido");
      }

      // Incrementa contador
      const nextDownloadCount = downloadInfo.downloadCount + 1;
      const now = new Date();
      const firstDownloadAt = downloadInfo.downloaded
        ? downloadInfo.firstDownloadAt
        : now;

      // Marca como baixado na primeira vez
      if (this._shouldUsePersistentStorage()) {
        await prisma.downloadToken.update({
          where: { token },
          data: {
            downloadCount: nextDownloadCount,
            downloaded: true,
            firstDownloadAt,
            lastDownloadAt: now,
          },
        });
      } else {
        downloadInfo.downloadCount = nextDownloadCount;
        downloadInfo.lastDownloadAt = now;
        if (!downloadInfo.downloaded) {
          downloadInfo.downloaded = true;
          downloadInfo.firstDownloadAt = now;
        }
      }

      const parsedProductData =
        typeof downloadInfo.productData === "string"
          ? JSON.parse(downloadInfo.productData)
          : downloadInfo.productData;

      console.log(
        "[ProductGateway] Download autorizado, count:",
        nextDownloadCount,
      );

      return {
        success: true,
        productData: parsedProductData,
        downloadCount: nextDownloadCount,
        maxDownloads: downloadInfo.maxDownloads,
        expiresAt: downloadInfo.expiresAt,
      };
    } catch (error) {
      console.error("[ProductGateway] Erro no download:", error);
      throw error;
    }
  }

  /**
   * Verifica status de um token de download
   * @param {string} token - Token de download
   * @returns {Object} - Status do token
   */
  async getDownloadStatus(token) {
    try {
      const downloadInfo = this._shouldUsePersistentStorage()
        ? await prisma.downloadToken.findUnique({ where: { token } })
        : this.downloadLinks.get(token);

      if (!downloadInfo) {
        return { valid: false, reason: "Token não encontrado" };
      }

      const now = new Date();
      const expired = now > downloadInfo.expiresAt;
      const exhausted = downloadInfo.downloadCount >= downloadInfo.maxDownloads;

      return {
        valid: !expired && !exhausted,
        expired,
        exhausted,
        downloadCount: downloadInfo.downloadCount,
        maxDownloads: downloadInfo.maxDownloads,
        expiresAt: downloadInfo.expiresAt,
        downloaded: downloadInfo.downloaded,
        customerName: downloadInfo.customerName,
      };
    } catch (error) {
      console.error("[ProductGateway] Erro ao verificar status:", error);
      return { valid: false, reason: "Erro interno" };
    }
  }

  /**
   * Limpa tokens expirados (chamar periodicamente)
   */
  async cleanupExpiredTokens() {
    try {
      console.log("[ProductGateway] Limpando tokens expirados...");

      const now = new Date();
      let cleaned = 0;

      if (this._shouldUsePersistentStorage()) {
        const result = await prisma.downloadToken.deleteMany({
          where: {
            expiresAt: {
              lt: now,
            },
          },
        });

        console.log(
          `[ProductGateway] ${result.count} tokens expirados removidos`,
        );
        return result.count;
      }

      for (const [token, info] of this.downloadLinks.entries()) {
        if (now > info.expiresAt) {
          this.downloadLinks.delete(token);
          cleaned++;
        }
      }

      console.log(`[ProductGateway] ${cleaned} tokens expirados removidos`);
      return cleaned;
    } catch (error) {
      console.error("[ProductGateway] Erro na limpeza:", error);
      throw error;
    }
  }

  // Gera token seguro único
  _generateSecureToken() {
    return crypto.randomBytes(32).toString("hex");
  }

  // Gera dados do produto personalizado baseado nos dados do cliente
  _generateProductData(customerData, submissionData) {
    // Em produção: gerar PDF, e-book, ou outro produto digital personalizado
    // Para MVP: simular dados do produto

    const productData = {
      customerId: customerData.id,
      customerName: customerData.name,
      productType: "ExactBag Registration Guide",
      generatedAt: new Date(),
      tripDetails: submissionData.customerData.tripDetails,
      bagSpecifications: this._generateBagSpecs(
        submissionData.customerData.tripDetails,
      ),
      downloadUrl: "https://example.com/download/product.pdf", // URL real do arquivo
      fileSize: "2.5MB",
      format: "PDF",
      instructions: [
        "Imprima este guia antes da viagem",
        "Leve-o junto com seus documentos",
        "Apresente-o na check-in da companhia aérea",
        "Mantenha-o seguro durante toda a viagem",
      ],
      support: {
        email: "support@exactbag.com",
        phone: "+55 11 99999-9999",
        website: "https://exactbag.com/support",
      },
    };

    return productData;
  }

  // Gera especificações das bagagens baseado na viagem
  _generateBagSpecs(tripDetails) {
    const specs = [];

    // Sempre inclui bagagem de mão
    specs.push({
      type: "Bagagem de Mão",
      weight: "10kg",
      dimensions: "55cm x 40cm x 20cm",
      allowed: true,
      tips: [
        "Liquidos em embalagens de até 100ml",
        "Computador e itens pessoais",
        "Documentos importantes",
      ],
    });

    // Bagagem despachada se for viagem de volta ou especificado
    if (
      tripDetails.roundTrip ||
      tripDetails.bags?.some((b) => b.type === "checked")
    ) {
      specs.push({
        type: "Bagagem Despachada",
        weight: "23kg",
        dimensions: "158cm (soma das 3 dimensões)",
        allowed: true,
        tips: [
          "Roupas e itens pesados",
          "Produtos de higiene",
          "Itens frágeis bem embalados",
        ],
      });
    }

    return specs;
  }

  // Método para desenvolvimento/testes
  getAllTokens() {
    return Array.from(this.downloadLinks.entries()).map(([token, info]) => ({
      token,
      customerName: info.customerName,
      expiresAt: info.expiresAt,
      downloadCount: info.downloadCount,
    }));
  }
}

module.exports = new ProductGateway();
