// models/KahootBot.js (спрощена версія для першого етапу)
const WebSocket = require('ws');
const logger = require('../utils/logger');
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
    this.logCallback = config.onLog || logger.info;
    
    this.kahootService = new KahootService();
    
    this.log(`Bot initialized with name: ${this.name}, PIN: ${this.pin}`);
  }
  
  log(message, type = 'info') {
    if (this.logCallback) {
      this.logCallback(`[Bot ${this.id}] ${message}`, type);
    }
    logger[type](`[Bot ${this.id}] ${message}`);
  }
  
  async connect() {
    try {
      this.log('Connecting to Kahoot game...');
      
      // Validate PIN format
      if (!this.pin || !/^\d{6,10}$/.test(this.pin)) {
        this.log('Invalid PIN format', 'error');
        return false;
      }
      
      // Get session token
      const sessionData = await this.kahootService.getSession(this.pin);
      
      if (!sessionData || !sessionData.liveGameId) {
        throw new Error('Failed to get game session token');
      }
      
      this.sessionToken = sessionData.liveGameId;
      this.log(`Got session token: ${this.sessionToken.substring(0, 10)}...`);
      
      // If there's a challenge, solve it
      if (sessionData.challenge) {
        this.log('Challenge detected, solving...');
        this.challengeToken = await this.kahootService.solveChallenge(sessionData.challenge);
        
        if (!this.challengeToken) {
          throw new Error('Failed to solve challenge token');
        }
        
        this.log(`Got challenge token: ${this.challengeToken.substring(0, 10)}...`);
      }
      
      // Connect WebSocket
      await this.connectWebSocket();
      
      return true;
    } catch (error) {
      this.log(`Connection error: ${error.message}`, 'error');
      return false;
    }
  }
  
  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.challengeToken
          ? `wss://kahoot.it/cometd/${this.pin}/${this.sessionToken}/${this.challengeToken}`
          : `wss://kahoot.it/cometd/${this.pin}/${this.sessionToken}`;
        
        // Get agent for proxy if configured
        const agent = proxyUtils.getProxyAgent();
        const headers = {
          'User-Agent': this.kahootService.getRandomUserAgent(),
          'Origin': 'https://kahoot.it',
          'Referer': `https://kahoot.it/join?gameId=${this.pin}`
        };
        
        // Add cookies to headers
        const cookies = this.kahootService.generateKahootCookies();
        if (cookies && cookies.length > 0) {
          headers['Cookie'] = cookies.join('; ');
        }
        
        const options = {
          headers,
          agent
        };
        
        this.log(`Connecting WebSocket to: ${wsUrl}`);
        this.socket = new WebSocket(wsUrl, options);
        
        // Setup event handlers
        this.socket.on('open', () => {
          this.log('WebSocket connection established');
          this.connected = true;
          this.sendHandshake();
          resolve(true);
        });
        
        this.socket.on('message', (message) => {
          this.handleSocketMessage(message);
        });
        
        this.socket.on('error', (error) => {
          this.log(`WebSocket error: ${error.message}`, 'error');
          this.connected = false;
          reject(error);
        });
        
        this.socket.on('close', (code, reason) => {
          this.log(`WebSocket closed: ${code} ${reason || 'No reason'}`, 'warn');
          this.connected = false;
        });
        
        // Set timeout for connection
        const connectionTimeout = setTimeout(() => {
          this.log('Connection timeout', 'error');
          if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
            this.socket.terminate();
            reject(new Error('Connection timeout'));
          }
        }, 10000);
        
        // Clear timeout when connected
        this.socket.once('open', () => {
          clearTimeout(connectionTimeout);
        });
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
    }
    
    this.sendSocketMessage([handshakeMsg]);
    this.log('Handshake sent');
  }
  
  sendSocketMessage(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.log('Cannot send message: WebSocket not open', 'error');
      return false;
    }
    
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      this.log(`Error sending message: ${error.message}`, 'error');
      return false;
    }
  }
  
  handleSocketMessage(message) {
    try {
      const msgData = JSON.parse(message);
      
      // Handle multiple messages in an array
      if (Array.isArray(msgData)) {
        msgData.forEach(msg => this.processMessage(msg));
      } else {
        this.processMessage(msgData);
      }
    } catch (error) {
      this.log(`Error processing message: ${error.message}`, 'error');
    }
  }
  
  processMessage(message) {
    const { channel, data, clientId, successful, error } = message;
    
    // Handle handshake response
    if (channel === '/meta/handshake' && successful) {
      this.clientId = clientId;
      this.log(`Handshake successful. ClientId: ${this.clientId}`);
      this.subscribeToChannels();
    }
    
    // Handle subscription response
    if (channel === '/meta/subscribe' && successful) {
      this.log('Successfully subscribed to channel');
      
      // Register user after subscription
      if (!this.userRegistered) {
        this.registerUser();
      }
    }
    
    // On the first stage, we just log game messages
    if (channel === '/service/player') {
      this.log(`Game message received: ${JSON.stringify(data)}`);
      
      // Only update basic state
      if (data && data.type === 'question') {
        this.currentQuestionIndex++;
        this.currentQuestion = data.question;
        this.log(`Question received (not answering): ${data.question}`);
      }
    }
    
    // Handle errors
    if (error) {
      this.log(`Server error: ${error}`, 'error');
    }
  }
  
  subscribeToChannels() {
    const channels = ['/service/player', '/service/status', '/service/controller'];
    
    channels.forEach(channel => {
      const subscribeMsg = {
        id: Date.now(),
        channel: '/meta/subscribe',
        subscription: channel,
        clientId: this.clientId
      };
      
      this.sendSocketMessage([subscribeMsg]);
      this.log(`Subscribing to channel: ${channel}`);
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
    
    this.sendSocketMessage([registerMsg]);
    this.log(`Registering with name: ${this.name}`);
    this.userRegistered = true;
  }
  
  async disconnect() {
    try {
      this.log('Disconnecting...');
      
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
        
        this.sendSocketMessage([leaveMsg]);
        
        // Close socket
        this.socket.close();
      }
      
      this.connected = false;
      this.log('Disconnected successfully');
      
      return true;
    } catch (error) {
      this.log(`Error disconnecting: ${error.message}`, 'error');
      return false;
    }
  }
}

module.exports = KahootBot;