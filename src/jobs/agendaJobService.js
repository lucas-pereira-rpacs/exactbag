const agenda = require('./agendaClient');

const BUSINESS_JOB_NAMES = ['processPartnerSale', 'PARTNER_CALLBACK'];

const enqueueUniqueJob = async ({ name, data, dedupeKey, maxAttempts }) => {
  const queuedAt = new Date();
  const job = agenda.create(name, {
    ...data,
    dedupeKey,
    _jobMeta: {
      queuedAt: queuedAt.toISOString(),
      maxAttempts,
    },
  });
  job.unique({ 'data.dedupeKey': dedupeKey }, { insertOnly: true });
  job.schedule(queuedAt);
  try {
    return await job.save();
  } catch (error) {
    // The database unique index closes the race between concurrent workers.
    // If another request inserted the same business job first, return it.
    if (error?.code === '23505') {
      const existing = await agenda.queryJobs({ name, data: { dedupeKey }, limit: 1 });
      if (existing.jobs[0]) return { attrs: existing.jobs[0] };
    }
    throw error;
  }
};

const mapAgendaStatus = (job) => {
  if (job.state === 'running' || job.lockedAt) return 'running';
  if (Number(job.failCount || 0) > 0 && job.nextRunAt) {
    return 'retrying';
  }
  if (job.state === 'scheduled' || job.state === 'queued') return 'pending';
  return job.state;
};

const sanitizeData = (data = {}) => ({
  saleId: data.saleId || data.payload?.saleId || null,
  partnerId: data.partnerId || null,
  productCode: data.productCode || null,
  event: data.payload?.event || null,
  submissionId: data.payload?.submissionId || null,
  isManualSale: data.isManualSale === true,
});

const serializeJob = (job) => {
  const data = job.data || {};
  const status = mapAgendaStatus(job);
  const queuedAt = data._jobMeta?.queuedAt || job.nextRunAt || null;
  return {
    id: String(job._id),
    type: job.name,
    data: sanitizeData(data),
    dedupeKey: data.dedupeKey || null,
    attempts: Number(data._jobMeta?.maxAttempts || 1),
    attempt: Number(job.failCount || 0) + (status === 'running' ? 1 : 0),
    status,
    createdAt: queuedAt,
    updatedAt: job.lastFinishedAt || job.lastRunAt || job.failedAt || queuedAt,
    completedAt: status === 'completed' ? (job.lastFinishedAt || null) : null,
    failedAt: job.failedAt || null,
    error: job.failReason || null,
  };
};

const getJobById = async (jobId, partnerId) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    return null;
  }
  const result = await agenda.queryJobs({ id: jobId, names: BUSINESS_JOB_NAMES, limit: 1 });
  const job = result.jobs[0];
  if (!job || (partnerId && job.data?.partnerId !== partnerId)) return null;
  return serializeJob(job);
};

const getJobs = async ({ partnerId, status, limit, offset }) => {
  const result = await agenda.queryJobs({
    names: BUSINESS_JOB_NAMES,
    data: partnerId ? { partnerId } : undefined,
    sort: { nextRunAt: -1, lastRunAt: -1 },
  });
  const serialized = result.jobs.map(serializeJob);
  const filtered = status ? serialized.filter(job => job.status === status) : serialized;
  return {
    jobs: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
};

const getJobCounts = async () => {
  const result = await agenda.queryJobs({ names: BUSINESS_JOB_NAMES });
  const counts = { pending: 0, running: 0, retrying: 0, completed: 0, failed: 0, total: 0 };
  for (const job of result.jobs) {
    const status = mapAgendaStatus(job);
    if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
    counts.total += 1;
  }
  return counts;
};

module.exports = {
  BUSINESS_JOB_NAMES,
  enqueueUniqueJob,
  getJobById,
  getJobs,
  getJobCounts,
  serializeJob,
  mapAgendaStatus,
};
