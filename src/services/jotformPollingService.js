/**
 * JotForm Polling Service
 * Fallback para quando o webhook do JotForm não está configurado.
 * Consulta a API do JotForm periodicamente buscando novas submissões
 * e as processa como se fossem recebidas via webhook.
 */

const axios = require('axios');
const submissionRepository = require('../repositories/submissionRepository');
const { prisma } = require('../config');
const partnerCallbackService = require('./partnerCallbackService');

const JOTFORM_API_KEY = process.env.JOTFORM_API_KEY || '';
const JOTFORM_FORM_ID = process.env.JOTFORM_FORM_ID || '';
const POLL_INTERVAL_MS = Number(process.env.JOTFORM_POLL_INTERVAL_MS || 60000); // 1 min default

// Field IDs from env
const FIELD_NAME_ID = process.env.JOTFORM_FIELD_NAME || '36';
const FIELD_EMAIL_ID = process.env.JOTFORM_FIELD_EMAIL || '33';
const FIELD_PHONE_ID = process.env.JOTFORM_FIELD_PHONE || '120';
const FIELD_OUTDATE_ID = process.env.JOTFORM_FIELD_OUTDATE || '215';
const FIELD_RETDATE_ID = process.env.JOTFORM_FIELD_RETDATE || '216';

let lastPollTime = null;
let pollTimer = null;
let initialBackfillDone = false;

const isConfigured = () => JOTFORM_API_KEY && JOTFORM_FORM_ID;

/**
 * Extract answer value from JotForm answer object
 * Handles fullname fields (first + last), simple text, phone widgets, etc.
 */
function extractAnswer(answer) {
  if (!answer) return '';
  const val = answer.answer;
  if (!val) return answer.prettyFormat || '';
  if (typeof val === 'string') return val;
  // fullname field
  if (val.first || val.last) return [val.first, val.last].filter(Boolean).join(' ');
  // phone widget
  if (val.full) return val.full;
  if (val.phone) return (val.area || '') + val.phone;
  return answer.prettyFormat || String(val);
}

/**
 * Extract a date value from JotForm date answer
 * Returns formatted string like "30-03-2026" or null
 */
function extractDateAnswer(answer) {
  if (!answer) return null;
  if (answer.prettyFormat) return answer.prettyFormat;
  const val = answer.answer;
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val.day && val.month && val.year) {
    return `${String(val.day).padStart(2, '0')}-${String(val.month).padStart(2, '0')}-${val.year}`;
  }
  return null;
}

/**
 * Fetch recent submissions from JotForm API
 */
async function fetchNewSubmissions() {
  if (!isConfigured()) {
    console.warn('[JotFormPoll] API key or Form ID not configured, skipping');
    return [];
  }

  try {
    const params = {
      apiKey: JOTFORM_API_KEY,
      limit: 100,
      orderby: 'created_at',
      filter: JSON.stringify({ status: 'ACTIVE' })
    };

    // Se já temos lastPollTime, filtrar apenas submissões mais recentes
    if (lastPollTime) {
      params.filter = JSON.stringify({
        status: 'ACTIVE',
        'created_at:gt': lastPollTime.toISOString().replace('T', ' ').slice(0, 19)
      });
    }

    const { data } = await axios.get(
      `https://api.jotform.com/form/${JOTFORM_FORM_ID}/submissions`,
      { params, timeout: 10000 }
    );

    return data.content || [];
  } catch (error) {
    console.error('[JotFormPoll] Error fetching submissions:', error.message);
    return [];
  }
}

/**
 * Process a single JotForm submission — save to DB and trigger notifications
 * @param {Object} jotformSubmission - JotForm submission object
 * @param {boolean} skipNotifications - If true, save to DB but don't send notifications (backfill mode)
 */
