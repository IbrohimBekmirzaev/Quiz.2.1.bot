const { getMiniAppBroadcastUsers } = require('../storage/miniAppStore');
const { getBroadcastUsers: getBotBroadcastUsers } = require('../storage/userStatsStore');

let pendingBroadcast = null;

function getAllBroadcastChatIds() {
  return [...new Set([
    ...getBotBroadcastUsers(),
    ...getMiniAppBroadcastUsers()
  ].map(String).filter(Boolean))];
}

function getBroadcastTargetCount() {
  return getAllBroadcastChatIds().length;
}

function setPendingBroadcast(payload, adminId) {
  pendingBroadcast = {
    payload,
    adminId: String(adminId || ''),
    createdAt: Date.now()
  };
  return pendingBroadcast;
}

function getPendingBroadcast() {
  return pendingBroadcast;
}

function clearPendingBroadcast() {
  pendingBroadcast = null;
}

async function sendBroadcastPayload(bot, payload) {
  const chatIds = getAllBroadcastChatIds();
  let sent = 0;
  let failed = 0;

  for (const chatId of chatIds) {
    try {
      if (payload.type === 'photo') await bot.sendPhoto(chatId, payload.fileId, { caption: payload.caption || '' });
      else if (payload.type === 'video') await bot.sendVideo(chatId, payload.fileId, { caption: payload.caption || '' });
      else if (payload.type === 'audio') await bot.sendAudio(chatId, payload.fileId, { caption: payload.caption || '' });
      else if (payload.type === 'voice') await bot.sendVoice(chatId, payload.fileId, { caption: payload.caption || '' });
      else if (payload.type === 'document') await bot.sendDocument(chatId, payload.fileId, { caption: payload.caption || '' });
      else if (payload.type === 'animation') await bot.sendAnimation(chatId, payload.fileId, { caption: payload.caption || '' });
      else if (payload.type === 'sticker') await bot.sendSticker(chatId, payload.fileId);
      else await bot.sendMessage(chatId, payload.text || payload.caption || '');
      sent += 1;
    } catch (_) {
      failed += 1;
    }
  }

  return { total: chatIds.length, sent, failed };
}

module.exports = {
  getBroadcastTargetCount,
  setPendingBroadcast,
  getPendingBroadcast,
  clearPendingBroadcast,
  sendBroadcastPayload
};
