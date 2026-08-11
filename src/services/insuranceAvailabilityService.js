/**
 * Insurance Availability Service
 *
 * Monta a resposta de disponibilidade de produtos ExactBag no formato
 * compatível com o endpoint `GET /api/v1/avail/insurance` da API Infotravel
 * (schema ApiInsuranceAvail).
 *
 * Uso: o parceiro (Infotravel/Infotera) consulta este método para listar os
 * produtos ExactBag disponíveis para uma pesquisa (datas + ocupação) e obter
 * nome, descrição, imagem, valor neto, valor de venda, coberturas e políticas.
 */

const crypto = require('crypto');
const { EXACTBAG_PROVIDER, PRODUCTS } = require('../config/insuranceProducts');

/**
 * Normaliza uma data para o formato ISO com offset de São Paulo (-03:00).
 * Aceita 'YYYY-MM-DD' ou Date; retorna string ISO ou null.
 */
function toIsoSaoPaulo(dateInput) {
  if (!dateInput) return null;
  const d = typeof dateInput === 'string' ? new Date(`${dateInput}T00:00:00-03:00`) : dateInput;
  if (Number.isNaN(d.getTime())) return null;
  // Mantém data à meia-noite no fuso -03:00
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T00:00:00-03:00`;
}

/**
 * Gera uma chave determinística por produto/pesquisa (base64), usada como
 * `keyDetail` para o parceiro referenciar o item na reserva.
 */
function buildKeyDetail(code, paxCount) {
  return Buffer.from(`${code}#${paxCount}`).toString('base64');
}

/**
 * Gera uma chave de sessão de disponibilidade (opaca), análoga ao `key`
 * retornado pela Infotravel.
 */
function buildSessionKey() {
  return crypto.randomBytes(10).toString('base64').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 19);
}

/**
 * Constrói a lista de passageiros (names) a partir da ocupação informada.
 * occupancy pode ser número (qtd adultos) ou array de strings "idade".
 */
function buildNames(occupancy) {
  const names = [];
  if (Array.isArray(occupancy) && occupancy.length > 0) {
    for (const raw of occupancy) {
      const age = parseInt(raw, 10);
      names.push({
        age: Number.isFinite(age) ? age : 30,
        type: Number.isFinite(age) && age < 18 ? 'CHD' : 'ADT',
        gender: 'UNDEFINED',
        isMain: false
      });
    }
  } else {
    const count = Number.isFinite(parseInt(occupancy, 10)) ? parseInt(occupancy, 10) : 1;
    for (let i = 0; i < Math.max(1, count); i += 1) {
      names.push({ age: 30, type: 'ADT', gender: 'UNDEFINED', isMain: false });
    }
  }
  return names;
}

/**
 * Monta um item de disponibilidade para um produto do catálogo.
 */
function buildAvailItem(product, params, names, sessionKey) {
  const paxCount = names.length;
  const startDate = toIsoSaoPaulo(params.start);
  const endDate = toIsoSaoPaulo(params.end);

  const insurance = {
    provider: 'ExactBag',
    key: sessionKey,
    code: product.code,
    name: product.name,
    startDate,
    endDate,
    description: product.description,
    image: product.image,
    unique: false,
    onRequest: false,
    providerDetail: { ...EXACTBAG_PROVIDER },
    coverages: product.coverages || [],
    usagePolicy: product.usagePolicy || [],
    keyDetail: buildKeyDetail(product.code, paxCount)
  };

  const fares = [
    {
      type: 'FARE',
      price: { currency: product.currency, amount: product.salePrice, exchange: 1.0 },
      priceSale: { currency: product.currency, amount: product.salePrice },
      priceNet: { currency: product.currency, amount: product.netPrice },
      discount: false
    }
  ];

  return {
    insurance,
    fares,
    names,
    cancellationPolicies: product.cancellationPolicy
  };
}

/**
 * Retorna a disponibilidade de produtos ExactBag.
 *
 * @param {Object} params
 * @param {string} [params.start]       Data início (YYYY-MM-DD)
 * @param {string} [params.end]         Data fim (YYYY-MM-DD)
 * @param {string[]|number} [params.occupancy] Ocupação (idades ou qtd de pax)
 * @param {string} [params.nationality] Código de nacionalidade (opcional)
 * @param {string} [params.code]        Filtra por código de produto (opcional)
 * @returns {{ insuranceAvail: Object[] }}
 */
function getInsuranceAvailability(params = {}) {
  const names = buildNames(params.occupancy);
  const sessionKey = buildSessionKey();

  let products = PRODUCTS;
  if (params.code) {
    products = products.filter((p) => p.code === String(params.code));
  }

  const insuranceAvail = products.map((product) =>
    buildAvailItem(product, params, names, sessionKey)
  );

  return { insuranceAvail };
}

module.exports = {
  getInsuranceAvailability,
  // exportado para testes
  _internal: { buildNames, toIsoSaoPaulo, buildKeyDetail }
};
