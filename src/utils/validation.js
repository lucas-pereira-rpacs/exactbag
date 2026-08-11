const xss = require('xss');

/**
 * RFC 5322 Email Validation (Simplified but more robust)
 * @param {string} email - Email to validate
 * @returns {boolean}
 */
const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    
    // Check length constraints (RFC 5321)
    if (email.length > 254) return false;
    
    // RFC 5322 compliant regex (simplified)
    const rfc5322Regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!rfc5322Regex.test(email)) return false;
    
    // Additional checks
    const [localPart, domain] = email.split('@');
    if (!localPart || !domain) return false;
    if (localPart.length > 64) return false;
    if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
    if (localPart.includes('..')) return false;
    if (domain.startsWith('-') || domain.endsWith('-')) return false;
    if (!domain.includes('.')) return false;
    
    return true;
};

/**
 * Sanitize phone number (extract only digits)
 * @param {string} phone - Phone number to sanitize
 * @returns {string} - Sanitized phone (digits only)
 */
const sanitizePhone = (phone) => {
    if (!phone || typeof phone !== 'string') return '';
    // Remove all non-digit characters
    return phone.replace(/\D/g, '');
};

/**
 * Validate phone number (at least 10 digits)
 * @param {string} phone - Phone to validate
 * @returns {boolean}
 */
const isValidPhone = (phone) => {
    const sanitized = sanitizePhone(phone);
    // Allow 10+ digits (E.164 format: +1 to +999 country codes)
    return sanitized.length >= 10 && sanitized.length <= 15;
};

/**
 * Sanitize string to prevent XSS
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
const sanitizeString = (str) => {
    if (!str || typeof str !== 'string') return '';
    // Remove XSS threats
    return xss(str, {
        whiteList: {},
        stripIgnoredTag: true,
    }).trim();
};

/**
 * Sanitize and validate customer name
 * @param {string} name - Name to sanitize
 * @returns {object} - { valid, value, error }
 */
