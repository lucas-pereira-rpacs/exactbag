// Rotas do módulo de Registro Nativo
const express = require('express');
const router = express.Router();
const controller = require('../controllers/nativeRegistrationController');
const { handleDashboardManualSale } = require('../../../controllers/manualSaleController');
const { handlePhysicalTagSale } = require('../../../controllers/physicalTagSaleController');
const {
  validateSun,
  getPhysicalTagFactory,
  updatePhysicalTagFactoryLastNumbers
} = require('../../../services/physicalTagSunService');
const partnerRepository = require('../../../repositories/partnerRepository');
const nowIntegrationRoutes = require('./nowIntegrationRoutes');
const { dashboardAuthMiddleware, requireRole, login, logout, validateToken,
        listUsers, getUserById, createUser, updateUser, changePassword, toggleUserActive } = require('../services/dashboardAuthService');

// ==================== ROTAS PÚBLICAS (formulário do passageiro) ====================
// POST /native/registro — Passageiro submete registro (sem auth, com rate limit)
// Body parser com limite de 10mb para upload de fotos base64
const bodyParser = require('body-parser');
router.post('/registro', bodyParser.json({ limit: '10mb' }), controller.createRegistration);
router.post('/physical-tag/validate-sun', async (req, res) => {
  try {
    const result = await validateSun(req.body?.sunNumber);
    return res.status(result.valid ? 200 : 400).json(result);
  } catch (error) {
    console.error('[PhysicalTag] Erro ao validar SUN:', error);
    return res.status(500).json({ valid: false, error: 'SUN Inválido ou Vencido (mais de 1 ano). Verifique se preencheu corretamente.' });
  }
});

router.get('/physical-tag-factory', dashboardAuthMiddleware, requireRole('gestor', 'admin'), async (_req, res) => {
  try {
    const config = await getPhysicalTagFactory();
    return res.json({
      success: true,
      data: {
        insuredSunNumberLast: config.InsuredSunNumberLast,
        nonInsuredSunNumberLast: config.NonInsuredSunNumberLast
      }
    });
  } catch (error) {
    console.error('[PhysicalTagFactory] Erro ao buscar configuração:', error);
    return res.status(500).json({ success: false, error: 'Erro ao carregar configuração de SUN.' });
  }
});

router.put('/physical-tag-factory', dashboardAuthMiddleware, requireRole('gestor', 'admin'), async (req, res) => {
  try {
    const result = await updatePhysicalTagFactoryLastNumbers({
      insuredLast: req.body?.insuredSunNumberLast,
      nonInsuredLast: req.body?.nonInsuredSunNumberLast
    });
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('[PhysicalTagFactory] Erro ao atualizar configuração:', error);
    return res.status(500).json({ success: false, error: 'Erro ao atualizar configuração de SUN.' });
  }
});

// GET /native/cpv/:cpvNumber — Consulta pública do CPV (QR Code, sem auth)
router.get('/cpv/:cpvNumber', controller.getPublicCpv);

// GET /native/registro/cpv/:cpvNumber — Consulta por número CPV (protegida, apenas dashboard)
router.get('/registro/cpv/:cpvNumber', dashboardAuthMiddleware, controller.getRegistrationByCpv);

// POST /native/manual-sale — Entrada manual de venda via dashboard interno
// Requer login de operador (gestor ou atendente). Injeta no mesmo funil de automação
// que as vendas recebidas via /webhooks/sales, sem duplicar nenhuma lógica.
router.post('/manual-sale', dashboardAuthMiddleware, handleDashboardManualSale);

// GET /native/partners — Lista parceiros ativos para o dropdown do formulário manual
router.get('/partners', dashboardAuthMiddleware, async (req, res) => {
  try {
    const partners = await partnerRepository.findAllActive();
    return res.json({
      success: true,
      partners: partners.map(p => ({ partnerId: p.partnerId, name: p.name }))
    });
  } catch (err) {
    console.error('[Dashboard] Erro ao listar parceiros:', err);
    return res.status(500).json({ success: false, error: 'Erro ao listar parceiros.' });
  }
});

