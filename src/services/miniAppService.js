const config = require('../config');
const { getVocabularyList, pickQuestions } = require('./vocabularyService');
const { getTests } = require('./quizService');
const {
  registerMiniAppOpen,
  saveProfileSettings,
  createQuizSession,
  updateQuizSessionProgress,
  getQuizSession,
  getActiveQuizForUser,
  finishQuizSession,
  recordQuizAttempt,
  getLeaderboard,
  getProfileView,
  getMiniAppAnalytics,
  dayKey
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

function sanitizeQuestion(question, index) {
  return {
    index,
    arabic: question.arabic,
    options: question.options,
    correctIndex: question.correctIndex,
    correctAnswer: question.correctAnswer
  };
}

function getDailyChallengeTest(tests) {
  if (!tests.length) return null;
  const key = dayKey().replaceAll('-', '');
  const seed = Number(key.slice(-4));
  const index = seed % tests.length;
  return tests[index];
}

function buildTestList(tests, dailyChallengeId) {
  return tests.map((test) => ({
    id: test.id,
    name: test.name,
    questionCount: test.items.length,
    isDailyChallenge: Number(test.id) === Number(dailyChallengeId)
  }));
}

function buildResumeQuiz(session) {
  if (!session) return null;
  return {
    quizId: session.quizId,
    test: {
      id: session.testIndex,
      name: session.testName,
      subtitle: session.isDailyChallenge ? 'Daily challenge' : 'So\'z boyligi testi'
    },
    currentIndex: Number(session.currentIndex || 0),
    startedAt: Date.parse(session.startedAt || session.createdAt || new Date().toISOString()),
    answers: Array.isArray(session.answers) ? session.answers : new Array(session.questions.length).fill(null),
    isDailyChallenge: Boolean(session.isDailyChallenge),
    questions: (session.questions || []).map((question, index) => sanitizeQuestion(question, index))
  };
}

function isAdminUser(user) {
  return config.adminUserIds.includes(String(user.id));
}

async function getMiniAppBootPayload(userPayload) {
  const user = normalizeTelegramUser(userPayload);
  registerMiniAppOpen(user);
  const tests = await getTests();
  const dailyChallenge = getDailyChallengeTest(tests);
  const activeQuiz = getActiveQuizForUser(user.id);
  return {
    user: getProfileView(user),
    tests: buildTestList(tests, dailyChallenge?.id),
    leaderboard: getLeaderboard(),
    dailyChallenge: dailyChallenge
      ? {
          id: dailyChallenge.id,
          name: dailyChallenge.name,
          questionCount: Math.min(dailyChallenge.items.length, config.questionsPerTest)
        }
      : null,
    activeQuiz: buildResumeQuiz(activeQuiz),
    analytics: isAdminUser(user) ? getMiniAppAnalytics() : null,
    duelEnabled: false
  };
}

async function createQuestionsForTest(test) {
  const allItems = await getVocabularyList();
  return pickQuestions(test.items, allItems, test.items.length)
    .slice(0, config.questionsPerTest)
    .map((question, index) => sanitizeQuestion(question, index));
}

async function startMiniAppQuiz(userPayload, testIndex, options = {}) {
  const user = normalizeTelegramUser(userPayload);
  const tests = await getTests();
  const test = tests.find((item) => item.id === Number(testIndex));

  if (!test) {
    throw new Error('Test topilmadi.');
  }

  const questions = await createQuestionsForTest(test);
  const quizId = createQuizSession(user, test, questions, {
    isDailyChallenge: Boolean(options.isDailyChallenge)
  });

  return {
    quizId,
    test: {
      id: test.id,
      name: test.name,
      subtitle: options.isDailyChallenge ? 'Daily challenge' : 'So\'z boyligi testi'
    },
    currentIndex: 0,
    answers: new Array(questions.length).fill(null),
    startedAt: Date.now(),
    isDailyChallenge: Boolean(options.isDailyChallenge),
    questions
  };
}

function saveMiniAppQuizProgress(userPayload, payload = {}) {
  const user = normalizeTelegramUser(userPayload);
  const quizId = String(payload.quizId || '');
  if (!quizId) throw new Error('Quiz session topilmadi.');

  const session = updateQuizSessionProgress(quizId, user.id, {
    answers: Array.isArray(payload.answers) ? payload.answers : undefined,
    currentIndex: typeof payload.currentIndex === 'number' ? payload.currentIndex : undefined
  });

  if (!session) {
    throw new Error('Quiz session topilmadi yoki yangilanmadi.');
  }

  return buildResumeQuiz(session);
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
  const mistakes = [];

  session.questions.forEach((question, index) => {
    const selectedIndex = Number(answers[index]);
    if (selectedIndex === question.correctIndex) {
      correct += 1;
      return;
    }

    wrong += 1;
    mistakes.push({
      arabic: question.arabic,
      correctAnswer: question.correctAnswer,
      selectedAnswer: question.options[selectedIndex] || ''
    });
  });

  const total = correct + wrong;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const durationSeconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(session.startedAt || session.createdAt || new Date().toISOString())) / 1000)
  );

  recordQuizAttempt(user, {
    testIndex: session.testIndex,
    testName: session.testName,
    correct,
    wrong,
    percent,
    mistakes,
    durationSeconds,
    isDailyChallenge: Boolean(session.isDailyChallenge)
  });
  finishQuizSession(quizId);

  return {
    testIndex: session.testIndex,
    testName: session.testName,
    correct,
    wrong,
    percent,
    durationSeconds,
    profile: getProfileView(user),
    leaderboard: getLeaderboard(),
    analytics: isAdminUser(user) ? getMiniAppAnalytics() : null
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
  saveMiniAppQuizProgress,
  finishMiniAppQuiz,
  updateMiniAppProfile,
  getDailyChallengeTest
};
