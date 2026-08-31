// Gateway para Email - Resend
// O parceiro nunca sabe qual provedor de email usamos

const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const { supportPhone, supportPhoneRaw } = require('../config');

// Escape HTML special characters to prevent template injection
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Substitui placeholders de telefone de suporte nos templates HTML
function replacePhonePlaceholders(html) {
  if (!html) return html;
  return html
    .replace(/\{\{support_phone\}\}/g, supportPhone)
    .replace(/\{\{support_phone_raw\}\}/g, supportPhoneRaw);
}

// Configurações
const EMAIL_CONFIG = {
  apiKey: process.env.EMAIL_API_KEY || '',
  fromEmail: process.env.EMAIL_FROM || 'noreply@exactbag.com.br',
  fromName: process.env.EMAIL_FROM_NAME || 'ExactBag'
};

// Carrega templates HTML do disco (fallback para texto simples)
let TEMPLATE_COMPRA_HTML = null;
let TEMPLATE_CONFIRMATION_COMPRA_HTML = null;
let TEMPLATE_VESPERA_HTML = null;
let TEMPLATE_VOLTA_HTML = null;
try {
  const rootDir = path.resolve(__dirname, '..', '..');
  TEMPLATE_COMPRA_HTML = replacePhonePlaceholders(fs.readFileSync(path.join(rootDir, 'email_template_compra.html'), 'utf-8'));
  TEMPLATE_CONFIRMATION_COMPRA_HTML = replacePhonePlaceholders(fs.readFileSync(path.join(rootDir, 'email_template_confirmacao_compra.html'), 'utf-8'));
  TEMPLATE_VESPERA_HTML = replacePhonePlaceholders(fs.readFileSync(path.join(rootDir, 'email_template_vespera_voo.html'), 'utf-8'));
  TEMPLATE_VOLTA_HTML = replacePhonePlaceholders(fs.readFileSync(path.join(rootDir, 'email_template_volta.html'), 'utf-8'));
  console.log('[EmailGateway] Templates HTML de compra, véspera e volta carregados com sucesso');
} catch (err) {
  console.warn('[EmailGateway] Templates HTML não encontrados, usando fallback texto:', err.message);
}

class EmailGateway {
  constructor() {
    this.client = this._initializeClient();
  }

  _initializeClient() {
    if (!EMAIL_CONFIG.apiKey) {
      console.warn('[EmailGateway] EMAIL_API_KEY não configurada — emails desabilitados');
      return null;
    }
    return new Resend(EMAIL_CONFIG.apiKey);
  }

  /**
   * Envia email de boas-vindas com link do formulário
   * @param {Object} customerData - Dados do cliente
   * @param {string} formLink - Link do formulário
   * @returns {boolean} - Sucesso do envio
   */
  async sendWelcomeEmail(customerData, formLink) {
    try {
      console.log('[EmailGateway] Enviando email para:', customerData.email);

      const emailData = {
        to: customerData.email,
        subject: 'Seu acesso ao ExactBag chegou!',
        html: this._generateWelcomeEmailHTML(customerData, formLink),
        text: this._generateWelcomeEmailText(customerData, formLink)
      };

      await this._sendEmail(emailData);

      console.log('[EmailGateway] Email enviado com sucesso para:', customerData.email);
      return true;

    } catch (error) {
      console.error('[EmailGateway] Erro ao enviar email:', error);
      throw new Error('Erro ao enviar email de boas-vindas');
    }
  }

  async sendPurchaseTemplateEmail(customerData, registrationLink) {
    const textBody = `Olá, ${customerData.name}!\n\nSua proteção ExactBag foi contratada com sucesso!\n\nAtenção! sua proteção só estará ativa após o registro da bagagem.\nO registro é simples, rápido e deve ser feito no dia do embarque, com a mala fechada e nas mesmas condições em que ela irá viajar.\n\nGuarda esse link, você vai usar no dia do voo:\n\n👉 ${registrationLink}\n\nNo dia da viagem, acesse, preencha as informações faltantes e fotografe a mala fechada, tudo pelo link, dura menos de 1 minuto. Só após esse passo sua bagagem estará oficialmente protegida.\n\nQualquer dúvida, estamos disponíveis 24h.\n📱 ${supportPhone}\n📧 contato@exactbag.com.br\n\nBoa viagem! 🧳✈️\nEquipe ExactBag\nCom a ExactBag, a bagagem não está mais sozinha.`;

    let html = textBody;
    if (TEMPLATE_COMPRA_HTML) {
      html = TEMPLATE_COMPRA_HTML
        .replace(/\{\{nome\}\}/g, escHtml(customerData.name) || 'Cliente')
        .replace(/\{\{link_registro\}\}/g, encodeURI(registrationLink || '#'));
    }

    return this._sendEmail({
      to: customerData.email,
      subject: 'Seu serviço ExactBag foi contratado! ✈️',
      html,
      text: textBody
    });
  }

