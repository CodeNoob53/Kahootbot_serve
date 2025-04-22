// models/KahootBot.js (повністю оновлена версія)
const WebSocket = require('ws');
const proxyUtils = require('../utils/proxyUtils');
const KahootService = require('../services/KahootService');
const logger = require('../utils/logger');
const crypto = require('crypto');

class KahootBot {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.pin = config.pin;
    this.connected = false;
    this.socket = null;
    this.clientId = null;
    this.sessionData = null;
    this.currentQuestion = null;
    this.currentQuestionIndex = 0;
    this.lastAnswer = null;
    this.logCallback = config.onLog || console.log;
    this.reconnectAttempts = 0;
    this.MAX_RECONNECTS = 3;
    this.messageCounter = 1;
    this.ackCounter = 0;
    this.userRegistered = false;
    
    this.kahootService = new KahootService();
    
    this.log(`Bot initialized with name: ${this.name}, PIN: ${this.pin}`);
  }
  
  log(message, type = 'info') {
    if (this.logCallback) {
      this.logCallback(message, type);
    }
    logger.info(`[Bot ${this.id}] [${type}] ${message}`);
  }
  
  /**
   * Генерує випадковий WebSocket ключ
   * @returns {string} Base64 закодований рядок 16 байт
   */
  generateWebSocketKey() {
    const randomBytes = crypto.randomBytes(16);
    return randomBytes.toString('base64');
  }
  
  /**
   * Встановлює з'єднання з грою Kahoot
   * @returns {Promise<boolean>} Результат підключення
   */
  async connect() {
    try {
      this.log(`CONNECTING: Bot ${this.id} attempting to connect to PIN: ${this.pin}`);
      
      // Перевіряємо PIN
      if (!this.pin || !/^\d{6,10}$/.test(this.pin)) {
        this.log(`INVALID PIN: ${this.pin} is not valid`, 'error');
        return false;
      }
      
      this.log("Getting session token...");
      
      // Отримуємо токен сесії
      try {
        // Кілька спроб отримання сесійного токена з різними проксі
        let sessionAttempts = 0;
        const MAX_SESSION_ATTEMPTS = 3;
        
        while (!this.sessionData && sessionAttempts < MAX_SESSION_ATTEMPTS) {
          try {
            this.sessionData = await this.kahootService.getSession(this.pin);
            this.log(`Session data: ${JSON.stringify(this.sessionData)}`);
            
            // Перевіряємо наявність токена
            if (!this.sessionData.liveGameId && !this.sessionData.sessionToken) {
              this.log("SESSION ERROR: No token in session data", 'error');
              throw new Error('Failed to get game session token');
            }
            
            // Якщо є challenge, розв'язуємо його
            if (this.sessionData.challenge) {
              this.log('Challenge detected, solving...', 'info');
              
              try {
                this.sessionData.challengeToken = await this.kahootService.solveChallenge(this.sessionData.challenge);
                
                if (!this.sessionData.challengeToken) {
                  this.log('CHALLENGE ERROR: Failed to solve challenge', 'error');
                  throw new Error('Failed to solve challenge token');
                }
                
                this.log(`Challenge solved, token: ${this.sessionData.challengeToken.substring(0, 10)}...`);
              } catch (challengeError) {
                this.log(`CHALLENGE ERROR: ${challengeError.message}`, 'error');
                throw challengeError;
              }
            }
            
          } catch (sessionError) {
            sessionAttempts++;
            this.log(`SESSION ATTEMPT ${sessionAttempts} FAILED: ${sessionError.message}`, 'warn');
            
            if (sessionAttempts < MAX_SESSION_ATTEMPTS) {
              // Очікування перед наступною спробою
              await new Promise(resolve => setTimeout(resolve, 1000 * sessionAttempts));
            } else {
              throw new Error(`Failed to get session after ${MAX_SESSION_ATTEMPTS} attempts`);
            }
          }
        }
        
        // Встановлюємо WebSocket-з'єднання
        this.log('Connecting WebSocket...', 'info');
        const connected = await this.connectWebSocket();
        
        if (!connected) {
          this.log('Failed to connect WebSocket', 'error');
          return false;
        }
        
        return true;
      } catch (error) {
        this.log(`CONNECTION ERROR: ${error.message}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`GENERAL ERROR: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Встановлює WebSocket-з'єднання з сервером Kahoot
   * @returns {Promise<boolean>} Результат підключення
   */
  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        // Визначаємо, чи використовувати проксі
        const useProxy = this.config && this.config.bypassProxy === true ? false : true;
        const agent = useProxy ? proxyUtils.getProxyAgent() : null;
        
        // Генеруємо URL для WebSocket
        let wsUrl;
        try {
          wsUrl = this.kahootService.generateWebSocketUrl(this.sessionData, this.pin);
        } catch (urlError) {
          this.log(`Error generating WebSocket URL: ${urlError.message}`, 'error');
          reject(urlError);
          return;
        }
        
        this.log(`WS: Connecting to ${wsUrl} ${useProxy ? 'with proxy' : 'directly'}`);
        this.log(`WS: Proxy agent: ${agent ? 'Yes' : 'No'}`);
        
        // Генеруємо випадковий User-Agent
        const userAgent = this.kahootService.getRandomUserAgent();
        
        // Генеруємо випадкові cookie
        const cookies = this.kahootService.generateKahootCookies();
        
        // Заголовки WebSocket-з'єднання з реального логу
        const headers = {
          'Upgrade': 'websocket',
          'Origin': 'https://kahoot.it',
          'Cache-Control': 'no-cache',
          'Accept-Language': 'en-US,en;q=0.9',
          'Pragma': 'no-cache',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': this.generateWebSocketKey(),
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'User-Agent': userAgent,
          'Sec-WebSocket-Version': '13',
          'Host': 'kahoot.it',
          'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
          'Sec-Fetch-Dest': 'websocket',
          'Sec-Fetch-Mode': 'websocket',
          'Sec-Fetch-Site': 'same-origin',
          'sec-ch-ua': '"Google Chrome";v="135", "Not=A?Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"'
        };
        
        // Додаємо cookie, якщо вони є
        if (cookies.length > 0) {
          headers['Cookie'] = cookies.join('; ');
          this.log(`WS: Added ${cookies.length} cookies`);
        }
        
        // Налаштування WebSocket
        const options = {
          headers,
          agent,
          handshakeTimeout: 15000,
          perMessageDeflate: true
        };
        
        // Додаємо випадкову затримку для імітації людської поведінки
        const delay = Math.floor(Math.random() * 1000) + 500;
        this.log(`WS: Adding random delay of ${delay}ms before connection`);
        
        setTimeout(() => {
          try {
            // Створюємо WebSocket з'єднання
            this.socket = new WebSocket(wsUrl, options);
            
            // Обробляємо відкриття з'єднання
            this.socket.on('open', () => {
              this.log('WS: Connection established successfully');
              
              // Відразу НЕ відправляємо handshake
              // Замість цього просто відмічаємо, що з'єднання встановлено
              this.connected = true;
              this.reconnectAttempts = 0;
              
              // Додаємо невелику затримку перед handshake
              setTimeout(() => {
                this.sendHandshake();
              }, Math.floor(Math.random() * 300) + 100);
              
              resolve(true);
            });
            
            // Обробляємо повідомлення
            this.socket.on('message', (message) => {
              this.log(`WS: Received message of length ${message.length}`);
              this.handleSocketMessage(message);
            });
            
            // Обробляємо помилки
            this.socket.on('error', (error) => {
              this.log(`WS ERROR: ${error.message}`, 'error');
              this.connected = false;
              
              // Якщо помилка містить певні ключові слова, спробуємо використати інший проксі
              if (error.message.includes('403') || error.message.includes('forbidden') || 
                  error.message.includes('proxy') || error.message.includes('blocked')) {
                this.log('WS ERROR: Proxy might be blocked, try using a different proxy', 'error');
              }
              
              reject(error);
            });
            
            // Обробляємо закриття з'єднання
            this.socket.on('close', (code, reason) => {
              this.log(`WS CLOSED: ${code} ${reason || 'No reason'}`, 'warn');
              this.connected = false;
              
              // Спробуємо перепідключитись, якщо закриття не було навмисним
              if (code !== 1000 && this.reconnectAttempts < this.MAX_RECONNECTS) {
                this.reconnectAttempts++;
                this.log(`WS: Attempting to reconnect (${this.reconnectAttempts}/${this.MAX_RECONNECTS})...`);
                
                // Спробуємо перепідключитись через певний час
                setTimeout(() => this.connectWebSocket(), 2000 * this.reconnectAttempts);
              }
            });
            
            // Налаштовуємо таймаут для з'єднання
            const connectionTimeout = setTimeout(() => {
              this.log(`WS TIMEOUT: Connection timeout`, 'error');
              if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
                this.socket.terminate();
                reject(new Error('Connection timeout'));
              }
            }, 15000);
            
            // Очищаємо таймаут, якщо з'єднання встановлено
            this.socket.once('open', () => {
              clearTimeout(connectionTimeout);
            });
            
          } catch (wsError) {
            this.log(`WS CREATION ERROR: ${wsError.message}`, 'error');
            reject(wsError);
          }
        }, delay);
      } catch (error) {
        this.log(`WS SETUP ERROR: ${error.message}`, 'error');
        this.log(`WS SETUP STACK: ${error.stack}`, 'error');
        reject(error);
      }
    });
  }
  
  /**
   * Відправляє handshake повідомлення до сервера
   */
  sendHandshake() {
    const handshakeMsg = this.kahootService.generateHandshakeMessage();
    
    this.log(`HANDSHAKE: Sending handshake message`);
    this.sendSocketMessage([handshakeMsg]);
  }
  
  /**
   * Відправляє повідомлення до WebSocket
   * @param {Array|Object} message - Повідомлення для відправки
   * @returns {boolean} Результат відправки
   */
  sendSocketMessage(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.log(`SOCKET ERROR: Cannot send message - WebSocket not open`, 'error');
      return false;
    }
    
    try {
      const msgStr = JSON.stringify(message);
      this.log(`SOCKET SEND: Sending message of length ${msgStr.length}`);
      this.socket.send(msgStr);
      return true;
    } catch (error) {
      this.log(`SOCKET SEND ERROR: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Обробляє вхідні повідомлення від WebSocket
   * @param {string} message - Повідомлення від сервера
   */
  handleSocketMessage(message) {
    try {
      this.log(`SOCKET RECEIVE: Processing message`);
      
      let msgData;
      try {
        msgData = JSON.parse(message);
        this.log(`SOCKET RECEIVE: Parsed message successfully`);
      } catch (parseError) {
        this.log(`SOCKET PARSE ERROR: ${parseError.message}`, 'error');
        return;
      }
      
      // Обробляємо масив повідомлень
      if (Array.isArray(msgData)) {
        this.log(`SOCKET RECEIVE: Processing ${msgData.length} messages`);
        msgData.forEach(msg => this.processMessage(msg));
      } else {
        this.log(`SOCKET RECEIVE: Processing single message`);
        this.processMessage(msgData);
      }
    } catch (error) {
      this.log(`SOCKET PROCESSING ERROR: ${error.message}`, 'error');
    }
  }
  
  /**
   * Обробляє окреме повідомлення від сервера
   * @param {object} message - Повідомлення для обробки
   */
  processMessage(message) {
    try {
      const { channel, data, clientId, successful, error } = message;
      
      this.log(`PROCESS: Message on channel: ${channel}`);
      
      // Обробляємо відповідь на handshake
      if (channel === '/meta/handshake' && successful) {
        this.clientId = clientId;
        this.log(`HANDSHAKE SUCCESS: ClientId: ${this.clientId}`);
        
        // Відправляємо connect після handshake
        const connectMsg = this.kahootService.generateConnectMessage(this.clientId, String(++this.messageCounter), this.ackCounter);
        this.sendSocketMessage([connectMsg]);
        
        // Якщо не було відправлено login, відправляємо його
        if (!this.userRegistered) {
          this.registerUser();
        }
      }
      
      // Обробляємо відповідь на connect
      if (channel === '/meta/connect' && successful) {
        this.log(`CONNECT SUCCESS: Received ack ${message.ext?.ack || 'unknown'}`);
        
        // Оновлюємо ack
        if (message.ext && message.ext.ack !== undefined) {
          this.ackCounter = message.ext.ack;
        }
        
        // Відправляємо наступний connect
        const connectMsg = this.kahootService.generateConnectMessage(
          this.clientId, 
          String(++this.messageCounter), 
          this.ackCounter
        );
        this.sendSocketMessage([connectMsg]);
      }
      
      // Обробляємо повідомлення гри
      if (channel === '/service/player') {
        this.log(`GAME MESSAGE: ${JSON.stringify(data)}`);
        
        // Оновлюємо стан питання, якщо отримали нове
        if (data && data.type === 'question') {
          this.currentQuestionIndex++;
          this.currentQuestion = data.question;
          this.log(`QUESTION: #${this.currentQuestionIndex} - ${data.question}`);
        }
      }
      
      // Обробляємо повідомлення статусу
      if (channel === '/service/status') {
        this.log(`STATUS: ${JSON.stringify(data)}`);
      }
      
      // Обробляємо помилки
      if (error) {
        this.log(`SERVER ERROR: ${error}`, 'error');
      }
    } catch (processError) {
      this.log(`PROCESS ERROR: ${processError.message}`, 'error');
    }
  }
  
  /**
   * Реєструє користувача в грі
   */
  registerUser() {
    if (!this.clientId) {
      this.log(`REGISTER ERROR: No clientId available`, 'error');
      return;
    }
    
    const loginMsg = this.kahootService.generateLoginMessage(
      this.clientId, 
      this.pin, 
      this.name, 
      String(++this.messageCounter)
    );
    
    this.log(`REGISTER: Sending registration with name ${this.name}`);
    this.sendSocketMessage([loginMsg]);
    this.userRegistered = true;
  }
  
  /**
   * Відключення від гри
   * @returns {Promise<boolean>} Результат відключення
   */
  async disconnect() {
    try {
      this.log(`DISCONNECT: Disconnecting bot ${this.id}`);
      
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        // Відправляємо повідомлення про вихід, якщо зареєстровані
        if (this.userRegistered && this.clientId) {
          const leaveMsg = {
            id: String(++this.messageCounter),
            channel: "/service/controller",
            data: {
              type: "leave"
            },
            clientId: this.clientId
          };
          
          this.log(`DISCONNECT: Sending leave message`);
          this.sendSocketMessage([leaveMsg]);
        }
        
        // Закриваємо з'єднання
        this.log(`DISCONNECT: Closing socket`);
        this.socket.close();
      }
      
      this.connected = false;
      this.clientId = null;
      this.log(`DISCONNECT: Completed`);
      
      return true;
    } catch (error) {
      this.log(`DISCONNECT ERROR: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Відправляє відповідь на питання
   * @param {number} choice - Індекс вибору (починається з 0)
   * @returns {boolean} Результат відправки
   */
  answerQuestion(choice) {
    if (!this.connected || !this.clientId) {
      this.log(`ANSWER ERROR: Not connected`, 'error');
      return false;
    }
    
    // Перевіряємо, чи є активне питання
    if (this.currentQuestion === null) {
      this.log(`ANSWER ERROR: No active question`, 'error');
      return false;
    }
    
    try {
      const answerMsg = {
        id: String(++this.messageCounter),
        channel: "/service/controller",
        data: {
          type: "message",
          gameid: this.pin,
          host: "kahoot.it",
          content: JSON.stringify({
            type: "quiz-answer",
            choice: choice,
            meta: {
              lag: Math.floor(Math.random() * 30) + 10
            }
          })
        },
        clientId: this.clientId
      };
      
      this.log(`ANSWER: Sending choice ${choice} for question #${this.currentQuestionIndex}`);
      const result = this.sendSocketMessage([answerMsg]);
      
      if (result) {
        this.lastAnswer = choice;
      }
      
      return result;
    } catch (error) {
      this.log(`ANSWER ERROR: ${error.message}`, 'error');
      return false;
    }
  }
}

module.exports = KahootBot;