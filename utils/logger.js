// utils/logger.js
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Current log file path
const logFile = path.join(logsDir, `server-${new Date().toISOString().split('T')[0]}.log`);

// Format timestamp
function getTimestamp() {
  return new Date().toISOString();
}

// Format log message
function formatMessage(level, message) {
  return `[${getTimestamp()}] [${level.toUpperCase()}] ${message}`;
}

// Write to log file
function writeToFile(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Log levels
const logger = {
  info: (message) => {
    const formattedMessage = formatMessage('INFO', message);
    console.log('\x1b[36m%s\x1b[0m', formattedMessage); // Cyan
    writeToFile(formattedMessage);
  },
  
  warn: (message) => {
    const formattedMessage = formatMessage('WARN', message);
    console.log('\x1b[33m%s\x1b[0m', formattedMessage); // Yellow
    writeToFile(formattedMessage);
  },
  
  error: (message) => {
    const formattedMessage = formatMessage('ERROR', message);
    console.error('\x1b[31m%s\x1b[0m', formattedMessage); // Red
    writeToFile(formattedMessage);
  },
  
  debug: (message) => {
    if (process.env.NODE_ENV === 'development') {
      const formattedMessage = formatMessage('DEBUG', message);
      console.log('\x1b[90m%s\x1b[0m', formattedMessage); // Gray
      writeToFile(formattedMessage);
    }
  }
};

module.exports = logger;