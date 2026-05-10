const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', '..', 'data');
const supportFilePath = path.join(dataDir, 'support-inbox.json');
const STORE_VERSION = 1;

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function createEmptyStore() {
  return {
    version: STORE_VERSION,
    items: {}
  };
}

function readStore() {
  ensureDataDir();
  if (!fs.existsSync(supportFilePath)) return createEmptyStore();
  const raw = fs.readFileSync(supportFilePath, 'utf8').trim();
  if (!raw) return createEmptyStore();
  const parsed = JSON.parse(raw);
  return {
    version: Number(parsed.version || STORE_VERSION),
    items: parsed.items || {}
  };
}

function writeStore(store) {
  ensureDataDir();
  fs.writeFileSync(supportFilePath, JSON.stringify(store, null, 2), 'utf8');
}

function createSupportItem({ user, chatId, typeLabel, preview }) {
  const store = readStore();
  const id = crypto.randomUUID().slice(0, 8).toUpperCase();
  const item = {
    id,
    status: 'pending',
    userId: String(user?.id || ''),
    chatId: String(chatId || user?.id || ''),
    name: [user?.first_name || '', user?.last_name || ''].join(' ').trim() || 'Noma\'lum',
    username: user?.username ? `@${user.username}` : '@no_username',
    typeLabel: typeLabel || 'xabar',
    preview: String(preview || '').slice(0, 180),
    createdAt: new Date().toISOString(),
    answeredAt: ''
  };
  store.items[id] = item;
  writeStore(store);
  return item;
}

function markSupportAnswered(id) {
  if (!id) return null;
  const store = readStore();
  const item = store.items[String(id).toUpperCase()];
  if (!item) return null;
  item.status = 'answered';
  item.answeredAt = new Date().toISOString();
  store.items[item.id] = item;
  writeStore(store);
  return item;
}

function getPendingSupportItems(limit = 20) {
  const store = readStore();
  return Object.values(store.items)
    .filter((item) => item.status === 'pending')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

module.exports = {
  createSupportItem,
  markSupportAnswered,
  getPendingSupportItems,
  supportFilePath
};
