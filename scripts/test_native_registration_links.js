const assert = require("assert");

const originalBaseUrl = process.env.APP_BASE_URL;
process.env.APP_BASE_URL = "https://example.test/base/";

const {
  buildNativeRegistrationLink,
  getAppBaseUrl,
} = require("../src/services/nativeRegistrationLinkService");

assert.strictEqual(getAppBaseUrl(), "https://example.test/base");
assert.strictEqual(
  buildNativeRegistrationLink("SALE 123"),
  "https://example.test/registrodebagagem?saleId=SALE+123",
);

if (originalBaseUrl === undefined) {
  delete process.env.APP_BASE_URL;
} else {
  process.env.APP_BASE_URL = originalBaseUrl;
}

console.log("Native registration link tests passed.");
