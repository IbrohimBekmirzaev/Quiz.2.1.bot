const fs = require('fs');
const http = require('http');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const { handleMessage } = require('./handlers/messageHandler');
const { handleCallback } = require('./handlers/callbackHandler');
const { logError, logQuizFinished, logQuizStarted, logLink, sendTopicText } = require('./services/loggerService');
const { processPollAnswer } = require('./services/quizService');
const { getLessonTests } = require('./services/vocabularyService');
const {
  getMiniAppBootPayload,
  startMiniAppQuiz,
  startWeakWordsQuiz,
  startMistakeWordsQuiz,
  saveMiniAppQuizProgress,
  finishMiniAppQuiz,
  updateMiniAppProfile,
  normalizeTelegramUser
} = require('./services/miniAppService');
const { getReminderCandidates, markReminderSent } = require('./storage/miniAppStore');
const { formatDate } = require('./utils/time');

const bot = new TelegramBot(config.botToken, { polling: true });
let pollingRestartTimer = null;
let restartingPolling = false;
let healthServer = null;
let lastPollingConflictAt = 0;
let reminderTimer = null;
const publicDir = path.join(__dirname, '..', 'public', 'mini-app');

function isPollingConflict(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('terminated by other getupdates request') || message.includes('409 conflict');
}

function shouldSkipConflictLog(error) {
  if (!isPollingConflict(error)) return false;
  const now = Date.now();
  if (now - lastPollingConflictAt < 60_000) {
    return true;
  }
  lastPollingConflictAt = now;
  return false;
}

async function safeLogError(error, context) {
  if (shouldSkipConflictLog(error)) {
    console.warn('Polling conflict takrorlandi, log spam o‘tkazib yuborildi.');
    return;
  }

  try {
    await logError(bot, error, context);
  } catch (loggingError) {
    console.error('Xatoni log qilish ham muvaffaqiyatsiz tugadi:', loggingError.message);
  }
}

async function restartPolling() {
  if (restartingPolling) return;
  restartingPolling = true;

  try {
    await bot.stopPolling();
  } catch (error) {
    console.error('Pollingni to`xtatishda xato:', error.message);
  }

  pollingRestartTimer = setTimeout(async () => {
    try {
      await bot.startPolling();
      console.log('Polling qayta ishga tushirildi.');
    } catch (error) {
      await safeLogError(error, { place: 'polling_restart' });
    } finally {
      restartingPolling = false;
      pollingRestartTimer = null;
    }
  }, 5000);
}

async function warmupTests() {
  try {
    const tests = await getLessonTests();
    console.log(`Testlar yuklandi: ${tests.length} ta.`);
  } catch (error) {
    await safeLogError(error, { place: 'warmupTests' });
  }
}

async function setupTelegramBotUi() {
  try {
    await bot.setMyCommands([
      { command: 'start', description: 'Botni boshlash' },
      { command: 'quiz', description: 'Quiz testni boshlash' },
      { command: 'app', description: 'Mini Appni ochish' },
      { command: 'profile', description: 'Profil va natijalar' },
      { command: 'help', description: 'Yordam' }
    ]);

    if (config.miniAppWebAppUrl) {
      await bot.setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: 'Mini App',
          web_app: { url: config.miniAppWebAppUrl }
        }
      });
    }
  } catch (error) {
    await safeLogError(error, { place: 'setupTelegramBotUi' });
  }
}

async function logStartupHealth() {
  try {
    await sendTopicText(bot, 'start', [
      '🟢 Bot ishga tushdi',
      `🤖 ${config.botName}`,
      `🌐 Mini App: ${config.miniAppWebAppUrl || config.miniAppUrl}`,
      `🚦 Health: ${process.env.PORT ? `PORT ${process.env.PORT}` : 'local polling'}`,
      `🕒 ${formatDate()}`
    ].join('\n'));
  } catch (error) {
    console.error('Startup log yuborilmadi:', error.message);
  }
}

