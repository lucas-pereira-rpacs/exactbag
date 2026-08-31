/**
 * Partner Callback Service - Notificar parceiro quando cliente completa registro
 * Usa Agenda/PostgreSQL para entrega persistente e retry.
 * 
 * ARQUITETURA DE CUSTO MÍNIMO:
 * - Usa o Agenda já compartilhado pelos jobs da aplicação
 * - Fallback para email se webhook falhar (já temos SES)
 * - Sem database extra, sem Redis, sem blob storage
 * - HMAC signature para segurança
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { enqueueUniqueJob } = require('../jobs/agendaJobService');
const notificationService = require('./notificationService');
const prisma = require('../config').prisma;

const partnerCallbackService = {
  /**
   * Agendar callback do parceiro quando cliente completa
   * Persiste o callback no Agenda antes de retornar.
   */
  async schedulePartnerCallback(sale, submission) {
    try {
      // Carregar dados do parceiro
      const partner = await prisma.partner.findUnique({
        where: { partnerId: sale.partnerId }
      });

      if (!partner) {
        console.error(`[PartnerCallback] Parceiro ${sale.partnerId} não encontrado`);
        return false;
      }

      // Se parceiro não registrou webhook URL, enviar email em vez
      if (!partner.webhookUrl) {
        console.log(`[PartnerCallback] Nenhuma webhookUrl para ${partner.partnerId}, usando fallback de email`);
        return await this._sendEmailFallback(partner, sale, submission);
      }

      // Preparar payload de callback
      const callbackPayload = {
        event: 'customer.registration.completed',
        saleId: sale.id,
        partnerId: sale.partnerId,
        customerEmail: sale.customerEmail,
        customerName: sale.customerName,
        completedAt: new Date().toISOString(),
        submissionId: submission?.id || null
      };

      // Gerar assinatura HMAC usando API Key do parceiro como secret
      const signature = crypto
        .createHmac('sha256', partner.apiKey)
        .update(JSON.stringify(callbackPayload))
        .digest('hex');

      // Adicionar signature ao payload
      callbackPayload.signature = signature;

      // Agendar callback como job persistente no Agenda
      const eventId = submission?.id || `${sale.id}:${callbackPayload.event}`;
      const job = await enqueueUniqueJob({
        name: 'PARTNER_CALLBACK',
        data: {
          partnerId: partner.partnerId,
          webhookUrl: partner.webhookUrl,
          payload: callbackPayload,
          maxAttempts: 2
        },
        maxAttempts: 2,
        dedupeKey: `partnerCallback:${partner.partnerId}:${eventId}`
      });

      console.log(`[PartnerCallback] Job agendado para ${partner.partnerId}: ${String(job.attrs._id)}`);
      return true;
    } catch (error) {
      console.error('[PartnerCallback] Erro ao agendar callback:', error.message);
      return false;
    }
  },

  /**
   * Executar callback para parceiro (chamado pelo handler do Agenda)
   * Implementação: HTTP POST simples com timeout de 5s
   */
  async executeCallback(job) {
    const { partnerId, webhookUrl, payload, attempt, maxAttempts } = job;

    try {
      console.log(`[PartnerCallback] Executando callback para ${partnerId} (tentativa ${attempt + 1}/${maxAttempts})`);

      // Fazer POST para webhook do parceiro com timeout de 5s
      const success = await this._postWithTimeout(webhookUrl, payload, 5000);

      if (success) {
        console.log(`[PartnerCallback] ✓ Callback bem-sucedido para ${partnerId}`);
        return { success: true };
      } else if (attempt < maxAttempts - 1) {
        console.log(`[PartnerCallback] Retry persistente solicitado para ${partnerId}`);
        return { success: false, retry: true };
      } else {
        // Max tentativas atingidas, fallback para email
        console.warn(`[PartnerCallback] Máximo de tentativas atingido para ${partnerId}, usando fallback de email`);
        
        const partner = await prisma.partner.findUnique({
          where: { partnerId }
        });
        
        if (partner) {
          await this._sendEmailFallback(partner, payload);
        }
        
        return { success: false, retry: false };
      }
    } catch (error) {
      console.error(`[PartnerCallback] Erro ao executar callback: ${error.message}`);

      if (attempt < maxAttempts - 1) {
        console.log('[PartnerCallback] Retry persistente solicitado devido a erro');
        return { success: false, retry: true };
      } else {
        return { success: false, retry: false };
      }
    }
  },

  /**
   * Registrar webhook URL do parceiro
   */
  async registerWebhook(partnerId, webhookUrl) {
    try {
      // Validar URL
      if (webhookUrl) {
        try {
          new URL(webhookUrl);
        } catch (e) {
          throw new Error('URL de webhook inválida');
        }
      }

      // Permitir apenas HTTPS em produção
      if (webhookUrl && process.env.NODE_ENV === 'production' && !webhookUrl.startsWith('https://')) {
        throw new Error('Apenas webhooks HTTPS são permitidos em produção');
      }

      const updated = await prisma.partner.update({
        where: { partnerId },
        data: { webhookUrl }
      });

      console.log(`[PartnerCallback] Webhook registrado para ${partnerId}: ${webhookUrl}`);
      return updated;
    } catch (error) {
      console.error('[PartnerCallback] Erro ao registrar webhook:', error.message);
      throw error;
    }
  },

  /**
   * Obter webhook URL registrado
   */
  async getWebhook(partnerId) {
    try {
      const partner = await prisma.partner.findUnique({
        where: { partnerId },
        select: { webhookUrl: true }
      });

      return partner?.webhookUrl || null;
    } catch (error) {
      console.error('[PartnerCallback] Erro ao obter webhook:', error.message);
      return null;
    }
  },

  // ===== PRIVATE HELPERS =====

  /**
   * POST com timeout (simples, sem retry interno)
   */
  async _postWithTimeout(url, data, timeoutMs = 5000) {
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        const payload = JSON.stringify(data);

        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port,
          path: urlObj.pathname + urlObj.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'X-ExactBag-Signature': data.signature,
            'X-ExactBag-Event': data.event
          },
          timeout: timeoutMs
        };

        const req = protocol.request(options, (res) => {
          let responseBody = '';

          res.on('data', (chunk) => {
            responseBody += chunk;
          });

          res.on('end', () => {
            // Considerar 2xx como sucesso
            if (res.statusCode >= 200 && res.statusCode < 300) {
              console.log(`[PartnerCallback] Webhook retornou ${res.statusCode}`);
              resolve(true);
            } else {
              console.warn(`[PartnerCallback] Webhook retornou ${res.statusCode}: ${responseBody}`);
              resolve(false);
            }
          });
        });

        req.on('timeout', () => {
          console.warn('[PartnerCallback] Timeout do webhook');
          req.destroy();
          resolve(false);
        });

        req.on('error', (error) => {
          console.error(`[PartnerCallback] Erro de webhook: ${error.message}`);
          resolve(false);
        });

        req.write(payload);
        req.end();
      } catch (error) {
        console.error(`[PartnerCallback] Erro em POST: ${error.message}`);
        resolve(false);
      }
    });
  },

  /**
   * Fallback para email se webhook falhar/não estiver configurado
   */
  async _sendEmailFallback(partner, sale, submission = null) {
    try {
      const saleData = typeof sale === 'object' && sale.id ? sale : sale;
      
      const emailTemplate = `
        <h2>Cliente Completou Registro</h2>
        <p><strong>Cliente:</strong> ${saleData.customerName || 'N/A'}</p>
        <p><strong>Email:</strong> ${saleData.customerEmail || 'N/A'}</p>
        <p><strong>Venda ID:</strong> ${saleData.id || saleData.saleId}</p>
        <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
        ${submission ? `<p><strong>Submission ID:</strong> ${submission.id}</strong></p>` : ''}
      `;

      await notificationService.sendEmail({
        to: partner.email,
        subject: `ExactBag: Cliente Completou Registro - ${partner.partnerId}`,
        html: emailTemplate
      });

      console.log(`[PartnerCallback] Email de fallback enviado para ${partner.email}`);
      return true;
    } catch (error) {
      console.error('[PartnerCallback] Erro ao enviar email de fallback:', error.message);
      return false;
    }
  }
};

module.exports = partnerCallbackService;
