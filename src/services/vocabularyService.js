const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config');

let cachedPayload = null;
let cachedAt = 0;
const CACHE_MS = 1000 * 60 * 30;
const dataDir = path.join(__dirname, '..', '..', 'data');
const vocabularyCacheFilePath = path.join(dataDir, 'vocabulary-cache.json');

function normalizeString(value) {
  return String(value || '').trim();
}

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function saveVocabularyCache(payload) {
  ensureDataDir();
  fs.writeFileSync(vocabularyCacheFilePath, JSON.stringify(payload, null, 2), 'utf8');
}

function readVocabularyCache() {
  if (!fs.existsSync(vocabularyCacheFilePath)) {
    return null;
  }

  const raw = fs.readFileSync(vocabularyCacheFilePath, 'utf8').trim();
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.tests)) {
    return null;
  }

  return {
    items: parsed.items,
    tests: parsed.tests.map((test, index) => ({
      ...test,
      id: index + 1,
      name: `Test ${index + 1}`
    }))
  };
}

function removeDuplicates(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.arabic}__${item.uzbek}__${item.oneLessonId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeVocabularyPayload(raw) {
  let items = [];
  if (Array.isArray(raw)) items = raw;
  else if (raw && Array.isArray(raw.data)) items = raw.data;
  else if (raw && raw.data && Array.isArray(raw.data.items)) items = raw.data.items;
  else if (raw && Array.isArray(raw.result)) items = raw.result;
  else if (raw && Array.isArray(raw.rows)) items = raw.rows;

  return removeDuplicates(items.map((item, index) => ({
    id: item.id || `${item.oneLessonId || 'lesson'}-${index}`,
    arabic: normalizeString(item.arabic || item.word_ar || item.ar || item.arabicWord || item.vocabularyArabic || item.name_ar || item.title_ar || item.word),
    uzbek: normalizeString(item.uzbek || item.word_uz || item.uz || item.translation_uz || item.meaning_uz || item.translation || item.meaning || item.name_uz || item.title_uz),
    oneLessonId: Number(item.oneLessonId || item.one_lesson_id || item.lessonVocabularyId || 0) || 0
  }))).filter((item) => item.arabic && item.uzbek && item.oneLessonId);
}

function normalizeBooksPayload(rawBooks) {
  return (Array.isArray(rawBooks) ? rawBooks : []).map((book, bookIndex) => ({
    bookId: Number(book.bookId || book.id || bookIndex + 1),
    partOfBook: normalizeString(book.partOfBook || book.bookName || `Book ${bookIndex + 1}`),
    lessons: Array.isArray(book.lessons) ? book.lessons : []
  }));
}

function extractFallbackItemsFromBooks(books) {
  return removeDuplicates(books.flatMap((book) =>
    book.lessons.flatMap((lesson) =>
      (lesson.oneLesson?.oneLessonVocabularies || []).map((item, index) => ({
        id: item.id || `${lesson.oneLesson?.oneLessonId || lesson.lessonId}-${index}`,
        arabic: normalizeString(item.word || item.arabic),
        uzbek: normalizeString(item.translation || item.uzbek),
        oneLessonId: Number(item.oneLessonId || lesson.oneLesson?.oneLessonId || 0) || 0
      }))
    )
  )).filter((item) => item.arabic && item.uzbek && item.oneLessonId);
}

function buildLessonTests(books, vocabularyItems) {
  const vocabByLessonId = new Map();

  for (const item of vocabularyItems) {
    if (!vocabByLessonId.has(item.oneLessonId)) {
      vocabByLessonId.set(item.oneLessonId, []);
    }
    vocabByLessonId.get(item.oneLessonId).push(item);
  }

  const tests = [];

  for (const book of books) {
    for (const lesson of book.lessons) {
      const oneLessonId = Number(lesson.oneLesson?.oneLessonId || 0) || 0;
      if (!oneLessonId) continue;

      const items = vocabByLessonId.get(oneLessonId) || [];
      if (items.length < 4) continue;

      tests.push({
        id: tests.length + 1,
        bookId: book.bookId,
        oneLessonId,
        lessonId: Number(lesson.lessonId || 0) || 0,
        name: `Test ${tests.length + 1}`,
        items
      });
    }
  }

  return tests;
}

async function fetchStructuredVocabulary() {
  const [booksResponse, vocabularyResponse] = await Promise.all([
    axios.get(config.booksApiUrl, {
      timeout: 30000,
      headers: { Accept: 'application/json' }
    }),
    axios.get(config.apiUrl, {
      timeout: 30000,
      headers: { Accept: 'application/json' }
    })
  ]);

  const books = normalizeBooksPayload(booksResponse.data);
  const vocabularyItems = normalizeVocabularyPayload(vocabularyResponse.data);
  const mergedItems = vocabularyItems.length ? vocabularyItems : extractFallbackItemsFromBooks(books);
  const tests = buildLessonTests(books, mergedItems);

  if (!mergedItems.length || !tests.length) {
    throw new Error('API dan dars yoki lug\'at topilmadi.');
  }

  return {
    items: mergedItems,
    tests
  };
}

async function getStructuredVocabulary(force = false) {
  if (!force && cachedPayload && Date.now() - cachedAt < CACHE_MS) {
    return cachedPayload;
  }

  try {
    const payload = await fetchStructuredVocabulary();
    cachedPayload = payload;
    cachedAt = Date.now();
    saveVocabularyCache(payload);
    return cachedPayload;
  } catch (error) {
    const fallbackPayload = cachedPayload || readVocabularyCache();
    if (fallbackPayload) {
      cachedPayload = fallbackPayload;
      cachedAt = Date.now();
      return cachedPayload;
    }

    throw error;
  }
}

async function getVocabularyList(force = false) {
  const payload = await getStructuredVocabulary(force);
  return payload.items;
}

async function getLessonTests(force = false) {
  const payload = await getStructuredVocabulary(force);
  return payload.tests;
}

function groupIntoTests(items, questionsPerTest) {
  const fallback = [];
  for (let i = 0; i < items.length; i += questionsPerTest) {
    const chunk = items.slice(i, i + questionsPerTest);
    if (chunk.length >= 4) {
      fallback.push({
        id: fallback.length + 1,
        name: `Test ${fallback.length + 1}`,
        items: chunk
      });
    }
  }
  return fallback;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickQuestions(sourceItems, allItems, count) {
  const base = shuffle(sourceItems).slice(0, count);
  return base.map((item) => {
    const wrongPool = [...new Set(allItems.map((x) => x.uzbek).filter((value) => value && value !== item.uzbek))];
    const options = shuffle([item.uzbek, ...shuffle(wrongPool).slice(0, 3)]).slice(0, 4);
    return {
      arabic: item.arabic,
      correctAnswer: item.uzbek,
      options,
      correctIndex: options.indexOf(item.uzbek)
    };
  });
}

module.exports = {
  getVocabularyList,
  getLessonTests,
  groupIntoTests,
  pickQuestions,
  shuffle,
  vocabularyCacheFilePath
};
