const config = require('../config');
const { formatDate } = require('../utils/time');
const { buildUserBlock } = require('../utils/user');
const { registerUserStart } = require('../storage/userStatsStore');

async function sendTopicText(bot, topicId, text, extra = {}) {
  const deliveries = config.logTargets.map((target) => {
    const options = {
      disable_web_page_preview: true,
      ...extra
    };

    if (topicId !== undefined && topicId !== null) {
      options.message_thread_id = target.topics[topicId];
    }

    return bot.sendMessage(target.groupId, text, options);
  });

  const results = await Promise.allSettled(deliveries);
  const fulfilled = results.filter((result) => result.status === 'fulfilled');

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Log yuborilmadi. Group: ${config.logTargets[index].groupId}. Xato: ${result.reason.message}`);
    }
  });

  if (!fulfilled.length) {
    const firstRejected = results.find((result) => result.status === 'rejected');
    throw firstRejected.reason;
  }

  return results;
}

async function sendSupportPayload(bot, target, msg, header) {
  const sentHeader = await bot.sendMessage(target.groupId, header, {
    message_thread_id: target.topics.support
  });

  const common = {
    message_thread_id: target.topics.support,
    reply_to_message_id: sentHeader.message_id
  };

  if (msg.text) {
    return bot.sendMessage(target.groupId, msg.text, common);
  }
  if (msg.photo?.length) {
    const photo = msg.photo[msg.photo.length - 1];
    return bot.sendPhoto(target.groupId, photo.file_id, {
      ...common,
      caption: msg.caption || ''
    });
  }
  if (msg.video) {
    return bot.sendVideo(target.groupId, msg.video.file_id, {
      ...common,
      caption: msg.caption || ''
    });
  }
  if (msg.audio) {
    return bot.sendAudio(target.groupId, msg.audio.file_id, {
      ...common,
      caption: msg.caption || ''
    });
  }
  if (msg.voice) {
    return bot.sendVoice(target.groupId, msg.voice.file_id, common);
  }
  if (msg.document) {
    return bot.sendDocument(target.groupId, msg.document.file_id, {
      ...common,
      caption: msg.caption || ''
    });
  }
  if (msg.sticker) {
    return bot.sendSticker(target.groupId, msg.sticker.file_id, common);
  }

  return bot.sendMessage(target.groupId, 'Noma\'lum turdagi xabar keldi.', common);
}

async function logStart(bot, msg) {
  const text = [
    `🟢 ${config.botName}`,
    '',
    '📌 Hodisa: START',
    buildUserBlock(msg.from, msg.chat.id),
    `🕒 ${formatDate()}`,
    '',
    '✅ Foydalanuvchi botni ishga tushirdi'
  ].join('\n');
  return sendTopicText(bot, 'start', text);
}

async function logUserStats(bot, msg) {
  const stats = registerUserStart(msg);
  const sameUser = stats.lastAddedUser.id && stats.lastAddedUser.id === stats.lastActiveUser.id;
  const text = [
    `👥 ${config.botName}`,
    '',
    '📌 Foydalanuvchi statistikasi',
    `🕒 Yangilandi: ${formatDate()}`,
    '',
    `• Jami foydalanuvchilar: ${stats.totalUsers}`,
    `• Jami kirishlar: ${stats.totalStarts}`,
    '',
    '📅 Davrlar bo\'yicha',
    `• Bugun: ${stats.periods.day.uniqueUsers} foydalanuvchi, ${stats.periods.day.startCount} kirish`,
    `• Hafta: ${stats.periods.week.uniqueUsers} foydalanuvchi, ${stats.periods.week.startCount} kirish`,
    `• Oy: ${stats.periods.month.uniqueUsers} foydalanuvchi, ${stats.periods.month.startCount} kirish`,
    `• Yil: ${stats.periods.year.uniqueUsers} foydalanuvchi, ${stats.periods.year.startCount} kirish`,
    '',
    sameUser ? '🆕 Oxirgi foydalanuvchi' : '🆕 Oxirgi qo\'shilgan foydalanuvchi',
    `• Ism: ${stats.lastAddedUser.name}`,
    `• Username: ${stats.lastAddedUser.username}`,
    `• Sana: ${stats.lastAddedUser.firstSeenAt ? formatDate(new Date(stats.lastAddedUser.firstSeenAt)) : 'Noma\'lum'}`,
    `• Oxirgi kirish: ${stats.lastAddedUser.lastSeenAt ? formatDate(new Date(stats.lastAddedUser.lastSeenAt)) : 'Noma\'lum'}`,
    sameUser ? `• Jami kirishi: ${stats.lastAddedUser.startCount}` : `• Jami kirishi: ${stats.lastAddedUser.startCount}`,
    ...(sameUser ? [] : [
      '',
      '🙋 Oxirgi faol foydalanuvchi',
      `• Ism: ${stats.lastActiveUser.name}`,
      `• Username: ${stats.lastActiveUser.username}`,
      `• Oxirgi kirish: ${stats.lastActiveUser.lastSeenAt ? formatDate(new Date(stats.lastActiveUser.lastSeenAt)) : 'Noma\'lum'}`,
      `• Jami kirishi: ${stats.lastActiveUser.startCount}`
    ])
  ].join('\n');

  return sendTopicText(bot, 'users', text);
}

async function logQuizStarted(bot, msg, testName) {
  const text = [
    `📚 ${config.botName}`,
    '',
    '📌 Hodisa: QUIZ BOSHLANDI',
    buildUserBlock(msg.from, msg.chat.id),
    `📚 ${testName}`,
    `🕒 ${formatDate()}`
  ].join('\n');
  return sendTopicText(bot, 'quiz', text);
}

async function logQuizFinished(bot, msg, testName, correct, wrong) {
  const total = correct + wrong;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const text = [
    '📊 Test yakunlandi',
    '',
    `👤 ${msg.from?.first_name || 'Noma\'lum'}`,
    `🔗 ${msg.from?.username ? '@' + msg.from.username : 'Username yo\'q'}`,
    `🆔 ${msg.from?.id || ''}`,
    `UID: ${msg.from?.id || ''}`,
    '📱 Manba: Telegram Bot',
    '',
    `✅ To'g'ri: ${correct}`,
    `❌ Xato: ${wrong}`,
    `📈 Foiz: ${percent}%`,
    '',
    `📚 ${testName}`
  ].join('\n');
  return sendTopicText(bot, 'quiz', text);
}

async function logLink(bot, msg, label, url) {
  const text = [
    `🌐 ${config.botName}`,
    '',
    '📌 Hodisa: LINK',
    buildUserBlock(msg.from, msg.chat.id),
    `🔗 ${label}`,
    `🌍 ${url}`,
    `🕒 ${formatDate()}`
  ].join('\n');
  return sendTopicText(bot, 'link', text);
}

async function logError(bot, error, extra = {}) {
  const text = [
    '🚨 Error',
    '',
    `🤖 ${config.botName}`,
    `📝 Xato: ${error?.message || String(error)}`,
    `📍 Joy: ${extra.place || 'Noma\'lum'}`,
    `👤 User ID: ${extra.userId || 'Noma\'lum'}`,
    `💬 Chat ID: ${extra.chatId || 'Noma\'lum'}`,
    `🕒 ${formatDate()}`
  ].join('\n');

  try {
    await sendTopicText(bot, 'error', text);
  } catch (sendError) {
    console.error('Error topicga yuborishda xato:', sendError.message);
  }
}

async function forwardUserSupport(bot, msg) {
  const header = [
    `💬 ${config.botName}`,
    '',
    buildUserBlock(msg.from, msg.chat.id),
    `🕒 ${formatDate()}`
  ].join('\n');

  const deliveries = config.logTargets.map((target) => sendSupportPayload(bot, target, msg, header));
  const results = await Promise.allSettled(deliveries);
  const fulfilled = results.filter((result) => result.status === 'fulfilled');

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Support log yuborilmadi. Group: ${config.logTargets[index].groupId}. Xato: ${result.reason.message}`);
    }
  });

  if (!fulfilled.length) {
    const firstRejected = results.find((result) => result.status === 'rejected');
    throw firstRejected.reason;
  }
}

module.exports = {
  logStart,
  logUserStats,
  logQuizStarted,
  logQuizFinished,
  logLink,
  logError,
  forwardUserSupport,
  sendTopicText
};
