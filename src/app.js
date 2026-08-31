const express = require('express');
const cors = require('cors');
const compression = require('compression');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const webhooksRouter = require('./routes/webhooks');
const privacyRouter = require('./routes/privacy');
const reportsRouter = require('./routes/reports');
const publicFormRouter = require('./routes/publicForm');
const prettyPublicFormRouter = require('./routes/prettyPublicForm');
const nativeRegistrationRouter = require('./routes/nativeRegistrationRoutes');
const testRoutes = require('./routes/testRoutes');
const authMiddleware = require('./middlewares/authMiddleware');
const {
  webhookLimiter,
  publicLimiter,
  defaultLimiter,
  privacyLimiter,
  rateLimitLogger
} = require('./middlewares/rateLimitMiddleware');

const { engine } = require('express-handlebars');

const { prisma } = require('./config');
const { getJobCounts } = require('./jobs/agendaJobService');

const app = express();

app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));


if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const forceHttps = process.env.FORCE_HTTPS === 'true';
if (forceHttps) {
  app.use((req, res, next) => {
    const forwardedProto = req.get('x-forwarded-proto');
    if (forwardedProto && forwardedProto !== 'https') {
      return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
    }

    if (forwardedProto === 'https') {
      res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    return next();
  });
}

app.use(compression()); // ⚡ Enable gzip compression for all responses

// ============== SECURITY HEADERS ==============
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ============== REQUEST ID (correlation) ==============
const crypto = require('crypto');
app.use((req, _res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  next();
});

// CORS restrito a domínios autorizados
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['https://app.exactbag.com.br', 'https://exactbag.com.br'];
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : true,
  credentials: true
}));

// Body parser conservador global (100kb); rotas com upload usam limite próprio
// Exclui /native/registro que tem bodyParser próprio de 10mb (fotos base64)
app.use((req, res, next) => {
  if (req.path === '/native/registro' && req.method === 'POST') return next();
  bodyParser.json({ limit: '100kb' })(req, res, next);
});

// ============================================================================
// Rate Limiting & Security Middleware (antes de routes)
// ============================================================================
app.use(rateLimitLogger);
// Rate limiters aplicados PER-ROUTE (não global) para evitar double-counting