async function runReminderCycle() {
  const candidates = getReminderCandidates();
  for (const profile of candidates) {
    try {
      await bot.sendMessage(
        profile.id,
        `🔔 Bugungi challenge tayyor.\n\n🔥 Streak: ${profile.streakDays || 0} kun\n📚 Zaif so‘zlaringizni mustahkamlash ham mumkin.\n\nMini appga kirib davom eting.`
      );
      markReminderSent(profile.id);
    } catch (error) {
      console.error('Reminder yuborishda xato:', error.message);
    }
  }
}

function startReminderLoop() {
  if (reminderTimer) {
    clearInterval(reminderTimer);
  }

  reminderTimer = setInterval(() => {
    runReminderCycle().catch((error) => {
      console.error('Reminder cycle xatosi:', error.message);
    });
  }, 30 * 60 * 1000);
}

async function sendMiniAppSyncMessages(userId, notifications = {}) {
  if (!userId) return;
  const messages = [];

  if (notifications.streakIncreased && notifications.streakDays > 1) {
    messages.push(`🔥 Streak davom etyapti: ${notifications.streakDays} kun.`);
  }

  if (Array.isArray(notifications.unlockedBadges) && notifications.unlockedBadges.length) {
    messages.push(`🏅 Yangi badge: ${notifications.unlockedBadges.map((badge) => badge.label).join(', ')}`);
  }

  if (notifications.challengeCompleted) {
    messages.push('⚡ Daily challenge yakunlandi.');
  }

  if (notifications.challengeStreak && notifications.challengeStreak > 1) {
    messages.push(`🎯 Daily challenge streak: ${notifications.challengeStreak} kun.`);
  }

  if (notifications.rankImproved?.allTime) {
    messages.push('🚀 All-time reytingingiz yaxshilandi.');
  }

  if (notifications.rankImproved?.weekly) {
    messages.push('📈 Weekly reytingingiz yuqoriladi.');
  }

  if (notifications.newLevel?.name) {
    messages.push(`📈 Yangi daraja: ${notifications.newLevel.name}`);
  }

  for (const text of messages) {
    try {
      await bot.sendMessage(userId, text);
    } catch (error) {
      console.error('Mini app sync xabari yuborilmadi:', error.message);
    }
  }
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Body juda katta.'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        reject(new Error('JSON noto\'g\'ri formatda.'));
      }
    });
    req.on('error', reject);
  });
}

async function serveStaticFile(res, filePath) {
  const body = await fs.promises.readFile(filePath);
  res.writeHead(200, { 'Content-Type': getContentType(filePath) });
  res.end(body);
}

async function serveMiniAppAsset(res, assetPath) {
  const safePath = path.normalize(assetPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath)) {
    sendJson(res, 404, { ok: false, error: 'Fayl topilmadi' });
    return;
  }

  await serveStaticFile(res, filePath);
}