  async sendPurchaseConfirmationTemplateEmail(customerData, saleData = {}) {
    const formatDate = (value) => {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    };
    const outboundDate = formatDate(saleData.outboundDate);
    const returnDate = formatDate(saleData.returnDate);
    const tripType = saleData.roundTrip ? 'Ida e volta' : 'Ida';
    const deliveryText = saleData.reservationType === 'physical-tag'
      ? 'O comprovante será enviado assim que faltarem 48 horas para a sua viagem. Basta apresentá-lo na loja da Protec Bag no aeroporto.'
      : 'O link de ativação do serviço será enviado assim que faltarem 48 horas para a sua viagem. Você receberá as orientações e o link para registrar sua bagagem antes do embarque.';
    const textBody = `Olá, ${customerData.name}!\n\nSua compra e reserva do ExactBag foram confirmadas com sucesso.\n\nDetalhes da reserva:\n- Tipo de viagem: ${tripType}${outboundDate ? `\n- Data da ida: ${outboundDate}` : ''}${returnDate ? `\n- Data da volta: ${returnDate}` : ''}\n\n${deliveryText}\n\nPor enquanto, não é necessário fazer o registro. Aguarde nossa próxima mensagem e mantenha seus dados de contato atualizados.\n\nDúvidas? Estamos disponíveis 24h.\n${supportPhone}\ncontato@exactbag.com.br\n\nBoa viagem!\nEquipe ExactBag`;
    let html = textBody;
    if (TEMPLATE_CONFIRMATION_COMPRA_HTML) {
      html = TEMPLATE_CONFIRMATION_COMPRA_HTML
        .replace(/\{\{nome\}\}/g, escHtml(customerData.name) || 'Cliente')
        .replace(/\{\{tipo_viagem\}\}/g, escHtml(tripType))
        .replace(/\{\{data_ida\}\}/g, escHtml(outboundDate))
        .replace(/\{\{data_volta\}\}/g, escHtml(returnDate))
        .replace(/\{\{texto_entrega\}\}/g, escHtml(deliveryText));
    }
    return this._sendEmail({
      to: customerData.email,
      subject: 'Compra e reserva ExactBag confirmadas',
      html,
      text: textBody
    });
  }

  async sendVesperaTemplateEmail(customerData, registrationLink) {
    const textBody = `Olá, ${customerData.name}! Amanhã é dia de viajar! 🧳✈️\n\nSua viagem é amanhã e sua proteção ExactBag está contratada!\n\nNão esqueça de registrar sua bagagem!\nMomentos antes de viajar, siga esses passos:\n\n✅ Feche sua bagagem da forma que ira ficar na viagem\n✅ Acesse o link abaixo\n✅ Preencha as informações e fotografe a bagagem conforme solicitado\n✅ Dura menos de 1 minuto!\n\n👉 ${registrationLink}\n\nPor que isso é importante?\nO registro informativo com foto é o que ativa sua proteção completa em caso de extravio. Sem o registro, sua bagagem não está protegida, e não conseguimos atuar em caso de problemas com ela.\n\nSe precisar de qualquer suporte durante a viagem, estamos disponíveis 24 horas por dia, 7 dias por semana.\n📱 ${supportPhone}\n📧 contato@exactbag.com.br\nBoa viagem! 🧳✈️\nEquipe ExactBag\nCom a ExactBag, a bagagem não está mais sozinha.`;

    let html = textBody;
    if (TEMPLATE_VESPERA_HTML) {
      html = TEMPLATE_VESPERA_HTML
        .replace(/\{\{nome\}\}/g, escHtml(customerData.name) || 'Cliente')
        .replace(/\{\{link_registro\}\}/g, encodeURI(registrationLink || '#'));
    }

    return this._sendEmail({
      to: customerData.email,
      subject: 'Sua viagem é amanhã — não esqueça de registrar sua bagagem! ✈️',
      html,
      text: textBody
    });
  }

