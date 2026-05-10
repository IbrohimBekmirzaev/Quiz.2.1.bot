const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

function syncTelegramViewport() {
  const root = document.documentElement;
  const viewportHeight = tg?.viewportHeight ? `${tg.viewportHeight}px` : '100dvh';
  const stableHeight = tg?.viewportStableHeight ? `${tg.viewportStableHeight}px` : viewportHeight;
  const safeBottom = tg?.safeAreaInset?.bottom ?? tg?.contentSafeAreaInset?.bottom ?? 0;
  const safeTop = tg?.safeAreaInset?.top ?? tg?.contentSafeAreaInset?.top ?? 0;

  root.style.setProperty('--app-height', viewportHeight);
  root.style.setProperty('--app-stable-height', stableHeight);
  root.style.setProperty('--safe-bottom', `${safeBottom}px`);
  root.style.setProperty('--safe-top', `${safeTop}px`);
}

syncTelegramViewport();
if (tg?.onEvent) {
  tg.onEvent('viewportChanged', syncTelegramViewport);
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
  autoAdvanceLock: false,
  profileAvatarDraft: null,
  onboardingStep: 0,
  avatarCropSource: null,
  avatarCropScale: 1,
  toast: null,
  rankCelebration: null
};

let timerHandle = null;
let toastTimer = null;

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

function haptic(kind = 'selection') {
  const apiRef = tg?.HapticFeedback;
  if (!apiRef) return;

  try {
    if (kind === 'success') {
      apiRef.notificationOccurred('success');
      return;
    }
    if (kind === 'error') {
      apiRef.notificationOccurred('error');
      return;
    }
    if (kind === 'impact') {
      apiRef.impactOccurred('light');
      return;
    }
    apiRef.selectionChanged();
  } catch (_) {
    // no-op
  }
}

function showToast(message, tone = 'info') {
  if (!message) return;
  state.toast = {
    message: String(message),
    tone
  };

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 2800);

  render();
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

