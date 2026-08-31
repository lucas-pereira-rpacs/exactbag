// Physical Tag Sale Controller
// Processa vendas de tags físicas (Exact Bag Essencial / Exact Bag Cover).
// Gera recibo por e-mail com número de pedido sequencial — NÃO aciona funil WhatsApp.

const crypto = require('crypto');
const { prisma } = require('../config');
const emailGateway = require('../gateways/emailGateway');

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
           "outboundDate", "quantity", "hasInsurance", "notes", "partnerId", "operatorEmail", "createdAt")
        VALUES (
          ${id}, ${orderNumber}, ${product}, ${customerName}, ${customerEmail},
          ${outboundDate}, ${quantity}, ${hasInsurance}, ${notes}, ${partnerId},
          ${req.dashboardUser?.email ?? null}, NOW()
        )
      `;
    }

    await emailGateway.sendPhysicalTagReceiptEmail({
      name: customerName,
      email: customerEmail,
      product: productInfo.label,
      quantity,
      orderNumber,
      outboundDate: outboundDateInput,
      hasInsurance,
      notes
    });

    console.info(
      `[PhysicalTagSale] Pedido #${orderNumber} criado — operator=${req.dashboardUser?.email} product=${product} qty=${quantity} partner=${partnerId}`
    );

    return res.status(201).json({
      success: true,
      orderNumber,
      message: `Pedido #${orderNumber} registrado e recibo enviado para ${customerEmail}.`
    });
  } catch (err) {
    console.error('[PhysicalTagSale] Erro:', err);
    return res.status(500).json({ success: false, error: 'Erro interno. Tente novamente em instantes.' });
  }
};
