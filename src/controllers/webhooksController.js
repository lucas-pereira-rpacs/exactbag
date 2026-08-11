const jobQueueService = require('../services/jobQueueService');
const { processPartnerSale } = require('../services/saleProcessingService');
const { validateAndSanitizePartnerSale } = require('../utils/validation');

// Registra o handler de fila (um só registro é suficiente)
jobQueueService.registerHandler('processPartnerSale', async (data) => {
  await processPartnerSale(data);
});

exports.handlePartnerSale = async (req, res) => {
  try {
    const body = req.body;

    // Extract customer data from nested or flat structure
    const customerData = {
      customerName: body.customerName || (body.customer && body.customer.name),
      customerEmail: body.customerEmail || (body.customer && body.customer.email),
      customerPhone: body.customerPhone || (body.customer && body.customer.phone),
      roundTrip: body.roundTrip,
      baggageQty: body.baggageQty,
      hasInsurance: body.hasInsurance,
      outboundDate: body.outboundDate,
      returnDate: body.returnDate,
      notes: body.notes
    };

    // Validate and sanitize all input data
    const validation = validateAndSanitizePartnerSale(customerData);
    
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: validation.errors 
      });
    }

    // Use sanitized data
    const saleId = body.saleId;
    const partnerId = body.partnerId;

    if (!saleId || !partnerId) {
      return res.status(400).json({ 
        error: 'Dados de venda incompletos.',
        details: ['saleId and partnerId are required']
      });
    }

    // Verifica que o partnerId do body corresponde ao parceiro autenticado
    if (partnerId !== req.partner?.partnerId) {
      return res.status(403).json({
        error: 'Forbidden',
        details: ['partnerId does not match authenticated partner']
      });
    }

    // Adiciona job na fila (assíncrono) com dados sanitizados
    const job = await jobQueueService.addJob('processPartnerSale', {
      ...validation.data,
      saleId,
      partnerId
    }, {
      attempts: 3,
      retryDelayMs: 2000,
      dedupeKey: `${partnerId}:${saleId}`
    });

    return res.status(202).json({
      success: true,
      message: 'Venda recebida e em processamento.',
      jobId: job.id
    });
  } catch (error) {
    console.error('Error scheduling partner sale job:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};