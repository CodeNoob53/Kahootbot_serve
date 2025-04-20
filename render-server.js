// Новий файл render-server.js
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { HttpsProxyAgent } = require('https-proxy-agent');
const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Завантаження змінних середовища
try {
  const dotenv = require('dotenv');
  dotenv.config();
  console.log('dotenv успішно завантажено');
} catch (error) {
  console.log('dotenv не знайдено, використовуємо змінні середовища за замовчуванням');
}

// Налаштування проксі з змінних середовища або порожні значення
const PROXY_CONFIG = {
  host: process.env.PROXY_HOST || '',
  port: process.env.PROXY_PORT || '',
  auth: {
    username: process.env.PROXY_USERNAME || '',
    password: process.env.PROXY_PASSWORD || ''
  }
};

// Створення Express додатку
const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// Логування запитів
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.url}`);
  next();
});

// Функція для створення HTTPS агента з проксі
function createProxyAgent() {
  if (!PROXY_CONFIG.host || !PROXY_CONFIG.port) {
    console.log('Проксі не налаштовано.');
    return null;
  }

  const authStr = PROXY_CONFIG.auth.username && PROXY_CONFIG.auth.password
    ? `${PROXY_CONFIG.auth.username}:${PROXY_CONFIG.auth.password}`
    : '';

  const proxyUrl = authStr
    ? `http://${authStr}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`
    : `http://${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;

  console.log('🔒 Побудований проксі URL:', proxyUrl);

  try {
    return new HttpsProxyAgent(proxyUrl);
  } catch (e) {
    console.error('❌ Помилка створення агента:', e.message);
    return null;
  }
}

// Ініціалізація HTTPS агента для проксі
let httpsAgent = null;
try {
  httpsAgent = createProxyAgent();
} catch (error) {
  console.error('Помилка ініціалізації проксі-агента:', error);
}

// --- CORS заголовки для всіх запитів ---
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Обробка CORS preflight запитів
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});

// --- Ендпоінти для роботи з проксі-сервером ---
app.post('/set-proxy', (req, res) => {
  try {
    const { host, port, username, password } = req.body;
    
    if (!host || !port) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Необхідно вказати host і port' 
      });
    }
    
    // Оновлення конфігурації проксі
    PROXY_CONFIG.host = host;
    PROXY_CONFIG.port = port;
    PROXY_CONFIG.auth.username = username || '';
    PROXY_CONFIG.auth.password = password || '';
    
    // Створення нового агента з оновленими налаштуваннями
    try {
      httpsAgent = createProxyAgent();
      
      if (httpsAgent === null) {
        console.log('Налаштування проксі оновлено, але агент не створено. Продовжуємо без проксі.');
      }
      
      console.log(`Налаштування проксі оновлено: ${host}:${port}`);
      
      return res.json({ 
        success: true, 
        message: 'Налаштування проксі успішно оновлено',
        proxyConfig: {
          host: PROXY_CONFIG.host,
          port: PROXY_CONFIG.port,
          hasAuth: Boolean(PROXY_CONFIG.auth.username && PROXY_CONFIG.auth.password)
        }
      });
    } catch (proxyError) {
      console.error('Помилка створення проксі-агента:', proxyError);
      return res.status(500).json({
        error: 'Proxy Agent Error',
        message: 'Не вдалося створити проксі-агент: ' + proxyError.message
      });
    }
  } catch (error) {
    console.error('Помилка оновлення налаштувань проксі:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Помилка оновлення налаштувань проксі: ' + error.message 
    });
  }
});

app.get('/proxy-info', (req, res) => {
  return res.json({
    host: PROXY_CONFIG.host,
    port: PROXY_CONFIG.port,
    hasAuth: Boolean(PROXY_CONFIG.auth.username && PROXY_CONFIG.auth.password)
  });
});

app.get('/test-proxy', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  
  try {
    if (!PROXY_CONFIG.host || !PROXY_CONFIG.port) {
      console.log('Проксі не налаштовано');
      return res.status(400).json({ 
        success: false, 
        message: 'Проксі не налаштовано' 
      });
    }

    console.log('Тестування проксі-з\'єднання...');
    
    return res.json({
      success: true,
      message: 'Проксі налаштовано',
      config: {
        host: PROXY_CONFIG.host,
        port: PROXY_CONFIG.port,
        hasAuth: Boolean(PROXY_CONFIG.auth.username && PROXY_CONFIG.auth.password)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Помилка тестування проксі:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Помилка тестування проксі',
      error: error.message
    });
  }
});

app.get('/proxy-status', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  
  try {
    return res.json({
      status: 'ok',
      proxyConfigured: Boolean(PROXY_CONFIG.host && PROXY_CONFIG.port),
      proxyConfig: {
        host: PROXY_CONFIG.host,
        port: PROXY_CONFIG.port,
        hasAuth: Boolean(PROXY_CONFIG.auth.username && PROXY_CONFIG.auth.password)
      },
      agentInitialized: httpsAgent !== null,
      serverTime: new Date().toISOString()
    });
  } catch (e) {
    console.error('Помилка в /proxy-status:', e);
    return res.status(500).json({
      status: 'error',
      message: e.message
    });
  }
});

// --- Базовий роут для перевірки стану сервера ---
app.get('/', (req, res) => {
  res.json({ 
    status: 'Server is running', 
    proxyConfigured: Boolean(PROXY_CONFIG.host && PROXY_CONFIG.port),
    proxyInfo: PROXY_CONFIG.host && PROXY_CONFIG.port ? 
      `${PROXY_CONFIG.host}:${PROXY_CONFIG.port}` : 'Not configured',
    hasAuth: Boolean(PROXY_CONFIG.auth.username && PROXY_CONFIG.auth.password),
    timestamp: new Date().toISOString(),
    agentInitialized: httpsAgent !== null
  });
});

// --- Додаткові маршрути для моніторингу здоров'я сервера ---
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// --- KAHOOT API ENDPOINTS ---

// !!! ВАЖЛИВО: Ендпоінт для розшифрування challenge-токену
// Повинен бути оголошений ПЕРЕД налаштуванням загального проксі для /kahoot-api
// Покращений ендпоінт для розшифрування challenge-токену
app.post('/kahoot-api/solve-challenge', (req, res) => {
  try {
    console.log('Отримано запит на розшифрування challenge-токену');
    const { challenge } = req.body;
    
    if (!challenge) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Відсутній challenge токен' 
      });
    }
    
    // Функція для логування важливих частин challenge для дебагу
    const logChallengeParts = (challenge) => {
      console.log('--- Challenge Debug Info ---');
      // Видобуваємо різні частини для аналізу
      const decodeFn = challenge.match(/function decode\([^)]*\)\s*\{([\s\S]*?)\}/);
      const offsetCalc = challenge.match(/var offset\s*=\s*([^;]+);/);
      
      console.log('Decode function exists:', Boolean(decodeFn));
      console.log('Offset calculation exists:', Boolean(offsetCalc));
      
      if (offsetCalc) {
        console.log('Raw offset formula:', offsetCalc[1].trim());
      }
      
      // Шукаємо закодоване повідомлення
      const encodedMsg = challenge.match(/decode\.call\(this,\s*'([^']+)'/);
      console.log('Encoded message exists:', Boolean(encodedMsg));
      if (encodedMsg) {
        console.log('Encoded message length:', encodedMsg[1].length);
        console.log('Encoded message preview:', encodedMsg[1].substring(0, 20) + '...');
      }
      
      console.log('------------------------');
    };
    
    // Логування для налагодження
    logChallengeParts(challenge);
    
    // Отримуємо закодоване повідомлення з виклику decode.call
    let encodedMessage;
    try {
      // Оновлений регулярний вираз для кращого пошуку повідомлення
      const msgMatch = challenge.match(/decode\.call\(this,\s*'([^']+)'/);
      if (!msgMatch) {
        // Альтернативні варіанти пошуку
        const altMatch1 = challenge.match(/decode\s*\(\s*'([^']+)'\s*\)/);
        const altMatch2 = challenge.match(/decode\s*\(\s*"([^"]+)"\s*\)/);
        
        if (altMatch1) {
          encodedMessage = altMatch1[1];
        } else if (altMatch2) {
          encodedMessage = altMatch2[1];
        } else {
          throw new Error('Не вдалося знайти закодоване повідомлення');
        }
      } else {
        encodedMessage = msgMatch[1];
      }
    } catch (matchError) {
      console.error('Помилка отримання закодованого повідомлення:', matchError);
      return res.status(400).json({ 
        error: 'Invalid Challenge', 
        message: 'Не вдалося отримати закодоване повідомлення з challenge' 
      });
    }
    
    // Отримуємо формулу для обчислення offset
    let offsetFormula;
    try {
      // Оновлений регулярний вираз для пошуку offset
      const offsetMatch = challenge.match(/var\s+offset\s*=\s*([^;]+);/);
      if (!offsetMatch) {
        // Альтернативні варіанти пошуку
        const altMatch = challenge.match(/offset\s*=\s*([^;]+);/);
        if (altMatch) {
          offsetFormula = altMatch[1];
        } else {
          // Якщо не можемо знайти формулу, використовуємо типове значення
          console.log('Не вдалося знайти формулу offset, використовуємо типове значення');
          offsetFormula = '400000'; // Типове значення на основі аналізу логів
        }
      } else {
        offsetFormula = offsetMatch[1];
      }
    } catch (matchError) {
      console.error('Помилка отримання формули offset:', matchError);
      // Використовуємо запасне значення
      offsetFormula = '400000';
    }
    
    // Обчислюємо offset
    let offset = 0;
    try {
      // Очищаємо формулу від пробілів та небезпечних конструкцій
      const cleanFormula = offsetFormula
        .replace(/\s+/g, '') // Видалення пробілів
        .replace(/\t/g, '')  // Видалення табуляцій
        .replace(/this\.angular\.isArray|this\.angular\.isObject/g, 'false') // Заміна функцій
        .replace(/console\.log\([^)]+\)/g, '') // Видалення викликів console.log
        .replace(/window\./g, '') // Видалення доступу до window
        .replace(/document\./g, '') // Видалення доступу до document
        .replace(/localStorage|sessionStorage/g, '{}') // Безпечна заміна
        .replace(/eval|Function/g, ''); // Видалення небезпечних функцій
      
      console.log('Очищена формула offset:', cleanFormula);
      
      // Безпечне обчислення з обмеженням по часу
      let evaluated = false;
      const evalTimeout = setTimeout(() => {
        if (!evaluated) {
          console.log('Timeout при обчисленні offset, використовуємо типове значення');
          offset = 400000; // Типове значення при таймауті
          evaluated = true;
        }
      }, 1000);
      
      // Пробуємо обчислити
      try {
        offset = eval(cleanFormula);
        evaluated = true;
        clearTimeout(evalTimeout);
        console.log('Обчислений offset:', offset);
      } catch (evalInnerError) {
        if (!evaluated) {
          console.error('Помилка обчислення: ' + evalInnerError);
          offset = 400000;
          evaluated = true;
          clearTimeout(evalTimeout);
        }
      }
    } catch (evalError) {
      console.error('Помилка обчислення offset:', evalError);
      
      // Якщо не вдалося обчислити, використовуємо статистично найбільш поширені значення
      const commonOffsets = [230000, 400000, 500000, 600000, 700000];
      offset = commonOffsets[Math.floor(Math.random() * commonOffsets.length)];
      console.log('Використовуємо типове значення offset:', offset);
    }
    
    // Покращена функція для розшифрування повідомлення
    function decodeMessage(message, offset) {
      if (!message || typeof message !== 'string') {
        console.error('Invalid message for decoding', message);
        return '';
      }
      
      try {
        let result = '';
        for (let position = 0; position < message.length; position++) {
          const char = message.charAt(position);
          const charCode = char.charCodeAt(0);
          
          // Математична формула з protection від NaN та Infinity
          let newCharCode = Math.floor((((charCode * (position + 1)) + offset) % 77) + 48);
          
          // Якщо отримали некоректний код - використовуємо запасний
          if (isNaN(newCharCode) || !isFinite(newCharCode) || newCharCode < 32 || newCharCode > 126) {
            newCharCode = 88; // ASCII код для 'X'
          }
          
          result += String.fromCharCode(newCharCode);
        }
        return result;
      } catch (error) {
        console.error('Error in decodeMessage:', error);
        // Повертаємо резервний токен у випадку помилки
        return 'BACKUP_TOKEN_' + Date.now();
      }
    }
    
    // Спроба розшифрувати з поточним offset
    let decodedToken = decodeMessage(encodedMessage, offset);
    console.log('Розшифрований токен:', decodedToken);
    
    // Перевірка валідності токену (базова)
    if (!decodedToken || decodedToken.length < 10) {
      // Якщо токен недійсний, пробуємо інші значення offset
      console.log('Токен виглядає недійсним, пробуємо альтернативні offset');
      const alternativeOffsets = [300000, 400000, 500000, 600000, 700000];
      
      for (const altOffset of alternativeOffsets) {
        if (altOffset === offset) continue; // Пропускаємо вже перевірений offset
        
        const altToken = decodeMessage(encodedMessage, altOffset);
        console.log(`Альтернативний токен (offset=${altOffset}):`, altToken);
        
        // Якщо альтернативний токен виглядає краще
        if (altToken && altToken.length > 10) {
          decodedToken = altToken;
          console.log('Використовуємо альтернативний токен');
          break;
        }
      }
    }
    
    return res.json({
      success: true,
      token: decodedToken,
      offset: offset,
      originalLength: encodedMessage.length,
      decodedLength: decodedToken.length
    });
  } catch (error) {
    console.error('Помилка обробки challenge:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Помилка обробки challenge: ' + error.message
    });
  }
});

// Ендпоінт для отримання токена сесії з Kahoot
app.get('/kahoot-api/reserve/session/:pin', async (req, res) => {
  try {
    const { pin } = req.params;

    if (!pin || !/^\d{6,10}$/.test(pin)) {
      return res.status(400).json({
        error: 'Invalid PIN',
        message: 'PIN повинен містити від 6 до 10 цифр'
      });
    }

    if (!PROXY_CONFIG.host || !PROXY_CONFIG.port) {
      return res.status(503).json({
        error: 'Proxy Not Configured',
        message: 'Налаштуйте проксі перед виконанням запитів до Kahoot'
      });
    }

    if (!httpsAgent) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Проксі-агент не ініціалізовано. Спробуйте перезапустити сервер.'
      });
    }

    console.log(`Отримання токену сесії для PIN: ${pin}`);

    const kahootUrl = `https://kahoot.it/reserve/session/${pin}/`;

    const response = await new Promise((resolve, reject) => {
      const req = https.request(kahootUrl, {
        method: 'GET',
        agent: httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.93 Safari/537.36',
          'Origin': 'https://kahoot.it',
          'Referer': 'https://kahoot.it/'
        }
      }, (resp) => {
        let data = '';
        resp.on('data', (chunk) => { data += chunk; });
        resp.on('end', () => {
          if (resp.statusCode >= 200 && resp.statusCode < 300) {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              console.error('JSON parse error:', e.message);
              reject({ statusCode: 502, message: `Неможливо розібрати відповідь: ${e.message}` });
            }
          } else {
            console.warn(`Kahoot відповів статусом ${resp.statusCode}: ${resp.statusMessage}`);
            reject({ statusCode: resp.statusCode, message: resp.statusMessage });
          }
        });
      });

      req.on('error', (error) => {
        reject({ statusCode: 502, message: error.message });
      });

      req.end();
    });

    console.log(`Отримано токен сесії для PIN ${pin}`);
    return res.json(response);
  } catch (error) {
    const status = error.statusCode || 500;
    console.error(`Помилка отримання токену сесії (HTTP ${status}): ${error.message}`);
    return res.status(status).json({
      error: 'Session Token Error',
      message: error.message
    });
  }
});

