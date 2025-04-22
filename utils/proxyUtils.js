// utils/proxyUtils.js (спрощена версія)
const { HttpsProxyAgent } = require('https-proxy-agent');

// Default proxy configuration
let proxyConfig = {
  host: process.env.PROXY_HOST || '',
  port: process.env.PROXY_PORT || '',
  username: process.env.PROXY_USERNAME || '',
  password: process.env.PROXY_PASSWORD || ''
};

// HTTPS Agent cache
let proxyAgent = null;

// Set proxy configuration
function setProxyConfig(config) {
  proxyConfig = {
    host: config.host || '',
    port: config.port || '',
    username: config.username || '',
    password: config.password || ''
  };
  
  // Reset agent
  proxyAgent = null;
  
  console.log(`Proxy configuration updated: ${proxyConfig.host}:${proxyConfig.port}`);
  
  return proxyConfig;
}

// Get current proxy configuration
function getProxyConfig() {
  return { ...proxyConfig };
}

// Create HTTPS Agent with proxy
function getProxyAgent() {
    console.log(`ProxyUtils: Getting proxy agent for ${proxyConfig.host}:${proxyConfig.port}`);
    
    // Тимчасово відключаємо проксі для тестування
    // console.log("PROXY: Temporarily disabled for testing");
    // return null;
    
    if (!proxyConfig.host || !proxyConfig.port) {
      console.log('ProxyUtils: No proxy configured, returning null agent');
      return null;
    }
    
    if (proxyAgent) {
      console.log('ProxyUtils: Returning cached proxy agent');
      return proxyAgent;
    }
    
    try {
      const proxyUrl = proxyConfig.username && proxyConfig.password
        ? `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`
        : `http://${proxyConfig.host}:${proxyConfig.port}`;
      
      console.log(`ProxyUtils: Creating new proxy agent with URL: ${proxyUrl}`);
      
      proxyAgent = new HttpsProxyAgent(proxyUrl);
      console.log('ProxyUtils: Proxy agent created successfully');
      
      return proxyAgent;
    } catch (error) {
      console.error(`ProxyUtils: Error creating proxy agent: ${error.message}`);
      return null;
    }
  }
 
  // Test if proxy is working
  async function testProxy() {
    return new Promise((resolve) => {
      try {
        if (!proxyConfig.host || !proxyConfig.port) {
          console.log('ProxyUtils: No proxy configured for testing');
          resolve({
            success: false,
            message: 'Proxy not configured'
          });
          return;
        }
        
        console.log(`ProxyUtils: Testing proxy: ${proxyConfig.host}:${proxyConfig.port}`);
        
        // Create agent
        const agent = getProxyAgent();
        
        if (!agent) {
          console.log('ProxyUtils: Failed to create proxy agent for testing');
          resolve({
            success: false,
            message: 'Failed to create proxy agent'
          });
          return;
        }
        
        // Test URL
        const testUrl = 'https://kahoot.it/';
        
        // Request options
        const options = {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml'
          },
          agent: agent,
          timeout: 10000
        };
        
        console.log(`ProxyUtils: Sending test request to ${testUrl}`);
        
        const https = require('https');
        const req = https.request(testUrl, options, (res) => {
          console.log(`ProxyUtils: Proxy test result: Status ${res.statusCode}`);
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              success: true,
              message: 'Proxy connection successful',
              details: {
                statusCode: res.statusCode,
                headers: res.headers
              }
            });
          } else {
            resolve({
              success: false,
              message: `Proxy returned status code ${res.statusCode}`,
              details: {
                statusCode: res.statusCode
              }
            });
          }
        });
        
        req.on('error', (error) => {
          console.error(`ProxyUtils: Proxy test error: ${error.message}`);
          resolve({
            success: false,
            message: `Proxy connection error: ${error.message}`
          });
        });
        
        req.on('timeout', () => {
          req.destroy();
          console.error('ProxyUtils: Proxy test timeout');
          resolve({
            success: false,
            message: 'Proxy connection timeout'
          });
        });
        
        req.end();
        console.log('ProxyUtils: Test request sent');
      } catch (error) {
        console.error(`ProxyUtils: Error testing proxy: ${error.message}`);
        resolve({
          success: false,
          message: `Error testing proxy: ${error.message}`
        });
      }
    });
  }
 
  module.exports = {
    setProxyConfig,
    getProxyConfig,
    getProxyAgent,
    testProxy
  };