const config = require('../config');

function buildMiniAppButtonRow() {
  if (config.miniAppWebAppUrl) {
    return [{ text: 'Mini App 🌐', web_app: { url: config.miniAppWebAppUrl } }];
  }

  return [{ text: 'Mini App 🌐', url: config.miniAppUrl }];
}

function buildMenuKeyboard(tests, page) {
  const totalTests = tests.length;
  const start = (page - 1) * config.testsPerPage + 1;
  const end = Math.min(start + config.testsPerPage - 1, totalTests);

  const inline_keyboard = [];
  let row = [];

  for (let i = start; i <= end; i += 1) {
    row.push({ text: tests[i - 1].name, callback_data: `TEST_${i}` });
    if (row.length === 2) {
      inline_keyboard.push(row);
      row = [];
    }
  }

  if (row.length) {
    inline_keyboard.push(row);
  }

  const totalPages = Math.ceil(totalTests / config.testsPerPage);
  const navRow = [];
  if (page > 1) navRow.push({ text: '⬅️ Orqaga', callback_data: `PAGE_${page - 1}` });
  if (page < totalPages) navRow.push({ text: 'Keyingi ▶️', callback_data: `PAGE_${page + 1}` });
  if (navRow.length) inline_keyboard.push(navRow);

  inline_keyboard.push(buildMiniAppButtonRow());

  return { inline_keyboard };
}

module.exports = { buildMenuKeyboard, buildMiniAppButtonRow };
