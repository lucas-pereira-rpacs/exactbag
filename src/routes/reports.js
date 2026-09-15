/**
 * Sales Reports Routes - Endpoints de API para gerentes da ExactBag
 * POST   /api/reports/generate - Gerar e enviar relatório imediatamente
 * GET    /api/reports/preview  - Obter preview do relatório (últimos 7 dias)
 * GET    /api/reports/config   - Obter configuração atual do relatório
 * POST   /api/reports/config   - Atualizar configuração do relatório
 */

const express = require("express");
const router = express.Router();
const salesReportsService = require("../services/salesReportsService");
const authMiddleware = require("../middlewares/authMiddleware");
const dbService = require("../services/databaseService");
const {
  buildPublicFormUrl,
  buildPrettyPublicFormUrl,
} = require("../services/publicFormLinkService");

// Todos os endpoints de relatório requerem autenticação
router.use(authMiddleware);

/**
 * POST /api/reports/generate
 * Gerar e enviar relatório imediatamente
 * Parâmetros de Query: type=weekly|monthly
 * Requer: Admin/Manager API Key
 */
router.post("/generate", async (req, res) => {
  try {
    const { type = "weekly" } = req.query;

    if (!["weekly", "monthly"].includes(type)) {
      return res.status(400).json({
        error: "Tipo de relatório inválido",
        valid: ["weekly", "monthly"],
      });
    }

    console.log(`[Reports] Gerando relatório ${type} sob demanda`);

    const result = await salesReportsService.generateAndSendReport(type);

    res.status(200).json({
      status: "success",
      message: `Relatório ${type} gerado e enviado por email`,
      type,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Reports] Erro ao gerar relatório:", error);
    res.status(500).json({
      error: "Falha ao gerar relatório",
      details: error.message,
    });
  }
});

/**
 * GET /api/reports/sales/:saleId
 * Obter uma venda específica com seus relacionamentos para validação operacional
 */
router.get("/sales/:saleId", async (req, res) => {
  try {
    const sale = await dbService.findSaleByExternalSaleId(req.params.saleId);

    if (!sale) {
      return res.status(404).json({
        error: "Venda não encontrada",
        saleId: req.params.saleId,
      });
    }

    res.status(200).json({
      status: "success",
      sale,
      shortFormLink: sale.formLink
        ? buildPublicFormUrl(req, sale.saleId)
        : null,
      prettyFormLink: sale.formLink
        ? buildPrettyPublicFormUrl(req, sale.slug || sale.customerName)
        : null,
    });
  } catch (error) {
    console.error("[Reports] Erro ao consultar venda:", error);
    res.status(500).json({
      error: "Falha ao consultar venda",
      details: error.message,
    });
  }
});

/**
 * GET /api/reports/preview
 * Obter preview de relatório (últimos 7 dias de dados)
 * Retorna: Conteúdo CSV
 */
router.get("/preview", async (req, res) => {
  try {
    console.log("[Reports] Gerando preview");

    const csv = await salesReportsService.getReportPreview();

    // Retornar como arquivo CSV para download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="relatorio-preview.csv"',
    );
    res.send(csv);
  } catch (error) {
    console.error("[Reports] Erro ao gerar preview:", error);
    res.status(500).json({
      error: "Falha ao gerar preview",
      details: error.message,
    });
  }
});

/**
 * GET /api/reports/config
 * Obter configuração atual de relatório
 */
router.get("/config", async (req, res) => {
  try {
    const config = await salesReportsService.getReportConfig();

    res.status(200).json({
      status: "success",
      config: {
        enabled: config.enabled,
        recipients: config.recipients,
        weekly: {
          day: config.weeklyDay,
          time: config.weeklyTime,
        },
        monthly: {
          day: config.monthlyDay,
          time: config.monthlyTime,
        },
      },
    });
  } catch (error) {
    console.error("[Reports] Erro ao obter configuração:", error);
    res.status(500).json({
      error: "Falha ao obter configuração",
      details: error.message,
    });
  }
});

/**
 * POST /api/reports/config
 * Atualizar configuração de relatório
 * Body: {
 *   enabled: boolean,
 *   recipients: string[],
 *   weekly: { day: string, time: string },
 *   monthly: { day: number, time: string }
 * }
 */
router.post("/config", async (req, res) => {
  try {
    const { enabled, recipients, weekly, monthly } = req.body;

    // Validar destinatários
    if (recipients && Array.isArray(recipients)) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = recipients.filter((e) => !emailRegex.test(e));

      if (invalidEmails.length > 0) {
        return res.status(400).json({
          error: "Endereços de email inválidos",
          invalid: invalidEmails,
        });
      }
    }

    // Validar horários
    const timeRegex = /^\d{2}:\d{2}$/;
    if (weekly?.time && !timeRegex.test(weekly.time)) {
      return res.status(400).json({
        error: "Formato de horário inválido para relatório semanal",
        expected: "HH:MM",
      });
    }
    if (monthly?.time && !timeRegex.test(monthly.time)) {
      return res.status(400).json({
        error: "Formato de horário inválido para relatório mensal",
        expected: "HH:MM",
      });
    }

    // Construir nova configuração
    const newConfig = {
      enabled: enabled !== undefined ? enabled : true,
      recipients: recipients || [],
      weeklyDay: weekly?.day || "monday",
      weeklyTime: weekly?.time || "09:00",
      monthlyDay: monthly?.day || 1,
      monthlyTime: monthly?.time || "09:00",
    };

    // Atualizar configuração
    const updated = await salesReportsService.updateReportConfig(newConfig);

    res.status(200).json({
      status: "success",
      message: "Configuração atualizada",
      note: "Reinicialização do agendador pode ser necessária para aplicar mudanças",
      config: updated,
    });
  } catch (error) {
    console.error("[Reports] Erro ao atualizar configuração:", error);
    res.status(500).json({
      error: "Falha ao atualizar configuração",
      details: error.message,
    });
  }
});

/**
 * GET /api/reports/history
 * Obter lista de últimos relatórios gerados (para implementação futura)
 */
router.get("/history", async (req, res) => {
  // TODO: Implementar histórico de relatórios quando a tabela ReportLog for adicionada
  res.status(200).json({
    status: "success",
    message: "Recurso de histórico de relatório em breve",
    reports: [],
  });
});

module.exports = router;
