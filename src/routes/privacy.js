/**
 * Privacy Routes - Endpoints de Conformidade LGPD
 * POST /api/privacy/data-access - Obter dados do usuário
 * DELETE /api/privacy/data-deletion - Deletar dados do usuário
 * POST /api/privacy/data-export - Exportar dados em formato
 * POST /api/privacy/data-correction - Corrigir dados do usuário
 * POST /api/privacy/opt-out - Desinscrever-se de comunicações
 * GET /api/privacy/consent-history - Obter histórico de consentimento
 */

const express = require("express");
const router = express.Router();
const privacyService = require("../services/privacyService");

/**
 * POST /api/privacy/data-access
 * Artigo 18 LGPD - Direito de Acesso
 * Usuário pode solicitar todos os dados que temos sobre eles
 */
router.post("/data-access", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Invalid email address",
        message: "Please provide a valid email address",
      });
    }

    console.log(`[Privacy] Solicitação de acesso a dados de: ${email}`);

    const data = await privacyService.getDataAccess(email);

    // Registrar esta solicitação
    await privacyService.logConsent(
      email,
      {
        type: "data_access_request",
        timestamp: new Date().toISOString(),
      },
      "data-access-endpoint",
    );

    res.status(200).json({
      status: "success",
      message: "Seus dados foram recuperados",
      data,
      notes:
        "Estes dados serão enviados para seu email por segurança. Verifique sua caixa de entrada.",
    });
  } catch (error) {
    console.error("[Privacy] Erro em data-access:", error);
    res.status(500).json({
      error: "Falha ao recuperar dados",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/privacy/data-deletion
 * Artigo 18 LGPD - Direito de Esquecimento (Direito de Erasura)
 * Deletar permanentemente os dados pessoais do usuário
 * NOTA: Alguns dados são retidos por obrigação legal/fiscal
 */
router.delete("/data-deletion", async (req, res) => {
  try {
    const { email, reason = "" } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Endereço de email inválido",
        message: "Por favor, forneça um endereço de email válido",
      });
    }

    console.warn(
      `[Privacy] Solicitação de deleção de dados de: ${email}, Motivo: ${reason}`,
    );

    const deletionReport = await privacyService.deleteData(email, reason);

    res.status(200).json({
      status: "success",
      message: "Sua solicitação de deleção de dados foi processada",
      report: deletionReport,
      warnings: [
        "Dados de vendas são retidos por 5 anos devido à lei fiscal brasileira (LGPD Art. 43)",
        "Você não poderá recuperar dados deletados",
        "Um email de confirmação foi enviado para verificar esta solicitação",
      ],
    });
  } catch (error) {
    console.error("[Privacy] Erro em data-deletion:", error);
    res.status(500).json({
      error: "Falha ao deletar dados",
      message: error.message,
    });
  }
});

/**
 * POST /api/privacy/data-export
 * Artigo 18 LGPD - Direito de Portabilidade de Dados
 * Exportar dados pessoais em formato legível por máquina
 * Suporta: JSON, CSV, XML
 */
