// controllers/botController.js
const { v4: uuidv4 } = require('uuid');
const BotManager = require('../models/BotManager');
const logger = require('../utils/logger');

// Start a new bot
exports.startBot = async (req, res) => {
  try {
    const { name, pin, usePlaywright = true, useML, useSearch } = req.body;
    
    logger.info(`Starting bot with PIN: ${pin}, Name: ${name}, usePlaywright: ${usePlaywright}`);
    
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
    
    // Create bot configuration
    const config = {
      id: botId,
      name,
      pin,
      usePlaywright, // Додаємо параметр для вибору методу з'єднання
      onLog: (message, type) => {
        logger.info(`[Bot ${botId}] [${type || 'INFO'}] ${message}`);
      }
    };
    
    logger.info("Bot manager obtaining...");
    // Start the bot
    const botManager = BotManager.getInstance();
    logger.info("Bot manager obtained, starting bot...");
    const startResult = await botManager.startBot(config);
    
    logger.info(`Start result: ${JSON.stringify(startResult)}`);
    
    if (startResult.success) {
      logger.info(`Bot started with ID: ${botId}`);
      return res.status(201).json({
        success: true,
        botId,
        message: 'Bot started successfully',
        method: usePlaywright ? 'playwright' : 'websocket'
      });
    } else {
      logger.error(`Failed to start bot: ${startResult.message}`);
      return res.status(400).json({
        success: false,
        message: startResult.message
      });
    }
  } catch (error) {
    logger.error(`DETAILED ERROR: ${error.message}`);
    logger.error(`Stack trace: ${error.stack}`);
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
    
    logger.info(`Stopping bot: ${botId}`);
    
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
    
    logger.info(`Getting status for bot: ${id}`);
    
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
    logger.info('Getting all bots');
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

// Add test endpoint for direct Kahoot testing
exports.testKahoot = async (req, res) => {
  try {
    const { pin } = req.params;
    const usePlaywright = req.query.method === 'playwright';
    
    logger.info(`Testing direct Kahoot connection for PIN: ${pin}, method: ${usePlaywright ? 'Playwright' : 'HTTP'}`);
    
    const KahootService = require('../services/KahootService');
    const kahootService = new KahootService();
    
    // Якщо вказано метод Playwright, використовуємо BrowserService
    if (usePlaywright) {
      const BrowserService = require('../services/BrowserService');
      const sessionData = await BrowserService.getKahootSession(pin);
      
      return res.json({
        success: true,
        method: 'playwright',
        sessionData
      });
    } else {
      // Інакше використовуємо стандартний метод
      const result = await kahootService.getSession(pin);
      
      return res.json({
        success: true,
        method: 'http',
        sessionData: result
      });
    }
  } catch (error) {
    logger.error(`Test Kahoot error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack
    });
  }
};

// Додаємо новий ендпоінт для прямого тестування входу в гру
exports.testJoinKahoot = async (req, res) => {
  try {
    const { pin, name } = req.body;
    
    if (!pin || !name) {
      return res.status(400).json({
        success: false,
        message: 'PIN та ім\'я обов\'язкові'
      });
    }
    
    logger.info(`Testing joining Kahoot game PIN: ${pin} with name: ${name}`);
    
    const BrowserService = require('../services/BrowserService');
    const result = await BrowserService.joinKahootGame(pin, name);
    
    // Ми отримали результат, але не повертаємо сторінку, щоб уникнути проблем з серіалізацією
    return res.json({
      success: true,
      message: 'Successfully joined Kahoot game',
      clientId: result.clientId,
      cookiesCount: result.cookies ? result.cookies.length : 0
    });
  } catch (error) {
    logger.error(`Test join Kahoot error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Додаємо ендпоінт для ініціалізації Playwright
exports.initPlaywright = async (req, res) => {
  try {
    logger.info('Initializing Playwright');
    
    const BrowserService = require('../services/BrowserService');
    const result = await BrowserService.initialize();
    
    return res.json({
      success: result,
      message: result ? 'Playwright initialized successfully' : 'Failed to initialize Playwright'
    });
  } catch (error) {
    logger.error(`Playwright initialization error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};