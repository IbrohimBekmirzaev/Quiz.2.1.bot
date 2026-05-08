const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatOptionLabel,
  buildPollQuestion,
  gradeAnswer,
  getNextTestIndex
} = require('../src/utils/quiz');

test('formatOptionLabel shortens long answers', () => {
  const label = formatOptionLabel('qalam, ruchka, yozuv uchun juda uzun tarif');
  assert.ok(label.includes('\n') || label.endsWith('...'));
});

test('buildPollQuestion returns helper text', () => {
  const text = buildPollQuestion('رَجُلٌ', 1, 10);
  assert.ok(text.includes('Arabcha so\'z'));
  assert.ok(text.includes('Tarjimani tanlang'));
  assert.ok(text.includes('1/10'));
});

test('gradeAnswer updates session counters', () => {
  const session = { correct: 0, wrong: 0, current: 0 };
  const isCorrect = gradeAnswer(session, 2, 2);
  assert.equal(isCorrect, true);
  assert.equal(session.correct, 1);
  assert.equal(session.wrong, 0);
  assert.equal(session.current, 1);
});

test('getNextTestIndex returns next test when available', () => {
  assert.equal(getNextTestIndex(2, 6), 3);
  assert.equal(getNextTestIndex(6, 6), null);
});
