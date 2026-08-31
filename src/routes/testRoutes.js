/**
 * TEST ROUTE - Endpoint público para setup de teste
 * DELETE AFTER TESTING!
 */

const express = require('express');
const router = express.Router();
const { prisma } = require('../config');
const { buildNativeRegistrationLink } = require('../services/nativeRegistrationLinkService');

/**
 * POST /test/setup/customer
 * Cria um cliente teste para testes do fluxo mascarado
 * NOTA: DELETAR APÓS TESTES EM PRODUÇÃO!
 */
router.post('/setup/customer', async (req, res) => {
  try {
    const { name = 'diego silva', email = 'diego@example.com', phone = '5512997263748' } = req.body;

    console.log(`[Test Setup] Criando cliente: ${name}`);

    const testSaleId = `TEST-${Date.now()}`;
    const formLink = buildNativeRegistrationLink(testSaleId);

    // Verificar se cliente já existe
    const existing = await prisma.sale.findFirst({
      where: {
        customerName: { contains: name, mode: 'insensitive' }
      }
    });

    if (existing) {
      return res.json({
        status: 'exists',
        message: 'Cliente já existe no BD',
        venda: {
          id: existing.id,
          cliente: existing.customerName,
          email: existing.customerEmail
        }
      });
    }

    // Criar novo cliente
    const venda = await prisma.sale.create({
      data: {
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        saleId: testSaleId,
        status: 'pending',
        formLink,
        partnerId: 'AGENCIA_TEST'
      }
    });

    res.json({
      status: 'created',
      message: 'Cliente criado com sucesso',
      venda: {
        id: venda.id,
        cliente: venda.customerName,
        email: venda.customerEmail,
        telefone: venda.customerPhone,
        formLink: venda.formLink.substring(0, 80) + '...'
      }
    });

  } catch (error) {
    console.error('[Test Setup] Erro:', error);
    res.status(500).json({
      error: 'Falha ao criar cliente teste',
      details: error.message
    });
  }
});

const notificationService = require('../services/notificationService');
const { buildPrettyPublicFormUrl } = require('../services/publicFormLinkService');

// Resolve o link de registro real a partir do BD (slug da venda)
async function resolveRegistrationLink(req, { email, phone }) {
  // Busca a venda mais recente do cliente
  const sale = await prisma.sale.findFirst({
    where: {
      OR: [
        ...(email ? [{ customerEmail: email }] : []),
        ...(phone ? [{ customerPhone: phone }] : [])
      ]
    },
    orderBy: { createdAt: 'desc' }
  });

  if (sale?.slug) {
    return buildPrettyPublicFormUrl(req, sale.slug);
  }
  if (sale?.formLink) {
    return sale.formLink;
  }
  return null;
}

// Rota para disparo de template 1 (Momento da compra)
router.post('/trigger/purchase-template', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    let { registrationLink } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'name, email e phone são obrigatórios' });
    }

    if (!registrationLink) {
      registrationLink = await resolveRegistrationLink(req, { email, phone });
    }
    if (!registrationLink) {
      return res.status(404).json({ error: 'Nenhuma venda encontrada para este cliente. Informe registrationLink manualmente.' });
    }

    const result = await notificationService.sendPurchaseNotification(
      { name, email, phone },
      {},
      registrationLink
    );

    res.json({ status: 'ok', registrationLink, result });
  } catch (error) {
    console.error('[Test] Erro compra template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para disparo de template 2 (Véspera do voo)
router.post('/trigger/vespera-template', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    let { registrationLink } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'name, email e phone são obrigatórios' });
    }

    if (!registrationLink) {
      registrationLink = await resolveRegistrationLink(req, { email, phone });
    }
    if (!registrationLink) {
      return res.status(404).json({ error: 'Nenhuma venda encontrada para este cliente. Informe registrationLink manualmente.' });
    }

    const result = await notificationService.sendVesperaNotification(
      { name, email, phone },
      {},
      registrationLink
    );

    res.json({ status: 'ok', registrationLink, result });
  } catch (error) {
    console.error('[Test] Erro véspera template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para disparo manual do relatório semanal de gestores
router.post('/trigger/report', async (req, res) => {
  try {
    const salesReportsService = require('../services/salesReportsService');
    const { type = 'weekly' } = req.query;

    console.log(`[Test] Gerando relatório ${type} sob demanda`);
    const result = await salesReportsService.generateAndSendReport(type);

    res.json({ status: 'ok', reportType: type, sent: result });
  } catch (error) {
    console.error('[Test] Erro relatório:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /test/return-reminder
 * Envia um e-mail de teste do lembrete de volta para o gestor
 */
router.post('/return-reminder', async (req, res) => {
  try {
    const emailGateway = require('../gateways/emailGateway');
    const targetEmail = req.body.email || 'admin@exactbag.com';

    await emailGateway.sendVoltaTemplateEmail(
      { name: 'Diego Costa (TESTE)', email: targetEmail },
      'https://app.exactbag.com.br/native/registro?email=teste@example.com&name=Diego%20Costa'
    );

    res.json({ status: 'ok', message: `Lembrete de volta enviado para ${targetEmail}` });
  } catch (error) {
    console.error('[Test] Erro return-reminder:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
