const config = require('../config');
const { formatDate } = require('../utils/time');
const { buildUserBlock } = require('../utils/user');
const { registerUserIfNew } = require('../storage/userStatsStore');

const targetFailureNoticeAt = new Map();
const FAILURE_NOTICE_COOLDOWN_MS = 1000 * 60 * 10;
const MEDIA_CAPTION_LIMIT = 1024;
const TEXT_MESSAGE_LIMIT = 4096;

function getSourceLabel(source = 'telegram_bot') {
  return source === 'mini_app' ? 'Mini App' : 'Telegram Bot';
}

function getShortStack(error) {
  const stack = String(error?.stack || '').trim();
  if (!stack) return '';
  return stack.split('\n').slice(0, 4).join('\n');
}

function truncateText(value = '', limit = 700) {
  const text = String(value || '').trim();
  if (!text || text.length <= limit) return text;
  return `${text.slice(0, limit - 3)}...`;
}

function getUserLine(user) {
  const fullName = [user?.first_name || '', user?.last_name || ''].join(' ').trim();
  return fullName || 'Noma\'lum';
}

function getSupportMessageType(msg = {}) {
  if (msg.voice) return { icon: '🎙️', label: 'voice xabari' };
  if (msg.photo?.length) return { icon: '📷', label: 'rasmi' };
  if (msg.video) return { icon: '🎥', label: 'video xabari' };
  if (msg.video_note) return { icon: '🎥', label: 'video note xabari' };
  if (msg.audio) return { icon: '🎧', label: 'audio xabari' };
  if (msg.document) return { icon: '📎', label: 'fayli' };
  if (msg.animation) return { icon: '🎞️', label: 'GIF xabari' };
  if (msg.sticker) return { icon: '🧩', label: 'sticker xabari' };
  if (msg.location) return { icon: '📍', label: 'location xabari' };
  if (msg.contact) return { icon: '☎️', label: 'contact xabari' };
  if (msg.poll) return { icon: '📊', label: 'poll xabari' };
  return { icon: '💬', label: 'xabar' };
}

function buildSupportLogText(msg, { includeOriginalText = true, captionLimit = MEDIA_CAPTION_LIMIT } = {}) {
  const type = getSupportMessageType(msg);
  const user = msg.from || {};
  const chatId = msg.chat?.id || user.id || 'Noma\'lum';
  const username = user.username ? `@${user.username}` : '@no_username';
  const originalText = includeOriginalText ? truncateText(msg.text || msg.caption || '', 900) : '';
  const lines = [
    `${type.icon} Foydalanuvchi ${type.label}`,
    `👤 ${getUserLine(user)}`,
    `🔗 ${username}`,
    `🆔 ${user.id || 'Noma\'lum'}`,
    `UID: ${chatId}`
  ];

  if (originalText) {
    lines.push('', originalText);
  }

  const text = lines.join('\n');
  if (text.length <= captionLimit) return text;
  return truncateText(text, captionLimit);
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

async function sendSupportPayload(bot, target, msg) {
  const textLog = buildSupportLogText(msg, {
    captionLimit: msg.text ? TEXT_MESSAGE_LIMIT : MEDIA_CAPTION_LIMIT
  });

  const common = {
    message_thread_id: target.topics.support
  };

  if (msg.text) {
    return bot.sendMessage(target.groupId, textLog, common);
  }
  if (msg.photo?.length) {
    const photo = msg.photo[msg.photo.length - 1];
    return bot.sendPhoto(target.groupId, photo.file_id, {
      ...common,
      caption: textLog
    });
  }
  if (msg.video) {
    return bot.sendVideo(target.groupId, msg.video.file_id, {
      ...common,
      caption: textLog
    });
  }
  if (msg.audio) {
    return bot.sendAudio(target.groupId, msg.audio.file_id, {
      ...common,
      caption: textLog
    });
  }
  if (msg.voice) {
    return bot.sendVoice(target.groupId, msg.voice.file_id, {
      ...common,
      caption: textLog
    });
  }
  if (msg.document) {
    return bot.sendDocument(target.groupId, msg.document.file_id, {
      ...common,
      caption: textLog
    });
  }
  if (msg.animation) {
    return bot.sendAnimation(target.groupId, msg.animation.file_id, {
      ...common,
      caption: textLog
    });
  }
  if (msg.sticker) {
    const sentInfo = await bot.sendMessage(target.groupId, textLog, common);
    return bot.sendSticker(target.groupId, msg.sticker.file_id, {
      ...common,
      reply_to_message_id: sentInfo.message_id
    });
  }
  if (msg.video_note) {
    const sentInfo = await bot.sendMessage(target.groupId, textLog, common);
    return bot.sendVideoNote(target.groupId, msg.video_note.file_id, {
      ...common,
      reply_to_message_id: sentInfo.message_id
    });
  }
  if (msg.location) {
    return bot.sendLocation(target.groupId, msg.location.latitude, msg.location.longitude, common)
      .then((sentLocation) => bot.sendMessage(target.groupId, textLog, {
        ...common,
        reply_to_message_id: sentLocation.message_id
      }));
  }
  if (msg.contact) {
    return bot.sendContact(target.groupId, msg.contact.phone_number, msg.contact.first_name, {
      ...common,
      last_name: msg.contact.last_name || undefined,
      vcard: msg.contact.vcard || undefined
    }).then((sentContact) => bot.sendMessage(target.groupId, textLog, {
      ...common,
      reply_to_message_id: sentContact.message_id
    }));
  }
  if (msg.poll) {
    return bot.sendMessage(target.groupId, textLog, common);
  }

  return bot.sendMessage(target.groupId, textLog, common);
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
  const deliveries = config.logTargets.map((target) => sendSupportPayload(bot, target, msg));
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
