const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', '..', 'data');
const storeFilePath = path.join(dataDir, 'mini-app-store.json');
const STORE_VERSION = 1;

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
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

function upsertProfile(user, extra = {}) {
  const store = readStore();
  const userId = getUserId(user);
  if (!userId) {
    throw new Error('Foydalanuvchi topilmadi.');
  }

  const existing = store.profiles[userId] || {};
  const profile = {
    id: userId,
    firstName: user?.first_name || existing.firstName || 'Foydalanuvchi',
    lastName: user?.last_name || existing.lastName || '',
    username: user?.username || existing.username || '',
    displayName: extra.displayName || existing.displayName || [user?.first_name || '', user?.last_name || ''].join(' ').trim() || 'Foydalanuvchi',
    avatarUrl: extra.avatarUrl || existing.avatarUrl || '',
    opens: Number(existing.opens || 0),
    quizAttempts: Number(existing.quizAttempts || 0),
    totalCorrect: Number(existing.totalCorrect || 0),
    totalWrong: Number(existing.totalWrong || 0),
    bestScore: Number(existing.bestScore || 0),
    points: Number(existing.points || 0),
    weeklyPoints: Number(existing.weeklyPoints || 0),
    lastOpenedAt: existing.lastOpenedAt || '',
    createdAt: existing.createdAt || new Date().toISOString()
  };

  store.profiles[userId] = profile;
  writeStore(store);
  return profile;
}

function registerMiniAppOpen(user) {
  const store = readStore();
  const userId = getUserId(user);
  if (!userId) {
    throw new Error('Foydalanuvchi topilmadi.');
  }

  const existing = store.profiles[userId] || upsertProfile(user);
  const profile = {
    ...existing,
    firstName: user?.first_name || existing.firstName || 'Foydalanuvchi',
    lastName: user?.last_name || existing.lastName || '',
    username: user?.username || existing.username || '',
    displayName: existing.displayName || [user?.first_name || '', user?.last_name || ''].join(' ').trim() || 'Foydalanuvchi',
    opens: Number(existing.opens || 0) + 1,
    lastOpenedAt: new Date().toISOString()
  };

  store.profiles[userId] = profile;
  writeStore(store);
  return profile;
}

function saveProfileSettings(user, payload = {}) {
  const store = readStore();
  const userId = getUserId(user);
  if (!userId) {
    throw new Error('Foydalanuvchi topilmadi.');
  }

  const existing = store.profiles[userId] || upsertProfile(user);
  const profile = {
    ...existing,
    displayName: String(payload.displayName || existing.displayName || '').trim() || existing.displayName || 'Foydalanuvchi',
    avatarUrl: String(payload.avatarUrl || existing.avatarUrl || '').trim()
  };

  store.profiles[userId] = profile;
  writeStore(store);
  return profile;
}

function createQuizSession(user, test, questions) {
  const store = readStore();
  const userId = getUserId(user);
  if (!userId) {
    throw new Error('Foydalanuvchi topilmadi.');
  }

  const quizId = crypto.randomUUID();
  store.activeQuizzes[quizId] = {
    userId,
    testIndex: test.id,
    testName: test.name,
    createdAt: new Date().toISOString(),
    questions
  };
  writeStore(store);
  return quizId;
}

function getQuizSession(quizId) {
  const store = readStore();
  return store.activeQuizzes[String(quizId)] || null;
}

function finishQuizSession(quizId) {
  const store = readStore();
  delete store.activeQuizzes[String(quizId)];
  writeStore(store);
}

