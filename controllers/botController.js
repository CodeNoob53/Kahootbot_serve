// controllers/botController.js
const { v4: uuidv4 } = require('uuid');
const BotManager = require('../models/BotManager');
const logger = require('../utils/logger');
const { sendToClient } = require('../routes/ws');

// Start a new bot
exports.startBot = async (req, res) => {
  try {
    const { name, pin, useML, useSearch } = req.body;
    
    // Validate input
    if (!name || !pin) {
      return res.status(400).json({
        success: false,
        message: 'Name and PIN are required'
      });
    }
    
    // Create a unique bot ID
    const botId = uuidv4();
    
    // Create bot configuration
    const config = {
      id: botId,
      name,
      pin,
      useML: useML !== false,
      useSearch: useSearch !== false,
      onLog: (message, type) => {
        sendToClient(botId, {
          type: 'log',
          logType: type || 'info',
          message,
          timestamp: new Date().toISOString()
        });
      }
    };
    
    // Start the bot
    const botManager = BotManager.getInstance();
    const startResult = await botManager.startBot(config);
    
    if (startResult.success) {
      logger.info(`Bot started with ID: ${botId}`);
      return res.status(201).json({
        success: true,
        botId,
        message: 'Bot started successfully'
      });
    } else {
      logger.error(`Failed to start bot: ${startResult.message}`);
      return res.status(400).json({
        success: false,
        message: startResult.message
      });
    }
  } catch (error) {
    logger.error(`Error starting bot: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Stop a bot
exports.stopBot = async (req, res) => {
  try {
    const { botId } = req.body;
    
    if (!botId) {
      return res.status(400).json({
        success: false,
        message: 'Bot ID is required'
      });
    }
    
    const botManager = BotManager.getInstance();
    const stopResult = await botManager.stopBot(botId);
    
    if (stopResult.success) {
      logger.info(`Bot stopped: ${botId}`);
      return res.json({
        success: true,
        message: 'Bot stopped successfully'
      });
    } else {
      logger.error(`Failed to stop bot: ${stopResult.message}`);
      return res.status(400).json({
        success: false,
        message: stopResult.message
      });
    }
  } catch (error) {
    logger.error(`Error stopping bot: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get status of a specific bot
exports.getBotStatus = (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Bot ID is required'
      });
    }
    
    const botManager = BotManager.getInstance();
    const botStatus = botManager.getBotStatus(id);
    
    if (botStatus) {
      return res.json({
        success: true,
        status: botStatus
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'Bot not found'
      });
    }
  } catch (error) {
    logger.error(`Error getting bot status: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all active bots
exports.getAllBots = (req, res) => {
  try {
    const botManager = BotManager.getInstance();
    const bots = botManager.getAllBots();
    
    return res.json({
      success: true,
      count: bots.length,
      bots
    });
  } catch (error) {
    logger.error(`Error getting all bots: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};