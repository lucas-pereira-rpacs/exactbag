const { enqueueUniqueJob } = require('../jobs/agendaJobService');
const { validateAndSanitizePartnerSale } = require('../utils/validation');
const { PHYSICAL_TAG_PRODUCT_CODES } = require('../config/insuranceProducts');

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
    const productCode = body.productCode === undefined || body.productCode === null
      ? null
      : String(body.productCode).trim();

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
    const job = await enqueueUniqueJob({
      name: 'processPartnerSale',
      data: {
        ...validation.data,
        saleId,
        partnerId,
        productCode
      },
      maxAttempts: 3,
      dedupeKey: `processPartnerSale:${partnerId}:${saleId}`
    });

    return res.status(202).json({
      success: true,
      message: 'Venda recebida e em processamento.',
      jobId: String(job.attrs._id)
    });
  } catch (error) {
    console.error('Error scheduling partner sale job:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
