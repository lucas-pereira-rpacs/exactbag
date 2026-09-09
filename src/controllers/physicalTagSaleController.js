// Physical Tag Sale Controller
// Processa vendas de tags físicas (Exact Bag Essencial / Exact Bag Cover).
// Registra o pedido e envia a confirmação de reserva por e-mail e WhatsApp.

const crypto = require('crypto');
const { prisma } = require('../config');
const emailGateway = require('../gateways/emailGateway');
const whatsappGateway = require('../gateways/whatsappGateway');

const PRODUCTS = {
  'exactbag-essencial': {
    label: 'Tag Exact Bag Essencial',
    insuranceLocked: false
  },
  'exactbag-cover': {
    label: 'Tag Exact Bag Cover',
    insuranceLocked: true  // seguro sempre incluso
  }
};

const PHYSICAL_TAG_RECEIPT_WINDOW_MS = 48 * 60 * 60 * 1000;

function getErrorDetails(error) {
  if (!error) return error;
  if (typeof error.toJSON === 'function') return error.toJSON();
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: error.code,
    status: error.status,
    response: error.response?.data,
    responseStatus: error.response?.status,
    responseHeaders: error.response?.headers
  };
}

/**
 * Retorna o próximo número de pedido sequencial (começa em 1001).
 * Usa SELECT MAX para ser seguro em concurrent inserts no nível de app.
 */
