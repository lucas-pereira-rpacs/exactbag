const { processPartnerSale } = require("../services/saleProcessingService");

/** @param {import('agenda').Job} job */
async function processPartnerSaleHandler(job) {
  await processPartnerSale(job?.attrs?.data || {});
}

module.exports = processPartnerSaleHandler;
