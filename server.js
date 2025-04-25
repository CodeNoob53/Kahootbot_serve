// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const apiRoutes = require('./routes/api');
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});


app.get('/api/v1/users/search', (req, res) => {
  logger.warn(`[СПІЙМАНО] Незареєстрований запит на /api/v1/users/search`);
  logger.warn(`IP: ${req.ip}`);
  logger.warn(`User-Agent: ${req.get('User-Agent')}`);
  logger.warn(`Headers: ${JSON.stringify(req.headers)}`);
  logger.warn(`Query: ${JSON.stringify(req.query)}`);
  res.status(404).json({ error: 'Маршрут не підтримується' });
});


// Routes
app.use('/api', apiRoutes);

// Basic route
app.get('/', (req, res) => {
  res.json({
    status: 'Сервер працює',
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error(`Помилка: ${err.message}`);
  res.status(500).json({
    error: 'Внутрішня помилка сервера',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Щось пішло не так'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Сервер запущено на порту ${PORT}`);
});