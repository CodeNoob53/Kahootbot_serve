// services/KahootService.js
const logger = require('../utils/logger');
const browserService = require('./BrowserService');

class KahootService {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15'
    ];
  }
  
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }
  
  async getSession(pin) {
    try {
      logger.info(`KahootService: Отримання сесії для PIN: ${pin} через Playwright`);
      
      if (!pin || !/^\d{6,10}$/.test(pin)) {
        logger.error(`KahootService: Недійсний PIN гри: ${pin}`);
        throw new Error('Недійсний PIN гри');
      }
      
      // Отримуємо сесію через Playwright
      const sessionData = await browserService.getKahootSession(pin);
      logger.info(`KahootService: Успішно отримано дані сесії через Playwright`);
      
      // Повертаємо отримані дані
      return {
        liveGameId: sessionData.sessionToken || sessionData.liveGameId,
        challenge: sessionData.challenge,
        clientId: sessionData.clientId
      };
    } catch (error) {
      logger.error(`KahootService: Помилка отримання сесії: ${error.message}`);
      throw error;
    }
  }

  // Метод для підключення до гри напряму через Playwright
  async connectViaPlaywright(pin, name) {
    try {
      logger.info(`KahootService: Підключення до гри ${pin} з ім'ям ${name} через Playwright`);
      return await browserService.joinKahootGame(pin, name);
    } catch (error) {
      logger.error(`KahootService: Помилка підключення через Playwright: ${error.message}`);
      throw error;
    }
  }
}

module.exports = KahootService;