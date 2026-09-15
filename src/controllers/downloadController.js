// Controlador para downloads de produto digital
const productGateway = require("../gateways/productGateway");

exports.downloadProduct = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: "Token de download é obrigatório" });
    }

    // Processa o download
    const downloadResult = await productGateway.processDownload(token);

    if (!downloadResult.success) {
      return res.status(400).json({ error: downloadResult.error });
    }

    // Em produção: servir arquivo real
    // Para MVP: retornar JSON com dados do produto
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="exactbag-${downloadResult.productData.customerId}.json"`,
    );

    return res.status(200).json({
      message: "Download autorizado",
      product: downloadResult.productData,
      downloadInfo: {
        count: downloadResult.downloadCount,
        maxDownloads: downloadResult.maxDownloads,
        expiresAt: downloadResult.expiresAt,
      },
    });
  } catch (error) {
    console.error("Erro no download:", error);

    if (error.message.includes("inválido")) {
      return res.status(404).json({ error: "Token de download inválido" });
    }

    if (error.message.includes("expirado")) {
      return res.status(410).json({ error: "Token de download expirado" });
    }

    if (error.message.includes("Limite")) {
      return res.status(429).json({ error: "Limite de downloads excedido" });
    }

    return res.status(500).json({ error: "Erro interno no download" });
  }
};

exports.getDownloadStatus = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: "Token de download é obrigatório" });
    }

    const status = await productGateway.getDownloadStatus(token);

    return res.status(200).json(status);
  } catch (error) {
    console.error("Erro ao verificar status:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
};
