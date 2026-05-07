const config = require('../config');
const { showMenu, startQuiz, processAnswer, clearSession } = require('../services/quizService');
const { logQuizStarted, logQuizFinished, logLink, logError } = require('../services/loggerService');

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
