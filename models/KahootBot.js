// models/KahootBot.js (спрощена версія)
const WebSocket = require('ws');
const proxyUtils = require('../utils/proxyUtils');
const KahootService = require('../services/KahootService');

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
    
    this.kahootService = new KahootService();
    
    this.log(`Bot initialized with name: ${this.name}, PIN: ${this.pin}`);
  }
  
  log(message, type = 'info') {
    if (this.logCallback) {
      this.logCallback(message, type);
    }
    console.log(`[Bot ${this.id}] [${type}] ${message}`);
  }
  
  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        // Додайте опцію для прямого з'єднання без проксі
        const useProxy = this.config && this.config.bypassProxy === true ? false : true;
  
        // Формуємо URL для WebSocket з'єднання
        // Додаємо випадковий параметр для обходу кешування
        const randomParam = Date.now() + Math.floor(Math.random() * 10000);
        let wsUrl = this.challengeToken
          ? `wss://kahoot.it/cometd/${this.pin}/${this.sessionToken}/${this.challengeToken}`
          : `wss://kahoot.it/cometd/${this.pin}/${this.sessionToken}`;
        
        wsUrl += `?_=${randomParam}`;
        
        console.log(`WS: Connecting to ${wsUrl} ${useProxy ? 'with proxy' : 'directly'}`);
        
        // Отримуємо проксі агент (якщо налаштований і не обходимо)
        const agent = useProxy ? proxyUtils.getProxyAgent() : null;
        this.log(`WS: Proxy agent: ${agent ? 'Yes' : 'No'}`);
        
        // Генеруємо випадковий User-Agent
        const userAgent = this.kahootService.getRandomUserAgent();
        
        // Налаштовуємо заголовки, які більш точно імітують браузер
        const headers = {
          'User-Agent': userAgent,
          'Origin': 'https://kahoot.it',
          'Referer': `https://kahoot.it/join?gameId=${this.pin}&source=web`,
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
          'Sec-Fetch-Dest': 'websocket',
          'Sec-Fetch-Mode': 'websocket',
          'Sec-Fetch-Site': 'same-origin',
          'Host': 'kahoot.it'
        };
        
        // Додаємо cookie до заголовків (з випадковими значеннями)
        const cookies = this.kahootService.generateKahootCookies();
        if (cookies && cookies.length > 0) {
          headers['Cookie'] = cookies.join('; ');
          console.log(`WS: Added ${cookies.length} cookies`);
        }
        
        // Конфігуруємо опції для WebSocket
        const options = {
          headers,
          agent,
          handshakeTimeout: 15000,   // Збільшуємо таймаут рукостискання
          perMessageDeflate: true    // Включаємо стиснення повідомлень
        };
        
        console.log(`WS: Using WebSocket with proxy: ${Boolean(agent)}`);
        
        // Додаємо випадкову затримку, щоб імітувати поведінку реального клієнта
        setTimeout(() => {
          try {
            // Створюємо WebSocket з'єднання
            this.socket = new WebSocket(wsUrl, options);
            
            // Налаштовуємо обробники подій для WebSocket
            this.socket.on('open', () => {
              console.log('WS: Connection established successfully');
              this.connected = true;
              
              // Імітуємо деяку затримку перед надсиланням handshake
              setTimeout(() => {
                this.sendHandshake();
                resolve(true);
              }, Math.floor(Math.random() * 300) + 100);
            });
            
            this.socket.on('message', (message) => {
              console.log(`WS: Received message of length ${message.length}`);
              this.handleSocketMessage(message);
            });
            
            this.socket.on('error', (error) => {
              console.error(`WS ERROR: ${error.message}`);
              this.connected = false;
              reject(error);
            });
            
            this.socket.on('close', (code, reason) => {
              console.log(`WS CLOSED: ${code} ${reason || 'No reason'}`);
              this.connected = false;
            });
            
            // Встановлюємо таймаут для з'єднання
            const connectionTimeout = setTimeout(() => {
              console.error(`WS TIMEOUT: Connection timeout`);
              if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
                this.socket.terminate();
                reject(new Error('Connection timeout'));
              }
            }, 15000);
            
            // Очищаємо таймаут при успішному з'єднанні
            this.socket.once('open', () => {
              clearTimeout(connectionTimeout);
            });
          } catch (wsError) {
            console.error(`WS CREATION ERROR: ${wsError.message}`);
            reject(wsError);
          }
        }, Math.floor(Math.random() * 500) + 100);
      } catch (error) {
        console.error(`WS SETUP ERROR: ${error.message}`);
        console.error(`WS SETUP STACK: ${error.stack}`);
        reject(error);
      }
    });
  }
  
/**
 * Встановлює з'єднання з грою Kahoot
 * @returns {Promise<boolean>} Результат підключення
 */
