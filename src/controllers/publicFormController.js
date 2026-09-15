const dbService = require("../services/databaseService");
const {
  verifyFormAccessToken,
  parsePrettySlug,
} = require("../services/publicFormLinkService");
const {
  buildNativeRegistrationLink,
} = require("../services/nativeRegistrationLinkService");

const redirectToPrefilledForm = async (req, res) => {
  try {
    const { token } = req.params;
    const validation = verifyFormAccessToken(token);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: "Link invalido ou expirado",
        code: validation.error,
      });
    }

    const sale = await dbService.findSaleByExternalSaleId(validation.saleId);
    if (!sale) {
      return res.status(404).json({
        success: false,
        error: "Formulario nao encontrado para esta venda",
      });
    }

    if (sale.status === "cancelada") {
      return res.status(410).json({
        success: false,
        error:
          "Esta venda foi cancelada. O link de registro não está mais disponível.",
      });
    }

    return res.redirect(302, buildNativeRegistrationLink(sale.saleId));
  } catch (error) {
    console.error("[PublicForm] Erro ao redirecionar link curto:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao abrir formulario",
    });
  }
};

const redirectToPrettyPrefilledForm = async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res.status(400).json({
        success: false,
        error: "Slug invalido",
      });
    }

    // Busca por slug exato primeiro (novo formato com sufixo)
    let sale = await dbService.findSaleBySlug(slug);

    // Fallback: busca por nome (slugs antigos sem sufixo)
    if (!sale) {
      const searchTerm = parsePrettySlug(slug);
      if (searchTerm) {
        sale = await dbService.findLatestSaleByCustomerName(searchTerm);
        if (!sale) {
          const firstName = String(searchTerm).split(" ")[0];
          if (firstName && firstName.length >= 3) {
            sale = await dbService.findLatestSaleByCustomerName(firstName);
          }
        }
      }
    }
    if (!sale) {
      return res.status(404).json({
        success: false,
        error: "Formulario nao encontrado para este cliente",
      });
    }

    if (sale.status === "cancelada") {
      return res.status(410).json({
        success: false,
        error:
          "Esta venda foi cancelada. O link de registro não está mais disponível.",
      });
    }

    return res.redirect(302, buildNativeRegistrationLink(sale.saleId));
  } catch (error) {
    console.error("[PublicForm] Erro ao redirecionar link amigavel:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao abrir formulario",
    });
  }
};

module.exports = {
  redirectToPrefilledForm,
  redirectToPrettyPrefilledForm,
};
