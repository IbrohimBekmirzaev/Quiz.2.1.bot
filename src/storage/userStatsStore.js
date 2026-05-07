const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const statsFilePath = path.join(dataDir, 'user-stats.json');

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function createEmptyStats() {
  return {
    users: {},
    daily: {},
    totals: {
      startCount: 0
    },
    lastAddedUserId: null,
    lastActiveUserId: null
  };
}

function normalizeStats(stats) {
  const base = createEmptyStats();
  return {
    users: stats?.users || base.users,
    daily: stats?.daily || base.daily,
    totals: {
      startCount: Number(stats?.totals?.startCount || 0)
    },
    lastAddedUserId: stats?.lastAddedUserId || null,
    lastActiveUserId: stats?.lastActiveUserId || null
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

function pad(value) {
  return String(value).padStart(2, '0');
}

function toLocalDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

function countPeriod(daily, startKey, endKey) {
  const uniqueUsers = new Set();
  let startCount = 0;

  for (const [dateKey, entry] of Object.entries(daily)) {
    if (dateKey < startKey || dateKey > endKey) continue;
    startCount += Number(entry?.startCount || 0);
    for (const userId of entry?.uniqueUsers || []) {
      uniqueUsers.add(String(userId));
    }
  }

  return {
    uniqueUsers: uniqueUsers.size,
    startCount
  };
}

function buildUserLabel(user) {
  if (!user) {
    return {
      name: 'Noma\'lum',
      username: 'Username yo\'q',
      id: '',
      chatId: '',
      firstSeenAt: '',
      lastSeenAt: '',
      startCount: 0
    };
  }

  const fullName = [user.firstName || '', user.lastName || ''].join(' ').trim() || 'Noma\'lum';
  return {
    name: fullName,
    username: user.username ? `@${user.username}` : 'Username yo\'q',
    id: user.id || '',
    chatId: user.chatId || '',
    firstSeenAt: user.firstSeenAt || '',
    lastSeenAt: user.lastSeenAt || '',
    startCount: Number(user.startCount || 0)
  };
}

function buildSummary(stats, now = new Date()) {
  const users = Object.values(stats.users);
  const todayKey = toLocalDateKey(now);

  return {
    generatedAt: now.toISOString(),
    totalUsers: users.length,
    totalStarts: Number(stats?.totals?.startCount || 0),
    lastAddedUser: buildUserLabel(stats.users[stats.lastAddedUserId]),
    lastActiveUser: buildUserLabel(stats.users[stats.lastActiveUserId]),
    periods: {
      day: countPeriod(stats.daily, todayKey, todayKey),
      week: countPeriod(stats.daily, toLocalDateKey(startOfWeek(now)), todayKey),
      month: countPeriod(stats.daily, toLocalDateKey(startOfMonth(now)), todayKey),
      year: countPeriod(stats.daily, toLocalDateKey(startOfYear(now)), todayKey)
    }
  };
}

function registerUserStart(msg, now = new Date()) {
  const stats = readStats();
  const userId = String(msg?.from?.id || '');
  const chatId = String(msg?.chat?.id || '');
  const nowIso = now.toISOString();
  const todayKey = toLocalDateKey(now);

  if (!userId) {
    return buildSummary(stats, now);
  }

  const existing = stats.users[userId];
  const startCount = Number(existing?.startCount || 0) + 1;

  stats.users[userId] = {
    id: userId,
    chatId,
    firstName: msg?.from?.first_name || existing?.firstName || '',
    lastName: msg?.from?.last_name || existing?.lastName || '',
    username: msg?.from?.username || existing?.username || '',
    firstSeenAt: existing?.firstSeenAt || nowIso,
    lastSeenAt: nowIso,
    startCount
  };

  if (!existing) {
    stats.lastAddedUserId = userId;
  }

  stats.lastActiveUserId = userId;
  stats.totals.startCount = Number(stats?.totals?.startCount || 0) + 1;

  if (!stats.daily[todayKey]) {
    stats.daily[todayKey] = {
      startCount: 0,
      uniqueUsers: []
    };
  }

  stats.daily[todayKey].startCount += 1;

  if (!stats.daily[todayKey].uniqueUsers.includes(userId)) {
    stats.daily[todayKey].uniqueUsers.push(userId);
  }

  writeStats(stats);
  return buildSummary(stats, now);
}

module.exports = {
  readStats,
  registerUserStart,
  buildSummary,
  statsFilePath
};
