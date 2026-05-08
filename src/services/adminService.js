const fs = require('fs');
const { formatDate } = require('../utils/time');
const { buildSummary, readStats } = require('../storage/userStatsStore');
const { getLessonTests, vocabularyCacheFilePath } = require('./vocabularyService');

async function buildAdminStatsText() {
  const stats = buildSummary(readStats());
  const tests = await getLessonTests();
  const cacheExists = fs.existsSync(vocabularyCacheFilePath);

  return [
    '📊 Admin statistikasi',
    `🕒 ${formatDate()}`,
    '',
    `• Jami foydalanuvchilar: ${stats.totalUsers}`,
    `• Bugun yangi foydalanuvchilar: ${stats.periods.day}`,
    `• Hafta yangi foydalanuvchilar: ${stats.periods.week}`,
    `• Testlar soni: ${tests.length}`,
    `• Lug'at cache: ${cacheExists ? 'bor' : 'yo\'q'}`,
    '',
    '🆕 Oxirgi yangi foydalanuvchi',
    `• Ism: ${stats.lastAddedUser.name}`,
    `• Username: ${stats.lastAddedUser.username}`,
    `• Sana: ${stats.lastAddedUser.firstSeenAt ? formatDate(new Date(stats.lastAddedUser.firstSeenAt)) : 'Noma\'lum'}`
  ].join('\n');
}

module.exports = {
  buildAdminStatsText
};
