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
    
    // Виконуємо запит до Kahoot через проксі
    const https = require('https');
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
        resp.on('data', (chunk) => {
          data += chunk;
        });
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
  
  const kahootPath = request.url.replace('/kahoot-ws', '');
  const kahootWsUrl = `wss://kahoot.it${kahootPath}`;
  
  console.log(`WebSocket connection established, proxying to: ${kahootWsUrl}`);
  
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