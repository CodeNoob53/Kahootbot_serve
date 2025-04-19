# Kahoot Bot Proxy Server

Цей скрипт `render-server.js` створює проксі-сервер для обходу обмежень CORS при роботі з Kahoot API. Розроблений спеціально для розгортання на платформі Render.com.

## Опис

Проксі-сервер дозволяє:
- Обходити CORS обмеження Kahoot API
- Проксіювати HTTP запити до Kahoot
- Проксіювати WebSocket з'єднання для інтерактивної взаємодії з іграми Kahoot
- Динамічно налаштовувати проксі через API

## Встановлення

1. Завантажте файл `render-server.js` до вашого GitHub репозиторію
2. Створіть новий Web Service на Render.com
3. Підключіть ваш GitHub репозиторій
4. Використовуйте наступні налаштування:
   - Build Command: `npm install`
   - Start Command: `node render-server.js`

## Залежності

Скрипт автоматично створює `package.json` з усіма необхідними залежностями:
- express
- cors
- http-proxy-middleware
- https-proxy-agent
- ws
- dotenv

## API

### Перевірка статусу
`GET /`

### Налаштування проксі
```
POST /set-proxy
Content-Type: application/json

{
  "host": "IP-адреса",
  "port": "Порт",
  "username": "Логін (опціонально)",
  "password": "Пароль (опціонально)"
}
```

### Інформація про проксі
`GET /proxy-info`

### Тестування проксі
`GET /test-proxy`

### Отримання токену сесії Kahoot
`GET /kahoot-api/reserve/session/:pin`

### WebSocket підключення
`WebSocket: /kahoot-ws/cometd/:pin/:token`

## Примітки щодо безпеки

- Дані для проксі надаються через клієнтську частину
- Проксі-дані зберігаються в пам'яті сервера і не зберігаються постійно
- Для тестового використання можна встановити стандартні значення проксі через змінні середовища

## Використання змінних середовища (опціонально)

Ви можете встановити стандартні налаштування проксі за допомогою змінних середовища:
- `PROXY_HOST`
- `PROXY_PORT`
- `PROXY_USERNAME`
- `PROXY_PASSWORD`

## Ліцензія

MIT
