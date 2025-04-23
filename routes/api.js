// routes/api.js (оновлена версія з підтримкою Selenium)
const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');
const seleniumBotController = require('../controllers/seleniumBotController');
const proxyController = require('../controllers/proxyController');

// Маршрути для звичайних ботів
router.post('/start-bot', botController.startBot);
router.post('/stop-bot', botController.stopBot);
router.get('/bot-status/:id', botController.getBotStatus);
router.get('/bots', botController.getAllBots);

// Нові маршрути для Selenium-ботів
router.post('/selenium/start-bot', seleniumBotController.startSeleniumBot);
router.post('/selenium/stop-bot', seleniumBotController.stopSeleniumBot);
router.post('/selenium/answer', seleniumBotController.answerQuestion);
router.get('/selenium/bot-status/:id', seleniumBotController.getSeleniumBotStatus);
router.get('/selenium/bots', seleniumBotController.getAllSeleniumBots);

// Маршрути для налаштування проксі
router.post('/set-proxy', proxyController.setProxy);
router.get('/test-proxy', proxyController.testProxy);
router.get('/proxy-status', proxyController.getProxyStatus);

// Тестові маршрути
router.get('/test-kahoot/:pin', botController.testKahoot);

module.exports = router;