// POST /native/physical-tag-sale — Venda de tag física (Essencial / Cover) via dashboard
// Gera recibo por e-mail com número de pedido sequencial — não aciona funil WhatsApp.
router.post('/physical-tag-sale', dashboardAuthMiddleware, handlePhysicalTagSale);

// GET /native/sales-log — Histórico de vendas manuais: Assistência Digital + Tag Física
// Retorna as últimas N vendas de cada tipo para exibição no dashboard de vendas.
router.get('/sales-log', dashboardAuthMiddleware, requireRole('gestor'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const { prisma } = require('../../../config');
    let digital = [], physical = [];
    if (prisma) {
      const [sales, tagRows] = await Promise.all([
        prisma.sale.findMany({
          where: { saleId: { startsWith: 'MANUAL-' } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true, saleId: true, customerName: true, customerEmail: true,
            customerPhone: true, partnerId: true, status: true, createdAt: true
          }
        }),
        prisma.$queryRaw`
          SELECT id, "orderNumber", product, "customerName", "customerEmail",
                 quantity, "hasInsurance", "partnerId", "operatorEmail", "createdAt"
          FROM "PhysicalTagOrder"
          ORDER BY "createdAt" DESC
          LIMIT ${limit}
        `
      ]);
      digital = sales;
      physical = tagRows.map(r => ({ ...r, orderNumber: Number(r.orderNumber) }));
    }
    return res.json({ success: true, digital, physical });
  } catch (err) {
    console.error('[SalesLog] Erro:', err);
    return res.status(500).json({ success: false, error: 'Erro ao carregar histórico de vendas.' });
  }
});

// GET /native/integrations/now — Respostas salvas da integração NOW por venda.
router.get('/integrations/now', dashboardAuthMiddleware, requireRole('gestor'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const { prisma } = require('../../../config');
    if (!prisma) return res.json({ success: true, data: [] });

    const requests = await prisma.$queryRaw`
      SELECT r."saleId", s."saleId" AS "externalSaleId", r.responses, r.error_messages AS "errorMessages", r."updatedAt"
      FROM "Requests" r
      INNER JOIN "Sale" s ON s.id = r."saleId"
      WHERE r.integration = 'now'
      ORDER BY r."updatedAt" DESC
      LIMIT ${limit}
    `;

    return res.json({
      success: true,
      data: requests.flatMap((request) => {
        const now = request.responses?.now;
        if (Array.isArray(now?.proposals)) {
          const proposalRows = now.proposals.map((proposal) => ({
            saleId: request.saleId,
            externalSaleId: request.externalSaleId,
            cpv: proposal.cpv || now.cpv || null,
            baggageId: proposal.baggageId || proposal.nrproposta,
            nrproposta: proposal.nrproposta,
            propostaid: proposal.propostaid || null,
            cancelledAt: proposal.cancelledAt || null,
            responses: request.responses,
            errorMessages: request.errorMessages,
            updatedAt: request.updatedAt
          }));
          if (proposalRows.length) return proposalRows;
        }

        return now?.nrproposta || request.errorMessages?.length ? [{
          saleId: request.saleId,
          externalSaleId: request.externalSaleId,
          cpv: now?.cpv || null,
          baggageId: null,
          nrproposta: now?.nrproposta || null,
          propostaid: now?.propostaid || null,
          cancelledAt: now?.cancelledAt || null,
          responses: request.responses,
          errorMessages: request.errorMessages,
          updatedAt: request.updatedAt
        }] : [];
      })
    });
  } catch (err) {
    console.error('[IntegrationsNOW] Erro ao listar:', err);
    return res.status(500).json({ success: false, error: 'Erro ao carregar integrações NOW.' });
  }
});

// POST /native/integrations/now/:saleId/cancel — Cancela proposta NOW pelo propostaid salvo.
router.use('/integrations/now', nowIntegrationRoutes);

