/**
 * API pública del módulo social: reexporta constantes, helpers, contenido,
 * Graph API, autopublicación y programación para no romper imports existentes.
 */
const socialConstants = require('./socialConstants');
const socialHelpers = require('./socialHelpers');
const socialContent = require('./socialContent');
const socialGraphApi = require('./socialGraphApi');
const socialAutoPublish = require('./socialAutoPublish');
const socialScheduleConfig = require('./socialScheduleConfig');
const socialScheduler = require('./socialScheduler');
const { scheduledSocialTimeouts } = require('./socialState');

module.exports = {
  ...socialConstants,
  ...socialHelpers,
  ...socialContent,
  ...socialGraphApi,
  ...socialAutoPublish,
  ...socialScheduleConfig,
  ...socialScheduler,
  scheduledSocialTimeouts,
};
