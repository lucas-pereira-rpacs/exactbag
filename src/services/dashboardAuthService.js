// Serviço de autenticação para usuários internos do dashboard ExactBag
// Gestor = acesso total | Atendente = acesso limitado (consulta + download CPV)
// Usuários armazenados em banco (tabela DashboardUser) via Prisma
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config');

// ===== JWT config =====
const JWT_SECRET = process.env.DASHBOARD_JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES_IN = process.env.DASHBOARD_JWT_EXPIRES || '8h';

if (!process.env.DASHBOARD_JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[DashboardAuth] ⚠️ DASHBOARD_JWT_SECRET não definido — gerado aleatoriamente (sessões perdidas no restart)');
}

// ===== Blacklist de tokens (logout) =====
const revokedTokens = new Set();
const REVOKED_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1h
setInterval(() => {
  if (revokedTokens.size > 10000) revokedTokens.clear();
}, REVOKED_CLEANUP_INTERVAL).unref();

const VALID_ROLES = ['gestor', 'atendente', 'admin'];

/**
 * Login com email + senha → retorna JWT token + dados do usuário
 */
const login = async (email, password) => {
  if (!email || !password) {
    return { success: false, error: 'E-mail e senha são obrigatórios' };
  }

  let user = null;
  if (prisma) {
    user = await prisma.dashboardUser.findFirst({
      where: { email: email.toLowerCase().trim(), isActive: true }
    });
  }

  if (!user) {
    // Timing-safe: faz hash mesmo sem user para evitar timing attack
    await bcrypt.hash(password, 12);
    return { success: false, error: 'E-mail ou senha inválidos' };
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    return { success: false, error: 'E-mail ou senha inválidos' };
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, issuer: 'exactbag-dashboard' }
  );

  return {
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  };
};

/**
 * Valida JWT token e retorna dados do payload
 */
const validateToken = (token) => {
  if (!token) return null;
  if (revokedTokens.has(token)) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer: 'exactbag-dashboard' });
    return {
      userId: payload.userId,
      name: payload.name,
      email: payload.email,
      role: payload.role
    };
  } catch (_err) {
    return null;
  }
};

/**
 * Logout — revoga JWT token
 */
const logout = (token) => {
  if (token) revokedTokens.add(token);
};

/**
 * Middleware: aceita APENAS JWT de dashboard (gestor/atendente ExactBag)
 */
const dashboardAuthMiddleware = (req, res, next) => {
  let token = null;
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ success: false, error: 'Formato: Bearer {token}' });
    }
    token = parts[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authorization header obrigatório' });
  }

  const session = validateToken(token);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Sessão expirada. Faça login novamente.' });
  }

  req.dashboardUser = session;
  return next();
};

/**
 * Middleware: restringe a roles do dashboard (gestor, atendente)
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.dashboardUser) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    if (roles.includes(req.dashboardUser.role)) return next();
    return res.status(403).json({ success: false, error: 'Sem permissão para esta ação' });
  };
};

// ============================================================================
// CRUD de Usuários (apenas gestor)
// ============================================================================

/**
 * Lista todos os usuários do dashboard
 */
const listUsers = async () => {
  if (!prisma) return [];
  const users = await prisma.dashboardUser.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'asc' }
  });
  return users;
};

/**
 * Busca usuário por ID
 */
const getUserById = async (id) => {
  if (!prisma) return null;
  return prisma.dashboardUser.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true }
  });
};

/**
 * Cria novo usuário
 */
const createUser = async ({ name, email, password, role }) => {
  if (!prisma) return { success: false, error: 'Banco de dados indisponível' };
  if (!name || !email || !password) {
    return { success: false, error: 'Nome, e-mail e senha são obrigatórios' };
  }
  if (password.length < 6) {
    return { success: false, error: 'Senha deve ter no mínimo 6 caracteres' };
  }
  if (!VALID_ROLES.includes(role)) {
    return { success: false, error: 'Role inválida. Use: gestor ou atendente' };
  }

  const emailNorm = email.toLowerCase().trim();
  const existing = await prisma.dashboardUser.findUnique({ where: { email: emailNorm } });
  if (existing) {
    return { success: false, error: 'E-mail já cadastrado' };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.dashboardUser.create({
    data: { name: name.trim(), email: emailNorm, passwordHash, role, isActive: true },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true }
  });

  return { success: true, user };
};

/**
 * Atualiza nome, email e/ou role de um usuário
 */
const updateUser = async (id, { name, email, role }) => {
  if (!prisma) return { success: false, error: 'Banco de dados indisponível' };

  const existing = await prisma.dashboardUser.findUnique({ where: { id } });
  if (!existing) return { success: false, error: 'Usuário não encontrado' };

  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) return { success: false, error: 'Role inválida' };
    data.role = role;
  }
  if (email !== undefined) {
    const emailNorm = email.toLowerCase().trim();
    if (emailNorm !== existing.email) {
      const dup = await prisma.dashboardUser.findUnique({ where: { email: emailNorm } });
      if (dup) return { success: false, error: 'E-mail já cadastrado por outro usuário' };
      data.email = emailNorm;
    }
  }

  if (Object.keys(data).length === 0) {
    return { success: false, error: 'Nenhum campo para atualizar' };
  }

  const user = await prisma.dashboardUser.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true }
  });

  return { success: true, user };
};

/**
 * Altera senha de um usuário
 */
const changePassword = async (id, newPassword) => {
  if (!prisma) return { success: false, error: 'Banco de dados indisponível' };
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'Senha deve ter no mínimo 6 caracteres' };
  }

  const existing = await prisma.dashboardUser.findUnique({ where: { id } });
  if (!existing) return { success: false, error: 'Usuário não encontrado' };

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.dashboardUser.update({ where: { id }, data: { passwordHash } });

  return { success: true };
};

/**
 * Ativa/desativa usuário
 */
const toggleUserActive = async (id) => {
  if (!prisma) return { success: false, error: 'Banco de dados indisponível' };

  const existing = await prisma.dashboardUser.findUnique({ where: { id } });
  if (!existing) return { success: false, error: 'Usuário não encontrado' };

  const user = await prisma.dashboardUser.update({
    where: { id },
    data: { isActive: !existing.isActive },
    select: { id: true, name: true, email: true, role: true, isActive: true }
  });

  return { success: true, user };
};

module.exports = {
  login,
  validateToken,
  logout,
  dashboardAuthMiddleware,
  requireRole,
  listUsers,
  getUserById,
  createUser,
  updateUser,
  changePassword,
  toggleUserActive
};
