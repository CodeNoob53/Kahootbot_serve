// utils/cookiesTemplate.js
const { v4: uuidv4 } = require('uuid');

function generateCookies() {
  const uuid = uuidv4();
  const deviceId = uuid.replace(/-/g, '');
  const now = new Date();
  const iso = now.toISOString();

  const locale = encodeURIComponent(
    now.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: '2-digit',
      year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZoneName: 'short'
    })
  );

  const consentId = uuidv4();

  return [
    `generated_uuid=${uuid}`,
    `deviceId=${deviceId}`,
    `OptanonAlertBoxClosed=${iso}`,
    `OptanonConsent=isGpcEnabled=0&datestamp=${locale}&version=202411.1.0&browserGpcFlag=0&isIABGlobal=false&hosts=&consentId=${consentId}&interactionCount=1&isAnonUser=1&landingPath=NotLandingPage&groups=C0001%3A1%2CC0002%3A0%2CC0003%3A0%2CC0004%3A0&intType=3`,
    `AWSALB=${Math.random().toString(36).substring(2, 12)}`,
    `AWSALBCORS=${Math.random().toString(36).substring(2, 12)}`,
    `session-id=${Math.random().toString(36).substring(2, 12)}`,
    `player=true`
  ];
}

module.exports = generateCookies;
