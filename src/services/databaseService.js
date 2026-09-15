// Database service
// Em produção persiste em PostgreSQL via Prisma; em testes usa memória.

const { prisma } = require("../config");
const partnerRepository = require("../repositories/partnerRepository");
const { generateUniqueSlug } = require("./publicFormLinkService");

const useInMemoryRepository =
  process.env.NODE_ENV === "test" || !process.env.DATABASE_URL;
const memorySales = new Map();

const normalizeName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const saveCustomer = async (customerData) => {
  console.log(`[Banco de Dados] Salvando cliente ${customerData.name}...`);

  // Validar se parceiro existe
  const partner = await partnerRepository.findByPartnerId(
    customerData.partnerId,
  );
  if (!partner) {
    throw new Error(`Parceiro não encontrado: ${customerData.partnerId}`);
  }

  // Create sale object
  const sale = {
    id: `sale-${Date.now()}`,
    partnerId: customerData.partnerId,
    saleId: customerData.saleId,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    roundTrip: customerData.roundTrip || false,
    baggageQty: Number(customerData.baggageQty) || 1,
    hasInsurance: customerData.hasInsurance || false,
    expirationDate: customerData.expirationDate
      ? new Date(customerData.expirationDate)
      : null,
    outboundDate: customerData.outboundDate
      ? new Date(customerData.outboundDate)
      : null,
    returnDate: customerData.returnDate
      ? new Date(customerData.returnDate)
      : null,
    isManualSale: customerData.isManualSale === true,
    status: "processing",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (useInMemoryRepository) {
    memorySales.set(sale.id, sale);
    return sale;
  }

  return prisma.sale.create({
    data: {
      partnerId: customerData.partnerId,
      saleId: customerData.saleId,
      slug: generateUniqueSlug(customerData.name),
      customerName: customerData.name,
      customerEmail: customerData.email,
      customerPhone: customerData.phone,
      roundTrip: customerData.roundTrip || false,
      baggageQty: Number(customerData.baggageQty) || 1,
      hasInsurance: customerData.hasInsurance || false,
      expirationDate: customerData.expirationDate
        ? new Date(customerData.expirationDate)
        : null,
      outboundDate: customerData.outboundDate
        ? new Date(customerData.outboundDate)
        : null,
      returnDate: customerData.returnDate
        ? new Date(customerData.returnDate)
        : null,
      isManualSale: customerData.isManualSale === true,
      status: "processing",
    },
  });
};

const updateSale = async (saleId, data) => {
  if (useInMemoryRepository) {
    const sale = memorySales.get(saleId);
    if (!sale) {
      throw new Error(`Sale ${saleId} not found`);
    }

    const updated = {
      ...sale,
      ...data,
      updatedAt: new Date(),
    };

    memorySales.set(saleId, updated);
    return updated;
  }

  return prisma.sale.update({
    where: { id: saleId },
    data: {
      ...data,
      updatedAt: new Date(),
    },
  });
};

const findSaleById = async (saleId) => {
  if (useInMemoryRepository) {
    return memorySales.get(saleId) || null;
  }

  return prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      partner: true,
      submissions: true,
    },
  });
};

const findSaleByExternalSaleId = async (saleId) => {
  if (useInMemoryRepository) {
    return (
      Array.from(memorySales.values()).find((sale) => sale.saleId === saleId) ||
      null
    );
  }

  return prisma.sale.findFirst({
    where: { saleId },
    include: {
      partner: true,
      submissions: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};

const findSaleByPartnerAndExternalSaleId = async (partnerId, saleId) => {
  if (useInMemoryRepository) {
    return (
      Array.from(memorySales.values()).find(
        (sale) => sale.partnerId === partnerId && sale.saleId === saleId,
      ) || null
    );
  }

  return prisma.sale.findFirst({
    where: { partnerId, saleId },
    orderBy: { createdAt: "desc" },
  });
};

const _findInMemory = (normalizedSearch, tokens) => {
  const matches = Array.from(memorySales.values())
    .filter((sale) => {
      const candidate = normalizeName(sale.customerName);
      return (
        candidate.includes(normalizedSearch) ||
        (tokens.length > 0 &&
          tokens.every((token) => candidate.includes(token)))
      );
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return matches[0] || null;
};

const findLatestSaleByCustomerName = async (customerName) => {
  const normalizedSearch = normalizeName(customerName);
  if (!normalizedSearch) return null;
  const tokens = normalizedSearch
    .split(" ")
    .filter((token) => token.length >= 2);

  if (useInMemoryRepository) {
    return _findInMemory(normalizedSearch, tokens);
  }

  const directMatch = await prisma.sale.findFirst({
    where: {
      customerName: {
        contains: normalizedSearch,
        mode: "insensitive",
      },
    },
    include: {
      partner: true,
      submissions: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (directMatch) return directMatch;

  // Fallback accent-insensitive search (e.g. "joao" should match "joão").
  const firstToken = normalizedSearch.split(" ")[0];
  if (!firstToken) return null;

  const candidates = await prisma.sale.findMany({
    where: {
      customerName: {
        contains: firstToken,
        mode: "insensitive",
      },
    },
    include: {
      partner: true,
      submissions: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

  const strictCandidate = candidates.find((sale) =>
    normalizeName(sale.customerName).includes(normalizedSearch),
  );
  if (strictCandidate) return strictCandidate;

  // Last-resort fallback: inspect recent records and compare with normalized tokens
  // to avoid DB collation/accent limitations.
  const recentSales = await prisma.sale.findMany({
    where: {
      formLink: {
        not: null,
      },
    },
    include: {
      partner: true,
      submissions: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 500,
  });

  return (
    recentSales.find((sale) => {
      const candidate = normalizeName(sale.customerName);
      return (
        candidate.includes(normalizedSearch) ||
        (tokens.length > 0 &&
          tokens.every((token) => candidate.includes(token)))
      );
    }) || null
  );
};

const findSaleBySlug = async (slug) => {
  if (!slug) return null;
  return prisma.sale.findUnique({
    where: { slug },
    include: { partner: true, submissions: true },
  });
};

module.exports = {
  saveCustomer,
  updateSale,
  findSaleById,
  findSaleByExternalSaleId,
  findSaleByPartnerAndExternalSaleId,
  findLatestSaleByCustomerName,
  findSaleBySlug,
};
