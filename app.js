/* ======================================================
   樹木医試験 予想問題クイズ - App Logic
   ====================================================== */

(() => {
  'use strict';

  // ---- State ----
  const state = {
    mode: null,        // 'cat' | 'all' | 'wrong'
    catFilter: null,
    pool: [],
    current: 0,
    answers: [],       // { qId, chosen, correct }
    answered: false
  };

  // ---- TTS (Text-to-Speech) ----
  const TTS_KEY = 'jumoku_tts';
  const SPEED_OPTIONS = [0.8, 1.0, 1.2, 1.5];
  let ttsEnabled = true;
  let ttsSpeed = 1.0;
  let ttsVoice = null;
  let currentSpeakBtn = null;

  function loadTTSSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(TTS_KEY));
      if (s) {
        ttsEnabled = s.enabled !== false;
        ttsSpeed = SPEED_OPTIONS.includes(s.speed) ? s.speed : 1.0;
      }
    } catch {}
  }
  function saveTTSSettings() {
    localStorage.setItem(TTS_KEY, JSON.stringify({ enabled: ttsEnabled, speed: ttsSpeed }));
  }

  function pickJapaneseVoice() {
    const voices = speechSynthesis.getVoices();
    // Prefer high-quality Japanese voices
    const jaVoices = voices.filter(v => v.lang.startsWith('ja'));
    if (jaVoices.length === 0) return null;
    // Prefer local voices over remote for lower latency
    const local = jaVoices.find(v => v.localService);
    return local || jaVoices[0];
  }

  function initTTSVoice() {
    ttsVoice = pickJapaneseVoice();
    if (!ttsVoice && speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => {
        ttsVoice = pickJapaneseVoice();
      };
    }
  }

  function stopSpeech() {
    speechSynthesis.cancel();
    if (currentSpeakBtn) {
      currentSpeakBtn.classList.remove('speaking');
      currentSpeakBtn = null;
    }
  }

  function speak(text, btn) {
    if (!ttsEnabled || !('speechSynthesis' in window)) return;
    stopSpeech();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ja-JP';
    utter.rate = ttsSpeed;
    utter.pitch = 1.0;
    if (ttsVoice) utter.voice = ttsVoice;

    if (btn) {
      currentSpeakBtn = btn;
      btn.classList.add('speaking');
      utter.onend = () => { btn.classList.remove('speaking'); currentSpeakBtn = null; };
      utter.onerror = () => { btn.classList.remove('speaking'); currentSpeakBtn = null; };
    }

    speechSynthesis.speak(utter);
  }

  function speakQuestionText() {
    const q = state.pool[state.current];
    if (!q) return;
    const labels = ['ア', 'イ', 'ウ', 'エ', 'オ'];
    let full = q.q + '。';
    q.choices.forEach((c, i) => { full += labels[i] + '、' + c + '。'; });
    const btn = document.querySelector('.speak-btn-q');
    speak(full, btn);
  }

  function speakExplanation() {
    const q = state.pool[state.current];
    if (!q) return;
    const chosen = state.answers[state.answers.length - 1];
    const prefix = chosen && chosen.correct ? '正解。' : '不正解。';
    const btn = document.querySelector('.speak-btn-exp');
    speak(prefix + q.exp, btn);
  }

  function updateTTSUI() {
    const toggle = document.getElementById('ttsToggle');
    const speedEl = document.getElementById('ttsSpeed');
    if (toggle) toggle.classList.toggle('off', !ttsEnabled);
    if (speedEl) {
      speedEl.textContent = ttsSpeed + 'x';
      speedEl.classList.toggle('show', ttsEnabled);
    }
  }

  function speakBtnHTML(type) {
    return `<button class="speak-btn speak-btn-${type}" onclick="app.replaySpeak('${type}')" aria-label="読み上げ">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
      </svg>
    </button>`;
  }

  // Init TTS
  loadTTSSettings();
  if ('speechSynthesis' in window) initTTSVoice();

  // ---- Storage helpers ----
  const STORAGE_KEY = 'jumoku_quiz';
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
  }
  function saveProgress(p) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  }
  function recordAnswer(qId, isCorrect) {
    const p = loadProgress();
    if (!p[qId]) p[qId] = { total: 0, correct: 0 };
    p[qId].total++;
    if (isCorrect) p[qId].correct++;
    saveProgress(p);
  }

  // ---- Categories ----
  function getCategories() {
    const map = {};
    QUESTIONS.forEach(q => {
      if (!map[q.cat]) map[q.cat] = [];
      map[q.cat].push(q);
    });
    return map;
  }

  // ---- Shuffle ----
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---- DOM refs ----
  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  const homeScreen   = $('#home');
  const quizScreen   = $('#quiz');
  const resultScreen = $('#result');

  // ---- Screen switching ----
  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(`#${id}`).classList.add('active');
    window.scrollTo(0, 0);
  }

  // ---- Render Home ----
  function renderHome() {
    const progress = loadProgress();
    const cats = getCategories();
    const catNames = Object.keys(cats);

    // Stats
    const totalQ = QUESTIONS.length;
    const attempted = Object.keys(progress).length;
    const totalCorrect = Object.values(progress).reduce((s, p) => s + p.correct, 0);
    const totalAttempts = Object.values(progress).reduce((s, p) => s + p.total, 0);
    const accuracy = totalAttempts > 0 ? Math.round(totalCorrect / totalAttempts * 100) : 0;

    // Wrong questions count
    const wrongIds = Object.entries(progress)
      .filter(([, p]) => p.correct < p.total)
      .map(([id]) => parseInt(id));

    let html = '';

    // Stats bar
    html += `<div class="stats-bar">
      <div class="stat-card"><div class="num">${attempted}/${totalQ}</div><div class="label">挑戦済み</div></div>
      <div class="stat-card"><div class="num">${accuracy}%</div><div class="label">正答率</div></div>
      <div class="stat-card"><div class="num">${wrongIds.length}</div><div class="label">復習待ち</div></div>
    </div>`;

    // Mode buttons
    html += `<div class="section-title">出題モード</div>`;
    html += `<div class="mode-btns">
      <button class="mode-btn primary" onclick="app.startAll()">全問ランダム</button>
      <button class="mode-btn secondary" onclick="app.startWrong()" ${wrongIds.length === 0 ? 'disabled style="opacity:.4"' : ''}>間違えた問題</button>
    </div>`;

    // Category grid
    html += `<div class="section-title">分野別に挑戦</div>`;
    html += `<div class="cat-grid">`;
    catNames.forEach(cat => {
      const qs = cats[cat];
      const catAttempted = qs.filter(q => progress[q.id]).length;
      const pct = Math.round(catAttempted / qs.length * 100);
      html += `<div class="cat-btn" onclick="app.startCat('${cat}')">
        <div class="cat-name">${cat}</div>
        <div class="cat-count">${qs.length}問 (${catAttempted}問済)</div>
        <div class="cat-progress" style="width:${pct}%"></div>
      </div>`;
    });
    html += `</div>`;

    // Reset
    html += `<div class="reset-link" onclick="app.resetProgress()">学習データをリセット</div>`;

    homeScreen.innerHTML = html;
    showScreen('home');
  }

  // ---- Start quiz ----
  function startQuiz(questions) {
    state.pool = shuffle(questions);
    state.current = 0;
    state.answers = [];
    state.answered = false;
    showScreen('quiz');
    renderQuestion();
  }

  // ---- Render Question ----
  function renderQuestion() {
    const q = state.pool[state.current];
    const total = state.pool.length;
    const idx = state.current + 1;
    const pct = Math.round(idx / total * 100);

    // Header
    $('.quiz-progress-bar').style.width = pct + '%';
    $('.quiz-count').textContent = `${idx} / ${total}`;

    // Body
    const labels = ['ア', 'イ', 'ウ', 'エ', 'オ'];
    let html = '';
    html += `<span class="quiz-cat-tag">${q.cat} ／ ${q.sub}</span>`;
    html += `<div class="quiz-question">${q.q} ${speakBtnHTML('q')}</div>`;
    html += `<div class="choices">`;
    q.choices.forEach((c, i) => {
      html += `<button class="choice-btn" data-idx="${i}" onclick="app.choose(${i})">
        <span class="choice-num">${labels[i]}</span>
        <span class="choice-text">${c}</span>
      </button>`;
    });
    html += `</div>`;
    html += `<div id="exp-area"></div>`;

    $('.quiz-body').innerHTML = html;
    $('.quiz-next-area').classList.remove('show');
    state.answered = false;
    updateTTSUI();

    // Auto-speak question
    if (ttsEnabled) {
      setTimeout(() => speakQuestionText(), 300);
    }
  }

  // ---- Choose answer ----
  function choose(idx) {
    if (state.answered) return;
    state.answered = true;

    const q = state.pool[state.current];
    const isCorrect = idx === q.ans;

    state.answers.push({ qId: q.id, chosen: idx, correct: isCorrect });
    recordAnswer(q.id, isCorrect);

    // Highlight choices
    $$('.choice-btn').forEach((btn, i) => {
      btn.classList.add('disabled');
      if (i === q.ans) btn.classList.add('correct');
      if (i === idx && !isCorrect) btn.classList.add('wrong');
    });

    // Show explanation
    const mark = isCorrect ? '正解！' : '不正解…';
    $('#exp-area').innerHTML = `<div class="explanation">
      <div class="exp-label">${mark} ${speakBtnHTML('exp')}</div>
      <div class="exp-text">${q.exp}</div>
    </div>`;

    // Auto-speak explanation
    if (ttsEnabled) {
      speakExplanation();
    }

    // Show next button
    const isLast = state.current >= state.pool.length - 1;
    const nextLabel = isLast ? '結果を見る' : '次の問題へ';
    $('.quiz-next-area').classList.add('show');
    $('.next-btn').textContent = nextLabel;
  }

  // ---- Next question ----
  function next() {
    stopSpeech();
    if (state.current >= state.pool.length - 1) {
      renderResult();
    } else {
      state.current++;
      renderQuestion();
    }
  }

  // ---- Render Result ----
  function renderResult() {
    const total = state.answers.length;
    const correct = state.answers.filter(a => a.correct).length;
    const pct = total > 0 ? Math.round(correct / total * 100) : 0;

    let msg = '';
    if (pct === 100) msg = '完璧です！素晴らしい！';
    else if (pct >= 80) msg = '良い結果です！この調子で！';
    else if (pct >= 60) msg = 'もう少しで合格ライン！';
    else msg = '復習して再チャレンジしましょう！';

    let html = '';
    html += `<div class="result-circle" style="--pct:${pct}">
      <div class="result-circle-inner">
        <span class="big">${pct}%</span>
        <span class="sub">${correct} / ${total} 問正解</span>
      </div>
    </div>`;
    html += `<div class="result-msg">${msg}</div>`;

    html += `<div class="result-details">
      <div class="result-row"><span>出題数</span><span class="val">${total}問</span></div>
      <div class="result-row"><span>正解数</span><span class="val">${correct}問</span></div>
      <div class="result-row"><span>不正解数</span><span class="val">${total - correct}問</span></div>
      <div class="result-row"><span>正答率</span><span class="val">${pct}%</span></div>
    </div>`;

    // Missed questions review
    const missed = state.answers.filter(a => !a.correct);
    if (missed.length > 0) {
      html += `<div class="section-title" style="width:100%">間違えた問題</div>`;
      html += `<div class="review-list">`;
      missed.forEach(a => {
        const q = QUESTIONS.find(qq => qq.id === a.qId);
        if (q) {
          html += `<div class="review-item miss">
            <div class="ri-q">${q.q}</div>
            <div class="ri-tag">${q.cat} ／ ${q.sub}</div>
          </div>`;
        }
      });
      html += `</div>`;
    }

    html += `<div class="result-btns">
      <button class="mode-btn primary" onclick="app.goHome()">ホームに戻る</button>
      <button class="mode-btn secondary" onclick="app.retry()">もう一度</button>
    </div>`;

    resultScreen.innerHTML = html;
    showScreen('result');
  }

  // ---- Public API ----
  window.app = {
    startAll() {
      state.mode = 'all';
      state.catFilter = null;
      startQuiz(QUESTIONS);
    },
    startCat(cat) {
      state.mode = 'cat';
      state.catFilter = cat;
      startQuiz(QUESTIONS.filter(q => q.cat === cat));
    },
    startWrong() {
      state.mode = 'wrong';
      const progress = loadProgress();
      const wrongIds = new Set(
        Object.entries(progress)
          .filter(([, p]) => p.correct < p.total)
          .map(([id]) => parseInt(id))
      );
      const wrongQs = QUESTIONS.filter(q => wrongIds.has(q.id));
      if (wrongQs.length === 0) return;
      startQuiz(wrongQs);
    },
    choose,
    next,
    goHome() { stopSpeech(); renderHome(); },
    retry() {
      if (state.mode === 'cat' && state.catFilter) {
        startQuiz(QUESTIONS.filter(q => q.cat === state.catFilter));
      } else if (state.mode === 'wrong') {
        window.app.startWrong();
      } else {
        startQuiz(QUESTIONS);
      }
    },
    goBack() {
      stopSpeech();
      if (quizScreen.classList.contains('active') || resultScreen.classList.contains('active')) {
        renderHome();
      }
    },
    toggleTTS() {
      ttsEnabled = !ttsEnabled;
      saveTTSSettings();
      updateTTSUI();
      if (!ttsEnabled) stopSpeech();
    },
    cycleTTSSpeed() {
      const idx = SPEED_OPTIONS.indexOf(ttsSpeed);
      ttsSpeed = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
      saveTTSSettings();
      updateTTSUI();
    },
    replaySpeak(type) {
      if (type === 'q') speakQuestionText();
      else if (type === 'exp') speakExplanation();
    },
    resetProgress() {
      if (confirm('学習データをリセットしますか？')) {
        localStorage.removeItem(STORAGE_KEY);
        renderHome();
      }
    }
  };

  // ---- Init ----
  updateTTSUI();
  renderHome();

  // Register SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
