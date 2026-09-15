const crypto = require("crypto");

const DEFAULT_TTL_DAYS = Number(process.env.PUBLIC_FORM_LINK_TTL_DAYS || 30);

const toBase64Url = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? `${base64}${"=".repeat(4 - pad)}` : base64;
  return Buffer.from(padded, "base64").toString("utf8");
};

const getSecret = () => {
  const secret = process.env.PUBLIC_FORM_LINK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PUBLIC_FORM_LINK_SECRET deve ser configurado em produção",
      );
    }
    return "dev_only_form_link_secret_not_for_production";
  }
  return secret;
};

const sign = (payload) =>
  toBase64Url(
    crypto.createHmac("sha256", getSecret()).update(payload).digest(),
  );

const createFormAccessToken = (saleId, ttlDays = DEFAULT_TTL_DAYS) => {
  const expiresAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  const payload = JSON.stringify({ s: saleId, exp: expiresAt });
  const encodedPayload = toBase64Url(payload);
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
};

const verifyFormAccessToken = (token) => {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { valid: false, error: "invalid_token" };
  }

  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) {
    return { valid: false, error: "invalid_token_format" };
  }

  const expected = sign(encodedPayload);
  const givenBuffer = Buffer.from(encodedSignature);
  const expectedBuffer = Buffer.from(expected);

  if (
    givenBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(givenBuffer, expectedBuffer)
  ) {
    return { valid: false, error: "invalid_signature" };
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload));
    if (!parsed?.s || !parsed?.exp) {
      return { valid: false, error: "invalid_payload" };
    }

    if (Date.now() > Number(parsed.exp)) {
      return { valid: false, error: "expired_token" };
    }

    return {
      valid: true,
      saleId: String(parsed.s),
      expiresAt: Number(parsed.exp),
    };
  } catch (_error) {
    return { valid: false, error: "invalid_payload_json" };
  }
};

const getPublicBaseUrl = (req) => {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  }
  return `${req.protocol}://${req.get("host")}`;
};

const buildPublicFormUrl = (req, saleId) => {
  const token = createFormAccessToken(saleId);
  return `${getPublicBaseUrl(req)}/f/${token}`;
};

const slugify = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const generateUniqueSlug = (customerName) => {
  const base = slugify(customerName) || "cliente";
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
};

const parsePrettySlug = (slug) => {
  return slug.replace(/-/g, " ").trim();
};

const buildPrettyPublicFormUrl = (req, slug) => {
  return `${getPublicBaseUrl(req)}/form/${slug}`;
};

module.exports = {
  createFormAccessToken,
  verifyFormAccessToken,
  buildPublicFormUrl,
  parsePrettySlug,
  generateUniqueSlug,
  buildPrettyPublicFormUrl,
};
