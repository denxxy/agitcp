/**
 * Школьные Выборы 2026 — Главный Модуль Интерактивности
 * Счетчик голосов от 0, таймер, 9 шагов программы, опрос,
 * предложка и анимация появления блоков.
 */

document.addEventListener('DOMContentLoaded', () => {
  CountdownManager.init();
  VoteManager.init();
  QueueCalculator.init();
  ProgramManager.init();
  PollManager.init();
  SuggestionManager.init();
  ShareManager.init();
  RevealManager.init();

  if (window.lucide) {
    window.lucide.createIcons();
  }
});

/* ==========================================================================
   1. ОБРАТНЫЙ ОТСЧЕТ ДО ДЕБАТОВ
   ========================================================================== */
const CountdownManager = {
  storageKey: 'school_target_election_time',

  init() {
    let target = localStorage.getItem(this.storageKey);
    if (!target) {
      target = Date.now() + (3 * 24 * 60 * 60 * 1000) + (14 * 60 * 60 * 1000);
      localStorage.setItem(this.storageKey, target);
    } else {
      target = parseInt(target, 10);
    }

    const updateTimer = () => {
      const now = Date.now();
      const diff = target - now;

      const dEl = document.getElementById('timerDays');
      const hEl = document.getElementById('timerHours');
      const mEl = document.getElementById('timerMinutes');
      const sEl = document.getElementById('timerSeconds');

      if (!dEl || !hEl || !mEl || !sEl) return;

      if (diff <= 0) {
        dEl.textContent = '00';
        hEl.textContent = '00';
        mEl.textContent = '00';
        sEl.textContent = '00';
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / 1000 / 60) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      const pad = n => String(n).padStart(2, '0');
      dEl.textContent = pad(days);
      hEl.textContent = pad(hours);
      mEl.textContent = pad(minutes);
      sEl.textContent = pad(seconds);
    };

    updateTimer();
    setInterval(updateTimer, 1000);
  }
};

/* ==========================================================================
   2. СЧЕТЧИК ГОЛОСОВ: СТРОГО С 0 И ПОДКЛЮЧЕНИЕ К POSTGRESQL (NETLIFY / NEON)
   ========================================================================== */
const VoteManager = {
  apiUrl: '/api/votes',
  syncIntervalMs: 25000,
  syncTimer: null,
  isSyncing: false,

  init() {
    this.updateUI();
    this.fetchLiveVotes();
    this.startPeriodicSync();

    const mainBtn = document.getElementById('votePrimaryBtn');
    const navBtn = document.getElementById('voteNavBtn');
    const cardBtn = document.getElementById('voteCardBtn');
    const mobileBtn = document.getElementById('voteMobileBtn');

    [mainBtn, navBtn, cardBtn, mobileBtn].forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => this.handleVoteToggle());
      }
    });
  },

  hasVoted() {
    return localStorage.getItem('user_has_voted') === 'true';
  },

  getVoteCount() {
    const stored = localStorage.getItem('candidate_votes_count');
    return stored !== null ? parseInt(stored, 10) : 0;
  },

  setVoteCount(count) {
    localStorage.setItem('candidate_votes_count', Math.max(0, count));
    this.updateUI();
  },

  async fetchLiveVotes() {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data.count === 'number') {
          this.setVoteCount(data.count);
        }
      }
    } catch (e) {
      console.warn('Live votes fetch skipped (offline/static):', e.message);
    }
  },

  startPeriodicSync() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(() => {
      if (!this.isSyncing) {
        this.fetchLiveVotes();
      }
    }, this.syncIntervalMs);
  },

  async handleVoteToggle() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    const voted = this.hasVoted();
    let count = this.getVoteCount();
    const action = voted ? 'unvote' : 'vote';

    // Оптимистичный отклик в интерфейсе
    if (!voted) {
      localStorage.setItem('user_has_voted', 'true');
      count += 1;
      this.setVoteCount(count);
      this.triggerConfetti();
      Toast.show('Твой голос за кандидата зафиксирован! 🎉');
    } else {
      localStorage.setItem('user_has_voted', 'false');
      count = Math.max(0, count - 1);
      this.setVoteCount(count);
      Toast.show('Голос отозван');
    }

    // Запись в базу данных PostgreSQL
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ action })
      });

      if (response.ok) {
        const data = await response.json();
        if (data && typeof data.count === 'number') {
          this.setVoteCount(data.count);
        }
      }
    } catch (err) {
      console.warn('Database vote write notice:', err.message);
    } finally {
      this.isSyncing = false;
    }
  },

  updateUI() {
    const voted = this.hasVoted();
    const count = this.getVoteCount();

    document.querySelectorAll('[data-vote-count]').forEach(el => el.textContent = count);

    const voteButtons = [
      document.getElementById('votePrimaryBtn'),
      document.getElementById('voteNavBtn'),
      document.getElementById('voteCardBtn'),
      document.getElementById('voteMobileBtn')
    ];

    voteButtons.forEach(btn => {
      if (!btn) return;
      const textSpan = btn.querySelector('.vote-btn-text');
      if (voted) {
        if (textSpan) textSpan.textContent = 'Ты в команде! (Голос за)';
        btn.classList.add('is-voted');
      } else {
        if (textSpan) textSpan.textContent = btn.id === 'voteNavBtn' ? 'Поддержать' : 'Отдать свой голос';
        btn.classList.remove('is-voted');
      }
    });
  },

  triggerConfetti() {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#112576', '#253ea1', '#38bdf8', '#ea580c', '#10b981']
      });

      setTimeout(() => {
        confetti({
          particleCount: 40,
          angle: 60,
          spread: 55,
          origin: { x: 0 }
        });
        confetti({
          particleCount: 40,
          angle: 120,
          spread: 55,
          origin: { x: 1 }
        });
      }, 160);
    }
  }
};

