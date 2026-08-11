// Gateway para Formulários - Abstrai JotForms
// O parceiro nunca sabe que usamos JotForms

const axios = require('axios');
const http = require('http');
const https = require('https');

// ---------------------------------------------------------------------------
// Configuração via variáveis de ambiente
//
// Vars obrigatórias para modo real:
//   JOTFORM_API_KEY   → chave de API do JotForms (My Account → API)
//   JOTFORM_FORM_ID   → ID numérico do formulário existente
//
// Mapeamento de campos (IDs numéricos dos campos do seu formulário):
//   JOTFORM_FIELD_NAME    → padrão: 3
//   JOTFORM_FIELD_EMAIL   → padrão: 4
//   JOTFORM_FIELD_PHONE   → padrão: 5
//   JOTFORM_FIELD_ROUND   → padrão: 6
//   JOTFORM_FIELD_OUTDATE → padrão: 7
//   JOTFORM_FIELD_RETDATE → padrão: 8
//   JOTFORM_FIELD_SALEID  → padrão: 9  (campo oculto)
//
// Como descobrir os IDs: acesse
//   https://api.jotform.com/form/{SEU_FORM_ID}/questions?apiKey={SUA_API_KEY}
//
// Se JOTFORM_API_KEY não estiver definida o gateway opera em modo mock
// (comportamento anterior) e não faz chamadas externas.
// ---------------------------------------------------------------------------

const JOTFORM_API_KEY = process.env.JOTFORM_API_KEY || '';
const JOTFORM_FORM_ID = process.env.JOTFORM_FORM_ID || '';
const JOTFORM_API_BASE = 'https://api.jotform.com';
const JOTFORM_FORM_BASE = 'https://form.jotform.com';
const JOTFORM_FETCH_FIELD_NAMES = process.env.JOTFORM_FETCH_FIELD_NAMES === 'true';
const FIELD_CACHE_TTL_MS = Number(process.env.JOTFORM_FIELD_CACHE_TTL_MS || (24 * 60 * 60 * 1000));

// IDs e nomes dos campos no seu formulário JotForms real
const FIELD = {
  name: {
    id: process.env.JOTFORM_FIELD_NAME || '3',
    name: process.env.JOTFORM_FIELD_NAME_KEY || 'customerName'
  },
  email: {
    id: process.env.JOTFORM_FIELD_EMAIL || '4',
    name: process.env.JOTFORM_FIELD_EMAIL_KEY || 'customerEmail'
  },
  phone: {
    id: process.env.JOTFORM_FIELD_PHONE || '5',
    name: process.env.JOTFORM_FIELD_PHONE_KEY || 'customerPhone'
  },
  roundTrip: {
    id: process.env.JOTFORM_FIELD_ROUND || '6',
    name: process.env.JOTFORM_FIELD_ROUND_KEY || 'roundTrip'
  },
  outDate: {
    id: process.env.JOTFORM_FIELD_OUTDATE || '7',
    name: process.env.JOTFORM_FIELD_OUTDATE_KEY || 'outboundDate'
  },
  retDate: {
    id: process.env.JOTFORM_FIELD_RETDATE || '8',
    name: process.env.JOTFORM_FIELD_RETDATE_KEY || 'returnDate'
  },
  saleId: {
    id: process.env.JOTFORM_FIELD_SALEID || '9',
    name: process.env.JOTFORM_FIELD_SALEID_KEY || 'saleId'
  },
  baggageQty: {
    id: process.env.JOTFORM_FIELD_BAGGAGEQTY || '218',
    name: process.env.JOTFORM_FIELD_BAGGAGEQTY_KEY || 'quantidadeDe'
  }
};

const isConfigured = () => JOTFORM_API_KEY && JOTFORM_API_KEY !== 'your_jotform_api_key' && JOTFORM_FORM_ID;

class FormGateway {
  constructor() {
    this.fieldsCache = {
      [String(FIELD.name.id)]: this._sanitizeFieldName(FIELD.name.name),
      [String(FIELD.email.id)]: this._sanitizeFieldName(FIELD.email.name),
      [String(FIELD.phone.id)]: this._sanitizeFieldName(FIELD.phone.name),
      [String(FIELD.roundTrip.id)]: this._sanitizeFieldName(FIELD.roundTrip.name),
      [String(FIELD.outDate.id)]: this._sanitizeFieldName(FIELD.outDate.name),
      [String(FIELD.retDate.id)]: this._sanitizeFieldName(FIELD.retDate.name),
      [String(FIELD.saleId.id)]: this._sanitizeFieldName(FIELD.saleId.name)
    };
    this.fieldsCacheAt = Date.now();
    this.fieldsFetchInFlight = null;
    this.apiClient = axios.create({
      baseURL: JOTFORM_API_BASE,
      headers: { 'APIKEY': JOTFORM_API_KEY },
      timeout: 10000,
      httpAgent:  new http.Agent({ keepAlive: true, maxSockets: 50 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 })
    });
  }

