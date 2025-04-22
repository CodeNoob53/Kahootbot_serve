// models/BotManager.js
const KahootBot = require('./KahootBot');
const logger = require('../utils/logger');

class BotManager {
  constructor() {
    this.bots = new Map();
    logger.info('Bot Manager initialized');
  }
  
  static getInstance() {
    if (!BotManager.instance) {
      BotManager.instance = new BotManager();
    }
    return BotManager.instance;
  }
  
  async startBot(config) {
    try {
      if (this.bots.has(config.id)) {
        return {
          success: false,
          message: 'Bot with this ID already exists'
        };
      }
      
      const bot = new KahootBot(config);
      
      // Start the bot - перевіряємо наявність методу connect
      if (typeof bot.connect !== 'function') {
        logger.error(`Bot ${config.id} does not have connect method`);
        
        // Перевіряємо, чи має бот інші можливі методи
        const availableMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(bot))
          .filter(method => typeof bot[method] === 'function' && method !== 'constructor');
        
        logger.info(`Available methods: ${availableMethods.join(', ')}`);
        
        // Якщо є метод connectWebSocket, можливо потрібно змінити підхід
        if (typeof bot.connectWebSocket === 'function') {
          logger.info(`Trying to use connectWebSocket instead`);
          try {
            await bot.connectWebSocket();
            this.bots.set(config.id, bot);
            
            logger.info(`Bot ${config.id} connected using connectWebSocket`);
            return {
              success: true,
              message: 'Bot connected successfully using connectWebSocket'
            };
          } catch (wsError) {
            logger.error(`Failed to connect with connectWebSocket: ${wsError.message}`);
            return {
              success: false,
              message: `Failed to connect: ${wsError.message}`
            };
          }
        }
        
        return {
          success: false,
          message: 'bot.connect is not a function'
        };
      }
      
      // Викликаємо метод connect якщо він доступний
      const connected = await bot.connect();
      
      if (!connected) {
        logger.error(`Failed to connect bot: ${config.id}`);
        return {
          success: false,
          message: 'Failed to connect to Kahoot'
        };
      }
      
      // Store the bot
      this.bots.set(config.id, bot);
      
      logger.info(`Bot ${config.id} started successfully`);
      return {
        success: true,
        message: 'Bot started successfully'
      };
    } catch (error) {
      logger.error(`Error starting bot: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  async stopBot(id) {
    try {
      const bot = this.bots.get(id);
      
      if (!bot) {
        return {
          success: false,
          message: 'Bot not found'
        };
      }
      
      // Disconnect the bot
      await bot.disconnect();
      
      // Remove from the map
      this.bots.delete(id);
      
      logger.info(`Bot ${id} stopped successfully`);
      return {
        success: true,
        message: 'Bot stopped successfully'
      };
    } catch (error) {
      logger.error(`Error stopping bot: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  getBotStatus(id) {
    const bot = this.bots.get(id);
    
    if (!bot) {
      return null;
    }
    
    return {
      id: bot.id,
      name: bot.name,
      pin: bot.pin,
      connected: bot.connected,
      currentQuestion: bot.currentQuestion,
      questionIndex: bot.currentQuestionIndex,
      lastAnswer: bot.lastAnswer
    };
  }
  
  getAllBots() {
    const botList = [];
    
    for (const [id, bot] of this.bots.entries()) {
      botList.push({
        id,
        name: bot.name,
        pin: bot.pin,
        connected: bot.connected
      });
    }
    
    return botList;
  }
}

module.exports = BotManager;