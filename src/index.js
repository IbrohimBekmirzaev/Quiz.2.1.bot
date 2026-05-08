const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const { handleMessage } = require('./handlers/messageHandler');
const { handleCallback } = require('./handlers/callbackHandler');
const { logError } = require('./services/loggerService');
const { processPollAnswer } = require('./services/quizService');

const bot = new TelegramBot(config.botToken, { polling: true });
let pollingRestartTimer = null;
let restartingPolling = false;
let healthServer = null;

function isPollingConflict(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('terminated by other getupdates request') || message.includes('409 conflict');
}

async function safeLogError(error, context) {
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

function startHealthServer() {
  const port = Number(process.env.PORT || 0);
  if (!port) return;

  healthServer = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        service: 'qalb-ul-arabiyya-quiz-bot',
        uptime: Math.round(process.uptime())
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
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
    await processPollAnswer(bot, answer);
  } catch (error) {
    await safeLogError(error, {
      place: 'poll_answer',
      userId: answer?.user?.id,
      pollId: answer?.poll_id
    });
  }
});

bot.on('polling_error', async (error) => {
  await safeLogError(error, { place: 'polling_error' });

  if (isPollingConflict(error)) {
    console.warn('Polling conflict aniqlandi. 5 soniyadan keyin qayta uriniladi.');
    await restartPolling();
  }
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

console.log(`${config.botName} ishga tushdi.`);
