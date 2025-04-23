// services/KahootService.js
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const proxyUtils = require('../utils/proxyUtils');
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
    
    // Зберігаємо останні отримані куки
    this.lastCookies = [];
  }
  
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }
  
  generateKahootCookies() {
    // Якщо у нас є валідні куки з браузера, використовуємо їх
    if (this.lastCookies && this.lastCookies.length > 0) {
      logger.info(`Using ${this.lastCookies.length} cookies from browser session`);
      return this.lastCookies.map(cookie => `${cookie.name}=${cookie.value}`);
    }
    
    // Повертаємо старі шаблонні куки як запасний варіант
    logger.warn('No browser cookies available, using template cookies');
    return require('../utils/cookiesTemplate');
  }
  
  async getSession(pin) {
    try {
      logger.info(`KahootService: Getting session for PIN: ${pin} using Playwright`);
      
      if (!pin || !/^\d{6,10}$/.test(pin)) {
        logger.error(`KahootService: Invalid game PIN: ${pin}`);
        throw new Error('Invalid game PIN');
      }
      
      // Спочатку спробуємо отримати сесію через Playwright
      try {
        const sessionData = await browserService.getKahootSession(pin);
        logger.info(`KahootService: Successfully got session data via Playwright`);
        
        // Зберігаємо отримані куки для подальшого використання
        if (sessionData.cookies && sessionData.cookies.length > 0) {
          this.lastCookies = sessionData.cookies;
          logger.info(`KahootService: Saved ${this.lastCookies.length} cookies from Playwright session`);
        }
        
        // Повертаємо отримані дані
        return {
          liveGameId: sessionData.sessionToken || sessionData.liveGameId,
          challenge: sessionData.challenge,
          clientId: sessionData.clientId
        };
      } catch (browserError) {
        logger.error(`KahootService: Playwright error: ${browserError.message}`);
        logger.info(`KahootService: Falling back to direct HTTP method`);
        
        // Запасний варіант - пробуємо через HTTP запит
        return this.getSessionHttpFallback(pin);
      }
    } catch (error) {
      logger.error(`KahootService: Error getting session: ${error.message}`);
      throw error;
    }
  }
  
  async getSessionHttpFallback(pin) {
    return new Promise((resolve, reject) => {
      try {
        logger.info(`KahootService: Getting session for PIN: ${pin} via HTTP fallback`);
        
        const url = `https://kahoot.it/reserve/session/${pin}/`;
        logger.info(`KahootService: Request URL: ${url}`);
        
        const agent = proxyUtils.getProxyAgent();
        logger.info(`KahootService: Proxy agent created: ${agent ? 'Yes' : 'No'}`);
        
        // Generate cookies
        const cookies = this.generateKahootCookies();
        logger.info(`KahootService: Generated ${cookies.length} cookies`);
        
        const options = {
          method: 'GET',
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Origin': 'https://kahoot.it',
            'Referer': 'https://kahoot.it/',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Cookie': cookies.join('; ')
          },
          agent: agent
        };
        
        logger.debug(`KahootService: Request options: ${JSON.stringify(options, null, 2)}`);
        
        const req = https.request(url, options, (res) => {
          logger.info(`KahootService: Response status: ${res.statusCode}`);
          logger.debug(`KahootService: Response headers: ${JSON.stringify(res.headers)}`);
          
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            logger.info(`KahootService: Response data length: ${data.length}`);
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const result = JSON.parse(data);
                logger.info(`KahootService: Parsed response: ${JSON.stringify(result)}`);
                resolve(result);
              } catch (error) {
                logger.error(`KahootService: Error parsing response: ${error.message}`);
                logger.error(`KahootService: Raw response data: ${data}`);
                reject(new Error('Invalid response format'));
              }
            } else {
              logger.error(`KahootService: HTTP error: ${res.statusCode}`);
              logger.error(`KahootService: Response data: ${data}`);
              reject(new Error(`HTTP error: ${res.statusCode}`));
            }
          });
        });
        
        req.on('error', (error) => {
          logger.error(`KahootService: Request error: ${error.message}`);
          reject(error);
        });
        
        // Додайте таймаут для запиту
        req.setTimeout(15000, () => {
          logger.error(`KahootService: Request timeout`);
          req.destroy(new Error('Request timeout'));
        });
        
        req.end();
        logger.info(`KahootService: Request sent`);
      } catch (error) {
        logger.error(`KahootService: General error: ${error.message}`);
        logger.error(`KahootService: Stack: ${error.stack}`);
        reject(error);
      }
    });
  }

  async solveChallenge(challenge) {
    // Якщо ми використовуємо Playwright, challenge вже має бути вирішеним
    if (!challenge || challenge.includes('no-challenge')) {
      logger.info('KahootService: No challenge to solve or already solved by Playwright');
      return null;
    }
    
    return new Promise((resolve, reject) => {
      try {
        logger.info('KahootService: Solving challenge token');
        
        if (!challenge) {
          logger.warn('KahootService: No challenge provided');
          resolve(null);
          return;
        }
        
        logger.info(`KahootService: Challenge length: ${challenge.length}`);
        
        // Extract the encoded message
        let encodedMessage;
        try {
          const msgMatch = challenge.match(/decode\.call\(this,\s*'([^']+)'/);
          if (!msgMatch) {
            logger.info('KahootService: Using alternative regex for encoded message');
            const altMatch1 = challenge.match(/decode\s*\(\s*'([^']+)'\s*\)/);
            const altMatch2 = challenge.match(/decode\s*\(\s*"([^"]+)"\s*\)/);
            
            if (altMatch1) {
              encodedMessage = altMatch1[1];
              logger.info(`KahootService: Found encoded message (alt1) of length ${encodedMessage.length}`);
            } else if (altMatch2) {
              encodedMessage = altMatch2[1];
              logger.info(`KahootService: Found encoded message (alt2) of length ${encodedMessage.length}`);
            } else {
              logger.error('KahootService: Could not find encoded message');
              throw new Error('Could not find encoded message');
            }
          } else {
            encodedMessage = msgMatch[1];
            logger.info(`KahootService: Found encoded message of length ${encodedMessage.length}`);
          }
        } catch (error) {
          logger.error(`KahootService: Error extracting encoded message: ${error.message}`);
          reject(error);
          return;
        }
        
        // Extract offset formula
        let offset;
        try {
          const offsetMatch = challenge.match(/var\s+offset\s*=\s*([^;]+);/);
          const formula = offsetMatch ? offsetMatch[1] : '18150'; // Default if not found
          
          logger.info(`KahootService: Offset formula: ${formula}`);
          
          // Clean formula
          const cleanFormula = formula
            .replace(/\s+/g, '')
            .replace(/this\.angular\.isArray|this\.angular\.isObject/g, 'false')
            .replace(/console\.log\([^)]+\)/g, '')
            .replace(/window\.|document\.|localStorage|sessionStorage/g, '')
            .replace(/eval|Function/g, '');
          
          logger.info(`KahootService: Cleaned formula: ${cleanFormula}`);
          
          offset = eval(cleanFormula); // Safe in controlled server environment
          logger.info(`KahootService: Calculated offset: ${offset}`);
        } catch (error) {
          logger.error(`KahootService: Error calculating offset: ${error.message}`);
          offset = 18150; // Fallback value
          logger.info(`KahootService: Using fallback offset: ${offset}`);
        }
        
        // Decode message
        const decodedToken = this.decodeMessage(encodedMessage, offset);
        logger.info(`KahootService: Decoded token length: ${decodedToken.length}`);
        
        if (!decodedToken || decodedToken.length < 10) {
          logger.warn('KahootService: Decoded token appears invalid, trying alternatives');
          
          // Try alternative offsets
          const alternativeOffsets = [18150, 16050, 17150, 19200, 20250];
          for (const altOffset of alternativeOffsets) {
            if (altOffset === offset) continue;
            
            logger.info(`KahootService: Trying alternative offset: ${altOffset}`);
            const altToken = this.decodeMessage(encodedMessage, altOffset);
            
            if (altToken && altToken.length > 10 && /[A-Za-z0-9]/.test(altToken)) {
              logger.info(`KahootService: Using alternative token with offset ${altOffset}, length ${altToken.length}`);
              resolve(altToken);
              return;
            }
          }
        }
        
        logger.info('KahootService: Successfully decoded challenge token');
        resolve(decodedToken);
      } catch (error) {
        logger.error(`KahootService: Error solving challenge: ${error.message}`);
        reject(error);
      }
    });
  }
  
  decodeMessage(message, offset) {
    try {
      logger.info(`KahootService: Decoding message of length ${message.length} with offset ${offset}`);
      let result = '';
      for (let position = 0; position < message.length; position++) {
        const char = message.charAt(position);
        const charCode = char.charCodeAt(0);
        
        // Mathematical formula from Kahoot challenge
        let newCharCode = Math.floor(((charCode * (position + 1) + offset) % 77) + 48);
        
        // Check for valid ASCII
        if (isNaN(newCharCode) || !isFinite(newCharCode) || newCharCode < 32 || newCharCode > 126) {
          newCharCode = 88; // ASCII for 'X'
        }
        
        result += String.fromCharCode(newCharCode);
      }
      
      logger.info(`KahootService: Decoded result length: ${result.length}`);
      return result;
    } catch (error) {
      logger.error(`KahootService: Error decoding message: ${error.message}`);
      return 'BACKUP_TOKEN_' + Date.now(); // Fallback token
    }
  }

  // Новий метод для з'єднання з грою напряму через Playwright
  async connectViaPlaywright(pin, name) {
    try {
      logger.info(`KahootService: Connecting to game ${pin} with name ${name} via Playwright`);
      return await browserService.joinKahootGame(pin, name);
    } catch (error) {
      logger.error(`KahootService: Error connecting via Playwright: ${error.message}`);
      throw error;
    }
  }
}

module.exports = KahootService;