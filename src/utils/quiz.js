const OPTION_MAX_LENGTH = 26;

function shortenText(text, maxLength = OPTION_MAX_LENGTH) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function formatOptionLabel(value) {
  const normalized = String(value || '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= OPTION_MAX_LENGTH) {
    return normalized;
  }

  const parts = normalized.split(', ');
  if (parts.length > 1) {
    const firstLine = shortenText(parts[0], 18);
    const secondLine = shortenText(parts.slice(1).join(', '), 18);
    return `${firstLine}\n${secondLine}`;
  }

  return shortenText(normalized);
}

function buildArabicPrompt(arabic, index, total) {
  return [
    arabic,
    '',
    `(${index}/${total})`
  ].join('\n');
}

function buildPollQuestion() {
  return 'Javobni tanlang';
}

function gradeAnswer(session, correctIndex, selectedIndex) {
  const isCorrect = selectedIndex === correctIndex;
  if (isCorrect) session.correct += 1;
  else session.wrong += 1;

  session.current += 1;
  return isCorrect;
}

function getNextTestIndex(currentIndex, totalTests) {
  if (currentIndex < totalTests) {
    return currentIndex + 1;
  }
  return null;
}

module.exports = {
  OPTION_MAX_LENGTH,
  formatOptionLabel,
  buildArabicPrompt,
  buildPollQuestion,
  gradeAnswer,
  getNextTestIndex
};
