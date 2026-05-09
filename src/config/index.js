require('dotenv').config();

function validateBotToken(value) {
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(value)) {
    throw new Error('BOT_TOKEN noto\'g\'ri formatda.');
  }
  return value;
}

function validateHttpUrl(name, value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`${name} http yoki https bo'lishi kerak.`);
    }
    return value;
  } catch (_) {
    throw new Error(`${name} noto'g'ri URL formatda.`);
  }
}

function isTelegramHost(value) {
  try {
    const url = new URL(value);
    return ['t.me', 'telegram.me', 'www.t.me', 'www.telegram.me'].includes(url.hostname);
  } catch (_) {
    return false;
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} topilmadi. .env faylni to'ldiring.`);
  }
  return value;
}

function toNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) {
    throw new Error(`${name} son bo'lishi kerak.`);
  }
  return n;
}

function optional(name, fallback = '') {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

function optionalNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) {
    throw new Error(`${name} son bo'lishi kerak.`);
  }
  return n;
}

function optionalCsv(name) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

const adminGroupId = required('ADMIN_GROUP_ID');
const primaryTopics = {
  start: toNumber('TOPIC_START_ID', 1),
  quiz: toNumber('TOPIC_QUIZ_ID', 2),
  link: toNumber('TOPIC_LINK_ID', 3),
  support: toNumber('TOPIC_SUPPORT_ID', 4),
  error: toNumber('TOPIC_ERROR_ID', 5),
  users: optionalNumber('TOPIC_USERS_ID', toNumber('TOPIC_START_ID', 1))
};

const secondLogGroupId = optional('SECOND_LOG_GROUP_ID');
const logTargets = [
  {
    groupId: adminGroupId,
    topics: primaryTopics
  }
];

if (secondLogGroupId) {
  logTargets.push({
    groupId: secondLogGroupId,
    topics: {
      start: optionalNumber('SECOND_TOPIC_START_ID', primaryTopics.start),
      quiz: optionalNumber('SECOND_TOPIC_QUIZ_ID', primaryTopics.quiz),
      link: optionalNumber('SECOND_TOPIC_LINK_ID', primaryTopics.link),
      support: optionalNumber('SECOND_TOPIC_SUPPORT_ID', primaryTopics.support),
      error: optionalNumber('SECOND_TOPIC_ERROR_ID', primaryTopics.error),
      users: optionalNumber('SECOND_TOPIC_USERS_ID', primaryTopics.users)
    }
  });
}

const adminGroupIds = logTargets.map((target) => String(target.groupId));
const railwayMiniAppUrl = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/mini-app`
  : '';
const rawMiniAppUrl = process.env.MINI_APP_URL || railwayMiniAppUrl || 'https://t.me/';
const miniAppUrl = validateHttpUrl('MINI_APP_URL', rawMiniAppUrl);
const miniAppWebAppUrl = !isTelegramHost(miniAppUrl)
  ? miniAppUrl
  : (railwayMiniAppUrl && !isTelegramHost(railwayMiniAppUrl) ? railwayMiniAppUrl : '');

module.exports = {
  botName: process.env.BOT_NAME || 'Qalb Ul Arabiyya Quiz boti',
  botToken: validateBotToken(required('BOT_TOKEN')),
  adminGroupId,
  topicStartId: primaryTopics.start,
  topicQuizId: primaryTopics.quiz,
  topicLinkId: primaryTopics.link,
  topicSupportId: primaryTopics.support,
  topicErrorId: primaryTopics.error,
  topicUsersId: primaryTopics.users,
  secondLogGroupId,
  adminGroupIds,
  adminUserIds: optionalCsv('ADMIN_USER_IDS'),
  logTargets,
  miniAppUrl,
  miniAppWebAppUrl,
  apiUrl: validateHttpUrl('API_URL', process.env.API_URL || 'https://bs.asmoarabic.com/api/getAllLessonVocabularies'),
  booksApiUrl: validateHttpUrl('BOOKS_API_URL', process.env.BOOKS_API_URL || 'https://bs.asmoarabic.com/api/getbooks'),
  questionsPerTest: toNumber('QUESTIONS_PER_TEST', 10),
  testsPerPage: toNumber('TESTS_PER_PAGE', 6)
};
