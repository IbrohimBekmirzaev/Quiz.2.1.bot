const config = require('../config');
const { buildAdminStatsText } = require('./adminService');
const { buildMiniAppButtonRow } = require('./menuService');
const { getLeaderboard, getProfileView } = require('../storage/miniAppStore');
const { getPendingSupportItems } = require('../storage/supportStore');
const { formatDate } = require('../utils/time');

function isAdminUserId(userId) {
  return config.adminUserIds.includes(String(userId || ''));
}

function buildAdminPanelText() {
  return [
    '🔐 Admin panel',
    '',
    'Kerakli bo‘limni tanlang. Bu menyu faqat admin ID’larga ishlaydi.',
    '',
    '• Statistika',
    '• Support inbox',
    '• Broadcast',
    '• User tekshirish',
    '• Reyting va Mini App'
  ].join('\n');
}

function buildAdminPanelMarkup() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Statistika', callback_data: 'ADMIN_STATS' },
        { text: '📥 Pending', callback_data: 'ADMIN_PENDING' }
      ],
      [
        { text: '🏆 Top 10', callback_data: 'ADMIN_TOP' },
        { text: '👤 User ID', callback_data: 'ADMIN_USER_HELP' }
      ],
      [
        { text: '📣 Broadcast', callback_data: 'ADMIN_BROADCAST_HELP' },
        { text: '🌐 Mini App', callback_data: 'ADMIN_APP' }
      ],
      [
        { text: 'ℹ️ Admin help', callback_data: 'ADMIN_HELP' },
        { text: '🔄 Yangilash', callback_data: 'ADMIN_PANEL' }
      ]
    ]
  };
}

function buildAdminHelpText() {
  return [
    '🔐 Admin komandalar',
    '',
    '• /admin - inline admin panel',
    '• /adminstats - umumiy statistika',
    '• /pending - javob kutilayotgan support xabarlar',
    '• /user ID - bitta foydalanuvchi ma’lumoti',
    '• /broadcast matn - hammaga xabar yuborish',
    '• Media captioniga /broadcast yozib rasm/video/voice yuborish mumkin',
    '• /confirmbroadcast - broadcastni tasdiqlash',
    '• /cancelbroadcast - broadcastni bekor qilish',
    '',
    'Maslahat: admin panel tugmalaridan foydalansangiz buyruqlarni eslab yurish shart emas.'
  ].join('\n');
}

function buildGeneralHelpText(admin = false) {
  const lines = [
    'ℹ️ Yordam',
    '',
    '• /start - botni ochadi',
    '• /app - mini appni ochadi',
    '• /profile - natijalarimni ko‘rsatadi',
    '• /top - top 10 reyting',
    '• /menu - testlar menyusini qayta ochadi',
    '• Testni tanlang, arabcha so\'zni o\'qing va tarjimani belgilang',
    '• Savolga javob topolmasangiz, oddiy xabar yozing. U adminga yuboriladi'
  ];

  if (admin) {
    lines.push('', buildAdminHelpText());
  }

  return lines.join('\n');
}

function buildPendingText() {
  const items = getPendingSupportItems(20);
  if (!items.length) return '✅ Javob kutilayotgan support xabar yo‘q.';
  return [
    '📥 Javob kutilayotgan xabarlar',
    '',
    ...items.map((item, index) => [
      `${index + 1}. SID: ${item.id}`,
      `👤 ${item.name} (${item.username})`,
      `UID: ${item.chatId}`,
      `Turi: ${item.typeLabel}`,
      `Vaqt: ${formatDate(new Date(item.createdAt))}`,
      item.preview ? `Matn: ${item.preview}` : ''
    ].filter(Boolean).join('\n'))
  ].join('\n\n');
}

function buildTopText() {
  const top = getLeaderboard().allTime.slice(0, 10);
  if (!top.length) return '🏆 Reyting hali bo‘sh.';
  return [
    '🏆 Top 10 reyting',
    '',
    ...top.map((item) => `#${item.rank} ${item.displayName} — ${item.points} ball, ✅ ${item.totalCorrect}, ❌ ${item.totalWrong}`)
  ].join('\n');
}

