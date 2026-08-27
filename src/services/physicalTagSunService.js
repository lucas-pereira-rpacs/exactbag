const { prisma } = require('../config');

const DEFAULT_CONFIG = {
  InsuredSunNumberStarting: '9110001',
  NonInsuredSunNumberStarting: 'S1010001',
  InsuredSunNumberLast: 'S1024290',
  NonInsuredSunNumberLast: '91208408'
};

const normalizeSun = (value) => {
  const sun = String(value || '').trim().toUpperCase();
  const insured = sun.startsWith('S');
  const numeric = insured ? sun.slice(1) : sun;
  return { value: sun, numeric, insured };
};

const readConfig = async () => {
  if (!prisma) return DEFAULT_CONFIG;
  const rows = await prisma.$queryRaw`SELECT * FROM "PhysicalTagFactory" WHERE id = 1 LIMIT 1`;
  return rows[0] || DEFAULT_CONFIG;
};

const endpointForType = (config, insured, kind) => {
  const values = Object.entries(config)
    .filter(([key]) => key !== 'id' && key.toLowerCase().includes(kind))
    .map(([, value]) => String(value || '').trim().toUpperCase())
    .filter(Boolean);
  return values.find((value) => insured ? value.startsWith('S') : !value.startsWith('S')) || null;
};

const validateSun = async (value) => {
  const normalized = normalizeSun(value);
  if (!normalized.numeric || !/^\d+$/.test(normalized.numeric)) {
    return { valid: false, insured: normalized.insured, value: normalized.value, error: 'SUN Inválido ou Vencido (mais de 1 ano). Verifique se preencheu corretamente.' };
  }

  const config = await readConfig();
  // Select endpoints by their actual prefix. This also tolerates the legacy
  // configuration column names whose default values are inverted.
  const starting = endpointForType(config, normalized.insured, 'starting');
  const ending = endpointForType(config, normalized.insured, 'last');
  const number = BigInt(normalized.numeric);
  const first = starting ? BigInt(normalizeSun(starting).numeric) : null;
  const last = ending ? BigInt(normalizeSun(ending).numeric) : null;

  if (first === null || last === null || number < first || number > last) {
    return { valid: false, insured: normalized.insured, value: normalized.value, error: 'SUN Inválido ou Vencido (mais de 1 ano). Verifique se preencheu corretamente.' };
  }

  return { valid: true, insured: normalized.insured, value: normalized.value, normalized: normalized.numeric };
};

module.exports = { normalizeSun, validateSun };