  async sendVoltaTemplateEmail(customerData, registrationLink) {
    const textBody = `Olá, ${customerData.name}! Sua viagem de volta é amanhã! 🧳✈️\n\nO seu serviço ExactBag também cobre o retorno!\n\nNão esqueça de registrar sua bagagem para o voo de volta!\nAssim como na ida, é necessário fazer um novo registro da bagagem antes do embarque de retorno.\n\n✅ Feche sua bagagem da forma que irá ficar na viagem\n✅ Acesse o link abaixo\n✅ Preencha as informações e fotografe a bagagem conforme solicitado\n✅ Dura menos de 1 minuto!\n\n👉 ${registrationLink}\n\nPor que é necessário um novo registro?\nO registro da ida cobre apenas o trecho de ida. Para que sua bagagem esteja protegida no voo de retorno, é preciso um novo registro com foto atual da bagagem.\n\nSe precisar de qualquer suporte durante a viagem, estamos disponíveis 24 horas por dia, 7 dias por semana.\n📱 ${supportPhone}\n📧 contato@exactbag.com.br\nBoa viagem de volta!\nEquipe ExactBag\nProteção para sua bagagem.`;

    let html = textBody;
    if (TEMPLATE_VOLTA_HTML) {
      html = TEMPLATE_VOLTA_HTML
        .replace(/\{\{nome\}\}/g, escHtml(customerData.name) || 'Cliente')
        .replace(/\{\{link_registro\}\}/g, encodeURI(registrationLink || '#'));
    }

    return this._sendEmail({
      to: customerData.email,
      subject: 'Sua volta é amanhã — registre sua bagagem para o retorno! ✈️',
      html,
      text: textBody
    });
  }

  /**
   * Envia email de confirmação após preenchimento do formulário
   * @param {Object} customerData - Dados do cliente
   * @param {Object} submissionData - Dados preenchidos no formulário
   * @returns {boolean} - Sucesso do envio
   */
  async sendConfirmationEmail(customerData, submissionData) {
    try {
      console.log('[EmailGateway] Enviando email de confirmação para:', customerData.email);

      const emailData = {
        to: customerData.email,
        subject: 'Bagagem registrada com sucesso - ExactBag',
        html: this._generateConfirmationEmailHTML(customerData, submissionData),
        text: this._generateConfirmationEmailText(customerData, submissionData)
      };

      await this._sendEmail(emailData);

      console.log('[EmailGateway] Email de confirmação enviado');
      return true;

    } catch (error) {
      console.error('[EmailGateway] Erro ao enviar email de confirmação:', error);
      throw new Error('Erro ao enviar email de confirmação');
    }
  }

  /**
   * Envia email com link de download do produto digital
   * @param {Object} customerData - Dados do cliente
   * @param {string} downloadLink - Link seguro de download
   * @returns {boolean} - Sucesso do envio
   */
  async sendProductEmail(customerData, downloadLink) {
    try {
      console.log('[EmailGateway] Enviando email com produto para:', customerData.email);

      const emailData = {
        to: customerData.email,
        subject: 'Seu produto ExactBag está pronto!',
        html: this._generateProductEmailHTML(customerData, downloadLink),
        text: this._generateProductEmailText(customerData, downloadLink)
      };

      await this._sendEmail(emailData);

      console.log('[EmailGateway] Email com produto enviado');
      return true;

    } catch (error) {
      console.error('[EmailGateway] Erro ao enviar email com produto:', error);
      throw new Error('Erro ao enviar produto digital');
    }
  }

  // Método público para envio genérico (usado por salesReportsService)
  async sendEmail(emailData) {
    return this._sendEmail(emailData);
  }

