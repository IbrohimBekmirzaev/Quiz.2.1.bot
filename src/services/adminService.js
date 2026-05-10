const fs = require('fs');
const { formatDate } = require('../utils/time');
const { buildSummary, readStats } = require('../storage/userStatsStore');
const { getMiniAppAnalytics } = require('../storage/miniAppStore');
const { getLessonTests, vocabularyCacheFilePath } = require('./vocabularyService');

async function buildAdminStatsText() {
  const stats = buildSummary(readStats());
  const analytics = getMiniAppAnalytics();
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
    `• Mini app bugun open: ${analytics.opensToday}`,
    `• Mini app bugun quiz: ${analytics.quizzesToday}`,
    `• Open → Quiz: ${analytics.conversionRate}%`,
    '',
    '🆕 Oxirgi yangi foydalanuvchi',
    `• Ism: ${stats.lastAddedUser.name}`,
    `• Username: ${stats.lastAddedUser.username}`,
    `• Sana: ${stats.lastAddedUser.firstSeenAt ? formatDate(new Date(stats.lastAddedUser.firstSeenAt)) : 'Noma\'lum'}`,
    '',
    '🔥 Eng qiyin testlar',
    ...(analytics.hardestTests?.length
      ? analytics.hardestTests.slice(0, 3).map((item, index) => `• #${index + 1} ${item.name}: ${item.wrongRate}% xato`)
      : ['• Hali ma\'lumot yo\'q']),
    '',
    '🧩 Eng ko‘p xato so‘zlar',
    ...(analytics.topWeakWords?.length
      ? analytics.topWeakWords.slice(0, 5).map((item) => `• ${item.arabic} → ${item.correctAnswer}: ${item.count}`)
      : ['• Hali ma\'lumot yo\'q'])
  ].join('\n');
}

module.exports = {
  buildAdminStatsText
};
