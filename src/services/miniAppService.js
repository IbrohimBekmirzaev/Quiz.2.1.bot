const { getVocabularyList } = require('./vocabularyService');
const { getTests } = require('./quizService');
const { pickQuestions } = require('./vocabularyService');
const {
  registerMiniAppOpen,
  saveProfileSettings,
  createQuizSession,
  getQuizSession,
  finishQuizSession,
  recordQuizAttempt,
  getLeaderboard,
  getProfileView
} = require('../storage/miniAppStore');

function normalizeTelegramUser(payload = {}) {
  const id = String(payload.id || '');
  if (!id) {
    throw new Error('Telegram user topilmadi.');
  }

  return {
    id,
    first_name: payload.first_name || payload.firstName || 'Foydalanuvchi',
    last_name: payload.last_name || payload.lastName || '',
    username: payload.username || ''
  };
}

async function getMiniAppBootPayload(userPayload) {
  const user = normalizeTelegramUser(userPayload);
  registerMiniAppOpen(user);
  const tests = await getTests();
  return {
    user: getProfileView(user),
    tests: tests.map((test) => ({
      id: test.id,
      name: test.name,
      questionCount: test.items.length
    })),
    leaderboard: getLeaderboard()
  };
}

async function startMiniAppQuiz(userPayload, testIndex) {
  const user = normalizeTelegramUser(userPayload);
  const tests = await getTests();
  const allItems = await getVocabularyList();
  const test = tests.find((item) => item.id === Number(testIndex));

  if (!test) {
    throw new Error('Test topilmadi.');
  }

  const questions = pickQuestions(test.items, allItems, test.items.length).slice(0, 10);
  const quizId = createQuizSession(user, test, questions);

  return {
    quizId,
    test: {
      id: test.id,
      name: test.name
    },
    questions: questions.map((question, index) => ({
      index,
      arabic: question.arabic,
      options: question.options
    }))
  };
}

function finishMiniAppQuiz(userPayload, payload = {}) {
  const user = normalizeTelegramUser(userPayload);
  const quizId = String(payload.quizId || '');
  const answers = Array.isArray(payload.answers) ? payload.answers : [];

  if (!quizId) {
    throw new Error('Quiz session topilmadi.');
  }

  const session = getQuizSession(quizId);
  if (!session) {
    throw new Error('Quiz session eskirgan yoki topilmadi.');
  }

  if (String(session.userId) !== String(user.id)) {
    throw new Error('Bu session boshqa foydalanuvchiga tegishli.');
  }

  let correct = 0;
  let wrong = 0;
  session.questions.forEach((question, index) => {
    const selectedIndex = Number(answers[index]);
    if (selectedIndex === question.correctIndex) correct += 1;
    else wrong += 1;
  });

  const total = correct + wrong;
  const percent = total ? Math.round((correct / total) * 100) : 0;

  recordQuizAttempt(user, {
    testIndex: session.testIndex,
    testName: session.testName,
    correct,
    wrong,
    percent
  });
  finishQuizSession(quizId);

  return {
    testIndex: session.testIndex,
    testName: session.testName,
    correct,
    wrong,
    percent,
    profile: getProfileView(user),
    leaderboard: getLeaderboard()
  };
}

function updateMiniAppProfile(userPayload, profilePayload) {
  const user = normalizeTelegramUser(userPayload);
  saveProfileSettings(user, profilePayload);
  return getProfileView(user);
}

module.exports = {
  normalizeTelegramUser,
  getMiniAppBootPayload,
  startMiniAppQuiz,
  finishMiniAppQuiz,
  updateMiniAppProfile
};