// ==================== AUTH DASHBOARD (login interno ExactBag) ====================
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await login(email, password);
    if (!result.success) {
      return res.status(401).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error('[DashboardAuth] Erro no login:', error);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.get('/auth/me', dashboardAuthMiddleware, (req, res) => {
  return res.status(200).json({
    success: true,
    user: { name: req.dashboardUser.name, email: req.dashboardUser.email, role: req.dashboardUser.role }
  });
});

router.post('/auth/logout', dashboardAuthMiddleware, (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (token) logout(token);
  return res.status(200).json({ success: true });
});

// ==================== ROTAS PROTEGIDAS (dashboard interno ExactBag) ====================
// Acesso exclusivo para gestor e atendente via JWT — partners NÃO têm acesso

// GET /native/registros — Lista paginada com filtros (gestor + atendente)
router.get('/registros', dashboardAuthMiddleware, controller.listRegistrations);

// GET /native/stats — Estatísticas (apenas gestor)
router.get('/stats', dashboardAuthMiddleware, requireRole('gestor'), controller.getStats);

// GET /native/registro/:id — Detalhe individual (gestor + atendente)
router.get('/registro/:id', dashboardAuthMiddleware, controller.getRegistration);

// GET /native/registro/:id/cpv — Preview HTML do CPV (gestor + atendente)
router.get('/registro/:id/cpv', dashboardAuthMiddleware, controller.getCpvPreview);

// GET /native/registro/:id/cpv/pdf — Download PDF do CPV (gestor + atendente)
router.get('/registro/:id/cpv/pdf', dashboardAuthMiddleware, controller.downloadCpvPdf);

// POST /native/registro/:id/resend — Re-enviar CPV por e-mail (apenas gestor)
router.post('/registro/:id/resend', dashboardAuthMiddleware, requireRole('gestor'), controller.resendEmail);

// POST /native/registro/:id/whatsapp — Re-enviar CPV por WhatsApp (apenas gestor)
router.post('/registro/:id/whatsapp', dashboardAuthMiddleware, requireRole('gestor'), controller.resendWhatsApp);

// DELETE /native/registro/:id — Excluir registro (apenas gestor)
router.delete('/registro/:id', dashboardAuthMiddleware, requireRole('gestor'), controller.deleteRegistration);

// ==================== GERENCIAMENTO DE USUÁRIOS (gestor only) ====================

// GET /native/users — Lista todos os usuários
router.get('/users', dashboardAuthMiddleware, requireRole('gestor'), async (req, res) => {
  try {
    const users = await listUsers();
    return res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error('[Users] Erro ao listar:', error);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// POST /native/users — Cria novo usuário
router.post('/users', dashboardAuthMiddleware, requireRole('gestor'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const result = await createUser({ name, email, password, role });
    if (!result.success) return res.status(400).json(result);
    return res.status(201).json(result);
  } catch (error) {
    console.error('[Users] Erro ao criar:', error);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// PUT /native/users/:id — Atualiza dados do usuário
router.put('/users/:id', dashboardAuthMiddleware, requireRole('gestor'), async (req, res) => {
  try {
    const { name, email, role } = req.body;
    const result = await updateUser(req.params.id, { name, email, role });
    if (!result.success) return res.status(400).json(result);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Users] Erro ao atualizar:', error);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// PATCH /native/users/:id/password — Altera senha
router.patch('/users/:id/password', dashboardAuthMiddleware, requireRole('gestor'), async (req, res) => {
  try {
    const { password } = req.body;
    const result = await changePassword(req.params.id, password);
    if (!result.success) return res.status(400).json(result);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Users] Erro ao alterar senha:', error);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// PATCH /native/users/:id/toggle — Ativa/desativa usuário
router.patch('/users/:id/toggle', dashboardAuthMiddleware, requireRole('gestor'), async (req, res) => {
  try {
    const result = await toggleUserActive(req.params.id);
    if (!result.success) return res.status(400).json(result);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Users] Erro ao desativar:', error);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

module.exports = router;
