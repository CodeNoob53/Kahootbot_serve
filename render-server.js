// Проксі-сервер для обходу обмежень CORS при роботі з Kahoot API
// Оптимізовано для розгортання на Render.com
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
// Виправлений імпорт HttpsProxyAgent
const { HttpsProxyAgent } = require('https-proxy-agent');
const WebSocket = require('ws');
const http = require('http');
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

// Створення файлу .env якщо він не існує (для локальної розробки)
try {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.log('Creating .env file with sample configuration');
    const sampleEnv = `# Налаштування проксі-сервера
# Введіть ваші дані замість значень за замовчуванням
PROXY_HOST=
PROXY_PORT=
PROXY_USERNAME=
PROXY_PASSWORD=

# Налаштування сервера
PORT=3000
`;
    fs.writeFileSync(envPath, sampleEnv);
  }
} catch (error) {
  console.warn('Error creating .env file:', error.message);
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
  origin: '*', // Дозволяємо запити з будь-якого джерела
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// Простий мідлвар для логування запитів
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.url}`);
  next();
});

// Функція для створення HTTPS агента з поточними налаштуваннями проксі
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
    // 🟢 Ось ключ: використовуємо "new"
    return HttpsProxyAgent(proxyUrl);
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

// API для встановлення налаштувань проксі
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
        // Агент не створено, але продовжуємо роботу без проксі
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

// API для отримання поточних налаштувань проксі (без паролів)
app.get('/proxy-info', (req, res) => {
  return res.json({
    host: PROXY_CONFIG.host,
    port: PROXY_CONFIG.port,
    hasAuth: Boolean(PROXY_CONFIG.auth.username && PROXY_CONFIG.auth.password)
  });
});

// Додаємо кінцеву точку для перевірки роботи проксі
app.get('/test-proxy', async (req, res) => {
  try {
    if (!PROXY_CONFIG.host || !PROXY_CONFIG.port) {
      return res.status(400).json({ 
        success: false, 
        message: 'Проксі не налаштовано' 
      });
    }

    if (!httpsAgent) {
      return res.status(500).json({
        success: false,
        message: 'Проксі-агент не ініціалізовано'
      });
    }

    const testUrl = 'https://kahoot.it/reserve/session/';
    console.log(`➡️ Тестовий запит до ${testUrl} через проксі`);

    const testResponse = await new Promise((resolve, reject) => {
      const https = require('https');
      const options = {
        agent: httpsAgent,
        method: 'GET',
        headers: {
          'User-Agent': 'KahootBot/1.0'
        }
      };

      const proxyReq = https.request(testUrl, options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', (chunk) => { data += chunk; });
        proxyRes.on('end', () => {
          resolve({
            statusCode: proxyRes.statusCode,
            headers: proxyRes.headers,
            data
          });
        });
      });

      proxyReq.on('error', (e) => {
        reject(e);
      });

      proxyReq.end();
    });

    console.log(`✅ Відповідь від Kahoot (test-proxy): статус ${testResponse.statusCode}`);

    return res.json({
      success: true,
      message: 'Проксі працює',
      testResponse: {
        statusCode: testResponse.statusCode,
        isSuccess: testResponse.statusCode >= 200 && testResponse.statusCode < 300
      }
    });
  } catch (error) {
    console.error('❌ Помилка тестування проксі:', error);
    return res.status(500).json({
      success: false,
      message: 'Помилка тестування проксі',
      error: error.message
    });
  }
});


// Налаштування проксі для запитів до Kahoot API
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
  
  // Створення проксі-middleware динамічно
  const proxyMiddleware = createProxyMiddleware({
    target: 'https://kahoot.it',
    changeOrigin: true,
    pathRewrite: {
      '^/kahoot-api': ''
    },
    agent: httpsAgent,
    onProxyReq: (proxyReq, req, res) => {
      // Логування запитів
      console.log(`Proxying request to: ${req.method} ${req.path}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      // Встановлення заголовків CORS
      proxyRes.headers['Access-Control-Allow-Origin'] = '*';
      proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization';
    },
    onError: (err, req, res) => {
      console.error('Proxy error:', err);
      res.status(500).json({ error: 'Proxy Error', message: err.message });
    }
  });
  
  // Виконання створеного middleware
  return proxyMiddleware(req, res, next);
});

