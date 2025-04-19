const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const httpProxy = require('http-proxy');
const cors = require('cors');
const bodyParser = require('body-parser');
const url = require('url');

const app = express();
const server = http.createServer(app);
const proxy = httpProxy.createProxyServer({});

// Конфігурація проксі
let proxyConfig = {
  host: '',
  port: '',
  username: '',
  password: ''
};

// Налаштування CORS
app.use(cors({
  origin: '*', // Дозволяємо запити з будь-якого джерела
  methods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Парсинг JSON тіла запитів
app.use(bodyParser.json());

// Перевірка стану сервера
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Proxy server is running',
    proxyConfig: {
      host: proxyConfig.host,
      port: proxyConfig.port,
      hasCredentials: !!proxyConfig.username
    }
  });
});

// Ендпоінт для встановлення конфігурації проксі
app.post('/set-proxy', (req, res) => {
  const { host, port, username, password } = req.body;

  if (!host || !port) {
    return res.status(400).json({
      success: false,
      message: 'Host and port are required'
    });
  }

  proxyConfig = {
    host,
    port,
    username: username || '',
    password: password || ''
  };

  res.json({
    success: true,
    message: 'Proxy configuration updated',
    config: {
      host,
      port,
      hasCredentials: !!username
    }
  });
});

// Ендпоінт для перевірки проксі
app.get('/test-proxy', (req, res) => {
  const testUrl = 'https://kahoot.it/';
  
  const proxyOptions = {
    target: testUrl,
    changeOrigin: true,
    followRedirects: true
  };

  if (proxyConfig.host && proxyConfig.port) {
    proxyOptions.proxy = {
      host: proxyConfig.host,
      port: parseInt(proxyConfig.port, 10),
      proxyAuth: proxyConfig.username && proxyConfig.password
        ? `${proxyConfig.username}:${proxyConfig.password}`
        : undefined
    };
  }

  proxy.web(req, res, proxyOptions, (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: `Proxy test failed: ${err.message}`
      });
    }
  });
});

// Проксі для Kahoot API
app.all('/kahoot-api/*', (req, res) => {
  const targetPath = req.url.replace('/kahoot-api', '');
  const targetUrl = `https://kahoot.it${targetPath}`;
  
  const proxyOptions = {
    target: targetUrl,
    changeOrigin: true,
    followRedirects: true
  };

  if (proxyConfig.host && proxyConfig.port) {
    proxyOptions.proxy = {
      host: proxyConfig.host,
      port: parseInt(proxyConfig.port, 10),
      proxyAuth: proxyConfig.username && proxyConfig.password
        ? `${proxyConfig.username}:${proxyConfig.password}`
        : undefined
    };
  }

  proxy.web(req, res, proxyOptions, (err) => {
    if (err) {
      res.status(500).json({
        success: false,
        message: `Kahoot API proxy error: ${err.message}`
      });
    }
  });
});

// Проксі для пошукових API (Google Custom Search, DuckDuckGo)
app.all('/search-api/*', (req, res) => {
  const targetPath = req.url.replace('/search-api', '');
  let targetUrl;

  if (targetPath.includes('customsearch')) {
    targetUrl = `https://www.googleapis.com${targetPath}`;
  } else if (targetPath.includes('duckduckgo')) {
    targetUrl = `https://api.duckduckgo.com${targetPath}`;
  } else {
    return res.status(400).json({
      success: false,
      message: 'Invalid search API endpoint'
    });
  }

  const proxyOptions = {
    target: targetUrl,
    changeOrigin: true,
    followRedirects: true
  };

  if (proxyConfig.host && proxyConfig.port) {
    proxyOptions.proxy = {
      host: proxyConfig.host,
      port: parseInt(proxyConfig.port, 10),
      proxyAuth: proxyConfig.username && proxyConfig.password
        ? `${proxyConfig.username}:${proxyConfig.password}`
        : undefined
    };
  }

  proxy.web(req, res, proxyOptions, (err) => {
    if (err) {
      res.status(500).json({
        success: false,
        message: `Search API proxy error: ${err.message}`
      });
    }
  });
});

// WebSocket проксі для Kahoot WebSocket
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const parsedUrl = url.parse(req.url);
  const kahootWsPath = parsedUrl.pathname.replace('/kahoot-ws', '');
  const targetWsUrl = `wss://kahoot.it${kahootWsPath}${parsedUrl.search || ''}`;

  const proxyWsOptions = {
    changeOrigin: true
  };

  if (proxyConfig.host && proxyConfig.port) {
    proxyWsOptions.proxy = {
      host: proxyConfig.host,
      port: parseInt(proxyConfig.port, 10),
      proxyAuth: proxyConfig.username && proxyConfig.password
        ? `${proxyConfig.username}:${proxyConfig.password}`
        : undefined
    };
  }

  const kahootWs = new WebSocket(targetWsUrl, [], proxyWsOptions);

  kahootWs.on('open', () => {
    console.log('Connected to Kahoot WebSocket');
  });

  kahootWs.on('message', (data) => {
    try {
      ws.send(data);
    } catch (err) {
      console.error('Error forwarding WebSocket message:', err);
    }
  });

  kahootWs.on('error', (err) => {
    console.error('Kahoot WebSocket error:', err);
    ws.close();
  });

  kahootWs.on('close', () => {
    console.log('Kahoot WebSocket closed');
    ws.close();
  });

  ws.on('message', (data) => {
    try {
      kahootWs.send(data);
    } catch (err) {
      console.error('Error forwarding client message:', err);
    }
  });

  ws.on('close', () => {
    kahootWs.close();
  });

  ws.on('error', (err) => {
    console.error('Client WebSocket error:', err);
    kahootWs.close();
  });
});

// Обробка помилок проксі
proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err);
  if (res.write) {
    res.write(500, {
      success: false,
      message: `Proxy error: ${err.message}`
    });
  } else {
    res.status(500).json({
      success: false,
      message: `Proxy error: ${err.message}`
    });
  }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});