const moment = require('moment');
const config = require('../config');
const transitionsLib = config.getTransitionsLib();
const date = transitionsLib.date;
const logger = require('../lib/logger');

const tasks = {
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
  background: require('./background-cleanup')
};
const ongoingTasks = new Set();

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
  Object.keys(tasks).forEach(taskName => {
    if (ongoingTasks.has(taskName)) {
      logger.debug(`Skipping Task ${taskName} as it's still running`);
    } else {
      ongoingTasks.add(taskName);

      logger.info(`Task ${taskName} started`);
      tasks[taskName].execute(function(err) {
        ongoingTasks.delete(taskName);

        if (err) {
          logger.error(`Task ${taskName} completed with error: ${err}`);
        } else {
          logger.info(`Task ${taskName} completed`);
        }
      });
    }
  });
};

module.exports = {
  init: () => {
    logger.info('Scheduler initiated');
    init();
    setInterval(init, 1000 * 60 * 5);
  },
  _sendable: sendable
};
