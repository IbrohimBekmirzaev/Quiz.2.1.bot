const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatOptionLabel,
  buildArabicPrompt,
  buildPollQuestion,
  gradeAnswer,
  getNextTestIndex
} = require('../src/utils/quiz');
const { pickQuestions } = require('../src/services/vocabularyService');

test('formatOptionLabel shortens long answers', () => {
  const label = formatOptionLabel('qalam, ruchka, yozuv uchun juda uzun tarif');
  assert.ok(label.includes('\n') || label.endsWith('...'));
});

test('buildArabicPrompt returns arabic word and progress', () => {
  const text = buildArabicPrompt('رَجُلٌ', 1, 10);
  assert.ok(text.includes('رَجُلٌ'));
  assert.ok(text.includes('1/10'));
});

test('buildPollQuestion stays short', () => {
  assert.equal(buildPollQuestion(), 'Javobni tanlang');
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

test('pickQuestions always keeps a valid correct option index', () => {
  const sourceItems = [
    { arabic: 'رَجُلٌ', uzbek: 'kishi' },
    { arabic: 'كِتَابٌ', uzbek: 'kitob' },
    { arabic: 'بَابٌ', uzbek: 'eshik' },
    { arabic: 'قَلَمٌ', uzbek: 'qalam' }
  ];

  const allItems = [
    ...sourceItems,
    { arabic: 'مِفْتَاحٌ', uzbek: 'kalit' },
    { arabic: 'مَسْجِدٌ', uzbek: 'masjid' },
    { arabic: 'بُرْتُقَالٌ', uzbek: 'apelsin' }
  ];

  const questions = pickQuestions(sourceItems, allItems, 4);
  assert.equal(questions.length, 4);

  for (const question of questions) {
    assert.ok(question.correctIndex >= 0);
    assert.ok(question.correctIndex < question.options.length);
    assert.equal(question.options[question.correctIndex], question.correctAnswer);
  }
});
