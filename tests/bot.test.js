// tests/bot.test.js
const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const KahootBot = require('../models/KahootBot');
const BotManager = require('../models/BotManager');

describe('KahootBot', function() {
  this.timeout(15000); // Збільшуємо таймаут для тестів з мережевими запитами
  
  let bot;
  
  before(() => {
    // Підготовка перед тестами
  });
  
  after(() => {
    // Очищення після тестів
    if (bot && bot.connected) {
      bot.disconnect();
    }
  });
  
  it('should initialize correctly', () => {
    bot = new KahootBot({
      id: 'test-bot-1',
      name: 'TestBot',
      pin: '12345678', // Використовуємо неіснуючий PIN для тесту ініціалізації
      onLog: () => {}
    });
    
    expect(bot).to.be.an('object');
    expect(bot.name).to.equal('TestBot');
    expect(bot.pin).to.equal('12345678');
    expect(bot.connected).to.be.false;
  });
  
  it('should validate PIN format', async () => {
    // Створюємо бота з неправильним форматом PIN
    const invalidBot = new KahootBot({
      id: 'test-bot-invalid',
      name: 'InvalidBot',
      pin: 'abc', // Неправильний формат
      onLog: () => {}
    });
    
    const connectionResult = await invalidBot.connect();
    expect(connectionResult).to.be.false;
  });
  
  // Тест з'єднання вимкнено для CI/CD, оскільки потрібен реальний PIN
  it.skip('should connect to game session', async () => {
    // Для цього тесту потрібен реальний PIN активної гри
    const realPin = process.env.TEST_KAHOOT_PIN || '12345678';
    
    const connectBot = new KahootBot({
      id: 'test-bot-2',
      name: 'ConnectBot',
      pin: realPin,
      onLog: () => {}
    });
    
    // Мокуємо функцію connectViaPlaywright для тесту
    connectBot.connectViaPlaywright = async function() {
      this.connected = true;
      this.browserPage = {};
      return true;
    };
    
    const connected = await connectBot.connect();
    expect(connected).to.be.true;
    expect(connectBot.connected).to.be.true;
    
    // Відключаємося
    await connectBot.disconnect();
    expect(connectBot.connected).to.be.false;
  });
});

describe('BotManager', function() {
  this.timeout(15000);
  
  it('should be a singleton', () => {
    const instance1 = BotManager.getInstance();
    const instance2 = BotManager.getInstance();
    
    expect(instance1).to.equal(instance2);
  });
  
  it('should start and stop bots', async () => {
    const botManager = BotManager.getInstance();
    
    // Очищаємо попередніх ботів
    botManager.bots.clear();
    
    // Створюємо конфігурацію бота
    const botConfig = {
      id: 'test-manager-bot',
      name: 'ManagedBot',
      pin: '12345678', // Неіснуючий PIN для тесту
      onLog: () => {}
    };
    
    // Тестуємо мок без реального підключення
    const originalConnect = KahootBot.prototype.connect;
    KahootBot.prototype.connect = async function() {
      this.connected = true;
      return true;
    };
    
    // Запускаємо бота
    const startResult = await botManager.startBot(botConfig);
    expect(startResult.success).to.be.true;
    expect(botManager.bots.has('test-manager-bot')).to.be.true;
    
    // Отримуємо статус
    const status = botManager.getBotStatus('test-manager-bot');
    expect(status).to.be.an('object');
    expect(status.id).to.equal('test-manager-bot');
    expect(status.connected).to.be.true;
    
    // Зупиняємо бота
    const stopResult = await botManager.stopBot('test-manager-bot');
    expect(stopResult.success).to.be.true;
    expect(botManager.bots.has('test-manager-bot')).to.be.false;
    
    // Відновлюємо оригінальний метод
    KahootBot.prototype.connect = originalConnect;
  });
});