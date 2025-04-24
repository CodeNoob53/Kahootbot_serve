// models/KahootBot.js
const logger = require('../utils/logger');
const BrowserService = require('../services/BrowserService');

class KahootBot {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.pin = config.pin;
    this.connected = false;
    this.clientId = null;
    this.currentQuestion = null;
    this.currentQuestionIndex = 0;
    this.lastAnswer = null;
    this.logCallback = config.onLog || console.log;
    this.browserPage = null;
    this._watchdogInterval = null;

    this.log(`Бот ініціалізовано з ім'ям: ${this.name}, PIN: ${this.pin}`);
  }

  log(message, type = 'info') {
    if (this.logCallback) {
      this.logCallback(message, type);
    }
    logger.info(`[Bot ${this.id}] [${type}] ${message}`);
  }

  async connect() {
    try {
      this.log(`Спроба з'єднання з PIN: ${this.pin}`, 'info');
      if (!this.pin || !/^[0-9]{6,10}$/.test(this.pin)) {
        this.log(`Недійсний PIN: ${this.pin}`, 'error');
        return false;
      }
      const result = await this.connectViaPlaywright();
      return result;
    } catch (error) {
      this.log(`Помилка з'єднання: ${error.message}`, 'error');
      return false;
    }
  }

  async connectViaPlaywright() {
    try {
      this.log('З\'єднання через Playwright...', 'info');
  
      if (!BrowserService.browser) {
        this.log('Ініціалізація BrowserService...', 'info');
        await BrowserService.initialize();
      }
  
      const result = await BrowserService.joinKahootGame(this.pin, this.name);
  
      if (result && result.success) {
        this.log('Успішно підключено через Playwright', 'info');
        this.connected = true;
        this.clientId = result.clientId;
        this.browserPage = result.page;
        this.setupPlaywrightListeners();
        this.startWatchdog();
        return true;
      }
  
      if (result?.reason === 'game_closed') {
        this.log(`Гру завершено або вона недоступна. Завершення роботи бота.`, 'info');
        await this.disconnect();
        return false;
      }
  
      this.log('Не вдалося підключитися через Playwright', 'error');
      return false;
  
    } catch (error) {
      this.log(`Помилка підключення через Playwright: ${error.message}`, 'error');
      throw error;
    }
  }
  

  setupPlaywrightListeners() {
    if (!this.browserPage) return;
    const page = this.browserPage;
    this.log('Налаштування обробників подій Playwright', 'info');

    page.on('websocket', ws => {
      this.log(`WebSocket відкрито у Playwright: ${ws.url()}`, 'debug');
      ws.on('message', data => {
        const msgStr = data.toString();
        if (msgStr.includes('"type":"question"')) {
          this.log('Виявлено питання у повідомленні WebSocket', 'info');
          this.handleQuestionMessage(msgStr);
        }
        if (msgStr.includes('"type":"quiz_result"')) {
          this.log('Виявлено результат квізу', 'info');
        }
        if (msgStr.includes('"type":"quiz_end"') || msgStr.includes('"type":"game_end"')) {
          this.log('Гру завершено. Завершення...', 'info');
          this.disconnect();
        }
      });
      ws.on('close', () => {
        this.log('WebSocket закрився. Спроба реконекту...', 'warn');
        this.connected = false;
        this.tryReconnect();
      });
    });

    page.evaluate(() => {
      window.kahootBotLog = function(data) {
        console.log('KAHOOT_BOT_DATA:' + JSON.stringify(data));
      };
      const observer = new MutationObserver((mutations) => {
        const endGamePatterns = [
          'Game over', 'Thanks for playing', 'You have been kicked',
          'This game is over', 'has ended the game', 'Гру завершено'
        ];
        const bodyText = document.body.innerText;
        for (const pattern of endGamePatterns) {
          if (bodyText.includes(pattern)) {
            window.kahootBotLog({ type: 'forced_exit', reason: pattern });
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    page.on('console', msg => {
      const text = msg.text();
      if (text.startsWith('KAHOOT_BOT_DATA:')) {
        try {
          const data = JSON.parse(text.substring('KAHOOT_BOT_DATA:'.length));
          this.handlePlaywrightEvent(data);
        } catch (err) {
          this.log(`Помилка JSON з Playwright: ${err.message}`, 'error');
        }
      }
    });
  }

  handlePlaywrightEvent(data) {
    switch (data.type) {
      case 'question_detected':
        this.log(`Виявлено питання: ${data.text}`, 'info');
        this.currentQuestion = data.text;
        this.currentQuestionIndex++;
        break;
      case 'answers_detected':
        this.log(`Виявлено відповіді: ${JSON.stringify(data.answers)}`, 'info');
        setTimeout(() => this.answerQuestionViaPlaywright(
          Math.floor(Math.random() * data.answers.length)),
          1000 + Math.random() * 5000);
        break;
      case 'forced_exit':
        this.log(`Сесію завершено (${data.reason || 'невідомо'}). Завершення...`, 'warn');
        this.disconnect();
        break;
    }
  }

  async answerQuestionViaPlaywright(answerIndex) {
    if (!this.browserPage) return false;
    try {
      const answerElements = await this.browserPage.$$('.answer');
      if (answerElements.length > 0 && answerIndex < answerElements.length) {
        await answerElements[answerIndex].click();
        this.lastAnswer = answerIndex;
        this.log(`Клікнуто на відповідь ${answerIndex}`, 'info');
        return true;
      }
    } catch (error) {
      this.log(`Помилка відповіді: ${error.message}`, 'error');
    }
    return false;
  }

  handleQuestionMessage(message) {
    try {
      const data = JSON.parse(message);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.data?.type === 'question') {
            this.currentQuestionIndex++;
            this.currentQuestion = item.data.question || 'Невідоме питання';
            this.log(`Питання #${this.currentQuestionIndex}: ${this.currentQuestion}`, 'info');
          }
        }
      }
    } catch (error) {
      this.log(`Помилка парсингу питання: ${error.message}`, 'error');
    }
  }

  async tryReconnect() {
    if (this.connected) return;
    this.log('Спроба реконекту...', 'info');
    try {
      const result = await BrowserService.joinKahootGame(this.pin, this.name);
      this.browserPage = result.page;
      this.clientId = result.clientId || null;
      this.setupPlaywrightListeners();
      this.startWatchdog();
      this.connected = true;
      this.log('Реконект успішний', 'info');
    } catch (err) {
      this.log(`Реконект невдалий: ${err.message}`, 'error');
      setTimeout(() => this.tryReconnect(), 5000 + Math.random() * 5000);
    }
  }

  startWatchdog() {
    if (this._watchdogInterval) clearInterval(this._watchdogInterval);
    this._watchdogInterval = setInterval(async () => {
      try {
        if (!this.browserPage || typeof this.browserPage.isClosed !== 'function') {
          this.log('Сторінка недоступна. Завершення...', 'warn');
          await this.disconnect();
          clearInterval(this._watchdogInterval);
          return;
        }
        const closed = await this.browserPage.isClosed();
        if (closed) {
          this.log('Сторінка закрита. Реконект...', 'warn');
          this.connected = false;
          clearInterval(this._watchdogInterval);
          this.tryReconnect();
        }
      } catch (err) {
        this.log(`Watchdog помилка: ${err.message}`, 'error');
      }
    }, 5000);
  }

  async disconnect() {
    try {
      this.log(`Відключення бота ${this.id}`, 'info');
      if (this._watchdogInterval) clearInterval(this._watchdogInterval);
      if (this.browserPage) {
        await this.browserPage.close().catch(() => {});
        this.browserPage = null;
      }
      this.connected = false;
      this.log(`Бот ${this.id} завершив роботу`, 'info');
    } catch (err) {
      this.log(`Помилка відключення: ${err.message}`, 'error');
    }
  }
}

module.exports = KahootBot;