function formatTime(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function getProfile() {
  return state.boot?.user || null;
}

function getCurrentUserId() {
  return String(getProfile()?.id || '');
}

function getLeaderboardItems() {
  if (!state.boot?.leaderboard) return [];
  return state.ratingMode === 'weekly'
    ? state.boot.leaderboard.weekly
    : state.boot.leaderboard.allTime;
}

function getCurrentUserLeaderboardItem() {
  return getLeaderboardItems().find((item) => item.id === getCurrentUserId()) || null;
}

function getNextTestId(currentTestIndex) {
  const tests = state.boot?.tests || [];
  const currentIndex = tests.findIndex((test) => test.id === Number(currentTestIndex));
  if (currentIndex === -1) return null;
  return tests[currentIndex + 1]?.id || null;
}

function getChallengeTimeLeft() {
  const endsAt = state.boot?.dailyChallenge?.endsAt;
  if (!endsAt) return '';
  const diff = Math.max(0, new Date(endsAt).getTime() - Date.now());
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours} soat ${minutes} daqiqa qoldi`;
}

function buildShareText(result) {
  return `📊 ${result.testName}\n✅ ${result.correct}\n❌ ${result.wrong}\n📈 ${result.percent}%`;
}

async function generateResultShareFile(result) {
  const card = result.shareCard || {
    title: result.testName,
    percent: result.percent,
    correct: result.correct,
    wrong: result.wrong,
    level: state.boot?.user?.level?.name || 'Bronze',
    challengeCompletedToday: false
  };

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, '#10203b');
  gradient.addColorStop(0.55, '#14284a');
  gradient.addColorStop(1, '#09111f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glow = ctx.createRadialGradient(980, 110, 30, 980, 110, 400);
  glow.addColorStop(0, 'rgba(69,185,255,0.28)');
  glow.addColorStop(1, 'rgba(69,185,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#8ea7cf';
  ctx.font = '700 34px Manrope, sans-serif';
  ctx.fillText('Qalb Ul Arabiyya Quiz', 72, 96);

  ctx.fillStyle = '#f2f7ff';
  ctx.font = '800 78px Manrope, sans-serif';
  ctx.fillText(card.title || 'Quiz Result', 72, 190);

  ctx.fillStyle = '#96a9c7';
  ctx.font = '600 36px Manrope, sans-serif';
  ctx.fillText(`Level: ${card.level || 'Bronze'}`, 72, 246);

  const panels = [
    { x: 72, y: 320, w: 280, h: 210, label: 'To‘g‘ri', value: String(card.correct), color: '#58d58f' },
    { x: 400, y: 320, w: 280, h: 210, label: 'Xato', value: String(card.wrong), color: '#ff6767' },
    { x: 728, y: 320, w: 280, h: 210, label: 'Foiz', value: `${card.percent}%`, color: '#45b9ff' }
  ];

  for (const panel of panels) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(panel.x, panel.y, panel.w, panel.h, 32);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8ea7cf';
    ctx.font = '700 28px Manrope, sans-serif';
    ctx.fillText(panel.label, panel.x + 28, panel.y + 54);
    ctx.fillStyle = panel.color;
    ctx.font = '800 82px Manrope, sans-serif';
    ctx.fillText(panel.value, panel.x + 28, panel.y + 142);
  }

  if (card.challengeCompletedToday) {
    ctx.fillStyle = 'rgba(88,213,143,0.10)';
    ctx.strokeStyle = 'rgba(88,213,143,0.45)';
    ctx.beginPath();
    ctx.roundRect(72, 790, 936, 120, 28);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#dff8ea';
    ctx.font = '800 36px Manrope, sans-serif';
    ctx.fillText('⚡ Daily challenge bajarildi', 106, 864);
  }

  ctx.fillStyle = '#8ea7cf';
  ctx.font = '600 30px Manrope, sans-serif';
  ctx.fillText(`@${(state.boot?.user?.username || 'arabiyya_quiz_bot').replace(/^@/, '')}`, 72, 1260);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return new File([blob], `quiz-result-${Date.now()}.png`, { type: 'image/png' });
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
  if (!timerHandle) return;
  clearInterval(timerHandle);
  timerHandle = null;
}

function renderHeader(profile) {
  return `
    <section class="hero ${state.currentQuiz ? 'hero-compact' : ''}">
      <div class="hero-head">
        <div>
          <div class="badge">Telegram Quiz Mini App</div>
          <h1>${state.tab === 'rating' ? 'Rating Board' : state.tab === 'profile' ? 'My Profile' : state.tab === 'admin' ? 'Admin Hub' : 'Quiz Arena'}</h1>
          <p>Darslarni tanlang, quiz yeching va reytingda ko‘tariling.</p>
        </div>
        <button class="theme-toggle" data-action="toggle-theme">${state.theme === 'dark' ? '☀️' : '🌙'}</button>
      </div>
      <div class="profile-row">
        <div class="profile-card">
          <div class="avatar">${profile.avatarUrl ? `<img src="${profile.avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials(profile.displayName)}</div>
          <div>
            <strong>${escapeHtml(profile.displayName)}</strong>
            <small>${escapeHtml(profile.level?.name || 'Bronze')} • ID ${escapeHtml(profile.id)}</small>
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
  const dailyChallenge = state.boot?.dailyChallenge;
  const resumableQuiz = state.boot?.activeQuiz;
  const weakWords = state.boot?.user?.weakWords || [];

  return `
    ${resumableQuiz ? `
      <div class="resume-card resume-priority-card">
        <div>
          <div class="badge">Continue</div>
          <strong>${escapeHtml(resumableQuiz.test.name)}</strong>
          <div class="muted">${resumableQuiz.currentIndex + 1}/${resumableQuiz.questions.length} savolda to‘xtagansiz</div>
          <div class="muted">Shu joydan davom etsangiz natija saqlanib ketadi.</div>
        </div>
        <button class="button" data-action="resume-quiz">Davom etish</button>
      </div>
    ` : ''}
    ${dailyChallenge ? `
      <div class="challenge-card">
        <div>
          <div class="badge">Daily Challenge</div>
          <strong>${escapeHtml(dailyChallenge.name)}</strong>
          <div class="muted">${dailyChallenge.questionCount} ta savol • bugungi maxsus test</div>
          <div class="muted">${getChallengeTimeLeft()}</div>
          <div class="muted">🔥 Challenge streak: ${dailyChallenge.streak || 0} kun</div>
          <div class="challenge-reward">${dailyChallenge.completedToday ? '✅ Bugun bajarilgan' : '🏅 ' + escapeHtml(dailyChallenge.rewardTitle || 'Bonus badge')}</div>
        </div>
        <button class="button" data-action="start-daily-challenge" data-test-id="${dailyChallenge.id}">Boshlash</button>
      </div>
    ` : ''}
    ${weakWords.length ? `
      <div class="resume-card">
        <div>
          <div class="badge">Weak Words Retry</div>
          <strong>Xato qilingan so‘zlar testi</strong>
          <div class="muted">${weakWords.length} ta eng ko‘p xato qilingan so‘zni qayta mustahkamlang</div>
        </div>
        <button class="button" data-action="start-weak-quiz">Boshlash</button>
      </div>
    ` : ''}
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
              <div class="muted">${test.questionCount} ta savol bazasi${test.isDailyChallenge ? ' • Daily' : ''}</div>
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

        ${active.result.profile?.challengeCompletedToday ? `
          <div class="challenge-done-banner">⚡ Daily challenge bajarildi • streak ${active.result.profile.challengeStreak || 0} kun</div>
        ` : ''}

        <div class="result-panel runner-result premium-result">
          <div class="premium-result-grid">
            <article class="premium-result-stat success">
              <small>To‘g‘ri</small>
              <strong>${active.result.correct}</strong>
            </article>
            <article class="premium-result-stat danger">
              <small>Xato</small>
              <strong>${active.result.wrong}</strong>
            </article>
            <article class="premium-result-stat highlight">
              <small>Foiz</small>
              <strong>${active.result.percent}%</strong>
            </article>
          </div>
          <div class="row premium-result-actions">
            <button class="secondary-button" data-action="restart-test" data-test-id="${active.test.id}">Qayta</button>
            ${Number(active.test.id) === 9000 && active.result.wrong > 0 ? '<button class="button" data-action="start-weak-quiz">Yana mustahkamlash</button>' : ''}
            ${nextTestId ? `<button class="button" data-action="start-quiz" data-test-id="${nextTestId}">Keyingi test</button>` : ''}
            <button class="secondary-button" data-action="share-result">Ulashish</button>
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

function renderQuizSection() {
  return `
      <section class="section ${state.currentQuiz ? 'runner-shell' : ''} ${state.tab === 'quiz' ? '' : 'hidden'}" id="tab-quiz">
      ${state.currentQuiz ? renderActiveQuiz() : renderQuizList(state.boot?.tests || [])}
    </section>
  `;
}

function renderRatingSection() {
  const items = getLeaderboardItems();
  const top = items.slice(0, 3);
  const rest = items.slice(3, 20);
  const podium = [top[1], top[0], top[2]].filter(Boolean);
  const currentUserId = getCurrentUserId();
  const myRank = getCurrentUserLeaderboardItem();
  const weeklyWinners = state.boot?.analytics?.weeklyWinners || state.boot?.leaderboard?.weekly?.slice(0, 3) || [];

  return `
    <section class="section ${state.tab === 'rating' ? '' : 'hidden'}" id="tab-rating">
      <div class="section-head">
        <div>
          <div class="badge">Rating</div>
          <h2>Rating Board</h2>
          <p>Mini app ichida yechilgan testlar bo‘yicha jonli reyting.</p>
        </div>
      </div>
      <div class="rating-switch">
        <button class="${state.ratingMode === 'allTime' ? 'active' : ''}" data-action="rating-mode" data-mode="allTime">All-time</button>
        <button class="${state.ratingMode === 'weekly' ? 'active' : ''}" data-action="rating-mode" data-mode="weekly">7 kun</button>
      </div>
      ${weeklyWinners.length ? `
        <div class="weekly-banner">
          <div class="badge">Weekly Winners</div>
          <div class="weekly-winners">
            ${weeklyWinners.map((item) => `
              <div class="weekly-winner-pill">
                <span>#${item.rank}</span>
                <strong>${escapeHtml(item.displayName)}</strong>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      <div class="top-three podium">
        ${podium.map((item) => `
          <article class="leader-card ${item.rank === 1 ? 'primary podium-center' : 'podium-side'} ${item.id === currentUserId ? 'leader-self' : ''}">
            <div class="podium-rank">${item.rank === 1 ? '👑 ' : ''}#${item.rank}</div>
            <div class="avatar leader-avatar">${item.avatarUrl ? `<img src="${item.avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials(item.displayName)}</div>
            <strong class="podium-name">${escapeHtml(item.displayName)}</strong>
            <div class="muted podium-points">${item.points} ball</div>
          </article>
        `).join('')}
      </div>
      ${myRank ? `
        <div class="my-rank-card leader-self leaderboard-live-card ${state.rankCelebration ? 'rank-up-celebration' : ''}">
          <div class="my-rank-copy">
            <div class="badge">Mening o‘rnim</div>
            <strong>#${myRank.rank} ${escapeHtml(myRank.displayName)}</strong>
            <div class="muted">${myRank.points} ball • To‘g‘ri ${myRank.totalCorrect} • Xato ${myRank.totalWrong}</div>
          </div>
          <div class="avatar my-rank-avatar">${myRank.avatarUrl ? `<img src="${myRank.avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials(myRank.displayName)}</div>
        </div>
      ` : ''}
      <div class="leader-list">
        ${rest.map((item) => `
          <div class="leader-list-item ${item.id === currentUserId ? 'leader-self' : ''}">
            <strong>#${item.rank}</strong>
            <div class="avatar leader-list-avatar">${item.avatarUrl ? `<img src="${item.avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials(item.displayName)}</div>
            <div>
              <div>${escapeHtml(item.displayName)}</div>
              <div class="muted">${escapeHtml(item.username)}</div>
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
  const avatarPreview = state.profileAvatarDraft !== null ? state.profileAvatarDraft : (profile.avatarUrl || '');
  const accuracy = profile.totalCorrect + profile.totalWrong
    ? Math.round((profile.totalCorrect / (profile.totalCorrect + profile.totalWrong)) * 100)
    : 0;
  const levelProgress = Math.max(0, Math.min(100, Number(profile.level?.progress || 0)));
  const rankText = profile.allTimeRank ? `#${profile.allTimeRank}` : '-';
  const today = profile.today || { attempts: 0, correct: 0, wrong: 0, points: 0 };
  const weeklyGrowth = Number(profile.weeklyGrowth || 0);
  const topWeakWords = (profile.weakWords || []).slice(0, 5);

  return `
    <section class="section ${state.tab === 'profile' ? '' : 'hidden'}" id="tab-profile">
      <div class="section-head">
        <div>
          <div class="badge">Profile</div>
          <h2>Mening Profilim</h2>
          <p>Natijalar, daraja va sozlamalar bitta joyda.</p>
        </div>
      </div>

      <div class="profile-clean-hero">
        <div class="avatar profile-clean-avatar">${avatarPreview ? `<img src="${avatarPreview}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials(profile.displayName)}</div>
        <div class="profile-clean-main">
          <div class="badge">${escapeHtml(profile.level?.name || 'Bronze')}</div>
          <h3>${escapeHtml(profile.displayName)}</h3>
          <p>${escapeHtml(profile.username)} • ID ${escapeHtml(profile.id)}</p>
          <div class="profile-level-row clean">
            <span>Level progress</span>
            <strong>${levelProgress}%</strong>
          </div>
          <div class="profile-level-bar"><span style="width:${levelProgress}%"></span></div>
        </div>
      </div>

      <div class="profile-overview-grid">
        <article class="stat-card profile-stat featured"><small class="muted">Jami ball</small><strong>${profile.points}</strong></article>
        <article class="stat-card profile-stat accuracy"><small class="muted">Aniqlik</small><strong>${accuracy}%</strong></article>
        <article class="stat-card profile-stat"><small class="muted">Reyting</small><strong>${rankText}</strong></article>
        <article class="stat-card profile-stat"><small class="muted">Urinishlar</small><strong>${profile.attempts}</strong></article>
      </div>

      <div class="profile-compact-grid">
        <article class="profile-compact-card">
          <div class="badge">Bugun</div>
          <strong>${today.points} ball</strong>
          <span>${today.attempts} urinish • ✅ ${today.correct} • ❌ ${today.wrong}</span>
        </article>
        <article class="profile-compact-card">
          <div class="badge">Haftalik o‘sish</div>
          <strong>${weeklyGrowth >= 0 ? '+' : ''}${weeklyGrowth}</strong>
          <span>Bu hafta ${profile.weeklyPoints || 0} ball</span>
        </article>
      </div>

      <div class="profile-panel">
        <div class="profile-panel-head">
          <div>
            <div class="badge">Sozlamalar</div>
            <strong>Profil ko‘rinishi</strong>
          </div>
        </div>
        <input class="input" id="displayNameInput" value="${escapeHtml(profile.displayName)}" placeholder="Ko‘rinadigan nom" />
        <input type="file" id="avatarFileInput" accept="image/*" class="hidden-file-input" />
        <label class="reminder-toggle">
          <input type="checkbox" id="remindersEnabledInput" ${profile.remindersEnabled ? 'checked' : ''} />
          <span>Eslatmalarni yoqish</span>
        </label>
        <div class="row">
          <button class="secondary-button" data-action="pick-avatar">Avatar yuklash</button>
          <button class="button" data-action="save-profile">Saqlash</button>
          ${avatarPreview ? '<button class="secondary-button" data-action="remove-avatar">Avatarni olib tashlash</button>' : ''}
        </div>
      </div>

      <div class="profile-extras">
        <section class="extra-card">
          <div class="badge">Faollik</div>
          <div class="extra-stat-row">
            <div><small class="muted">Hozirgi</small><strong>${profile.streakDays} kun</strong></div>
            <div><small class="muted">Eng yaxshi</small><strong>${profile.bestStreak} kun</strong></div>
            <div><small class="muted">Jami savol</small><strong>${profile.totalQuestions || 0}</strong></div>
          </div>
          <div class="muted profile-sub-note">Challenge streak: ${profile.challengeStreak || 0} • Eng yaxshi: ${profile.bestChallengeStreak || 0}</div>
        </section>

        <section class="extra-card">
          <div class="badge">Eng yaxshi natija</div>
          <div class="history-list">
            ${profile.bestAttempt ? `
              <div class="history-item">
                <strong>${escapeHtml(profile.bestAttempt.testName)}</strong>
                <div class="muted">📈 ${profile.bestAttempt.percent}% • ✅ ${profile.bestAttempt.correct} • ❌ ${profile.bestAttempt.wrong}</div>
              </div>
            ` : '<div class="muted">Eng yaxshi test hali yo‘q</div>'}
          </div>
        </section>

        <section class="extra-card">
          <div class="badge">Yutuqlar</div>
          <div class="badge-grid">
            ${profile.badges?.length ? profile.badges.map((badge) => `
              <div class="achievement-pill">
                <span>${badge.icon}</span>
                <strong>${escapeHtml(badge.label)}</strong>
              </div>
            `).join('') : '<div class="muted">Hali badge yo‘q</div>'}
          </div>
        </section>

        <section class="extra-card">
          <div class="badge">Oxirgi natijalar</div>
          <div class="history-list">
            ${profile.recentResults?.length ? profile.recentResults.map((item) => `
              <div class="history-item">
                <strong>${escapeHtml(item.testName)}</strong>
                <div class="muted">✅ ${item.correct} • ❌ ${item.wrong} • 📈 ${item.percent}%</div>
              </div>
            `).join('') : '<div class="muted">Hali natijalar yo‘q</div>'}
          </div>
        </section>

        <section class="extra-card">
          <div class="badge">Mustahkamlash</div>
          <div class="weak-list">
            ${topWeakWords.length ? topWeakWords.map((item) => `
              <div class="weak-item">
                <strong>${escapeHtml(item.arabic)}</strong>
                <span>${escapeHtml(item.correctAnswer)}</span>
                <small>${item.count} marta</small>
              </div>
            `).join('') : '<div class="muted">Weak words hali yo‘q</div>'}
          </div>
          ${topWeakWords.length ? '<button class="secondary-button weak-retry-button" data-action="start-weak-quiz">Top 5 so‘zdan test</button>' : ''}
        </section>

        ${state.boot?.analytics ? `
          <section class="extra-card analytics-card">
            <div class="badge">Admin Analytics</div>
            <div class="analytics-grid">
              <div><small class="muted">Bugun open</small><strong>${state.boot.analytics.opensToday}</strong></div>
              <div><small class="muted">Bugun quiz</small><strong>${state.boot.analytics.quizzesToday}</strong></div>
              <div><small class="muted">Jami profil</small><strong>${state.boot.analytics.totalProfiles}</strong></div>
              <div><small class="muted">Jami urinish</small><strong>${state.boot.analytics.totalAttempts}</strong></div>
            </div>
            ${state.boot.analytics.topTest ? `<div class="muted">Eng ko‘p ishlatilgan test: ${escapeHtml(state.boot.analytics.topTest.name)} (${state.boot.analytics.topTest.count})</div>` : ''}
            ${state.boot.analytics.mostActiveUser ? `<div class="muted">Eng faol user: ${escapeHtml(state.boot.analytics.mostActiveUser.displayName)} (${state.boot.analytics.mostActiveUser.count})</div>` : ''}
          </section>
        ` : ''}
      </div>
    </section>
  `;
}

function renderAdminSection() {
  if (!state.boot?.analytics) return '';
  const analytics = state.boot.analytics;
  return `
    <section class="section ${state.tab === 'admin' ? '' : 'hidden'}" id="tab-admin">
      <div class="section-head">
        <div>
          <div class="badge">Admin Dashboard</div>
          <h2>Mini App Analytics</h2>
          <p>Kunlik va umumiy ko‘rsatkichlar.</p>
        </div>
      </div>
      <div class="profile-scoreboard">
        <article class="stat-card profile-stat"><small class="muted">Bugun open</small><strong>${analytics.opensToday}</strong></article>
        <article class="stat-card profile-stat"><small class="muted">Bugun active user</small><strong>${analytics.activeUsersToday}</strong></article>
        <article class="stat-card profile-stat"><small class="muted">Bugun quiz</small><strong>${analytics.quizzesToday}</strong></article>
        <article class="stat-card profile-stat"><small class="muted">Jami profil</small><strong>${analytics.totalProfiles}</strong></article>
        <article class="stat-card profile-stat"><small class="muted">Jami urinish</small><strong>${analytics.totalAttempts}</strong></article>
        <article class="stat-card profile-stat"><small class="muted">Open → Quiz</small><strong>${analytics.conversionRate}%</strong></article>
      </div>
      ${analytics.topTests?.length ? `
        <div class="extra-card">
          <div class="badge">Top 5 Tests</div>
          <div class="history-list">
            ${analytics.topTests.map((item, index) => `
              <div class="history-item">
                <strong>#${index + 1} ${escapeHtml(item.name)}</strong>
                <div class="muted">${item.count} marta ishlatilgan</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      ${analytics.mostActiveUser ? `<div class="extra-card"><div class="badge">Most Active</div><strong>${escapeHtml(analytics.mostActiveUser.displayName)}</strong><div class="muted">${analytics.mostActiveUser.count} urinish</div></div>` : ''}
      ${analytics.activeUsersTop?.length ? `
        <div class="extra-card">
          <div class="badge">Eng faol userlar</div>
          <div class="history-list">
            ${analytics.activeUsersTop.map((item, index) => `
              <div class="history-item">
                <strong>#${index + 1} ${escapeHtml(item.displayName)}</strong>
                <div class="muted">${item.count} urinish</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      ${analytics.hardestTests?.length ? `
        <div class="extra-card">
          <div class="badge">Eng qiyin testlar</div>
          <div class="history-list">
            ${analytics.hardestTests.map((item, index) => `
              <div class="history-item">
                <strong>#${index + 1} ${escapeHtml(item.name)}</strong>
                <div class="muted">Xato ulushi ${item.wrongRate}% • ${item.attempts} urinish</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      ${analytics.topWeakWords?.length ? `
        <div class="extra-card">
          <div class="badge">Eng ko‘p xato so‘zlar</div>
          <div class="weak-list">
            ${analytics.topWeakWords.slice(0, 5).map((item) => `
              <div class="weak-item">
                <strong>${escapeHtml(item.arabic)}</strong>
                <span>${escapeHtml(item.correctAnswer)}</span>
                <small>${item.count} marta</small>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </section>
  `;
}

function renderOnboarding() {
  const profile = getProfile();
  if (!profile || profile.hasSeenOnboarding) return '';

  const slides = [
    { emoji: '🎯', title: 'Quiz Arena', text: 'Testlarni tanlang, natijangizni kuzating va reytingda ko‘tariling.' },
    { emoji: '⚡', title: 'Daily Challenge', text: 'Har kuni maxsus challenge chiqadi. Uni o‘tkazib yubormang.' },
    { emoji: '🏅', title: 'Profile va Badges', text: 'Profilni bezang, streak yig‘ing va yangi badge’larni oching.' }
  ];
  const slide = slides[state.onboardingStep] || slides[0];

  return `
    <div class="onboarding-overlay">
      <div class="onboarding-card">
        <div class="badge">Welcome</div>
        <div class="onboarding-emoji">${slide.emoji}</div>
        <h2>${slide.title}</h2>
        <p>${slide.text}</p>
        <div class="onboarding-dots">
          ${slides.map((_, index) => `<span class="${index === state.onboardingStep ? 'active' : ''}"></span>`).join('')}
        </div>
        <div class="row">
          ${state.onboardingStep > 0 ? '<button class="secondary-button" data-action="prev-onboarding">Orqaga</button>' : ''}
          ${state.onboardingStep < slides.length - 1
            ? '<button class="button" data-action="next-onboarding">Keyingi</button>'
            : '<button class="button" data-action="finish-onboarding">Boshlash</button>'}
        </div>
      </div>
    </div>
  `;
}

function renderAvatarCropOverlay() {
  if (!state.avatarCropSource) return '';

  return `
    <div class="onboarding-overlay">
      <div class="onboarding-card crop-card">
        <div class="badge">Avatar Crop</div>
        <h2>Avatarni moslang</h2>
        <div class="crop-preview">
          <img src="${state.avatarCropSource}" alt="" style="transform: scale(${state.avatarCropScale});" />
        </div>
        <input type="range" min="1" max="2.5" step="0.05" value="${state.avatarCropScale}" data-action="crop-scale" />
        <div class="row">
          <button class="secondary-button" data-action="cancel-crop">Bekor qilish</button>
          <button class="button" data-action="apply-crop">Qo‘llash</button>
        </div>
      </div>
    </div>
  `;
}

function renderTabs() {
  const tabs = ['quiz', 'rating', 'profile'];
  if (state.boot?.analytics) tabs.push('admin');

  const labels = {
    quiz: 'Quiz',
    rating: 'Rating',
    profile: 'Profile',
    admin: 'Admin'
  };

  return `
    <nav class="tabs">
      ${tabs.map((tab) => `
        <button class="tab-button ${state.tab === tab ? 'active' : ''} ${state.currentQuiz && tab !== 'quiz' ? 'disabled' : ''}" data-action="tab" data-tab="${tab}">
          <span class="tab-dot"></span>
          <span class="tab-label">${labels[tab]}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

function renderToast() {
  if (!state.toast) return '';
  return `
    <div class="toast toast-${state.toast.tone}">
      ${escapeHtml(state.toast.message)}
    </div>
  `;
}

function render() {
  if (!state.boot) {
    document.body.classList.remove('runner-mode');
    app.classList.remove('runner-mode');
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
    document.body.classList.add('runner-mode');
    app.classList.add('runner-mode');
    app.innerHTML = `${renderQuizSection()}${renderToast()}`;
    return;
  }

  document.body.classList.remove('runner-mode');
  app.classList.remove('runner-mode');
  app.innerHTML = `
    ${renderHeader(profile)}
    ${renderQuizSection()}
    ${renderRatingSection()}
    ${renderProfileSection(profile)}
    ${renderAdminSection()}
    ${renderTabs()}
    ${renderOnboarding()}
    ${renderAvatarCropOverlay()}
    ${renderToast()}
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
  state.rankCelebration = null;
  render();
}

async function startQuiz(testId, options = {}) {
  const data = await api('/api/mini-app/quiz/start', {
    user: getTelegramUser(),
    testIndex: Number(testId),
    isDailyChallenge: Boolean(options.isDailyChallenge)
  });

  state.currentQuiz = {
    quizId: data.quizId,
    test: data.test,
    questions: data.questions,
    currentIndex: 0,
    startedAt: Date.now(),
    isDailyChallenge: Boolean(options.isDailyChallenge)
  };
  state.selectedAnswers = new Array(data.questions.length).fill(null);
  state.result = null;
  state.tab = 'quiz';
  state.timerNow = Date.now();
  state.autoAdvanceLock = false;
  state.boot.activeQuiz = null;
  state.rankCelebration = null;
  startTimer();
  render();
}

async function startWeakQuiz() {
  const data = await api('/api/mini-app/quiz/weak', { user: getTelegramUser() });
  state.currentQuiz = {
    quizId: data.quizId,
    test: data.test,
    questions: data.questions,
    currentIndex: 0,
    startedAt: Date.now(),
    isDailyChallenge: false
  };
  state.selectedAnswers = new Array(data.questions.length).fill(null);
  state.result = null;
  state.tab = 'quiz';
  state.timerNow = Date.now();
  state.autoAdvanceLock = false;
  state.boot.activeQuiz = null;
  state.rankCelebration = null;
  startTimer();
  render();
}

async function persistQuizProgress() {
  if (!state.currentQuiz?.quizId) return;
  try {
    const data = await api('/api/mini-app/quiz/progress', {
      user: getTelegramUser(),
      quizId: state.currentQuiz.quizId,
      answers: state.selectedAnswers,
      currentIndex: state.currentQuiz.currentIndex
    });
    state.boot.activeQuiz = data;
  } catch (_) {
    // ignore autosave errors
  }
}

async function finishQuiz() {
  const data = await api('/api/mini-app/quiz/finish', {
    user: getTelegramUser(),
    quizId: state.currentQuiz.quizId,
    answers: state.selectedAnswers
  });

  stopTimer();
  state.boot.user = data.profile;
  state.boot.leaderboard = data.leaderboard;
  state.boot.analytics = data.analytics || state.boot.analytics;
  state.boot.activeQuiz = null;
  state.rankCelebration = data.notifications?.rankImproved?.allTime || data.notifications?.rankImproved?.weekly
    ? data.notifications.rankImproved
    : null;
  state.currentQuiz = {
    ...state.currentQuiz,
    result: data
  };
  state.autoAdvanceLock = false;
  if (state.rankCelebration?.allTime || state.rankCelebration?.weekly) {
    const scope = state.rankCelebration.allTime ? 'All-time' : 'Weekly';
    showToast(`${scope} reytingingiz yuqoriladi`, 'success');
  } else {
    showToast('Natija saqlandi', 'success');
  }
  render();
}

async function saveProfile() {
  const displayName = document.getElementById('displayNameInput')?.value || '';
  const remindersEnabled = Boolean(document.getElementById('remindersEnabledInput')?.checked);
  const avatarUrl = state.profileAvatarDraft !== null
    ? state.profileAvatarDraft
    : (state.boot?.user?.avatarUrl || '');

  const data = await api('/api/mini-app/profile', {
    user: getTelegramUser(),
    profile: { displayName, avatarUrl, remindersEnabled }
  });

  state.boot.user = data;
  state.profileAvatarDraft = null;
  showToast('Profil saqlandi', 'success');
  render();
}

async function markOnboardingComplete() {
  const data = await api('/api/mini-app/profile', {
    user: getTelegramUser(),
    profile: { hasSeenOnboarding: true }
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
    try {
      if (!state.currentQuiz) {
        state.autoAdvanceLock = false;
        return;
      }

      if (isLastQuestion) {
        await finishQuiz();
        haptic('success');
        return;
      }

      state.currentQuiz.currentIndex += 1;
      state.autoAdvanceLock = false;
      await persistQuizProgress();
      render();
    } catch (error) {
      state.autoAdvanceLock = false;
      haptic('error');
      showToast(error.message || 'Quiz davomida xato yuz berdi', 'error');
    }
  }, 420);
}

async function applyAvatarCrop() {
  const image = new Image();
  image.src = state.avatarCropSource;

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas yaratilmadi.');
  }

  ctx.fillStyle = '#10203b';
  ctx.fillRect(0, 0, size, size);

  const scale = state.avatarCropScale;
  const width = image.width * scale;
  const height = image.height * scale;
  const ratio = Math.max(size / width, size / height);
  const drawWidth = width * ratio;
  const drawHeight = height * ratio;
  const x = (size - drawWidth) / 2;
  const y = (size - drawHeight) / 2;
  ctx.drawImage(image, x, y, drawWidth, drawHeight);

  state.profileAvatarDraft = canvas.toDataURL('image/jpeg', 0.9);
  state.avatarCropSource = null;
  state.avatarCropScale = 1;
}

document.addEventListener('click', async (event) => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;

  const action = trigger.dataset.action;

  try {
    if (action === 'toggle-theme') {
      haptic('impact');
      setTheme(state.theme === 'dark' ? 'light' : 'dark');
      render();
      return;
    }

    if (action === 'tab') {
      if (state.currentQuiz && trigger.dataset.tab !== 'quiz') return;
      haptic('selection');
      state.tab = trigger.dataset.tab;
      render();
      return;
    }

    if (action === 'rating-mode') {
      haptic('selection');
      state.ratingMode = trigger.dataset.mode;
      render();
      return;
    }

    if (action === 'refresh') {
      haptic('impact');
      await refreshBoot();
      showToast('Ro‘yxat yangilandi', 'success');
      return;
    }

    if (action === 'start-quiz') {
      haptic('impact');
      await startQuiz(trigger.dataset.testId);
      return;
    }

    if (action === 'start-daily-challenge') {
      haptic('impact');
      await startQuiz(trigger.dataset.testId, { isDailyChallenge: true });
      return;
    }

    if (action === 'start-weak-quiz') {
      haptic('impact');
      await startWeakQuiz();
      return;
    }

    if (action === 'resume-quiz') {
      haptic('impact');
      state.currentQuiz = state.boot.activeQuiz;
      state.selectedAnswers = Array.isArray(state.currentQuiz.answers)
        ? state.currentQuiz.answers
        : new Array(state.currentQuiz.questions.length).fill(null);
      state.timerNow = Date.now();
      startTimer();
      render();
      return;
    }

    if (action === 'leave-quiz') {
      await persistQuizProgress();
      leaveQuiz();
      return;
    }

    if (action === 'choose-answer') {
      if (state.autoAdvanceLock) return;
      haptic('selection');
      state.selectedAnswers[state.currentQuiz.currentIndex] = Number(trigger.dataset.optionIndex);
      await persistQuizProgress();
      render();
      scheduleAutoAdvance();
      return;
    }

    if (action === 'prev-question') {
      state.currentQuiz.currentIndex = Math.max(0, state.currentQuiz.currentIndex - 1);
      await persistQuizProgress();
      render();
      return;
    }

    if (action === 'restart-test') {
      haptic('impact');
      await startQuiz(trigger.dataset.testId);
      return;
    }

    if (action === 'share-result') {
      const result = state.currentQuiz?.result;
      if (!result) return;
      const text = buildShareText(result);
      const file = await generateResultShareFile(result);
      if (file && navigator.canShare?.({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({ files: [file], text });
        } catch (_) {
          // ignore
        }
      } else if (navigator.share) {
        try {
          await navigator.share({ text });
        } catch (_) {
          // ignore
        }
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      showToast('Natija ulashishga tayyor', 'success');
      return;
    }

    if (action === 'pick-avatar') {
      document.getElementById('avatarFileInput')?.click();
      return;
    }

    if (action === 'save-profile') {
      await saveProfile();
      return;
    }

    if (action === 'remove-avatar') {
      state.profileAvatarDraft = '';
      if (state.boot?.user) {
        state.boot.user.avatarUrl = '';
      }
      render();
      return;
    }

    if (action === 'next-onboarding') {
      state.onboardingStep += 1;
      render();
      return;
    }

    if (action === 'prev-onboarding') {
      state.onboardingStep = Math.max(0, state.onboardingStep - 1);
      render();
      return;
    }

    if (action === 'finish-onboarding') {
      await markOnboardingComplete();
      showToast('Xush kelibsiz', 'success');
      return;
    }

    if (action === 'cancel-crop') {
      state.avatarCropSource = null;
      state.avatarCropScale = 1;
      render();
      return;
    }

    if (action === 'apply-crop') {
      await applyAvatarCrop();
      render();
      return;
    }
  } catch (error) {
    console.error(error);
    haptic('error');
    showToast(error.message || 'Xatolik yuz berdi', 'error');
  }
});

document.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.id !== 'avatarFileInput') return;
  const [file] = Array.from(target.files || []);
  if (!file) return;

  state.avatarCropSource = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Fayl o‘qilmadi.'));
    reader.readAsDataURL(file);
  });
  state.avatarCropScale = 1;
  target.value = '';
  render();
});

document.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (target.dataset.action === 'crop-scale') {
    state.avatarCropScale = Number(target.value);
    const previewImage = document.querySelector('.crop-preview img');
    if (previewImage) {
      previewImage.style.transform = `scale(${state.avatarCropScale})`;
    }
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