async function processSubmission(jotformSubmission, skipNotifications = false) {
  const submissionId = String(jotformSubmission.id);
  const formId = JOTFORM_FORM_ID;
  const answers = jotformSubmission.answers || {};

  // Check if already processed
  const existing = await submissionRepository.getSubmissionById(submissionId);
  if (existing) return null; // Already in DB

  // Extract customer data using configured field IDs
  const customerName = extractAnswer(answers[FIELD_NAME_ID]);
  const customerEmail = extractAnswer(answers[FIELD_EMAIL_ID]);
  const customerPhone = extractAnswer(answers[FIELD_PHONE_ID]);

  // Extract trip dates
  const outboundDate = extractDateAnswer(answers[FIELD_OUTDATE_ID]);
  const returnDate = extractDateAnswer(answers[FIELD_RETDATE_ID]);

  if (!customerName && !customerEmail) {
    console.warn(`[JotFormPoll] Submission ${submissionId} has no customer data, skipping`);
    return null;
  }

  console.log(`[JotFormPoll] Processing new submission ${submissionId}: ${customerName} <${customerEmail}>`);

  // Save to DB
  const submission = await submissionRepository.saveSubmission({
    submissionId,
    formId,
    status: 'completed',
    customerName: customerName || 'Unknown',
    customerEmail: customerEmail || '',
    customerPhone: customerPhone || '',
    rawPayload: jotformSubmission,
    completedAt: jotformSubmission.created_at ? new Date(jotformSubmission.created_at) : new Date()
  });

  // Link to sale if possible
  try {
    if (prisma && customerEmail) {
      const associatedSale = await prisma.sale.findFirst({
        where: { customerEmail, status: 'processed' },
        include: { partner: true }
      });

      if (associatedSale) {
        await submissionRepository.saveSubmission({
          ...submission,
          saleId: associatedSale.id
        });
        console.log(`[JotFormPoll] Linked submission ${submissionId} to sale ${associatedSale.id}`);

        // Partner callback
        await partnerCallbackService.schedulePartnerCallback(associatedSale, submission);
      }
    }
  } catch (err) {
    console.warn('[JotFormPoll] Error linking sale:', err.message);
  }

  return submission;
}

/**
 * Run one polling cycle
 */
async function poll() {
  try {
    // On first poll, check if DB has any submissions.
    // If not, this is a backfill — save submissions without sending notifications.
    let backfillMode = false;
    if (!initialBackfillDone) {
      const existingCount = await prisma.submission.count();
      if (existingCount === 0) {
        backfillMode = true;
        console.log('[JotFormPoll] First run with empty DB — backfill mode (no notifications)');
      }
      initialBackfillDone = true;
    }

    const submissions = await fetchNewSubmissions();
    let newCount = 0;

    for (const sub of submissions) {
      const result = await processSubmission(sub, backfillMode);
      if (result) newCount++;
    }

    if (newCount > 0) {
      if (backfillMode) {
        console.log(`[JotFormPoll] Backfilled ${newCount} existing submission(s) (no notifications sent)`);
      } else {
        console.log(`[JotFormPoll] Processed ${newCount} new submission(s)`);
      }
    }

    lastPollTime = new Date();
  } catch (error) {
    console.error('[JotFormPoll] Poll cycle error:', error.message);
  }
}

/**
 * Start periodic polling
 */
function start() {
  if (pollTimer) {
    console.warn('[JotFormPoll] Already running, ignoring duplicate start()');
    return;
  }

  if (!isConfigured()) {
    console.warn('[JotFormPoll] Not configured (missing JOTFORM_API_KEY or JOTFORM_FORM_ID), polling disabled');
    return;
  }

  console.log(`[JotFormPoll] ✓ Polling iniciado a cada ${POLL_INTERVAL_MS / 1000}s para form ${JOTFORM_FORM_ID}`);

  // First poll after 5s (let server start)
  setTimeout(() => poll(), 5000);

  // Then every interval
  pollTimer = setInterval(() => poll(), POLL_INTERVAL_MS);
}

function stop() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[JotFormPoll] Polling stopped');
  }
}

module.exports = { start, stop, poll, processSubmission };
