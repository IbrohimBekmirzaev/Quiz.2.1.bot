const config = require('../config');
const sessionStore = require('../storage/sessionStore');
const { getVocabularyList, getLessonTests, groupIntoTests, pickQuestions } = require('./vocabularyService');
const { buildMenuKeyboard } = require('./menuService');

async function getTests() {
  const all = await getVocabularyList();
  const lessonTests = await getLessonTests();
  return lessonTests.length ? lessonTests : groupIntoTests(all, config.questionsPerTest);
}

async function removePreviousQuestion(bot, chatId, currentMessageId) {
  const existingSession = sessionStore.get(chatId);
  if (!existingSession?.questionMessageId) return;
  if (existingSession.questionMessageId === currentMessageId) return;

  try {
    await bot.deleteMessage(chatId, existingSession.questionMessageId);
  } catch (_) {}
}

async function showMenu(bot, chatId, page = 1, editMessage) {
  const tests = await getTests();
  const text = '📚 Marhamat, testni tanlang:';
  const reply_markup = buildMenuKeyboard(tests, page);

  if (editMessage) {
    return bot.editMessageText(text, {
      chat_id: chatId,
      message_id: editMessage.message_id,
      reply_markup
    });
  }

  return bot.sendMessage(chatId, text, { reply_markup });
}

async function startQuiz(bot, msg, testIndex) {
  const tests = await getTests();
  const all = await getVocabularyList();
  const test = tests[testIndex - 1];
  if (!test) {
    throw new Error('Test topilmadi.');
  }

  await removePreviousQuestion(bot, msg.chat.id, msg.message_id);

  const questions = pickQuestions(test.items, all, config.questionsPerTest);
  const session = {
    testIndex,
    testName: test.name,
    questions,
    current: 0,
    correct: 0,
    wrong: 0,
    questionMessageId: null,
    menuMessageId: msg.message_id
  };
  sessionStore.set(msg.chat.id, session);
  await sendCurrentQuestion(bot, msg.chat.id);
  return session;
}

async function sendCurrentQuestion(bot, chatId) {
  const session = sessionStore.get(chatId);
  if (!session) return null;

  if (session.current >= session.questions.length) {
    return finishQuiz(bot, chatId);
  }

  const q = session.questions[session.current];
  const text = `${q.arabic} (${session.current + 1}/${session.questions.length})`;
  const reply_markup = {
    inline_keyboard: q.options.map((option, index) => ([{
      text: option,
      callback_data: `ANSWER_${session.current}_${index}`
    }]))
  };

  if (session.questionMessageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: session.questionMessageId,
      reply_markup
    });
    return session.questionMessageId;
  }

  const sent = await bot.sendMessage(chatId, text, { reply_markup });
  session.questionMessageId = sent.message_id;
  sessionStore.set(chatId, session);
  return sent.message_id;
}

async function processAnswer(bot, msg, questionIndex, selectedIndex) {
  const session = sessionStore.get(msg.chat.id);
  if (!session) return null;
  if (questionIndex !== session.current) return null;

  const q = session.questions[questionIndex];
  if (!q) return null;

  if (selectedIndex === q.correctIndex) session.correct += 1;
  else session.wrong += 1;

  session.current += 1;
  sessionStore.set(msg.chat.id, session);
  return sendCurrentQuestion(bot, msg.chat.id);
}

async function finishQuiz(bot, chatId) {
  const session = sessionStore.get(chatId);
  if (!session) return null;

  const total = session.correct + session.wrong;
  const percent = total ? Math.round((session.correct / total) * 100) : 0;
  const text = [
    '📊 Test yakunlandi',
    `✅ To'g'ri: ${session.correct}`,
    `❌ Xato: ${session.wrong}`,
    `📈 Foiz: ${percent}%`
  ].join('\n');

  const reply_markup = {
    inline_keyboard: [
      [
        { text: 'Qayta ♻️', callback_data: `TEST_${session.testIndex}` },
        { text: 'Start 🟢', callback_data: 'BACK_TO_MENU' }
      ]
    ]
  };

  if (session.questionMessageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: session.questionMessageId,
      reply_markup
    });
  } else {
    const sent = await bot.sendMessage(chatId, text, { reply_markup });
    session.questionMessageId = sent.message_id;
  }

  return {
    correct: session.correct,
    wrong: session.wrong,
    testName: session.testName
  };
}

function clearSession(chatId) {
  sessionStore.remove(chatId);
}

module.exports = {
  showMenu,
  startQuiz,
  processAnswer,
  clearSession,
  finishQuiz
};