async connect() {
    try {
      console.log(`CONNECTING: Bot ${this.id} attempting to connect to PIN: ${this.pin}`);
      
      // Validate PIN format
      if (!this.pin || !/^\d{6,10}$/.test(this.pin)) {
        console.log(`INVALID PIN: ${this.pin} is not valid`);
        return false;
      }
      
      console.log("Getting session token...");
      // Get session token
      try {
        const sessionData = await this.kahootService.getSession(this.pin);
        console.log(`SESSION DATA: ${JSON.stringify(sessionData)}`);
        
        if (!sessionData || !sessionData.liveGameId) {
          console.log("SESSION ERROR: No liveGameId in session data");
          throw new Error('Failed to get game session token');
        }
        
        this.sessionToken = sessionData.liveGameId;
        console.log(`SESSION SUCCESS: Got token ${this.sessionToken.substring(0, 10)}...`);
        
        // If there's a challenge, solve it
        if (sessionData.challenge) {
          this.log('Challenge detected, solving...', 'info');
          console.log('CHALLENGE: Detected, attempting to solve');
          
          try {
            this.challengeToken = await this.kahootService.solveChallenge(sessionData.challenge);
            
            if (!this.challengeToken) {
              console.log('CHALLENGE ERROR: Failed to solve challenge');
              throw new Error('Failed to solve challenge token');
            }
            
            console.log(`CHALLENGE SUCCESS: Got token ${this.challengeToken.substring(0, 10)}...`);
          } catch (challengeError) {
            console.error(`CHALLENGE ERROR DETAILS: ${challengeError.message}`);
            throw challengeError;
          }
        }
        
        // Connect WebSocket
        console.log('Connecting WebSocket...');
        await this.connectWebSocket();
        
        return true;
      } catch (sessionError) {
        console.error(`SESSION ERROR DETAILS: ${sessionError.message}`);
        console.error(`SESSION ERROR STACK: ${sessionError.stack}`);
        throw sessionError;
      }
    } catch (error) {
      console.error(`CONNECT ERROR: ${error.message}`);
      console.error(`CONNECT STACK: ${error.stack}`);
      return false;
    }
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
      console.log(`HANDSHAKE: Added challenge token`);
    }
    
    console.log(`HANDSHAKE: Sending handshake message`);
    this.sendSocketMessage([handshakeMsg]);
  }
  
  sendSocketMessage(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error(`SOCKET ERROR: Cannot send message - WebSocket not open`);
      return false;
    }
    
    try {
      const msgStr = JSON.stringify(message);
      console.log(`SOCKET SEND: Sending message of length ${msgStr.length}`);
      this.socket.send(msgStr);
      return true;
    } catch (error) {
      console.error(`SOCKET SEND ERROR: ${error.message}`);
      return false;
    }
  }
  
  handleSocketMessage(message) {
    try {
      console.log(`SOCKET RECEIVE: Processing message`);
      
      let msgData;
      try {
        msgData = JSON.parse(message);
        console.log(`SOCKET RECEIVE: Parsed message successfully`);
      } catch (parseError) {
        console.error(`SOCKET PARSE ERROR: ${parseError.message}`);
        return;
      }
      
      // Handle multiple messages in an array
      if (Array.isArray(msgData)) {
        console.log(`SOCKET RECEIVE: Processing ${msgData.length} messages`);
        msgData.forEach(msg => this.processMessage(msg));
      } else {
        console.log(`SOCKET RECEIVE: Processing single message`);
        this.processMessage(msgData);
      }
    } catch (error) {
      console.error(`SOCKET PROCESSING ERROR: ${error.message}`);
    }
  }
  
  processMessage(message) {
    try {
      const { channel, data, clientId, successful, error } = message;
      
      console.log(`PROCESS: Message on channel: ${channel}`);
      
      // Handle handshake response
      if (channel === '/meta/handshake' && successful) {
        this.clientId = clientId;
        console.log(`HANDSHAKE SUCCESS: ClientId: ${this.clientId}`);
        this.subscribeToChannels();
      }
      
      // Handle subscription response
      if (channel === '/meta/subscribe' && successful) {
        console.log(`SUBSCRIBE SUCCESS: Subscribed to ${message.subscription}`);
        
        // Register user after last subscription
        if (!this.userRegistered && message.subscription === '/service/controller') {
          this.registerUser();
        }
      }
      
      // On the first stage, we just log game messages
      if (channel === '/service/player') {
        console.log(`GAME MESSAGE: ${JSON.stringify(data)}`);
        
        // Only update basic state
        if (data && data.type === 'question') {
          this.currentQuestionIndex++;
          this.currentQuestion = data.question;
          console.log(`QUESTION: #${this.currentQuestionIndex} - ${data.question}`);
        }
      }
      
      // Handle errors
      if (error) {
        console.error(`SERVER ERROR: ${error}`);
      }
    } catch (processError) {
      console.error(`PROCESS ERROR: ${processError.message}`);
    }
  }
  
  subscribeToChannels() {
    const channels = ['/service/player', '/service/status', '/service/controller'];
    
    console.log(`SUBSCRIBE: Subscribing to ${channels.length} channels`);
    
    channels.forEach(channel => {
      const subscribeMsg = {
        id: Date.now(),
        channel: '/meta/subscribe',
        subscription: channel,
        clientId: this.clientId
      };
      
      this.sendSocketMessage([subscribeMsg]);
      console.log(`SUBSCRIBE: Sent subscription for ${channel}`);
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
    
    console.log(`REGISTER: Sending registration with name ${this.name}`);
    this.sendSocketMessage([registerMsg]);
    this.userRegistered = true;
  }
  
  async disconnect() {
    try {
      console.log(`DISCONNECT: Disconnecting bot ${this.id}`);
      
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        // Send leave message
        const leaveMsg = {
          id: Date.now(),
          channel: '/service/controller',
          data: {
            type: 'leave'
          },
          clientId: this.clientId
        };
        
        console.log(`DISCONNECT: Sending leave message`);
        this.sendSocketMessage([leaveMsg]);
        
        // Close socket
        console.log(`DISCONNECT: Closing socket`);
        this.socket.close();
      }
      
      this.connected = false;
      console.log(`DISCONNECT: Completed`);
      
      return true;
    } catch (error) {
      console.error(`DISCONNECT ERROR: ${error.message}`);
      return false;
    }
  }
}

module.exports = KahootBot;