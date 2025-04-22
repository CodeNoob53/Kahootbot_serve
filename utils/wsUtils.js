// utils/wsUtils.js
const logger = require('./logger');

// Handle incoming WebSocket messages
function handleWebSocketMessage(message, ws, clientId) {
  try {
    const msgData = JSON.parse(message.toString());
    
    switch (msgData.type) {
      case 'ping':
        // Respond to ping messages
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: Date.now()
        }));
        break;
        
      case 'log':
        // Log messages from clients
        logger.info(`Client ${clientId} log: ${msgData.message}`);
        break;
        
      default:
        logger.debug(`Received message from client ${clientId}: ${message.toString().substring(0, 100)}`);
    }
  } catch (error) {
    logger.error(`Error handling WebSocket message: ${error.message}`);
  }
}

module.exports = {
  handleWebSocketMessage
};