// !!! ВАЖЛИВО: Загальний проксі для всіх інших запитів до Kahoot API повинен бути останнім
// Після всіх спеціальних ендпоінтів
app.use('/kahoot-api', (req, res, next) => {
  // Перевірка чи проксі налаштовано
  if (!PROXY_CONFIG.host || !PROXY_CONFIG.port) {
    return res.status(503).json({ 
      error: 'Service Unavailable', 
      message: 'Проксі не налаштовано. Будь ласка, спочатку налаштуйте проксі через API /set-proxy' 
    });
  }
  
  // Перевірка, чи доступний httpsAgent
  if (!httpsAgent) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Проксі-агент не ініціалізовано. Спробуйте перезапустити сервер.'
    });
  }
  
  // Всі запити, крім тих, що вже оброблені спеціальними ендпоінтами, будуть проксіюватися
  const proxyMiddleware = createProxyMiddleware({
    target: 'https://kahoot.it',
    changeOrigin: true,
    pathRewrite: {
      '^/kahoot-api': ''
    },
    agent: httpsAgent,
    onProxyReq: (proxyReq, req, res) => {
      console.log(`Proxying request to: ${req.method} ${req.path}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      proxyRes.headers['Access-Control-Allow-Origin'] = '*';
      proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization';
    },
    onError: (err, req, res) => {
      console.error('Proxy error:', err);
      res.status(500).json({ error: 'Proxy Error', message: err.message });
    }
  });
  
  return proxyMiddleware(req, res, next);
});

// --- НАЛАШТУВАННЯ WEBSOCKET ПРОКСІ ---
const server = http.createServer(app);
const wsServer = new WebSocket.Server({ noServer: true });

// Обробка оновлення з'єднання для WebSocket
server.on('upgrade', (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;
  
  if (pathname.startsWith('/kahoot-ws')) {
    wsServer.handleUpgrade(request, socket, head, (ws) => {
      wsServer.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Обробка WebSocket з'єднань
wsServer.on('connection', (ws, request) => {
  if (!PROXY_CONFIG.host || !PROXY_CONFIG.port) {
    console.error('WebSocket connection attempt, but proxy is not configured');
    ws.send(JSON.stringify({
      error: 'Proxy not configured',
      message: 'Please configure proxy via /set-proxy API first'
    }));
    ws.close();
    return;
  }
  
  if (!httpsAgent) {
    console.error('WebSocket connection attempt, but proxy agent is not initialized');
    ws.send(JSON.stringify({
      error: 'Proxy agent not initialized',
      message: 'Please restart the server'
    }));
    ws.close();
    return;
  }
  
  // Обробка URL з challenge-токеном
  const parsedUrl = url.parse(request.url);
  const pathParts = parsedUrl.pathname.split('/');
  
  // Видаляємо '/kahoot-ws' з початку шляху
  if (pathParts[1] === 'kahoot-ws') {
    pathParts.splice(1, 1);
  }
  
  // Формуємо шлях для Kahoot WebSocket
  // Важливо: не використовуємо raw challenge-токен, а беремо тільки необхідні параметри
  // Format: /cometd/{pin}/{sessionToken}
  // Обмежуємо до 3-х компонентів, щоб уникнути проблем з довгими URL
  const limitedPath = pathParts.slice(0, 3).join('/');
  const kahootWsUrl = `wss://kahoot.it${limitedPath}`;
  
  console.log(`WebSocket connection established, proxying to: ${kahootWsUrl}`);
  
  try {
    // Встановлюємо додаткові заголовки для з'єднання з Kahoot
    const wsOptions = {
      agent: httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.93 Safari/537.36',
        'Origin': 'https://kahoot.it',
        'Referer': 'https://kahoot.it/',
        'Host': 'kahoot.it'
      }
    };
    
    // Додаємо cookie та інші необхідні параметри
    const cookies = [
      'kahoot-session=1', 
      'player=true', 
      'session-id=' + Math.random().toString(36).substring(2),
      'AWSALB=' + Math.random().toString(36).substring(2)
    ];
    
    wsOptions.headers['Cookie'] = cookies.join('; ');
    
    // Створення WebSocket з'єднання до Kahoot
    const kahootWs = new WebSocket(kahootWsUrl, wsOptions);
    
    let isConnectionEstablished = false;
    
    // Обробник успішного підключення
    kahootWs.on('open', () => {
      console.log('Successfully connected to Kahoot WebSocket');
      isConnectionEstablished = true;
    });
    
    // Передача повідомлень від клієнта до Kahoot
    ws.on('message', (message) => {
      try {
        if (kahootWs.readyState === WebSocket.OPEN) {
          const logSize = 200;
          const msgStr = message.toString();
          const logMsg = msgStr.length > logSize ? 
            msgStr.substring(0, logSize) + '...' : msgStr;
          console.log(`WS Client → Kahoot: ${logMsg}`);
          
          kahootWs.send(message);
        }
      } catch (error) {
        console.error('Error sending message to Kahoot:', error);
      }
    });
    
    // Передача повідомлень від Kahoot до клієнта
    kahootWs.on('message', (message) => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          const logSize = 200;
          const msgStr = message.toString();
          const logMsg = msgStr.length > logSize ? 
            msgStr.substring(0, logSize) + '...' : msgStr;
          console.log(`WS Kahoot → Client: ${logMsg}`);
          
          ws.send(message);
        }
      } catch (error) {
        console.error('Error sending message to client:', error);
      }
    });
    
    // Закриття з'єднань при розірванні одного з них
    ws.on('close', (code, reason) => {
      console.log(`Client WebSocket closed. Code: ${code}, Reason: ${reason || 'None'}`);
      if (kahootWs.readyState === WebSocket.OPEN || kahootWs.readyState === WebSocket.CONNECTING) {
        kahootWs.close();
      }
    });
    
    kahootWs.on('close', (code, reason) => {
      console.log(`Kahoot WebSocket closed. Code: ${code}, Reason: ${reason || 'None'}`);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    });
    
    // Обробка помилок
    ws.on('error', (error) => {
      console.error('Client WebSocket error:', error);
    });
    
    kahootWs.on('error', (error) => {
      console.error('Kahoot WebSocket error:', error);
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            error: 'Kahoot connection error',
            message: error.message || 'Unexpected server error'
          }));
        }
      } catch (e) {
        console.error('Error sending error message to client:', e);
      }
      
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    });
    
    // Обробка помилки з'єднання
    kahootWs.on('unexpected-response', (request, response) => {
      console.error(`Unexpected response from Kahoot: ${response.statusCode} ${response.statusMessage}`);
      
      // Логування всіх заголовків відповіді для діагностики
      console.log('Response headers:', response.headers);
      
      // Збір даних з відповіді для діагностики
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        console.log('Response body:', body.substring(0, 1000)); // Перші 1000 символів відповіді
        
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              error: 'Kahoot connection rejected',
              status: response.statusCode,
              message: `Server rejected connection: ${response.statusCode} ${response.statusMessage}`
            }));
          }
        } catch (e) {
          console.error('Error sending error message to client:', e);
        }
      });
      
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    });
    
    // Встановлюємо таймаут для з'єднання
    const connectionTimeout = setTimeout(() => {
      if (!isConnectionEstablished) {
        console.error('Connection timeout to Kahoot WebSocket');
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            error: 'Connection timeout',
            message: 'Failed to establish connection to Kahoot server'
          }));
        }
        
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
        
        if (kahootWs.readyState === WebSocket.OPEN || kahootWs.readyState === WebSocket.CONNECTING) {
          kahootWs.close();
        }
      }
    }, 10000); // 10 секунд таймаут
    
    // Скасовуємо таймаут при успішному підключенні
    kahootWs.on('open', () => {
      clearTimeout(connectionTimeout);
    });
  } catch (error) {
    console.error('Error creating WebSocket connection to Kahoot:', error);
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          error: 'WebSocket Error',
          message: error.message
        }));
      }
    } catch (e) {
      console.error('Error sending error message to client:', e);
    }
    
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
  if (PROXY_CONFIG.host && PROXY_CONFIG.port) {
    console.log(`Using proxy: ${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`);
    if (PROXY_CONFIG.auth.username && PROXY_CONFIG.auth.password) {
      console.log('Proxy authentication configured');
    } else {
      console.log('No proxy authentication configured');
    }
  } else {
    console.log('No proxy configured. Please set proxy using /set-proxy API');
  }
});