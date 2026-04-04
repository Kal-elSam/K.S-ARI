/**
 * Punto de entrada del webhook WhatsApp: reexporta handlers desde features.
 * La lógica vive en api/src/features para mantener archivos bajo ~250 líneas.
 */
const { handleBookingFlow } = require('../features/booking/services/bookingFlowService');
const { handleGeneralState } = require('../features/conversation/services/generalStateService');
const { handleClientMessage } = require('../features/conversation/services/clientMessageService');
const { handleOwnerMessage } = require('../features/owner/services/ownerMessageService');

module.exports = {
  handleBookingFlow,
  handleGeneralState,
  handleClientMessage,
  handleOwnerMessage,
};
