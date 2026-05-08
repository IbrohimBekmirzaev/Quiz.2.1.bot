const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const statsFilePath = path.join(dataDir, 'user-stats.json');
const STATS_VERSION = 1;

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function createEmptyStats() {
  return {
    version: STATS_VERSION,
    users: {},
    lastAddedUserId: null
  };
}

function normalizeStats(stats) {
  const base = createEmptyStats();
  return {
    version: Number(stats?.version || STATS_VERSION),
    users: stats?.users || base.users,
    lastAddedUserId: stats?.lastAddedUserId || null
  };
}

function readStats() {
  ensureDataDir();

  if (!fs.existsSync(statsFilePath)) {
    return createEmptyStats();
  }

  const raw = fs.readFileSync(statsFilePath, 'utf8').trim();
  if (!raw) {
    return createEmptyStats();
  }

  return normalizeStats(JSON.parse(raw));
}

function writeStats(stats) {
  ensureDataDir();
  fs.writeFileSync(statsFilePath, JSON.stringify(stats, null, 2), 'utf8');
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date) {
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - diff);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1);
}

function countUsersSince(users, startDate, endDate) {
  return users.filter((user) => {
    if (!user?.firstSeenAt) return false;
    const seenAt = new Date(user.firstSeenAt);
    return seenAt >= startDate && seenAt <= endDate;
  }).length;
}

function buildUserLabel(user) {
  if (!user) {
    return {
      id: '',
      name: 'Noma\'lum',
      username: 'Username yo\'q',
      chatId: '',
      firstSeenAt: ''
    };
  }

  const fullName = [user.firstName || '', user.lastName || ''].join(' ').trim() || 'Noma\'lum';
  return {
    id: user.id || '',
    name: fullName,
    username: user.username ? `@${user.username}` : 'Username yo\'q',
    chatId: user.chatId || '',
    firstSeenAt: user.firstSeenAt || ''
  };
}

function buildSummary(stats, now = new Date()) {
  const users = Object.values(stats.users);
  const endDate = now;

  return {
    generatedAt: now.toISOString(),
    totalUsers: users.length,
    lastAddedUser: buildUserLabel(stats.users[stats.lastAddedUserId]),
    periods: {
      day: countUsersSince(users, startOfDay(now), endDate),
      week: countUsersSince(users, startOfWeek(now), endDate),
      month: countUsersSince(users, startOfMonth(now), endDate),
      year: countUsersSince(users, startOfYear(now), endDate)
    }
  };
}

function registerUserIfNew(msg, now = new Date()) {
  const stats = readStats();
  const userId = String(msg?.from?.id || '');
  const chatId = String(msg?.chat?.id || '');

  if (!userId) {
    return {
      isNewUser: false,
      stats: buildSummary(stats, now)
    };
  }

  const existing = stats.users[userId];
  if (existing) {
    stats.users[userId] = {
      ...existing,
      chatId,
      firstName: msg?.from?.first_name || existing.firstName || '',
      lastName: msg?.from?.last_name || existing.lastName || '',
      username: msg?.from?.username || existing.username || ''
    };
    writeStats(stats);
    return {
      isNewUser: false,
      stats: buildSummary(stats, now)
    };
  }

  stats.users[userId] = {
    id: userId,
    chatId,
    firstName: msg?.from?.first_name || '',
    lastName: msg?.from?.last_name || '',
    username: msg?.from?.username || '',
    firstSeenAt: now.toISOString()
  };

  stats.lastAddedUserId = userId;
  writeStats(stats);

  return {
    isNewUser: true,
    stats: buildSummary(stats, now)
  };
}

module.exports = {
  readStats,
  buildSummary,
  registerUserIfNew,
  statsFilePath
};
