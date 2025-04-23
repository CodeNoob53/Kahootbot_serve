// models/KahootBot.js
const WebSocket = require('ws');
const proxyUtils = require('../utils/proxyUtils');
const KahootService = require('../services/KahootService');
const logger = require('../utils/logger');

class KahootBot {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.pin = config.pin;
    this.connected = false;
    this.socket = null;
    this.clientId = null;
    this.sessionToken = null;
    this.challengeToken = null;
    this.currentQuestion = null;
    this.currentQuestionIndex = 0;
    this.lastAnswer = null;
    this.logCallback = config.onLog || console.log;
    this.browserPage = null; // Зберігаємо сторінку Playwright
    this.usePlaywright = config.usePlaywright !== false; // За замовчуванням використовуємо Playwright
    
    this.kahootService = new KahootService();
    
    this.log(`Bot initialized with name: ${this.name}, PIN: ${this.pin}, usePlaywright: ${this.usePlaywright}`);
  }
  
  log(message, type = 'info') {
    if (this.logCallback) {
      this.logCallback(message, type);
    }
    logger.info(`[Bot ${this.id}] [${type}] ${message}`);
  }
  
  /**
   * Встановлює з'єднання з грою Kahoot
   * @returns {Promise<boolean>} Результат підключення
   */
  async connect() {
    try {
      this.log(`Attempting to connect to PIN: ${this.pin}`, 'info');
      
      // Validate PIN format
      if (!this.pin || !/^\d{6,10}$/.test(this.pin)) {
        this.log(`Invalid PIN: ${this.pin}`, 'error');
        return false;
      }

      // Використовуємо Playwright, якщо дозволено
      if (this.usePlaywright) {
        try {
          this.log('Using Playwright for connection', 'info');
          const result = await this.connectViaPlaywright();
          return result;
        } catch (playwrightError) {
          this.log(`Playwright connection failed: ${playwrightError.message}`, 'error');
          this.log('Falling back to direct WebSocket connection', 'info');
          // Продовжуємо зі звичайним методом з'єднання
        }
      }
      
      // Отримуємо токен сесії
      this.log("Getting session token...", 'info');
      try {
        const sessionData = await this.kahootService.getSession(this.pin);
        this.log(`Session data received: ${JSON.stringify(sessionData)}`, 'debug');
        
        if (!sessionData || !sessionData.liveGameId) {
          this.log("No liveGameId in session data", 'error');
          throw new Error('Failed to get game session token');
        }
        
        this.sessionToken = sessionData.liveGameId;
        this.log(`Session token: ${this.sessionToken.substring(0, 10)}...`, 'info');
        
        // Якщо є challenge, вирішуємо його
        if (sessionData.challenge) {
          this.log('Challenge detected, solving...', 'info');
          
          try {
            this.challengeToken = await this.kahootService.solveChallenge(sessionData.challenge);
            
            if (!this.challengeToken) {
              this.log('Failed to solve challenge token', 'error');
              throw new Error('Failed to solve challenge token');
            }
            
            this.log(`Challenge token: ${this.challengeToken.substring(0, 10)}...`, 'info');
          } catch (challengeError) {
            this.log(`Challenge error: ${challengeError.message}`, 'error');
            throw challengeError;
          }
        }
        
        // Підключаємо WebSocket
        this.log('Connecting WebSocket...', 'info');
        await this.connectWebSocket();
        
        return true;
      } catch (sessionError) {
        this.log(`Session error: ${sessionError.message}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`Connect error: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Підключення до гри через Playwright
   * @returns {Promise<boolean>} Результат підключення
   */
  async connectViaPlaywright() {
    try {
      this.log('Connecting via Playwright...', 'info');
      
      const result = await this.kahootService.connectViaPlaywright(this.pin, this.name);
      
      if (result.success) {
        this.log('Successfully connected via Playwright', 'info');
        this.connected = true;
        this.clientId = result.clientId;
        this.browserPage = result.page; // Зберігаємо сторінку для подальшої взаємодії
        
        // Підписуємось на події від сторінки, щоб отримувати дані про питання та відповіді
        this.setupPlaywrightListeners();
        
        return true;
      } else {
        this.log('Failed to connect via Playwright', 'error');
        return false;
      }
    } catch (error) {
      this.log(`Playwright connection error: ${error.message}`, 'error');
      throw error;
    }
  }
  
  /**
   * Налаштовуємо обробники подій для Playwright сторінки
   */
  setupPlaywrightListeners() {
    if (!this.browserPage) return;
    
    this.log('Setting up Playwright event listeners', 'info');
    
    // Прослуховуємо WebSocket повідомлення
    this.browserPage.on('websocket', ws => {
      this.log(`WebSocket opened in Playwright: ${ws.url()}`, 'debug');
      
      ws.on('message', data => {
        try {
          const msgStr = data.toString();
          
          // Шукаємо повідомлення про питання
          if (msgStr.includes('"type":"question"')) {
            this.log('Question detected in WebSocket message', 'info');
            this.handleQuestionMessage(msgStr);
          }
          
          // Шукаємо повідомлення про результати
          if (msgStr.includes('"type":"quiz_result"')) {
            this.log('Quiz result detected in WebSocket message', 'info');
            // Можна додати обробку результатів
          }
        } catch (error) {
          this.log(`Error processing WebSocket message: ${error.message}`, 'error');
        }
      });
    });
    
    // Використовуємо MutationObserver через Playwright для слідкування за DOM змінами
    this.browserPage.evaluate(() => {
      // Створюємо функцію для передачі даних в консоль, щоб ми могли їх побачити
      window.kahootBotLog = function(data) {
        console.log('KAHOOT_BOT_DATA:' + JSON.stringify(data));
      };
      
      // Слідкуємо за змінами DOM для виявлення нових питань
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          // Шукаємо елементи питань
          const questionElements = document.querySelectorAll('.question-container, .question-text');
          if (questionElements.length > 0) {
            const questionText = questionElements[0].textContent;
            window.kahootBotLog({
              type: 'question_detected',
              text: questionText
            });
            
            // Шукаємо варіанти відповідей
            const answerElements = document.querySelectorAll('.answer');
            const answers = Array.from(answerElements).map((el, index) => ({
              index,
              text: el.textContent.trim(),
              color: el.classList.contains('red') ? 'red' : 
                     el.classList.contains('blue') ? 'blue' : 
                     el.classList.contains('yellow') ? 'yellow' : 'green'
            }));
            
            if (answers.length > 0) {
              window.kahootBotLog({
                type: 'answers_detected',
                answers
              });
            }
          }
        }
      });
      
      // Запускаємо спостереження за всім документом
      observer.observe(document.body, { 
        childList: true, 
        subtree: true,
        characterData: true
      });
      
      // Також додаємо обробники кліків, щоб автоматично відповідати на питання
      document.addEventListener('click', (event) => {
        const target = event.target.closest('.answer');
        if (target) {
          const index = Array.from(document.querySelectorAll('.answer')).indexOf(target);
          window.kahootBotLog({
            type: 'answer_clicked',
            index
          });
        }
      }, true);
    });
    
    // Прослуховуємо консоль для отримання наших спеціальних повідомлень
    this.browserPage.on('console', msg => {
      const text = msg.text();
      if (text.startsWith('KAHOOT_BOT_DATA:')) {
        try {
          const data = JSON.parse(text.substring('KAHOOT_BOT_DATA:'.length));
          this.handlePlaywrightEvent(data);
        } catch (error) {
          this.log(`Error parsing Playwright console data: ${error.message}`, 'error');
        }
      }
    });
  }
  
  /**
   * Обробляємо події від Playwright
   */
  handlePlaywrightEvent(data) {
    switch (data.type) {
      case 'question_detected':
        this.log(`Question detected: ${data.text}`, 'info');
        this.currentQuestion = data.text;
        this.currentQuestionIndex++;
        break;
        
      case 'answers_detected':
        this.log(`Answers detected: ${JSON.stringify(data.answers)}`, 'info');
        // Автоматично обираємо відповідь (можна реалізувати логіку вибору)
        setTimeout(() => this.answerQuestionViaPlaywright(Math.floor(Math.random() * data.answers.length)), 
          1000 + Math.random() * 5000); // Випадкова затримка для імітації людської поведінки
        break;
        
      case 'answer_clicked':
        this.log(`Answer clicked: ${data.index}`, 'info');
        this.lastAnswer = data.index;
        break;
    }
  }
  
  /**
   * Відповідаємо на питання через Playwright
   */
  async answerQuestionViaPlaywright(answerIndex) {
    if (!this.browserPage) return;
    
    try {
      this.log(`Answering question with index ${answerIndex}`, 'info');
      
      // Знаходимо елементи відповідей
      const answerElements = await this.browserPage.$$('.answer');
      
      if (answerElements.length > 0 && answerIndex < answerElements.length) {
        // Клікаємо на відповідь
        await answerElements[answerIndex].click();
        this.lastAnswer = answerIndex;
        this.log(`Clicked on answer ${answerIndex}`, 'info');
        return true;
      } else {
        this.log(`Cannot find answer elements or invalid index ${answerIndex}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`Error answering question: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Обробляємо повідомлення про питання
   */
  handleQuestionMessage(message) {
    try {
      const data = JSON.parse(message);
      
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.data && item.data.type === 'question') {
            this.currentQuestionIndex++;
            this.currentQuestion = item.data.question || 'Unknown question';
            this.log(`Question #${this.currentQuestionIndex}: ${this.currentQuestion}`, 'info');
          }
        }
      } else if (data.data && data.data.type === 'question') {
        this.currentQuestionIndex++;
        this.currentQuestion = data.data.question || 'Unknown question';
        this.log(`Question #${this.currentQuestionIndex}: ${this.currentQuestion}`, 'info');
      }
    } catch (error) {
      this.log(`Error handling question message: ${error.message}`, 'error');
    }
  }
  
  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        const useProxy = proxyUtils.getProxyConfig().host ? true : false;
        const agent = useProxy ? proxyUtils.getProxyAgent() : null;
  
        // Формуємо безпечний WS URL
        let wsUrl = this.challengeToken
          ? `wss://kahoot.it/cometd/${this.pin}/${this.sessionToken}/${encodeURIComponent(this.challengeToken)}`
          : `wss://kahoot.it/cometd/${this.pin}/${this.sessionToken}`;
        
        const randomParam = Date.now() + Math.floor(Math.random() * 10000);
        wsUrl += `?_=${randomParam}`;
  
        this.log(`Connecting to ${wsUrl} ${useProxy ? 'with proxy' : 'directly'}`, 'info');
        this.log(`Proxy agent: ${agent ? 'Yes' : 'No'}`, 'debug');
  
        const userAgent = this.kahootService.getRandomUserAgent();
        const headers = {
          'User-Agent': userAgent,
          'Origin': 'https://kahoot.it',
          'Referer': `https://kahoot.it/join?gameId=${this.pin}&source=web`,
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': '*/*',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
          'Sec-Fetch-Dest': 'websocket',
          'Sec-Fetch-Mode': 'websocket',
          'Sec-Fetch-Site': 'same-origin',
          'Host': 'kahoot.it'
        };
  
        const cookies = this.kahootService.generateKahootCookies();
        if (cookies.length > 0) {
          headers['Cookie'] = cookies.join('; ');
          this.log(`Added ${cookies.length} cookies`, 'debug');
        }
  
        const options = {
          headers,
          agent,
          handshakeTimeout: 15000,
          perMessageDeflate: true
        };
  
        setTimeout(() => {
          try {
            this.socket = new WebSocket(wsUrl, options);
            this.socket.on('open', () => {
              this.log('WebSocket connection established successfully', 'info');
              this.connected = true;
  
              setTimeout(() => {
                this.sendHandshake();
                resolve(true);
              }, Math.floor(Math.random() * 300) + 100);
            });
  
            this.socket.on('message', (message) => {
              this.log(`Received WebSocket message of length ${message.length}`, 'debug');
              this.handleSocketMessage(message);
            });
  
            this.socket.on('error', (error) => {
              this.log(`WebSocket error: ${error.message}`, 'error');
              this.connected = false;
              reject(error);
            });
  
            this.socket.on('close', (code, reason) => {
              this.log(`WebSocket closed: ${code} ${reason || 'No reason'}`, 'info');
              this.connected = false;
            });
  
            const connectionTimeout = setTimeout(() => {
              this.log(`WebSocket connection timeout`, 'error');
              if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
                this.socket.terminate();
                reject(new Error('Connection timeout'));
              }
            }, 15000);
  
            this.socket.once('open', () => {
              clearTimeout(connectionTimeout);
            });
  
          } catch (wsError) {
            this.log(`WebSocket creation error: ${wsError.message}`, 'error');
            reject(wsError);
          }
        }, Math.floor(Math.random() * 500) + 100);
      } catch (error) {
        this.log(`WebSocket setup error: ${error.message}`, 'error');
        reject(error);
      }
    });
  }
  
  sendHandshake() {
    const handshakeMsg = {
      id: Date.now(),
      version: '1.0',
      minimumVersion: '1.0',
      channel: '/meta/handshake',
      supportedConnectionTypes: ['websocket', 'long-polling'],
      advice: {
        timeout: 60000,
        interval: 0
      },
      ext: {
        ack: true,
        timesync: {
          tc: Date.now(),
          l: 0,
          o: 0
        }
      }
    };
    
    // Add challenge token if available
    if (this.challengeToken) {
      handshakeMsg.ext.challenge = this.challengeToken;
      this.log(`Added challenge token to handshake`, 'debug');
    }
    
    this.log(`Sending handshake message`, 'info');
    this.sendSocketMessage([handshakeMsg]);
  }
  
  sendSocketMessage(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.log(`Cannot send message - WebSocket not open`, 'error');
      return false;
    }
    
    try {
      const msgStr = JSON.stringify(message);
      this.log(`Sending message of length ${msgStr.length}`, 'debug');
      this.socket.send(msgStr);
      return true;
    } catch (error) {
      this.log(`Error sending socket message: ${error.message}`, 'error');
      return false;
    }
  }
  
  handleSocketMessage(message) {
    try {
      this.log(`Processing WebSocket message`, 'debug');
      
      let msgData;
      try {
        msgData = JSON.parse(message);
        this.log(`Parsed WebSocket message successfully`, 'debug');
      } catch (parseError) {
        this.log(`Error parsing WebSocket message: ${parseError.message}`, 'error');
        return;
      }
      
      // Handle multiple messages in an array
      if (Array.isArray(msgData)) {
        this.log(`Processing ${msgData.length} WebSocket messages`, 'debug');
        msgData.forEach(msg => this.processMessage(msg));
      } else {
        this.log(`Processing single WebSocket message`, 'debug');
        this.processMessage(msgData);
      }
    } catch (error) {
      this.log(`Error processing WebSocket message: ${error.message}`, 'error');
    }
  }
  
  processMessage(message) {
    try {
      const { channel, data, clientId, successful, error } = message;
      
      this.log(`Message on channel: ${channel}`, 'debug');
      
      // Handle handshake response
      if (channel === '/meta/handshake' && successful) {
        this.clientId = clientId;
        this.log(`Handshake successful: ClientId: ${this.clientId}`, 'info');
        this.subscribeToChannels();
      }
      
      // Handle subscription response
      if (channel === '/meta/subscribe' && successful) {
        this.log(`Successfully subscribed to ${message.subscription}`, 'info');
        
        // Register user after last subscription
        if (!this.userRegistered && message.subscription === '/service/controller') {
          this.registerUser();
        }
      }
      
      // Handle game messages
      if (channel === '/service/player') {
        this.log(`Game message: ${JSON.stringify(data)}`, 'debug');
        
        // Update state based on message type
        if (data && data.type === 'question') {
          this.currentQuestionIndex++;
          this.currentQuestion = data.question;
          this.log(`Question #${this.currentQuestionIndex}: ${data.question}`, 'info');
          
          // Можна додати автоматичне відповідання на питання тут
          setTimeout(() => this.answerQuestion(Math.floor(Math.random() * 4)), 
            1000 + Math.random() * 5000);
        }
      }
      
      // Handle errors
      if (error) {
        this.log(`Server error: ${error}`, 'error');
      }
    } catch (processError) {
      this.log(`Error processing message: ${processError.message}`, 'error');
    }
  }
  
  subscribeToChannels() {
    const channels = ['/service/player', '/service/status', '/service/controller'];
    
    this.log(`Subscribing to ${channels.length} channels`, 'info');
    
    channels.forEach(channel => {
      const subscribeMsg = {
        id: Date.now(),
        channel: '/meta/subscribe',
        subscription: channel,
        clientId: this.clientId
      };
      
      this.sendSocketMessage([subscribeMsg]);
      this.log(`Sent subscription for ${channel}`, 'debug');
    });
  }
  
  registerUser() {
    const registerMsg = {
      id: Date.now(),
      channel: '/service/controller',
      data: {
        type: 'login',
        name: this.name
      },
      clientId: this.clientId
    };
    
    this.log(`Sending registration with name ${this.name}`, 'info');
    this.sendSocketMessage([registerMsg]);
    this.userRegistered = true;
  }
  
  answerQuestion(answerIndex) {
    if (!this.connected || !this.clientId) {
      this.log(`Cannot answer question - not connected`, 'error');
      return false;
    }
    
    const answerMsg = {
      id: Date.now(),
      channel: '/service/controller',
      data: {
        type: 'answer',
        choice: answerIndex,
        meta: {
          lag: Math.floor(Math.random() * 30) + 10
        }
      },
      clientId: this.clientId
    };
    
    this.log(`Answering question with choice ${answerIndex}`, 'info');
    this.lastAnswer = answerIndex;
    return this.sendSocketMessage([answerMsg]);
  }
  
  async disconnect() {
    try {
      this.log(`Disconnecting bot ${this.id}`, 'info');
      
      // Якщо використовували Playwright
      if (this.browserPage) {
        try {
          this.log('Closing Playwright page', 'info');
          await this.browserPage.close();
          this.browserPage = null;
        } catch (browserError) {
          this.log(`Error closing browser page: ${browserError.message}`, 'error');
        }
      }
      
      // Якщо використовували WebSocket
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        // Відправляємо повідомлення про вихід
        const leaveMsg = {
          id: Date.now(),
          channel: '/service/controller',
          data: {
            type: 'leave'
          },
          clientId: this.clientId
        };
        
        this.log(`Sending leave message`, 'info');
        this.sendSocketMessage([leaveMsg]);
        
        // Закриваємо з'єднання
        this.log(`Closing socket`, 'info');
        this.socket.close();
      }
      
      this.connected = false;
      this.log(`Disconnection completed`, 'info');
      
      return true;
    } catch (error) {
      this.log(`Error disconnecting: ${error.message}`, 'error');
      return false;
    }
  }
}

module.exports = KahootBot;