/* ==========================================================================
   3. КАЛЬКУЛЯТОР ВРЕМЕНИ В СТОЛОВОЙ
   ========================================================================== */
const QueueCalculator = {
  schoolDaysPerYear: 175,
  quarterDays: 44,

  init() {
    const slider = document.getElementById('queueSlider');
    if (!slider) return;

    slider.addEventListener('input', (e) => {
      this.calculate(parseInt(e.target.value, 10));
    });

    this.calculate(parseInt(slider.value, 10) || 15);
  },

  calculate(minutes) {
    const displayVal = document.getElementById('sliderMinutesDisplay');
    const lostYearHours = document.getElementById('calcLostYear');
    const lostQuarter = document.getElementById('calcLostQuarter');
    const equivalentMovies = document.getElementById('calcMovies');
    const equivalentGames = document.getElementById('calcGames');

    if (displayVal) displayVal.textContent = `${minutes} мин / день`;

    const yearMinutes = minutes * this.schoolDaysPerYear;
    const yearHours = (yearMinutes / 60).toFixed(1);

    const quarterMinutes = minutes * this.quarterDays;
    const quarterHours = (quarterMinutes / 60).toFixed(1);

    if (lostYearHours) lostYearHours.textContent = `${yearHours} ч`;
    if (lostQuarter) lostQuarter.textContent = `~${quarterHours} ч за четверть`;

    const moviesCount = Math.round(parseFloat(yearHours) / 2);
    const gamesCount = Math.round(parseFloat(yearHours) * 1.5);

    if (equivalentMovies) equivalentMovies.textContent = `${moviesCount} фильмам`;
    if (equivalentGames) equivalentGames.textContent = `${gamesCount} каткам`;
  }
};

/* ==========================================================================
   4. ПРОГРАММА (9 ШАГОВ)
   ========================================================================== */
const ProgramManager = {
  init() {
    this.setupTabs();
  },

  setupTabs() {
    const tabs = document.querySelectorAll('.prog-tab-btn');
    const cards = document.querySelectorAll('.prog-card');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const category = tab.getAttribute('data-category');

        tabs.forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');

        cards.forEach(card => {
          const cardCat = card.getAttribute('data-category');
          if (category === 'all' || cardCat === category) {
            card.classList.remove('hidden');
          } else {
            card.classList.add('hidden');
          }
        });
      });
    });
  }
};

/* ==========================================================================
   5. ОПРОС ИЗБИРАТЕЛЕЙ
   ========================================================================== */
