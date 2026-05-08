const config = require('../config');
const { showMenu, clearSession } = require('../services/quizService');
const { logStart, forwardUserSupport, logError } = require('../services/loggerService');
const { handleAdminReply } = require('./adminReplyHandler');

async function handleMessage(bot, msg) {
  try {
    if (config.adminGroupIds.includes(String(msg.chat.id))) {
      await handleAdminReply(bot, msg);
      return;
    }

    const text = (msg.text || '').trim();

    if (text === '/start') {
      clearSession(msg.chat.id);
      await logStart(bot, msg);
      await showMenu(bot, msg.chat.id, 1);
      return;
    }

    if (text === '/menu') {
      clearSession(msg.chat.id);
      await showMenu(bot, msg.chat.id, 1);
      return;
    }

    if (text === '/help') {
      await bot.sendMessage(msg.chat.id, 'Yordam uchun xabar yozishingiz mumkin. Xabaringiz adminga yuboriladi.');
      return;
    }

    if (text === '/random') {
      await bot.sendMessage(msg.chat.id, 'Darajalar endi darslar bo\'yicha tartiblangan. /menu ni bosing.');
      return;
    }

    if (msg.text || msg.photo || msg.video || msg.audio || msg.voice || msg.document || msg.sticker) {
      await forwardUserSupport(bot, msg);
    }
  } catch (error) {
    await logError(bot, error, {
      place: 'handleMessage',
      userId: msg?.from?.id,
      chatId: msg?.chat?.id
    });
    if (msg?.chat?.id) {
      await bot.sendMessage(msg.chat.id, 'Xatolik yuz berdi. Keyinroq yana urinib ko\'ring.');
    }
  }
}

module.exports = { handleMessage };
