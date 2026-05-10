const config = require('../config');
const { logError } = require('../services/loggerService');

function extractChatId(text = '') {
  const match = text.match(/(?:💬\s*)?Chat ID:\s*(-?\d+)/i) || text.match(/UID:\s*(-?\d+)/i);
  return match ? match[1] : null;
}

function findTargetChatId(message, depth = 0) {
  if (!message || depth > 4) return null;

  const sourceText = message.text || message.caption || '';
  const directMatch = extractChatId(sourceText);
  if (directMatch) return directMatch;

  return findTargetChatId(message.reply_to_message, depth + 1);
}

async function sendDeliveryNotice(bot, msg, targetChatId, typeLabel) {
  await bot.sendMessage(
    msg.chat.id,
    `✅ ${typeLabel} foydalanuvchiga yuborildi.\n💬 Chat ID: ${targetChatId}`,
    {
      message_thread_id: msg.message_thread_id,
      reply_to_message_id: msg.message_id
    }
  );
}

async function handleAdminReply(bot, msg) {
  try {
    if (!config.adminGroupIds.includes(String(msg.chat.id))) return false;
    if (!msg.reply_to_message) return false;

    const targetChatId = findTargetChatId(msg.reply_to_message);
    if (!targetChatId) return false;

    if (msg.text) {
      await bot.sendMessage(targetChatId, msg.text);
      await sendDeliveryNotice(bot, msg, targetChatId, 'Xabar');
      return true;
    }
    if (msg.photo?.length) {
      const photo = msg.photo[msg.photo.length - 1];
      await bot.sendPhoto(targetChatId, photo.file_id, { caption: msg.caption || '' });
      await sendDeliveryNotice(bot, msg, targetChatId, 'Rasm');
      return true;
    }
    if (msg.video) {
      await bot.sendVideo(targetChatId, msg.video.file_id, { caption: msg.caption || '' });
      await sendDeliveryNotice(bot, msg, targetChatId, 'Video');
      return true;
    }
    if (msg.audio) {
      await bot.sendAudio(targetChatId, msg.audio.file_id, { caption: msg.caption || '' });
      await sendDeliveryNotice(bot, msg, targetChatId, 'Audio');
      return true;
    }
    if (msg.voice) {
      await bot.sendVoice(targetChatId, msg.voice.file_id);
      await sendDeliveryNotice(bot, msg, targetChatId, 'Voice');
      return true;
    }
    if (msg.document) {
      await bot.sendDocument(targetChatId, msg.document.file_id, { caption: msg.caption || '' });
      await sendDeliveryNotice(bot, msg, targetChatId, 'Fayl');
      return true;
    }
    if (msg.sticker) {
      await bot.sendSticker(targetChatId, msg.sticker.file_id);
      await sendDeliveryNotice(bot, msg, targetChatId, 'Sticker');
      return true;
    }

    return false;
  } catch (error) {
    await logError(bot, error, {
      place: 'handleAdminReply',
      userId: msg?.from?.id,
      chatId: msg?.chat?.id
    });
    return false;
  }
}

module.exports = { handleAdminReply };