async function getNextOrderNumber() {
  if (!prisma) return Math.floor(1001 + Math.random() * 9000); // fallback sem BD
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(MAX("orderNumber"), 1000) + 1 AS next FROM "PhysicalTagOrder"
  `;
  return Number(rows[0]?.next ?? 1001);
}

/**
 * POST /native/physical-tag-sale
 *
 * Campos esperados no body (JSON):
 *   product        — 'exactbag-essencial' | 'exactbag-cover'
 *   customerName   — string (obrigatório)
 *   customerEmail  — string (obrigatório)
 *   customerPhone  — string (obrigatório)
 *   outboundDate   — data de ida no formato YYYY-MM-DD (obrigatório)
 *   quantity       — integer 1–50 (padrão 1)
 *   hasInsurance   — boolean (ignorado se Cover — sempre true)
 *   partnerId      — string (opcional)
 *   notes          — string (opcional)
 *
 * Resposta 201: { success, orderNumber, message }
 */
exports.handlePhysicalTagSale = async (req, res) => {
  try {
    const body = req.body;

    const product = (body.product || '').trim();
    const customerName = (body.customerName || '').trim();
    const customerEmail = (body.customerEmail || '').trim().toLowerCase();
    const customerPhone = (body.customerPhone || '').trim();
    const outboundDateInput = (body.outboundDate || '').trim();
    const quantity = Math.max(1, Math.min(50, parseInt(body.quantity, 10) || 1));
    const notes = (body.notes || '').trim() || null;
    const partnerId = (body.partnerId || '').trim() || null;

    if (!PRODUCTS[product]) {
      return res.status(400).json({ success: false, error: 'Produto inválido. Selecione um produto válido.' });
    }
    if (!customerName) {
      return res.status(400).json({ success: false, error: 'Nome do cliente é obrigatório.' });
    }
    if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return res.status(400).json({ success: false, error: 'E-mail inválido.' });
    }
    if (customerPhone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ success: false, error: 'Telefone inválido.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(outboundDateInput)) {
      return res.status(400).json({ success: false, error: 'Data de ida é obrigatória.' });
    }
    const outboundDate = new Date(`${outboundDateInput}T12:00:00.000Z`);
    if (Number.isNaN(outboundDate.getTime()) || outboundDate.toISOString().slice(0, 10) !== outboundDateInput) {
      return res.status(400).json({ success: false, error: 'Data de ida inválida.' });
    }

    const productInfo = PRODUCTS[product];
    const hasInsurance = productInfo.insuranceLocked
      ? true
      : (body.hasInsurance === true || body.hasInsurance === 'true');

    const orderNumber = await getNextOrderNumber();
    const id = crypto.randomBytes(10).toString('hex');

    if (prisma) {
      await prisma.$executeRaw`
        INSERT INTO "PhysicalTagOrder"
          ("id", "orderNumber", "product", "customerName", "customerEmail",
           "customerPhone", "outboundDate", "quantity", "hasInsurance", "notes", "partnerId", "operatorEmail", "createdAt")
        VALUES (
          ${id}, ${orderNumber}, ${product}, ${customerName}, ${customerEmail},
          ${customerPhone}, ${outboundDate}, ${quantity}, ${hasInsurance}, ${notes}, ${partnerId},
          ${req.dashboardUser?.email ?? null}, NOW()
        )
      `;
    }

    const isWithinReceiptWindow = outboundDate.getTime() - Date.now() <= PHYSICAL_TAG_RECEIPT_WINDOW_MS;
    let notificationStatus;
    let responseMessage;

    if (isWithinReceiptWindow) {
      let receiptSent = false;
      try {
        receiptSent = Boolean(await emailGateway.sendPhysicalTagReceiptEmail({
          name: customerName,
          email: customerEmail,
          product: productInfo.label,
          quantity,
          orderNumber,
          outboundDate: outboundDateInput,
          hasInsurance,
          notes
        }));
        if (receiptSent && prisma) {
          await prisma.$executeRaw`
            UPDATE "PhysicalTagOrder"
            SET "receiptSentAt" = NOW()
            WHERE id = ${id} AND "receiptSentAt" IS NULL
          `;
        }
      } catch (error) {
        console.error('[PhysicalTagSale] Falha no envio imediato do comprovante:', {
          orderNumber,
          product,
          customer: { name: customerName, email: customerEmail, phone: customerPhone },
          error,
          errorDetails: getErrorDetails(error)
        });
      }
      notificationStatus = { receipt: receiptSent, email: receiptSent, whatsapp: false };
      responseMessage = receiptSent
        ? `Pedido #${orderNumber} registrado e comprovante enviado imediatamente por e-mail.`
        : `Pedido #${orderNumber} registrado, mas o envio imediato do comprovante falhou.`;
    } else {
      const customerData = { name: customerName, email: customerEmail, phone: customerPhone };
      const reservationData = {
        outboundDate: outboundDateInput,
        roundTrip: false,
        reservationType: 'physical-tag'
      };
      const notifications = await Promise.allSettled([
        emailGateway.sendPurchaseConfirmationTemplateEmail(customerData, reservationData),
        whatsappGateway.sendReservationConfirmationMessage(customerData, reservationData)
      ]);
      notifications.forEach((result, index) => {
        if (result.status === 'rejected') {
          const channel = index === 0 ? 'e-mail' : 'WhatsApp';
          console.error(`[PhysicalTagSale] Falha no ${channel} de reserva:`, {
            orderNumber,
            id,
            channel,
            product,
            customer: customerData,
            reservation: reservationData,
            error: result.reason,
            errorDetails: getErrorDetails(result.reason)
          });
        }
      });
      notificationStatus = {
        receipt: false,
        email: notifications[0].status === 'fulfilled' && Boolean(notifications[0].value),
        whatsapp: notifications[1].status === 'fulfilled' && Boolean(notifications[1].value)
      };
      responseMessage = notificationStatus.email && notificationStatus.whatsapp
        ? `Pedido #${orderNumber} registrado e confirmação de reserva enviada por e-mail e WhatsApp.`
        : `Pedido #${orderNumber} registrado, mas um ou mais canais de confirmação falharam.`;
    }

    console.info(
      `[PhysicalTagSale] Pedido #${orderNumber} criado — operator=${req.dashboardUser?.email} product=${product} qty=${quantity} partner=${partnerId}`
    );

    return res.status(201).json({
      success: true,
      orderNumber,
      notifications: notificationStatus,
      message: responseMessage
    });
  } catch (err) {
    console.error('[PhysicalTagSale] Erro:', err);
    return res.status(500).json({ success: false, error: 'Erro interno. Tente novamente em instantes.' });
  }
};
