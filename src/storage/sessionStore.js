const sessions = new Map();

function get(chatId) {
  return sessions.get(String(chatId)) || null;
}

function set(chatId, value) {
  sessions.set(String(chatId), value);
}

function remove(chatId) {
  sessions.delete(String(chatId));
}

module.exports = {
  get,
  set,
  remove
};
