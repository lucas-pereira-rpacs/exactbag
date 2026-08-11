const express = require('express');
const router = express.Router();
const { handleJotformWebhook, getSubmissionStatus } = require('../controllers/jotformsController');
const authMiddleware = require('../middlewares/authMiddleware');
const formGateway = require('../gateways/formGateway');

// Rota de callback do JotForms (webhook de submissão do formulário)
// Configurar esta URL no painel JotForms: Settings → Integrations → WebHooks
// URL: https://SEU_DOMINIO/api/jotforms/webhook
router.post('/webhook', handleJotformWebhook);

// Rota para verificar status da submissão
router.get('/submission/:submissionId/status', getSubmissionStatus);

// Utilitário: lista campos do formulário JotForms real
// Use uma vez para descobrir os IDs e configurar as env vars JOTFORM_FIELD_*
// Requer autenticação de parceiro
router.get('/fields', authMiddleware, async (req, res) => {
  try {
    const fields = await formGateway.getFormFields();
    return res.json({ success: true, fields });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
