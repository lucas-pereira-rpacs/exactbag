const DEFAULT_APP_BASE_URL = "https://app.exactbag.com.br";

const getAppBaseUrl = () =>
  (process.env.APP_BASE_URL || DEFAULT_APP_BASE_URL).replace(/\/+$/, "");

const buildNativeRegistrationLink = (saleId) => {
  const url = new URL("/registrodebagagem", getAppBaseUrl());
  url.searchParams.set("saleId", String(saleId || ""));
  return url.toString();
};

module.exports = {
  buildNativeRegistrationLink,
  getAppBaseUrl,
};
