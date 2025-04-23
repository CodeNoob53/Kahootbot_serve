// models/SeleniumBotManager.js
const SeleniumService = require('../services/SeleniumService');
const logger = require('../utils/logger');
const { broadcast, sendToClient } = require('../routes/ws');

class SeleniumBotManager {
  constructor() {
    this.bots = new Map();
    this.activeTimers = new Map();
    logger.info('Selenium Bot Manager initialized');
  }
  
  static getInstance() {
    if (!SeleniumBotManager.instance) {
      SeleniumBotManager.instance = new SeleniumBotManager();
    }
    return SeleniumBotManager.instance;
  }
  
  /**
   * Запускає нового Selenium бота
   * @param {Object} config - Конфігурація бота
   * @returns {Promise<Object>} - Результат запуску
   */
  async startBot(config) {
    try {
      if (this.bots.has(config.id)) {
        return {
          success: false,
          message: 'Бот з таким ID вже існує'
        };
      }
      
      // Ініціалізуємо сервіс Selenium
      const botService = new SeleniumService();
      const initialized = await botService.initialize();
      
      if (!initialized) {
        logger.error(`Failed to initialize Selenium for bot ${config.id}`);
        return {
          success: false,
          message: 'Не вдалося ініціалізувати Selenium'
        };
      }
      
      logger.info(`Joining Kahoot game with PIN: ${config.pin} as ${config.name}`);
      
      // Приєднуємось до гри Kahoot
      const joinResult = await botService.joinKahootGame(config.pin, config.name);
      
      if (!joinResult.success) {
        logger.error(`Failed to join Kahoot game: ${joinResult.message}`);
        await botService.close();
        return {
          success: false,
          message: joinResult.message
        };
      }
      
      // Створюємо об'єкт бота
      const bot = {
        id: config.id,
        name: config.name,
        pin: config.pin,
        service: botService,
        status: 'active',
        startTime: Date.now(),
        lastActivity: Date.now(),
        session: joinResult.session
      };
      
      // Зберігаємо бота
      this.bots.set(config.id, bot);
      
      // Запускаємо таймер перевірки стану
      this._setupStatusCheck(config.id);
      
      // Надсилаємо сповіщення через WebSocket
      this._notifyStatusChange(config.id, 'started');
      
      logger.info(`Selenium bot ${config.id} started successfully`);
      return {
        success: true,
        message: 'Selenium-бот успішно запущено',
        session: joinResult.session
      };
    } catch (error) {
      logger.error(`Error starting Selenium bot: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Зупиняє бота
   * @param {string} id - ID бота
   * @returns {Promise<Object>} - Результат зупинки
   */
  async stopBot(id) {
    try {
      const bot = this.bots.get(id);
      
      if (!bot) {
        return {
          success: false,
          message: 'Бота не знайдено'
        };
      }
      
      logger.info(`Stopping Selenium bot ${id}`);
      
      // Зупиняємо таймер перевірки стану
      this._clearStatusCheck(id);
      
      // Закриваємо сервіс Selenium
      await bot.service.close();
      
      // Видаляємо бота з карти
      this.bots.delete(id);
      
      // Надсилаємо сповіщення через WebSocket
      this._notifyStatusChange(id, 'stopped');
      
      logger.info(`Selenium bot ${id} stopped successfully`);
      return {
        success: true,
        message: 'Selenium-бот успішно зупинено'
      };
    } catch (error) {
      logger.error(`Error stopping Selenium bot: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Відповідає на поточне питання
   * @param {string} id - ID бота
   * @param {number} answerIndex - Індекс відповіді
   * @returns {Promise<Object>} - Результат відповіді
   */
  async answerQuestion(id, answerIndex) {
    try {
      const bot = this.bots.get(id);
      
      if (!bot) {
        return {
          success: false,
          message: 'Бота не знайдено'
        };
      }
      
      // Оновлюємо час останньої активності
      bot.lastActivity = Date.now();
      
      // Відповідаємо на питання
      const answerResult = await bot.service.answerQuestion(answerIndex);
      
      if (answerResult) {
        logger.info(`Bot ${id} answered with option ${answerIndex}`);
        
        // Надсилаємо сповіщення про відповідь
        this._notifyAnswer(id, answerIndex);
        
        return {
          success: true,
          message: 'Відповідь успішно надіслано'
        };
      } else {
        logger.warn(`Bot ${id} failed to answer with option ${answerIndex}`);
        return {
          success: false,
          message: 'Не вдалося надіслати відповідь'
        };
      }
    } catch (error) {
      logger.error(`Error answering question with bot ${id}: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Отримує статус конкретного бота
   * @param {string} id - ID бота
   * @returns {Object|null} - Статус бота або null, якщо бота не знайдено
   */
  getBotStatus(id) {
    const bot = this.bots.get(id);
    
    if (!bot) {
      return null;
    }
    
    // Обчислюємо час роботи
    const uptime = Date.now() - bot.startTime;
    
    return {
      id: bot.id,
      name: bot.name,
      pin: bot.pin,
      status: bot.status,
      startTime: bot.startTime,
      lastActivity: bot.lastActivity,
      uptime
    };
  }
  
  /**
   * Отримує всіх активних ботів
   * @returns {Array} - Список ботів
   */
  getAllBots() {
    const botList = [];
    
    for (const [id, bot] of this.bots.entries()) {
      botList.push({
        id,
        name: bot.name,
        pin: bot.pin,
        status: bot.status,
        startTime: bot.startTime,
        uptime: Date.now() - bot.startTime
      });
    }
    
    return botList;
  }
  
  /**
   * Запускає таймер перевірки стану бота
   * @param {string} id - ID бота
   * @private
   */
  _setupStatusCheck(id) {
    // Видаляємо існуючий таймер, якщо є
    this._clearStatusCheck(id);
    
    // Створюємо новий таймер
    const timer = setInterval(() => {
      this._checkBotStatus(id);
    }, 30000); // Перевіряємо кожні 30 секунд
    
    this.activeTimers.set(id, timer);
    logger.debug(`Status check timer set for bot ${id}`);
  }
  
  /**
   * Зупиняє таймер перевірки стану бота
   * @param {string} id - ID бота
   * @private
   */
  _clearStatusCheck(id) {
    const timer = this.activeTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.activeTimers.delete(id);
      logger.debug(`Status check timer cleared for bot ${id}`);
    }
  }
  
  /**
   * Перевіряє стан бота
   * @param {string} id - ID бота
   * @private
   */
  async _checkBotStatus(id) {
    const bot = this.bots.get(id);
    
    if (!bot) {
      this._clearStatusCheck(id);
      return;
    }
    
    try {
      // Перевіряємо активність бота
      const inactiveTime = Date.now() - bot.lastActivity;
      
      // Якщо бот неактивний більше 15 хвилин, перевіряємо стан
      if (inactiveTime > 15 * 60 * 1000) {
        logger.info(`Bot ${id} inactive for ${Math.round(inactiveTime / 60000)} minutes, checking status`);
        
        // Тут можна додати додаткову перевірку стану
        // Наприклад, перевірити, чи відображається сторінка Kahoot
      }
    } catch (error) {
      logger.error(`Error checking status for bot ${id}: ${error.message}`);
    }
  }
  
  /**
   * Надсилає сповіщення про зміну стану бота
   * @param {string} id - ID бота
   * @param {string} event - Подія ('started', 'stopped', etc.)
   * @private
   */
  _notifyStatusChange(id, event) {
    try {
      const bot = this.bots.get(id);
      const status = bot ? this.getBotStatus(id) : { id, event };
      
      // Надсилаємо оновлення через WebSocket
      broadcast({
        type: 'bot-status',
        botType: 'selenium',
        event,
        bot: status
      });
      
      logger.debug(`Sent status update for bot ${id}: ${event}`);
    } catch (error) {
      logger.error(`Error sending status notification: ${error.message}`);
    }
  }
  
  /**
   * Надсилає сповіщення про відповідь бота
   * @param {string} id - ID бота
   * @param {number} answerIndex - Індекс відповіді
   * @private
   */
  _notifyAnswer(id, answerIndex) {
    try {
      // Надсилаємо оновлення через WebSocket
      broadcast({
        type: 'bot-answer',
        botType: 'selenium',
        botId: id,
        answerIndex,
        timestamp: Date.now()
      });
      
      logger.debug(`Sent answer notification for bot ${id}: option ${answerIndex}`);
    } catch (error) {
      logger.error(`Error sending answer notification: ${error.message}`);
    }
  }
}

module.exports = SeleniumBotManager;