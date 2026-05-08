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
  loading: true
};

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

function renderHeader(profile) {
  return `
    <section class="hero">
      <div class="hero-head">
        <div>
          <div class="badge">Qalb Ul Arabiyya Mini App</div>
          <h1>Quiz Studio</h1>
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

function renderQuizSection(profile) {
  const tests = state.boot?.tests || [];
  const active = state.currentQuiz;
  const result = state.result;

  return `
    <section class="section ${state.tab === 'quiz' ? '' : 'hidden'}" id="tab-quiz">
      <div class="section-head">
        <div>
          <div class="badge">Quiz</div>
          <h2>Test paneli</h2>
          <p>Bot bilan bir xil testlar shu yerda ham ishlaydi.</p>
        </div>
        <button class="secondary-button" data-action="refresh">Yangilash</button>
      </div>
      ${active ? renderActiveQuiz(active) : ''}
      ${result ? renderQuizResult(result) : ''}
      <div class="test-list">
        ${tests.map((test) => `
          <article class="quiz-card ${active?.test?.id === test.id ? 'active' : ''}">
            <div class="quiz-row">
              <div class="test-index">${String(test.id).padStart(2, '0')}</div>
              <div>
                <strong>${escapeHtml(test.name)}</strong>
                <div class="muted">${test.questionCount} ta savol bazasi</div>
              </div>
              <button class="button" data-action="start-quiz" data-test-id="${test.id}">Boshlash</button>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderActiveQuiz(active) {
  const question = active.questions[active.currentIndex];
  if (!question) return '';

  return `
    <div class="question-card">
      <div class="question-progress">Savol ${active.currentIndex + 1}/${active.questions.length}</div>
      <div class="question-arabic">${escapeHtml(question.arabic)}</div>
      <div class="quiz-options">
        ${question.options.map((option, index) => `
          <button
            class="option-button ${state.selectedAnswers[active.currentIndex] === index ? 'selected' : ''}"
            data-action="choose-answer"
            data-option-index="${index}"
          >${escapeHtml(option)}</button>
        `).join('')}
      </div>
      <div class="row" style="margin-top: 14px">
        <button class="secondary-button" data-action="prev-question" ${active.currentIndex === 0 ? 'disabled' : ''}>Orqaga</button>
        ${active.currentIndex + 1 < active.questions.length
          ? '<button class="button" data-action="next-question">Keyingi savol</button>'
          : '<button class="button" data-action="finish-quiz">Testni yakunlash</button>'}
      </div>
    </div>
  `;
}

function renderQuizResult(result) {
  return `
    <div class="result-panel">
      <strong>So‘nggi natija</strong>
      <div class="muted" style="margin-top: 8px">${escapeHtml(result.testName)}</div>
      <div style="margin-top: 10px">✅ To‘g‘ri: ${result.correct}</div>
      <div>❌ Xato: ${result.wrong}</div>
      <div>📈 Foiz: ${result.percent}%</div>
    </div>
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
          <div class="badge">Reyting</div>
          <h2>Rating Board</h2>
          <p>Mini App ichida yechilgan testlar bo‘yicha shakllanadi.</p>
        </div>
      </div>
      <div class="rating-switch">
        <button class="${state.ratingMode === 'allTime' ? 'active' : ''}" data-action="rating-mode" data-mode="allTime">All-time</button>
        <button class="${state.ratingMode === 'weekly' ? 'active' : ''}" data-action="rating-mode" data-mode="weekly">7 kun</button>
      </div>
      <div class="top-three">
        ${top.map((item, index) => `
          <article class="leader-card ${index === 0 ? 'primary' : ''}">
            <div class="avatar" style="margin: 0 auto 12px; width: 72px; height: 72px">${item.avatarUrl ? `<img src="${item.avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials(item.displayName)}</div>
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
          <div class="badge">Profile</div>
          <h2>My Profile</h2>
          <p>Ko‘rinadigan nom va umumiy ko‘rsatkichlar.</p>
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
        <article class="stat-card">
          <small class="muted">All-time ball</small>
          <strong>${profile.points}</strong>
        </article>
        <article class="stat-card">
          <small class="muted">Aniqlik</small>
          <strong>${profile.totalCorrect + profile.totalWrong ? Math.round((profile.totalCorrect / (profile.totalCorrect + profile.totalWrong)) * 100) : 0}%</strong>
        </article>
        <article class="stat-card">
          <small class="muted">Weekly ball</small>
          <strong>${profile.weeklyPoints}</strong>
        </article>
        <article class="stat-card">
          <small class="muted">Urinishlar</small>
          <strong>${profile.attempts}</strong>
        </article>
        <article class="stat-card">
          <small class="muted">Reyting</small>
          <strong>#${profile.allTimeRank || '-'}</strong>
        </article>
        <article class="stat-card">
          <small class="muted">Best score</small>
          <strong>${profile.bestScore}%</strong>
        </article>
      </div>
    </section>
  `;
}

function renderTabs() {
  return `
    <nav class="tabs">
      ${['quiz', 'rating', 'profile'].map((tab) => `
        <button class="tab-button ${state.tab === tab ? 'active' : ''}" data-action="tab" data-tab="${tab}">
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
  app.innerHTML = `
    ${renderHeader(profile)}
    ${renderQuizSection(profile)}
    ${renderRatingSection()}
    ${renderProfileSection(profile)}
    ${renderTabs()}
  `;
}

async function bootstrap() {
  setTheme(state.theme);
  const data = await api('/api/mini-app/bootstrap', {
    user: getTelegramUser()
  });
  state.boot = data;
  render();
}

async function refreshBoot() {
  const data = await api('/api/mini-app/bootstrap', {
    user: getTelegramUser()
  });
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
    currentIndex: 0
  };
  state.selectedAnswers = new Array(data.questions.length).fill(null);
  state.result = null;
  state.tab = 'quiz';
  render();
}

async function finishQuiz() {
  const data = await api('/api/mini-app/quiz/finish', {
    user: getTelegramUser(),
    quizId: state.currentQuiz.quizId,
    answers: state.selectedAnswers
  });
  state.result = data;
  state.boot.user = data.profile;
  state.boot.leaderboard = data.leaderboard;
  state.currentQuiz = null;
  state.selectedAnswers = [];
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

  if (action === 'choose-answer') {
    state.selectedAnswers[state.currentQuiz.currentIndex] = Number(trigger.dataset.optionIndex);
    render();
    return;
  }

  if (action === 'prev-question') {
    state.currentQuiz.currentIndex = Math.max(0, state.currentQuiz.currentIndex - 1);
    render();
    return;
  }

  if (action === 'next-question') {
    state.currentQuiz.currentIndex = Math.min(state.currentQuiz.questions.length - 1, state.currentQuiz.currentIndex + 1);
    render();
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
