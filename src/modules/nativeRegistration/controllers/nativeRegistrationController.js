// Controller do módulo de Registro Nativo
const registrationService = require('../services/nativeRegistrationService');
const repository = require('../repositories/nativeRegistrationRepository');
const { validateRegistrationInput } = require('../validators/nativeRegistrationValidator');
const scheduler = require('../../../jobs/scheduler');
const { validateSun, isTestSun } = require('../../../services/physicalTagSunService');
const { validateToken } = require('../services/dashboardAuthService');
const { client: minioClient, config: minioConfig } = require('../../../services/minioClient');

const withImageUrls = async (registration) => ({
  ...registration,
  baggageItems: await Promise.all((registration.baggageItems || []).map(async (item) => ({
    ...item,
    imageData: item.imageData?.startsWith('data:')
      ? item.imageData
      : (item.imageData ? `/native/registro/${registration.id}/image/${item.id}/imageData` : null),
    imageData2: item.imageData2?.startsWith('data:')
      ? item.imageData2
      : (item.imageData2 ? `/native/registro/${registration.id}/image/${item.id}/imageData2` : null),
  })))
});

const withImageProxyUrls = (registration) => ({
  ...registration,
  baggageItems: (registration.baggageItems || []).map((item) => ({
    ...item,
    imageData: item.imageData?.startsWith('data:')
      ? item.imageData
      : (item.imageData ? `/native/registro/${registration.id}/image/${item.id}/imageData` : null),
    imageData2: item.imageData2?.startsWith('data:')
      ? item.imageData2
      : (item.imageData2 ? `/native/registro/${registration.id}/image/${item.id}/imageData2` : null),
  }))
});

/**
 * POST /native/registro — Cria registro completo
 */
const createRegistration = async (req, res) => {
  try {
    let registrationBody = req.body || {};

    // Multipart requests carry metadata as JSON and images as MinIO-backed
    // Multer files. Keep the persisted field names stable for the rest of the
    // registration flow.
    if (registrationBody.registrationData) {
      try {
        registrationBody = JSON.parse(registrationBody.registrationData);
      } catch (_error) {
        return res.status(400).json({ success: false, error: 'Dados invÃ¡lidos' });
      }
    }

    const imageFiles = req.files || {};
    const imageDataFiles = imageFiles.imageData || [];
    const imageData2Files = imageFiles.imageData2 || [];
    registrationBody.baggageItems = (registrationBody.baggageItems || []).map((item, index) => ({
      ...item,
      imageData: imageDataFiles[index]?.key || null,
      imageData2: imageData2Files[index]?.key || null
    }));

    const validation = validateRegistrationInput(registrationBody);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        details: validation.errors
      });
    }

    if (validation.sanitized.isPhysicalTag) {
      if (isTestSun(validation.sanitized.sunNumber)) {
        const session = validateToken(req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.slice(7)
          : req.query.token);
        if (!session || !['admin', 'gestor'].includes(session.role)) {
          return res.status(403).json({
            success: false,
            error: 'Apenas administradores ou gestores podem usar SUNs de teste.'
          });
        }
      }
      const sunValidation = await validateSun(validation.sanitized.sunNumber);
      if (!sunValidation.valid) {
        return res.status(400).json({
          success: false,
          error: 'SUN Inválido ou Vencido (mais de 1 ano). Verifique se preencheu corretamente.',
          details: [{ field: 'sunNumber', message: sunValidation.error }]
        });
      }
      validation.sanitized.hasInsurance = sunValidation.insured;
      validation.sanitized.baggageItems[0] = {
        ...(validation.sanitized.baggageItems[0] || {}),
        identifierTag: sunValidation.value,
        sunNumber: sunValidation.value
      };
    }

    const saleId = validation.sanitized.saleId;
    if (!saleId && !validation.sanitized.isPhysicalTag) {
      throw new Error('[NativeRegistration] saleId is required');
    }

    const meta = {
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('User-Agent')
    };

    const result = await registrationService.createRegistration(validation.sanitized, meta);

    const saleHasInsurance = saleId ? await repository.findSaleHasInsurance(saleId) : null;

    if (saleHasInsurance === true) {
      await scheduler.now("now-integration", {
        saleId,
        cpvNumber: result.registration.cpvNumber,
      });
      console.log(
        "[NativeRegistration] now-integration enfileirado para CPV:",
        result.registration.cpvNumber,
      );
    }

    return res.status(201).json({
      success: true,
      data: {
        id: result.registration.id,
        cpvNumber: result.cpvNumber,
        cpvGenerated: result.cpvGenerated,
        status: result.registration.status,
        message: 'Registro realizado com sucesso! O CPV será enviado por e-mail em instantes.'
      }
    });
  } catch (error) {
    console.error('[NativeRegistration] Erro ao criar registro:', error);
    if (error.code === 'SALE_EXPIRED') {
      return res.status(410).json({
        success: false,
        error: 'O link desta venda expirou. Solicite um novo link.'
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao processar registro'
    });
  }
};