// API для отримання токена сесії з Kahoot
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

    const https = require('https');
    const kahootUrl = `https://kahoot.it/reserve/session/${pin}/`;

    const response = await new Promise((resolve, reject) => {
      const req = https.request(kahootUrl, {
        method: 'GET',
        agent: httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
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

// Базовий роут для перевірки стану сервера
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

// Додаткові маршрути для моніторингу здоров'я сервера (використовується Render)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Статичний файл для перенаправлення на GitHub
app.get('/redirect', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="refresh" content="0; url=https://github.com/yourusername/kahoot-bot" />
      <title>Redirecting...</title>
    </head>
    <body>
      <p>Перенаправлення на GitHub репозиторій...</p>
    </body>
    </html>
  `);
});

// Створення HTTP сервера
const server = http.createServer(app);

// Налаштування WebSocket проксі
const wsServer = new WebSocket.Server({ noServer: true });

// Обробка оновлення з'єднання для WebSocket
server.on('upgrade', (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;
  
  // Лише для WebSocket запитів до Kahoot
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
  // Перевірка чи проксі налаштовано
  if (!PROXY_CONFIG.host || !PROXY_CONFIG.port) {
    console.error('WebSocket connection attempt, but proxy is not configured');
    ws.send(JSON.stringify({
      error: 'Proxy not configured',
      message: 'Please configure proxy via /set-proxy API first'
    }));
    ws.close();
    return;
  }
  
  // Перевірка, чи доступний httpsAgent
  if (!httpsAgent) {
    console.error('WebSocket connection attempt, but proxy agent is not initialized');
    ws.send(JSON.stringify({
      error: 'Proxy agent not initialized',
      message: 'Please restart the server'
    }));
    ws.close();
    return;
  }
  
  const kahootPath = request.url.replace('/kahoot-ws', '');
  const kahootWsUrl = `wss://kahoot.it${kahootPath}`;
  
  console.log(`WebSocket connection established, proxying to: ${kahootWsUrl}`);
  
  try {
    // Створення WebSocket з'єднання до Kahoot
    const kahootWs = new WebSocket(kahootWsUrl, {
      agent: httpsAgent
    });
    
    // Передача повідомлень від клієнта до Kahoot
    ws.on('message', (message) => {
      try {
        if (kahootWs.readyState === WebSocket.OPEN) {
          // Логування повідомлень для діагностики (можна вимкнути в продакшн)
          // Якщо повідомлення надто велике, логуємо лише початок
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
          // Логування повідомлень
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
      kahootWs.close();
    });
    
    kahootWs.on('close', (code, reason) => {
      console.log(`Kahoot WebSocket closed. Code: ${code}, Reason: ${reason || 'None'}`);
      ws.close();
    });
    
    // Обробка помилок
    ws.on('error', (error) => {
      console.error('Client WebSocket error:', error);
    });
    
    kahootWs.on('error', (error) => {
      console.error('Kahoot WebSocket error:', error);
      try {
        ws.send(JSON.stringify({
          error: 'Kahoot connection error',
          message: error.message
        }));
      } catch (e) {
        console.error('Error sending error message to client:', e);
      }
      ws.close();
    });
  } catch (error) {
    console.error('Error creating WebSocket connection to Kahoot:', error);
    try {
      ws.send(JSON.stringify({
        error: 'WebSocket Error',
        message: error.message
      }));
    } catch (e) {
      console.error('Error sending error message to client:', e);
    }
    ws.close();
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