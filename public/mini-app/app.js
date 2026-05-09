const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const app = document.getElementById('app');
const state = {
  theme: localStorage.getItem('miniapp-theme') || 'dark',
  tab: 'quiz',
  ratingMode: 'allTime',
  boot: null,
  currentQuiz: null,
  selectedAnswers: [],
  result: null,
  timerNow: Date.now(),
  autoAdvanceLock: false
};

let timerHandle = null;

function getTelegramUser() {
  const user = tg?.initDataUnsafe?.user;
  if (user?.id) return user;

  const params = new URLSearchParams(window.location.search);
  return {
    id: params.get('id') || '7610350762',
    first_name: params.get('first_name') || 'Demo User',
    last_name: params.get('last_name') || '',
    username: params.get('username') || 'demo_user'
  };
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('miniapp-theme', theme);
}

async function api(path, payload = {}) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(json.error || 'So‘rovda xato yuz berdi');
  }
  return json.data;
}

function initials(name = 'U') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'U';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getProfile() {
  return state.boot?.user || null;
}

function getLeaderboardItems() {
  if (!state.boot?.leaderboard) return [];
  return state.ratingMode === 'weekly'
    ? state.boot.leaderboard.weekly
    : state.boot.leaderboard.allTime;
}

function getNextTestId(currentTestIndex) {
  const tests = state.boot?.tests || [];
  const currentIndex = tests.findIndex((test) => test.id === Number(currentTestIndex));
  if (currentIndex === -1) return null;
  return tests[currentIndex + 1]?.id || null;
}

