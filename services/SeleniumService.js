// services/SeleniumService.js
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const logger = require('../utils/logger');
const proxyUtils = require('../utils/proxyUtils');

class SeleniumService {
  constructor() {
    this.driver = null;
    this.isInitialized = false;
  }
  
  /**
   * Ініціалізує драйвер Selenium з конфігурацією проксі за потреби
   */
  async initialize() {
    try {
      if (this.isInitialized && this.driver) {
        logger.info('Selenium already initialized');
        return true;
      }
      
      logger.info('Initializing Selenium WebDriver');
      
      // Отримуємо конфігурацію проксі
      const proxyConfig = proxyUtils.getProxyConfig();
      const useProxy = proxyConfig.host && proxyConfig.port;
      
      // Налаштовуємо опції Chrome
      const options = new chrome.Options();
      options.addArguments('--headless'); // Запускаємо у фоновому режимі
      options.addArguments('--disable-gpu');
      options.addArguments('--no-sandbox');
      options.addArguments('--disable-dev-shm-usage');
      options.addArguments('--window-size=1366,768');
      
      // Додаємо проксі, якщо потрібно
      if (useProxy) {
        const proxyString = proxyConfig.username && proxyConfig.password
          ? `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`
          : `http://${proxyConfig.host}:${proxyConfig.port}`;
          
        logger.info(`Setting up Selenium with proxy: ${proxyConfig.host}:${proxyConfig.port}`);
        options.addArguments(`--proxy-server=${proxyString}`);
      }
      
      // Створюємо драйвер
      this.driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();
        
      this.isInitialized = true;
      logger.info('Selenium WebDriver initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Error initializing Selenium: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Приєднується до гри Kahoot за PIN-кодом
   * @param {string} pin - PIN-код гри Kahoot
   * @param {string} name - Ім'я гравця
   * @returns {Promise<Object>} - Результат з'єднання
   */
  async joinKahootGame(pin, name) {
    try {
      // Перевіряємо ініціалізацію
      if (!this.isInitialized || !this.driver) {
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error('Failed to initialize Selenium');
        }
      }
      
      logger.info(`Joining Kahoot game with PIN: ${pin} as ${name}`);
      
      // Відкриваємо сторінку Kahoot
      await this.driver.get('https://kahoot.it/');
      logger.info('Opened Kahoot.it page');
      
      // Чекаємо на завантаження сторінки та вводимо PIN
      await this.driver.wait(until.elementLocated(By.id('game-input')), 10000);
      const pinInput = await this.driver.findElement(By.id('game-input'));
      await pinInput.sendKeys(pin);
      
      // Натискаємо кнопку "Enter"
      const enterButton = await this.driver.findElement(By.css('button[data-functional-selector="join-button-game-pin"]'));
      await enterButton.click();
      logger.info('Entered PIN code');
      
      // Чекаємо на форму з ім'ям
      await this.driver.wait(until.elementLocated(By.id('nickname')), 10000);
      const nameInput = await this.driver.findElement(By.id('nickname'));
      await nameInput.sendKeys(name);
      
      // Натискаємо кнопку "OK, go!"
      const okButton = await this.driver.findElement(By.css('button[data-functional-selector="join-button-username"]'));
      await okButton.click();
      logger.info(`Entered name: ${name}`);
      
      // Чекаємо, поки з'явиться екран очікування гри
      await this.driver.wait(until.elementLocated(By.css('.kahoot-lobby')), 15000);
      logger.info('Successfully joined Kahoot game lobby');
      
      // Отримуємо сесійні дані з localStorage або cookies
      const sessionData = await this.extractSessionData();
      
      return {
        success: true,
        message: 'Successfully joined Kahoot game',
        session: sessionData
      };
    } catch (error) {
      logger.error(`Error joining Kahoot game: ${error.message}`);
      
      // Робимо скріншот при помилці для діагностики
      try {
        const screenshot = await this.driver.takeScreenshot();
        const fs = require('fs');
        const path = require('path');
        const screenshotPath = path.join(__dirname, '../logs', `kahoot-error-${Date.now()}.png`);
        fs.writeFileSync(screenshotPath, screenshot, 'base64');
        logger.info(`Error screenshot saved to: ${screenshotPath}`);
      } catch (screenshotError) {
        logger.error(`Failed to take error screenshot: ${screenshotError.message}`);
      }
      
      return {
        success: false,
        message: `Failed to join Kahoot game: ${error.message}`
      };
    }
  }
  
  /**
   * Витягує дані сесії з браузера
   * @returns {Promise<Object>} - Дані сесії
   */
  async extractSessionData() {
    try {
      // Отримуємо cookies
      const cookies = await this.driver.manage().getCookies();
      
      // Витягуємо дані з localStorage
      const localStorageData = await this.driver.executeScript(function() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          data[key] = localStorage.getItem(key);
        }
        return data;
      });
      
      // Отримуємо URL поточної сторінки
      const currentUrl = await this.driver.getCurrentUrl();
      
      return {
        cookies,
        localStorage: localStorageData,
        currentUrl
      };
    } catch (error) {
      logger.error(`Error extracting session data: ${error.message}`);
      return {};
    }
  }
  
  /**
   * Відповідає на поточне питання
   * @param {number} answerIndex - Індекс відповіді (0-3)
   * @returns {Promise<boolean>} - Успішність відповіді
   */
  async answerQuestion(answerIndex) {
    try {
      // Перевіряємо, чи є поточне питання
      const questionElements = await this.driver.findElements(By.css('.question-container'));
      if (questionElements.length === 0) {
        logger.info('No active question found');
        return false;
      }
      
      // Знаходимо кнопки відповідей
      const answerButtons = await this.driver.findElements(By.css('.answer-button'));
      if (answerIndex >= 0 && answerIndex < answerButtons.length) {
        await answerButtons[answerIndex].click();
        logger.info(`Answered with option ${answerIndex + 1}`);
        return true;
      } else {
        logger.warn(`Invalid answer index: ${answerIndex}, available options: ${answerButtons.length}`);
        return false;
      }
    } catch (error) {
      logger.error(`Error answering question: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Закриває Selenium WebDriver
   */
  async close() {
    if (this.driver) {
      try {
        await this.driver.quit();
        this.isInitialized = false;
        logger.info('Selenium WebDriver closed');
      } catch (error) {
        logger.error(`Error closing Selenium: ${error.message}`);
      }
    }
  }
}

module.exports = SeleniumService;