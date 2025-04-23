// test-selenium.js
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function testSelenium() {
  console.log('Тестування Selenium WebDriver...');
  
  // Налаштування опцій Chrome
  const options = new chrome.Options();
  options.addArguments('--headless');
  options.addArguments('--disable-gpu');
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');
  
  let driver;
  
  try {
    // Створення драйвера
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();
    
    console.log('WebDriver успішно створено');
    
    // Відкриття сторінки Kahoot
    console.log('Відкриваємо сторінку Kahoot...');
    await driver.get('https://kahoot.it/');
    console.log('Сторінка Kahoot успішно відкрита');
    
    // Перевіряємо наявність елементів інтерфейсу Kahoot
    await driver.wait(until.elementLocated(By.id('game-input')), 10000);
    console.log('Елемент вводу PIN знайдено');
    
    // Отримання заголовка сторінки
    const title = await driver.getTitle();
    console.log(`Заголовок сторінки: ${title}`);
    
    // Тестуємо введення PIN
    const pinInput = await driver.findElement(By.id('game-input'));
    await pinInput.sendKeys('123456'); // Тестовий PIN
    console.log('Введено тестовий PIN: 123456');
    
    // Знаходимо кнопку для продовження
    const enterButton = await driver.findElement(By.css('button[data-functional-selector="join-button-game-pin"]'));
    console.log('Кнопка Enter знайдена');
    
    // Тестуємо скріншот
    const fs = require('fs');
    const path = require('path');
    
    console.log('Створюємо скріншот...');
    const screenshot = await driver.takeScreenshot();
    const screenshotPath = path.join(__dirname, 'kahoot-test-screenshot.png');
    fs.writeFileSync(screenshotPath, screenshot, 'base64');
    console.log(`Скріншот збережено у: ${screenshotPath}`);
    
    // Тестування cookies
    const cookies = await driver.manage().getCookies();
    console.log(`Отримано ${cookies.length} cookies:`);
    console.log(cookies);
    
    // Тестування localStorage
    const localStorageData = await driver.executeScript(() => {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data[key] = localStorage.getItem(key);
      }
      return data;
    });
    console.log('Дані localStorage:');
    console.log(localStorageData);
    
    console.log('Тест завершено успішно!');
  } catch (error) {
    console.error('Помилка під час тестування Selenium:');
    console.error(error);
    
    // Спроба зробити скріншот при помилці
    if (driver) {
      try {
        const fs = require('fs');
        const screenshot = await driver.takeScreenshot();
        fs.writeFileSync('kahoot-error-screenshot.png', screenshot, 'base64');
        console.log('Створено скріншот помилки: kahoot-error-screenshot.png');
      } catch (screenshotError) {
        console.error('Неможливо створити скріншот помилки:', screenshotError.message);
      }
    }
  } finally {
    // Закриття драйвера
    if (driver) {
      await driver.quit();
      console.log('WebDriver закрито');
    }
  }
}

// Запуск тестування
testSelenium().catch(error => {
  console.error('Помилка в основному процесі тестування:', error);
  process.exit(1);
});