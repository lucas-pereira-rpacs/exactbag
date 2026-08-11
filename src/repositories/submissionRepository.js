// Repositório de submissões de formulário JotForms
// Em produção persiste em PostgreSQL via Prisma; em testes usa memória.

const { prisma } = require('../config');
const useInMemoryRepository = process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL;

const submissions = new Map();

const serializePayload = (submission) => {
  if (typeof submission.payload === 'string') {
    return submission.payload;
  }

  if (typeof submission.rawPayload === 'string') {
    return submission.rawPayload;
  }

  return JSON.stringify(submission.rawPayload || submission.payload || submission);
};

const mapSubmissionRecord = (record) => {
  if (!record) {
    return null;
  }

  let parsedPayload = record.payload;
  if (typeof record.payload === 'string') {
    try {
      parsedPayload = JSON.parse(record.payload);
    } catch (_error) {
      parsedPayload = record.payload;
    }
  }

  return {
    ...record,
    payload: parsedPayload,
    rawPayload: parsedPayload
  };
};

const saveSubmission = async (submission) => {
  const normalized = {
    submissionId: submission.submissionId,
    formId: submission.formId,
    saleId: submission.saleId || null,
    status: submission.status || 'completed',
    payload: serializePayload(submission),
  };

  if (useInMemoryRepository) {
    const key = submission.submissionId;
    const existing = submissions.get(key) || {};
    const merged = {
      ...existing,
      ...submission,
      payload: normalized.payload,
      updatedAt: new Date(),
      createdAt: existing.createdAt || new Date()
    };
    submissions.set(key, merged);
    return merged;
  }

  const persisted = await prisma.submission.upsert({
    where: { submissionId: normalized.submissionId },
    update: normalized,
    create: normalized,
    include: {
      sale: true
    }
  });

  return mapSubmissionRecord(persisted);
};

const getSubmissionById = async (submissionId) => {
  if (useInMemoryRepository) {
    return submissions.get(submissionId) || null;
  }

  const submission = await prisma.submission.findUnique({
    where: { submissionId },
    include: {
      sale: true
    }
  });

  return mapSubmissionRecord(submission);
};

// 🟠 P5: Paginação obrigatória para evitar escanear tudo
const listSubmissions = async (limit = 100, offset = 0) => {
  if (!useInMemoryRepository) {
    const [data, total] = await Promise.all([
      prisma.submission.findMany({
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sale: true
        }
      }),
      prisma.submission.count()
    ]);

    return {
      data: data.map(mapSubmissionRecord),
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total
      }
    };
  }

  const allSubmissions = Array.from(submissions.values());
  const total = allSubmissions.length;
  const paginated = allSubmissions
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(offset, offset + limit);

  return {
    data: paginated,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + limit < total
    }
  };
};

module.exports = {
  saveSubmission,
  getSubmissionById,
  listSubmissions
};