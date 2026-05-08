const sessions = new Map();
const pollToChat = new Map();

function get(chatId) {
  return sessions.get(String(chatId)) || null;
}

function set(chatId, value) {
  sessions.set(String(chatId), value);
}

function remove(chatId) {
  sessions.delete(String(chatId));
}

function linkPoll(pollId, chatId) {
  pollToChat.set(String(pollId), String(chatId));
}

function getChatIdByPoll(pollId) {
  return pollToChat.get(String(pollId)) || null;
}

function unlinkPoll(pollId) {
  pollToChat.delete(String(pollId));
}

module.exports = {
  get,
  set,
  remove,
  linkPoll,
  getChatIdByPoll,
  unlinkPoll
};
