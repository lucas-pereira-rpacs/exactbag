// Manual Sale Controller
// Aceita dados do formulário do dashboard e os injeta no funil de automação
// existente, sem adicionar nenhuma lógica de notificação ou geração de links.

const crypto = require('crypto');
const { enqueueUniqueJob } = require('../jobs/agendaJobService');
const { validateAndSanitizePartnerSale } = require('../utils/validation');
const partnerRepository = require('../repositories/partnerRepository');

const SALE_EXPIRATION_MS = {
  '31d': 31 * 24 * 60 * 60 * 1000,
  '3m': 3 * 60 * 1000,
};

/**
 * Gera um saleId único para entradas manuais.
 * Formato: MANUAL-<timestamp_hex>-<random_hex>
 * Garante unicidade suficiente para a dedupeKey do job queue.
 */
function generateManualSaleId() {
  const ts = Date.now().toString(16).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `MANUAL-${ts}-${rand}`;
}

/**
 * POST /native/manual-sale
 *
 * Chamado pelo dashboard interno (operadores ExactBag autenticados via JWT).
 * Recebe os dados do formulário, normaliza para o payload padrão da API
 * e enfileira o job de processamento — exatamente como handlePartnerSale faz.
 *
 * Autenticação: dashboardAuthMiddleware (JWT interno — req.dashboardUser preenchido).
 * O partnerId vem do body do formulário (operador escolhe qual parceiro).
 */
exports.handleDashboardManualSale = async (req, res) => {
  try {
    const body = req.body;
    // Para entradas via dashboard interno, o parceiro é informado no formulário
    const partnerId = (body.partnerId || '').trim();

    if (!partnerId) {
      return res.status(400).json({
        success: false,
        error: 'partnerId é obrigatório.',
      });
    }

    // Valida que o parceiro existe no banco antes de enfileirar
    // (evita falha silenciosa do job com “Parceiro não encontrado”)
    const partner = await partnerRepository.findByPartnerId(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        error: `Parceiro "${partnerId}" não encontrado. Selecione um parceiro válido.`,
      });
    }

    // Normaliza booleans que podem chegar como string do form-urlencoded
    const roundTrip =
      body.roundTrip === true ||
      body.roundTrip === 'true' ||
      body.roundTrip === '1';

    const hasInsurance =
      body.hasInsurance === true ||
      body.hasInsurance === 'true' ||
      body.hasInsurance === '1';

    const baggageQty =
      body.baggageQty !== undefined && body.baggageQty !== ''
        ? Number(body.baggageQty)
        : 1;

    const saleExpiration = body.saleExpiration || '31d';
    const expirationDurationMs = SALE_EXPIRATION_MS[saleExpiration];
    if (!expirationDurationMs) {
      return res.status(400).json({
        success: false,
        error: 'Expiração da venda inválida.',
      });
    }
    const expirationDate = new Date(Date.now() + expirationDurationMs);

    // Monta o payload no formato exato esperado pelo pipeline existente
    const customerData = {
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone,
      roundTrip,
      baggageQty,
      hasInsurance,
      outboundDate: body.outboundDate || null,
      returnDate: roundTrip ? (body.returnDate || null) : null,
      notes: body.notes || null,
    };

    // Reutiliza exatamente a mesma função de validação/sanitização da API principal
    const validation = validateAndSanitizePartnerSale(customerData);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos. Verifique os campos e tente novamente.',
        details: validation.errors,
      });
    }

    const saleId =
      (body.saleId && String(body.saleId).trim()) || generateManualSaleId();

    // Enfileira o job com os mesmos parâmetros da rota /webhooks/sales
    const job = await enqueueUniqueJob({
      name: 'processPartnerSale',
      data: {
        ...validation.data,
        saleId,
        partnerId,
        expirationDate,
        isManualSale: true,
      },
      maxAttempts: 3,
      dedupeKey: `processPartnerSale:${partnerId}:${saleId}`,
    });

    const jobId = String(job.attrs._id);

    console.info(
      `[ManualSale] Venda manual enfileirada — operator=${req.dashboardUser?.email} partner=${partnerId} saleId=${saleId} jobId=${jobId}`
    );

    return res.status(202).json({
      success: true,
      message: 'Venda registrada com sucesso e em processamento.',
      saleId,
      jobId,
    });
  } catch (error) {
    console.error('[ManualSale] Erro ao registrar venda manual:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno do servidor. Tente novamente em instantes.',
    });
  }
};
