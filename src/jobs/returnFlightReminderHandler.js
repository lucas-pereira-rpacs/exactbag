const returnFlightScheduler = require('../services/returnFlightScheduler');

/** @param {import('agenda').Job} _job */
async function returnFlightReminderHandler(_job) {
  await returnFlightScheduler.run();
}

module.exports = returnFlightReminderHandler;
