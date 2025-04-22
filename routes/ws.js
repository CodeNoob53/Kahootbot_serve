// routes/ws.js
const WebSocket = require('ws');
const url = require('url');
const logger = require('../utils/logger');
const { handleWebSocketMessage } = require('../utils/wsUtils');

// Map to store client connections
const clients = new Map();

function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws, req) => {
    const id = url.parse(req.url, true).query.id || 'unknown';
    clients.set(id, ws);
    
    logger.info(`WebSocket client connected: ${id}`);
    
    ws.on('message', (message) => {
      handleWebSocketMessage(message, ws, id);
    });
    
    ws.on('close', () => {
      logger.info(`WebSocket client disconnected: ${id}`);
      clients.delete(id);
    });
    
    // Send initial connection acknowledgment
    ws.send(JSON.stringify({
      type: 'connection',
      status: 'connected',
      id: id,
      timestamp: new Date().toISOString()
    }));
  });
  
  return wss;
}

// Send message to specific client
function sendToClient(clientId, message) {
  const client = clients.get(clientId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
    return true;
  }
  return false;
}

// Broadcast message to all clients
function broadcast(message) {
  for (const [id, client] of clients.entries()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
}

module.exports = { setupWebSocketServer, sendToClient, broadcast };