// Política de Privacidade (público - exigido pela Meta para ir ao vivo)
// Cached at module load — content is static
const PRIVACY_POLICY_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Política de Privacidade — ExactBag</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.7}
    h1{font-size:1.8rem;border-bottom:2px solid #0f62fe;padding-bottom:8px}
    h2{font-size:1.2rem;margin-top:32px;color:#0f62fe}
    a{color:#0f62fe}
    footer{margin-top:48px;font-size:0.85rem;color:#6b7280}
  </style>
</head>
<body>
  <h1>Política de Privacidade</h1>
  <p><strong>ExactBag</strong> — Última atualização: março de 2026</p>

  <h2>1. Quem somos</h2>
  <p>A ExactBag é uma empresa brasileira que oferece serviços de logística de bagagem para viajantes, operando pelo domínio <strong>exactbag.com.br</strong>.</p>

  <h2>2. Dados que coletamos</h2>
  <p>Coletamos apenas os dados necessários para prestação do serviço: nome completo, e-mail, número de telefone (WhatsApp) e informações de viagem fornecidas voluntariamente no momento da compra via parceiro.</p>

  <h2>3. Como usamos seus dados</h2>
  <ul>
    <li>Envio de confirmação de compra e instruções do serviço</li>
    <li>Envio do produto digital via e-mail e WhatsApp</li>
    <li>Comunicações operacionais relacionadas ao pedido</li>
  </ul>
  <p>Não utilizamos seus dados para fins de marketing sem consentimento explícito.</p>

  <h2>4. Compartilhamento de dados</h2>
  <p>Seus dados são compartilhados somente com o parceiro que realizou a venda e com prestadores de serviço essenciais (Resend para e-mail, Meta WhatsApp Business API para mensagens). Não vendemos dados a terceiros.</p>

  <h2>5. Retenção de dados</h2>
  <p>Os dados são mantidos pelo prazo necessário à execução do serviço e conforme obrigações legais brasileiras (LGPD — Lei nº 13.709/2018).</p>

  <h2>6. Seus direitos (LGPD)</h2>
  <p>Você tem direito a acessar, corrigir, exportar ou solicitar a exclusão dos seus dados. Para exercer qualquer um desses direitos, entre em contato:</p>
  <p>📧 <a href="mailto:privacidade@exactbag.com.br">privacidade@exactbag.com.br</a></p>

  <h2>7. Mensagens via WhatsApp</h2>
  <p>O envio de mensagens via WhatsApp é realizado exclusivamente para clientes que forneceram o número de telefone no momento da compra. Você pode solicitar a exclusão do seu número a qualquer momento pelo e-mail acima.</p>

  <h2>8. Contato</h2>
  <p>ExactBag — <a href="https://app.exactbag.com.br">app.exactbag.com.br</a><br/>
  E-mail: <a href="mailto:contato@exactbag.com.br">contato@exactbag.com.br</a></p>

  <footer>Esta política está em conformidade com a Lei Geral de Proteção de Dados (LGPD) do Brasil.</footer>
</body>
</html>`;

app.get('/privacy-policy', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(PRIVACY_POLICY_HTML);
});

// ============== HEALTH CHECK (com DB ping) ==============
app.get('/health', async (req, res) => {
  const { prisma } = require('./config');

  let dbStatus = 'disconnected';
  let agendaStatus = 'disconnected';
  let counts = { pending: 0, running: 0, retrying: 0, completed: 0, failed: 0, total: 0 };
  if (prisma) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch (_) {
      dbStatus = 'error';
    }
  }

  try {
    counts = await getJobCounts();
    agendaStatus = 'connected';
  } catch (_) {
    agendaStatus = 'error';
  }

  const healthy = dbStatus !== 'error' && agendaStatus !== 'error';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ExactBag API Online' : 'degraded',
    timestamp: new Date().toISOString(),
    db: dbStatus,
    agenda: agendaStatus,
    jobs: counts,
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    }
  });
});

// ============================================================================
// Swagger/OpenAPI Documentation (CDN-based — zero runtime RAM cost)
// ============================================================================
const openApiPath = path.join(__dirname, '..', 'openapi.json');
let swaggerDocument;

try {
  swaggerDocument = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
} catch (error) {
  console.warn(`[swagger] Failed to load OpenAPI from ${openApiPath}: ${error.message}`);
  swaggerDocument = {
    openapi: '3.0.0',
    info: { title: 'ExactBag Partner API', version: '1.0.0', description: 'OpenAPI temporariamente indisponivel.' },
    paths: {}
  };
}

const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>ExactBag API - Documentação</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>body{margin:0} .swagger-ui .topbar{display:none}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      docExpansion: 'list',
      defaultModelsExpandDepth: 1,
      persistAuthorization: true
    });
  </script>
</body>
</html>`;

app.get('/api-docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(SWAGGER_HTML);
});

app.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerDocument);
});

// Privacy & LGPD Routes (público - sem autenticação)
// Usuários devem poder exercer direitos LGPD sem autenticação
app.use('/api/privacy', privacyLimiter, privacyRouter);

// Link curto público para formulário pre-preenchido
app.use('/f', publicLimiter, publicFormRouter);
app.use('/form', publicLimiter, prettyPublicFormRouter);

