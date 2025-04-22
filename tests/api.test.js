// tests/api.test.js
const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const request = require('supertest');
const express = require('express');
const proxyController = require('../controllers/proxyController');
const botController = require('../controllers/botController');

// Створюємо тестовий Express додаток
const app = express();
app.use(express.json());

// Налаштовуємо тестові маршрути
app.post('/api/start-bot', botController.startBot);
app.post('/api/stop-bot', botController.stopBot);
app.get('/api/bot-status/:id', botController.getBotStatus);
app.get('/api/bots', botController.getAllBots);
app.post('/api/set-proxy', proxyController.setProxy);
app.get('/api/test-proxy', proxyController.testProxy);
app.get('/api/proxy-status', proxyController.getProxyStatus);

describe('API Routes', () => {
  describe('Proxy API', () => {
    it('should set proxy configuration', async () => {
      const res = await request(app)
        .post('/api/set-proxy')
        .send({
          host: '127.0.0.1',
          port: '8080',
          username: 'testuser',
          password: 'testpass'
        });
      
      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.config.host).to.equal('127.0.0.1');
      expect(res.body.config.port).to.equal('8080');
      expect(res.body.config.hasAuth).to.be.true;
    });
    
    it('should reject invalid proxy configuration', async () => {
      const res = await request(app)
        .post('/api/set-proxy')
        .send({
          host: '',
          port: '8080'
        });
      
      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
    });
    
    it('should get proxy status', async () => {
      const res = await request(app).get('/api/proxy-status');
      
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('success');
      expect(res.body).to.have.property('configured');
      expect(res.body).to.have.property('config');
    });
  });
  
  describe('Bot API', () => {
    let botId;
    
    // Перехоплюємо реальний метод підключення для тестів
    before(() => {
      // Заміна реального методу на мок
      const KahootBot = require('../models/KahootBot');
      const originalConnect = KahootBot.prototype.connect;
      
      KahootBot.prototype.connect = async function() {
        this.connected = true;
        return true;
      };
      
      // Збереження оригінального методу для відновлення
      KahootBot.prototype._originalConnect = originalConnect;
    });
    
    after(() => {
      // Відновлення оригінального методу
      const KahootBot = require('../models/KahootBot');
      if (KahootBot.prototype._originalConnect) {
        KahootBot.prototype.connect = KahootBot.prototype._originalConnect;
        delete KahootBot.prototype._originalConnect;
      }
    });
    
    it('should start a bot', async () => {
      const res = await request(app)
        .post('/api/start-bot')
        .send({
          name: 'APITestBot',
          pin: '12345678',
          useML: false,
          useSearch: false
        });
      
      expect(res.status).to.equal(201);
      expect(res.body.success).to.be.true;
      expect(res.body).to.have.property('botId');
      
      botId = res.body.botId;
    });
    
    it('should get bot status', async () => {
      if (!botId) {
        this.skip();
      }
      
      const res = await request(app).get(`/api/bot-status/${botId}`);
      
      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.status.id).to.equal(botId);
      expect(res.body.status.name).to.equal('APITestBot');
    });
    
    it('should get all bots', async () => {
      const res = await request(app).get('/api/bots');
      
      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body).to.have.property('bots');
      expect(res.body.bots).to.be.an('array');
    });
    
    it('should stop a bot', async () => {
      if (!botId) {
        this.skip();
      }
      
      const res = await request(app)
        .post('/api/stop-bot')
        .send({
          botId: botId
        });
      
      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
    });
  });
});