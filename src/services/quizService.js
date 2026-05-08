const config = require('../config');
const sessionStore = require('../storage/sessionStore');
const { getVocabularyList, getLessonTests, groupIntoTests, pickQuestions } = require('./vocabularyService');
const { buildMenuKeyboard } = require('./menuService');
const { buildPollQuestion, gradeAnswer, getNextTestIndex } = require('../utils/quiz');

async function getTests() {
  const all = await getVocabularyList();
  const lessonTests = await getLessonTests();
  return lessonTests.length ? lessonTests : groupIntoTests(all, config.questionsPerTest);
}

async function getTotalTestsCount() {
  const tests = await getTests();
  return tests.length;
}

async function removePreviousQuestion(bot, chatId, currentMessageId) {
  const existingSession = sessionStore.get(chatId);
  if (!existingSession) return;

  const messageIds = new Set([
    ...(existingSession.pollMessageIds || []),
    existingSession.questionMessageId,
    existingSession.resultMessageId
  ].filter(Boolean));

  for (const messageId of messageIds) {
    if (messageId === currentMessageId) continue;
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (_) {}
  }

  if (existingSession.currentPollId) {
    sessionStore.unlinkPoll(existingSession.currentPollId);
  }
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
    user: {
      firstName: msg.from?.first_name || 'Foydalanuvchi',
      username: msg.from?.username ? `@${msg.from.username}` : 'Username yo\'q',
      id: msg.from?.id || ''
    },
    questions,
    current: 0,
    correct: 0,
    wrong: 0,
    questionMessageId: null,
    currentPollId: null,
    pollMessageIds: [],
    resultMessageId: null,
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
  const sent = await bot.sendPoll(chatId, buildPollQuestion(q.arabic, session.current + 1, session.questions.length), q.options, {
    type: 'quiz',
    is_anonymous: false,
    correct_option_id: q.correctIndex
  });

  if (session.currentPollId) {
    sessionStore.unlinkPoll(session.currentPollId);
  }

  session.currentPollId = sent.poll.id;
  session.questionMessageId = sent.message_id;
  session.pollMessageIds = [...(session.pollMessageIds || []), sent.message_id];
  sessionStore.linkPoll(sent.poll.id, chatId);
  sessionStore.set(chatId, session);
  return sent.message_id;
}

async function processAnswer(bot, msg, questionIndex, selectedIndex) {
  const session = sessionStore.get(msg.chat.id);
  if (!session) return null;
  if (questionIndex !== session.current) return null;

  const q = session.questions[questionIndex];
  if (!q) return null;

  gradeAnswer(session, q.correctIndex, selectedIndex);
  sessionStore.set(msg.chat.id, session);
  return sendCurrentQuestion(bot, msg.chat.id);
}

async function processPollAnswer(bot, answer) {
  const selectedIndex = answer?.option_ids?.[0];
  if (selectedIndex === undefined) return null;

  const chatId = sessionStore.getChatIdByPoll(answer.poll_id);
  if (!chatId) return null;

  const session = sessionStore.get(chatId);
  if (!session || session.currentPollId !== answer.poll_id) {
    sessionStore.unlinkPoll(answer.poll_id);
    return null;
  }

  const q = session.questions[session.current];
  if (!q) {
    sessionStore.unlinkPoll(answer.poll_id);
    return null;
  }

  gradeAnswer(session, q.correctIndex, selectedIndex);
  const answeredPollMessageId = session.questionMessageId;
  sessionStore.unlinkPoll(answer.poll_id);
  session.currentPollId = null;
  session.questionMessageId = null;
  sessionStore.set(chatId, session);

  if (answeredPollMessageId) {
    try {
      await bot.deleteMessage(chatId, answeredPollMessageId);
    } catch (_) {}
  }

  const result = await sendCurrentQuestion(bot, chatId);
  if (result && result.correct !== undefined) {
    return {
      ...result,
      chatId
    };
  }

  return result;
}

async function finishQuiz(bot, chatId) {
  const session = sessionStore.get(chatId);
  if (!session) return null;

  const total = session.correct + session.wrong;
  const percent = total ? Math.round((session.correct / total) * 100) : 0;
  const text = [
    '📊 Test yakunlandi',
    `📚 ${session.testName}`,
    `✅ To'g'ri: ${session.correct}`,
    `❌ Xato: ${session.wrong}`,
    `📈 Foiz: ${percent}%`
  ].join('\n');

  const nextTestIndex = getNextTestIndex(session.testIndex, await getTotalTestsCount());
  const actionRow = [{ text: 'Qayta ♻️', callback_data: `TEST_${session.testIndex}` }];
  if (nextTestIndex) {
    actionRow.push({ text: 'Keyingi ▶️', callback_data: `TEST_${nextTestIndex}` });
  }
  actionRow.push({ text: 'Menyu 📚', callback_data: 'BACK_TO_MENU' });

  const reply_markup = {
    inline_keyboard: [actionRow]
  };

  if (session.questionMessageId) {
    const sent = await bot.sendMessage(chatId, text, { reply_markup });
    session.questionMessageId = null;
    session.resultMessageId = sent.message_id;
    sessionStore.set(chatId, session);
  } else {
    const sent = await bot.sendMessage(chatId, text, { reply_markup });
    session.questionMessageId = null;
    session.resultMessageId = sent.message_id;
    sessionStore.set(chatId, session);
  }

  return {
    correct: session.correct,
    wrong: session.wrong,
    testName: session.testName
  };
}

function clearSession(chatId) {
  const session = sessionStore.get(chatId);
  if (session?.currentPollId) {
    sessionStore.unlinkPoll(session.currentPollId);
  }
  sessionStore.remove(chatId);
}

module.exports = {
  showMenu,
  startQuiz,
  getTests,
  processAnswer,
  processPollAnswer,
  clearSession,
  finishQuiz
};
