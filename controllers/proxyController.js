// controllers/proxyController.js
const logger = require('../utils/logger');
const proxyUtils = require('../utils/proxyUtils');

// Set proxy configuration
exports.setProxy = (req, res) => {
  try {
    const { host, port, username, password } = req.body;
    
    if (!host || !port) {
      return res.status(400).json({
        success: false,
        message: 'Host and port are required'
      });
    }
    
    proxyUtils.setProxyConfig({
      host,
      port,
      username,
      password
    });
    
    logger.info(`Proxy configuration updated: ${host}:${port}`);
    
    return res.json({
      success: true,
      message: 'Proxy configuration updated successfully',
      config: {
        host,
        port,
        hasAuth: Boolean(username && password)
      }
    });
  } catch (error) {
    logger.error(`Error setting proxy: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Test proxy connection
exports.testProxy = async (req, res) => {
  try {
    const testResult = await proxyUtils.testProxy();
    
    if (testResult.success) {
      return res.json({
        success: true,
        message: 'Proxy connection successful',
        details: testResult.details
      });
    } else {
      return res.status(400).json({
        success: false,
        message: testResult.message
      });
    }
  } catch (error) {
    logger.error(`Error testing proxy: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get current proxy status
exports.getProxyStatus = (req, res) => {
  try {
    const config = proxyUtils.getProxyConfig();
    
    return res.json({
      success: true,
      configured: Boolean(config.host && config.port),
      config: {
        host: config.host,
        port: config.port,
        hasAuth: Boolean(config.username && config.password)
      }
    });
  } catch (error) {
    logger.error(`Error getting proxy status: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};