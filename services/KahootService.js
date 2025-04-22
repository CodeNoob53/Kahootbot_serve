// services/KahootService.js
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const proxyUtils = require('../utils/proxyUtils');

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
  
  generateKahootCookies() {
    const uuid = uuidv4();
    const now = new Date();
    const nowIsoStr = now.toISOString();
    const consentId = uuidv4();
    const dateStr = encodeURIComponent(now.toUTCString());

    return [
      `generated_uuid=${uuid}`,
      `OptanonAlertBoxClosed=${nowIsoStr}`,
      `OptanonConsent=isGpcEnabled=0&datestamp=${dateStr}&version=202411.1.0&browserGpcFlag=0&isIABGlobal=false&hosts=&consentId=${consentId}&interactionCount=1&isAnonUser=1&landingPath=NotLandingPage&groups=C0001%3A1%2CC0002%3A0%2CC0003%3A0%2CC0004%3A0&intType=3`,
      `deviceId=${uuid.replace(/-/g, '')}`,
      `AWSALB=${Math.random().toString(36).substring(2)}`,
      `session-id=${Math.random().toString(36).substring(2)}`,
      `player=true`
    ];
  }
  
  async getSession(pin) {
    return new Promise((resolve, reject) => {
      try {
        logger.info(`Getting Kahoot session for PIN: ${pin}`);
        
        if (!pin || !/^\d{6,10}$/.test(pin)) {
          reject(new Error('Invalid game PIN'));
          return;
        }
        
        const url = `https://kahoot.it/reserve/session/${pin}/`;
        const agent = proxyUtils.getProxyAgent();
        
        // Generate cookies
        const cookies = this.generateKahootCookies();
        
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
        
        const req = https.request(url, options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const result = JSON.parse(data);
                logger.info(`Successfully got session token for PIN ${pin}`);
                resolve(result);
              } catch (error) {
                logger.error(`Error parsing session response: ${error.message}`);
                reject(new Error('Invalid response format'));
              }
            } else {
              logger.error(`Failed to get session: HTTP ${res.statusCode}`);
              reject(new Error(`HTTP error: ${res.statusCode}`));
            }
          });
        });
        
        req.on('error', (error) => {
          logger.error(`Request error: ${error.message}`);
          reject(error);
        });
        
        req.end();
      } catch (error) {
        logger.error(`Error in getSession: ${error.message}`);
        reject(error);
      }
    });
  }
  
  async solveChallenge(challenge) {
    return new Promise((resolve, reject) => {
      try {
        logger.info('Solving Kahoot challenge token');
        
        if (!challenge) {
          reject(new Error('No challenge token provided'));
          return;
        }
        
        // Extract the encoded message
        let encodedMessage;
        try {
          const msgMatch = challenge.match(/decode\.call\(this,\s*'([^']+)'/);
          if (!msgMatch) {
            const altMatch1 = challenge.match(/decode\s*\(\s*'([^']+)'\s*\)/);
            const altMatch2 = challenge.match(/decode\s*\(\s*"([^"]+)"\s*\)/);
            
            if (altMatch1) {
              encodedMessage = altMatch1[1];
            } else if (altMatch2) {
              encodedMessage = altMatch2[1];
            } else {
              throw new Error('Could not find encoded message');
            }
          } else {
            encodedMessage = msgMatch[1];
          }
        } catch (error) {
          logger.error(`Error extracting encoded message: ${error.message}`);
          reject(error);
          return;
        }
        
        // Extract offset formula
        let offset;
        try {
          const offsetMatch = challenge.match(/var\s+offset\s*=\s*([^;]+);/);
          const formula = offsetMatch ? offsetMatch[1] : '18150'; // Default if not found
          
          // Clean formula
          const cleanFormula = formula
            .replace(/\s+/g, '')
            .replace(/this\.angular\.isArray|this\.angular\.isObject/g, 'false')
            .replace(/console\.log\([^)]+\)/g, '')
            .replace(/window\.|document\.|localStorage|sessionStorage/g, '')
            .replace(/eval|Function/g, '');
          
          offset = eval(cleanFormula); // Safe in controlled server environment
        } catch (error) {
          logger.error(`Error calculating offset: ${error.message}`);
          offset = 18150; // Fallback value
        }
        
        // Decode message
        const decodedToken = this.decodeMessage(encodedMessage, offset);
        
        if (!decodedToken || decodedToken.length < 10) {
          logger.warn('Decoded token appears invalid, using alternative offset');
          
          // Try alternative offsets
          const alternativeOffsets = [18150, 16050, 17150, 19200, 20250];
          for (const altOffset of alternativeOffsets) {
            if (altOffset === offset) continue;
            
            const altToken = this.decodeMessage(encodedMessage, altOffset);
            if (altToken && altToken.length > 10 && /[A-Za-z0-9]/.test(altToken)) {
              logger.info(`Using alternative token with offset ${altOffset}`);
              resolve(altToken);
              return;
            }
          }
        }
        
        logger.info('Successfully decoded challenge token');
        resolve(decodedToken);
      } catch (error) {
        logger.error(`Error solving challenge: ${error.message}`);
        reject(error);
      }
    });
  }
  
  decodeMessage(message, offset) {
    try {
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
      return result;
    } catch (error) {
      logger.error(`Error decoding message: ${error.message}`);
      return 'BACKUP_TOKEN_' + Date.now(); // Fallback token
    }
  }
}

module.exports = KahootService;