// ============================================================================
// Native Registration Module — Rotas públicas (formulário do passageiro)
// Feature flag: NATIVE_REGISTRATION_ENABLED (default: true)
// ============================================================================
if (process.env.NATIVE_REGISTRATION_ENABLED !== 'false') {
  // Serve formulário mobile-first estático
  const nativePath = path.join(__dirname, 'views', 'dashboard');

  // Rotas explícitas para páginas HTML públicas
  app.get("/registrodebagagem", publicLimiter, async (req, res) => {
    const saleId = req.query.saleId;

    if (saleId) {
      const [sale] = await prisma.$queryRaw`SELECT * FROM "Sale" WHERE "saleId" = ${saleId} LIMIT 1`;
      const isExpired = sale?.expirationDate && new Date(sale.expirationDate) <= new Date();

      if (isExpired) {
        return res.status(410).render('link-expirado', { layout: false });
      }
      return res.render("registrodebagagem", {
        ...(sale || {}),
        roundTrip: sale?.roundTrip ?? true,
        outboundDateInput: sale?.outboundDate?.toISOString().slice(0, 10) || '',
        returnDateInput: sale?.returnDate?.toISOString().slice(0, 10) || '',
        layout: false,
      });
    }

    res.render("registrodebagagem", { roundTrip: true, layout: false });
  });

  app.get("/registrodetagfisica", publicLimiter, async (req, res) => {
    const saleId = req.query.saleId;
    if (saleId) {
      const [sale] = await prisma.$queryRaw`SELECT * FROM "Sale" WHERE "saleId" = ${saleId} LIMIT 1`;
      const isExpired = sale?.expirationDate && new Date(sale.expirationDate) <= new Date();
      if (isExpired) return res.status(410).render('link-expirado', { layout: false });
      return res.render('registrodetagfisica', {
        ...(sale || {}), roundTrip: sale?.roundTrip ?? true,
        outboundDateInput: sale?.outboundDate?.toISOString().slice(0, 10) || '',
        returnDateInput: sale?.returnDate?.toISOString().slice(0, 10) || '', layout: false
      });
    }
    return res.render('registrodetagfisica', { roundTrip: true, layout: false });
  });

  // Redirect antigo /native/form para nova URL
  app.get('/native/form', (req, res) => {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(301, '/registrodebagagem' + qs);
  });
  app.get('/native/dashboard', publicLimiter, (req, res) => {
    res.sendFile(path.join(nativePath, 'dashboard.html'));
  });

  // Arquivos estáticos (CSS, JS, imagens dentro de /public) — cache de 7 dias
  // Product assets are public. Handle this namespace explicitly and do not
  // fall through to the global API-key middleware when a file is missing.
  app.use('/native/assets', publicLimiter, express.static(path.join(nativePath, 'assets'), {
    maxAge: '7d',
    etag: true,
    lastModified: true,
    fallthrough: false
  }));

  app.use('/native', publicLimiter, express.static(nativePath, {
    maxAge: '7d',
    etag: true,
    lastModified: true
  }));

  // Todas as rotas do módulo nativo (auth, formulário, dashboard)
  // O router interno cuida de auth via dashboardAuthMiddleware
  app.use('/native', defaultLimiter, nativeRegistrationRouter);
}

// ============== TEST ENDPOINT (DEVELOPMENT ONLY) ==============
if (process.env.NODE_ENV !== 'production') {
  app.use('/test', publicLimiter, testRoutes);
} else {
  // Em produção, retornar 404 para rotas de teste
  app.use('/test', (req, res) => res.status(404).json({ error: 'Not found' }));
}



// Aplicar middleware de autenticação para todas rotas protegidas
app.use(authMiddleware);

// Rotas protegidas (exigem API Key)
// Rate limit específico para webhooks
app.use('/webhooks', webhookLimiter, webhooksRouter);

// Rotas de disponibilidade de produtos (Insurance Availability — formato Infotravel)
// Rate limit padrão por API Key
app.use('/avail', defaultLimiter, require('./routes/avail'));

// ============================================================================
// Native Registration — Rotas protegidas (removido - agora todas montadas antes do authMiddleware)
// ============================================================================

// Rotas de jobs de processamento (monitorização)
// Rate limit padrão por API Key
app.use('/jobs', defaultLimiter, require('./routes/jobs'));

// Rotas de relatórios (auth protected)
// Rate limit padrão por API Key
app.use('/api/reports', defaultLimiter, reportsRouter);

// Rotas de custos (público)
app.use('/cost', publicLimiter, require('./routes/cost'));

// ============================================================================
// Global Error Handler — captura erros não tratados em rotas
// ============================================================================
app.use((err, req, res, _next) => {
  console.error(`[ErrorHandler] ${req.method} ${req.path}:`, err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

module.exports = app;
