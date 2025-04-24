// models/BotManager.js
const KahootBot = require('./KahootBot');
const logger = require('../utils/logger');

class BotManager {
  constructor() {
    this.bots = new Map();
    logger.info('Bot Manager ініціалізовано');
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
          message: 'Бот з таким ID вже існує'
        };
      }
      
      const bot = new KahootBot(config);
      
      // Запускаємо бота
      const connected = await bot.connect();
      
      if (!connected) {
        logger.error(`Не вдалося підключити бота: ${config.id}`);
        return {
          success: false,
          message: 'Не вдалося підключитися до Kahoot'
        };
      }
      
      // Зберігаємо бота
      this.bots.set(config.id, bot);
      
      logger.info(`Бот ${config.id} успішно запущено`);
      return {
        success: true,
        message: 'Бот успішно запущено'
      };
    } catch (error) {
      logger.error(`Помилка запуску бота: ${error.message}`);
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
          message: 'Бота не знайдено'
        };
      }
      
      // Відключаємо бота
      await bot.disconnect();
      
      // Видаляємо з мапи
      this.bots.delete(id);
      
      logger.info(`Бот ${id} успішно зупинено`);
      return {
        success: true,
        message: 'Бот успішно зупинено'
      };
    } catch (error) {
      logger.error(`Помилка зупинки бота: ${error.message}`);
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