/* Deterministic tests for the Agenda-backed business job adapter and handlers. */

const assert = require("assert");

process.env.NODE_ENV = "test";

const agendaClientPath = require.resolve("../src/jobs/agendaClient");
const saleServicePath =
  require.resolve("../src/services/saleProcessingService");
const callbackServicePath =
  require.resolve("../src/services/partnerCallbackService");

let queryResult = { jobs: [], total: 0 };
const fakeAgenda = {
  create(name, data) {
    return {
      attrs: { name, data },
      unique(value, options) {
        this.uniqueValue = value;
        this.uniqueOptions = options;
        return this;
      },
      schedule(value) {
        this.attrs.nextRunAt = value;
        return this;
      },
      async save() {
        this.attrs._id = "11111111-1111-4111-8111-111111111111";
        return this;
      },
    };
  },
  async queryJobs() {
    return queryResult;
  },
  databasePool: {
    async query() {
      return { rowCount: 0 };
    },
  },
};
require.cache[agendaClientPath] = {
  id: agendaClientPath,
  filename: agendaClientPath,
  loaded: true,
  exports: fakeAgenda,
};

let processedSale = null;
require.cache[saleServicePath] = {
  id: saleServicePath,
  filename: saleServicePath,
  loaded: true,
  exports: {
    processPartnerSale: async (data) => {
      processedSale = data;
    },
  },
};

let callbackInput = null;
let callbackResult = { success: true };
require.cache[callbackServicePath] = {
  id: callbackServicePath,
  filename: callbackServicePath,
  loaded: true,
  exports: {
    executeCallback: async (data) => {
      callbackInput = data;
      return callbackResult;
    },
  },
};

const jobService = require("../src/jobs/agendaJobService");
const processPartnerSaleHandler = require("../src/jobs/processPartnerSaleHandler");
const partnerCallbackHandler = require("../src/jobs/partnerCallbackHandler");

(async () => {
  const saved = await jobService.enqueueUniqueJob({
    name: "processPartnerSale",
    data: {
      partnerId: "PARTNER",
      saleId: "SALE-1",
      customerEmail: "secret@example.com",
    },
    dedupeKey: "processPartnerSale:PARTNER:SALE-1",
    maxAttempts: 3,
  });
  assert.strictEqual(
    String(saved.attrs._id),
    "11111111-1111-4111-8111-111111111111",
  );
  assert.deepStrictEqual(saved.uniqueValue, {
    "data.dedupeKey": "processPartnerSale:PARTNER:SALE-1",
  });
  assert.strictEqual(saved.uniqueOptions.insertOnly, true);

  queryResult = {
    jobs: [
      {
        _id: "22222222-2222-4222-8222-222222222222",
        name: "processPartnerSale",
        data: {
          partnerId: "PARTNER",
          dedupeKey: "processPartnerSale:PARTNER:SALE-1",
        },
      },
    ],
    total: 1,
  };
  const originalCreate = fakeAgenda.create;
  fakeAgenda.create = (name, data) => {
    const duplicate = originalCreate.call(fakeAgenda, name, data);
    duplicate.save = async () => {
      const error = new Error("duplicate key");
      error.code = "23505";
      throw error;
    };
    return duplicate;
  };
  const duplicate = await jobService.enqueueUniqueJob({
    name: "processPartnerSale",
    data: { partnerId: "PARTNER", saleId: "SALE-1" },
    dedupeKey: "processPartnerSale:PARTNER:SALE-1",
    maxAttempts: 3,
  });
  assert.strictEqual(
    String(duplicate.attrs._id),
    "22222222-2222-4222-8222-222222222222",
  );
  fakeAgenda.create = originalCreate;

  await processPartnerSaleHandler({ attrs: { data: { saleId: "SALE-1" } } });
  assert.deepStrictEqual(processedSale, { saleId: "SALE-1" });

  await partnerCallbackHandler({
    attrs: { data: { partnerId: "PARTNER", maxAttempts: 2 }, failCount: 1 },
  });
  assert.strictEqual(callbackInput.attempt, 1);
  assert.strictEqual(callbackInput.maxAttempts, 2);

  callbackResult = { success: false, retry: true };
  await assert.rejects(
    () =>
      partnerCallbackHandler({
        attrs: { data: { partnerId: "PARTNER", maxAttempts: 2 }, failCount: 0 },
      }),
    /retry requested/,
  );
  callbackResult = { success: false, retry: false };
  await assert.rejects(
    () =>
      partnerCallbackHandler({
        attrs: { data: { partnerId: "PARTNER", maxAttempts: 2 }, failCount: 1 },
      }),
    /attempts exhausted/,
  );

  const serialized = jobService.serializeJob({
    _id: "11111111-1111-4111-8111-111111111111",
    name: "PARTNER_CALLBACK",
    state: "scheduled",
    failCount: 1,
    nextRunAt: new Date("2026-08-31T12:00:00Z"),
    data: {
      partnerId: "PARTNER",
      webhookUrl: "https://secret.example.com",
      payload: {
        event: "customer.registration.completed",
        saleId: "SALE-1",
        signature: "secret",
      },
      _jobMeta: { queuedAt: "2026-08-31T10:00:00.000Z", maxAttempts: 2 },
    },
  });
  assert.strictEqual(serialized.status, "retrying");
  assert.strictEqual(serialized.data.saleId, "SALE-1");
  assert.strictEqual(serialized.data.webhookUrl, undefined);
  assert.strictEqual(serialized.data.signature, undefined);
  assert.strictEqual(
    jobService.mapAgendaStatus({
      state: "running",
      lockedAt: new Date(),
      failCount: 1,
      nextRunAt: new Date(),
    }),
    "running",
  );

  queryResult = {
    jobs: [
      {
        _id: "11111111-1111-4111-8111-111111111111",
        name: "processPartnerSale",
        state: "queued",
        data: { partnerId: "OTHER", saleId: "SALE-2" },
      },
    ],
    total: 1,
  };
  assert.strictEqual(
    await jobService.getJobById(
      "11111111-1111-4111-8111-111111111111",
      "PARTNER",
    ),
    null,
    "partners must not inspect each other jobs",
  );
  assert.strictEqual(
    await jobService.getJobById("legacy-job-id", "PARTNER"),
    null,
  );

  console.log("Agenda business job migration tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