/**
 * GET /native/registros — Lista registros com paginação e filtros
 */
const listRegistrations = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      partnerId,
      status,
      passengerEmail,
      passengerName,
      cpvNumber,
      dateFrom,
      dateTo,
      hasInsurance,
      isPhysicalTag
    } = req.query;

    // Normaliza o filtro de seguro: 'true'/'1' => true, 'false'/'0' => false, ausente => sem filtro
    let hasInsuranceFilter;
    if (hasInsurance === 'true' || hasInsurance === '1') hasInsuranceFilter = true;
    else if (hasInsurance === 'false' || hasInsurance === '0') hasInsuranceFilter = false;

    let isPhysicalTagFilter;
    if (isPhysicalTag === 'true' || isPhysicalTag === '1') isPhysicalTagFilter = true;
    else if (isPhysicalTag === 'false' || isPhysicalTag === '0') isPhysicalTagFilter = false;

    const result = await registrationService.listRegistrations({
      page: Math.min(Math.max(1, parseInt(page) || 1), 10000),
      limit: Math.max(1, Math.min(parseInt(limit) || 20, 100)),
      sortBy,
      sortOrder,
      filters: { partnerId, status, passengerEmail, passengerName, cpvNumber, dateFrom, dateTo, hasInsurance: hasInsuranceFilter, isPhysicalTag: isPhysicalTagFilter }
    });

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[NativeRegistration] Erro ao listar registros:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao listar registros'
    });
  }
};

/**
 * GET /native/registro/:id — Detalhe de um registro
 */
const getRegistration = async (req, res) => {
  try {
    const registration = await registrationService.getRegistration(req.params.id);

    if (!registration) {
      return res.status(404).json({
        success: false,
        error: 'Registro não encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      data: await withImageUrls(registration)
    });
  } catch (error) {
    console.error('[NativeRegistration] Erro ao buscar registro:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar registro'
    });
  }
};

/**
 * GET /native/registro/:id/image/:itemId/:field — Streams a private registration image
 */
