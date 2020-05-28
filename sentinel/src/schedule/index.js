const moment = require('moment');
const config = require('../config');
const transitionsLib = config.getTransitionsLib();
const date = transitionsLib.date;
const logger = require('../lib/logger');

const jobs = {
  dueTasks: {
    execute: cb => {
      if (module.exports._sendable(config, moment(date.getDate()))) {
        transitionsLib.dueTasks.execute(cb);
      } else {
        cb();
      }
    }
  },
  reminders: require('./reminders'),
  replications: require('./replications'),
  outbound: require('./outbound'),
  purging: require('./purging'),
  backgroundCleanup: require('./background-cleanup')
};
const ongoingJobs = new Set();

const getTime = (h, m) => moment(0).hours(h).minutes(m);

/*
 * Return true if within time window to set outgoing/pending tasks/messages.
 */
const sendable = (config, now) => {
  const afterHours = config.get('schedule_morning_hours') || 0;
  const afterMinutes = config.get('schedule_morning_minutes') || 0;
  const untilHours = config.get('schedule_evening_hours') || 23;
  const untilMinutes = config.get('schedule_evening_minutes') || 0;

  now = getTime(now.hours(), now.minutes());
  const after = getTime(afterHours, afterMinutes);
  const until = getTime(untilHours, untilMinutes);

  return now >= after && now <= until;
};

const init = () => {
  Object.keys(jobs).forEach(jobName => {
    if (ongoingJobs.has(jobName)) {
      logger.info(`Skipping Job ${jobName} as it's still running`);
    } else {
      ongoingJobs.add(jobName);

      logger.info(`Job ${jobName} started`);
      jobs[jobName].execute(function(err) {
        ongoingJobs.delete(jobName);

        if (err) {
          logger.error(`Job ${jobName} completed with error: ${err}`);
        } else {
          logger.info(`Job ${jobName} completed`);
        }
      });
    }
  });
};

module.exports = {
  init: () => {
    logger.info('Job Scheduler initiated');
    init();
    setInterval(init, 1000 * 60 * 5);
  },
  _sendable: sendable
};
