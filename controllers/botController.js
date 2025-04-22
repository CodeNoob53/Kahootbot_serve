// controllers/botController.js
const { v4: uuidv4 } = require('uuid');
const BotManager = require('../models/BotManager');

// Start a new bot
exports.startBot = async (req, res) => {
  try {
    const { name, pin, useML, useSearch } = req.body;
    
    console.log(`Starting bot with PIN: ${pin}, Name: ${name}`);
    
    // Validate input
    if (!name || !pin) {
      return res.status(400).json({
        success: false,
        message: 'Name and PIN are required'
      });
    }
    
    // Basic PIN validation
    if (!/^\d{6,10}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid PIN format. PIN must be 6-10 digits'
      });
    }
    
    // Create a unique bot ID
    const botId = uuidv4();
    
    // Create bot configuration (simplified, no ML/Search)
    const config = {
      id: botId,
      name,
      pin,
      onLog: (message, type) => {
        console.log(`[Bot ${botId}] [${type || 'INFO'}] ${message}`);
      }
    };
    
    console.log("Bot manager obtaining...");
    // Start the bot
    const botManager = BotManager.getInstance();
    console.log("Bot manager obtained, starting bot...");
    const startResult = await botManager.startBot(config);
    
    console.log(`Start result: ${JSON.stringify(startResult)}`);
    
    if (startResult.success) {
      console.log(`Bot started with ID: ${botId}`);
      return res.status(201).json({
        success: true,
        botId,
        message: 'Bot started successfully'
      });
    } else {
      console.log(`Failed to start bot: ${startResult.message}`);
      return res.status(400).json({
        success: false,
        message: startResult.message
      });
    }
  } catch (error) {
    console.error(`DETAILED ERROR: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error.message}`
    });
  }
};

// Stop a bot
exports.stopBot = async (req, res) => {
  try {
    const { botId } = req.body;
    
    console.log(`Stopping bot: ${botId}`);
    
    if (!botId) {
      return res.status(400).json({
        success: false,
        message: 'Bot ID is required'
      });
    }
    
    const botManager = BotManager.getInstance();
    const stopResult = await botManager.stopBot(botId);
    
    if (stopResult.success) {
      console.log(`Bot stopped: ${botId}`);
      return res.json({
        success: true,
        message: 'Bot stopped successfully'
      });
    } else {
      console.log(`Failed to stop bot: ${stopResult.message}`);
      return res.status(400).json({
        success: false,
        message: stopResult.message
      });
    }
  } catch (error) {
    console.error(`Error stopping bot: ${error.message}`);
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
    
    console.log(`Getting status for bot: ${id}`);
    
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
    console.error(`Error getting bot status: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all active bots
exports.getAllBots = (req, res) => {
  try {
    console.log('Getting all bots');
    const botManager = BotManager.getInstance();
    const bots = botManager.getAllBots();
    
    return res.json({
      success: true,
      count: bots.length,
      bots
    });
  } catch (error) {
    console.error(`Error getting all bots: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Add test endpoint for direct Kahoot testing
exports.testKahoot = async (req, res) => {
  try {
    const { pin } = req.params;
    console.log(`Testing direct Kahoot connection for PIN: ${pin}`);
    
    const KahootService = require('../services/KahootService');
    const kahootService = new KahootService();
    const result = await kahootService.getSession(pin);
    
    return res.json({
      success: true,
      sessionData: result
    });
  } catch (error) {
    console.error(`Test Kahoot error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack
    });
  }
};