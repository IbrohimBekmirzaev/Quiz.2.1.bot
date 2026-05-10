const config = require('../config');
const { showMenu, clearSession } = require('../services/quizService');
const { buildMiniAppButtonRow } = require('../services/menuService');
const { logStart, forwardUserSupport, logError } = require('../services/loggerService');
const { buildAdminStatsText } = require('../services/adminService');
const { handleAdminReply } = require('./adminReplyHandler');
const { getProfileView, getMiniAppBroadcastUsers } = require('../storage/miniAppStore');
const { getBroadcastUsers: getBotBroadcastUsers } = require('../storage/userStatsStore');

let pendingBroadcast = null;

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

function getAllBroadcastChatIds() {
  return [...new Set([
    ...getBotBroadcastUsers(),
    ...getMiniAppBroadcastUsers()
  ].map(String).filter(Boolean))];
}

async function sendBroadcast(bot, text) {
  const chatIds = getAllBroadcastChatIds();
  let sent = 0;
  let failed = 0;

  for (const chatId of chatIds) {
    try {
      await bot.sendMessage(chatId, text);
      sent += 1;
    } catch (_) {
      failed += 1;
    }
  }

  return { total: chatIds.length, sent, failed };
}

async function handleMessage(bot, msg) {
  try {
    const text = (msg.text || '').trim();

    if (config.adminGroupIds.includes(String(msg.chat.id))) {
      if (text === '/adminstats') {
        await bot.sendMessage(msg.chat.id, await buildAdminStatsText(), {
          message_thread_id: msg.message_thread_id
        });
        return;
      }

      if (text.startsWith('/broadcast')) {
        const message = text.replace('/broadcast', '').trim();
        if (!message) {
          await bot.sendMessage(msg.chat.id, 'Broadcast matnini yozing: /broadcast Bugungi challenge tayyor', {
            message_thread_id: msg.message_thread_id
          });
          return;
        }
        pendingBroadcast = {
          text: message,
          adminId: String(msg.from?.id || ''),
          createdAt: Date.now()
        };
        await bot.sendMessage(msg.chat.id, [
          '📣 Broadcast preview',
          '',
          message,
          '',
          `Qabul qiluvchilar: ${getAllBroadcastChatIds().length}`,
          'Yuborish: /confirmbroadcast',
          'Bekor qilish: /cancelbroadcast'
        ].join('\n'), {
          message_thread_id: msg.message_thread_id
        });
        return;
      }

      if (text === '/confirmbroadcast') {
        if (!pendingBroadcast) {
          await bot.sendMessage(msg.chat.id, 'Tasdiqlanadigan broadcast yo‘q.', {
            message_thread_id: msg.message_thread_id
          });
          return;
        }
        const result = await sendBroadcast(bot, pendingBroadcast.text);
        pendingBroadcast = null;
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
        pendingBroadcast = null;
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
      return;
    }

    if (text === '/menu') {
      clearSession(msg.chat.id);
      await showMenu(bot, msg.chat.id, 1);
      return;
    }

    if (text === '/help') {
      await bot.sendMessage(msg.chat.id, [
        'ℹ️ Yordam',
        '',
        '• /start - botni ochadi',
        '• /app - mini appni ochadi',
        '• /profile - natijalarimni ko‘rsatadi',
        '• /menu - testlar menyusini qayta ochadi',
        '• Testni tanlang, arabcha so\'zni o\'qing va tarjimani belgilang',
        '• Savolga javob topolmasangiz, oddiy xabar yozing. U adminga yuboriladi'
      ].join('\n'), {
        reply_markup: {
          inline_keyboard: [[{ text: 'Menyu 📚', callback_data: 'BACK_TO_MENU' }]]
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
