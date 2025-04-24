// services/BrowserService.js
const { chromium } = require('playwright');
const logger = require('../utils/logger');
const proxyUtils = require('../utils/proxyUtils');

class BrowserService {
  constructor() {
    this.browser = null;
    this.context = null;
  }

  async initialize() {
    try {
      if (this.browser) {
        logger.info('Browser is already initialized');
        return true;
      }

      logger.info('Initializing Playwright browser');
      
      // Перевіряємо налаштування проксі
      const proxyConfig = proxyUtils.getProxyConfig();
      const proxyOptions = proxyConfig.host && proxyConfig.port ? {
        server: `http://${proxyConfig.host}:${proxyConfig.port}`,
        username: proxyConfig.username || undefined,
        password: proxyConfig.password || undefined
      } : undefined;

      // Запускаємо браузер
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-site-isolation-trials'
        ],
        proxy: proxyOptions
      });

      logger.info('Playwright browser launched successfully');
      
      // Створюємо новий контекст з налаштуваннями
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        locale: 'en-US',
        geolocation: { longitude: -122.084, latitude: 37.422 },
        permissions: ['geolocation'],
        bypassCSP: true,
        ignoreHTTPSErrors: true,
        javaScriptEnabled: true
      });

      logger.info('Browser context created');
      return true;
    } catch (error) {
      logger.error(`Error initializing browser: ${error.message}`);
      return false;
    }
  }

  async getKahootSession(pin) {
    try {
      logger.info(`Getting Kahoot session for PIN: ${pin}`);
      
      // Ініціалізуємо браузер, якщо потрібно
      if (!this.browser) {
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error('Failed to initialize browser');
        }
      }

      // Створюємо нову сторінку
      const page = await this.context.newPage();
      
      try {
        // Відкриваємо сторінку Kahoot
        logger.info('Opening Kahoot.it');
        await page.goto('https://kahoot.it/', { waitUntil: 'networkidle', timeout: 30000 });
        
        // Вводимо PIN
        logger.info(`Entering PIN: ${pin}`);
        await page.waitForSelector('#game-input', { timeout: 10000 });
        await page.fill('#game-input', pin);
        
        // Натискаємо кнопку "Enter"
        await page.click('button[type="submit"]');
        
        // Чекаємо на сторінку введення імені
        logger.info('Waiting for name input screen');
        await page.waitForSelector('#nickname', { timeout: 15000 });
        
        // Отримуємо URL та cookies
        const url = page.url();
        const cookies = await this.context.cookies();
        const localStorage = await page.evaluate(() => {
          const data = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            data[key] = localStorage.getItem(key);
          }
          return data;
        });
        
        // Аналізуємо URL для отримання токену сесії
        const sessionRegex = /\/session\/([^/]+)/;
        const matches = url.match(sessionRegex);
        const sessionToken = matches ? matches[1] : null;
        
        logger.info(`Got session token: ${sessionToken}`);
        
        // Отримуємо необхідні дані з JavaScript контексту сторінки
        const kahootData = await page.evaluate(() => {
          // Спробуємо отримати дані з глобальних об'єктів Kahoot
          // Ці назви можуть змінюватися і їх треба адаптувати
          return {
            clientId: window.__PRELOADED_STATE__?.gameBlockController?.clientId || null,
            sessionToken: window.__PRELOADED_STATE__?.gameBlockController?.sessionToken || null,
            liveGameId: window.__PRELOADED_STATE__?.gameBlockController?.gameId || null,
            challenge: window.__PRELOADED_STATE__?.challenge || null,
            // Додаткові дані, які можуть знадобитися
            gameMode: window.__PRELOADED_STATE__?.gameBlockController?.gameMode || null
          };
        });
        
        // Створюємо результат
        const result = {
          sessionToken: sessionToken || kahootData.sessionToken,
          liveGameId: kahootData.liveGameId,
          clientId: kahootData.clientId,
          challenge: kahootData.challenge,
          cookies: cookies,
          localStorage: localStorage,
          gameUrl: url
        };
        
        logger.info(`Session data retrieved successfully`);
        return result;
      } finally {
        // Закриваємо сторінку
        await page.close();
      }
    } catch (error) {
      logger.error(`Error getting Kahoot session: ${error.message}`);
      throw error;
    }
  }

  async joinKahootGame(pin, name) {
    try {
      logger.info(`Joining Kahoot game with PIN: ${pin}, name: ${name}`);
      
      if (!this.browser) {
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error('Failed to initialize browser');
        }
      }
  
      const page = await this.context.newPage();
  
      try {
        logger.info('Opening Kahoot.it');
        await page.goto('https://kahoot.it/', { waitUntil: 'networkidle', timeout: 30000 });
  
        logger.info(`Entering PIN: ${pin}`);
        await page.waitForSelector('#game-input', { timeout: 10000 });
        await page.fill('#game-input', pin);
        await page.click('button[type="submit"]');
  
        logger.info('Waiting for name input screen');
        await page.waitForSelector('#nickname', { timeout: 15000 });
  
        logger.info(`Entering name: ${name}`);
        await page.fill('#nickname', name);
        await page.click('button[type="submit"]');
  
        logger.info('Waiting for game confirmation (instructions-page)');
        await page.waitForSelector('[data-functional-selector="instructions-page"]', { timeout: 15000 });
  
        // Listen for WebSocket
        let wsMessage = null;
        const wsMessagePromise = new Promise((resolve) => {
          page.on('websocket', ws => {
            logger.info(`WebSocket connected: ${ws.url()}`);
            ws.on('message', data => {
              const msgStr = data.toString();
              logger.debug(`WebSocket message: ${msgStr.substring(0, 100)}...`);
              if (msgStr.includes('"type":"login"') || msgStr.includes('"channel":"/service/controller"')) {
                resolve(msgStr);
              }
            });
          });
        });
  
        try {
          wsMessage = await Promise.race([
            wsMessagePromise,
            new Promise(resolve => setTimeout(() => resolve(null), 20000))
          ]);
          if (!wsMessage) {
            logger.warn('WebSocket confirmation not received within timeout. Proceeding based on DOM state.');
          }
        } catch (err) {
          logger.warn(`WebSocket error: ${err.message}`);
        }
  
        logger.info('Successfully joined the game (confirmed via instructions-page)');
  
        const cookies = await this.context.cookies();
        const localStorage = await page.evaluate(() => {
          const data = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            data[key] = localStorage.getItem(key);
          }
          return data;
        });
  
        let clientId = null;
        try {
          const parsed = JSON.parse(wsMessage);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item.clientId) {
                clientId = item.clientId;
                break;
              }
            }
          } else if (parsed?.clientId) {
            clientId = parsed.clientId;
          }
        } catch (e) {
          logger.warn(`Unable to parse clientId from WS message: ${e.message}`);
        }
  
        return {
          success: true,
          clientId: clientId || null,
          cookies,
          localStorage,
          wsMessage
        };
  
      } catch (error) {
        logger.error(`Error inside joinKahootGame: ${error.message}`);
        throw error;
      }
    } catch (error) {
      logger.error(`Error joining Kahoot game: ${error.message}`);
      throw error;
    }
  }
  

  async close() {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      logger.info('Browser resources closed');
      return true;
    } catch (error) {
      logger.error(`Error closing browser: ${error.message}`);
      return false;
    }
  }
}

module.exports = new BrowserService();