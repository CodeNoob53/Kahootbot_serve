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
    this.browserPage = null; // Сторінка Playwright
    
    this.log(`Бот ініціалізовано з ім'ям: ${this.name}, PIN: ${this.pin}`);
  }
  
  log(message, type = 'info') {
    if (this.logCallback) {
      this.logCallback(message, type);
    }
    logger.info(`[Bot ${this.id}] [${type}] ${message}`);
  }
  
  /**
   * Встановлює з'єднання з грою Kahoot
   * @returns {Promise<boolean>} Результат підключення
   */
  async connect() {
    try {
      this.log(`Спроба з'єднання з PIN: ${this.pin}`, 'info');
      
      // Перевірка формату PIN
      if (!this.pin || !/^\d{6,10}$/.test(this.pin)) {
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

  /**
   * Підключення до гри через Playwright
   * @returns {Promise<boolean>} Результат підключення
   */
  async connectViaPlaywright() {
    try {
      this.log('З\'єднання через Playwright...', 'info');
      
      // Переконуємось, що BrowserService ініціалізовано
      if (!BrowserService.browser) {
        this.log('Ініціалізація BrowserService...', 'info');
        await BrowserService.initialize();
      }
      
      // Підключення до гри
      const result = await BrowserService.joinKahootGame(this.pin, this.name);
      
      if (result && result.success) {
        this.log('Успішно підключено через Playwright', 'info');
        this.connected = true;
        this.clientId = result.clientId;
        this.browserPage = result; // Зберігаємо результат, який містить сторінку
        
        // Налаштовуємо обробники подій для сторінки
        this.setupPlaywrightListeners();
        
        return true;
      } else {
        this.log('Не вдалося підключитися через Playwright', 'error');
        return false;
      }
    } catch (error) {
      this.log(`Помилка підключення через Playwright: ${error.message}`, 'error');
      throw error;
    }
  }
  
  /**
   * Налаштовуємо обробники подій для Playwright сторінки
   */
  setupPlaywrightListeners() {
    if (!this.browserPage) return;
    
    this.log('Налаштування обробників подій Playwright', 'info');
    
    // Отримуємо сторінку з результату
    const page = this.browserPage;
    
    // Прослуховуємо WebSocket повідомлення
    page.on('websocket', ws => {
      this.log(`WebSocket відкрито у Playwright: ${ws.url()}`, 'debug');
      
      ws.on('message', data => {
        try {
          const msgStr = data.toString();
          
          // Шукаємо повідомлення про питання
          if (msgStr.includes('"type":"question"')) {
            this.log('Виявлено питання у повідомленні WebSocket', 'info');
            this.handleQuestionMessage(msgStr);
          }
          
          // Шукаємо повідомлення про результати
          if (msgStr.includes('"type":"quiz_result"')) {
            this.log('Виявлено результат квізу у повідомленні WebSocket', 'info');
            // Можна додати обробку результатів
          }
        } catch (error) {
          this.log(`Помилка обробки повідомлення WebSocket: ${error.message}`, 'error');
        }
      });
    });
    
    // Використовуємо MutationObserver через Playwright для відстеження змін DOM
    page.evaluate(() => {
      // Створюємо функцію для передачі даних у консоль
      window.kahootBotLog = function(data) {
        console.log('KAHOOT_BOT_DATA:' + JSON.stringify(data));
      };
      
      // Стежимо за змінами DOM для виявлення нових питань
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          // Шукаємо елементи питань
          const questionElements = document.querySelectorAll('.question-container, .question-text');
          if (questionElements.length > 0) {
            const questionText = questionElements[0].textContent;
            window.kahootBotLog({
              type: 'question_detected',
              text: questionText
            });
            
            // Шукаємо варіанти відповідей
            const answerElements = document.querySelectorAll('.answer');
            const answers = Array.from(answerElements).map((el, index) => ({
              index,
              text: el.textContent.trim(),
              color: el.classList.contains('red') ? 'red' : 
                     el.classList.contains('blue') ? 'blue' : 
                     el.classList.contains('yellow') ? 'yellow' : 'green'
            }));
            
            if (answers.length > 0) {
              window.kahootBotLog({
                type: 'answers_detected',
                answers
              });
            }
          }
        }
      });
      
      // Запускаємо спостереження за всім документом
      observer.observe(document.body, { 
        childList: true, 
        subtree: true,
        characterData: true
      });
    });
    
    // Прослуховуємо консоль для отримання спеціальних повідомлень
    page.on('console', msg => {
      const text = msg.text();
      if (text.startsWith('KAHOOT_BOT_DATA:')) {
        try {
          const data = JSON.parse(text.substring('KAHOOT_BOT_DATA:'.length));
          this.handlePlaywrightEvent(data);
        } catch (error) {
          this.log(`Помилка розбору даних консолі Playwright: ${error.message}`, 'error');
        }
      }
    });
  }
  
  /**
   * Обробляємо події від Playwright
   */
  handlePlaywrightEvent(data) {
    switch (data.type) {
      case 'question_detected':
        this.log(`Виявлено питання: ${data.text}`, 'info');
        this.currentQuestion = data.text;
        this.currentQuestionIndex++;
        break;
        
      case 'answers_detected':
        this.log(`Виявлено відповіді: ${JSON.stringify(data.answers)}`, 'info');
        // Автоматично обираємо відповідь (можна впровадити більш складну логіку вибору)
        setTimeout(() => this.answerQuestionViaPlaywright(Math.floor(Math.random() * data.answers.length)), 
          1000 + Math.random() * 5000); // Випадкова затримка для імітації людської поведінки
        break;
        
      case 'answer_clicked':
        this.log(`Клікнуто відповідь: ${data.index}`, 'info');
        this.lastAnswer = data.index;
        break;
    }
  }
  
  /**
   * Відповідаємо на питання через Playwright
   */
  async answerQuestionViaPlaywright(answerIndex) {
    if (!this.browserPage) return false;
    
    try {
      this.log(`Відповідь на питання з індексом ${answerIndex}`, 'info');
      
      // Отримуємо сторінку
      const page = this.browserPage;
      
      // Знаходимо елементи відповідей
      const answerElements = await page.$$('.answer');
      
      if (answerElements.length > 0 && answerIndex < answerElements.length) {
        // Кликаємо на відповідь
        await answerElements[answerIndex].click();
        this.lastAnswer = answerIndex;
        this.log(`Клікнуто на відповідь ${answerIndex}`, 'info');
        return true;
      } else {
        this.log(`Не вдалося знайти елементи відповідей або недійсний індекс ${answerIndex}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`Помилка відповіді на питання: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Обробляємо повідомлення про питання
   */
  handleQuestionMessage(message) {
    try {
      const data = JSON.parse(message);
      
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.data && item.data.type === 'question') {
            this.currentQuestionIndex++;
            this.currentQuestion = item.data.question || 'Невідоме питання';
            this.log(`Питання #${this.currentQuestionIndex}: ${this.currentQuestion}`, 'info');
          }
        }
      } else if (data.data && data.data.type === 'question') {
        this.currentQuestionIndex++;
        this.currentQuestion = data.data.question || 'Невідоме питання';
        this.log(`Питання #${this.currentQuestionIndex}: ${this.currentQuestion}`, 'info');
      }
    } catch (error) {
      this.log(`Помилка обробки повідомлення про питання: ${error.message}`, 'error');
    }
  }
  
  async disconnect() {
    try {
      this.log(`Відключення бота ${this.id}`, 'info');
      
      // Якщо використовували Playwright
      if (this.browserPage) {
        try {
          this.log('Закриття сторінки Playwright', 'info');
          // Отримуємо сторінку з результату
          const page = this.browserPage;
          await page.close();
          this.browserPage = null;
        } catch (browserError) {
          this.log(`Помилка закриття сторінки браузера: ${browserError.message}`, 'error');
        }
      }
      
      this.connected = false;
      this.log(`Відключення завершено`, 'info');
      
      return true;
    } catch (error) {
      this.log(`Помилка відключення: ${error.message}`, 'error');
      return false;
    }
  }
}

module.exports = KahootBot;