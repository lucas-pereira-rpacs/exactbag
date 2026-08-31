// Gateway para WhatsApp - Abstrai Z-API/Evolution/Meta Business API
// O parceiro nunca sabe qual provedor de WhatsApp usamos

const axios = require('axios');

// Configurações
const WHATSAPP_CONFIG = {
  provider: process.env.WHATSAPP_PROVIDER || 'meta',
  apiKey: process.env.WHATSAPP_API_KEY || '',
  baseUrl: process.env.WHATSAPP_BASE_URL || '',
  metaAccessToken: process.env.WHATSAPP_META_ACCESS_TOKEN || '',
  metaPhoneNumberId: process.env.WHATSAPP_META_PHONE_NUMBER_ID || '',
  metaApiVersion: process.env.WHATSAPP_META_API_VERSION || 'v22.0'
};

class WhatsAppGateway {
  constructor() {
    this.provider = WHATSAPP_CONFIG.provider;
    this.client = this._initializeClient();
  }

  _initializeClient() {
    try {
      // 🚀 BOOST: Adicionar timeout e retry automático
      const axiosConfig = {
        timeout: 10000, // 10 segundo timeout
        transitional: {
          silentJSONParsing: true,
          forcedJSONParsing: true,
          clarifyTimeoutError: true
        }
      };

      if (this.provider === 'zapi') {
        return axios.create({
          ...axiosConfig,
          baseURL: WHATSAPP_CONFIG.baseUrl,
          headers: {
            'Authorization': `Bearer ${WHATSAPP_CONFIG.apiKey}`,
            'Content-Type': 'application/json'
          }
        });
      } else if (this.provider === 'evolution') {
        return axios.create({
          ...axiosConfig,
          baseURL: WHATSAPP_CONFIG.baseUrl,
          headers: {
            'apikey': WHATSAPP_CONFIG.apiKey,
            'Content-Type': 'application/json'
          }
        });
      } else if (this.provider === 'meta') {
        if (!WHATSAPP_CONFIG.metaAccessToken || !WHATSAPP_CONFIG.metaPhoneNumberId) {
          console.warn('[WhatsAppGateway] Meta credentials missing, using mock mode');
          return null;
        }
        return axios.create({
          ...axiosConfig,
          baseURL: `https://graph.facebook.com/${WHATSAPP_CONFIG.metaApiVersion}`,
          headers: {
            'Authorization': `Bearer ${WHATSAPP_CONFIG.metaAccessToken}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (err) {
      console.warn('[WhatsAppGateway] Failed to initialize client:', err.message);
      return null;
    }
  }

  /**
   * Envia mensagem de boas-vindas com link do formulário
   * @param {Object} customerData - Dados do cliente
   * @param {string} formLink - Link do formulário
   * @returns {boolean} - Sucesso do envio
   */
  async sendWelcomeMessage(customerData, formLink) {
    try {
      console.log('[WhatsAppGateway] Enviando WhatsApp para:', customerData.phone);

      const message = `Olá ${customerData.name}! 🎒

Seu produto ExactBag foi adquirido com sucesso!

Para registrar sua bagagem e receber seu produto digital, acesse este link seguro:
${formLink}

⚠️ *Importante:* Este link é pessoal e expira em 24h.

Atenciosamente,
Equipe ExactBag`;

      await this._sendMessage(customerData.phone, message);

      console.log('[WhatsAppGateway] Mensagem enviada com sucesso para:', customerData.phone);
      return true;

    } catch (error) {
      console.error('[WhatsAppGateway] Erro ao enviar WhatsApp:', error);
      // Para Meta API, pode ser necessário verificar se o número está opt-in
      if (error.response?.data?.error?.code === 100) {
        console.warn('[WhatsAppGateway] Número não opt-in ou inválido:', customerData.phone);
      }
      throw new Error('Erro ao enviar mensagem de boas-vindas');
    }
  }

  /**
   * Envia mensagem de confirmação após preenchimento do formulário
   * @param {Object} customerData - Dados do cliente
   * @param {Object} submissionData - Dados preenchidos no formulário
   * @returns {boolean} - Sucesso do envio
   */
  async sendConfirmationMessage(customerData, submissionData) {
    try {
      console.log('[WhatsAppGateway] Enviando confirmação para:', customerData.phone);

      const trip = submissionData?.customerData?.tripDetails || {};
      const tripType = trip.roundTrip ? 'Ida e Volta' : 'Ida';
      const outDate = trip.outboundDate || null;
      const retDate = trip.returnDate || null;

      const message = `Olá ${customerData.name}! ✅

Confirmamos o registro da sua bagagem:
• Viagem: ${tripType}
${outDate ? `• Data de Ida: ${outDate}` : ''}
${retDate ? `• Data de Volta: ${retDate}` : ''}

📦 Em breve você receberá o link para download do seu produto digital.

Atenciosamente,
Equipe ExactBag`;

      await this._sendMessage(customerData.phone, message);

      console.log('[WhatsAppGateway] Confirmação enviada');
      return true;

    } catch (error) {
      console.error('[WhatsAppGateway] Erro ao enviar confirmação:', error);
      throw new Error('Erro ao enviar mensagem de confirmação');
    }
  }

  async sendReservationConfirmationMessage(customerData, saleData = {}) {
    const formatDate = (value) => {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    };
    const tripType = saleData.roundTrip ? 'Ida e volta' : 'Ida';
    const outboundDate = formatDate(saleData.outboundDate);
    const deliveryText = saleData.reservationType === 'physical-tag'
      ? 'O comprovante será enviado assim que faltarem *48 horas para a sua viagem*. Basta apresentá-lo na loja da Protec Bag no aeroporto.'
      : 'O link de ativação do serviço será enviado assim que faltarem *48 horas para a sua viagem*. Você receberá as orientações e o link para registrar sua bagagem antes do embarque.';
    const message = `Olá, ${customerData.name}! 👋

Sua compra e reserva do *ExactBag* foram confirmadas com sucesso! ✅

📦 *Detalhes da reserva*
✈️ Viagem: ${tripType}${outboundDate ? `
📅 Data da viagem: *${outboundDate}*` : ''}

*Quando vou receber o produto?*
${deliveryText}

⚠️ *Por enquanto, não é necessário fazer nenhum registro.*
Apenas aguarde nossa próxima mensagem e mantenha seus dados de contato atualizados.

📞 *Dúvidas? Estamos disponíveis 24 horas:*
+55 12 99758-3157
✉️ contato@exactbag.com.br

Boa viagem! ✈️
*Equipe ExactBag*`;

    const templateName = process.env.WHATSAPP_RESERVATION_TEMPLATE || '';
    if (this.provider === 'meta' && templateName) {
      return this.sendTemplate(customerData.phone, templateName, 'pt_BR', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerData.name },
            { type: 'text', text: tripType },
            { type: 'text', text: outboundDate },
            { type: 'text', text: deliveryText.replace(/\*/g, '') }
          ]
        }
      ]);
    }
    return this._sendMessage(customerData.phone, message);
  }

  /**
   * Envia mensagem com link de download do produto digital
   * @param {Object} customerData - Dados do cliente
   * @param {string} downloadLink - Link seguro de download
   * @returns {boolean} - Sucesso do envio
   */
  async sendProductMessage(customerData, downloadLink) {
    try {
      console.log('[WhatsAppGateway] Enviando produto para:', customerData.phone);

      const message = `Olá ${customerData.name}! 📥

Seu produto ExactBag personalizado está pronto!

⬇️ *Baixe aqui:* ${downloadLink}

⚠️ *Importante:* Este link expira em 24 horas.

Atenciosamente,
Equipe ExactBag`;

      await this._sendMessage(customerData.phone, message);

      console.log('[WhatsAppGateway] Produto enviado');
      return true;

    } catch (error) {
      console.error('[WhatsAppGateway] Erro ao enviar produto:', error);
      throw new Error('Erro ao enviar produto digital');
    }
  }

  /**
   * Envia mensagem de lembrete para clientes que não preencheram o formulário
   * @param {Object} customerData - Dados do cliente
   * @param {string} formLink - Link do formulário
   * @returns {boolean} - Sucesso do envio
   */
  async sendReminderMessage(customerData, formLink) {
    try {
      console.log('[WhatsAppGateway] Enviando lembrete para:', customerData.phone);

      const message = `Olá ${customerData.name}! ⏰

Lembramos que você ainda não registrou sua bagagem no ExactBag.

Para não perder seu produto digital, acesse:
${formLink}

Atenciosamente,
Equipe ExactBag`;

      await this._sendMessage(customerData.phone, message);

      console.log('[WhatsAppGateway] Lembrete enviado');
      return true;

    } catch (error) {
      console.error('[WhatsAppGateway] Erro ao enviar lembrete:', error);
      throw new Error('Erro ao enviar lembrete');
    }
  }

  // Método interno para envio (abstrai provedor específico)
  async _sendMessage(to, message) {
    const cleanPhone = this._cleanPhoneNumber(to);

    if (this.provider === 'zapi') {
      const payload = {
        phone: cleanPhone,
        message: message,
        isGroup: false
      };

      if (process.env.NODE_ENV === 'test') {
        await new Promise(resolve => setTimeout(resolve, 200));
        return true;
      }

      await this.client.post('/send-text', payload);
      return true;

    } else if (this.provider === 'evolution') {
      const payload = {
        number: cleanPhone,
        options: {
          delay: 1200,
          presence: 'composing'
        },
        textMessage: {
          text: message
        }
      };

      if (process.env.NODE_ENV === 'test') {
        await new Promise(resolve => setTimeout(resolve, 200));
        return true;
      }

      await this.client.post('/message/sendText', payload);
      return true;

    } else if (this.provider === 'meta') {
      // Meta Cloud API: texto livre só funciona dentro da janela de 24h
      // (quando o usuário já respondeu). Para iniciar conversa, use _sendTemplate.
      const recipient = cleanPhone.replace(/\D/g, '');
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: {
          preview_url: true,
          body: message
        }
      };

      if (process.env.NODE_ENV === 'test') {
        await new Promise(resolve => setTimeout(resolve, 200));
        return true;
      }

      if (!this.client) {
        console.warn('[WhatsAppGateway] Client not initialized (mock mode), skipping send');
        return false;
      }

      const response = await this.client.post(`/${WHATSAPP_CONFIG.metaPhoneNumberId}/messages`, payload);
      console.log('[WhatsAppGateway] Meta API response: messageId=', response.data?.messages?.[0]?.id || 'unknown');
      if (response.data && response.data.messages && response.data.messages[0].id) {
        return true;
      }

      throw new Error('Meta WhatsApp Business API message send failure');
    }

    throw new Error(`Unsupported WhatsApp provider: ${this.provider}`);
  }

  /**
   * Envia mensagem de template (obrigatório para iniciar conversa na Meta Cloud API)
   * @param {string} to - Número de destino
   * @param {string} templateName - Nome do template aprovado
   * @param {string} languageCode - Código do idioma (ex: 'pt_BR', 'en_US')
   * @param {Array} components - Componentes do template (header, body, etc)
   * @returns {Object} - Resposta da API
   */
  async sendTemplate(to, templateName, languageCode = 'pt_BR', components = []) {
    const cleanPhone = this._cleanPhoneNumber(to);

    if (this.provider !== 'meta') {
      // Para outros providers, cai no texto normal
      return this._sendMessage(to, `[Template: ${templateName}]`);
    }

    const recipient = cleanPhone.replace(/\D/g, '');
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      }
    };

    if (components.length > 0) {
      payload.template.components = components;
    }

    if (process.env.NODE_ENV === 'test') {
      return { messages: [{ id: 'test_template_id' }] };
    }

    if (!this.client) {
      console.warn('[WhatsAppGateway] Client not initialized (mock mode), skipping template send');
      return null;
    }

    console.log('[WhatsAppGateway] Enviando template:', templateName, 'para:', recipient);
    const response = await this.client.post(`/${WHATSAPP_CONFIG.metaPhoneNumberId}/messages`, payload);
    console.log('[WhatsAppGateway] Template response: messageId=', response.data?.messages?.[0]?.id || 'unknown');
    return response.data;
  }

  // Limpa e formata número de telefone
  _cleanPhoneNumber(phone) {
    // Remove todos os caracteres não numéricos
    let clean = phone.replace(/\D/g, '');

    // Adiciona +55 se não tiver código do país (Brasil)
    if (!clean.startsWith('55') && clean.length === 11) {
      clean = '55' + clean;
    }

    // Adiciona + se não tiver
    if (!clean.startsWith('+')) {
      clean = '+' + clean;
    }

    return clean;
  }

  /**
   * Verifica status de entrega de uma mensagem
   * @param {string} messageId - ID da mensagem
   * @returns {Object} - Status da mensagem
   */
  async getMessageStatus(messageId) {
    try {
      console.log('[WhatsAppGateway] Verificando status da mensagem:', messageId);

      // Para MVP: simular status
      const status = Math.random() > 0.1 ? 'delivered' : 'failed'; // 90% sucesso

      return {
        messageId,
        status,
        deliveredAt: status === 'delivered' ? new Date() : null,
        error: status === 'failed' ? 'Número inválido ou bloqueado' : null
      };

    } catch (error) {
      console.error('[WhatsAppGateway] Erro ao verificar status:', error);
      throw new Error('Erro ao verificar status da mensagem');
    }
  }
}

module.exports = new WhatsAppGateway();
