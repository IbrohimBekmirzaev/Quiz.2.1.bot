const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', '..', 'data');
const storeFilePath = path.join(dataDir, 'mini-app-store.json');
const STORE_VERSION = 3;

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function dayKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const first = Date.parse(`${a}T00:00:00.000Z`);
  const second = Date.parse(`${b}T00:00:00.000Z`);
  return Math.round((second - first) / 86400000);
}

function isWithinLastDays(dateValue, days) {
  if (!dateValue) return false;
  const now = new Date();
  const from = new Date(now.getTime() - days * 86400000);
  return new Date(dateValue) >= from;
}

function createEmptyStore() {
  return {
    version: STORE_VERSION,
    profiles: {},
    attempts: [],
    activeQuizzes: {}
  };
}

function normalizeStore(store) {
  const base = createEmptyStore();
  return {
    version: Number(store?.version || STORE_VERSION),
    profiles: store?.profiles || base.profiles,
    attempts: Array.isArray(store?.attempts) ? store.attempts : [],
    activeQuizzes: store?.activeQuizzes || base.activeQuizzes
  };
}

function readStore() {
  ensureDataDir();

  if (!fs.existsSync(storeFilePath)) {
    return createEmptyStore();
  }

  const raw = fs.readFileSync(storeFilePath, 'utf8').trim();
  if (!raw) {
    return createEmptyStore();
  }

  return normalizeStore(JSON.parse(raw));
}

function writeStore(store) {
  ensureDataDir();
  fs.writeFileSync(storeFilePath, JSON.stringify(store, null, 2), 'utf8');
}

function getUserId(user) {
  return String(user?.id || '');
}

function createBaseProfile(user = {}) {
  const displayName = [user?.first_name || '', user?.last_name || ''].join(' ').trim() || 'Foydalanuvchi';
  return {
    id: getUserId(user),
    firstName: user?.first_name || 'Foydalanuvchi',
    lastName: user?.last_name || '',
    username: user?.username || '',
    displayName,
    avatarUrl: '',
    opens: 0,
    quizAttempts: 0,
    totalCorrect: 0,
    totalWrong: 0,
    bestScore: 0,
    points: 0,
    weeklyPoints: 0,
    streakDays: 0,
    bestStreak: 0,
    challengeCompletions: 0,
    challengeStreak: 0,
    bestChallengeStreak: 0,
    lastChallengeDay: '',
    remindersEnabled: false,
    lastReminderDay: '',
    hasSeenOnboarding: false,
    lastOpenedAt: '',
    lastOpenDay: '',
    createdAt: new Date().toISOString()
  };
}

function getProfileFromStore(store, user, extra = {}) {
  const userId = getUserId(user);
  if (!userId) {
    throw new Error('Foydalanuvchi topilmadi.');
  }

  const existing = store.profiles[userId] || createBaseProfile(user);
  return {
    ...existing,
    id: userId,
    firstName: user?.first_name || existing.firstName || 'Foydalanuvchi',
    lastName: user?.last_name || existing.lastName || '',
    username: user?.username || existing.username || '',
    displayName: extra.displayName || existing.displayName || [user?.first_name || '', user?.last_name || ''].join(' ').trim() || 'Foydalanuvchi',
    avatarUrl: Object.prototype.hasOwnProperty.call(extra, 'avatarUrl')
      ? String(extra.avatarUrl || '').trim()
      : (existing.avatarUrl || ''),
    opens: Number(existing.opens || 0),
    quizAttempts: Number(existing.quizAttempts || 0),
    totalCorrect: Number(existing.totalCorrect || 0),
    totalWrong: Number(existing.totalWrong || 0),
    bestScore: Number(existing.bestScore || 0),
    points: Number(existing.points || 0),
    weeklyPoints: Number(existing.weeklyPoints || 0),
    streakDays: Number(existing.streakDays || 0),
    bestStreak: Number(existing.bestStreak || 0),
    challengeCompletions: Number(existing.challengeCompletions || 0),
    challengeStreak: Number(existing.challengeStreak || 0),
    bestChallengeStreak: Number(existing.bestChallengeStreak || 0),
    lastChallengeDay: existing.lastChallengeDay || '',
    remindersEnabled: Boolean(existing.remindersEnabled),
    lastReminderDay: existing.lastReminderDay || '',
    hasSeenOnboarding: Boolean(existing.hasSeenOnboarding),
    lastOpenedAt: existing.lastOpenedAt || '',
    lastOpenDay: existing.lastOpenDay || '',
    createdAt: existing.createdAt || new Date().toISOString()
  };
}

