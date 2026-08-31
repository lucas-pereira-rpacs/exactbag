const agendaJobService = require('../jobs/agendaJobService');

exports.getJobStatus = async (req, res) => {
  const { jobId } = req.params;

  if (!jobId) {
    return res.status(400).json({ success: false, error: 'jobId is required' });
  }

  const job = await agendaJobService.getJobById(jobId, req.partner?.partnerId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }

  return res.status(200).json({ success: true, job });
};

exports.getJobs = async (req, res) => {
  // 🟡 P7: Paginação obrigatória para evitar OOM em produção
  const limit = Math.min(parseInt(req.query.limit) || 50, 500); // Máx 500
  const offset = parseInt(req.query.offset) || 0;
  const status = req.query.status;

  const result = await agendaJobService.getJobs({
    partnerId: req.partner?.partnerId,
    status,
    limit,
    offset,
  });

  return res.status(200).json({
    success: true,
    jobs: result.jobs,
    pagination: {
      limit,
      offset,
      total: result.total,
      hasMore: offset + limit < result.total
    }
  });
};
