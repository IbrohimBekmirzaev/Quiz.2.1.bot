const config = require('../config');
const { showMenu, clearSession } = require('../services/quizService');
const { buildMiniAppButtonRow } = require('../services/menuService');
const { logStart, forwardUserSupport, logError } = require('../services/loggerService');
const { buildAdminStatsText } = require('../services/adminService');
const { handleAdminReply } = require('./adminReplyHandler');

async function handleMessage(bot, msg) {
  try {
    const text = (msg.text || '').trim();

    if (config.adminGroupIds.includes(String(msg.chat.id))) {
      if (text === '/adminstats') {
        await bot.sendMessage(msg.chat.id, await buildAdminStatsText(), {
          message_thread_id: msg.message_thread_id
        });
        return;
      }

      await handleAdminReply(bot, msg);
      return;
    }

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
      await bot.sendMessage(msg.chat.id, [
        'ℹ️ Yordam',
        '',
        '• /start - botni ochadi',
        '• /app - mini appni ochadi',
        '• /menu - testlar menyusini qayta ochadi',
        '• Testni tanlang, arabcha so\'zni o\'qing va tarjimani belgilang',
        '• Savolga javob topolmasangiz, oddiy xabar yozing. U adminga yuboriladi'
      ].join('\n'), {
        reply_markup: {
          inline_keyboard: [[{ text: 'Menyu 📚', callback_data: 'BACK_TO_MENU' }]]
        }
      });
      return;
    }

    if (text === '/app') {
      await bot.sendMessage(
        msg.chat.id,
        'Mini appni ochish uchun pastdagi tugmani bosing:',
        {
          reply_markup: {
            inline_keyboard: [buildMiniAppButtonRow()]
          }
        }
      );
      return;
    }

    if (text === '/random') {
      clearSession(msg.chat.id);
      await showMenu(bot, msg.chat.id, 1);
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