function buildProfileSummary(store, profileId) {
  const attempts = store.attempts.filter((attempt) => String(attempt.userId) === String(profileId));
  const recentAttempts = attempts.slice(-5).reverse();
  const totalCorrect = attempts.reduce((sum, attempt) => sum + Number(attempt.correct || 0), 0);
  const totalWrong = attempts.reduce((sum, attempt) => sum + Number(attempt.wrong || 0), 0);
  const points = attempts.reduce((sum, attempt) => sum + Number(attempt.correct || 0), 0);
  const weeklyPoints = attempts
    .filter((attempt) => isWithinLastDays(attempt.createdAt, 7))
    .reduce((sum, attempt) => sum + Number(attempt.correct || 0), 0);
  const bestScore = attempts.reduce((max, attempt) => Math.max(max, Number(attempt.percent || 0)), 0);

  const weakMap = new Map();
  for (const attempt of attempts) {
    for (const mistake of attempt.mistakes || []) {
      const key = `${mistake.arabic}__${mistake.correctAnswer}`;
      const current = weakMap.get(key) || {
        arabic: mistake.arabic,
        correctAnswer: mistake.correctAnswer,
        count: 0
      };
      current.count += 1;
      weakMap.set(key, current);
    }
  }

  const weakWords = [...weakMap.values()]
    .sort((a, b) => b.count - a.count || a.arabic.localeCompare(b.arabic))
    .slice(0, 10);

  const totalQuestions = attempts.reduce(
    (sum, attempt) => sum + Number(attempt.correct || 0) + Number(attempt.wrong || 0),
    0
  );

  const bestAttempt = attempts
    .slice()
    .sort((a, b) => {
      const percentDiff = Number(b.percent || 0) - Number(a.percent || 0);
      if (percentDiff) return percentDiff;
      const correctDiff = Number(b.correct || 0) - Number(a.correct || 0);
      if (correctDiff) return correctDiff;
      return new Date(b.createdAt) - new Date(a.createdAt);
    })[0] || null;

  return {
    attempts,
    recentAttempts,
    totalCorrect,
    totalWrong,
    points,
    weeklyPoints,
    bestScore,
    weakWords,
    totalQuestions,
    bestAttempt
  };
}

function computeLeaderboard(store) {
  const profiles = Object.values(store.profiles);
  const scored = profiles.map((profile) => {
    const summary = buildProfileSummary(store, profile.id);
    return {
      profile,
      points: summary.points,
      weeklyPoints: summary.weeklyPoints,
      totalCorrect: summary.totalCorrect,
      totalWrong: summary.totalWrong,
      attempts: summary.attempts.length
    };
  });

  const allTime = scored
    .slice()
    .sort((a, b) => b.points - a.points || b.totalCorrect - a.totalCorrect || a.profile.displayName.localeCompare(b.profile.displayName))
    .map((item, index) => ({
      rank: index + 1,
      id: item.profile.id,
      displayName: item.profile.displayName || item.profile.firstName || 'Foydalanuvchi',
      username: item.profile.username ? `@${item.profile.username}` : '@no_username',
      avatarUrl: item.profile.avatarUrl || '',
      points: item.points,
      totalCorrect: item.totalCorrect,
      totalWrong: item.totalWrong,
      attempts: item.attempts
    }));

  const weekly = scored
    .slice()
    .sort((a, b) => b.weeklyPoints - a.weeklyPoints || b.totalCorrect - a.totalCorrect || a.profile.displayName.localeCompare(b.profile.displayName))
    .map((item, index) => ({
      rank: index + 1,
      id: item.profile.id,
      displayName: item.profile.displayName || item.profile.firstName || 'Foydalanuvchi',
      username: item.profile.username ? `@${item.profile.username}` : '@no_username',
      avatarUrl: item.profile.avatarUrl || '',
      points: item.weeklyPoints,
      totalCorrect: item.totalCorrect,
      totalWrong: item.totalWrong,
      attempts: item.attempts
    }));

  return { allTime, weekly };
}

