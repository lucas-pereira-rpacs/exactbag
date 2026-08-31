const vesperaScheduler = require('../services/vesperaScheduler');

/** @param {import('agenda').Job} _job */
async function outboundNotificationHandler(_job) {
  await vesperaScheduler.run();
}

module.exports = outboundNotificationHandler;