const streamRegistrationImage = async (req, res) => {
  try {
    const { id, itemId, field } = req.params;
    if (!['imageData', 'imageData2'].includes(field)) {
      return res.status(400).json({ success: false, error: 'Campo de imagem invÃ¡lido' });
    }
    if (!minioClient) {
      return res.status(503).json({ success: false, error: 'Object storage indisponÃ­vel' });
    }

    const registration = await registrationService.getRegistration(id);
    const objectName = registration?.baggageItems?.find((item) => item.id === itemId)?.[field];
    if (!objectName || objectName.startsWith('data:')) {
      return res.status(404).json({ success: false, error: 'Imagem nÃ£o encontrada' });
    }

    const metadata = await minioClient.statObject(minioConfig.bucket, objectName);
    const contentType = metadata.metaData?.['content-type'] || metadata.metaData?.['Content-Type'] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    if (metadata.size !== undefined) res.setHeader('Content-Length', metadata.size);
    res.setHeader('Cache-Control', 'private, max-age=300');

    const imageStream = await minioClient.getObject(minioConfig.bucket, objectName);
    imageStream.on('error', (error) => {
      console.error('[NativeRegistration] Erro ao transmitir imagem:', error.message);
      if (!res.headersSent) res.status(500).end();
      else res.destroy(error);
    });
    imageStream.pipe(res);
  } catch (error) {
    console.error('[NativeRegistration] Erro ao buscar imagem:', error);
    return res.status(404).json({ success: false, error: 'Imagem nÃ£o encontrada' });
  }
};

/**
 * GET /native/registro/:id/cpv — Retorna HTML do CPV para visualização
 */
