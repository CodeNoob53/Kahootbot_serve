// controllers/seleniumBotController.js
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const SeleniumService = require('../services/SeleniumService');
const SeleniumBotManager = require('./SeleniumBotManager');

// Об'єкт для зберігання активних сесій Selenium
const activeSessions = new Map();

// Старт нового Selenium-бота
exports.startSeleniumBot = async (req, res) => {
  try {
    const { name, pin, useProxy } = req.body;
    
    logger.info(`Starting Selenium bot with PIN: ${pin}, Name: ${name}`);
    
    // Валідація вхідних даних
    if (!name || !pin) {
      return res.status(400).json({
        success: false,
        message: 'Необхідно вказати ім\'я та PIN-код'
      });
    }
    
    // Валідація PIN-коду
    if (!/^\d{6,10}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний формат PIN-коду. PIN повинен містити 6-10 цифр'
      });
    }
    
    // Створюємо унікальний ID для бота
    const botId = uuidv4();
    
    // Створюємо сервіс Selenium
    const seleniumService = new SeleniumService();
    
    // Ініціалізуємо Selenium
    const initialized = await seleniumService.initialize();
    if (!initialized) {
      return res.status(500).json({
        success: false,
        message: 'Не вдалося ініціалізувати Selenium'
      });
    }
    
    // Приєднуємося до гри Kahoot
    const joinResult = await seleniumService.joinKahootGame(pin, name);
    
    if (joinResult.success) {
      // Зберігаємо сесію в активних сесіях
      activeSessions.set(botId, {
        id: botId,
        name,
        pin,
        service: seleniumService,
        session: joinResult.session,
        startTime: Date.now(),
        status: 'active'
      });
      
      logger.info(`Selenium bot started with ID: ${botId}`);
      
      return res.status(201).json({
        success: true,
        botId,
        message: 'Selenium-бот успішно запущено',
        session: joinResult.session
      });
    } else {
      // Закриваємо Selenium при невдалому з'єднанні
      await seleniumService.close();
      
      return res.status(400).json({
        success: false,
        message: joinResult.message
      });
    }
  } catch (error) {
    logger.error(`Error starting Selenium bot: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `Внутрішня помилка сервера: ${error.message}`
    });
  }
};

// Зупинка Selenium-бота
exports.stopSeleniumBot = async (req, res) => {
  try {
    const { botId } = req.body;
    
    logger.info(`Stopping Selenium bot: ${botId}`);
    
    if (!botId) {
      return res.status(400).json({
        success: false,
        message: 'Необхідно вказати ID бота'
      });
    }
    
    // Перевіряємо, чи існує бот
    const botSession = activeSessions.get(botId);
    if (!botSession) {
      return res.status(404).json({
        success: false,
        message: 'Бота не знайдено'
      });
    }
    
    // Закриваємо Selenium
    await botSession.service.close();
    
    // Видаляємо сесію з активних
    activeSessions.delete(botId);
    
    logger.info(`Selenium bot stopped: ${botId}`);
    
    return res.json({
      success: true,
      message: 'Selenium-бот успішно зупинено'
    });
  } catch (error) {
    logger.error(`Error stopping Selenium bot: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера'
    });
  }
};

// Відповідь на питання
exports.answerQuestion = async (req, res) => {
  try {
    const { botId, answerIndex } = req.body;
    
    logger.info(`Bot ${botId} answering with option ${answerIndex}`);
    
    if (!botId || answerIndex === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Необхідно вказати ID бота та індекс відповіді'
      });
    }
    
    // Перевіряємо, чи існує бот
    const botSession = activeSessions.get(botId);
    if (!botSession) {
      return res.status(404).json({
        success: false,
        message: 'Бота не знайдено'
      });
    }
    
    // Відповідаємо на питання
    const answerResult = await botSession.service.answerQuestion(answerIndex);
    
    return res.json({
      success: answerResult,
      message: answerResult ? 'Відповідь надіслано' : 'Не вдалося відповісти'
    });
  } catch (error) {
    logger.error(`Error answering question: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера'
    });
  }
};

// Отримання статусу бота
exports.getSeleniumBotStatus = (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info(`Getting status for Selenium bot: ${id}`);
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Необхідно вказати ID бота'
      });
    }
    
    // Перевіряємо, чи існує бот
    const botSession = activeSessions.get(id);
    if (!botSession) {
      return res.status(404).json({
        success: false,
        message: 'Бота не знайдено'
      });
    }
    
    return res.json({
      success: true,
      status: {
        id: botSession.id,
        name: botSession.name,
        pin: botSession.pin,
        status: botSession.status,
        startTime: botSession.startTime,
        uptime: Date.now() - botSession.startTime
      }
    });
  } catch (error) {
    logger.error(`Error getting Selenium bot status: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера'
    });
  }
};

// Отримання всіх активних ботів
exports.getAllSeleniumBots = (req, res) => {
  try {
    logger.info('Getting all Selenium bots');
    
    const bots = [];
    for (const [id, session] of activeSessions.entries()) {
      bots.push({
        id: session.id,
        name: session.name,
        pin: session.pin,
        status: session.status,
        startTime: session.startTime,
        uptime: Date.now() - session.startTime
      });
    }
    
    return res.json({
      success: true,
      count: bots.length,
      bots
    });
  } catch (error) {
    logger.error(`Error getting all Selenium bots: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера'
    });
  }
};