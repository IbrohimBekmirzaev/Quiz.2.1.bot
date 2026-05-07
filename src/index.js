const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const { handleMessage } = require('./handlers/messageHandler');
const { handleCallback } = require('./handlers/callbackHandler');
const { logError } = require('./services/loggerService');

const bot = new TelegramBot(config.botToken, { polling: true });

bot.on('message', async (msg) => {
  await handleMessage(bot, msg);
});

bot.on('callback_query', async (query) => {
  await handleCallback(bot, query);
});

bot.on('polling_error', async (error) => {
  await logError(bot, error, { place: 'polling_error' });
});

process.on('unhandledRejection', async (error) => {
  await logError(bot, error, { place: 'unhandledRejection' });
});

process.on('uncaughtException', async (error) => {
  await logError(bot, error, { place: 'uncaughtException' });
});

console.log(`${config.botName} ishga tushdi.`);