const getCpvPreview = async (req, res) => {
  try {
    const registration = await registrationService.getRegistration(req.params.id);

    if (!registration) {
      return res.status(404).json({ success: false, error: 'Registro não encontrado' });
    }

    const { generateCpvHtml } = require('../services/cpvPdfService');
    const html = await generateCpvHtml(withImageProxyUrls(registration));

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error) {
    console.error('[NativeRegistration] Erro ao gerar preview CPV:', error);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
};

/**
 * GET /native/registro/:id/cpv/pdf — Baixa o CPV como PDF real
 */
const downloadCpvPdf = async (req, res) => {
  try {
    const registration = await registrationService.getRegistration(req.params.id);

    if (!registration) {
      return res.status(404).json({ success: false, error: 'Registro não encontrado' });
    }

    const { generateCpvPdf } = require('../services/cpvPdfService');
    const { cpvNumber, pdfBuffer, isHtmlFallback } = await generateCpvPdf(registration);

    if (isHtmlFallback) {
      // Puppeteer indisponível — retorna HTML com header indicando fallback
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-PDF-Fallback', 'true');
      return res.send(pdfBuffer);
    }

    const filename = `${cpvNumber}_${registration.passengerName.replace(/\s+/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('[NativeRegistration] Erro ao gerar PDF do CPV:', error);
    return res.status(500).json({ success: false, error: 'Erro ao gerar PDF' });
  }
};

/**
 * POST /native/registro/:id/resend — Re-envia CPV por e-mail
 */
const resendEmail = async (req, res) => {
  try {
    const result = await registrationService.resendCpvEmail(req.params.id);
    const actor = req.dashboardUser ? req.dashboardUser.email : (req.partner ? req.partner.name : 'unknown');
    console.log(`[Audit] RESEND_EMAIL registration=${req.params.id} by=${actor} reqId=${req.id || '-'}`);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[NativeRegistration] Erro ao re-enviar e-mail:', error);
    const status = error.message.includes('não encontrado') ? 404 : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
};

/**
 * POST /native/registro/:id/whatsapp — Re-envia CPV por WhatsApp
 */
const resendWhatsApp = async (req, res) => {
  try {
    const result = await registrationService.resendCpvWhatsApp(req.params.id);
    const actor = req.dashboardUser ? req.dashboardUser.email : (req.partner ? req.partner.name : 'unknown');
    console.log(`[Audit] RESEND_WHATSAPP registration=${req.params.id} by=${actor} reqId=${req.id || '-'}`);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[NativeRegistration] Erro ao re-enviar WhatsApp:', error);
    const status = error.message.includes('não encontrado') ? 404 : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
};

/**
 * GET /native/stats — Estatísticas de registros
 */
const getStats = async (req, res) => {
  try {
    const { partnerId, dateFrom, dateTo } = req.query;
    const stats = await registrationService.getStats({ partnerId, dateFrom, dateTo });
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    console.error('[NativeRegistration] Erro ao buscar stats:', error);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
};

/**
 * GET /native/registro/cpv/:cpvNumber — Busca por número de CPV (dashboard, protegida)
 */
const getRegistrationByCpv = async (req, res) => {
  try {
    const registration = await registrationService.getRegistrationByCpv(req.params.cpvNumber);

    if (!registration) {
      return res.status(404).json({ success: false, error: 'CPV não encontrado' });
    }

    return res.status(200).json({ success: true, data: registration });
  } catch (error) {
    console.error('[NativeRegistration] Erro ao buscar por CPV:', error);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
};

/**
 * GET /native/cpv/:cpvNumber — Consulta pública do CPV (QR Code, sem auth)
 * Retorna página HTML visual com dados não-sensíveis para verificação
 */
const getPublicCpv = async (req, res) => {
  try {
    const registration = await registrationService.getRegistrationByCpv(req.params.cpvNumber);

    const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    if (!registration) {
      return res.status(404).send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CPV não encontrado — ExactBag</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:16px;max-width:420px;width:100%;padding:40px 28px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.icon{font-size:48px;margin-bottom:16px}.title{font-size:20px;font-weight:700;color:#1f2937;margin-bottom:8px}.desc{font-size:14px;color:#6b7280;line-height:1.6}
</style></head><body><div class="card"><div class="icon">🔍</div><div class="title">CPV não encontrado</div><p class="desc">O número informado não corresponde a nenhum registro em nossa base.<br><br>Verifique o número e tente novamente.</p></div></body></html>`);
    }

    const r = registration;
    const fmtDate = (d) => { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); };
    const statusMap = { submitted: { label: 'Registrado', color: '#f59e0b', bg: '#fef3c7' }, cpv_generated: { label: 'CPV Gerado', color: '#3b82f6', bg: '#dbeafe' }, sent: { label: 'Enviado', color: '#6d28d9', bg: '#ede9fe' }, completed: { label: 'Concluído', color: '#10b981', bg: '#d1fae5' }, cancelled: { label: 'Cancelado', color: '#dc2626', bg: '#fee2e2' } };
    const st = statusMap[r.status] || { label: r.status, color: '#6b7280', bg: '#f3f4f6' };

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(r.cpvNumber)} — ExactBag CPV</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:linear-gradient(135deg,#0b1220 0%,#0f62fe 100%);min-height:100vh;padding:20px;display:flex;align-items:flex-start;justify-content:center}
.container{max-width:440px;width:100%;padding-top:24px}
.brand{text-align:center;color:#fff;margin-bottom:20px}
.brand h1{font-size:28px;font-weight:800;letter-spacing:1px}
.brand p{font-size:12px;opacity:.75;margin-top:4px;text-transform:uppercase;letter-spacing:1.5px}
.card{background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.15)}
.card-header{background:linear-gradient(135deg,#0b1220 0%,#1e3a5f 100%);color:#fff;padding:24px 24px 20px;text-align:center}
.badge{display:inline-block;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:12px}
.cpv-num{font-size:22px;font-weight:800;letter-spacing:1.5px;font-family:'Courier New',monospace}
.check-icon{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:rgba(16,185,129,.2);margin-bottom:12px}
.check-icon svg{width:28px;height:28px}
.verified{font-size:13px;color:rgba(255,255,255,.8);margin-top:8px}
.card-body{padding:24px}
.info-row{display:flex;justify-content:space-between;align-items:flex-start;padding:14px 0;border-bottom:1px solid #f3f4f6}
.info-row:last-child{border-bottom:none}
.info-label{font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;flex-shrink:0}
.info-value{font-size:14px;color:#1f2937;font-weight:500;text-align:right;max-width:60%}
.route-section{text-align:center;padding:20px 0;border-bottom:1px solid #f3f4f6}
.route{display:flex;align-items:center;justify-content:center;gap:12px}
.route-city{font-size:14px;font-weight:600;color:#1f2937;max-width:140px}
.route-arrow{color:#0f62fe;font-size:20px;flex-shrink:0}
.card-footer{background:#f8fafc;padding:16px 24px;text-align:center;border-top:1px solid #e5e7eb}
.card-footer p{font-size:11px;color:#9ca3af;line-height:1.5}
.card-footer a{color:#0f62fe;text-decoration:none;font-weight:600}
@media(max-width:380px){.cpv-num{font-size:18px}.route-city{font-size:13px;max-width:110px}}
</style>
</head>
<body>
<div class="container">
  <div class="brand">
    <h1>ExactBag</h1>
    <p>Certificado de Propriedade de Volume</p>
  </div>
  <div class="card">
    <div class="card-header">
      <div class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
      <div class="cpv-num">${esc(r.cpvNumber)}</div>
      <div class="verified">✓ Certificado verificado</div>
    </div>
    <div class="card-body">
      <div class="info-row">
        <span class="info-label">Passageiro</span>
        <span class="info-value">${esc(r.passengerName)}</span>
      </div>
      <div class="route-section">
        <div class="route">
          <span class="route-city">${esc(r.origin)}</span>
          <span class="route-arrow">✈ →</span>
          <span class="route-city">${esc(r.destination)}</span>
        </div>
      </div>
      <div class="info-row">
        <span class="info-label">Ida</span>
        <span class="info-value">${fmtDate(r.outboundDate)}</span>
      </div>
      ${r.returnDate ? `<div class="info-row"><span class="info-label">Volta</span><span class="info-value">${fmtDate(r.returnDate)}</span></div>` : ''}
      <div class="info-row">
        <span class="info-label">Bagagens</span>
        <span class="info-value">${r.baggageQty}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Status</span>
        <span class="info-value"><span class="badge" style="color:${st.color};background:${st.bg}">${st.label}</span></span>
      </div>
      <div class="info-row">
        <span class="info-label">Registrado em</span>
        <span class="info-value">${fmtDate(r.createdAt)}</span>
      </div>
    </div>
    <div class="card-footer">
      <p>Este certificado é válido e foi emitido pela<br><a href="https://app.exactbag.com.br">ExactBag — Proteção para sua bagagem</a></p>
    </div>
  </div>
</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (error) {
    console.error('[NativeRegistration] Erro ao buscar CPV público:', error);
    return res.status(500).send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Erro — ExactBag</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:16px;max-width:420px;width:100%;padding:40px 28px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.icon{font-size:48px;margin-bottom:16px}.title{font-size:20px;font-weight:700;color:#1f2937;margin-bottom:8px}.desc{font-size:14px;color:#6b7280;line-height:1.6}
</style></head><body><div class="card"><div class="icon">⚠️</div><div class="title">Erro interno</div><p class="desc">Não foi possível consultar o CPV no momento.<br><br>Tente novamente em alguns instantes.</p></div></body></html>`);
  }
};

/**
 * DELETE /native/registro/:id — Exclui registro (apenas gestor)
 */
const deleteRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await registrationService.getRegistration(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Registro não encontrado' });
    }
    await repository.deleteById(id);
    const actor = req.dashboardUser ? req.dashboardUser.email : (req.partner ? req.partner.name : 'unknown');
    console.log(`[Audit] DELETE registration=${id} cpv=${existing.cpvNumber || '-'} by=${actor} reqId=${req.id || '-'}`);
    return res.status(200).json({ success: true, message: 'Registro excluído' });
  } catch (error) {
    console.error('[NativeRegistration] Erro ao excluir:', error);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
};

module.exports = {
  createRegistration,
  listRegistrations,
  getRegistration,
  streamRegistrationImage,
  getCpvPreview,
  downloadCpvPdf,
  resendEmail,
  resendWhatsApp,
  getStats,
  getRegistrationByCpv,
  getPublicCpv,
  deleteRegistration
};
