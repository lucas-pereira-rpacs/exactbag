// Serviço de geração do CPV (Certificado de Propriedade de Volume) em PDF
// Usa apenas dependências nativas + módulo leve para gerar PDF sem heavy libs

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const { getObjectUrl } = require("./minioClient");

// QR code cache — evita regenerar QR para o mesmo CPV (5min TTL)
const _qrCache = new Map();
const QR_CACHE_TTL = 5 * 60 * 1000;
setInterval(() => _qrCache.clear(), QR_CACHE_TTL).unref();

const _getCachedQr = async (url, opts) => {
  if (_qrCache.has(url)) return _qrCache.get(url);
  const qr = await QRCode.toDataURL(url, opts);
  _qrCache.set(url, qr);
  return qr;
};

// Carrega logo ExactBag como data URI para embutir no HTML do CPV
let LOGO_DATA_URI = "";
try {
  const logoPath = path.join(
    __dirname,
    "..",
    "views",
    "dashboard",
    "logo-exactbag.png",
  );
  const logoBuffer = fs.readFileSync(logoPath);
  LOGO_DATA_URI = "data:image/png;base64," + logoBuffer.toString("base64");
} catch (err) {
  console.warn("[CpvPdf] Logo não encontrado, usando texto fallback");
}

const generateCpvNumber = () => {
  const date = new Date();
  const prefix = "EXACTBAG-CPV";
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${year}${month}${day}-${random}`;
};

const formatDate = (date) => {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatDateEn = (date) => {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatDateTime = (date) => {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateTimeEn = (date) => {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

/**
 * Formata CPF com máscara (aceita com ou sem pontuação)
 */
const formatCpf = (cpf) => {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length === 11)
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return cpf;
};

/**
 * Gera o HTML da área de logo no header (com fallback para texto)
 */
const logoAreaHtml = () => {
  if (LOGO_DATA_URI) {
    return `<div class="logo-area"><img src="${LOGO_DATA_URI}" alt="ExactBag" /></div>`;
  }
  return `<div class="logo-area"><div class="logo-text">EXACTBAG</div></div>`;
};

/**
 * Gera o HTML do CPV multi-página seguindo o modelo ExactBag:
 *   Página 1 — Registro (PT-BR): header azul, termo, dados do passageiro + viagem
 *   Páginas 2..N — Fotos de cada bagagem (uma página por foto)
 *   Página N+1 — Confirmação bilíngue com ID e data de envio
 *   Página N+2 — Registro (EN): versão em inglês
 */
const generateCpvHtml = async (registration) => {
  const cpvNumber = registration.cpvNumber;
  const baggageItems = await Promise.all(
    (registration.baggageItems || []).map(async (item) => ({
      ...item,
      imageData: await getObjectUrl(item.imageData),
      imageData2: await getObjectUrl(item.imageData2),
    })),
  );
  const submissionDate = registration.createdAt || new Date();

  // Gera QR Code com link público de consulta do CPV (rota pública sem auth)
  const cpvUrl = `https://app.exactbag.com.br/native/cpv/${encodeURIComponent(cpvNumber)}`;
  let qrDataUri = "";
  try {
    qrDataUri = await _getCachedQr(cpvUrl, {
      width: 160,
      margin: 1,
      color: { dark: "#1e3a5f", light: "#ffffff" },
    });
  } catch (err) {
    console.warn("[CpvPdf] Falha ao gerar QR Code:", err.message);
  }

  // ======================== CSS ========================
  const css = `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #1a1a2e; line-height: 1.45; }

    .page { width: 210mm; min-height: 297mm; padding: 0; page-break-after: always; position: relative; background: #fff; overflow: hidden; }
    .page:last-child { page-break-after: auto; }

    /* Header azul com logo — profissional */
    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      background: linear-gradient(135deg, #0b1220 0%, #1e3a5f 100%);
      color: #fff; padding: 18px 36px; min-height: 72px;
    }
    .page-header .logo-area { flex: 0 0 auto; background: #fff; border-radius: 8px; padding: 8px 14px; display: flex; align-items: center; }
    .page-header .logo-area img { height: 38px; width: auto; display: block; }
    .page-header .logo-text { font-size: 20pt; font-weight: 800; letter-spacing: 1px; color: #0f62fe; }
    .page-header .logo-sub { font-size: 7.5pt; color: #6b7280; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
    .page-header .title-area { flex: 1; text-align: right; padding-left: 20px; }
    .page-header .title-area h1 { font-size: 15pt; font-weight: 700; line-height: 1.2; letter-spacing: 0.3px; }
    .page-header .title-area .cpv-badge {
      display: inline-block; margin-top: 4px; padding: 2px 12px;
      background: rgba(255,255,255,0.2); border-radius: 20px;
      font-size: 8.5pt; font-weight: 600; letter-spacing: 0.5px;
    }

    .content { padding: 20px 36px; }

    /* Título de seção */
    .doc-title { font-size: 13pt; font-weight: 700; color: #0b1220; margin-bottom: 12px; border-bottom: 2px solid #0f62fe; padding-bottom: 6px; }
    .intro-text { font-size: 8.5pt; color: #374151; margin-bottom: 5px; line-height: 1.5; }
    .intro-text strong { color: #1a1a2e; }

    /* Campos de dados */
    .field-group { margin-top: 12px; }
    .field-label { font-size: 8.5pt; font-weight: 700; color: #0f62fe; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 8px; margin-bottom: 1px; }
    .field-value { font-size: 10pt; color: #1a1a2e; margin-bottom: 2px; padding-left: 2px; }

    /* Layout lado a lado para datas e origem/destino */
    .two-col { display: flex; gap: 40px; }
    .two-col .col { flex: 1; }

    /* Página de foto */
    .photo-section-title {
      font-size: 13pt; font-weight: 700; color: #0b1220;
      margin-bottom: 6px; border-bottom: 2px solid #0f62fe; padding-bottom: 6px;
    }
    .photo-section-desc { font-size: 10pt; color: #6b7280; margin-bottom: 20px; }
    .photo-container { text-align: center; margin-top: 10px; }
    .photo-container img {
      max-width: 88%; max-height: 560px; border-radius: 10px;
      border: 2px solid #e5e7eb; box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }

    /* Página de confirmação */
    .confirm-title { font-size: 14pt; font-weight: 800; color: #0b1220; margin-bottom: 8px; text-transform: uppercase; }
    .confirm-subtitle { font-size: 11pt; font-weight: 700; color: #374151; margin-bottom: 20px; }
    .confirm-label { font-size: 10pt; color: #6b7280; margin-top: 16px; text-transform: uppercase; letter-spacing: 0.3px; }
    .confirm-value { font-size: 12pt; color: #1a1a2e; font-weight: 600; }

    /* QR Code */
    .qr-section {
      display: flex; align-items: center; gap: 28px; margin-top: 36px; padding: 24px 28px;
      background: linear-gradient(135deg, #f0f5ff 0%, #f8fafc 100%);
      border-radius: 14px; border: 2px solid #c7d2fe;
    }
    .qr-section .qr-frame {
      flex-shrink: 0; background: #fff; padding: 10px; border-radius: 12px;
      border: 2px solid #e0e7ff; box-shadow: 0 2px 8px rgba(37,99,235,0.08);
    }
    .qr-section .qr-frame img { width: 120px; height: 120px; display: block; border-radius: 4px; }
    .qr-section .qr-info { flex: 1; }
    .qr-section .qr-info .qr-title { font-size: 11pt; font-weight: 800; color: #0b1220; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
    .qr-section .qr-info .qr-title .qr-icon { font-size: 16pt; }
    .qr-section .qr-info .qr-desc { font-size: 9pt; color: #374151; line-height: 1.6; margin-bottom: 4px; }
    .qr-section .qr-info .qr-desc strong { color: #0f62fe; }
    .qr-section .qr-info .qr-cpv { font-size: 8.5pt; color: #6b7280; margin-top: 6px; font-weight: 600; letter-spacing: 0.3px; }

    /* Footer */
    .page-footer {
      position: absolute; bottom: 16px; left: 40px; right: 40px;
      text-align: center; font-size: 7.5pt; color: #9ca3af;
      border-top: 1px solid #e5e7eb; padding-top: 6px;
    }
  `;

  // ======================== PÁGINA 1 — Registro PT-BR ========================
  const pagePtBr = `
  <div class="page">
    <div class="page-header">
      ${logoAreaHtml()}
      <div class="title-area">
        <h1>Registro do Serviço Digital<br/>(ExactBag)</h1>
        <div class="cpv-badge">${cpvNumber}</div>
      </div>
    </div>

    <div class="content">
      <div class="doc-title">Registro do Serviço Digital ExactBag</div>

      <p class="intro-text">Prezado(a) Passageiro(a),<br/>É um prazer tê-lo(a) conosco.</p>
      <p class="intro-text">Este formulário permite o registro das informações do seu Serviço Digital ExactBag antes da viagem, garantindo mais segurança e privacidade dos seus dados, sem exposição a terceiros.</p>
      <p class="intro-text">Agradecemos a confiança. Desejamos uma excelente viagem!</p>

      <p class="intro-text" style="margin-top:16px;"><strong>Termo de Uso – Serviço Digital de Identificação de Bagagem</strong></p>
      <p class="intro-text">O Serviço Digital ExactBag auxilia na identificação e comprovação de propriedade da bagagem, permitindo o registro de fotos e informações que geram uma evidência digital (CPV), sem expor dados pessoais a terceiros. A ExactBag não realiza rastreamento por geolocalização.</p>
      <p class="intro-text">A ExactBag não se responsabiliza por extravios, roubos, danos, atrasos ou outros incidentes com a bagagem. O uso do Serviço Digital não garante a recuperação da bagagem, atuando apenas como ferramenta de suporte. A validade do registro acompanha o período selecionado da sua viagem na contratação.</p>
      <p class="intro-text">Os dados informados são protegidos conforme a LGPD e utilizados exclusivamente para a prestação do serviço e comunicações relacionadas à bagagem, não sendo compartilhados com terceiros, salvo quando necessário.</p>
      <p class="intro-text">Ao enviar o formulário, o passageiro declara estar de acordo com estes termos e confirma a veracidade das informações.</p>
      <p class="intro-text">Boa viagem com a ExactBag! ✈️👜</p>

      <div class="field-group">
        <div class="field-label">Termos e Condições</div>
        <div class="field-value">Aceito</div>

        <div class="field-label">Quantidade de Bagagens Contratadas</div>
        <div class="field-value">${registration.baggageQty || 1}</div>

        <div class="field-label">Nome Completo</div>
        <div class="field-value">${registration.passengerName}</div>

        <div class="field-label">CPF</div>
        <div class="field-value">${formatCpf(registration.passengerCpf)}</div>

        <div class="field-label">E-mail</div>
        <div class="field-value">${registration.passengerEmail}</div>

        <div class="field-label">Telefone</div>
        <div class="field-value">${registration.passengerPhone}</div>

        <div class="two-col" style="margin-top:14px;">
          <div class="col">
            <div class="field-label">Data de Ida</div>
            <div class="field-value">${formatDate(registration.outboundDate)}</div>
          </div>
          <div class="col">
            <div class="field-label">Data de Volta</div>
            <div class="field-value">${registration.returnDate ? formatDate(registration.returnDate) : "—"}</div>
          </div>
        </div>

        <div class="two-col" style="margin-top:14px;">
          <div class="col">
            <div class="field-label">Origem da Viagem</div>
            <div class="field-value">${registration.origin}</div>
          </div>
          <div class="col">
            <div class="field-label">Destino da Viagem</div>
            <div class="field-value">${registration.destination}</div>
          </div>
        </div>

        <div class="field-label">Companhia Aérea</div>
        <div class="field-value">${registration.airline || "—"}</div>
      </div>
    </div>
  </div>`;

  // ======================== PÁGINAS DE FOTOS DAS BAGAGENS ========================
  let photoPages = "";
  baggageItems.forEach((item, idx) => {
    // Foto 1 — exterior
    if (item.imageData) {
      photoPages += `
      <div class="page">
        <div class="page-header">
          ${logoAreaHtml()}
          <div class="title-area">
            <h1>Registro Fotográfico<br/>(ExactBag)</h1>
            <div class="cpv-badge">${cpvNumber}</div>
          </div>
        </div>
        <div class="content">
          <div class="photo-section-title">Bagagem ${idx + 1} — Foto Exterior</div>
          <div class="photo-section-desc">Foto do exterior da bagagem evidenciando-a de forma clara e visível.</div>
          <div class="photo-container">
            <img src="${item.imageData}" alt="Bagagem ${idx + 1} - Foto exterior" />
          </div>
        </div>
        <div class="page-footer">${cpvNumber} • Bagagem ${idx + 1} — Foto 1</div>
      </div>`;
    }
    // Foto 2 — outro ângulo
    if (item.imageData2) {
      photoPages += `
      <div class="page">
        <div class="page-header">
          ${logoAreaHtml()}
          <div class="title-area">
            <h1>Registro Fotográfico<br/>(ExactBag)</h1>
            <div class="cpv-badge">${cpvNumber}</div>
          </div>
        </div>
        <div class="content">
          <div class="photo-section-title">Bagagem ${idx + 1} — Foto Outro Ângulo</div>
          <div class="photo-section-desc">Foto do exterior da bagagem de outro ângulo, evidenciando-a de forma clara e visível.</div>
          <div class="photo-container">
            <img src="${item.imageData2}" alt="Bagagem ${idx + 1} - Foto outro ângulo" />
          </div>
        </div>
        <div class="page-footer">${cpvNumber} • Bagagem ${idx + 1} — Foto 2</div>
      </div>`;
    }
  });

  // ======================== PÁGINA CONFIRMAÇÃO — Bilíngue ========================
  const submissionId = registration.id || cpvNumber;
  const pageConfirmation = `
  <div class="page">
    <div class="page-header">
      ${logoAreaHtml()}
      <div class="title-area">
        <h1>Confirmação de Envio<br/>(ExactBag)</h1>
        <div class="cpv-badge">${cpvNumber}</div>
      </div>
    </div>
    <div class="content">
      <div class="confirm-title">O FORMULÁRIO E AS FOTOS FORAM DEVIDAMENTE TIRADAS NAS SEGUINTES DATAS</div>
      <div class="confirm-subtitle">The form and photos were duly taken on the following date and information:</div>

      <div class="confirm-label">ID e Data de Envio:</div>
      <div class="confirm-value">${submissionId}</div>
      <div class="confirm-value">${formatDate(submissionDate)}</div>

      <div class="confirm-label" style="margin-top:24px;">ID and Date of submission</div>
      <div class="confirm-value">${submissionId}</div>
      <div class="confirm-value">${formatDateEn(submissionDate)}</div>
      <div class="confirm-value">${formatDateTimeEn(submissionDate)}</div>

      ${
        qrDataUri
          ? `
      <div class="qr-section">
        <div class="qr-frame">
          <img src="${qrDataUri}" alt="QR Code CPV" />
        </div>
        <div class="qr-info">
          <div class="qr-title"><span class="qr-icon">📱</span> Consulta Digital / Digital Check</div>
          <p class="qr-desc"><strong>Aponte a câmera do celular</strong> para o QR Code ao lado para consultar seu CPV online a qualquer momento.</p>
          <p class="qr-desc"><strong>Point your phone camera</strong> at the QR Code to check your CPV online anytime.</p>
          <div class="qr-cpv">CPV: ${cpvNumber}</div>
        </div>
      </div>`
          : ""
      }
    </div>
  </div>`;

  // ======================== PÁGINA EN — Registro em Inglês ========================
  const pageEn = `
  <div class="page">
    <div class="page-header">
      ${logoAreaHtml()}
      <div class="title-area">
        <h1>Digital Service Registration<br/>(ExactBag)</h1>
        <div class="cpv-badge">${cpvNumber}</div>
      </div>
    </div>

    <div class="content">
      <div class="doc-title">ExactBag Digital Service Registration</div>

      <p class="intro-text">Dear Passenger,<br/>It's a pleasure to have you with us.</p>
      <p class="intro-text">This form allows us to register your ExactBag Digital Service information before your trip, ensuring greater security and privacy of your data, without exposure to third parties.</p>
      <p class="intro-text">Thank you for your trust. We wish you an excellent trip!</p>

      <p class="intro-text" style="margin-top:16px;"><strong>Terms of Use – Digital Baggage Identification Service</strong></p>
      <p class="intro-text">The ExactBag Digital Service assists in identifying and proving ownership of baggage, allowing the registration of photos and information that generate digital evidence (CPV), without exposing personal data to third parties. ExactBag does not perform geolocation tracking.</p>
      <p class="intro-text">ExactBag is not responsible for lost, stolen, damaged, delayed, or other incidents involving baggage. The use of the Digital Service does not guarantee baggage recovery, acting only as a support tool. The validity of the registration corresponds to the selected period of your trip when contracting the service.</p>
      <p class="intro-text">The data provided is protected in accordance with the LGPD (Brazilian General Data Protection Law) and used exclusively for the provision of the service and communications related to baggage, and will not be shared with third parties, except when necessary.</p>
      <p class="intro-text">By submitting the form, the passenger declares to agree to these terms and confirms the veracity of the information.</p>
      <p class="intro-text">Have a good trip with ExactBag! ✈️👜</p>

      <div class="field-group">
        <div class="field-label">Terms and Conditions</div>
        <div class="field-value">Accepted</div>

        <div class="field-label">Number of Contracted Bags</div>
        <div class="field-value">${registration.baggageQty || 1}</div>

        <div class="field-label">Full Name</div>
        <div class="field-value">${registration.passengerName}</div>

        <div class="field-label">CPF (Tax ID)</div>
        <div class="field-value">${formatCpf(registration.passengerCpf)}</div>

        <div class="field-label">E-mail</div>
        <div class="field-value">${registration.passengerEmail}</div>

        <div class="field-label">Phone</div>
        <div class="field-value">${registration.passengerPhone}</div>

        <div class="two-col" style="margin-top:14px;">
          <div class="col">
            <div class="field-label">Departure Date</div>
            <div class="field-value">${formatDate(registration.outboundDate)}</div>
          </div>
          <div class="col">
            <div class="field-label">Return Date</div>
            <div class="field-value">${registration.returnDate ? formatDate(registration.returnDate) : "—"}</div>
          </div>
        </div>

        <div class="two-col" style="margin-top:14px;">
          <div class="col">
            <div class="field-label">Trip Origin</div>
            <div class="field-value">${registration.origin}</div>
          </div>
          <div class="col">
            <div class="field-label">Trip Destination</div>
            <div class="field-value">${registration.destination}</div>
          </div>
        </div>

        <div class="field-label">Airline</div>
        <div class="field-value">${registration.airline || "—"}</div>
      </div>
    </div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<style>${css}</style>
</head>
<body>
${pagePtBr}
${photoPages}
${pageConfirmation}
${pageEn}
</body>
</html>`;
};

