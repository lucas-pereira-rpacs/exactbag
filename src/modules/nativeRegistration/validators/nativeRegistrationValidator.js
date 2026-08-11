// Validações do módulo de Registro Nativo (substitui JotForm)
const xss = require('xss');

const CPF_REGEX = /^\d{11}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?\d{10,15}$/;
const TRANSPORT_TYPES = ['aereo', 'maritimo', 'terrestre'];

const sanitize = (value) => {
  if (typeof value !== 'string') return value;
  return xss(value.trim());
};

const cleanPhone = (phone) => {
  if (!phone) return '';
  return String(phone).replace(/[\s()\-\.]/g, '');
};

const toBoolean = (value) => (
  value === true || value === 1 || ['true', '1', 'yes', 'sim'].includes(String(value).toLowerCase())
);

const validateCpf = (cpf) => {
  if (!cpf) return { valid: false, error: 'CPF é obrigatório' };
  const clean = cpf.replace(/\D/g, '');
  if (!CPF_REGEX.test(clean)) return { valid: false, error: 'CPF inválido (11 dígitos)' };

  // Rejeita CPFs com todos os digitos iguais
  if (/^(\d)\1{10}$/.test(clean)) return { valid: false, error: 'CPF inválido' };

  // Validação matemática dos dígitos verificadores
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean[i]) * (10 - i);
  let rem = (sum * 10) % 11;
  if (rem === 10) rem = 0;
  if (rem !== parseInt(clean[9])) return { valid: false, error: 'CPF inválido' };

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean[i]) * (11 - i);
  rem = (sum * 10) % 11;
  if (rem === 10) rem = 0;
  if (rem !== parseInt(clean[10])) return { valid: false, error: 'CPF inválido' };

  return { valid: true, value: clean };
};

const validateRegistrationInput = (body) => {
  const errors = [];

  // Required fields
  if (!body.passengerName || String(body.passengerName).trim().length < 3) {
    errors.push({ field: 'passengerName', message: 'Nome completo é obrigatório (mín. 3 caracteres)' });
  }

  if (!body.passengerEmail || !EMAIL_REGEX.test(body.passengerEmail)) {
    errors.push({ field: 'passengerEmail', message: 'E-mail inválido' });
  }

  if (body.emailConfirmation && body.passengerEmail !== body.emailConfirmation) {
    errors.push({ field: 'emailConfirmation', message: 'Confirmação de e-mail não confere' });
  }

  const phone = cleanPhone(body.passengerPhone);
  if (!phone || !PHONE_REGEX.test(phone)) {
    errors.push({ field: 'passengerPhone', message: 'Telefone inválido (10-15 dígitos)' });
  }

  // CPF - obrigatório no serviço digital
  if (body.passengerCpf !== undefined) {
    const cpfResult = validateCpf(body.passengerCpf);
    if (!cpfResult.valid) {
      errors.push({ field: 'passengerCpf', message: cpfResult.error });
    }
  }

  if (!body.origin || String(body.origin).trim().length < 2) {
    errors.push({ field: 'origin', message: 'Origem da viagem é obrigatória' });
  }

  if (!body.destination || String(body.destination).trim().length < 2) {
    errors.push({ field: 'destination', message: 'Destino da viagem é obrigatório' });
  }

  if (!body.airline || String(body.airline).trim().length < 2) {
    errors.push({ field: 'airline', message: 'Companhia aérea é obrigatória' });
  }

  if (body.transportType && !TRANSPORT_TYPES.includes(body.transportType)) {
    errors.push({ field: 'transportType', message: 'Tipo de transporte inválido' });
  }

  if (!body.termsAccepted) {
    errors.push({ field: 'termsAccepted', message: 'Aceite dos termos é obrigatório' });
  }

  const baggageQty = parseInt(body.baggageQty);
  if (isNaN(baggageQty) || baggageQty < 1 || baggageQty > 10) {
    errors.push({ field: 'baggageQty', message: 'Quantidade de bagagens deve ser entre 1 e 10' });
  }

  // Validate dates
  if (body.outboundDate) {
    const d = new Date(body.outboundDate);
    if (isNaN(d.getTime())) {
      errors.push({ field: 'outboundDate', message: 'Data de ida inválida' });
    }
  }

  if (body.returnDate) {
    const d = new Date(body.returnDate);
    if (isNaN(d.getTime())) {
      errors.push({ field: 'returnDate', message: 'Data de volta inválida' });
    }
  }

  // Validate baggage items if provided
  if (body.baggageItems && Array.isArray(body.baggageItems)) {
    body.baggageItems.forEach((item, idx) => {
      if (item.imageData && typeof item.imageData === 'string') {
        // Max 5MB base64
        if (item.imageData.length > 7_000_000) {
          errors.push({ field: `baggageItems[${idx}].imageData`, message: 'Imagem muito grande (máx. 5MB)' });
        }
      }
      if (item.imageData2 && typeof item.imageData2 === 'string') {
        if (item.imageData2.length > 7_000_000) {
          errors.push({ field: `baggageItems[${idx}].imageData2`, message: 'Segunda imagem muito grande (máx. 5MB)' });
        }
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitizeInput(body) : null
  };
};

const sanitizeInput = (body) => {
  const phone = cleanPhone(body.passengerPhone);
  const cpfClean = body.passengerCpf ? body.passengerCpf.replace(/\D/g, '') : null;

  return {
    passengerName: sanitize(body.passengerName),
    passengerCpf: cpfClean,
    passengerEmail: sanitize(body.passengerEmail).toLowerCase(),
    passengerPhone: phone,
    baggageQty: parseInt(body.baggageQty) || 1,
    transportType: body.transportType || 'aereo',
    origin: sanitize(body.origin),
    destination: sanitize(body.destination),
    airline: body.airline ? sanitize(body.airline) : null,
    outboundDate: body.outboundDate ? new Date(body.outboundDate) : null,
    returnDate: body.returnDate ? new Date(body.returnDate) : null,
    hasGpsTracker: !!body.hasGpsTracker,
    hasInsurance: toBoolean(body.hasInsurance),
    termsAccepted: true,
    termsAcceptedAt: new Date(),
    partnerId: body.partnerId || null,
    saleId: body.saleId || null,
    baggageItems: (body.baggageItems || []).map((item) => ({
      bagType: item.bagType ? sanitize(item.bagType) : null,
      color: item.color ? sanitize(item.color) : null,
      brand: item.brand ? sanitize(item.brand) : null,
      identifierTag: item.identifierTag ? sanitize(item.identifierTag) : null,
      imageData: item.imageData || null,
      imageData2: item.imageData2 || null
    }))
  };
};

module.exports = {
  validateRegistrationInput,
  validateCpf,
  sanitize,
  cleanPhone
};
