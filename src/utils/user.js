function getUsername(user) {
  return user?.username ? `@${user.username}` : 'Username yo\'q';
}

function getFullName(user) {
  const fullName = [user?.first_name || '', user?.last_name || ''].join(' ').trim();
  return fullName || 'Noma\'lum';
}

function buildUserBlock(user, chatId) {
  return [
    `👤 ${getFullName(user)}`,
    `🔗 ${getUsername(user)}`,
    `🆔 ${user?.id || ''}`,
    `UID: ${user?.id || ''}`,
    `💬 Chat ID: ${chatId}`,
    `📱 Manba: Telegram Bot`
  ].join('\n');
}

module.exports = {
  getUsername,
  getFullName,
  buildUserBlock
};