function computeBadges(profile, attempts, leaderboard) {
  const badges = [];
  const today = dayKey();

  if (attempts.length >= 1) badges.push({ id: 'first_quiz', label: 'First Quiz', icon: '🚀' });
  if (attempts.length >= 10) badges.push({ id: 'ten_quizzes', label: '10 ta test', icon: '🏁' });
  if (attempts.some((attempt) => Number(attempt.percent || 0) === 100)) badges.push({ id: 'perfect', label: '100% Master', icon: '💯' });
  if (Number(profile.streakDays || 0) >= 7) badges.push({ id: 'streak_7', label: '7 kun streak', icon: '🔥' });
  if (Number(profile.challengeCompletions || 0) >= 5) badges.push({ id: 'challenge_5', label: '5 challenge', icon: '🎯' });
  if (Number(profile.challengeStreak || 0) >= 3) badges.push({ id: 'challenge_streak_3', label: 'Challenge Streak', icon: '⚡' });
  if (attempts.some((attempt) => attempt.isDailyChallenge && dayKey(attempt.createdAt) === today)) {
    badges.push({ id: 'daily_done', label: 'Daily Challenge', icon: '⚡' });
  }
  const weeklyRank = leaderboard.weekly.find((item) => item.id === profile.id)?.rank || null;
  if (weeklyRank && weeklyRank <= 3) badges.push({ id: 'weekly_top3', label: 'Weekly Top 3', icon: '🏆' });

  return badges;
}

function getLevelInfo(points) {
  const tiers = [
    { name: 'Bronze', min: 0, max: 29 },
    { name: 'Silver', min: 30, max: 79 },
    { name: 'Gold', min: 80, max: 159 },
    { name: 'Diamond', min: 160, max: Infinity }
  ];

  const tier = tiers.find((item) => points >= item.min && points <= item.max) || tiers[0];
  const next = tiers.find((item) => item.min > tier.min) || null;
  const range = Number.isFinite(tier.max) ? tier.max - tier.min + 1 : Math.max(1, points - tier.min + 20);
  const progress = Math.min(100, Math.max(0, Math.round(((points - tier.min) / range) * 100)));

  return {
    name: tier.name,
    points,
    progress,
    nextLevelName: next?.name || null,
    nextLevelAt: next?.min || null
  };
}

function upsertProfile(user, extra = {}) {
  const store = readStore();
  const profile = getProfileFromStore(store, user, extra);
  store.profiles[profile.id] = profile;
  writeStore(store);
  return profile;
}

function registerMiniAppOpen(user) {
  const store = readStore();
  const today = dayKey();
  const profile = getProfileFromStore(store, user);

  if (profile.lastOpenDay !== today) {
    if (!profile.lastOpenDay) {
      profile.streakDays = 1;
    } else {
      const gap = daysBetween(profile.lastOpenDay, today);
      profile.streakDays = gap === 1 ? profile.streakDays + 1 : 1;
    }
    profile.bestStreak = Math.max(profile.bestStreak, profile.streakDays);
    profile.lastOpenDay = today;
  }

  profile.opens += 1;
  profile.lastOpenedAt = new Date().toISOString();
  store.profiles[profile.id] = profile;
  writeStore(store);
  return profile;
}

function saveProfileSettings(user, payload = {}) {
  const store = readStore();
  const profile = getProfileFromStore(store, user, {
    displayName: String(payload.displayName || '').trim() || undefined,
    avatarUrl: Object.prototype.hasOwnProperty.call(payload, 'avatarUrl') ? payload.avatarUrl : undefined
  });

  if (Object.prototype.hasOwnProperty.call(payload, 'remindersEnabled')) {
    profile.remindersEnabled = Boolean(payload.remindersEnabled);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'hasSeenOnboarding')) {
    profile.hasSeenOnboarding = Boolean(payload.hasSeenOnboarding);
  }

  store.profiles[profile.id] = profile;
  writeStore(store);
  return profile;
}

