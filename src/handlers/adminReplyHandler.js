const config = require('../config');
const { logError } = require('../services/loggerService');
const { formatDate } = require('../utils/time');
const { markSupportAnswered } = require('../storage/supportStore');

function extractChatId(text = '') {
  const match = text.match(/(?:💬\s*)?Chat ID:\s*(-?\d+)/i) || text.match(/UID:\s*(-?\d+)/i);
  return match ? match[1] : null;
}

function extractSupportId(text = '') {
  const match = text.match(/SID:\s*([A-Z0-9-]+)/i);
  return match ? match[1].toUpperCase() : null;
}

function findTargetChatId(message, depth = 0) {
  if (!message || depth > 4) return null;

  const sourceText = message.text || message.caption || '';
  const directMatch = extractChatId(sourceText);
  if (directMatch) return directMatch;

  return findTargetChatId(message.reply_to_message, depth + 1);
}

function findSupportLogMessage(message, depth = 0) {
  if (!message || depth > 4) return null;
  const sourceText = message.text || message.caption || '';
  if (sourceText.includes('Holat: Javob kutilmoqda') || sourceText.includes('Holat: Javob berildi')) {
    return message;
  }
  return findSupportLogMessage(message.reply_to_message, depth + 1);
}

async function markSupportLogAnswered(bot, msg) {
  const logMessage = findSupportLogMessage(msg.reply_to_message);
  if (!logMessage) return;

  const sourceText = logMessage.text || logMessage.caption || '';
  if (!sourceText || sourceText.includes('Holat: Javob berildi')) return;
  markSupportAnswered(extractSupportId(sourceText));

  const updatedText = sourceText.replace(
    '⏳ Holat: Javob kutilmoqda',
    `✅ Holat: Javob berildi\n🕒 Javob vaqti: ${formatDate()}`
  );
  const options = {
    chat_id: msg.chat.id,
    message_id: logMessage.message_id
  };

  try {
    if (logMessage.caption !== undefined) {
      await bot.editMessageCaption(updatedText, options);
      return;
    }
    await bot.editMessageText(updatedText, options);
  } catch (error) {
    console.error('Support status yangilanmadi:', error.message);
  }
}

async function markReplyDelivered(bot, msg) {
  await markSupportLogAnswered(bot, msg);
}

async function handleAdminReply(bot, msg) {
  try {
    if (!config.adminGroupIds.includes(String(msg.chat.id))) return false;
    if (!msg.reply_to_message) return false;

    const targetChatId = findTargetChatId(msg.reply_to_message);
    if (!targetChatId) return false;

    if (msg.text) {
      await bot.sendMessage(targetChatId, msg.text);
      await markReplyDelivered(bot, msg);
      return true;
    }
    if (msg.photo?.length) {
      const photo = msg.photo[msg.photo.length - 1];
      await bot.sendPhoto(targetChatId, photo.file_id, { caption: msg.caption || '' });
      await markReplyDelivered(bot, msg);
      return true;
    }
    if (msg.video) {
      await bot.sendVideo(targetChatId, msg.video.file_id, { caption: msg.caption || '' });
      await markReplyDelivered(bot, msg);
      return true;
    }
    if (msg.audio) {
      await bot.sendAudio(targetChatId, msg.audio.file_id, { caption: msg.caption || '' });
      await markReplyDelivered(bot, msg);
      return true;
    }
    if (msg.voice) {
      await bot.sendVoice(targetChatId, msg.voice.file_id);
      await markReplyDelivered(bot, msg);
      return true;
    }
    if (msg.document) {
      await bot.sendDocument(targetChatId, msg.document.file_id, { caption: msg.caption || '' });
      await markReplyDelivered(bot, msg);
      return true;
    }
    if (msg.sticker) {
      await bot.sendSticker(targetChatId, msg.sticker.file_id);
      await markReplyDelivered(bot, msg);
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
