const partnerCallbackService = require("../services/partnerCallbackService");

/** @param {import('agenda').Job} job */
async function partnerCallbackHandler(job) {
  const data = job?.attrs?.data || {};
  const attempt = Number(job?.attrs?.failCount || 0);
  const maxAttempts = Number(data.maxAttempts || 2);
  const result = await partnerCallbackService.executeCallback({
    ...data,
    attempt,
    maxAttempts,
  });

  if (!result.success) {
    const suffix = result.retry ? "retry requested" : "attempts exhausted";
    throw new Error(`Partner callback failed for ${data.partnerId}; ${suffix}`);
  }
}

module.exports = partnerCallbackHandler;
