const express = require('express');
const router = express.Router();

// Ajuste: importar o controlador correto (webhooksController.js)
const { handlePartnerSale } = require('../controllers/webhooksController');
const authMiddleware = require('../middlewares/authMiddleware');
const partnerCallbackService = require('../services/partnerCallbackService');
const saleCancellationService = require('../services/saleCancellationService');
const webhookRequestLogger = require('../middlewares/webhookRequestLogger');

// POST /webhooks/sales
router.post('/sales', webhookRequestLogger, handlePartnerSale);

// ============================================================================
// Cancelamento de Venda
// ============================================================================

/**
 * POST /webhooks/sales/:saleId/cancel
 * Cancelar venda e calcular estorno
 * Requer autenticação via API Key
 * Body opcional: { reason: "motivo do cancelamento" }
 */
router.post('/sales/:saleId/cancel', authMiddleware, async (req, res) => {
  try {
    const { saleId } = req.params;
    const partnerId = req.partner?.partnerId;
    const reason = req.body?.reason || null;

    const result = await saleCancellationService.cancelSale(saleId, partnerId, reason);

    return res.status(200).json({
      success: true,
      message: 'Venda cancelada com sucesso',
      ...result
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error(`[Routes] Erro ao cancelar venda:`, error.message);
    return res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Partner Callback Routes - Registro de Webhook
// ============================================================================

/**
 * POST /webhooks/register
 * Registrar URL de webhook para este parceiro
 * Requer autenticação via API Key
 */
router.post('/register', authMiddleware, async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    const partnerId = req.partner?.partnerId;

    if (!webhookUrl) {
      return res.status(400).json({
        error: 'webhookUrl ausente',
        example: 'https://example.com/webhooks/exactbag'
      });
    }

    const updated = await partnerCallbackService.registerWebhook(partnerId, webhookUrl);

    res.status(200).json({
      status: 'success',
      message: 'Webhook registrado com sucesso',
      webhookUrl: updated.webhookUrl,
      note: 'Payloads são assinados com HMAC-SHA256 usando sua API Key'
    });
  } catch (error) {
    console.error('[Routes] Erro ao registrar webhook:', error);
    res.status(400).json({
      error: 'Falha ao registrar webhook',
      details: error.message
    });
  }
});

/**
 * GET /webhooks/status
 * Verificar webhook registrado para este parceiro
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const partnerId = req.partner?.partnerId;
    const webhookUrl = await partnerCallbackService.getWebhook(partnerId);

    res.status(200).json({
      status: 'success',
      partnerId,
      webhookUrl: webhookUrl || null,
      configured: !!webhookUrl,
      isSandbox: req.partner?.isSandbox || false,
      message: webhookUrl ? 'Webhook configurado' : 'Nenhum webhook registrado (usando fallback de email)'
    });
  } catch (error) {
    console.error('[Routes] Erro ao obter status de webhook:', error);
    res.status(500).json({
      error: 'Falha ao obter status de webhook',
      details: error.message
    });
  }
});

/**
 * DELETE /webhooks/unregister
 * Remover webhook para este parceiro (fallback para email)
 */
router.delete('/unregister', authMiddleware, async (req, res) => {
  try {
    const partnerId = req.partner?.partnerId;

    const updated = await partnerCallbackService.registerWebhook(partnerId, null);

    res.status(200).json({
      status: 'success',
      message: 'Webhook não registrado, usará fallback de email',
      partnerId
    });
  } catch (error) {
    console.error('[Routes] Erro ao desregistrar webhook:', error);
    res.status(500).json({
      error: 'Falha ao desregistrar webhook',
      details: error.message
    });
  }
});

module.exports = router;
