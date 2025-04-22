// routes/api.js (оновлення для додавання тестового ендпоінту)
const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');
const proxyController = require('../controllers/proxyController');

// Bot routes
router.post('/start-bot', botController.startBot);
router.post('/stop-bot', botController.stopBot);
router.get('/bot-status/:id', botController.getBotStatus);
router.get('/bots', botController.getAllBots);

// Proxy routes
router.post('/set-proxy', proxyController.setProxy);
router.get('/test-proxy', proxyController.testProxy);
router.get('/proxy-status', proxyController.getProxyStatus);

// Test routes
router.get('/test-kahoot/:pin', botController.testKahoot);

module.exports = router;