function createQuizSession(user, test, questions, extra = {}) {
  const store = readStore();
  const userId = getUserId(user);
  if (!userId) throw new Error('Foydalanuvchi topilmadi.');

  const quizId = crypto.randomUUID();
  store.activeQuizzes[quizId] = {
    quizId,
    userId,
    testIndex: test.id,
    testName: test.name,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    currentIndex: Number(extra.currentIndex || 0),
    answers: Array.isArray(extra.answers) ? extra.answers : new Array(questions.length).fill(null),
    questions,
    isDailyChallenge: Boolean(extra.isDailyChallenge)
  };
  writeStore(store);
  return quizId;
}

function updateQuizSessionProgress(quizId, userId, payload = {}) {
  const store = readStore();
  const session = store.activeQuizzes[String(quizId)];
  if (!session) return null;
  if (String(session.userId) !== String(userId)) return null;

  if (Array.isArray(payload.answers)) {
    session.answers = payload.answers;
  }
  if (typeof payload.currentIndex === 'number') {
    session.currentIndex = payload.currentIndex;
  }
  store.activeQuizzes[String(quizId)] = session;
  writeStore(store);
  return session;
}

function getQuizSession(quizId) {
  const store = readStore();
  return store.activeQuizzes[String(quizId)] || null;
}

