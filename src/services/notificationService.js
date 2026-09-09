/**
 * Notification Service
 * Orquestra o envio de notificações via múltiplos canais (Email, WhatsApp)
 * Fornece uma camada de abstração que mascara as APIs internas do parceiro
 * (provedores de e-mail e Meta WhatsApp não são expostos ao parceiro)
 */

const emailGateway = require('../gateways/emailGateway');
const whatsappGateway = require('../gateways/whatsappGateway');

class NotificationService {
  /**
   * Envia notificação de confirmação de compra
   * @param {object} customerData - { name, email, phone }
   * @param {object} saleData - { saleId, partnerId, amount, etc }
   * @param {object} options - { useEmail, useWhatsapp }
   */
  async sendPurchaseConfirmation(customerData, saleData, options = {}) {
    const {
      useEmail = true,
      useWhatsapp = true
    } = options;

    const notifications = [];

    console.log(`[NotificationService] Enviando confirmação de compra para ${customerData.name}`);

    // Email de confirmação
    if (useEmail && emailGateway.sendConfirmationEmail) {
      notifications.push(
        emailGateway.sendConfirmationEmail(customerData, {
          customerData,
          saleData
        }).catch(err => {
          console.error('[NotificationService] Erro ao enviar email de confirmação:', err.message);
          return { success: false, channel: 'email', error: err.message };
        })
      );
    }

    // WhatsApp de confirmação
    if (useWhatsapp && whatsappGateway.sendConfirmationMessage) {
      notifications.push(
        whatsappGateway.sendConfirmationMessage(customerData, {
          customerData,
          saleData
        }).catch(err => {
          console.error('[NotificationService] Erro ao enviar WhatsApp de confirmação:', err);
          return { success: false, channel: 'whatsapp', error: err.message };
        })
      );
    }

    const results = await Promise.allSettled(notifications);
    
    return {
      success: results.some(r => r.status === 'fulfilled' && r.value?.success),
      results: results.map((r, idx) => ({
        status: r.status,
        value: r.value || r.reason
      }))
    };
  }

  /**
   * Envia notificação de lembrete (follow-up)
   * @param {object} customerData - { name, email, phone }
   * @param {string} message - Mensagem customizada
   * @param {string} channel - 'email' | 'whatsapp' | 'both'
   */
  async sendPurchaseNotification(customerData, saleData, registrationLink) {
    
    console.log(`[NotificationService] Enviando notificação de compra para ${customerData.name}`);

    // Garante que o link nunca chegue como null nos parâmetros das templates
    const safeLink =
      registrationLink ||
      `${process.env.APP_BASE_URL || "https://app.exactbag.com.br"}/registrodebagagem?${new URLSearchParams(
        {
          saleId: String(saleData?.saleId || ''),
        },
      )}`;

    const results = [];

    // Email template 1
    if (emailGateway.sendPurchaseTemplateEmail) {
      results.push(
        emailGateway.sendPurchaseTemplateEmail(customerData, safeLink).catch(err => {
          console.error('[NotificationService] Erro email compra:', err.message);
          return { channel: 'email', success: false, error: err.message };
        })
      );
    }

    // WhatsApp template 1
    if (whatsappGateway.sendTemplate) {
      results.push(
        whatsappGateway.sendTemplate(customerData.phone, 'exactbag_compra_registro', 'pt_BR', [
          { type: 'body', parameters: [{ type: 'text', text: customerData.name }, { type: 'text', text: safeLink }] }
        ]).catch(err => {
          console.error('[NotificationService] Erro WhatsApp compra:', err);
          return { channel: 'whatsapp', success: false, error: err.message };
        })
      );
    }

    const settled = await Promise.allSettled(results);
    return {
      success: settled.every(r => r.status === 'fulfilled'),
      details: settled.map(r => ({ status: r.status, value: r.value || r.reason }))
    };
  }

  async sendPurchaseConfirmationNotification(passengerData, saleData) {
    const passenger = {
      name: passengerData.passengerName || passengerData.name,
      email: passengerData.passengerEmail || passengerData.email,
      phone: passengerData.passengerPhone || passengerData.phone,
    };
    console.log(`[NotificationService] Enviando confirmacao de compra para ${passenger.name} <${passenger.email}>`);
    const results = await Promise.allSettled([
      emailGateway.sendPurchaseConfirmationTemplateEmail(passenger, saleData),
      whatsappGateway.sendReservationConfirmationMessage(passenger, saleData)
    ]);
    const channels = ['email', 'whatsapp'];
    const details = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return { channel: channels[index], success: Boolean(result.value), value: result.value };
      }
      console.error(`[NotificationService] Erro ${channels[index]} confirmacao de compra:`, result.reason);
      return { channel: channels[index], success: false, error: result.reason?.message };
    });
    return { success: details.some(detail => detail.success), details };
  }

  async sendPurchaseReminderNotification(customerData, saleData, registrationLink) {
    return this.sendPurchaseNotification(customerData, saleData, registrationLink);
  }

  async sendVesperaNotification(customerData, saleData, registrationLink) {
    console.log(`[NotificationService] Enviando notificação véspera para ${customerData.name}`);

    const results = [];

    // Email template 2
    if (emailGateway.sendVesperaTemplateEmail) {
      results.push(
        emailGateway.sendVesperaTemplateEmail(customerData, registrationLink).catch(err => {
          console.error('[NotificationService] Erro email véspera:', err.message);
          return { channel: 'email', success: false, error: err.message };
        })
      );
    }

    // WhatsApp template 2
    if (whatsappGateway.sendTemplate) {
      results.push(
        whatsappGateway.sendTemplate(customerData.phone, 'exactbag_vespera_voo', 'pt_BR', [
          { type: 'body', parameters: [{ type: 'text', text: customerData.name }, { type: 'text', text: registrationLink }] }
        ]).catch(err => {
          console.error('[NotificationService] Erro WhatsApp véspera:', err);
          return { channel: 'whatsapp', success: false, error: err.message };
        })
      );
    }

    const settled = await Promise.allSettled(results);
    return {
      success: settled.every(r => r.status === 'fulfilled'),
      details: settled.map(r => ({ status: r.status, value: r.value || r.reason }))
    };
  }

  async sendReminder(customerData, message, channel = 'both') {
    console.log(`[NotificationService] Enviando lembrete via ${channel} para ${customerData.name}`);

    const reminders = [];

    if ((channel === 'email' || channel === 'both') && emailGateway.sendEmail) {
      reminders.push(
        emailGateway.sendEmail(customerData.email, 'Lembrete ExactBag', message)
          .catch(err => false)
      );
    }

    if ((channel === 'whatsapp' || channel === 'both') && whatsappGateway.sendMessage) {
      reminders.push(
        whatsappGateway.sendMessage(customerData.phone, message)
          .catch(err => false)
      );
    }

    const results = await Promise.allSettled(reminders);
    
    return {
      success: results.some(r => r.status === 'fulfilled' && r.value),
      resultados: results.length
    };
  }

}

// Singleton export
module.exports = new NotificationService();
