const config = require('../config');
const { showMenu, clearSession } = require('../services/quizService');
const { buildMiniAppButtonRow } = require('../services/menuService');
const { logStart, forwardUserSupport, logError } = require('../services/loggerService');
const { buildAdminStatsText } = require('../services/adminService');
const { handleAdminReply } = require('./adminReplyHandler');
const { getProfileView } = require('../storage/miniAppStore');
const {
  buildAdminPanelText,
  buildAdminPanelMarkup,
  buildGeneralHelpText,
  buildPendingText,
  buildTopText,
  buildUserInfoText,
  buildBroadcastHelpText,
  buildUserHelpText
} = require('../services/adminPanelService');
const {
  getBroadcastTargetCount,
  setPendingBroadcast,
  getPendingBroadcast,
  clearPendingBroadcast,
  sendBroadcastPayload
} = require('../services/broadcastService');

function isAdminUser(msg) {
  return config.adminUserIds.includes(String(msg.from?.id || ''));
}

function isAdminChat(msg) {
  return config.adminGroupIds.includes(String(msg.chat?.id || ''));
}

function isAdminCommand(text = '', msg = {}) {
  const caption = msg.caption || '';
  return [
    '/adminstats',
    '/pending',
    '/top',
    '/user',
    '/broadcast',
    '/confirmbroadcast',
    '/cancelbroadcast',
    '/adminhelp',
    '/admin',
    '/adminpanel',
    '/panel'
  ].some((command) => text === command || text.startsWith(`${command} `) || caption === command || caption.startsWith(`${command} `));
}

function buildProfileText(msg) {
  const profile = getProfileView({
    id: msg.from?.id,
    first_name: msg.from?.first_name,
    last_name: msg.from?.last_name,
    username: msg.from?.username
  });
  const total = profile.totalCorrect + profile.totalWrong;
  const accuracy = total ? Math.round((profile.totalCorrect / total) * 100) : 0;
  const lastResult = profile.recentResults?.[0];

  return [
    '👤 Mening profilim',
    `• Ism: ${profile.displayName}`,
    `• Level: ${profile.level?.name || 'Bronze'} (${profile.level?.progress || 0}%)`,
    `• Ball: ${profile.points}`,
    `• Reyting: ${profile.allTimeRank ? `#${profile.allTimeRank}` : '-'}`,
    `• Aniqlik: ${accuracy}%`,
    `• Streak: ${profile.streakDays || 0} kun`,
    `• Bugun: ${profile.today?.points || 0} ball, ${profile.today?.attempts || 0} urinish`,
    lastResult ? `• Oxirgi test: ${lastResult.testName} (${lastResult.percent}%)` : '• Oxirgi test: hali yo‘q'
  ].join('\n');
}

function getMediaPayloadFromMessage(msg, fallbackCaption = '') {
  if (msg.photo?.length) return { type: 'photo', fileId: msg.photo[msg.photo.length - 1].file_id, caption: fallbackCaption || msg.caption || '' };
  if (msg.video) return { type: 'video', fileId: msg.video.file_id, caption: fallbackCaption || msg.caption || '' };
  if (msg.audio) return { type: 'audio', fileId: msg.audio.file_id, caption: fallbackCaption || msg.caption || '' };
  if (msg.voice) return { type: 'voice', fileId: msg.voice.file_id, caption: fallbackCaption || msg.caption || '' };
  if (msg.document) return { type: 'document', fileId: msg.document.file_id, caption: fallbackCaption || msg.caption || '' };
  if (msg.animation) return { type: 'animation', fileId: msg.animation.file_id, caption: fallbackCaption || msg.caption || '' };
  if (msg.sticker) return { type: 'sticker', fileId: msg.sticker.file_id, caption: fallbackCaption || '' };
  return null;
}

function buildBroadcastPayload(msg, text) {
  const commandSource = msg.caption || text || '';
  const message = commandSource.replace('/broadcast', '').trim();
  const currentMedia = getMediaPayloadFromMessage(msg, message);
  if (currentMedia) return currentMedia;

  if (msg.reply_to_message) {
    const repliedMedia = getMediaPayloadFromMessage(msg.reply_to_message, message);
    if (repliedMedia) return repliedMedia;
  }

  return message ? { type: 'text', text: message } : null;
}