async function handleMiniAppApi(req, res, requestUrl) {
  if (req.method === 'GET' && requestUrl.pathname === '/api/mini-app/ping') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  const payload = await readJsonBody(req);
  const user = normalizeTelegramUser(payload.user || {});
  const virtualMsg = { from: user, chat: { id: user.id } };

  if (requestUrl.pathname === '/api/mini-app/bootstrap') {
    const data = await getMiniAppBootPayload(user);
    await logLink(bot, virtualMsg, 'Mini App ochildi', config.miniAppUrl, 'mini_app');
    await sendMiniAppSyncMessages(user.id, data.notifications);
    sendJson(res, 200, { ok: true, data });
    return;
  }

  if (requestUrl.pathname === '/api/mini-app/quiz/start') {
    const data = await startMiniAppQuiz(user, payload.testIndex, {
      isDailyChallenge: Boolean(payload.isDailyChallenge)
    });
    await logQuizStarted(bot, virtualMsg, data.test.name, 'mini_app');
    sendJson(res, 200, { ok: true, data });
    return;
  }

  if (requestUrl.pathname === '/api/mini-app/quiz/weak') {
    const data = await startWeakWordsQuiz(user);
    await logQuizStarted(bot, virtualMsg, data.test.name, 'mini_app');
    sendJson(res, 200, { ok: true, data });
    return;
  }

  if (requestUrl.pathname === '/api/mini-app/quiz/mistakes') {
    const data = await startMistakeWordsQuiz(user, payload.mistakes || []);
    await logQuizStarted(bot, virtualMsg, data.test.name, 'mini_app');
    sendJson(res, 200, { ok: true, data });
    return;
  }

  if (requestUrl.pathname === '/api/mini-app/quiz/progress') {
    const data = saveMiniAppQuizProgress(user, payload);
    sendJson(res, 200, { ok: true, data });
    return;
  }

  if (requestUrl.pathname === '/api/mini-app/quiz/finish') {
    const data = await finishMiniAppQuiz(user, payload);
    await logQuizFinished(bot, virtualMsg, data.testName, data.correct, data.wrong, 'mini_app');
    await sendMiniAppSyncMessages(user.id, data.notifications);
    sendJson(res, 200, { ok: true, data });
    return;
  }

  if (requestUrl.pathname === '/api/mini-app/profile') {
    const data = updateMiniAppProfile(user, payload.profile || {});
    await logLink(bot, virtualMsg, 'Mini App profil yangilandi', config.miniAppUrl, 'mini_app');
    sendJson(res, 200, { ok: true, data });
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Endpoint topilmadi' });
}

function startHealthServer() {
  const port = Number(process.env.PORT || 0);
  if (!port) return;

  healthServer = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);

      if (requestUrl.pathname.startsWith('/api/mini-app/')) {
        await handleMiniAppApi(req, res, requestUrl);
        return;
      }

      if (requestUrl.pathname === '/mini-app' || requestUrl.pathname === '/mini-app/') {
        await serveStaticFile(res, path.join(publicDir, 'index.html'));
        return;
      }

      if (requestUrl.pathname.startsWith('/mini-app/')) {
        await serveMiniAppAsset(res, requestUrl.pathname.replace('/mini-app/', ''));
        return;
      }

      if (requestUrl.pathname === '/health' || requestUrl.pathname === '/') {
        sendJson(res, 200, {
          ok: true,
          service: 'qalb-ul-arabiyya-quiz-bot',
          uptime: Math.round(process.uptime())
        });
        return;
      }

      sendJson(res, 404, { ok: false });
    } catch (error) {
      await safeLogError(error, { place: 'http_server' });
      sendJson(res, 500, { ok: false, error: 'Server xatosi' });
    }
  });

  healthServer.listen(port, () => {
    console.log(`Health server ${port}-portda ishga tushdi.`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} qabul qilindi. Bot to'xtatilmoqda...`);

  if (pollingRestartTimer) {
    clearTimeout(pollingRestartTimer);
    pollingRestartTimer = null;
  }

  try {
    await bot.stopPolling();
  } catch (error) {
    console.error('Pollingni yopishda xato:', error.message);
  }

  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }

  if (healthServer) {
    await new Promise((resolve) => healthServer.close(resolve));
  }

  process.exit(0);
}

bot.on('message', async (msg) => {
  await handleMessage(bot, msg);
});

bot.on('callback_query', async (query) => {
  await handleCallback(bot, query);
});

bot.on('poll_answer', async (answer) => {
  try {
    const result = await processPollAnswer(bot, answer);
    if (result && result.correct !== undefined) {
      await logQuizFinished(
        bot,
        { from: answer.user, chat: { id: result.chatId } },
        result.testName,
        result.correct,
        result.wrong
      );
    }
  } catch (error) {
    await safeLogError(error, {
      place: 'poll_answer',
      userId: answer?.user?.id,
      pollId: answer?.poll_id
    });
  }
});

bot.on('polling_error', async (error) => {
  if (isPollingConflict(error)) {
    console.warn('Polling conflict aniqlandi. 5 soniyadan keyin qayta uriniladi.');
    await safeLogError(error, { place: 'polling_error' });
    await restartPolling();
    return;
  }

  await safeLogError(error, { place: 'polling_error' });
});

process.on('unhandledRejection', async (error) => {
  await safeLogError(error, { place: 'unhandledRejection' });
});

process.on('uncaughtException', async (error) => {
  await safeLogError(error, { place: 'uncaughtException' });
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

startHealthServer();
console.log('Telegram polling yoqildi.');
warmupTests();
setupTelegramBotUi();
startReminderLoop();
logStartupHealth();

console.log(`${config.botName} ishga tushdi.`);
