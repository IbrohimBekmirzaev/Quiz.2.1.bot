const test = require('node:test');
const assert = require('node:assert/strict');

const { dayKey, getLevelInfo } = require('../src/storage/miniAppStore');

test('dayKey returns YYYY-MM-DD', () => {
  assert.equal(dayKey('2026-05-10T12:34:56.000Z'), '2026-05-10');
});

test('getLevelInfo maps points to tiers', () => {
  assert.equal(getLevelInfo(0).name, 'Bronze');
  assert.equal(getLevelInfo(45).name, 'Silver');
  assert.equal(getLevelInfo(120).name, 'Gold');
  assert.equal(getLevelInfo(220).name, 'Diamond');
});