const validateCustomerName = (name) => {
    if (!name || typeof name !== 'string') {
        return { valid: false, value: '', error: 'Customer name is required' };
    }
    
    const sanitized = sanitizeString(name);
    
    if (sanitized.length < 2) {
        return { valid: false, value: '', error: 'Customer name must be at least 2 characters' };
    }
    
    if (sanitized.length > 120) {
        return { valid: false, value: '', error: 'Customer name must not exceed 120 characters' };
    }
    
    // Name should contain only letters, spaces, hyphens, and apostrophes
    if (!/^[a-zA-Z\s\-'àáâãäåèéêëìíîïòóôõöùúûüýÿñçß]+$/.test(sanitized)) {
        return { valid: false, value: '', error: 'Customer name contains invalid characters' };
    }
    
    return { valid: true, value: sanitized, error: null };
};

/**
 * Validate and sanitize customer email
 * @param {string} email - Email to validate
 * @returns {object} - { valid, value, error }
 */
const validateCustomerEmail = (email) => {
    if (!email || typeof email !== 'string') {
        return { valid: false, value: '', error: 'Customer email is required' };
    }
    
    const sanitized = sanitizeString(email.toLowerCase());
    
    if (!isValidEmail(sanitized)) {
        return { valid: false, value: '', error: 'Invalid email format' };
    }
    
    return { valid: true, value: sanitized, error: null };
};

/**
 * Validate and sanitize customer phone
 * @param {string} phone - Phone to validate
 * @returns {object} - { valid, value, error }
 */
const validateCustomerPhone = (phone) => {
    if (!phone || typeof phone !== 'string') {
        return { valid: false, value: '', error: 'Customer phone is required' };
    }
    
    const sanitized = sanitizePhone(phone);
    
    if (!isValidPhone(sanitized)) {
        return { 
            valid: false, 
            value: '', 
            error: 'Phone must contain 10-15 digits' 
        };
    }
    
    return { valid: true, value: sanitized, error: null };
};

/**
 * NEW: Main validation function with sanitization
 * @param {object} data - Raw input data
 * @returns {object} - { valid, data: {...sanitized}, errors: [...] }
 */
const validateAndSanitizePartnerSale = (data) => {
    const errors = [];
    const sanitizedData = {};

    // Validate customer name
    const nameValidation = validateCustomerName(data.customerName);
    if (!nameValidation.valid) {
        errors.push(nameValidation.error);
    } else {
        sanitizedData.customerName = nameValidation.value;
    }

    // Validate customer email
    const emailValidation = validateCustomerEmail(data.customerEmail);
    if (!emailValidation.valid) {
        errors.push(emailValidation.error);
    } else {
        sanitizedData.customerEmail = emailValidation.value;
    }

    // Validate customer phone
    const phoneValidation = validateCustomerPhone(data.customerPhone);
    if (!phoneValidation.valid) {
        errors.push(phoneValidation.error);
    } else {
        sanitizedData.customerPhone = phoneValidation.value;
    }

    // Validate optional fields
    if (data.outboundDate) {
        const outboundTime = new Date(data.outboundDate).getTime();
        if (isNaN(outboundTime)) {
            errors.push('Invalid outboundDate format');
        } else {
            sanitizedData.outboundDate = new Date(outboundTime).toISOString();
        }
    }

    if (data.roundTrip === true && data.returnDate) {
        const returnTime = new Date(data.returnDate).getTime();
        if (isNaN(returnTime)) {
            errors.push('Invalid returnDate format');
        } else {
            sanitizedData.returnDate = new Date(returnTime).toISOString();
        }
    }

    // Cross-field: returnDate must be >= outboundDate
    if (sanitizedData.outboundDate && sanitizedData.returnDate) {
        if (new Date(sanitizedData.returnDate) < new Date(sanitizedData.outboundDate)) {
            errors.push('returnDate must be on or after outboundDate');
        }
    }

    // Cross-field: roundTrip=true exige returnDate
    if (data.roundTrip === true && !sanitizedData.returnDate) {
        errors.push('returnDate is required when roundTrip is true');
    }

    // Copy other safe fields
    if (data.roundTrip !== undefined) {
        sanitizedData.roundTrip = data.roundTrip === true;
    }

    // Insurance indicator (com / sem seguro) — enviado pela API do parceiro
    if (data.hasInsurance !== undefined) {
        sanitizedData.hasInsurance = data.hasInsurance === true || data.hasInsurance === 'true' || data.hasInsurance === 1 || data.hasInsurance === '1';
    }

    // Validate baggageQty
    if (data.baggageQty !== undefined) {
        const qty = Number(data.baggageQty);
        if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
            errors.push('baggageQty must be an integer between 1 and 50');
        } else {
            sanitizedData.baggageQty = qty;
        }
    }

    // Sanitize any text fields
    if (data.notes && typeof data.notes === 'string') {
        sanitizedData.notes = sanitizeString(data.notes);
    }

    return {
        valid: errors.length === 0,
        data: sanitizedData,
        errors
    };
};

/**
 * LEGACY: Keep old function for backward compatibility
 */
const validatePartnerSale = (data) => {
    const result = validateAndSanitizePartnerSale(data);
    if (!result.valid) {
        return { valid: false, message: result.errors[0] || 'Validation failed' };
    }
    return { valid: true };
};

/**
 * Validate JotForms submission data
 * @param {object} data - Form submission data
 * @returns {object} - { valid, data: {...sanitized}, errors: [...] }
 */
const validateAndSanitizeJotFormsSubmission = (data) => {
    const errors = [];
    const sanitizedData = {};

    // Validate submission ID
    if (!data.submissionId || typeof data.submissionId !== 'string') {
        errors.push('Submission ID is required');
    } else {
        sanitizedData.submissionId = sanitizeString(data.submissionId);
    }

    // Validate form ID
    if (!data.formId || typeof data.formId !== 'string') {
        errors.push('Form ID is required');
    } else {
        sanitizedData.formId = sanitizeString(data.formId);
    }

    // Validate form data (can be any object, but sanitize strings within)
    if (data.formData && typeof data.formData === 'object') {
        sanitizedData.formData = {};
        for (const [key, value] of Object.entries(data.formData)) {
            if (typeof value === 'string') {
                sanitizedData.formData[key] = sanitizeString(value);
            } else {
                sanitizedData.formData[key] = value;
            }
        }
    }

    return {
        valid: errors.length === 0,
        data: sanitizedData,
        errors
    };
};

module.exports = {
    // Main validation functions
    validatePartnerSale, // LEGACY
    validateAndSanitizePartnerSale,
    validateAndSanitizeJotFormsSubmission,
    
    // Individual validators
    isValidEmail,
    isValidPhone,
    validateCustomerName,
    validateCustomerEmail,
    validateCustomerPhone,
    
    // Sanitization functions
    sanitizePhone,
    sanitizeString,
};