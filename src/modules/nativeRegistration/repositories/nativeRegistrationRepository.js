// Repository para Registro Nativo — acesso a dados via Prisma, com fallback em memória
const { prisma } = require('../../../config');
const crypto = require('crypto');

let useInMemory = !prisma;
let dbFailed = false;

function isMemMode() {
  return useInMemory || dbFailed;
}

// Wrapper para tentar Prisma e cair em memória se DB inacessível
async function tryPrisma(fn, memFallback) {
  if (isMemMode()) return memFallback();
  try { return await fn(); }
  catch (err) {
    const name = err.constructor ? err.constructor.name : '';
    const isDbError = name.startsWith('PrismaClient') || name === 'TypeError' || (err.code && err.code.startsWith('P'));
    if (isDbError) {
      console.warn('[NativeRepo] DB/Prisma indisponível, fallback memória:', err.message);
      dbFailed = true;
      return memFallback();
    }
    throw err;
  }
}

// ===== In-memory store (dev/teste sem DB) =====
const memStore = [];
const MEM_STORE_MAX = 100; // Cap to prevent unbounded growth in fallback mode

function matchFilter(record, filters) {
  if (filters.partnerId && record.partnerId !== filters.partnerId) return false;
  if (filters.status && record.status !== filters.status) return false;
  if (filters.passengerEmail && !record.passengerEmail.toLowerCase().includes(filters.passengerEmail.toLowerCase())) return false;
  if (filters.passengerName && !record.passengerName.toLowerCase().includes(filters.passengerName.toLowerCase())) return false;
  if (filters.cpvNumber && !(record.cpvNumber || '').toLowerCase().includes(filters.cpvNumber.toLowerCase())) return false;
  if (filters.hasInsurance !== undefined && !!record.hasInsurance !== filters.hasInsurance) return false;
  if (filters.dateFrom && new Date(record.createdAt) < new Date(filters.dateFrom)) return false;
  if (filters.dateTo && new Date(record.createdAt) > new Date(filters.dateTo)) return false;
  return true;
}

// ===== Prisma implementations =====
const prismaCreate = async (data) => {
  const { baggageItems, ...registrationData } = data;
  return prisma.nativeRegistration.create({
    data: {
      ...registrationData,
      baggageItems: baggageItems && baggageItems.length > 0
        ? { create: baggageItems }
        : undefined
    },
    include: { baggageItems: true }
  });
};

const prismaFindById = async (id) => {
  return prisma.nativeRegistration.findUnique({ where: { id }, include: { baggageItems: true } });
};

const prismaFindByCpvNumber = async (cpvNumber) => {
  return prisma.nativeRegistration.findUnique({ where: { cpvNumber }, include: { baggageItems: true } });
};

const prismaFindRecent = async (email, phone, windowMs = 60000) => {
  const since = new Date(Date.now() - windowMs);
  return prisma.nativeRegistration.findFirst({
    where: {
      passengerEmail: { equals: email, mode: 'insensitive' },
      passengerPhone: phone,
      createdAt: { gte: since }
    },
    include: { baggageItems: true },
    orderBy: { createdAt: 'desc' }
  });
};

const prismaUpdate = async (id, data) => {
  return prisma.nativeRegistration.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
    include: { baggageItems: true }
  });
};

const prismaFindMany = async ({ page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', filters = {} } = {}) => {
  const where = {};
  if (filters.partnerId) where.partnerId = filters.partnerId;
  if (filters.status) where.status = filters.status;
  if (filters.passengerEmail) where.passengerEmail = { contains: filters.passengerEmail, mode: 'insensitive' };
  if (filters.passengerName) where.passengerName = { contains: filters.passengerName, mode: 'insensitive' };
  if (filters.cpvNumber) where.cpvNumber = { contains: filters.cpvNumber, mode: 'insensitive' };
  if (filters.hasInsurance !== undefined) where.hasInsurance = filters.hasInsurance;
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }
  const skip = (page - 1) * limit;
  const allowedSortFields = ['createdAt', 'passengerName', 'status', 'updatedAt'];
  const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
  const [records, total] = await Promise.all([
    prisma.nativeRegistration.findMany({
      where,
      include: {
        baggageItems: {
          select: { id: true, bagType: true, color: true, brand: true, identifierTag: true, createdAt: true }
        }
      },
      orderBy: { [orderField]: sortOrder === 'asc' ? 'asc' : 'desc' },
      skip,
      take: limit
    }),
    prisma.nativeRegistration.count({ where })
  ]);
  // Add photoCount per registration (without transferring base64 images)
  const data = records.map(r => ({
    ...r,
    photoCount: r.baggageItems ? r.baggageItems.reduce((n, i) => n + (i.imageData ? 1 : 0) + (i.imageData2 ? 1 : 0), 0) : 0
  }));
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const prismaCountByStatus = async (filters = {}) => {
  const where = {};
  if (filters.partnerId) where.partnerId = filters.partnerId;
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }
  const result = await prisma.nativeRegistration.groupBy({ by: ['status'], where, _count: { _all: true } });
  return result.reduce((acc, item) => { acc[item.status] = item._count._all; return acc; }, {});
};