function buildUserInfoText(userId) {
  const profile = getProfileView({ id: userId, first_name: 'Foydalanuvchi' });
  const total = profile.totalCorrect + profile.totalWrong;
  const accuracy = total ? Math.round((profile.totalCorrect / total) * 100) : 0;
  return [
    '👤 User ma’lumoti',
    `• ID: ${profile.id}`,
    `• Ism: ${profile.displayName}`,
    `• Username: ${profile.username}`,
    `• Ball: ${profile.points}`,
    `• Reyting: ${profile.allTimeRank ? `#${profile.allTimeRank}` : '-'}`,
    `• Aniqlik: ${accuracy}%`,
    `• Testlar: ${profile.attempts}`,
    `• Bugun: ${profile.today?.points || 0} ball, ${profile.today?.attempts || 0} urinish`,
    `• Streak: ${profile.streakDays || 0} kun`,
    '',
    'Oxirgi natijalar',
    ...(profile.recentResults?.length
      ? profile.recentResults.slice(0, 5).map((item) => `• ${item.testName}: ${item.percent}% (✅ ${item.correct}, ❌ ${item.wrong})`)
      : ['• Hali natija yo‘q'])
  ].join('\n');
}

function buildUserHelpText() {
  return [
    '👤 User tekshirish',
    '',
    'Bitta foydalanuvchini ko‘rish uchun shunday yozing:',
    '/user 7610350762',
    '',
    'Chiqariladi: username, ball, reyting, aniqlik, testlar, oxirgi natijalar.'
  ].join('\n');
}

function buildBroadcastHelpText() {
  return [
    '📣 Broadcast yuborish',
    '',
    'Matn yuborish:',
    '/broadcast Bugungi dars tayyor',
    '',
    'Media yuborish:',
    'Rasm/video/voice yuboring va caption boshiga /broadcast yozing.',
    '',
    'Keyin tasdiqlash:',
    '/confirmbroadcast',
    '',
    'Bekor qilish:',
    '/cancelbroadcast'
  ].join('\n');
}

async function buildAdminCallbackResponse(data) {
  if (data === 'ADMIN_STATS') {
    return { text: await buildAdminStatsText(), markup: buildAdminPanelMarkup() };
  }

  if (data === 'ADMIN_PENDING') {
    return { text: buildPendingText(), markup: buildAdminPanelMarkup() };
  }

  if (data === 'ADMIN_TOP') {
    return { text: buildTopText(), markup: buildAdminPanelMarkup() };
  }

  if (data === 'ADMIN_USER_HELP') {
    return { text: buildUserHelpText(), markup: buildAdminPanelMarkup() };
  }

  if (data === 'ADMIN_BROADCAST_HELP') {
    return { text: buildBroadcastHelpText(), markup: buildAdminPanelMarkup() };
  }

  if (data === 'ADMIN_APP') {
    return {
      text: `🌐 Mini App:\n${config.miniAppWebAppUrl || config.miniAppUrl}`,
      markup: { inline_keyboard: [buildMiniAppButtonRow(), [{ text: '🔙 Admin panel', callback_data: 'ADMIN_PANEL' }]] }
    };
  }

  if (data === 'ADMIN_HELP') {
    return { text: buildAdminHelpText(), markup: buildAdminPanelMarkup() };
  }

  return { text: buildAdminPanelText(), markup: buildAdminPanelMarkup() };
}

module.exports = {
  isAdminUserId,
  buildAdminPanelText,
  buildAdminPanelMarkup,
  buildAdminHelpText,
  buildGeneralHelpText,
  buildPendingText,
  buildTopText,
  buildUserInfoText,
  buildUserHelpText,
  buildBroadcastHelpText,
  buildAdminCallbackResponse
};
