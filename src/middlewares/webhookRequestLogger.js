/**
 * Logs the parsed body of incoming partner sales webhooks.
 *
 * This intentionally includes customer data so webhook payloads can be
 * reconstructed from Railway application logs. Keep this middleware scoped
 * to /webhooks/sales and review retention/access controls before production use.
 */
module.exports = (req, _res, next) => {
  const requestId = req.headers['x-railway-request-id'] || req.id || null;

  console.log('[WebhookRequest]', JSON.stringify({
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    path: req.originalUrl,
    body: req.body || {}
  }));

  next();
};