function formatTime(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function getQuizStats() {
  if (!state.currentQuiz) {
    return { answered: 0, correct: 0, wrong: 0, percent: 0 };
  }

  let answered = 0;
  let correct = 0;
  let wrong = 0;

  state.currentQuiz.questions.forEach((question, index) => {
    const selected = state.selectedAnswers[index];
    if (selected === null || selected === undefined) return;
    answered += 1;
    if (selected === question.correctIndex) correct += 1;
    else wrong += 1;
  });

  return {
    answered,
    correct,
    wrong,
    percent: state.currentQuiz.questions.length ? Math.round((answered / state.currentQuiz.questions.length) * 100) : 0
  };
}

function getElapsedSeconds() {
  if (!state.currentQuiz?.startedAt) return 0;
  return Math.max(0, Math.floor((state.timerNow - state.currentQuiz.startedAt) / 1000));
}

function startTimer() {
  stopTimer();
  timerHandle = window.setInterval(() => {
    state.timerNow = Date.now();
    if (state.currentQuiz) render();
  }, 1000);
}

function stopTimer() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

function renderHeader(profile) {
  return `
    <section class="hero ${state.currentQuiz ? 'hero-compact' : ''}">
      <div class="hero-head">
        <div>
          <div class="badge">Telegram Quiz Mini App</div>
          <h1>${state.tab === 'rating' ? 'Rating Board' : state.tab === 'profile' ? 'My Profile' : 'Quiz Arena'}</h1>
          <p>Darslarni tanlang, quiz yeching va reytingda ko‘tariling.</p>
        </div>
        <button class="theme-toggle" data-action="toggle-theme">${state.theme === 'dark' ? '☀️' : '🌙'}</button>
      </div>
      <div class="profile-row">
        <div class="profile-card">
          <div class="avatar">${profile.avatarUrl ? `<img src="${profile.avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials(profile.displayName)}</div>
          <div>
            <strong>${escapeHtml(profile.displayName)}</strong>
            <small>ID ${escapeHtml(profile.id)}</small>
          </div>
        </div>
        <div class="counter-card">
          <small>Urinishlar</small>
          <strong>${profile.attempts}</strong>
        </div>
      </div>
    </section>
  `;
}

function renderQuizList(tests) {
  return `
    <div class="section-head">
      <div>
        <div class="badge">Test Selection</div>
        <h2>Quiz Panel</h2>
        <p>Test ustiga bossangiz shu dars ichiga kirib, quiz boshlanadi.</p>
      </div>
      <button class="secondary-button" data-action="refresh">Darslarni yangilash</button>
    </div>
    <div class="test-list">
      ${tests.map((test) => `
        <article class="quiz-card" data-action="start-quiz" data-test-id="${test.id}">
          <div class="quiz-row">
            <div class="test-index">${String(test.id).padStart(2, '0')}</div>
            <div>
              <strong>${escapeHtml(test.name)}</strong>
              <div class="muted">${test.questionCount} ta savol bazasi</div>
            </div>
            <button class="quiz-start-button" data-action="start-quiz" data-test-id="${test.id}">Boshlash</button>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function renderActiveQuiz() {
  const active = state.currentQuiz;
  if (!active) return '';

  if (active.result) {
    const nextTestId = getNextTestId(active.test.id);
    return `
      <section class="runner-screen">
        <div class="runner-topbar">
          <button class="runner-ghost" data-action="leave-quiz">Orqaga</button>
          <div class="runner-top-actions">
            <button class="runner-theme" data-action="toggle-theme">${state.theme === 'dark' ? '☀️' : '🌙'}</button>
          </div>
        </div>

        <div class="runner-copy">
          <div class="runner-badge">Natija</div>
          <h2 class="runner-title">${escapeHtml(active.result.testName)}</h2>
        </div>

        <div class="result-panel runner-result">
          <div style="margin-top: 4px">✅ To‘g‘ri: ${active.result.correct}</div>
          <div>❌ Xato: ${active.result.wrong}</div>
          <div>📈 Foiz: ${active.result.percent}%</div>
          <div class="row" style="margin-top:14px">
            <button class="secondary-button" data-action="restart-test" data-test-id="${active.test.id}">Qayta</button>
            ${nextTestId ? `<button class="button" data-action="start-quiz" data-test-id="${nextTestId}">Keyingi test</button>` : ''}
          </div>
        </div>
      </section>
    `;
  }

  const question = active.questions?.[active.currentIndex];
  if (!question) return '';

  const stats = getQuizStats();
  const progressPercent = Math.max(8, Math.round(((active.currentIndex + 1) / active.questions.length) * 100));
  const selectedIndex = state.selectedAnswers[active.currentIndex];
  const isLastQuestion = active.currentIndex + 1 === active.questions.length;

  return `
    <section class="runner-screen">
      <div class="runner-topbar">
        <button class="runner-ghost" data-action="leave-quiz">Orqaga</button>
        <div class="runner-top-actions">
          <button class="runner-theme" data-action="toggle-theme">${state.theme === 'dark' ? '☀️' : '🌙'}</button>
          <div class="runner-timer">
            <small>Time</small>
            <strong>${formatTime(getElapsedSeconds())}</strong>
          </div>
        </div>
      </div>

      <div class="runner-copy">
        <div class="runner-badge">${escapeHtml(active.test.name)}</div>
        <h2 class="runner-title">${escapeHtml(active.test.subtitle || 'So‘z boyligi testi')}</h2>
      </div>

      <div class="runner-metrics">
        <article class="metric-card">
          <small>Progress</small>
          <strong>${active.currentIndex + 1}/${active.questions.length}</strong>
        </article>
        <article class="metric-card success">
          <small>To‘g‘ri</small>
          <strong>${stats.correct}</strong>
        </article>
        <article class="metric-card danger">
          <small>Xato</small>
          <strong>${stats.wrong}</strong>
        </article>
      </div>

      <div class="runner-progress">
        <div class="runner-progress-bar" style="width:${progressPercent}%"></div>
      </div>

      <div class="runner-word">
        <div class="runner-arabic">${escapeHtml(question.arabic)}</div>
      </div>

      <div class="runner-options">
        ${question.options.map((option, index) => `
          <button
            class="runner-option ${selectedIndex === index ? 'selected' : ''}"
            data-action="choose-answer"
            data-option-index="${index}"
          >
            <span class="runner-option-index">${index + 1}</span>
            <span class="runner-option-label">${escapeHtml(option)}</span>
          </button>
        `).join('')}
      </div>

      <div class="runner-nav">
        <button class="runner-muted" data-action="prev-question" ${active.currentIndex === 0 ? 'disabled' : ''}>Oldingi</button>
        <button class="runner-primary" disabled>${isLastQuestion ? 'Yakunlanadi...' : 'Avto keyingi...'}</button>
      </div>
    </section>
  `;
}

function renderQuizResult(result) {
  return `
    <div class="result-panel">
      <div class="badge">Natija</div>
      <strong style="display:block;margin-top:10px">${escapeHtml(result.testName)}</strong>
      <div style="margin-top: 12px">✅ To‘g‘ri: ${result.correct}</div>
      <div>❌ Xato: ${result.wrong}</div>
      <div>📈 Foiz: ${result.percent}%</div>
    </div>
  `;
}

function renderQuizSection() {
  const tests = state.boot?.tests || [];

  return `
    <section class="section ${state.tab === 'quiz' ? '' : 'hidden'}" id="tab-quiz">
      ${state.currentQuiz ? renderActiveQuiz() : renderQuizList(tests)}
    </section>
  `;
}

function renderRatingSection() {
  const items = getLeaderboardItems();
  const top = items.slice(0, 3);
  const rest = items.slice(3, 20);

  return `
    <section class="section ${state.tab === 'rating' ? '' : 'hidden'}" id="tab-rating">
      <div class="section-head">
        <div>
          <div class="badge">Rating</div>
          <h2>Rating</h2>
          <p>Quiz yechgan foydalanuvchilar reytingi.</p>
        </div>
      </div>
      <div class="rating-switch">
        <button class="${state.ratingMode === 'allTime' ? 'active' : ''}" data-action="rating-mode" data-mode="allTime">All-time</button>
        <button class="${state.ratingMode === 'weekly' ? 'active' : ''}" data-action="rating-mode" data-mode="weekly">7 kun</button>
      </div>
      <div class="top-three">
        ${top.map((item, index) => `
          <article class="leader-card ${index === 0 ? 'primary' : ''}">
            <div class="avatar leader-avatar" style="margin: 0 auto 12px;">${item.avatarUrl ? `<img src="${item.avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials(item.displayName)}</div>
            <strong>#${item.rank}</strong>
            <div style="margin-top:8px">${escapeHtml(item.displayName)}</div>
            <div class="muted" style="margin-top:6px">${item.points} ball</div>
          </article>
        `).join('')}
      </div>
      <div class="leader-list">
        ${rest.map((item) => `
          <div class="leader-list-item">
            <strong>#${item.rank}</strong>
            <div>
              <div>${escapeHtml(item.displayName)}</div>
              <div class="muted">To‘g‘ri ${item.totalCorrect} | Xato ${item.totalWrong} | Urinish ${item.attempts}</div>
            </div>
            <strong>${item.points}</strong>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderProfileSection(profile) {
  return `
    <section class="section ${state.tab === 'profile' ? '' : 'hidden'}" id="tab-profile">
      <div class="section-head">
        <div>
          <div class="badge">User Profile</div>
          <h2>${escapeHtml(profile.displayName)}</h2>
          <p>Ko‘rinadigan nom va ko‘rsatkichlar.</p>
        </div>
      </div>
      <div class="profile-form">
        <input class="input" id="displayNameInput" value="${escapeHtml(profile.displayName)}" placeholder="Ko‘rinadigan nom" />
        <input class="input" id="avatarInput" value="${escapeHtml(profile.avatarUrl || '')}" placeholder="Avatar URL (ixtiyoriy)" />
        <div class="row">
          <button class="button" data-action="save-profile">Nomni saqlash</button>
        </div>
      </div>
      <div class="stats-grid">
        <article class="stat-card"><small class="muted">All-time ball</small><strong>${profile.points}</strong></article>
        <article class="stat-card"><small class="muted">Aniqlik</small><strong>${profile.totalCorrect + profile.totalWrong ? Math.round((profile.totalCorrect / (profile.totalCorrect + profile.totalWrong)) * 100) : 0}%</strong></article>
        <article class="stat-card"><small class="muted">Weekly ball</small><strong>${profile.weeklyPoints}</strong></article>
        <article class="stat-card"><small class="muted">Urinishlar</small><strong>${profile.attempts}</strong></article>
        <article class="stat-card"><small class="muted">Reyting</small><strong>#${profile.allTimeRank || '-'}</strong></article>
        <article class="stat-card"><small class="muted">Best score</small><strong>${profile.bestScore}%</strong></article>
      </div>
    </section>
  `;
}

function renderTabs() {
  return `
    <nav class="tabs">
      ${['quiz', 'rating', 'profile'].map((tab) => `
        <button class="tab-button ${state.tab === tab ? 'active' : ''} ${state.currentQuiz && tab !== 'quiz' ? 'disabled' : ''}" data-action="tab" data-tab="${tab}">
          ${tab === 'quiz' ? 'Quiz' : tab === 'rating' ? 'Rating' : 'Profile'}
        </button>
      `).join('')}
    </nav>
  `;
}

function render() {
  if (!state.boot) {
    app.innerHTML = `
      <div class="loading-screen">
        <div class="loading-badge">Mini App</div>
        <h1>Qalb Ul Arabiyya</h1>
        <p>Ma'lumotlar yuklanmoqda...</p>
      </div>
    `;
    return;
  }

  const profile = getProfile();
  if (state.currentQuiz) {
    app.innerHTML = `
      ${renderQuizSection()}
    `;
    return;
  }

  app.innerHTML = `
    ${renderHeader(profile)}
    ${renderQuizSection()}
    ${renderRatingSection()}
    ${renderProfileSection(profile)}
    ${renderTabs()}
  `;
}

async function bootstrap() {
  setTheme(state.theme);
  const data = await api('/api/mini-app/bootstrap', { user: getTelegramUser() });
  state.boot = data;
  render();
}

async function refreshBoot() {
  const data = await api('/api/mini-app/bootstrap', { user: getTelegramUser() });
  state.boot = data;
  render();
}

async function startQuiz(testId) {
  const data = await api('/api/mini-app/quiz/start', {
    user: getTelegramUser(),
    testIndex: Number(testId)
  });

  state.currentQuiz = {
    quizId: data.quizId,
    test: data.test,
    questions: data.questions,
    currentIndex: 0,
    startedAt: Date.now()
  };
  state.selectedAnswers = new Array(data.questions.length).fill(null);
  state.result = null;
  state.tab = 'quiz';
  state.timerNow = Date.now();
  state.autoAdvanceLock = false;
  startTimer();
  render();
}

async function finishQuiz() {
  const data = await api('/api/mini-app/quiz/finish', {
    user: getTelegramUser(),
    quizId: state.currentQuiz.quizId,
    answers: state.selectedAnswers
  });
  stopTimer();
  state.result = data;
  state.boot.user = data.profile;
  state.boot.leaderboard = data.leaderboard;
  state.currentQuiz = {
    ...state.currentQuiz,
    result: data
  };
  state.autoAdvanceLock = false;
  render();
}

async function saveProfile() {
  const displayName = document.getElementById('displayNameInput')?.value || '';
  const avatarUrl = document.getElementById('avatarInput')?.value || '';
  const data = await api('/api/mini-app/profile', {
    user: getTelegramUser(),
    profile: { displayName, avatarUrl }
  });
  state.boot.user = data;
  render();
}

function leaveQuiz() {
  stopTimer();
  state.currentQuiz = null;
  state.selectedAnswers = [];
  state.autoAdvanceLock = false;
  render();
}

function scheduleAutoAdvance() {
  if (!state.currentQuiz || state.autoAdvanceLock) return;
  state.autoAdvanceLock = true;
  const isLastQuestion = state.currentQuiz.currentIndex + 1 === state.currentQuiz.questions.length;

  window.setTimeout(async () => {
    if (!state.currentQuiz) {
      state.autoAdvanceLock = false;
      return;
    }

    if (isLastQuestion) {
      await finishQuiz();
      return;
    }

    state.currentQuiz.currentIndex += 1;
    state.autoAdvanceLock = false;
    render();
  }, 420);
}

document.addEventListener('click', async (event) => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;

  const action = trigger.dataset.action;

  if (action === 'toggle-theme') {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
    render();
    return;
  }

  if (action === 'tab') {
    if (state.currentQuiz && trigger.dataset.tab !== 'quiz') return;
    state.tab = trigger.dataset.tab;
    render();
    return;
  }

  if (action === 'rating-mode') {
    state.ratingMode = trigger.dataset.mode;
    render();
    return;
  }

  if (action === 'refresh') {
    await refreshBoot();
    return;
  }

  if (action === 'start-quiz') {
    await startQuiz(trigger.dataset.testId);
    return;
  }

  if (action === 'leave-quiz') {
    leaveQuiz();
    return;
  }

  if (action === 'choose-answer') {
    if (state.autoAdvanceLock) return;
    state.selectedAnswers[state.currentQuiz.currentIndex] = Number(trigger.dataset.optionIndex);
    render();
    scheduleAutoAdvance();
    return;
  }

  if (action === 'prev-question') {
    state.currentQuiz.currentIndex = Math.max(0, state.currentQuiz.currentIndex - 1);
    render();
    return;
  }

  if (action === 'next-question') {
    if (state.selectedAnswers[state.currentQuiz.currentIndex] === null) return;
    state.currentQuiz.currentIndex = Math.min(state.currentQuiz.questions.length - 1, state.currentQuiz.currentIndex + 1);
    render();
    return;
  }

  if (action === 'restart-test') {
    await startQuiz(trigger.dataset.testId);
    return;
  }

  if (action === 'finish-quiz') {
    await finishQuiz();
    return;
  }

  if (action === 'save-profile') {
    await saveProfile();
  }
});

bootstrap().catch((error) => {
  app.innerHTML = `
    <div class="loading-screen">
      <div class="loading-badge">Xatolik</div>
      <h1>Mini App yuklanmadi</h1>
      <p>${escapeHtml(error.message)}</p>
    </div>
  `;
});
