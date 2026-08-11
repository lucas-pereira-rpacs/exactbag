const dbService = require('../services/databaseService');
const { verifyFormAccessToken, parsePrettySlug } = require('../services/publicFormLinkService');

const isAllowedFormUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'form.jotform.com';
  } catch (_error) {
    return false;
  }
};

const redirectToPrefilledForm = async (req, res) => {
  try {
    const { token } = req.params;
    const validation = verifyFormAccessToken(token);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Link invalido ou expirado',
        code: validation.error
      });
    }

    const sale = await dbService.findSaleByExternalSaleId(validation.saleId);
    if (!sale || !sale.formLink) {
      return res.status(404).json({
        success: false,
        error: 'Formulario nao encontrado para esta venda'
      });
    }

    if (sale.status === 'cancelada') {
      return res.status(410).json({
        success: false,
        error: 'Esta venda foi cancelada. O link de registro não está mais disponível.'
      });
    }

    return res.redirect(302, sale.formLink);
  } catch (error) {
    console.error('[PublicForm] Erro ao redirecionar link curto:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao abrir formulario'
    });
  }
};

const redirectToPrettyPrefilledForm = async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res.status(400).json({
        success: false,
        error: 'Slug invalido'
      });
    }

    // Busca por slug exato primeiro (novo formato com sufixo)
    let sale = await dbService.findSaleBySlug(slug);

    // Fallback: busca por nome (slugs antigos sem sufixo)
    if (!sale) {
      const searchTerm = parsePrettySlug(slug);
      if (searchTerm) {
        sale = await dbService.findLatestSaleByCustomerName(searchTerm);
        if (!sale) {
          const firstName = String(searchTerm).split(' ')[0];
          if (firstName && firstName.length >= 3) {
            sale = await dbService.findLatestSaleByCustomerName(firstName);
          }
        }
      }
    }
    if (!sale || !sale.formLink) {
      return res.status(404).json({
        success: false,
        error: 'Formulario nao encontrado para este cliente'
      });
    }

    if (sale.status === 'cancelada') {
      return res.status(410).json({
        success: false,
        error: 'Esta venda foi cancelada. O link de registro não está mais disponível.'
      });
    }

    if (!isAllowedFormUrl(sale.formLink)) {
      return res.status(400).json({
        success: false,
        error: 'URL de formulario invalida'
      });
    }

    const escapedFormUrl = sale.formLink.replace(/"/g, '&quot;');
    const escapedName = String(sale.customerName || 'Cliente').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Mantem URL amigavel no navegador e carrega o JotForm dentro de iframe.
    return res.status(200).send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cadastro ExactBag</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f8fb; }
    .header { padding: 16px 20px; background: #0b1220; color: #fff; font-size: 14px; }
    .title { font-weight: 600; }
    .subtitle { opacity: 0.85; margin-top: 4px; }
    .wrap { padding: 12px; }
    iframe { width: 100%; height: calc(100vh - 92px); border: 0; border-radius: 10px; background: #fff; }
    .fallback { margin-top: 8px; font-size: 12px; color: #4b5563; }
    .fallback a { color: #0f62fe; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">ExactBag • Cadastro de Bagagem</div>
    <div class="subtitle">Preenchimento para ${escapedName}</div>
  </div>
  <div class="wrap">
    <iframe src="${escapedFormUrl}" allow="clipboard-write"></iframe>
    <div class="fallback">Se o formulario nao carregar, <a href="${escapedFormUrl}" target="_blank" rel="noopener noreferrer">clique aqui para abrir diretamente</a>.</div>
  </div>
</body>
</html>`);
  } catch (error) {
    console.error('[PublicForm] Erro ao redirecionar link amigavel:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao abrir formulario'
    });
  }
};

module.exports = {
  redirectToPrefilledForm,
  redirectToPrettyPrefilledForm
};