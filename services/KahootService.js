// services/KahootService.js (спрощена версія)
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const proxyUtils = require('../utils/proxyUtils');
const cookiesTemplate = require('../utils/cookiesTemplate');

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
    return cookiesTemplate;
  }
  
  async getSession(pin) {
    return new Promise((resolve, reject) => {
      try {
        console.log(`KahootService: Getting session for PIN: ${pin}`);
        
        if (!pin || !/^\d{6,10}$/.test(pin)) {
          console.log(`KahootService: Invalid game PIN: ${pin}`);
          reject(new Error('Invalid game PIN'));
          return;
        }
        
        const url = `https://kahoot.it/reserve/session/${pin}/`;
        console.log(`KahootService: Request URL: ${url}`);
        
        const agent = proxyUtils.getProxyAgent();
        console.log(`KahootService: Proxy agent created: ${agent ? 'Yes' : 'No'}`);
        
        // Generate cookies
        const cookies = this.generateKahootCookies();
        console.log(`KahootService: Generated ${cookies.length} cookies`);
        
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
        
        console.log(`KahootService: Request options: ${JSON.stringify(options, null, 2)}`);
        
        const req = https.request(url, options, (res) => {
          console.log(`KahootService: Response status: ${res.statusCode}`);
          console.log(`KahootService: Response headers: ${JSON.stringify(res.headers)}`);
          
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            console.log(`KahootService: Response data length: ${data.length}`);
          
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                // Витягуємо лише частину, яка є валідним JSON
                const jsonStart = data.indexOf('{');
                const jsonEnd = data.lastIndexOf('}') + 1;
                const jsonOnly = data.slice(jsonStart, jsonEnd);
          
                const result = JSON.parse(jsonOnly);
                console.log(`KahootService: Parsed response: ${JSON.stringify(result)}`);
                resolve(result);
              } catch (error) {
                console.error(`KahootService: Error parsing response: ${error.message}`);
                console.error(`KahootService: Raw JSON candidate: ${data}`);
                reject(new Error('Invalid response format'));
              }
            } else {
              console.error(`KahootService: HTTP error: ${res.statusCode}`);
              console.error(`KahootService: Response data: ${data}`);
              reject(new Error(`HTTP error: ${res.statusCode}`));
            }
          });          
        });
        
        req.on('error', (error) => {
          console.error(`KahootService: Request error: ${error.message}`);
          reject(error);
        });
        
        // Додайте таймаут для запиту
        req.setTimeout(15000, () => {
          console.error(`KahootService: Request timeout`);
          req.destroy(new Error('Request timeout'));
        });
        
        req.end();
        console.log(`KahootService: Request sent`);
      } catch (error) {
        console.error(`KahootService: General error: ${error.message}`);
        console.error(`KahootService: Stack: ${error.stack}`);
        reject(error);
      }
    });
  }
  
  async solveChallenge(challenge) {
    return new Promise((resolve, reject) => {
      try {
        console.log('KahootService: Solving challenge token');
        
        if (!challenge) {
          console.log('KahootService: No challenge provided');
          reject(new Error('No challenge token provided'));
          return;
        }
        
        console.log(`KahootService: Challenge length: ${challenge.length}`);
        
        // Extract the encoded message
        let encodedMessage;
        try {
          const msgMatch = challenge.match(/decode\.call\(this,\s*'([^']+)'/);
          if (!msgMatch) {
            console.log('KahootService: Using alternative regex for encoded message');
            const altMatch1 = challenge.match(/decode\s*\(\s*'([^']+)'\s*\)/);
            const altMatch2 = challenge.match(/decode\s*\(\s*"([^"]+)"\s*\)/);
            
            if (altMatch1) {
              encodedMessage = altMatch1[1];
              console.log(`KahootService: Found encoded message (alt1) of length ${encodedMessage.length}`);
            } else if (altMatch2) {
              encodedMessage = altMatch2[1];
              console.log(`KahootService: Found encoded message (alt2) of length ${encodedMessage.length}`);
            } else {
              console.error('KahootService: Could not find encoded message');
              throw new Error('Could not find encoded message');
            }
          } else {
            encodedMessage = msgMatch[1];
            console.log(`KahootService: Found encoded message of length ${encodedMessage.length}`);
          }
        } catch (error) {
          console.error(`KahootService: Error extracting encoded message: ${error.message}`);
          reject(error);
          return;
        }
        
        // Extract offset formula
        let offset;
        try {
          const offsetMatch = challenge.match(/var\s+offset\s*=\s*([^;]+);/);
          const formula = offsetMatch ? offsetMatch[1] : '18150'; // Default if not found
          
          console.log(`KahootService: Offset formula: ${formula}`);
          
          // Clean formula
          const cleanFormula = formula
            .replace(/\s+/g, '')
            .replace(/this\.angular\.isArray|this\.angular\.isObject/g, 'false')
            .replace(/console\.log\([^)]+\)/g, '')
            .replace(/window\.|document\.|localStorage|sessionStorage/g, '')
            .replace(/eval|Function/g, '');
          
          console.log(`KahootService: Cleaned formula: ${cleanFormula}`);
          
          offset = eval(cleanFormula); // Safe in controlled server environment
          console.log(`KahootService: Calculated offset: ${offset}`);
        } catch (error) {
          console.error(`KahootService: Error calculating offset: ${error.message}`);
          offset = 18150; // Fallback value
          console.log(`KahootService: Using fallback offset: ${offset}`);
        }
        
        // Decode message
        const decodedToken = this.decodeMessage(encodedMessage, offset);
        console.log(`KahootService: Decoded token length: ${decodedToken.length}`);
        
        if (!decodedToken || decodedToken.length < 10) {
          console.log('KahootService: Decoded token appears invalid, trying alternatives');
          
          // Try alternative offsets
          const alternativeOffsets = [18150, 16050, 17150, 19200, 20250];
          for (const altOffset of alternativeOffsets) {
            if (altOffset === offset) continue;
            
            console.log(`KahootService: Trying alternative offset: ${altOffset}`);
            const altToken = this.decodeMessage(encodedMessage, altOffset);
            
            if (altToken && altToken.length > 10 && /[A-Za-z0-9]/.test(altToken)) {
              console.log(`KahootService: Using alternative token with offset ${altOffset}, length ${altToken.length}`);
              resolve(altToken);
              return;
            }
          }
        }
        
        console.log('KahootService: Successfully decoded challenge token');
        resolve(decodedToken);
      } catch (error) {
        console.error(`KahootService: Error solving challenge: ${error.message}`);
        reject(error);
      }
    });
  }
  
  decodeMessage(message, offset) {
    try {
      console.log(`KahootService: Decoding message of length ${message.length} with offset ${offset}`);
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
      
      console.log(`KahootService: Decoded result length: ${result.length}`);
      return result;
    } catch (error) {
      console.error(`KahootService: Error decoding message: ${error.message}`);
      return 'BACKUP_TOKEN_' + Date.now(); // Fallback token
    }
  }
}

module.exports = KahootService;