  /**
   * Envia recibo de venda de tag física (estilo Shopify) — sem WhatsApp.
   * @param {object} order - { name, email, product, quantity, orderNumber, hasInsurance, notes }
   */
  async sendPhysicalTagReceiptEmail(order) {
    const ins = order.hasInsurance ? 'Com seguro' : 'Sem seguro';
    const outboundDate = order.outboundDate
      ? order.outboundDate.split('-').reverse().join('/')
      : '';
    const text = `Olá, ${order.name}! Seu pedido #${order.orderNumber} foi confirmado.\n\nProduto: ${order.product}\nQuantidade: ${order.quantity}x\nSeguro: ${ins}${outboundDate ? `\nData de ida: ${outboundDate}` : ''}\n\nApresente este e-mail ao retirar sua tag. Informe o número do pedido #${order.orderNumber} ao atendente.\n\nExactBag — contato@exactbag.com.br`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f6f6;margin:0;padding:0}
      .w{max-width:600px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10)}
      .hdr{background:#1a1a2e;padding:28px 40px;text-align:center}
      .hdr h1{color:#fff;margin:0;font-size:22px;letter-spacing:1px;font-weight:800}
      .hdr p{color:#94a3b8;margin:4px 0 0;font-size:13px}
      .body{padding:36px 40px}
      .badge{background:#f0fdf4;border:2px solid #16a34a;border-radius:10px;padding:18px 24px;text-align:center;margin-bottom:28px}
      .badge-lbl{font-size:11px;color:#16a34a;font-weight:700;text-transform:uppercase;letter-spacing:1px}
      .badge-num{font-size:38px;font-weight:900;color:#15803d;margin:4px 0 0;letter-spacing:-1px}
      p.intro{font-size:15px;color:#374151;margin:0 0 24px}
      h2{font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #f3f4f6;padding-bottom:8px;margin:0 0 14px}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      table th{text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase;padding:0 0 8px;font-weight:600}
      table td{padding:10px 0;border-top:1px solid #f3f4f6;font-size:14px;color:#374151;vertical-align:top}
      table td strong{color:#111827}
      .info{background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:24px}
      .info-row{display:flex;gap:32px}
      .info-item .lbl{font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:2px}
      .info-item .val{font-size:14px;color:#111827;font-weight:600}
      .note{background:#fefce8;border:1.5px solid #fde047;border-radius:8px;padding:14px 18px;font-size:13px;color:#713f12;line-height:1.5}
      .ftr{background:#f9fafb;padding:20px 40px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6}
      .ftr strong{color:#374151}
    </style></head><body>
    <div class="w">
      <div class="hdr"><h1>ExactBag</h1><p>Proteção para sua bagagem</p></div>
      <div class="body">
        <div class="badge">
          <div class="badge-lbl">✅ Pedido Confirmado</div>
          <div class="badge-num">#${order.orderNumber}</div>
        </div>
        <p class="intro">Olá, <strong>${escHtml(order.name)}</strong>! Seu pedido foi registrado com sucesso.</p>
        <h2>Detalhes do Pedido</h2>
        <table>
          <thead><tr><th>Produto</th><th>Qtd.</th><th>Seguro</th><th>Data de ida</th></tr></thead>
          <tbody><tr>
            <td><strong>${escHtml(order.product)}</strong></td>
            <td>${order.quantity}x</td>
            <td>${escHtml(ins)}</td>
            <td>${escHtml(outboundDate || '—')}</td>
          </tr></tbody>
        </table>
        <h2>Cliente</h2>
        <div class="info">
          <div class="info-row">
            <div class="info-item"><div class="lbl">Nome</div><div class="val">${escHtml(order.name)}</div></div>
            <div class="info-item"><div class="lbl">E-mail</div><div class="val">${escHtml(order.email)}</div></div>
          </div>
        </div>
        <div class="note">
          📋 <strong>Apresente este e-mail</strong> ao retirar sua tag em nosso parceiro.<br>
          Informe o número do pedido <strong>#${order.orderNumber}</strong> e seu nome ao atendente.
        </div>
      </div>
      <div class="ftr"><strong>ExactBag</strong> — Proteção para sua bagagem<br>📱 ${replacePhonePlaceholders('{{support_phone}}')} &nbsp;|&nbsp; 📧 contato@exactbag.com.br</div>
    </div>
    </body></html>`;

    return this._sendEmail({
      to: order.email,
      subject: `Pedido #${order.orderNumber} confirmado — ${order.product}`,
      html,
      text
    });
  }

  // Método interno para envio via Resend
  async _sendEmail(emailData) {
    if (!this.client) {
      console.warn('[EmailGateway] Email não enviado — client não inicializado (EMAIL_API_KEY ausente)');
      return false;
    }

    const messageData = {
      from: `${EMAIL_CONFIG.fromName} <${EMAIL_CONFIG.fromEmail}>`,
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text
    };

    if (emailData.attachments) {
      messageData.attachments = emailData.attachments;
    }

    if (process.env.NODE_ENV === 'test') {
      await new Promise(resolve => setTimeout(resolve, 300));
      return true;
    }

    try {
      const result = await this.client.emails.send(messageData);
      return !!result.data?.id;
    } catch (error) {
      console.error('[EmailGateway] Erro ao enviar via Resend:', error.message);
      throw error;
    }
  }

  // Templates de email
  _generateWelcomeEmailHTML(customerData, formLink) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Bem-vindo ao ExactBag!</h1>
        <p>Olá ${customerData.name},</p>
        <p>Seu produto ExactBag foi adquirido com sucesso!</p>
        <p>Para registrar sua bagagem e receber seu produto digital, acesse:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${formLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
            Registrar Bagagem
          </a>
        </p>
        <p>Este link é pessoal e seguro. Não compartilhe com terceiros.</p>
        <p>Atenciosamente,<br>Equipe ExactBag</p>
      </div>
    `;
  }

  _generateWelcomeEmailText(customerData, formLink) {
    return `
Olá ${customerData.name},

Seu produto ExactBag foi adquirido com sucesso!

Para registrar sua bagagem e receber seu produto digital, acesse:
${formLink}

Este link é pessoal e seguro. Não compartilhe com terceiros.

Atenciosamente,
Equipe ExactBag
    `.trim();
  }

  _generateConfirmationEmailHTML(customerData, submissionData) {
    const trip = submissionData?.customerData?.tripDetails || {};
    const tripType = trip.roundTrip ? 'Ida e Volta' : 'Ida';
    const outDate = trip.outboundDate || null;
    const retDate = trip.returnDate || null;

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #28a745;">Bagagem Registrada!</h1>
        <p>Olá ${customerData.name},</p>
        <p>Confirmamos o registro da sua bagagem:</p>
        <ul>
          <li><strong>Viagem:</strong> ${tripType}</li>
          ${outDate ? `<li><strong>Data de Ida:</strong> ${outDate}</li>` : ''}
          ${retDate ? `<li><strong>Data de Volta:</strong> ${retDate}</li>` : ''}
        </ul>
        <p>Em breve você receberá o link para download do seu produto digital.</p>
        <p>Atenciosamente,<br>Equipe ExactBag</p>
      </div>
    `;
  }

  _generateConfirmationEmailText(customerData, submissionData) {
    const trip = submissionData?.customerData?.tripDetails || {};
    const tripType = trip.roundTrip ? 'Ida e Volta' : 'Ida';
    const outDate = trip.outboundDate || null;
    const retDate = trip.returnDate || null;

    return `
Olá ${customerData.name},

Confirmamos o registro da sua bagagem:
- Viagem: ${tripType}
${outDate ? `- Data de Ida: ${outDate}` : ''}
${retDate ? `- Data de Volta: ${retDate}` : ''}

Em breve você receberá o link para download do seu produto digital.

Atenciosamente,
Equipe ExactBag
    `.trim();
  }

  _generateProductEmailHTML(customerData, downloadLink) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #28a745;">Seu Produto Está Pronto!</h1>
        <p>Olá ${customerData.name},</p>
        <p>Seu produto ExactBag personalizado está disponível para download.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${downloadLink}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
            Baixar Produto
          </a>
        </p>
        <p><strong>Importante:</strong> Este link expira em 24 horas por segurança.</p>
        <p>Atenciosamente,<br>Equipe ExactBag</p>
      </div>
    `;
  }

  _generateProductEmailText(customerData, downloadLink) {
    return `
Olá ${customerData.name},

Seu produto ExactBag personalizado está disponível para download.

Baixe aqui: ${downloadLink}

Importante: Este link expira em 24 horas por segurança.

Atenciosamente,
Equipe ExactBag
    `.trim();
  }
}

module.exports = new EmailGateway();
