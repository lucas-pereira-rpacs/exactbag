const axios = require("axios");
const { prisma } = require("../config");

const NOW_API_BASE_URL =
  process.env.NOW_API_BASE_URL || "https://saas-dev.nowseguros.seg.br";
const NOW_PRODUCT_CODE = process.env.NOW_PRODUCT_CODE || "160323";
const REQUEST_TIMEOUT_MS = Number(process.env.NOW_API_TIMEOUT_MS) || 180000;

const nowApi = axios.create({
  baseURL: NOW_API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
    ...(process.env.NOW_API_ORIGIN
      ? { Origin: process.env.NOW_API_ORIGIN }
      : {}),
  },
});

function getCredentials() {
  const login = process.env.NOW_API_LOGIN;
  const senha = process.env.NOW_API_PASSWORD;

  if (!login || !senha) {
    throw new Error("NOW_API_LOGIN and NOW_API_PASSWORD must be configured");
  }

  return { login, senha };
}

async function authenticate() {
  const { data } = await nowApi.post("/login", getCredentials());

  if (!data?.token) {
    throw new Error(
      `NOW login did not return a token: ${data?.mensagem || "unknown error"}`,
    );
  }

  return data.token;
}

async function findProposalByNumber(token, nrproposta) {
  const response = await nowApi.get(
    `/proposta/nrproposta/${encodeURIComponent(nrproposta)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: (status) => status === 200 || status === 404,
    },
  );

  return response.status === 200 ? response.data : null;
}

function getProposalId(data) {
  return (
    data?.retorno?.proposta?.dados_proposta?.[0]?.propostaid ||
    data?.proposta?.dados_proposta?.[0]?.propostaid ||
    data?.dados_proposta?.[0]?.propostaid ||
    data?.propostaid ||
    null
  );
}

async function getProductTemplate(token) {
  const { data } = await nowApi.get(`/produtos/${NOW_PRODUCT_CODE}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const template = data?.produto?.jsonProposta;
  if (!template?.proposta) {
    throw new Error("[Agenda][now-integration] NOW product did not return jsonProposta");
  }

  return JSON.parse(JSON.stringify(template));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function getDefaultAddress() {
  return {
    logradouro: process.env.NOW_DEFAULT_ADDRESS_STREET || "Avenida Paulista",
    numero: process.env.NOW_DEFAULT_ADDRESS_NUMBER || "1000",
    complemento: process.env.NOW_DEFAULT_ADDRESS_COMPLEMENT || "",
    bairro: process.env.NOW_DEFAULT_ADDRESS_DISTRICT || "Bela Vista",
    cidade: process.env.NOW_DEFAULT_ADDRESS_CITY || "Sao Paulo",
    siglaestado: process.env.NOW_DEFAULT_ADDRESS_STATE || "SP",
    cep: onlyDigits(process.env.NOW_DEFAULT_ADDRESS_ZIP || "01310000"),
  };
}

async function buildProposalPayload(nrproposta, registration, token) {
  const template = await getProductTemplate(token);
  const proposalData = template.proposta.dados_proposta || [];
  const insured = template.proposta.segurado || {};
  const insuredItem = template.proposta.item_segurado || [];
  const billing = template.proposta.cobranca || {};
  const contacts = insured.contato || [];
  const todayDate = new Date();
  const startDate = registration.outboundDate || todayDate;
  const endDate = registration.returnDate || addDays(startDate, 30);
  const today = formatDate(todayDate);
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  const address = getDefaultAddress();

  return {
    ...template,
    proposta: {
      ...template.proposta,
      dados_proposta: proposalData.map((proposal, index) => ({
        ...proposal,
        data_base_calculo: today,
        vigencia: {
          ...proposal.vigencia,
          data_inicio: start,
          data_fim: end,
        },
        dtemissao: today,
        nrproposta: index === 0 ? nrproposta : proposal.nrproposta,
      })),
      segurado: {
        ...insured,
        nome: registration.passengerName,
        cpf_cnpj: onlyDigits(registration.passengerCpf),
        endereco: {
          ...insured.endereco,
          ...address,
        },
        contato: contacts.map((contact) =>
          contact.tipo === "email"
            ? { ...contact, descricao: registration.passengerEmail }
            : contact,
        ),
      },
      item_segurado: insuredItem.map((item) => ({
        ...item,
        vigencia: {
          ...item.vigencia,
          data_inicio: start,
          data_fim: end,
        },
        caracteristicas: {
          ...item.caracteristicas,
          enquadramento: {
            ...item.caracteristicas?.enquadramento,
            local_de_risco: {
              ...item.caracteristicas?.enquadramento?.local_de_risco,
              ...address,
            },
          },
        },
      })),
      cobranca: {
        ...billing,
        parcelas_cobradas: {
          ...billing.parcelas_cobradas,
          dtvencimento: today,
          dtrecebido: today,
        },
      },
    },
  };
}

/**
 * Handles the `now-integration` Agenda job.
 *
 * @param {import("agenda").Job} job - The Agenda job instance.
 * @returns {Promise<void>}
 */
async function nowIntegrationHandler(job) {
  const { saleId, cpvNumber } = job?.attrs?.data || {};

  if (!cpvNumber) {
    throw new Error("[Agenda][now-integration] now requires a cpfv number:");
  }

  const isInsured = await prisma.nativeRegistration.findFirst({
    where: {
      saleId,
      cpvNumber: { not: cpvNumber },
    },
    select: { id: true },
  });

  if (isInsured) {
    console.log("[Agenda][now-integration] only one insurance per customer:");
    return;
  }

  const token = await authenticate();
  const registration = await prisma.nativeRegistration.findUnique({
    where: { cpvNumber },
    include: { baggageItems: true },
  });

  if (!registration) {
    throw new Error(
      `[Agenda][now-integration] registration not found for CPV: ${cpvNumber}`,
    );
  }

  const proposals = [];

  for (const baggage of registration.baggageItems) {
    const nrproposta = String(baggage.id);
    const existingProposal = await findProposalByNumber(token, nrproposta);

    if (existingProposal) {
      const propostaid = getProposalId(existingProposal);
      proposals.push({
        cpv: String(cpvNumber),
        baggageId: baggage.id,
        nrproposta,
        propostaid,
        foundAt: new Date().toISOString(),
        lookupResponse: existingProposal,
      });

      console.log("[Agenda][now-integration] baggage proposal already exists; skipping:", {
        cpv: cpvNumber,
        baggageId: baggage.id,
        nrproposta,
        propostaid,
      });
      continue;
    }

    const payload = await buildProposalPayload(nrproposta, registration, token);
    const { data } = await nowApi.post("/proposta", payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const propostaid = getProposalId(data);

    proposals.push({
      cpv: String(cpvNumber),
      baggageId: baggage.id,
      nrproposta,
      propostaid,
      submittedAt: new Date().toISOString(),
      submitResponse: data,
    });

    console.log("[Agenda][now-integration] baggage proposal submitted:", {
      cpv: cpvNumber,
      baggageId: baggage.id,
      nrproposta,
      propostaid,
    });
  }

  if (saleId) {
    const [sale] = await prisma.$queryRaw`
      SELECT id, integration_responses AS "integrationResponses"
      FROM "Sale"
      WHERE "saleId" = ${saleId}
      LIMIT 1
    `;

    if (sale) {
      const integrationResponses = {
        ...(sale.integrationResponses || {}),
        now: {
          ...(sale.integrationResponses?.now || {}),
          cpv: String(cpvNumber),
          proposals,
        },
      };

      await prisma.$executeRaw`
        UPDATE "Sale"
        SET integration_responses = ${JSON.stringify(integrationResponses)}::jsonb
        WHERE id = ${sale.id}
      `;
    }
  }
}

module.exports = nowIntegrationHandler;