function recordQuizAttempt(user, summary) {
  const store = readStore();
  const userId = getUserId(user);
  if (!userId) {
    throw new Error('Foydalanuvchi topilmadi.');
  }

  const existing = store.profiles[userId] || upsertProfile(user);
  const percent = Number(summary.percent || 0);
  const points = Number(summary.correct || 0);
  const attempt = {
    id: crypto.randomUUID(),
    userId,
    testIndex: summary.testIndex,
    testName: summary.testName,
    correct: Number(summary.correct || 0),
    wrong: Number(summary.wrong || 0),
    percent,
    createdAt: new Date().toISOString(),
    source: 'mini_app'
  };

  store.attempts.push(attempt);
  store.profiles[userId] = {
    ...existing,
    firstName: user?.first_name || existing.firstName || 'Foydalanuvchi',
    lastName: user?.last_name || existing.lastName || '',
    username: user?.username || existing.username || '',
    displayName: existing.displayName || [user?.first_name || '', user?.last_name || ''].join(' ').trim() || 'Foydalanuvchi',
    quizAttempts: Number(existing.quizAttempts || 0) + 1,
    totalCorrect: Number(existing.totalCorrect || 0) + Number(summary.correct || 0),
    totalWrong: Number(existing.totalWrong || 0) + Number(summary.wrong || 0),
    bestScore: Math.max(Number(existing.bestScore || 0), percent),
    points: Number(existing.points || 0) + points,
    weeklyPoints: Number(existing.weeklyPoints || 0) + points
  };

  writeStore(store);
  return attempt;
}

function getLeaderboard() {
  const store = readStore();
  const profiles = Object.values(store.profiles);
  const allTime = profiles
    .slice()
    .sort((a, b) => Number(b.points || 0) - Number(a.points || 0) || Number(b.totalCorrect || 0) - Number(a.totalCorrect || 0))
    .map((profile, index) => ({
      rank: index + 1,
      id: profile.id,
      displayName: profile.displayName || profile.firstName || 'Foydalanuvchi',
      username: profile.username ? `@${profile.username}` : '@no_username',
      avatarUrl: profile.avatarUrl || '',
      points: Number(profile.points || 0),
      totalCorrect: Number(profile.totalCorrect || 0),
      totalWrong: Number(profile.totalWrong || 0),
      attempts: Number(profile.quizAttempts || 0)
    }));

  const weekly = profiles
    .slice()
    .sort((a, b) => Number(b.weeklyPoints || 0) - Number(a.weeklyPoints || 0) || Number(b.totalCorrect || 0) - Number(a.totalCorrect || 0))
    .map((profile, index) => ({
      rank: index + 1,
      id: profile.id,
      displayName: profile.displayName || profile.firstName || 'Foydalanuvchi',
      username: profile.username ? `@${profile.username}` : '@no_username',
      avatarUrl: profile.avatarUrl || '',
      points: Number(profile.weeklyPoints || 0),
      totalCorrect: Number(profile.totalCorrect || 0),
      totalWrong: Number(profile.totalWrong || 0),
      attempts: Number(profile.quizAttempts || 0)
    }));

  return { allTime, weekly };
}

function getProfileView(user) {
  const profile = upsertProfile(user);
  const board = getLeaderboard();
  const allTimeRank = board.allTime.find((item) => item.id === profile.id)?.rank || null;
  const weeklyRank = board.weekly.find((item) => item.id === profile.id)?.rank || null;

  return {
    id: profile.id,
    displayName: profile.displayName,
    username: profile.username ? `@${profile.username}` : '@no_username',
    avatarUrl: profile.avatarUrl || '',
    opens: Number(profile.opens || 0),
    attempts: Number(profile.quizAttempts || 0),
    totalCorrect: Number(profile.totalCorrect || 0),
    totalWrong: Number(profile.totalWrong || 0),
    points: Number(profile.points || 0),
    weeklyPoints: Number(profile.weeklyPoints || 0),
    bestScore: Number(profile.bestScore || 0),
    allTimeRank,
    weeklyRank
  };
}

module.exports = {
  readStore,
  registerMiniAppOpen,
  saveProfileSettings,
  createQuizSession,
  getQuizSession,
  finishQuizSession,
  recordQuizAttempt,
  getLeaderboard,
  getProfileView,
  upsertProfile,
  storeFilePath
};