router.post("/data-export", async (req, res) => {
  try {
    const { email, format = "json" } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Endereço de email inválido",
        message: "Por favor, forneça um endereço de email válido",
      });
    }

    if (!["json", "csv", "xml"].includes(format.toLowerCase())) {
      return res.status(400).json({
        error: "Formato inválido",
        message: "O formato deve ser: json, csv ou xml",
      });
    }

    console.log(
      `[Privacy] Solicita de export de dados de: ${email}, Formato: ${format}`,
    );

    const exportedData = await privacyService.exportData(email, format);

    // Registrar esta solicitação
    await privacyService.logConsent(
      email,
      {
        type: "data_export_request",
        format,
        timestamp: new Date().toISOString(),
      },
      "data-export-endpoint",
    );

    // Definir tipo de conteúdo apropriado
    const contentTypes = {
      json: "application/json",
      csv: "text/csv",
      xml: "application/xml",
    };

    res.setHeader("Content-Type", contentTypes[format.toLowerCase()]);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="exactbag-data-export-${Date.now()}.${format.toLowerCase()}"`,
    );

    res.status(200).send(exportedData);
  } catch (error) {
    console.error("[Privacy] Erro em data-export:", error);
    res.status(500).json({
      error: "Falha ao exportar dados",
      message: error.message,
    });
  }
});

/**
 * POST /api/privacy/data-correction
 * Artigo 18 LGPD - Direito de Correção/Retificação
 * Usuário pode corrigir dados pessoais imprecisos
 */
router.post("/data-correction", async (req, res) => {
  try {
    const { email, corrections } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Endereço de email inválido",
        message: "Por favor, forneça um endereço de email válido",
      });
    }

    if (!corrections || Object.keys(corrections).length === 0) {
      return res.status(400).json({
        error: "Nenhuma correção fornecida",
        message: "Por favor, forneça pelo menos um campo para corrigir",
      });
    }

    console.log(`[Privacy] Solicitação de correção de dados de: ${email}`);

    const result = await privacyService.correctData(email, corrections);

    // Registrar esta solicitação
    await privacyService.logConsent(
      email,
      {
        type: "data_correction_request",
        corrections: Object.keys(corrections),
        timestamp: new Date().toISOString(),
      },
      "data-correction-endpoint",
    );

    res.status(200).json({
      status: "success",
      message: "Seus dados foram corrigidos",
      result,
    });
  } catch (error) {
    console.error("[Privacy] Erro em data-correction:", error);
    res.status(500).json({
      error: "Falha ao corrigir dados",
      message: error.message,
    });
  }
});

/**
 * POST /api/privacy/opt-out
 * Retirada de Consentimento LGPD
 * Usuário pode se descadastrar de comunicações de marketing/analytics/todas
 */
router.post("/opt-out", async (req, res) => {
  try {
    const { email, type = "marketing" } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Endereço de email inválido",
        message: "Por favor, forneça um endereço de email válido",
      });
    }

    if (!["marketing", "analytics", "all"].includes(type.toLowerCase())) {
      return res.status(400).json({
        error: "Tipo de opt-out inválido",
        message: "Tipo deve ser: marketing, analytics ou all",
      });
    }

    console.log(`[Privacy] Solicitação de opt-out de: ${email}, Tipo: ${type}`);

    const result = await privacyService.optOut(email, type.toLowerCase());

    // Registrar esta solicitação
    await privacyService.logConsent(
      email,
      {
        type: "opt_out_request",
        optOutType: type.toLowerCase(),
        timestamp: new Date().toISOString(),
      },
      "opt-out-endpoint",
    );

    res.status(200).json({
      status: "success",
      message: `Você se descadastrou com sucesso de comunicações de ${type}`,
      result,
    });
  } catch (error) {
    console.error("[Privacy] Erro em opt-out:", error);
    res.status(500).json({
      error: "Falha ao processar opt-out",
      message: error.message,
    });
  }
});

/**
 * GET /api/privacy/consent-history/:email
 * Obter hist\u00f3rico de consentimento (trilha de auditoria)
 * Isso requer autentica\u00e7\u00e3o/verifica\u00e7\u00e3o
 */
router.get("/consent-history/:email", async (req, res) => {
  try {
    const { email } = req.params;

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Invalid email address",
      });
    }

    console.log(`[Privacy] Consent history request for: ${email}`);

    const history = await privacyService.getConsentHistory(email);

    res.status(200).json({
      status: "success",
      email,
      history,
      message: "Consent history retrieved successfully",
    });
  } catch (error) {
    console.error("[Privacy] Error in consent-history:", error);
    res.status(500).json({
      error: "Failed to retrieve consent history",
      message: error.message,
    });
  }
});

/**
 * POST /api/privacy/consent-record
 * Internally log new consent (called when user gives consent)
 * This is for internal use by the application
 */
router.post("/consent-record", async (req, res) => {
  try {
    const { email, consents, source = "system" } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Invalid email address",
      });
    }

    if (!consents || typeof consents !== "object") {
      return res.status(400).json({
        error: "Invalid consents object",
        message: "Consents must be an object with boolean values",
      });
    }

    console.log(`[Privacy] Consent recorded for: ${email}, Source: ${source}`);

    const result = await privacyService.logConsent(email, consents, source);

    res.status(200).json({
      status: result ? "success" : "partial",
      message: "Consent has been recorded",
    });
  } catch (error) {
    console.error("[Privacy] Error in consent-record:", error);
    res.status(500).json({
      error: "Failed to record consent",
      message: error.message,
    });
  }
});

module.exports = router;