  _sanitizeFieldName(name) {
    return String(name || '')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .trim();
  }

  async _getFieldNameMap() {
    const now = Date.now();

    if (this.fieldsCache && (now - this.fieldsCacheAt) < FIELD_CACHE_TTL_MS) {
      return this.fieldsCache;
    }

    if (!isConfigured() || !JOTFORM_FETCH_FIELD_NAMES) {
      return this.fieldsCache || {};
    }

    try {
      if (!this.fieldsFetchInFlight) {
        this.fieldsFetchInFlight = this.getFormFields();
      }
      const fields = await this.fieldsFetchInFlight;
      const map = {};
      fields.forEach((f) => {
        map[String(f.id)] = this._sanitizeFieldName(f.name);
      });
      this.fieldsCache = { ...(this.fieldsCache || {}), ...map };
      this.fieldsCacheAt = now;
      return this.fieldsCache;
    } catch (_error) {
      return this.fieldsCache || {};
    } finally {
      this.fieldsFetchInFlight = null;
    }
  }

  // -------------------------------------------------------------------------
  // Gera link de formulário pré-preenchido.
  //
  // JotForms suporta pré-preenchimento via query string:
  //   https://form.jotform.com/{formId}?q{fieldId}_{fieldName}[]=valor
  //
  // Não é necessária chamada à API para isso — apenas montar a URL.
  // -------------------------------------------------------------------------
  async createPrefilledSubmission(customerData) {
    console.log('[FormGateway] Criando submissão pré-preenchida para:', customerData.name);

    const customerName = customerData.name || customerData.customerName || '';
    const customerEmail = customerData.email || customerData.customerEmail || '';
    const customerPhone = customerData.phone || customerData.customerPhone || '';
    const normalizeDate = (value) => {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toISOString().slice(0, 10);
    };
    const formId = JOTFORM_FORM_ID;
    if (!formId) {
      throw new Error('JOTFORM_FORM_ID não configurado. Configure a variável de ambiente.');
    }
    const fieldNameMap = await this._getFieldNameMap();

    // Monta parâmetros de pré-preenchimento no formato que JotForms espera.
    // JotForm prefill usa apenas o nome do campo (sem prefixo q{id}_).
    // Campos fullname usam subfields [first]/[last].
    // Campos datetime usam subfields [day]/[month]/[year].
    const params = new URLSearchParams();

    // fullname: split into first/last
    const nameParts = customerName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const nameKey = fieldNameMap[String(FIELD.name.id)] || FIELD.name.name;
    if (firstName) params.append(`${nameKey}[first]`, firstName);
    if (lastName)  params.append(`${nameKey}[last]`, lastName);

    // email: simple field
    const emailKey = fieldNameMap[String(FIELD.email.id)] || FIELD.email.name;
    if (customerEmail) params.append(emailKey, customerEmail);

    // phone: widget field (simple value)
    const phoneKey = fieldNameMap[String(FIELD.phone.id)] || FIELD.phone.name;
    if (customerPhone) params.append(phoneKey, customerPhone);

    // datetime: [day]/[month]/[year] subfields
    const appendDate = (fieldId, fallbackName, dateValue) => {
      if (!dateValue || !fieldId) return;
      const normalized = normalizeDate(dateValue);
      if (!normalized) return;
      const [year, month, day] = normalized.split('-');
      if (!year || !month || !day) return;
      const key = fieldNameMap[String(fieldId)] || fallbackName;
      params.append(`${key}[month]`, month);
      params.append(`${key}[day]`, day);
      params.append(`${key}[year]`, year);
    };

    appendDate(FIELD.outDate.id, FIELD.outDate.name, customerData.outboundDate);
    appendDate(FIELD.retDate.id, FIELD.retDate.name, customerData.returnDate);

    // baggageQty: simple number field
    const baggageQty = customerData.baggageQty;
    if (baggageQty) {
      const bqKey = fieldNameMap[String(FIELD.baggageQty.id)] || FIELD.baggageQty.name;
      params.append(bqKey, String(baggageQty));
    }

    // JotForm requires literal brackets — URLSearchParams encodes them as %5B/%5D
    const qs = params.toString().replace(/%5B/gi, '[').replace(/%5D/gi, ']');
    const formLink = `${JOTFORM_FORM_BASE}/${formId}?${qs}`;

    // ID local para rastrear antes do JotForms devolver o real via webhook
    const submissionId = `LOCAL-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    console.log('[FormGateway] Link gerado:', submissionId);

    return { submissionId, formLink, status: 'created' };
  }

  // -------------------------------------------------------------------------
  // Busca status de uma submissão via API real (ou mock se não configurada)
  // -------------------------------------------------------------------------
  async getSubmissionStatus(submissionId) {
    console.log('[FormGateway] Verificando status da submissão:', submissionId);

    if (!isConfigured() || submissionId.startsWith('LOCAL-')) {
      // Modo mock: retorna status fixo
      return { submissionId, status: 'pending', completedAt: null };
    }

    try {
      const { data } = await this.apiClient.get(`/submission/${submissionId}`);
      // JotForms retorna status no campo data.content.status
      const raw = data?.content?.status || 'ACTIVE';
      const status = raw === 'ACTIVE' ? 'pending' : 'completed';
      const completedAt = status === 'completed' ? new Date(data.content.updated_at * 1000) : null;

      return { submissionId, status, completedAt };
    } catch (error) {
      console.error('[FormGateway] Erro ao buscar status:', error.response?.data || error.message);
      throw new Error('Erro ao verificar status do formulário');
    }
  }

  // -------------------------------------------------------------------------
  // Busca dados completos de uma submissão via API real
  // -------------------------------------------------------------------------
  async getSubmissionData(submissionId) {
    console.log('[FormGateway] Buscando dados da submissão:', submissionId);

    if (!isConfigured() || submissionId.startsWith('LOCAL-')) {
      // Modo mock
      return {
        submissionId,
        customerData: {
          confirmedName:  'João Silva (mock)',
          confirmedEmail: 'joao@exemplo.com',
          confirmedPhone: '+5511999999999',
          tripDetails: {
            roundTrip:    true,
            outboundDate: '2026-04-15',
            returnDate:   '2026-04-22',
            bags: []
          }
        },
        completedAt: new Date(),
        status: 'completed'
      };
    }

    try {
      const { data } = await this.apiClient.get(`/submission/${submissionId}`);
      const answers = data?.content?.answers || {};

      // Extrai os campos pelo ID configurado
      const get = (fieldId) => answers[fieldId]?.answer || '';

      return {
        submissionId,
        customerData: {
          confirmedName:  get(FIELD.name.id),
          confirmedEmail: get(FIELD.email.id),
          confirmedPhone: get(FIELD.phone.id),
          tripDetails: {
            roundTrip:    get(FIELD.roundTrip.id) === 'Sim',
            outboundDate: get(FIELD.outDate.id),
            returnDate:   get(FIELD.retDate.id),
            // O cliente preenche as bagagens no própio form; campos extras ficam no answers raw
            bags: Object.values(answers).filter(a => a?.name?.toLowerCase().includes('bag') || a?.name?.toLowerCase().includes('mala'))
          }
        },
        completedAt: data.content.updated_at ? new Date(data.content.updated_at * 1000) : new Date(),
        status: 'completed',
        rawAnswers: answers
      };
    } catch (error) {
      console.error('[FormGateway] Erro ao buscar dados:', error.response?.data || error.message);
      throw new Error('Erro ao recuperar dados do formulário');
    }
  }

  // -------------------------------------------------------------------------
  // Lista os campos do formulário — útil para descobrir os IDs dos campos
  // Uso: GET /api/jotforms/fields (chame uma vez para configurar os IDs acima)
  // -------------------------------------------------------------------------
  async getFormFields() {
    if (!isConfigured()) {
      throw new Error('JOTFORM_API_KEY e JOTFORM_FORM_ID são necessários');
    }

    const { data } = await this.apiClient.get(`/form/${JOTFORM_FORM_ID}/questions`);
    return Object.values(data?.content || {}).map(q => ({
      id:    q.qid,
      name:  q.name,
      type:  q.type,
      label: q.text || q.name
    }));
  }
}

module.exports = new FormGateway();