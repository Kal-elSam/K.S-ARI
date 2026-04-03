/**
 * Punto de entrada del webhook WhatsApp: reexporta handlers desde features.
 * La lógica vive en api/src/features para mantener archivos bajo ~250 líneas.
 */
const { handleBookingFlow } = require('../features/booking/services/bookingFlowService');
const { handleGeneralState } = require('../features/conversation/services/generalStateService');

module.exports = {
  handleBookingFlow,
  handleGeneralState,
};