const generateCpvHtmlForPhysicalTag = async (registration) => {
  const cpvNumber = registration.cpvNumber;
  const baggageItems = await Promise.all(
    (registration.baggageItems || []).map(async (item) => ({
      ...item,
      imageData: await getObjectUrl(item.imageData),
      imageData2: await getObjectUrl(item.imageData2),
    })),
  );
  const submissionDate = registration.createdAt || new Date();

  // Gera QR Code com link público de consulta do CPV (rota pública sem auth)
  const cpvUrl = `https://app.exactbag.com.br/native/cpv/${encodeURIComponent(cpvNumber)}`;
  let qrDataUri = "";
  try {
    qrDataUri = await _getCachedQr(cpvUrl, {
      width: 160,
      margin: 1,
      color: { dark: "#1e3a5f", light: "#ffffff" },
    });
  } catch (err) {
    console.warn("[CpvPdf] Falha ao gerar QR Code:", err.message);
  }

  // ======================== CSS ========================
  const css = `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #1a1a2e; line-height: 1.45; }

    .page { width: 210mm; min-height: 297mm; padding: 0; page-break-after: always; position: relative; background: #fff; overflow: hidden; }
    .page:last-child { page-break-after: auto; }

    /* Header azul com logo — profissional */
    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      background: linear-gradient(135deg, #0b1220 0%, #1e3a5f 100%);
      color: #fff; padding: 18px 36px; min-height: 72px;
    }
    .page-header .logo-area { flex: 0 0 auto; background: #fff; border-radius: 8px; padding: 8px 14px; display: flex; align-items: center; }
    .page-header .logo-area img { height: 38px; width: auto; display: block; }
    .page-header .logo-text { font-size: 20pt; font-weight: 800; letter-spacing: 1px; color: #0f62fe; }
    .page-header .logo-sub { font-size: 7.5pt; color: #6b7280; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
    .page-header .title-area { flex: 1; text-align: right; padding-left: 20px; }
    .page-header .title-area h1 { font-size: 15pt; font-weight: 700; line-height: 1.2; letter-spacing: 0.3px; }
    .page-header .title-area .cpv-badge {
      display: inline-block; margin-top: 4px; padding: 2px 12px;
      background: rgba(255,255,255,0.2); border-radius: 20px;
      font-size: 8.5pt; font-weight: 600; letter-spacing: 0.5px;
    }

    .content { padding: 20px 36px; }

    /* Título de seção */
    .doc-title { font-size: 13pt; font-weight: 700; color: #0b1220; margin-bottom: 12px; border-bottom: 2px solid #0f62fe; padding-bottom: 6px; }
    .intro-text { font-size: 8.5pt; color: #374151; margin-bottom: 5px; line-height: 1.5; }
    .intro-text strong { color: #1a1a2e; }

    /* Campos de dados */
    .field-group { margin-top: 12px; }
    .field-label { font-size: 8.5pt; font-weight: 700; color: #0f62fe; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 8px; margin-bottom: 1px; }
    .field-value { font-size: 10pt; color: #1a1a2e; margin-bottom: 2px; padding-left: 2px; }

    /* Layout lado a lado para datas e origem/destino */
    .two-col { display: flex; gap: 40px; }
    .two-col .col { flex: 1; }

    /* Página de foto */
    .photo-section-title {
      font-size: 13pt; font-weight: 700; color: #0b1220;
      margin-bottom: 6px; border-bottom: 2px solid #0f62fe; padding-bottom: 6px;
    }
    .photo-section-desc { font-size: 10pt; color: #6b7280; margin-bottom: 20px; }
    .photo-container { text-align: center; margin-top: 10px; }
    .photo-container img {
      max-width: 88%; max-height: 560px; border-radius: 10px;
      border: 2px solid #e5e7eb; box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }

    /* Página de confirmação */
    .confirm-title { font-size: 14pt; font-weight: 800; color: #0b1220; margin-bottom: 8px; text-transform: uppercase; }
    .confirm-subtitle { font-size: 11pt; font-weight: 700; color: #374151; margin-bottom: 20px; }
    .confirm-label { font-size: 10pt; color: #6b7280; margin-top: 16px; text-transform: uppercase; letter-spacing: 0.3px; }
    .confirm-value { font-size: 12pt; color: #1a1a2e; font-weight: 600; }

    /* QR Code */
    .qr-section {
      display: flex; align-items: center; gap: 28px; margin-top: 36px; padding: 24px 28px;
      background: linear-gradient(135deg, #f0f5ff 0%, #f8fafc 100%);
      border-radius: 14px; border: 2px solid #c7d2fe;
    }
    .qr-section .qr-frame {
      flex-shrink: 0; background: #fff; padding: 10px; border-radius: 12px;
      border: 2px solid #e0e7ff; box-shadow: 0 2px 8px rgba(37,99,235,0.08);
    }
    .qr-section .qr-frame img { width: 120px; height: 120px; display: block; border-radius: 4px; }
    .qr-section .qr-info { flex: 1; }
    .qr-section .qr-info .qr-title { font-size: 11pt; font-weight: 800; color: #0b1220; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
    .qr-section .qr-info .qr-title .qr-icon { font-size: 16pt; }
    .qr-section .qr-info .qr-desc { font-size: 9pt; color: #374151; line-height: 1.6; margin-bottom: 4px; }
    .qr-section .qr-info .qr-desc strong { color: #0f62fe; }
    .qr-section .qr-info .qr-cpv { font-size: 8.5pt; color: #6b7280; margin-top: 6px; font-weight: 600; letter-spacing: 0.3px; }

    /* Footer */
    .page-footer {
      position: absolute; bottom: 16px; left: 40px; right: 40px;
      text-align: center; font-size: 7.5pt; color: #9ca3af;
      border-top: 1px solid #e5e7eb; padding-top: 6px;
    }
  `;

  // ======================== PÁGINA 1 — Registro PT-BR ========================
  const pagePtBr = `
  <div class="page">
    <div class="page-header">
      ${logoAreaHtml()}
      <div class="title-area">
        <h1>Registro de TAG (ExactBag)</h1>
        <div class="cpv-badge">${cpvNumber}</div>
      </div>
    </div>

    <div class="content">
      <div class="doc-title">Registro de TAG (ExactBag)</div>

      <p class="intro-text">Prezado(a) Passageiro(a),<br/>É um prazer tê-lo(a) conosco.</p>
      <p class="intro-text">Este formulário permite o registro das informações da sua TAG ExactBag antes da viagem, garantindo mais segurança e privacidade dos seus dados, sem exposição a terceiros.</p>
      <p class="intro-text">Agradecemos a confiança. Desejamos uma excelente viagem!</p>

      <p class="intro-text" style="margin-top:16px;"><strong>Termo de Uso – Registro de TAG (ExactBag)</strong></p>
      <p class="intro-text">O Registro de TAG (ExactBag) auxilia na identificação e comprovação de propriedade da bagagem, permitindo o registro de fotos e informações que geram uma evidência digital (CPV), sem expor dados pessoais a terceiros. A ExactBag não realiza rastreamento por geolocalização.</p>
      <p class="intro-text">A ExactBag não se responsabiliza por extravios, roubos, danos, atrasos ou outros incidentes com a bagagem. O Registro de TAG (ExactBag) não garante a recuperação da bagagem, atuando apenas como ferramenta de suporte. A validade do registro acompanha o período selecionado da sua viagem na contratação.</p>
      <p class="intro-text">Caso o passageiro tenha adquirido o combo TAG ExactBag Cover, declara estar ciente de que o seguro incluso possui caráter estritamente compensatório e não substitui qualquer obrigação da companhia aérea ou de terceiros. A cobertura do seguro somente será válida mediante o cumprimento integral das regras de utilização, registro da TAG e acionamento, conforme descrito em: Termos de Uso ExactBag Cover.</p>
      <p class="intro-text">Os dados informados são protegidos conforme a LGPD e utilizados exclusivamente para a prestação do serviço e comunicações relacionadas à bagagem, não sendo compartilhados com terceiros, salvo quando necessário.</p>
      <p class="intro-text">Ao enviar o formulário, o passageiro declara estar de acordo com estes termos e confirma a veracidade das informações.</p>
      <p class="intro-text">Boa viagem com a ExactBag! ✈️👜</p>

      <div class="field-group">
        <div class="field-label">Termos e Condições</div>
        <div class="field-value">Aceito</div>

        <div class="field-label">Quantidade de Bagagens Contratadas</div>
        <div class="field-value">${registration.baggageQty || 1}</div>

        <div class="field-label">Nome Completo</div>
        <div class="field-value">${registration.passengerName}</div>

        <div class="field-label">CPF</div>
        <div class="field-value">${formatCpf(registration.passengerCpf)}</div>

        <div class="field-label">E-mail</div>
        <div class="field-value">${registration.passengerEmail}</div>

        <div class="field-label">Telefone</div>
        <div class="field-value">${registration.passengerPhone}</div>

        <div class="two-col" style="margin-top:14px;">
          <div class="col">
            <div class="field-label">Data de Ida</div>
            <div class="field-value">${formatDate(registration.outboundDate)}</div>
          </div>
          <div class="col">
            <div class="field-label">Data de Volta</div>
            <div class="field-value">${registration.returnDate ? formatDate(registration.returnDate) : "—"}</div>
          </div>
        </div>

        <div class="two-col" style="margin-top:14px;">
          <div class="col">
            <div class="field-label">Origem da Viagem</div>
            <div class="field-value">${registration.origin}</div>
          </div>
          <div class="col">
            <div class="field-label">Destino da Viagem</div>
            <div class="field-value">${registration.destination}</div>
          </div>
        </div>

        <div class="field-label">Companhia Aérea</div>
        <div class="field-value">${registration.airline || "—"}</div>
      </div>
    </div>
  </div>`;

  // ======================== PÁGINAS DE FOTOS DAS BAGAGENS ========================
  let photoPages = "";
  baggageItems.forEach((item, idx) => {
    // Foto 1 — exterior
    if (item.imageData) {
      photoPages += `
      <div class="page">
        <div class="page-header">
          ${logoAreaHtml()}
          <div class="title-area">
            <h1>Registro Fotográfico<br/>(ExactBag)</h1>
            <div class="cpv-badge">${cpvNumber}</div>
          </div>
        </div>
        <div class="content">
          <div class="photo-section-title">Bagagem ${idx + 1} — Foto Exterior</div>
          <div class="photo-section-desc">Foto do exterior da bagagem evidenciando-a de forma clara e visível.</div>
          <div class="photo-container">
            <img src="${item.imageData}" alt="Bagagem ${idx + 1} - Foto exterior" />
          </div>
        </div>
        <div class="page-footer">${cpvNumber} • Bagagem ${idx + 1} — Foto 1</div>
      </div>`;
    }
    // Foto 2 — outro ângulo
    if (item.imageData2) {
      photoPages += `
      <div class="page">
        <div class="page-header">
          ${logoAreaHtml()}
          <div class="title-area">
            <h1>Registro Fotográfico<br/>(ExactBag)</h1>
            <div class="cpv-badge">${cpvNumber}</div>
          </div>
        </div>
        <div class="content">
          <div class="photo-section-title">Bagagem ${idx + 1} — Foto Outro Ângulo</div>
          <div class="photo-section-desc">Foto do exterior da bagagem de outro ângulo, evidenciando-a de forma clara e visível.</div>
          <div class="photo-container">
            <img src="${item.imageData2}" alt="Bagagem ${idx + 1} - Foto outro ângulo" />
          </div>
        </div>
        <div class="page-footer">${cpvNumber} • Bagagem ${idx + 1} — Foto 2</div>
      </div>`;
    }
  });

  // ======================== PÁGINA CONFIRMAÇÃO — Bilíngue ========================
  const submissionId = registration.id || cpvNumber;
  const pageConfirmation = `
  <div class="page">
    <div class="page-header">
      ${logoAreaHtml()}
      <div class="title-area">
        <h1>Confirmação de Envio<br/>(ExactBag)</h1>
        <div class="cpv-badge">${cpvNumber}</div>
      </div>
    </div>
    <div class="content">
      <div class="confirm-title">O FORMULÁRIO E AS FOTOS FORAM DEVIDAMENTE TIRADAS NAS SEGUINTES DATAS</div>
      <div class="confirm-subtitle">The form and photos were duly taken on the following date and information:</div>

      <div class="confirm-label">ID e Data de Envio:</div>
      <div class="confirm-value">${submissionId}</div>
      <div class="confirm-value">${formatDate(submissionDate)}</div>

      <div class="confirm-label" style="margin-top:24px;">ID and Date of submission</div>
      <div class="confirm-value">${submissionId}</div>
      <div class="confirm-value">${formatDateEn(submissionDate)}</div>
      <div class="confirm-value">${formatDateTimeEn(submissionDate)}</div>

      ${
        qrDataUri
          ? `
      <div class="qr-section">
        <div class="qr-frame">
          <img src="${qrDataUri}" alt="QR Code CPV" />
        </div>
        <div class="qr-info">
          <div class="qr-title"><span class="qr-icon">📱</span> Consulta Digital / Digital Check</div>
          <p class="qr-desc"><strong>Aponte a câmera do celular</strong> para o QR Code ao lado para consultar seu CPV online a qualquer momento.</p>
          <p class="qr-desc"><strong>Point your phone camera</strong> at the QR Code to check your CPV online anytime.</p>
          <div class="qr-cpv">CPV: ${cpvNumber}</div>
        </div>
      </div>`
          : ""
      }
    </div>
  </div>`;

  // ======================== PÁGINA EN — Registro em Inglês ========================
  const pageEn = `
  <div class="page">
    <div class="page-header">
      ${logoAreaHtml()}
      <div class="title-area">
        <h1>Digital Service Registration<br/>(ExactBag)</h1>
        <div class="cpv-badge">${cpvNumber}</div>
      </div>
    </div>

    <div class="content">
      <div class="doc-title">ExactBag Digital Service Registration</div>

      <p class="intro-text">Dear Passenger,<br/>It's a pleasure to have you with us.</p>
      <p class="intro-text">This form allows us to register your ExactBag Digital Service information before your trip, ensuring greater security and privacy of your data, without exposure to third parties.</p>
      <p class="intro-text">Thank you for your trust. We wish you an excellent trip!</p>

      <p class="intro-text" style="margin-top:16px;"><strong>Terms of Use – Digital Baggage Identification Service</strong></p>
      <p class="intro-text">The ExactBag Digital Service assists in identifying and proving ownership of baggage, allowing the registration of photos and information that generate digital evidence (CPV), without exposing personal data to third parties. ExactBag does not perform geolocation tracking.</p>
      <p class="intro-text">ExactBag is not responsible for lost, stolen, damaged, delayed, or other incidents involving baggage. The use of the Digital Service does not guarantee baggage recovery, acting only as a support tool. The validity of the registration corresponds to the selected period of your trip when contracting the service.</p>
      <p class="intro-text">If the passenger has purchased the ExactBag Cover TAG bundle, they acknowledge that the included insurance is strictly compensatory in nature and does not replace any obligation of the airline or third parties. Insurance coverage will only be valid upon full compliance with the rules for TAG usage, registration, and claim activation, as described in: ExactBag Cover Terms of Use.</p>
      <p class="intro-text">The data provided is protected in accordance with the LGPD (Brazilian General Data Protection Law) and used exclusively for the provision of the service and communications related to baggage, and will not be shared with third parties, except when necessary.</p>
      <p class="intro-text">By submitting the form, the passenger declares to agree to these terms and confirms the veracity of the information.</p>
      <p class="intro-text">Have a good trip with ExactBag! ✈️👜</p>

      <div class="field-group">
        <div class="field-label">Terms and Conditions</div>
        <div class="field-value">Accepted</div>

        <div class="field-label">Number of Contracted Bags</div>
        <div class="field-value">${registration.baggageQty || 1}</div>

        <div class="field-label">Full Name</div>
        <div class="field-value">${registration.passengerName}</div>

        <div class="field-label">CPF (Tax ID)</div>
        <div class="field-value">${formatCpf(registration.passengerCpf)}</div>

        <div class="field-label">E-mail</div>
        <div class="field-value">${registration.passengerEmail}</div>

        <div class="field-label">Phone</div>
        <div class="field-value">${registration.passengerPhone}</div>

        <div class="two-col" style="margin-top:14px;">
          <div class="col">
            <div class="field-label">Departure Date</div>
            <div class="field-value">${formatDate(registration.outboundDate)}</div>
          </div>
          <div class="col">
            <div class="field-label">Return Date</div>
            <div class="field-value">${registration.returnDate ? formatDate(registration.returnDate) : "—"}</div>
          </div>
        </div>

        <div class="two-col" style="margin-top:14px;">
          <div class="col">
            <div class="field-label">Trip Origin</div>
            <div class="field-value">${registration.origin}</div>
          </div>
          <div class="col">
            <div class="field-label">Trip Destination</div>
            <div class="field-value">${registration.destination}</div>
          </div>
        </div>

        <div class="field-label">Airline</div>
        <div class="field-value">${registration.airline || "—"}</div>
      </div>
    </div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<style>${css}</style>
</head>
<body>
${pagePtBr}
${photoPages}
${pageConfirmation}
${pageEn}
</body>
</html>`;
};

