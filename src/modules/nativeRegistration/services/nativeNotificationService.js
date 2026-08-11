// Serviço de notificações do módulo Nativo
// Reaproveita os gateways existentes (emailGateway / whatsappGateway)

const emailGateway = require('../../../gateways/emailGateway');
const whatsappGateway = require('../../../gateways/whatsappGateway');
const { supportPhone, supportPhoneRaw } = require('../../../config');
const fs = require('fs');
const path = require('path');

// Carrega template de e-mail do CPV
let CPV_EMAIL_TEMPLATE = null;
try {
  CPV_EMAIL_TEMPLATE = fs.readFileSync(
    path.resolve(__dirname, '..', 'templates', 'email_cpv.html'), 'utf-8'
  );
  console.log('[NativeNotification] Template de e-mail CPV carregado');
} catch (_err) {
  console.warn('[NativeNotification] Template CPV não encontrado, usando fallback.');
}

/**
 * Envia o CPV por e-mail com PDF anexado (via Resend)
 */
const sendCpvByEmail = async (registration, pdfBuffer, isHtmlFallback = false) => {
  const name = registration.passengerName;
  const email = registration.passengerEmail;
  const cpvNumber = registration.cpvNumber;

  const textBody = `Olá, ${name}!\n\nSeu Certificado de Propriedade de Volume (CPV) foi gerado com sucesso.\n\nNúmero do CPV: ${cpvNumber}\n\nO documento está anexado a este e-mail em PDF.\n\nGuarde-o com segurança — ele comprova o registro da sua bagagem junto ao ExactBag.\n\nQualquer dúvida:\n📱 ${supportPhone}\n📧 contato@exactbag.com.br\n\nBoa viagem! 🧳✈️\nEquipe ExactBag`;

  let html = textBody.replace(/\n/g, '<br>');
  if (CPV_EMAIL_TEMPLATE) {
    html = CPV_EMAIL_TEMPLATE
      .replace(/\{\{nome\}\}/g, name)
      .replace(/\{\{cpv_number\}\}/g, cpvNumber)
      .replace(/\{\{support_phone\}\}/g, supportPhone)
      .replace(/\{\{support_phone_raw\}\}/g, supportPhoneRaw);
  }

  const attachments = [{
    filename: `${cpvNumber}.${isHtmlFallback ? 'html' : 'pdf'}`,
    content: pdfBuffer.toString('base64'),
    type: isHtmlFallback ? 'text/html' : 'application/pdf'
  }];

  await emailGateway.sendEmail({
    to: email,
    subject: `ExactBag - Seu CPV ${cpvNumber}`,
    html,
    text: textBody,
    attachments
  });

  console.log(`[NativeNotification] CPV ${cpvNumber} enviado por e-mail para ${email}`);
  return true;
};

/**
 * Envia o CPV por WhatsApp (template Meta ou texto livre como fallback)
 */
const sendCpvByWhatsApp = async (registration) => {
  const phone = registration.passengerPhone;
  const name = registration.passengerName;
  const cpvNumber = registration.cpvNumber;

  if (!phone) {
    console.warn('[NativeNotification] Telefone ausente, WhatsApp não enviado');
    return false;
  }

  // Se tiver template aprovado na Meta, usa template (obrigatório fora da janela de 24h)
  const templateName = process.env.WHATSAPP_CPV_TEMPLATE || '';
  if (templateName) {
    try {
      await whatsappGateway.sendTemplate(phone, templateName, 'pt_BR', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: name },
            { type: 'text', text: cpvNumber }
          ]
        }
      ]);
      console.log(`[NativeNotification] CPV ${cpvNumber} enviado por WhatsApp (template: ${templateName}) para ${phone}`);
      return true;
    } catch (err) {
      console.warn('[NativeNotification] Template falhou, tentando texto livre:', err.message);
    }
  }

  // Fallback: texto livre (funciona apenas dentro da janela de 24h ou provider não-Meta)
  const message = `Olá ${name},\n\nSeu Certificado de Propriedade de Volume (CPV) foi emitido com sucesso.\n\n📄 CPV: ${cpvNumber}\n\nO documento foi enviado para seu e-mail. Guarde-o com segurança — ele comprova o registro da sua bagagem.\n\nBoa viagem!\nEquipe ExactBag`;

  try {
    await whatsappGateway._sendMessage(phone, message);
    console.log(`[NativeNotification] CPV ${cpvNumber} enviado por WhatsApp (texto) para ${phone}`);
    return true;
  } catch (err) {
    console.error('[NativeNotification] WhatsApp falhou:', err.message);
    return false;
  }
};

/**
 * Envia lembrete de volta por e-mail
 */
const sendReturnReminderByEmail = async (registration, registrationLink) => {
  const customerData = {
    name: registration.passengerName,
    email: registration.passengerEmail
  };

  await emailGateway.sendVoltaTemplateEmail(customerData, registrationLink);
  console.log(`[NativeNotification] Lembrete de volta enviado por e-mail para ${registration.passengerEmail}`);
  return true;
};

/**
 * Envia lembrete de volta por WhatsApp (template Meta ou texto livre como fallback)
 */
const sendReturnReminderByWhatsApp = async (registration, registrationLink) => {
  const phone = registration.passengerPhone;
  const name = registration.passengerName;

  if (!phone) {
    console.warn('[NativeNotification] Telefone ausente, WhatsApp volta não enviado');
    return false;
  }

  const templateName = process.env.WHATSAPP_VOLTA_TEMPLATE || '';
  if (templateName) {
    try {
      await whatsappGateway.sendTemplate(phone, templateName, 'pt_BR', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: name },
            { type: 'text', text: registrationLink }
          ]
        }
      ]);
      console.log(`[NativeNotification] Lembrete volta enviado por WhatsApp (template: ${templateName}) para ${phone}`);
      return true;
    } catch (err) {
      console.warn('[NativeNotification] Template volta falhou, tentando texto livre:', err.message);
    }
  }

  const message = `Olá ${name},\n\nSua viagem de volta é amanhã e o seu serviço ExactBag também cobre o retorno!\n\nNão esqueça de registrar sua bagagem para o voo de volta. Acesse o link abaixo e faça o registro — leva menos de 1 minuto:\n\n👉 ${registrationLink}\n\nBoa viagem de volta!\nEquipe ExactBag`;

  try {
    await whatsappGateway._sendMessage(phone, message);
    console.log(`[NativeNotification] Lembrete volta enviado por WhatsApp (texto) para ${phone}`);
    return true;
  } catch (err) {
    console.error('[NativeNotification] WhatsApp volta falhou:', err.message);
    return false;
  }
};

module.exports = {
  sendCpvByEmail,
  sendCpvByWhatsApp,
  sendReturnReminderByEmail,
  sendReturnReminderByWhatsApp
};
