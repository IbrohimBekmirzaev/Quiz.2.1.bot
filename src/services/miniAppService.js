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
          endsAt: getDailyChallengeEndsAt(),
          completedToday: Boolean(profile.challengeCompletedToday),
          streak: Number(profile.challengeStreak || 0),
          rewardTitle: profile.challengeCompletedToday ? 'Bugungi badge olindi' : 'Bugungi bonus badge'
        }
      : null,
    activeQuiz: buildResumeQuiz(activeQuiz),
    analytics: isAdminUser(user) ? getMiniAppAnalytics() : null,
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

async function startWeakWordsQuiz(userPayload) {
  const user = normalizeTelegramUser(userPayload);
  const profile = getProfileView(user);
  if (!profile.weakWords?.length) {
    throw new Error('Weak words hali yo‘q.');
  }

  const tests = await getTests();
  const weakItems = profile.weakWords.map((item, index) => ({
    arabic: item.arabic,
    uzbek: item.correctAnswer,
    id: `weak_${index}`
  }));
  const test = { id: 9000, name: 'Weak Words', items: weakItems };
  const allItems = await getVocabularyList();
  const questions = pickQuestions(weakItems, allItems, weakItems.length)
    .slice(0, Math.min(config.questionsPerTest, weakItems.length))
    .map((question, index) => sanitizeQuestion(question, index));
  const quizId = createQuizSession(user, test, questions, { isDailyChallenge: false });

  return {
    quizId,
    test: {
      id: test.id,
      name: test.name,
      subtitle: `${questions.length} ta eng zaif so‘z`
    },
    currentIndex: 0,
    answers: new Array(questions.length).fill(null),
    startedAt: Date.now(),
    isDailyChallenge: false,
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
  finishQuizSession(quizId);
  const profile = getProfileView(user);
  const previousBadges = new Set((before.badges || []).map((badge) => badge.id));
  const unlockedBadges = (profile.badges || []).filter((badge) => !previousBadges.has(badge.id));
  const rankImproved = {
    allTime: before.allTimeRank && profile.allTimeRank && profile.allTimeRank < before.allTimeRank,
    weekly: before.weeklyRank && profile.weeklyRank && profile.weeklyRank < before.weeklyRank
  };
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
    shareCard: {
      title: session.testName,
      percent,
      correct,
      wrong,
      level: profile.level?.name || 'Bronze',
      challengeCompletedToday: profile.challengeCompletedToday
    },
    notifications: {
      unlockedBadges,
      challengeCompleted: Boolean(session.isDailyChallenge),
      challengeStreak: profile.challengeStreak > before.challengeStreak ? profile.challengeStreak : null,
      rankImproved,
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
  saveMiniAppQuizProgress,
  finishMiniAppQuiz,
  updateMiniAppProfile,
  getDailyChallengeTest
};
