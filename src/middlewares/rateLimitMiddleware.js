// Middleware de Rate Limiting para proteção contra abuse
// Limita requisições por API Key (protegido) ou IP (público)

const rateLimit = require('express-rate-limit');
const ipKeyGenerator = rateLimit.ipKeyGenerator || ((ip) => ip);

// Endpoints públicos (limitados por IP)
const PUBLIC_ENDPOINTS = ['/health', '/cost'];

// Função auxiliar para extrair API Key do header
const getApiKeyFromRequest = (req) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7); // Remove "Bearer " prefix
  }
  return null;
};

// ============================================================================
// RATE LIMITERS por tipo de endpoint
// ============================================================================

// 1️⃣ Webhook de Vendas (protegido)
// 🚀 BOOST: Aumentar limite de 1.000 → 5.000 req/hora (permite crescimento)
// Uso: POST /webhooks/sales
const webhookLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5000, // Max 5000 requisições (era 1000)
  message: {
    success: false,
    error: 'Rate limit exceeded for webhook endpoint',
    message: 'Maximum 5000 webhook requests per hour per API Key',
    retryAfter: 'Check X-RateLimit-Reset header'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Rate limit por API Key para endpoints protegidos
  keyGenerator: (req) => {
    const apiKey = getApiKeyFromRequest(req);
    return apiKey || ipKeyGenerator(req.ip);
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      message: 'Maximum 5000 webhook requests per hour per API Key',
      retryAfter: req.rateLimit.resetTime ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000) : 3600,
      remaining: 0
    });
  }
});

// 2️⃣ Endpoint Público Geral (IP-based)
// Limite: 100 requisições por 15 minutos (por IP)
// Uso: /health, /cost, /downloads
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Max 100 requisições
  message: {
    success: false,
    error: 'Rate limit exceeded',
    message: 'Maximum 100 requests per 15 minutes per IP'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Usar IP diretamente - express-rate-limit maneja IPv6
  // keyGenerator será padrão (usa req.ip)
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      message: 'Maximum 100 requests per 15 minutes per IP',
      retryAfter: req.rateLimit.resetTime ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000) : 900
    });
  }
});

// 3️⃣ Limiter para qualquer rota não mapeada (fallback)
// Limite conservador: 50 requisições por minuto
const defaultLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 50,
  message: {
    success: false,
    error: 'Rate limit exceeded'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Rate limit por API Key se houver, senão por IP
  keyGenerator: (req) => {
    const apiKey = getApiKeyFromRequest(req);
    return apiKey || ipKeyGenerator(req.ip);
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      retryAfter: 60
    });
  }
});

// ============================================================================
// Middleware de logging para rate limiting (opcional)
// ============================================================================

const rateLimitLogger = (req, res, next) => {
  // Loga 429 DEPOIS que a resposta é enviada (statusCode só é setado pelo handler)
  if (process.env.NODE_ENV === 'production') {
    res.on('finish', () => {
      if (res.statusCode === 429) {
        const apiKey = getApiKeyFromRequest(req);
        const identifier = apiKey || req.ip;
        console.warn(`[RateLimit] 429 - ${req.method} ${req.path} - ${identifier}`);
      }
    });
  }
  next();
};

// ============================================================================
// Middleware de bypass para testes
// ============================================================================

const createTestLimiter = (originalLimiter) => {
  return (req, res, next) => {
    // Em ambiente de teste, pular rate limiting
    if (process.env.NODE_ENV === 'test') {
      return next();
    }
    return originalLimiter(req, res, next);
  };
};

// ============================================================================
// Exports
// ============================================================================

// 6️⃣ Privacy/LGPD endpoints — strict per-IP limit
const privacyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 requests per hour per IP
  message: {
    success: false,
    error: 'Rate limit exceeded',
    message: 'Maximum 10 privacy requests per hour per IP'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      message: 'Maximum 10 privacy requests per hour per IP',
      retryAfter: req.rateLimit.resetTime ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000) : 3600
    });
  }
});

module.exports = {
  webhookLimiter: createTestLimiter(webhookLimiter),
  publicLimiter: createTestLimiter(publicLimiter),
  defaultLimiter: createTestLimiter(defaultLimiter),
  privacyLimiter: createTestLimiter(privacyLimiter),
  rateLimitLogger,
  getApiKeyFromRequest
};