// ======================== BROWSER SINGLETON ========================
// Reutiliza uma instância do browser durante picos de uso
// Auto-fecha após 60s de inatividade para liberar ~150MB de RAM
let _browser = null;
let _browserLaunchPromise = null;
let _browserIdleTimer = null;
const BROWSER_IDLE_TIMEOUT = 60 * 1000; // 60s sem uso → fecha Chromium

function _resetBrowserIdleTimer() {
  if (_browserIdleTimer) clearTimeout(_browserIdleTimer);
  _browserIdleTimer = setTimeout(async () => {
    if (_browser) {
      console.log(
        "[CpvPdfService] Chromium ocioso por 60s — fechando para liberar RAM",
      );
      await closeBrowser();
    }
  }, BROWSER_IDLE_TIMEOUT);
  if (_browserIdleTimer.unref) _browserIdleTimer.unref();
}

async function getBrowser() {
  if (_browser?.connected) {
    _resetBrowserIdleTimer();
    return _browser;
  }

  // Evita múltiplos launches simultâneos
  if (_browserLaunchPromise) return _browserLaunchPromise;

  _browserLaunchPromise = (async () => {
    const existsSync = require("fs").existsSync;
    let executablePath = null;
    let chromiumArgs = [];
    const isProduction = process.env.NODE_ENV === "production";

    // 1) Dev local: puppeteer completo com Chromium embutido
    if (!isProduction) {
      try {
        const fullPuppeteer = require("puppeteer");
        const p = fullPuppeteer.executablePath();
        if (p && existsSync(p)) executablePath = p;
      } catch (_) {}
    }

    // 2) Produção (Docker): @sparticuz/chromium
    if (!executablePath) {
      try {
        // v149 exposes the Chromium class through the default export in CommonJS.
        const chromiumModule = require("@sparticuz/chromium");
        const chromium = chromiumModule.default || chromiumModule;
        const p = await chromium.executablePath();
        if (p && existsSync(p)) {
          executablePath = p;
          chromiumArgs = chromium.args || [];
        }
      } catch (_) {}
    }

    // 3) Fallback: Chrome do sistema
    if (!executablePath) {
      const possiblePaths = [
        process.env.CHROME_PATH,
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
      ].filter(Boolean);
      executablePath = possiblePaths.find((p) => existsSync(p)) || null;
    }

    if (!executablePath) return null;

    const puppeteer = require("puppeteer-core");
    _browser = await puppeteer.launch({
      headless: "new",
      executablePath,
      args: [
        ...chromiumArgs,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    _browser.on("disconnected", () => {
      _browser = null;
    });
    _resetBrowserIdleTimer();
    return _browser;
  })().finally(() => {
    _browserLaunchPromise = null;
  });

  return _browserLaunchPromise;
}

async function closeBrowser() {
  if (_browserIdleTimer) {
    clearTimeout(_browserIdleTimer);
    _browserIdleTimer = null;
  }
  if (_browser) {
    try {
      await _browser.close();
    } catch (_) {}
    _browser = null;
  }
}

/**
 * Gera o buffer PDF do CPV a partir do HTML.
 * Usa browser singleton para performance.
 */
const generateCpvPdf = async (registration) => {
  const cpvNumber = registration.cpvNumber || generateCpvNumber();
  const htmlGenerator = registration.isPhysicalTag
    ? generateCpvHtmlForPhysicalTag
    : generateCpvHtml;
  const html = await htmlGenerator({ ...registration, cpvNumber });

  const browser = await getBrowser();
  if (!browser) {
    console.warn(
      "[CpvPdfService] Nenhum Chrome/Chromium encontrado, retornando HTML fallback",
    );
    return {
      cpvNumber,
      pdfBuffer: Buffer.from(html, "utf-8"),
      html,
      isHtmlFallback: true,
    };
  }

  let page;
  try {
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 15000 });
    const pdfResult = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
      timeout: 15000,
    });

    const pdfBuffer = Buffer.from(pdfResult);
    return { cpvNumber, pdfBuffer, html };
  } catch (_err) {
    console.warn("[CpvPdfService] Falha ao gerar PDF:", _err.message);
    // Se o browser morreu, limpa referência para re-launch na próxima
    if (_browser && !_browser.connected) _browser = null;
    return {
      cpvNumber,
      pdfBuffer: Buffer.from(html, "utf-8"),
      html,
      isHtmlFallback: true,
    };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (_) {}
    }
  }
};

module.exports = {
  generateCpvNumber,
  generateCpvHtml,
  generateCpvPdf,
  closeBrowser,
};
