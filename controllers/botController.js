// controllers/botController.js
const { v4: uuidv4 } = require('uuid');
const BotManager = require('../models/BotManager');
const logger = require('../utils/logger');

// Запуск нового бота
exports.startBot = async (req, res) => {
  try {
    const { name, pin } = req.body;
    
    logger.info(`Запуск бота з PIN: ${pin}, Ім'я: ${name}`);
    
    // Перевірка введених даних
    if (!name || !pin) {
      return res.status(400).json({
        success: false,
        message: 'Ім\'я та PIN обов\'язкові'
      });
    }
    
    // Базова перевірка формату PIN
    if (!/^\d{6,10}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        message: 'Недійсний формат PIN. PIN повинен містити 6-10 цифр'
      });
    }
    
    // Створюємо унікальний ідентифікатор бота
    const botId = uuidv4();
    
    // Створюємо конфігурацію бота
    const config = {
      id: botId,
      name,
      pin,
      onLog: (message, type) => {
        logger.info(`[Bot ${botId}] [${type || 'INFO'}] ${message}`);
      }
    };
    
    logger.info("Отримання менеджера ботів...");
    // Запускаємо бота
    const botManager = BotManager.getInstance();
    logger.info("Менеджер ботів отримано, запуск бота...");
    const startResult = await botManager.startBot(config);
    
    logger.info(`Результат запуску: ${JSON.stringify(startResult)}`);
    
    if (startResult.success) {
      logger.info(`Бот запущено з ID: ${botId}`);
      return res.status(201).json({
        success: true,
        botId,
        message: 'Бот успішно запущено',
        method: 'playwright'
      });
    } else {
      logger.error(`Не вдалося запустити бота: ${startResult.message}`);
      return res.status(400).json({
        success: false,
        message: startResult.message
      });
    }
  } catch (error) {
    logger.error(`ДЕТАЛЬНА ПОМИЛКА: ${error.message}`);
    logger.error(`Stack trace: ${error.stack}`);
    return res.status(500).json({
      success: false,
      message: `Внутрішня помилка сервера: ${error.message}`
    });
  }
};

// Зупинка бота
exports.stopBot = async (req, res) => {
  try {
    const { botId } = req.body;
    
    logger.info(`Зупинка бота: ${botId}`);
    
    if (!botId) {
      return res.status(400).json({
        success: false,
        message: 'ID бота обов\'язковий'
      });
    }
    
    const botManager = BotManager.getInstance();
    const stopResult = await botManager.stopBot(botId);
    
    if (stopResult.success) {
      logger.info(`Бот зупинено: ${botId}`);
      return res.json({
        success: true,
        message: 'Бот успішно зупинено'
      });
    } else {
      logger.error(`Не вдалося зупинити бота: ${stopResult.message}`);
      return res.status(400).json({
        success: false,
        message: stopResult.message
      });
    }
  } catch (error) {
    logger.error(`Помилка зупинки бота: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера'
    });
  }
};

// Отримання статусу конкретного бота
exports.getBotStatus = (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info(`Отримання статусу для бота: ${id}`);
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID бота обов\'язковий'
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
        message: 'Бота не знайдено'
      });
    }
  } catch (error) {
    logger.error(`Помилка отримання статусу бота: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера'
    });
  }
};

// Отримання всіх активних ботів
exports.getAllBots = (req, res) => {
  try {
    logger.info('Отримання всіх ботів');
    const botManager = BotManager.getInstance();
    const bots = botManager.getAllBots();
    
    return res.json({
      success: true,
      count: bots.length,
      bots
    });
  } catch (error) {
    logger.error(`Помилка отримання всіх ботів: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера'
    });
  }
};

// Тестовий ендпоінт для прямого тестування Kahoot
exports.testKahoot = async (req, res) => {
  try {
    const { pin } = req.params;
    
    logger.info(`Тестування підключення до Kahoot для PIN: ${pin}`);
    
    const BrowserService = require('../services/BrowserService');
    const sessionData = await BrowserService.getKahootSession(pin);
    
    return res.json({
      success: true,
      method: 'playwright',
      sessionData
    });
  } catch (error) {
    logger.error(`Помилка тестування Kahoot: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack
    });
  }
};

// Ендпоінт для прямого тестування входу в гру
exports.testJoinKahoot = async (req, res) => {
  try {
    const { pin, name } = req.body;
    
    if (!pin || !name) {
      return res.status(400).json({
        success: false,
        message: 'PIN та ім\'я обов\'язкові'
      });
    }
    
    logger.info(`Тестування приєднання до гри Kahoot PIN: ${pin} з ім'ям: ${name}`);
    
    const BrowserService = require('../services/BrowserService');
    const result = await BrowserService.joinKahootGame(pin, name);
    
    // Отримали результат, але не повертаємо сторінку, щоб уникнути проблем з серіалізацією
    return res.json({
      success: true,
      message: 'Успішно приєднано до гри Kahoot',
      clientId: result.clientId,
      cookiesCount: result.cookies ? result.cookies.length : 0
    });
  } catch (error) {
    logger.error(`Помилка тестування приєднання до Kahoot: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Ендпоінт для ініціалізації Playwright
exports.initPlaywright = async (req, res) => {
  try {
    logger.info('Ініціалізація Playwright');
    
    const BrowserService = require('../services/BrowserService');
    const result = await BrowserService.initialize();
    
    return res.json({
      success: result,
      message: result ? 'Playwright успішно ініціалізовано' : 'Не вдалося ініціалізувати Playwright'
    });
  } catch (error) {
    logger.error(`Помилка ініціалізації Playwright: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};