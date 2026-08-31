// Middleware de Autenticação para API
// Valida API Key de parceiros e endpoints públicos

const partnerRepository = require('../repositories/partnerRepository');

// 🔴 P3: Cache de partners com TTL de 5 minutos
class PartnerCache {
  constructor() {
    this.cache = new Map();
    this.ttl = 5 * 60 * 1000; // 5 minutos
    this.maxSize = 1000; // Limite para evitar memory leak
  }

  get(apiKey) {
    const cached = this.cache.get(apiKey);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(apiKey);
      return null;
    }
    return cached.data;
  }

  set(apiKey, data) {
    // Evict entries expiradas quando atingir limite
    if (this.cache.size >= this.maxSize) {
      const now = Date.now();
      for (const [key, val] of this.cache) {
        if (now - val.timestamp > this.ttl) this.cache.delete(key);
      }
      // Se ainda cheio, remove o mais antigo
      if (this.cache.size >= this.maxSize) {
        const oldest = this.cache.keys().next().value;
        this.cache.delete(oldest);
      }
    }
    this.cache.set(apiKey, { data, timestamp: Date.now() });
  }

  clear() {
    this.cache.clear();
  }
}

const partnerCache = new PartnerCache();

// Endpoints públicos que NÃO precisam de autenticação
const PUBLIC_ENDPOINTS = [
  '/health',
  '/docs',
  '/api-docs',
  '/swagger',
  '/cost'
];

const isPublicEndpoint = (path) => {
  return PUBLIC_ENDPOINTS.some(endpoint => path.startsWith(endpoint));
};

const authMiddleware = async (req, res, next) => {
  // Permitir endpoints públicos
  if (isPublicEndpoint(req.path)) {
    return next();
  }

  try {
    // Extrair API Key do header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Missing Authorization header',
        message: 'API Key is required. Use: Authorization: Bearer {API_KEY}'
      });
    }

    // Formato esperado: "Bearer exactbag_xxxxxxxx"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        error: 'Invalid Authorization format',
        message: 'Use format: Bearer {API_KEY}'
      });
    }

    const apiKey = parts[1];

    // 🔴 P3: Verificar cache antes de buscar no BD
    let partner = partnerCache.get(apiKey);
    if (!partner) {
      partner = await partnerRepository.findByApiKey(apiKey);
      if (partner) {
        partnerCache.set(apiKey, partner);
      }
    }
    
    if (!partner) {
      return res.status(403).json({
        success: false,
        error: 'Invalid API Key',
        message: 'The provided API Key is not recognized'
      });
    }

    // Validar se parceiro está ativo
    if (!partner.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Partner inactive',
        message: 'This partner account is not active. Contact support.'
      });
    }

    // Validar rate limit
    const isRateLimitOK = await partnerRepository.checkRateLimit(apiKey);
    if (!isRateLimitOK) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message: 'You have exceeded your request limit. Please try again later.'
      });
    }

    // Persist request metadata sem bloquear a resposta principal.
    partnerRepository.updateRequestMetadata(apiKey).catch(err => {
      console.error('Error queuing metadata:', err);
    });

    // Armazenar info do parceiro no request para uso posterior
    req.partner = partner;
    req.partnerId = partner.partnerId;
    req.apiKey = apiKey;

    next();

  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Error authenticating request'
    });
  }
};

module.exports = authMiddleware;
