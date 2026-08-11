const formGateway = require('../gateways/formGateway');
const submissionRepository = require('../repositories/submissionRepository');
const partnerCallbackService = require('../services/partnerCallbackService');
const prisma = require('../config').prisma;
const { validateAndSanitizeJotFormsSubmission, validateCustomerName, validateCustomerEmail, validateCustomerPhone } = require('../utils/validation');

/**
 * Endpoint que o JotForms chama (webhook) após o usuário preencher a pesquisa.
 * A ideia é:
 * 1) Receber dados, validar e sanitizar
 * 2) Atualizar status da submissão
 * 3) Enviar confirmação e produto digital
 */
exports.handleJotformWebhook = async (req, res) => {
  try {
    // JotForms envia muitos campos; mapear os relevantes
    const payload = req.body;

    // Verificação de secret do webhook
    const allowedSecret = process.env.JOTFORM_WEBHOOK_SECRET;
    if (!allowedSecret && process.env.NODE_ENV === 'production') {
      console.error('[JotForms] JOTFORM_WEBHOOK_SECRET não configurado em produção');
      return res.status(500).json({ success: false, error: 'Webhook secret not configured' });
    }
    if (allowedSecret && payload.secret && payload.secret !== allowedSecret) {
      return res.status(403).json({ success: false, error: 'Invalid webhook secret' });
    }

    // JotForms envia o ID real da submissão em rawRequest como JSON encoded
    // Fallback para campos diretos do payload para compatibilidade
    let parsedRaw = {};
    if (payload.rawRequest && typeof payload.rawRequest === 'string') {
      try { parsedRaw = JSON.parse(payload.rawRequest); } catch (_) { /* ignora */ }
    }

    const submissionId = payload.submissionID || payload.submission_id || payload.id || payload.submissionId;
    const formId = payload.formID || payload.form_id || payload.formId;
    const answers = payload.answers || parsedRaw || payload.form_response?.answers || {};

    if (!submissionId || !formId) {
      return res.status(400).json({ success: false, error: 'Missing submissionId or formId' });
    }

    // Validar a submissão do JotForms
    const jotformsValidation = validateAndSanitizeJotFormsSubmission({
      submissionId,
      formId,
      formData: answers
    });

    if (!jotformsValidation.valid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed',
        details: jotformsValidation.errors 
      });
    }

    // Exemplo de extração básica de campos; ajuste conforme sua estrutura do formulário
    const rawCustomerName = answers.customerName?.answer || answers['3']?.answer || payload.name;
    const rawCustomerEmail = answers.customerEmail?.answer || answers['4']?.answer || payload.email;
    const rawCustomerPhone = answers.customerPhone?.answer || answers['5']?.answer || payload.phone;

    // Validate and sanitize individual customer fields
    const nameValidation = validateCustomerName(rawCustomerName);
    const emailValidation = validateCustomerEmail(rawCustomerEmail);
    const phoneValidation = validateCustomerPhone(rawCustomerPhone);

    if (!nameValidation.valid || !emailValidation.valid || !phoneValidation.valid) {
      const errors = [
        nameValidation.valid ? null : nameValidation.error,
        emailValidation.valid ? null : emailValidation.error,
        phoneValidation.valid ? null : phoneValidation.error
      ].filter(Boolean);

      return res.status(400).json({ 
        success: false, 
        error: 'Invalid customer data',
        details: errors 
      });
    }

    const customerName = nameValidation.value;
    const customerEmail = emailValidation.value;
    const customerPhone = phoneValidation.value;

    // salvamento da submissão com dados sanitizados
    const submission = await submissionRepository.saveSubmission({
      submissionId: jotformsValidation.data.submissionId,
      formId: jotformsValidation.data.formId,
      status: 'completed',
      customerName,
      customerEmail,
      customerPhone,
      rawPayload: payload,
      completedAt: new Date()
    });

    // Log
    console.log('[jotformsController] Webhook recebido', submissionId);

    // ========== PARTNER CALLBACK (Notificar parceiro que cliente completou) ==========
    // Procurar sale associada a este cliente/submissão
    try {
      const associatedSale = prisma ? await prisma.sale.findFirst({
        where: {
          customerEmail: customerEmail,
          status: 'processed' // Sale foi enviado para o cliente
        },
        include: { partner: true }
      }) : null;

      if (associatedSale) {
        // Vincular submission ao sale
        await submissionRepository.saveSubmission({
          ...submission,
          saleId: associatedSale.id
        });

        // Disparar callback do parceiro (assíncrono)
        console.log(`[jotformsController] Scheduling partner callback for ${associatedSale.partnerId}`);
        await partnerCallbackService.schedulePartnerCallback(associatedSale, submission);
      }
    } catch (callbackError) {
      console.warn('[jotformsController] Error scheduling partner callback:', callbackError.message);
      // Não bloqueia o fluxo se callback falhar
    }

    return res.status(200).json({ success: true, submission });
  } catch (error) {
    console.error('[jotformsController] Erro:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Valida status de submissão JotForms
 */
exports.getSubmissionStatus = async (req, res) => {
  try {
    const { submissionId } = req.params;
    
    if (!submissionId) {
      return res.status(400).json({ success: false, error: 'submissionId obrigatório' });
    }

    // Sanitize submission ID to prevent injection
    const { sanitizeString } = require('../utils/validation');
    const sanitizedSubmissionId = sanitizeString(submissionId);

    if (!sanitizedSubmissionId) {
      return res.status(400).json({ success: false, error: 'Invalid submissionId format' });
    }

    const submission = await submissionRepository.getSubmissionById(sanitizedSubmissionId);
    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submissão não encontrada' });
    }

    return res.status(200).json({ success: true, submission });
  } catch (error) {
    console.error('[jotformsController] Erro status:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
