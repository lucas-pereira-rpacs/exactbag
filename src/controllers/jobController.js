const jobQueueService = require('../services/jobQueueService');

exports.getJobStatus = async (req, res) => {
  const { jobId } = req.params;

  if (!jobId) {
    return res.status(400).json({ success: false, error: 'jobId is required' });
  }

  const job = jobQueueService.getJob(jobId);
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

  const allJobs = jobQueueService.getJobs(0);
  
  // Filtrar por status se fornecido
  const filteredJobs = status 
    ? allJobs.filter(j => j.status === status)
    : allJobs;

  const paginatedJobs = filteredJobs.slice(offset, offset + limit);

  return res.status(200).json({
    success: true,
    jobs: paginatedJobs,
    pagination: {
      limit,
      offset,
      total: filteredJobs.length,
      hasMore: offset + limit < filteredJobs.length
    }
  });
};
