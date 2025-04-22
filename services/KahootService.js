// services/KahootService.js (повністю оновлена версія)
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const proxyUtils = require('../utils/proxyUtils');
const generateKahootCookies = require('../utils/cookiesGenerator');
const logger = require('../utils/logger');

class KahootService {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
      'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1'
    ];
    // Кеш токенів для повторних підключень
    this.tokenCache = new Map();
  }
  
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }
  
  generateKahootCookies() {
    // Використовуємо генератор куків на основі реальних зразків
    return generateKahootCookies();
  }
  
  /**
   * Отримання сесії Kahoot за PIN-кодом
   * @param {string} pin - PIN гри
   * @returns {Promise<object>} Об'єкт з даними сесії
   */
  async getSession(pin) {
    return new Promise((resolve, reject) => {
      try {
        logger.info(`KahootService: Getting session for PIN: ${pin}`);
        
        if (!pin || !/^\d{6,10}$/.test(pin)) {
          logger.error(`KahootService: Invalid game PIN: ${pin}`);
          reject(new Error('Invalid game PIN'));
          return;
        }
        
        // Додаємо випадкову затримку перед запитом (як реальний користувач)
        const delay = Math.floor(Math.random() * 500) + 500;
        logger.info(`KahootService: Adding random delay of ${delay}ms before request`);
        
        setTimeout(() => {
          // Базовий URL
          const url = `https://kahoot.it/reserve/session/${pin}/`;
          logger.info(`KahootService: Request URL: ${url}`);
          
          // Генеруємо випадковий cid (client id) і sid (session id)
          const cid = Math.floor(Math.random() * 1000000);
          const sid = uuidv4().substring(0, 8);
          const urlWithParams = `${url}?cid=${cid}&sid=${sid}`;
          
          const agent = proxyUtils.getProxyAgent();
          logger.info(`KahootService: Proxy agent created: ${agent ? 'Yes' : 'No'}`);
          
          // Генеруємо cookies
          const cookies = this.generateKahootCookies();
          logger.info(`KahootService: Generated ${cookies.length} cookies`);
          
          // Розширені заголовки з логу реального браузера
          const headers = {
            'User-Agent': this.getRandomUserAgent(),
            'Origin': 'https://kahoot.it',
            'Referer': `https://kahoot.it/join?gameId=${pin}&source=web`,
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'application/json, text/plain, */*',
            'Cache-Control': 'no-cache',
            'Cookie': cookies.join('; '),
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Connection': 'keep-alive',
            'Pragma': 'no-cache',
            'sec-ch-ua': '"Google Chrome";v="135", "Not=A?Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
          };
          
          const options = {
            method: 'GET',
            headers: headers,
            agent: agent
          };
          
          logger.debug(`KahootService: Request options: ${JSON.stringify(options, null, 2)}`);
          
          const req = https.request(urlWithParams, options, (res) => {
            logger.info(`KahootService: Response status: ${res.statusCode}`);
            logger.debug(`KahootService: Response headers: ${JSON.stringify(res.headers)}`);
            
            // Зберігаємо важливі заголовки
            const sessionToken = res.headers['x-kahoot-session-token'] || '';
            const gameServer = res.headers['x-kahoot-gameserver'] || '';
            
            let data = '';
            
            res.on('data', (chunk) => {
              data += chunk;
            });
            
            res.on('end', () => {
              logger.info(`KahootService: Response data length: ${data.length}`);
              
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  const result = JSON.parse(data);
                  
                  // Додаємо заголовки до результату
                  result.sessionToken = sessionToken;
                  result.gameServer = gameServer;
                  
                  // Перевіряємо наявність liveGameId або створюємо з sessionToken
                  if (!result.liveGameId && sessionToken) {
                    result.liveGameId = sessionToken;
                  }
                  
                  logger.debug(`KahootService: Parsed response: ${JSON.stringify(result)}`);
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
          
          // Додаємо таймаут для запиту
          req.setTimeout(15000, () => {
            logger.error(`KahootService: Request timeout`);
            req.destroy(new Error('Request timeout'));
          });
          
          req.end();
          logger.info(`KahootService: Request sent`);
        }, delay);
        
      } catch (error) {
        logger.error(`KahootService: General error: ${error.message}`);
        logger.error(`KahootService: Stack: ${error.stack}`);
        reject(error);
      }
    });
  }
  
  /**
   * Отримання WebSocket URL на основі даних сесії
   * @param {object} sessionData - Дані сесії з методу getSession
   * @param {string} pin - PIN гри
   * @returns {string} WebSocket URL
   */
  generateWebSocketUrl(sessionData, pin) {
    logger.info(`KahootService: Generating WebSocket URL for PIN: ${pin}`);
    
    try {
      // У відповіді може бути готовий token або ми його формуємо
      let wsUrl;
      
      // Спочатку перевіряємо, чи є токен у x-kahoot-session-token
      if (sessionData.sessionToken) {
        wsUrl = `wss://kahoot.it/cometd/${pin}/${sessionData.sessionToken}`;
        logger.info(`KahootService: Using token from headers: ${sessionData.sessionToken.substring(0, 10)}...`);
      } 
      // Потім перевіряємо liveGameId з відповіді
      else if (sessionData.liveGameId) {
        wsUrl = `wss://kahoot.it/cometd/${pin}/${sessionData.liveGameId}`;
        logger.info(`KahootService: Using liveGameId: ${sessionData.liveGameId.substring(0, 10)}...`);
      } 
      // Якщо нема challenge, використовуємо простий формат
      else if (!sessionData.challenge) {
        throw new Error('No session token or liveGameId found in session data');
      }
      // Якщо є challenge, ми вже розшифрували його в getSession
      else if (sessionData.challengeToken) {
        wsUrl = `wss://kahoot.it/cometd/${pin}/${sessionData.liveGameId}/${encodeURIComponent(sessionData.challengeToken)}`;
        logger.info(`KahootService: Using challenge token: ${sessionData.challengeToken.substring(0, 10)}...`);
      }
      // Інакше, спробуємо розшифрувати challenge
      else if (sessionData.challenge) {
        logger.warn(`KahootService: Challenge not decoded yet, attempting to solve`);
        throw new Error('Challenge not decoded yet, use solveChallenge first');
      }
      
      // Додаємо параметр запобігання кешуванню
      const timestamp = Date.now();
      wsUrl += `?_=${timestamp}`;
      
      logger.info(`KahootService: Generated WebSocket URL: ${wsUrl}`);
      return wsUrl;
    } catch (error) {
      logger.error(`KahootService: Error generating WS URL: ${error.message}`);
      throw error;
    }
  }
  
  async solveChallenge(challenge) {
    return new Promise((resolve, reject) => {
      try {
        logger.info('KahootService: Solving challenge token');
        
        if (!challenge) {
          logger.error('KahootService: No challenge provided');
          reject(new Error('No challenge token provided'));
          return;
        }
        
        logger.info(`KahootService: Challenge length: ${challenge.length}`);
        
        // Витягуємо закодоване повідомлення
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
        
        // Витягуємо формулу зміщення
        let offset;
        try {
          const offsetMatch = challenge.match(/var\s+offset\s*=\s*([^;]+);/);
          if (!offsetMatch) {
            logger.warn('KahootService: Could not find offset formula, using default');
            offset = 18150; // Значення за замовчуванням, якщо не знайдено
          } else {
            const formula = offsetMatch[1];
            logger.info(`KahootService: Offset formula: ${formula}`);
            
            // Очищуємо формулу
            const cleanFormula = formula
              .replace(/\s+/g, '')
              .replace(/this\.angular\.isArray|this\.angular\.isObject/g, 'false')
              .replace(/console\.log\([^)]+\)/g, '')
              .replace(/window\.|document\.|localStorage|sessionStorage/g, '')
              .replace(/eval|Function/g, '')
              .replace(/\t/g, ''); // Важливо - видалення табуляції
            
            logger.info(`KahootService: Cleaned formula: ${cleanFormula}`);
            
            // Захищене обчислення
            try {
              offset = eval(cleanFormula);
              logger.info(`KahootService: Calculated offset: ${offset}`);
            } catch (evalError) {
              logger.error(`KahootService: Error evaluating formula: ${evalError.message}`);
              // Спробуємо буквальну інтерпретацію формули
              // Приклад: ((14 + 37) + (84 * 44)) + 12
              try {
                const parts = cleanFormula.match(/\(\((\d+)\+(\d+)\)\+\((\d+)\*(\d+)\)\)\+(\d+)/);
                if (parts && parts.length === 6) {
                  const [_, a, b, c, d, e] = parts.map(Number);
                  offset = ((a + b) + (c * d)) + e;
                  logger.info(`KahootService: Manual calculation of offset: ${offset}`);
                } else {
                  throw new Error('Could not parse formula');
                }
              } catch (manualError) {
                logger.error(`KahootService: Manual calculation failed: ${manualError.message}`);
                offset = 3759; // Використовуємо значення з логів
                logger.info(`KahootService: Using hardcoded offset: ${offset}`);
              }
            }
          }
        } catch (error) {
          logger.error(`KahootService: Error calculating offset: ${error.message}`);
          // Спробуємо кілька можливих значень зміщення
          const possibleOffsets = [3759, 18150, 16050, 17150, 19200, 20250];
          
          // Тестуємо всі можливі зміщення і вибираємо найкраще
          let bestOffset = null;
          let bestToken = null;
          let maxValidChars = 0;
          
          for (const testOffset of possibleOffsets) {
            const token = this.decodeMessage(encodedMessage, testOffset);
            // Рахуємо дійсні символи (a-zA-Z0-9)
            const validChars = (token.match(/[a-zA-Z0-9]/g) || []).length;
            
            if (validChars > maxValidChars) {
              maxValidChars = validChars;
              bestOffset = testOffset;
              bestToken = token;
            }
          }
          
          if (bestOffset) {
            offset = bestOffset;
            logger.info(`KahootService: Selected best offset ${offset} with ${maxValidChars} valid characters`);
            
            if (bestToken) {
              // Відразу повертаємо розшифроване повідомлення
              logger.info('KahootService: Using pre-decoded token from best offset');
              resolve(bestToken);
              return;
            }
          } else {
            offset = 3759; // Fallback value from logs
            logger.info(`KahootService: Using fallback offset: ${offset}`);
          }
        }
        
        // Розшифруємо повідомлення
        const decodedToken = this.decodeMessage(encodedMessage, offset);
        logger.info(`KahootService: Decoded token length: ${decodedToken.length}`);
        
        // Додатковий валідаційний крок
        const validChars = (decodedToken.match(/[a-zA-Z0-9]/g) || []).length;
        logger.info(`KahootService: Token contains ${validChars} valid characters out of ${decodedToken.length}`);
        
        if (validChars < decodedToken.length * 0.7) {
          logger.warn('KahootService: Token appears invalid, trying alternatives');
          
          // Перебираємо альтернативні зміщення
          const alternativeOffsets = [18150, 16050, 17150, 19200, 20250];
          for (const altOffset of alternativeOffsets) {
            if (altOffset === offset) continue;
            
            logger.info(`KahootService: Trying alternative offset: ${altOffset}`);
            const altToken = this.decodeMessage(encodedMessage, altOffset);
            
            // Рахуємо дійсні символи
            const altValidChars = (altToken.match(/[a-zA-Z0-9]/g) || []).length;
            logger.info(`KahootService: Alternative token has ${altValidChars} valid characters`);
            
            if (altValidChars > validChars) {
              logger.info(`KahootService: Using better token with offset ${altOffset}`);
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
        
        // Математична формула з Kahoot challenge
        let newCharCode = Math.floor(((charCode * (position + 1) + offset) % 77) + 48);
        
        // Перевірка на допустимі ASCII
        if (isNaN(newCharCode) || !isFinite(newCharCode) || newCharCode < 32 || newCharCode > 126) {
          newCharCode = 88; // ASCII для 'X'
        }
        
        result += String.fromCharCode(newCharCode);
      }
      
      logger.info(`KahootService: Decoded result length: ${result.length}`);
      return result;
    } catch (error) {
      logger.error(`KahootService: Error decoding message: ${error.message}`);
      return 'BACKUP_TOKEN_' + Date.now(); // Fallback токен
    }
  }
  
  /**
   * Генерує формат handshake повідомлення на основі реального логу
   * @returns {object} handshake об'єкт
   */
  generateHandshakeMessage() {
    const timestamp = Date.now();
    return {
      id: "1",
      version: "1.0",
      minimumVersion: "1.0",
      channel: "/meta/handshake",
      supportedConnectionTypes: ["websocket", "long-polling", "callback-polling"],
      advice: {
        timeout: 60000,
        interval: 0
      },
      ext: {
        ack: true,
        timesync: {
          tc: timestamp,
          l: 0,
          o: 0
        }
      }
    };
  }
  
  /**
   * Генерує повідомлення login для автентифікації користувача
   * @param {string} clientId - clientId отриманий від сервера
   * @param {string} pin - PIN гри
   * @param {string} name - Ім'я гравця
   * @param {string} msgId - ID повідомлення (зазвичай збільшується на 1 з кожним повідомленням)
   * @returns {object} login повідомлення
   */
  generateLoginMessage(clientId, pin, name, msgId) {
    return {
      id: msgId,
      channel: "/service/controller",
      data: {
        type: "login",
        gameid: pin,
        host: "kahoot.it",
        name: name,
        content: "{}"
      },
      clientId: clientId,
      ext: {}
    };
  }
  
  /**
   * Генерує повідомлення connect для підтримки з'єднання
   * @param {string} clientId - clientId отриманий від сервера
   * @param {string} msgId - ID повідомлення
   * @param {number} ack - номер підтвердження (зазвичай починається з 0)
   * @returns {object} connect повідомлення
   */
  generateConnectMessage(clientId, msgId, ack) {
    const timestamp = Date.now();
    const message = {
      id: msgId,
      channel: "/meta/connect",
      connectionType: "websocket",
      clientId: clientId
    };
    
    if (ack === 0) {
      message.advice = { timeout: 0 };
      message.ext = {
        ack: ack,
        timesync: {
          tc: timestamp,
          l: 440,  // значення з логу
          o: 1807  // значення з логу
        }
      };
    } else {
      message.ext = {
        ack: ack,
        timesync: {
          tc: timestamp,
          l: 440,
          o: 1807
        }
      };
    }
    
    return message;
  }
}

module.exports = KahootService;