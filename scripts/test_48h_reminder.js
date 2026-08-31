/*
 * Deterministic smoke test for the 48-hour purchase reminder.
 * Run with: node scripts/test_48h_reminder.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';

const realDate = Date;
let currentTime = realDate.parse('2026-08-23T12:00:00.000Z');

class FrozenDate extends realDate {
  constructor(...args) {
    super(args.length === 0 ? currentTime : args[0]);
  }

  static now() {
    return currentTime;
  }
}

global.Date = FrozenDate;

const sales = new Map();
const reminders = [];
const updates = [];
const physicalTagOrders = [];
const physicalTagReceipts = [];
let returnStaleFetch = false;

const prismaMock = {
  async $queryRaw(_query, windowStart, windowEnd) {
    return physicalTagOrders.filter((order) => {
      const outbound = new realDate(order.outboundDate).getTime();
      return order.receiptSentAt === null
        && outbound >= windowStart.getTime()
        && outbound <= windowEnd.getTime();
    });
  },
  async $executeRaw(_query, orderId) {
    const order = physicalTagOrders.find(item => item.id === orderId);
    if (!order || order.receiptSentAt) return 0;
    order.receiptSentAt = new realDate(currentTime);
    return 1;
  },
  sale: {
    async findMany({ where }) {
      return Array.from(sales.values()).map((sale) => {
        if (returnStaleFetch) return { ...sale, status: 'processed', vesperaSentAt: null };
        return sale;
      }).filter((sale) => {
        const outbound = new realDate(sale.outboundDate).getTime();
        return sale.status === where.status
          && sale.vesperaSentAt === null
          && outbound >= where.outboundDate.gte.getTime()
          && outbound <= where.outboundDate.lte.getTime();
      });
    },
    async findUnique({ where }) {
      return sales.get(where.id) || null;
    },
    async update({ where, data }) {
      const sale = sales.get(where.id);
      Object.assign(sale, data);
      updates.push({ id: where.id, data });
      return sale;
    }
  }
};

const config = require('../src/config');
config.prisma = prismaMock;

const scheduler = require('../src/services/vesperaScheduler');
const notificationService = require('../src/services/notificationService');
const emailGateway = require('../src/gateways/emailGateway');
notificationService.sendPurchaseReminderNotification = async (customer, sale, link) => {
  reminders.push({ customer, sale, link });
  return { success: true };
};
emailGateway.sendPhysicalTagReceiptEmail = async (order) => {
  physicalTagReceipts.push(order);
  return true;
};

const flightTime = currentTime + (48 * 60 * 60 * 1000);
const sale = {
  id: 'sale-time-boundary',
  customerName: 'Maria Teste',
  customerEmail: 'maria@example.com',
  customerPhone: '+5511999999999',
  partnerId: 'PARTNER-TEST',
  status: 'processed',
  outboundDate: new realDate(flightTime),
  vesperaSentAt: null,
  formLink: 'https://example.com/registro',
  partner: { isSandbox: false }
};
sales.set(sale.id, sale);

async function runAt(hoursFromBase) {
  currentTime = realDate.parse('2026-08-23T12:00:00.000Z') + (hoursFromBase * 60 * 60 * 1000);
  reminders.length = 0;
  updates.length = 0;
  sale.vesperaSentAt = null;
  await scheduler.run();
  return { reminders: reminders.length, updates: updates.length };
}

(async () => {
  assert.deepStrictEqual(await runAt(-2), { reminders: 0, updates: 0 }, '50h before must not send');
  assert.deepStrictEqual(await runAt(-1), { reminders: 1, updates: 1 }, '49h before must send');
  assert.deepStrictEqual(await runAt(0), { reminders: 1, updates: 1 }, '48h before must send');
  assert.deepStrictEqual(await runAt(1), { reminders: 1, updates: 1 }, '47h before must send');
  assert.deepStrictEqual(await runAt(2), { reminders: 0, updates: 0 }, '46h before must not send');

  currentTime = realDate.parse('2026-08-23T12:00:00.000Z');
  sale.vesperaSentAt = null;
  reminders.length = 0;
  await scheduler.run();
  await scheduler.run();
  assert.strictEqual(reminders.length, 1, 'a sent reminder must be deduplicated');

  sale.vesperaSentAt = null;
  sale.partner = { isSandbox: false };
  const originalStatus = sale.status;
  sale.status = 'cancelada';
  returnStaleFetch = true;
  reminders.length = 0;
  updates.length = 0;
  await scheduler.run();
  assert.deepStrictEqual({ reminders: reminders.length, updates: updates.length }, { reminders: 0, updates: 0 }, 'cancelled sales must not receive reminders');
  returnStaleFetch = false;
  sale.status = originalStatus;

  sale.vesperaSentAt = null;
  sale.partner = { isSandbox: true };
  reminders.length = 0;
  updates.length = 0;
  await scheduler.run();
  assert.deepStrictEqual({ reminders: reminders.length, updates: updates.length }, { reminders: 0, updates: 0 }, 'sandbox partners must be suppressed');

  currentTime = realDate.parse('2026-08-23T12:00:00.000Z');
  physicalTagOrders.push({
    id: 'physical-order-time-boundary',
    orderNumber: 1001,
    product: 'exactbag-essencial',
    customerName: 'Cliente Tag',
    customerEmail: 'tag@example.com',
    quantity: 1,
    hasInsurance: false,
    notes: null,
    outboundDate: new realDate(currentTime + (48 * 60 * 60 * 1000)),
    receiptSentAt: null
  });
  await scheduler.run();
  await scheduler.run();
  assert.strictEqual(physicalTagReceipts.length, 1, 'physical tag receipt must be sent once in the 48h window');
  assert(physicalTagOrders[0].receiptSentAt, 'physical tag receipt must be marked as sent');

  const template = fs.readFileSync(path.resolve(__dirname, '..', 'email_template_confirmacao_compra.html'), 'utf8');
  assert(template.includes('Compra e reserva confirmadas'));
  assert(template.includes('{{texto_entrega}}'), 'confirmation template must render the reservation variant');
  assert(template.includes('Orientações gerais'));
  assert(!template.includes('Ã'), 'confirmation template must not contain mojibake');

  global.Date = realDate;
  console.log('48-hour reminder smoke test passed.');
})().catch((error) => {
  global.Date = realDate;
  console.error(error.message);
  process.exitCode = 1;
});
