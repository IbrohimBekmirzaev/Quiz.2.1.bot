const config = require('../config');
const { showMenu, startQuiz, processAnswer, clearSession } = require('../services/quizService');
const { logQuizStarted, logQuizFinished, logLink, logError } = require('../services/loggerService');
const {
  isAdminUserId,
  buildAdminCallbackResponse
} = require('../services/adminPanelService');
const {
  getPendingBroadcast,
  clearPendingBroadcast,
  sendBroadcastPayload
} = require('../services/broadcastService');

async function safeAnswer(bot, id) {
  try {
    await bot.answerCallbackQuery(id);
  } catch (_) {}
}

async function handleCallback(bot, query) {
  const msg = query.message;
  const data = query.data || '';
  const virtualMsg = { ...msg, from: query.from };

  try {
    await safeAnswer(bot, query.id);

    if (data.startsWith('ADMIN_')) {
      if (!isAdminUserId(query.from?.id)) {
        await bot.sendMessage(msg.chat.id, 'Bu bo‘lim faqat admin uchun.');
        return;
      }

      if (data === 'ADMIN_CONFIRM_BROADCAST') {
        const pending = getPendingBroadcast();
        if (!pending) {
          await bot.sendMessage(msg.chat.id, 'Tasdiqlanadigan broadcast yo‘q.');
          return;
        }

        const result = await sendBroadcastPayload(bot, pending.payload);
        clearPendingBroadcast();
        await bot.editMessageText([
          '✅ Broadcast yuborildi',
          `• Jami: ${result.total}`,
          `• Yuborildi: ${result.sent}`,
          `• Xato: ${result.failed}`
        ].join('\n'), {
          chat_id: msg.chat.id,
          message_id: msg.message_id
        });
        return;
      }

      if (data === 'ADMIN_CANCEL_BROADCAST') {
        clearPendingBroadcast();
        await bot.editMessageText('❌ Broadcast bekor qilindi.', {
          chat_id: msg.chat.id,
          message_id: msg.message_id
        });
        return;
      }

      const response = await buildAdminCallbackResponse(data);
      try {
        await bot.editMessageText(response.text, {
          chat_id: msg.chat.id,
          message_id: msg.message_id,
          reply_markup: response.markup,
          disable_web_page_preview: true
        });
      } catch (_) {
        await bot.sendMessage(msg.chat.id, response.text, {
          reply_markup: response.markup,
          disable_web_page_preview: true
        });
      }
      return;
    }

    if (data.startsWith('PAGE_')) {
      const page = Number(data.split('_')[1]);
      await showMenu(bot, msg.chat.id, page, msg);
      return;
    }

    if (data.startsWith('TEST_')) {
      const testIndex = Number(data.split('_')[1]);
      const session = await startQuiz(bot, virtualMsg, testIndex);
      await logQuizStarted(bot, virtualMsg, session?.testName || `${testIndex}-daraja`);
      return;
    }

    if (data.startsWith('ANSWER_')) {
      const [, qIndex, selectedIndex] = data.split('_');
      const result = await processAnswer(bot, virtualMsg, Number(qIndex), Number(selectedIndex));
      if (result && result.correct !== undefined) {
        await logQuizFinished(bot, virtualMsg, result.testName, result.correct, result.wrong);
      }
      return;
    }

    if (data === 'MINI_APP_LINK') {
      await bot.sendMessage(msg.chat.id, `Mini App linki:\n${config.miniAppUrl}`);
      await logLink(bot, virtualMsg, 'Mini App', config.miniAppUrl);
      return;
    }

    if (data === 'BACK_TO_MENU') {
      clearSession(msg.chat.id);
      await showMenu(bot, msg.chat.id, 1, msg);
    }
  } catch (error) {
    await logError(bot, error, {
      place: 'handleCallback',
      userId: query?.from?.id,
      chatId: msg?.chat?.id,
      callback: data
    });
    if (msg?.chat?.id) {
      await bot.sendMessage(msg.chat.id, 'Xatolik yuz berdi.');
    }
  }
}

module.exports = { handleCallback };
