/**
 * Estimativa de custos para e-mail (SES/Resend) e WhatsApp (Meta).
 * Função utilitária para planejar volume e custos.
 */

const ESTIMATES = {
  email: {
    provider: "SES",
    costPerEmailUSD: Number(process.env.SES_COST_PER_1000 || 0.1) / 1000,
    freeTierPerMonth: Number(process.env.SES_FREE_TIER || 62000),
  },
  whatsapp: {
    provider: process.env.WHATSAPP_PROVIDER || "meta",
    costPerMessageUSD: Number(
      process.env.WHATSAPP_COST_PER_MESSAGE || getDefaultWhatsAppCost(),
    ),
    twilioCost: 0.04,
    metaCost: 0.0085,
    zapiCost: 0.02,
  },
};

function getDefaultWhatsAppCost() {
  const provider = process.env.WHATSAPP_PROVIDER || "meta";
  switch (provider) {
    case "meta":
      return 0.0085;
    case "zapi":
      return 0.02;
    case "twilio":
    default:
      return 0.04;
  }
}

function estimateMonthlyCost({ emailsPerMonth, whatsappMessagesPerMonth }) {
  const emailUnits = Math.max(
    0,
    emailsPerMonth - ESTIMATES.email.freeTierPerMonth,
  );
  const emailCost = emailUnits * ESTIMATES.email.costPerEmailUSD;
  const whatsappCost =
    (whatsappMessagesPerMonth || 0) * ESTIMATES.whatsapp.costPerMessageUSD;

  const totalCost = Number((emailCost + whatsappCost).toFixed(2));

  const details = {
    email: {
      costPerEmailUSD: ESTIMATES.email.costPerEmailUSD,
      freeTier: ESTIMATES.email.freeTierPerMonth,
      emailsPerMonth,
      billedEmails: emailUnits,
      estimatedCostUSD: Number(emailCost.toFixed(2)),
    },
    whatsapp: {
      costPerMessageUSD: ESTIMATES.whatsapp.costPerMessageUSD,
      messagesPerMonth: whatsappMessagesPerMonth,
      estimatedCostUSD: Number(whatsappCost.toFixed(2)),
    },
    totalCostUSD: totalCost,
  };

  return details;
}

module.exports = {
  estimateMonthlyCost,
};
