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
  createDuelChallenge,
  getDuelByCode,
  attachDuelOpponent,
  recordDuelResult,
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

function getDailyChallengeEndsAt() {
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  return tomorrow.toISOString();
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
    duelCode: session.duelCode || '',
    questions: (session.questions || []).map((question, index) => sanitizeQuestion(question, index))
  };
}

function isAdminUser(user) {
  return config.adminUserIds.includes(String(user.id));
}

async function getMiniAppBootPayload(userPayload) {
  const user = normalizeTelegramUser(userPayload);
  const before = getProfileView(user);
  registerMiniAppOpen(user);
  const profile = getProfileView(user);
  const tests = await getTests();
  const dailyChallenge = getDailyChallengeTest(tests);
  const activeQuiz = getActiveQuizForUser(user.id);
  return {
    user: profile,
    tests: buildTestList(tests, dailyChallenge?.id),
    leaderboard: getLeaderboard(),
    dailyChallenge: dailyChallenge
      ? {
          id: dailyChallenge.id,
          name: dailyChallenge.name,
          questionCount: Math.min(dailyChallenge.items.length, config.questionsPerTest),
          endsAt: getDailyChallengeEndsAt()
        }
      : null,
    activeQuiz: buildResumeQuiz(activeQuiz),
    analytics: isAdminUser(user) ? getMiniAppAnalytics() : null,
    duelEnabled: true,
    notifications: {
      streakIncreased: profile.streakDays > before.streakDays,
      streakDays: profile.streakDays
    }
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
    isDailyChallenge: Boolean(options.isDailyChallenge),
    duelCode: options.duelCode || ''
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
    duelCode: options.duelCode || '',
    questions
  };
}

async function startWeakWordsQuiz(userPayload) {
  const user = normalizeTelegramUser(userPayload);
  const profile = getProfileView(user);
  if (!profile.weakWords?.length) {
    throw new Error('Weak words hali yo‘q.');
  }

  const tests = await getTests();
  const allItems = await getVocabularyList();
  const weakItems = profile.weakWords.map((item, index) => ({
    arabic: item.arabic,
    uzbek: item.correctAnswer,
    id: `weak_${index}`
  }));
  const test = { id: 9000, name: 'Weak Words', items: weakItems };
  const questions = pickQuestions(weakItems, allItems, weakItems.length)
    .slice(0, Math.min(config.questionsPerTest, weakItems.length))
    .map((question, index) => sanitizeQuestion(question, index));
  const quizId = createQuizSession(user, test, questions, { isDailyChallenge: false });

  return {
    quizId,
    test: {
      id: test.id,
      name: test.name,
      subtitle: 'Xato qilingan so‘zlar'
    },
    currentIndex: 0,
    answers: new Array(questions.length).fill(null),
    startedAt: Date.now(),
    isDailyChallenge: false,
    questions
  };
}

async function createMiniAppDuel(userPayload, testIndex) {
  const user = normalizeTelegramUser(userPayload);
  const tests = await getTests();
  const test = tests.find((item) => item.id === Number(testIndex));
  if (!test) throw new Error('Test topilmadi.');

  const duel = createDuelChallenge(user, test);
  const quiz = await startMiniAppQuiz(user, test.id, { duelCode: duel.code });

  return {
    duelCode: duel.code,
    shareText: `Menga qarshi duelga qo‘shil: ${duel.code}`,
    quiz
  };
}

async function joinMiniAppDuel(userPayload, duelCode) {
  const user = normalizeTelegramUser(userPayload);
  const existing = getDuelByCode(duelCode);
  if (!existing) throw new Error('Duel topilmadi.');
  if (String(existing.creatorId) === String(user.id)) {
    throw new Error('O‘zingiz yaratgan duelga ikkinchi o‘yinchi sifatida kira olmaysiz.');
  }
  if (existing.opponentId && String(existing.opponentId) !== String(user.id)) {
    throw new Error('Bu duelga allaqachon boshqa foydalanuvchi qo‘shilgan.');
  }

  const duel = attachDuelOpponent(duelCode, user);
  if (!duel) throw new Error('Duelga qo‘shilib bo‘lmadi.');
  if (!duel.testIndex) throw new Error('Duel buzilgan.');

  const quiz = await startMiniAppQuiz(user, duel.testIndex, { duelCode: duel.code });
  return {
    duelCode: duel.code,
    quiz
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

  const before = getProfileView(user);
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
  const duel = session.duelCode ? recordDuelResult(session.duelCode, user.id, { percent, durationSeconds }) : null;
  finishQuizSession(quizId);
  const profile = getProfileView(user);
  const previousBadges = new Set((before.badges || []).map((badge) => badge.id));
  const unlockedBadges = (profile.badges || []).filter((badge) => !previousBadges.has(badge.id));

  return {
    testIndex: session.testIndex,
    testName: session.testName,
    correct,
    wrong,
    percent,
    durationSeconds,
    profile,
    leaderboard: getLeaderboard(),
    analytics: isAdminUser(user) ? getMiniAppAnalytics() : null,
    duel,
    notifications: {
      unlockedBadges,
      challengeCompleted: Boolean(session.isDailyChallenge),
      newLevel: profile.level?.name !== before.level?.name ? profile.level : null
    }
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
  startWeakWordsQuiz,
  createMiniAppDuel,
  joinMiniAppDuel,
  saveMiniAppQuizProgress,
  finishMiniAppQuiz,
  updateMiniAppProfile,
  getDailyChallengeTest
};