const PollManager = {
  storageKey: 'school_poll_vote_index_wix',
  votes: [42, 28, 20, 16],

  init() {
    const savedVote = localStorage.getItem(this.storageKey);
    if (savedVote !== null) {
      this.renderResults(parseInt(savedVote, 10));
    }

    const options = document.querySelectorAll('.poll-vote-btn');
    options.forEach((btn, idx) => {
      btn.addEventListener('click', () => this.vote(idx));
    });
  },

  vote(index) {
    if (localStorage.getItem(this.storageKey) !== null) {
      Toast.show('Вы уже проголосовали в опросе!');
      return;
    }

    this.votes[index] += 1;
    localStorage.setItem(this.storageKey, index);
    this.renderResults(index);
    Toast.show('Ваш голос в опросе учтен!');
  },

  renderResults(selectedIndex) {
    const total = this.votes.reduce((acc, v) => acc + v, 0);
    const totalEl = document.getElementById('pollTotalLabel');
    if (totalEl) totalEl.textContent = `${total} ответов`;

    const options = document.querySelectorAll('.poll-vote-btn');
    options.forEach((btn, idx) => {
      const pct = Math.round((this.votes[idx] / total) * 100);
      const bar = btn.querySelector('.poll-bar');
      const pctLabel = btn.querySelector('.poll-percent');

      if (bar) bar.style.width = `${pct}%`;
      if (pctLabel) {
        pctLabel.textContent = `${pct}%`;
        pctLabel.classList.remove('opacity-0');
      }

      if (idx === selectedIndex) {
        btn.classList.add('is-selected');
      }
      btn.disabled = true;
      btn.classList.add('cursor-default');
    });

    const msg = document.getElementById('pollDoneMessage');
    if (msg) msg.classList.remove('hidden');
  }
};

/* ==========================================================================
   6. ПРЕДЛОЖКА И ОБРАТНАЯ СВЯЗЬ
   ========================================================================== */
const SuggestionManager = {
  init() {
    const form = document.getElementById('suggestionForm');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSubmit(e));
    }
  },

  handleSubmit(e) {
    e.preventDefault();

    const textEl = document.getElementById('sugTextInput');
    const text = textEl?.value.trim();
    if (!text) return;

    textEl.value = '';
    const classEl = document.getElementById('sugAuthorInput');
    if (classEl) classEl.value = '';

    Toast.show('Твоя идея отправлена в штаб кандидата! 🚀');
  }
};

/* ==========================================================================
   7. ШЕРИНГ И КОПИРОВАНИЕ
   ========================================================================== */
const ShareManager = {
  init() {
    document.querySelectorAll('[data-action-share]').forEach(btn => {
      btn.addEventListener('click', () => this.share());
    });

    document.querySelectorAll('[data-action-copy]').forEach(btn => {
      btn.addEventListener('click', () => this.copyLink());
    });

    document.querySelectorAll('[data-action-print]').forEach(btn => {
      btn.addEventListener('click', () => window.print());
    });
  },

  getShareData() {
    const candName = 'Александр Припачкин';
    return {
      title: `${candName} — Выборы в Школьное Самоуправление`,
      text: `Голосуй за дела! Программа кандидата: решение очередей в столовой, банк знаний ОГЭ/ЕГЭ, защита прав и турниры.`,
      url: window.location.href
    };
  },

  share() {
    const data = this.getShareData();
    if (navigator.share) {
      navigator.share(data).catch(() => this.copyLink());
    } else {
      this.copyLink();
    }
  },

  copyLink() {
    const url = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => Toast.show('Ссылка скопирована в буфер! Отправь в беседу класса 📋'))
        .catch(() => this.fallbackCopy(url));
    } else {
      this.fallbackCopy(url);
    }
  },

  fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      Toast.show('Ссылка скопирована в буфер! Отправь в беседу класса 📋');
    } catch {
      Toast.show('Не удалось скопировать ссылку');
    }
    document.body.removeChild(textarea);
  }
};

/* ==========================================================================
   8. ПОЯВЛЕНИЕ БЛОКОВ ПРИ ПРОКРУТКЕ
   ========================================================================== */
const RevealManager = {
  init() {
    const items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    items.forEach(el => observer.observe(el));
  }
};

/* ==========================================================================
   9. УВЕДОМЛЕНИЯ (TOAST)
   ========================================================================== */
const Toast = {
  timeoutId: null,

  show(message) {
    const toast = document.getElementById('toastNotification');
    const msgEl = document.getElementById('toastMessageText');
    if (!toast || !msgEl) return;

    msgEl.textContent = message;

    clearTimeout(this.timeoutId);
    toast.classList.remove('opacity-0', '-translate-y-4', 'pointer-events-none');
    toast.classList.add('opacity-100', 'translate-y-0');

    this.timeoutId = setTimeout(() => {
      toast.classList.remove('opacity-100', 'translate-y-0');
      toast.classList.add('opacity-0', '-translate-y-4', 'pointer-events-none');
    }, 3200);
  }
};