// ===== In-memory implementations =====
const memCreate = async (data) => {
  const { baggageItems, ...rest } = data;
  const now = new Date();
  const record = {
    id: crypto.randomUUID(),
    ...rest,
    baggageItems: (baggageItems || []).map(b => ({ id: crypto.randomUUID(), ...b, createdAt: now })),
    createdAt: now,
    updatedAt: now
  };
  // Evict oldest if at capacity (FIFO)
  while (memStore.length >= MEM_STORE_MAX) memStore.shift();
  memStore.push(record);
  return record;
};

const memFindById = async (id) => memStore.find(r => r.id === id) || null;

const memFindByCpvNumber = async (cpvNumber) => memStore.find(r => r.cpvNumber === cpvNumber) || null;

const memFindRecent = async (email, phone, windowMs = 60000) => {
  const since = Date.now() - windowMs;
  return memStore.find(r =>
    r.passengerEmail.toLowerCase() === email.toLowerCase() &&
    r.passengerPhone === phone &&
    new Date(r.createdAt).getTime() >= since
  ) || null;
};

const memUpdate = async (id, data) => {
  const idx = memStore.findIndex(r => r.id === id);
  if (idx === -1) return null;
  Object.assign(memStore[idx], data, { updatedAt: new Date() });
  return memStore[idx];
};

const memFindMany = async ({ page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', filters = {} } = {}) => {
  let filtered = memStore.filter(r => matchFilter(r, filters));
  const allowedSortFields = ['createdAt', 'passengerName', 'status', 'updatedAt'];
  const field = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
  filtered.sort((a, b) => {
    const va = a[field] || '', vb = b[field] || '';
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortOrder === 'asc' ? cmp : -cmp;
  });
  const total = filtered.length;
  const start = (page - 1) * limit;
  return { data: filtered.slice(start, start + limit), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
};

const memCountByStatus = async (filters = {}) => {
  const filtered = memStore.filter(r => matchFilter(r, filters));
  return filtered.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
};

module.exports = {
  create: (data) => tryPrisma(() => prismaCreate(data), () => memCreate(data)),
  findById: (id) => tryPrisma(() => prismaFindById(id), () => memFindById(id)),
  findByCpvNumber: (cpv) => tryPrisma(() => prismaFindByCpvNumber(cpv), () => memFindByCpvNumber(cpv)),
  findRecent: (email, phone, windowMs) => tryPrisma(() => prismaFindRecent(email, phone, windowMs), () => memFindRecent(email, phone, windowMs)),
  update: (id, data) => tryPrisma(() => prismaUpdate(id, data), () => memUpdate(id, data)),
  findMany: (opts) => tryPrisma(() => prismaFindMany(opts), () => memFindMany(opts)),
  countByStatus: (f) => tryPrisma(() => prismaCountByStatus(f), () => memCountByStatus(f)),
  // Busca o indicador de seguro da venda do parceiro (fonte autoritativa) a partir do saleId.
  findSaleHasInsurance: (saleId) => tryPrisma(
    async () => {
      const sale = await prisma.sale.findFirst({ where: { saleId }, select: { hasInsurance: true } });
      return sale ? !!sale.hasInsurance : null;
    },
    () => null
  ),
  findSaleContext: (saleId) => tryPrisma(
    () => prisma.sale.findFirst({
      where: { saleId },
      select: { hasInsurance: true, expirationDate: true }
    }),
    () => null
  ),
  deleteById: (id) => tryPrisma(
    () => prisma.nativeRegistration.delete({ where: { id } }),
    () => { const idx = memStore.findIndex(r => r.id === id); if (idx >= 0) memStore.splice(idx, 1); return true; }
  )
};