async function handleMessage(bot, msg) {
  try {
    const text = (msg.text || '').trim();
    const adminUser = isAdminUser(msg);
    const adminChat = isAdminChat(msg);

    if (adminChat || (adminUser && isAdminCommand(text, msg))) {
      if (adminChat && !adminUser) {
        return;
      }

      if (text === '/admin' || text === '/adminpanel' || text === '/panel') {
        await bot.sendMessage(msg.chat.id, buildAdminPanelText(), {
          message_thread_id: msg.message_thread_id,
          reply_markup: buildAdminPanelMarkup()
        });
        return;
      }

      if (text === '/adminhelp') {
        await bot.sendMessage(msg.chat.id, buildGeneralHelpText(true), {
          message_thread_id: msg.message_thread_id
        });
        return;
      }

      if (text === '/adminstats') {
        await bot.sendMessage(msg.chat.id, await buildAdminStatsText(), {
          message_thread_id: msg.message_thread_id,
          reply_markup: buildAdminPanelMarkup()
        });
        return;
      }

      if (text === '/broadcast') {
        await bot.sendMessage(msg.chat.id, buildBroadcastHelpText(), {
          message_thread_id: msg.message_thread_id
        });
        return;
      }

      if (text === '/user') {
        await bot.sendMessage(msg.chat.id, buildUserHelpText(), {
          message_thread_id: msg.message_thread_id
        });
        return;
      }

      if (text === '/pending') {
        await bot.sendMessage(msg.chat.id, buildPendingText(), {
          message_thread_id: msg.message_thread_id
        });
        return;
      }

      if (text === '/top') {
        await bot.sendMessage(msg.chat.id, buildTopText(), {
          message_thread_id: msg.message_thread_id
        });
        return;
      }

      if (text.startsWith('/user')) {
        const userId = text.split(/\s+/)[1];
        await bot.sendMessage(msg.chat.id, userId ? buildUserInfoText(userId) : 'Foydalanish: /user 7610350762', {
          message_thread_id: msg.message_thread_id
        });
        return;
      }

      if (text.startsWith('/broadcast') || (msg.caption || '').startsWith('/broadcast')) {
        const payload = buildBroadcastPayload(msg, text);
        if (!payload) {
          await bot.sendMessage(msg.chat.id, 'Broadcast matnini yozing yoki media captioniga /broadcast qo‘shing.', {
            message_thread_id: msg.message_thread_id
          });
          return;
        }
        setPendingBroadcast(payload, msg.from?.id);
        await bot.sendMessage(msg.chat.id, [
          '📣 Broadcast preview',
          '',
          payload.type === 'text' ? payload.text : `Turi: ${payload.type}\nCaption: ${payload.caption || 'yo‘q'}`,
          '',
          `Qabul qiluvchilar: ${getBroadcastTargetCount()}`
        ].join('\n'), {
          message_thread_id: msg.message_thread_id,
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Yuborish', callback_data: 'ADMIN_CONFIRM_BROADCAST' },
              { text: '❌ Bekor qilish', callback_data: 'ADMIN_CANCEL_BROADCAST' }
            ]]
          }
        });
        return;
      }

      if (text === '/confirmbroadcast') {
        const pendingBroadcast = getPendingBroadcast();
        if (!pendingBroadcast) {
          await bot.sendMessage(msg.chat.id, 'Tasdiqlanadigan broadcast yo‘q.', {
            message_thread_id: msg.message_thread_id
          });
          return;
        }
        const result = await sendBroadcastPayload(bot, pendingBroadcast.payload);
        clearPendingBroadcast();
        await bot.sendMessage(msg.chat.id, [
          '✅ Broadcast yuborildi',
          `• Jami: ${result.total}`,
          `• Yuborildi: ${result.sent}`,
          `• Xato: ${result.failed}`
        ].join('\n'), {
          message_thread_id: msg.message_thread_id
        });
        return;
      }

      if (text === '/cancelbroadcast') {
        clearPendingBroadcast();
        await bot.sendMessage(msg.chat.id, 'Broadcast bekor qilindi.', {
          message_thread_id: msg.message_thread_id
        });
        return;
      }

      await handleAdminReply(bot, msg);
      return;
    }

    if (text === '/start') {
      clearSession(msg.chat.id);
      await logStart(bot, msg);
      await showMenu(bot, msg.chat.id, 1);
      if (adminUser) {
        await bot.sendMessage(msg.chat.id, buildAdminPanelText(), {
          reply_markup: buildAdminPanelMarkup()
        });
      }
      return;
    }

    if (text === '/menu') {
      clearSession(msg.chat.id);
      await showMenu(bot, msg.chat.id, 1);
      return;
    }

    if (text === '/help') {
      await bot.sendMessage(msg.chat.id, buildGeneralHelpText(adminUser), {
        reply_markup: {
          inline_keyboard: adminUser
            ? [[{ text: '🔐 Admin panel', callback_data: 'ADMIN_PANEL' }], [{ text: 'Menyu 📚', callback_data: 'BACK_TO_MENU' }]]
            : [[{ text: 'Menyu 📚', callback_data: 'BACK_TO_MENU' }]]
        }
      });
      return;
    }

    if (text === '/profile') {
      await bot.sendMessage(msg.chat.id, buildProfileText(msg), {
        reply_markup: {
          inline_keyboard: [buildMiniAppButtonRow()]
        }
      });
      return;
    }

    if (text === '/top') {
      await bot.sendMessage(msg.chat.id, buildTopText());
      return;
    }

    if (text === '/app') {
      await bot.sendMessage(
        msg.chat.id,
        'Mini appni ochish uchun pastdagi tugmani bosing:',
        {
          reply_markup: {
            inline_keyboard: [buildMiniAppButtonRow()]
          }
        }
      );
      return;
    }

    if (text === '/random') {
      clearSession(msg.chat.id);
      await showMenu(bot, msg.chat.id, 1);
      return;
    }

    if (
      msg.text ||
      msg.photo ||
      msg.video ||
      msg.video_note ||
      msg.audio ||
      msg.voice ||
      msg.document ||
      msg.animation ||
      msg.sticker ||
      msg.location ||
      msg.contact ||
      msg.poll
    ) {
      await forwardUserSupport(bot, msg);
    }
  } catch (error) {
    await logError(bot, error, {
      place: 'handleMessage',
      userId: msg?.from?.id,
      chatId: msg?.chat?.id
    });
    if (msg?.chat?.id) {
      await bot.sendMessage(msg.chat.id, 'Xatolik yuz berdi. Keyinroq yana urinib ko\'ring.');
    }
  }
}

module.exports = { handleMessage };
