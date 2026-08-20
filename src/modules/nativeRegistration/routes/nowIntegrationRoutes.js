const axios = require("axios");
const express = require("express");
const { prisma } = require("../../../config");
const {
  dashboardAuthMiddleware,
  requireRole,
} = require("../services/dashboardAuthService");

const router = express.Router();
const nowApi = axios.create({
  baseURL:
    process.env.NOW_API_BASE_URL || "https://saas-dev.nowseguros.seg.br",
  timeout: Number(process.env.NOW_API_TIMEOUT_MS) || 180000,
  headers: {
    "Content-Type": "application/json",
    ...(process.env.NOW_API_ORIGIN
      ? { Origin: process.env.NOW_API_ORIGIN }
      : {}),
  },
});

async function cancelProposal(propostaid, cancellation) {
  const login = process.env.NOW_API_LOGIN;
  const senha = process.env.NOW_API_PASSWORD;
  if (!login || !senha) {
    throw new Error("NOW_API_LOGIN and NOW_API_PASSWORD must be configured");
  }

  const { data: loginData } = await nowApi.post("/login", { login, senha });
  if (!loginData?.token) {
    throw new Error(
      `NOW login did not return a token: ${loginData?.mensagem || "unknown error"}`,
    );
  }

  const { data } = await nowApi.delete(
    `/proposta/${encodeURIComponent(propostaid)}`,
    {
      headers: { Authorization: `Bearer ${loginData.token}` },
      data: cancellation,
    },
  );
  return data;
}

router.post(
  "/:saleId/cancel",
  dashboardAuthMiddleware,
  requireRole("gestor"),
  async (req, res) => {
    try {
      if (!prisma) {
        return res
          .status(503)
          .json({ success: false, error: "Banco indisponivel." });
      }

      const motivo = String(req.body?.motivo || "").trim();
      const dataCancelamento = String(req.body?.dataCancelamento || "").trim();
      if (!motivo || !/^\d{4}-\d{2}-\d{2}$/.test(dataCancelamento)) {
        return res.status(400).json({
          success: false,
          error: "Motivo e data de cancelamento sao obrigatorios.",
        });
      }

      const [sale] = await prisma.$queryRaw`
        SELECT id, integration_responses AS "integrationResponses"
        FROM "Sale"
        WHERE id = ${req.params.saleId}
        LIMIT 1
      `;
      const now = sale?.integrationResponses?.now;
      const proposal = Array.isArray(now?.proposals)
        ? now.proposals.find((item) => item.baggageId === req.body.baggageId)
        : now;

      if (!sale || !proposal?.propostaid) {
        return res.status(404).json({
          success: false,
          error: "Proposta NOW nao encontrada para esta venda.",
        });
      }

      const cancelResponse = await cancelProposal(proposal.propostaid, {
        motivo,
        dataCancelamento,
      });
      const cancelledAt = new Date().toISOString();
      const cancellation = { motivo, dataCancelamento };
      const integrationResponses = {
        ...(sale.integrationResponses || {}),
        now: Array.isArray(now?.proposals)
          ? {
              ...now,
              proposals: now.proposals.map((item) =>
                item.baggageId === req.body.baggageId
                  ? { ...item, cancelledAt, cancellation, cancelResponse }
                  : item,
              ),
            }
          : { ...now, cancelledAt, cancellation, cancelResponse },
      };

      await prisma.$executeRaw`
        UPDATE "Sale"
        SET integration_responses = ${JSON.stringify(integrationResponses)}::jsonb
        WHERE id = ${sale.id}
      `;

      return res.json({ success: true, data: integrationResponses.now });
    } catch (err) {
      console.error("[IntegrationsNOW] Erro ao cancelar proposta:", err.message);
      return res.status(500).json({
        success: false,
        error: "Erro ao cancelar proposta NOW.",
      });
    }
  },
);

module.exports = router;
