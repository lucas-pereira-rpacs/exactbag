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

const sendPhysicalTagRegistrationEmail = async (registration) => {
  const insured = registration.hasInsurance === true;
  const title = insured ? 'Sua TAG ExactBag COVER foi Registrada!' : 'Sua TAG ExactBag foi Registrada!';
  const accent = insured ? '#16b85a' : '#2467bd';
  const baseUrl = (process.env.APP_BASE_URL || 'https://app.exactbag.com.br').replace(/\/+$/, '');
  const link = baseUrl + '/registrodetagfisica';
  const content = insured
    ? '<p><strong>REGISTRE SUA TAG ANTES DE CADA DESPACHO!</strong><br>Sem o registro, <strong>NÃO</strong> há acesso ao <strong>serviço</strong> nem à cobertura do <strong>SEGURO</strong>.</p><p>Em caso de <strong>qualquer problema</strong> com a bagagem, acionar a ExactBag imediatamente.<br><strong>Atendimento 24h.</strong></p><hr><p><strong>IMPORTANTE ⚠️</strong></p><p>A ExactBag <strong>NÃO rastreia bagagens.</strong><br>Nosso serviço é especializado em:</p><ul><li><strong>Identificação da sua bagagem</strong> com TAG exclusiva.</li><li><strong>Geração de evidências</strong> para te proteger em caso de extravio.</li><li><strong>Colaboração com a companhia aérea</strong> para agilizar a resolução do seu problema.</li></ul><hr><p><strong>VOCÊ PODE ACESSAR OS TERMOS DE USO:</strong> <a href="https://drive.google.com/file/d/1_rPhfKcAZ-lA7YM98vd7RQAKaAoKh_86/view?usp=sharing">TERMOS DE USO</a></p>'
    : '<p><strong>ATENÇÃO ⚠️:</strong></p><p>A ExactBag <strong>NÃO</strong> faz rastreamento de bagagens por geolocalização.<br>Nosso serviço consiste em:</p><ul><li><strong>Identificar a sua bagagem</strong> por meio da TAG exclusiva;</li><li><strong>Gerar evidências</strong> para te proteger em caso de problemas;</li><li><strong>Colaborar com a companhia aérea</strong> para agilizar a solução.</li></ul><p>Se tiver <strong>qualquer problema</strong> com sua bagagem, basta nos acionar — nossa equipe está disponível <strong>24 horas</strong> por dia para te ajudar.</p><p><em><strong>Teve problemas com sua bagagem? Conte com a gente!</strong></em></p><p><a href="https://wa.me/' + supportPhoneRaw + '">WhatsApp: ' + supportPhone + '</a><br><a href="mailto:contato@exactbag.com.br">E-mail: contato@exactbag.com.br</a></p><p><em>Saiba mais do nosso serviço: <a href="' + link + '">Como Funciona a TAG ExactBag</a></em></p>';
  const html = '<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f5ff;font-family:Arial,sans-serif;color:#111;font-size:14px;line-height:1.35"><div style="max-width:600px;margin:16px auto;background:#fff;padding:28px 18px 22px"><div style="text-align:center;margin-bottom:28px"><div style="font-size:58px;color:' + accent + '">✉✓</div><h1 style="font-size:32px;line-height:1.05;margin:12px 0 0">' + title + '</h1></div>' + content + '<p style="margin-top:22px">📩 Logo você receberá uma cópia do seu registro ExactBag por e-mail.</p><div style="text-align:center;margin-top:24px"><a href="' + link + '" style="display:inline-block;padding:10px 18px;border:1px solid #555;border-radius:5px;color:#222;text-decoration:none">Preencher novamente</a></div></div></body></html>';
  const text = title + '\n\nAcesse novamente: ' + link + '\n\nWhatsApp: ' + supportPhone + '\nE-mail: contato@exactbag.com.br';
  await emailGateway.sendEmail({ to: registration.passengerEmail, subject: title, html, text });
  console.log('[NativeNotification] Confirmação de TAG física enviada para', registration.passengerEmail);
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
  sendPhysicalTagRegistrationEmail,
  sendCpvByWhatsApp,
  sendReturnReminderByEmail,
  sendReturnReminderByWhatsApp
};