function getActiveQuizForUser(userId) {
  const store = readStore();
  return Object.values(store.activeQuizzes)
    .filter((session) => String(session.userId) === String(userId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

function finishQuizSession(quizId) {
  const store = readStore();
  delete store.activeQuizzes[String(quizId)];
  writeStore(store);
}

function recordQuizAttempt(user, summary) {
  const store = readStore();
  const profile = getProfileFromStore(store, user);
  const percent = Number(summary.percent || 0);
  const points = Number(summary.correct || 0);
  const attempt = {
    id: crypto.randomUUID(),
    userId: profile.id,
    testIndex: summary.testIndex,
    testName: summary.testName,
    correct: Number(summary.correct || 0),
    wrong: Number(summary.wrong || 0),
    percent,
    createdAt: new Date().toISOString(),
    source: 'mini_app',
    mistakes: Array.isArray(summary.mistakes) ? summary.mistakes : [],
    durationSeconds: Number(summary.durationSeconds || 0),
    isDailyChallenge: Boolean(summary.isDailyChallenge)
  };

  store.attempts.push(attempt);
  profile.quizAttempts += 1;
  profile.totalCorrect += Number(summary.correct || 0);
  profile.totalWrong += Number(summary.wrong || 0);
  profile.bestScore = Math.max(profile.bestScore, percent);
  profile.points += points;
  if (attempt.isDailyChallenge) {
    profile.challengeCompletions += 1;
    const attemptDay = dayKey(attempt.createdAt);
    if (!profile.lastChallengeDay) {
      profile.challengeStreak = 1;
    } else {
      const gap = daysBetween(profile.lastChallengeDay, attemptDay);
      if (gap === 0) {
        profile.challengeStreak = Math.max(1, Number(profile.challengeStreak || 0));
      } else if (gap === 1) {
        profile.challengeStreak += 1;
      } else {
        profile.challengeStreak = 1;
      }
    }
    profile.lastChallengeDay = attemptDay;
    profile.bestChallengeStreak = Math.max(Number(profile.bestChallengeStreak || 0), Number(profile.challengeStreak || 0));
  }

  store.profiles[profile.id] = profile;
  writeStore(store);
  return attempt;
}

function getReminderCandidates() {
  const store = readStore();
  const today = dayKey();
  return Object.values(store.profiles).filter((profile) => {
    if (!profile.remindersEnabled) return false;
    if (!profile.lastOpenedAt) return false;
    if (profile.lastReminderDay === today) return false;
    const inactiveDays = daysBetween(dayKey(profile.lastOpenedAt), today);
    if (inactiveDays < 2 || inactiveDays > 7) return false;
    if (profile.lastReminderDay && daysBetween(profile.lastReminderDay, today) < 2) return false;
    return true;
  });
}

function markReminderSent(userId) {
  const store = readStore();
  if (!store.profiles[String(userId)]) return;
  store.profiles[String(userId)].lastReminderDay = dayKey();
  writeStore(store);
}

function getLeaderboard() {
  const store = readStore();
  return computeLeaderboard(store);
}

function getProfileView(user) {
  const store = readStore();
  const profile = getProfileFromStore(store, user);
  store.profiles[profile.id] = profile;
  writeStore(store);

  const leaderboard = computeLeaderboard(store);
  const summary = buildProfileSummary(store, profile.id);
  const badges = computeBadges(profile, summary.attempts, leaderboard);
  const allTimeRank = leaderboard.allTime.find((item) => item.id === profile.id)?.rank || null;
  const weeklyRank = leaderboard.weekly.find((item) => item.id === profile.id)?.rank || null;
  return {
    id: profile.id,
    displayName: profile.displayName,
    username: profile.username ? `@${profile.username}` : '@no_username',
    avatarUrl: profile.avatarUrl || '',
    opens: Number(profile.opens || 0),
    attempts: summary.attempts.length,
    totalCorrect: summary.totalCorrect,
    totalWrong: summary.totalWrong,
    points: summary.points,
    weeklyPoints: summary.weeklyPoints,
    bestScore: summary.bestScore,
    totalQuestions: summary.totalQuestions,
    allTimeRank,
    weeklyRank,
    streakDays: Number(profile.streakDays || 0),
    bestStreak: Number(profile.bestStreak || 0),
    challengeCompletions: Number(profile.challengeCompletions || 0),
    challengeStreak: Number(profile.challengeStreak || 0),
    bestChallengeStreak: Number(profile.bestChallengeStreak || 0),
    challengeCompletedToday: profile.lastChallengeDay === dayKey(),
    remindersEnabled: Boolean(profile.remindersEnabled),
    hasSeenOnboarding: Boolean(profile.hasSeenOnboarding),
    recentResults: summary.recentAttempts.map((attempt) => ({
      id: attempt.id,
      testName: attempt.testName,
      correct: attempt.correct,
      wrong: attempt.wrong,
      percent: attempt.percent,
      createdAt: attempt.createdAt
    })),
    bestAttempt: summary.bestAttempt ? {
      testName: summary.bestAttempt.testName,
      percent: summary.bestAttempt.percent,
      correct: summary.bestAttempt.correct,
      wrong: summary.bestAttempt.wrong,
      createdAt: summary.bestAttempt.createdAt
    } : null,
    weakWords: summary.weakWords,
    badges,
    level: getLevelInfo(summary.points)
  };
}

function getMiniAppAnalytics() {
  const store = readStore();
  const today = dayKey();
  const profiles = Object.values(store.profiles);
  const attempts = store.attempts;
  const todayAttempts = attempts.filter((attempt) => dayKey(attempt.createdAt) === today);
  const opensToday = profiles.filter((profile) => dayKey(profile.lastOpenedAt || profile.createdAt) === today).length;

  const testUsage = new Map();
  for (const attempt of attempts) {
    testUsage.set(attempt.testName, (testUsage.get(attempt.testName) || 0) + 1);
  }
  const topTest = [...testUsage.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  const userActivity = new Map();
  for (const attempt of attempts) {
    userActivity.set(attempt.userId, (userActivity.get(attempt.userId) || 0) + 1);
  }
  const topUserEntry = [...userActivity.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const topUserProfile = topUserEntry ? store.profiles[topUserEntry[0]] : null;

  const leaderboard = computeLeaderboard(store);
  const topTests = [...testUsage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
  const activeUsersToday = profiles.filter((profile) => {
    if (!profile.lastOpenedAt) return false;
    return dayKey(profile.lastOpenedAt) === today;
  }).length;
  const conversionRate = opensToday ? Math.round((todayAttempts.length / opensToday) * 100) : 0;

  return {
    opensToday,
    activeUsersToday,
    quizzesToday: todayAttempts.length,
    totalProfiles: profiles.length,
    totalAttempts: attempts.length,
    conversionRate,
    topTest: topTest ? { name: topTest[0], count: topTest[1] } : null,
    topTests,
    mostActiveUser: topUserProfile
      ? {
          id: topUserProfile.id,
          displayName: topUserProfile.displayName,
          count: topUserEntry[1]
        }
      : null,
    weeklyWinners: leaderboard.weekly.slice(0, 3)
  };
}

module.exports = {
  readStore,
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
  getReminderCandidates,
  markReminderSent,
  upsertProfile,
  storeFilePath,
  dayKey,
  getLevelInfo
};
