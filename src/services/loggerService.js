const config = require('../config');
const { formatDate } = require('../utils/time');
const { buildUserBlock } = require('../utils/user');
const { registerUserIfNew } = require('../storage/userStatsStore');

const targetFailureNoticeAt = new Map();
const FAILURE_NOTICE_COOLDOWN_MS = 1000 * 60 * 10;

function getSourceLabel(source = 'telegram_bot') {
  return source === 'mini_app' ? 'Mini App' : 'Telegram Bot';
}

function getShortStack(error) {
  const stack = String(error?.stack || '').trim();
  if (!stack) return '';
  return stack.split('\n').slice(0, 4).join('\n');
}

async function notifySecondaryTargetFailure(bot, target, reason, topicKey = 'error') {
  const primaryTarget = config.logTargets[0];
  if (!primaryTarget || String(primaryTarget.groupId) === String(target.groupId)) return;

  const noticeKey = `${target.groupId}:${topicKey}`;
  const lastSentAt = targetFailureNoticeAt.get(noticeKey) || 0;
  if (Date.now() - lastSentAt < FAILURE_NOTICE_COOLDOWN_MS) return;
  targetFailureNoticeAt.set(noticeKey, Date.now());

  try {
    await bot.sendMessage(primaryTarget.groupId, [
      '⚠️ Ikkinchi log guruhi ishlamadi',
      `• Group ID: ${target.groupId}`,
      `• Topic: ${topicKey}`,
      `• Xato: ${reason?.message || String(reason)}`,
      `• Vaqt: ${formatDate()}`
    ].join('\n'), {
      message_thread_id: primaryTarget.topics.error
    });
  } catch (_) {}
}

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

  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      console.error(`Log yuborilmadi. Group: ${config.logTargets[index].groupId}. Xato: ${result.reason.message}`);
      await notifySecondaryTargetFailure(bot, config.logTargets[index], result.reason, topicId);
    }
  }

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
  const registration = registerUserIfNew(msg);
  if (!registration.isNewUser) {
    return null;
  }

  const { stats } = registration;
  const text = [
    `🟢 ${config.botName}`,
    '',
    '📌 Yangi foydalanuvchi',
    `🕒 ${formatDate()}`,
    '',
    `• Ism: ${stats.lastAddedUser.name}`,
    `• Username: ${stats.lastAddedUser.username}`,
    `• User ID: ${stats.lastAddedUser.id || 'Noma\'lum'}`,
    `💬 Chat ID: ${stats.lastAddedUser.chatId || 'Noma\'lum'}`,
    `• Sana: ${stats.lastAddedUser.firstSeenAt ? formatDate(new Date(stats.lastAddedUser.firstSeenAt)) : 'Noma\'lum'}`,
    '',
    `• Jami foydalanuvchilar: ${stats.totalUsers}`,
    `• Bugun qo'shilganlar: ${stats.periods.day}`,
    `• Hafta qo'shilganlar: ${stats.periods.week}`
  ].join('\n');

  return sendTopicText(bot, 'users', text);
}

async function logQuizStarted(bot, msg, testName, source = 'telegram_bot') {
  const text = [
    '📚 Quiz boshlandi',
    `👤 ${msg.from?.first_name || 'Noma\'lum'}`,
    `🔗 ${msg.from?.username ? `@${msg.from.username}` : '@no_username'}`,
    `🆔 ${msg.from?.id || 'Noma\'lum'}`,
    `💬 Chat ID: ${msg.chat?.id || 'Noma\'lum'}`,
    `📚 ${testName}`,
    `📱 ${getSourceLabel(source)}`,
    `🕒 ${formatDate()}`
  ].join('\n');
  return sendTopicText(bot, 'quiz', text);
}

async function logQuizFinished(bot, msg, testName, correct, wrong, source = 'telegram_bot') {
  const total = correct + wrong;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const text = [
    '📊 Test yakunlandi',
    `👤 ${msg.from?.first_name || 'Noma\'lum'}`,
    `🔗 ${msg.from?.username ? `@${msg.from.username}` : '@no_username'}`,
    `🆔 ${msg.from?.id || 'Noma\'lum'}`,
    `💬 Chat ID: ${msg.chat?.id || 'Noma\'lum'}`,
    `✅ To'g'ri: ${correct}`,
    `❌ Xato: ${wrong}`,
    `📈 Foiz: ${percent}%`,
    `📚 ${testName}`,
    `📱 ${getSourceLabel(source)}`,
    `🕒 ${formatDate()}`
  ].join('\n');
  return sendTopicText(bot, 'quiz', text);
}

async function logLink(bot, msg, label, url, source = 'telegram_bot') {
  const text = [
    `🌐 ${config.botName}`,
    '',
    '📌 Hodisa: LINK',
    buildUserBlock(msg.from, msg.chat.id),
    `🔗 ${label}`,
    `🌍 ${url}`,
    `📱 ${getSourceLabel(source)}`,
    `🕒 ${formatDate()}`
  ].join('\n');
  return sendTopicText(bot, 'link', text);
}

async function logError(bot, error, extra = {}) {
  const shortStack = getShortStack(error);
  const text = [
    '🚨 Error',
    '',
    `🤖 ${config.botName}`,
    `📝 Xato: ${error?.message || String(error)}`,
    `📍 Joy: ${extra.place || 'Noma\'lum'}`,
    `👤 User ID: ${extra.userId || 'Noma\'lum'}`,
    `💬 Chat ID: ${extra.chatId || 'Noma\'lum'}`,
    `🕒 ${formatDate()}`,
    ...(shortStack ? ['', shortStack] : [])
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

  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      console.error(`Support log yuborilmadi. Group: ${config.logTargets[index].groupId}. Xato: ${result.reason.message}`);
      await notifySecondaryTargetFailure(bot, config.logTargets[index], result.reason, 'support');
    }
  }

  if (!fulfilled.length) {
    const firstRejected = results.find((result) => result.status === 'rejected');
    throw firstRejected.reason;
  }
}

module.exports = {
  logStart,
  logQuizStarted,
  logQuizFinished,
  logLink,
  logError,
  forwardUserSupport,
  sendTopicText
};
