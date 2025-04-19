const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { HttpsProxyAgent } = require('https-proxy-agent');
const WebSocket = require('ws');
const https = require('https');
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
  origin: '*',
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
    console.log('Проксі не налаштовано. Підключення буде виконано без проксі.');
    return null;
  }
  
  const authStr = PROXY_CONFIG.auth.username && PROXY_CONFIG.auth.password 
    ? `${PROXY_CONFIG.auth.username}:${PROXY_CONFIG.auth.password}`
    : '';
  
  console.log(`Creating HttpsProxyAgent with host: ${PROXY_CONFIG.host}, port: ${PROXY_CONFIG.port}, auth: ${authStr || 'none'}`);
  
  const proxyOptions = {
    host: PROXY_CONFIG.host,
    port: PROXY_CONFIG.port,
    auth: authStr || undefined,
    headers: authStr ? {
      'Proxy-Authorization': `Basic ${Buffer.from(authStr).toString('base64')}`
    } : {}
  };
  
  return new HttpsProxyAgent(proxyOptions);
}

// Ініціалізація HTTPS агента для проксі
let httpsAgent = createProxyAgent();

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
    httpsAgent = createProxyAgent();
    
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
  } catch (error) {
    console.error('Помилка оновлення налаштувань проксі:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Помилка оновлення налаштувань проксі' 
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

// Кінцева точка для перевірки роботи проксі
app.get('/test-proxy', async (req, res) => {
  console.log('Тестування проксі...');
  
  if (!httpsAgent) {
    return res.status(503).json({
      success: false,
      message: 'Проксі не налаштовано'
    });
  }
  
  try {
    const testUrl = 'https://example.com';
    const response = await new Promise((resolve, reject) => {
      const testReq = https.request(testUrl, { agent: httpsAgent }, (resp) => {
        let data = '';
        resp.on('data', (chunk) => { data += chunk; });
        resp.on('end', () => {
          resolve({
            statusCode: resp.statusCode,
            headers: resp.headers,
            body: data
          });
        });
      });
      
      testReq.on('error', (err) => reject(err));
      testReq.end();
    });
    
    if (response.statusCode === 407) {
      return res.status(503).json({
        success: false,
        message: 'Проксі вимагає автентифікації. Перевірте ім\'я користувача та пароль.',
        testResponse: {
          statusCode: response.statusCode,
          isSuccess: false
        }
      });
    }
    
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return res.status(200).json({
        success: true,
        message: 'Проксі працює',
        testResponse: {
          statusCode: response.statusCode,
          isSuccess: true
        }
      });
    }
    
    return res.status(503).json({
      success: false,
      message: `Проксі повернув помилку: ${response.statusCode}`,
      testResponse: {
        statusCode: response.statusCode,
        isSuccess: false
      }
    });
  } catch (error) {
    console.error('Помилка тестування проксі:', error.message);
    return res.status(500).json({
      success: false,
      message: `Помилка тестування проксі: ${error.message}`,
      testResponse: {
        statusCode: null,
        isSuccess: false
      }
    });
  }
});

// Налаштування проксі для запитів до Kahoot API
app.use('/kahoot-api', (req, res, next) => {
  if (!PROXY_CONFIG.host || !PROXY_CONFIG.port) {
    return res.status(503).json({ 
      error: 'Service Unavailable', 
      message: 'Проксі не налаштовано. Будь ласка, спочатку налаштуйте проксі через API /set-proxy' 
    });
  }
  
  const proxyMiddleware = createProxyMiddleware({
    target: 'https://kahoot.it',
    changeOrigin: true,
    pathRewrite: {
      '^/kahoot-api': ''
    },
    agent: httpsAgent,
    onProxyReq: (proxyReq, req) => {
      console.log(`Proxying request: ${req.method} ${req.url}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      console.log(`Proxy response: ${proxyRes.statusCode} ${JSON.stringify(proxyRes.headers)}`);
      let data = '';
      proxyRes.on('data', (chunk) => { data += chunk; });
      proxyRes.on('end', () => {
        console.log(`Proxy response body: ${data}`);
      });
      proxyRes.headers['Access-Control-Allow-Origin'] = '*';
      proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization';
    },
    onError: (err, req, res) => {
      console.error(`Proxy error: ${err.message}`);
      res.status(500).json({ error: 'Proxy Error', message: err.message });
    }
  });
  
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
    
    console.log(`Отримання токену сесії для PIN: ${pin}`);
    
    const kahootUrl = `https://kahoot.it/reserve/session/${pin}/`;
    
    const response = await new Promise((resolve, reject) => {
      const req = https.request(kahootUrl, {
        method: 'GET',
        agent: httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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
              reject(new Error(`Неможливо розібрати відповідь: ${e.message}`));
            }
          } else {
            reject(new Error(`HTTP помилка: ${resp.statusCode} ${resp.statusMessage}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.end();
    });
    
    console.log(`Отримано токен сесії для PIN ${pin}`);
    
    return res.json(response);
  } catch (error) {
    console.error(`Помилка отримання токену сесії: ${error.message}`);
    return res.status(500).json({
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
    timestamp: new Date().toISOString()
  });
});

// Маршрут для моніторингу здоров'я сервера
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
  
  const kahootPath = request.url.replace('/kahoot-ws', '');
  const kahootWsUrl = `wss://kahoot.it${kahootPath}`;
  
  console.log(`WebSocket connection established, proxying to: ${kahootWsUrl}`);
  
  const kahootWs = new WebSocket(kahootWsUrl, {
    agent: httpsAgent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  
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
  
  ws.on('close', (code, reason) => {
    console.log(`Client WebSocket closed. Code: ${code}, Reason: ${reason || 'None'}`);
    kahootWs.close();
  });
  
  kahootWs.on('close', (code, reason) => {
    console.log(`Kahoot WebSocket closed. Code: ${code}, Reason: ${reason || 'None'}`);
    ws.close();
  });
  
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