// ================================================
//  TAJWID AI — AMOGENZ
//  game.js — Main Game Controller
// ================================================

import { AMOGENZ_DB_TAJWID } from './amogenzdb-tajwid.js';

window.addEventListener('load', () => {
  setTimeout(() => {
    document.getElementById('splash-screen').classList.add('hide');
  }, 1700);
});

// ---- PIXEL SOUND ENGINE ----
const SFX = (() => {
  const ac = window._ac;
  const play = (freq, type, dur, vol = 0.18, detune = 0) => {
    if (!ac) return;
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (detune) osc.detune.setValueAtTime(detune, ac.currentTime);
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + dur);
    } catch (e) {}
  };
  return {
    click: () => play(440, 'square', 0.06, 0.10),
    correct: () => {
      play(523, 'square', 0.12, 0.15);
      setTimeout(() => play(659, 'square', 0.12, 0.15), 80);
      setTimeout(() => play(784, 'square', 0.15, 0.15), 160);
    },
    wrong: () => {
      play(220, 'sawtooth', 0.15, 0.12);
      setTimeout(() => play(180, 'sawtooth', 0.15, 0.12), 100);
    },
    next: () => play(330, 'square', 0.09, 0.10),
    complete: () => {
      [523, 587, 659, 784, 880].forEach((f, i) =>
        setTimeout(() => play(f, 'square', 0.18, 0.14), i * 80));
    },
    start: () => {
      [220, 330, 440].forEach((f, i) =>
        setTimeout(() => play(f, 'triangle', 0.2, 0.14), i * 60));
    },
  };
})();

// ---- STARFIELD ----
(() => {
  const canvas = document.getElementById('starfield');
  const ctx = canvas.getContext('2d');
  let stars = [];
  const resize = () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    stars = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() < 0.1 ? 2 : 1,
      speed: 0.08 + Math.random() * 0.15,
      blink: Math.random() * Math.PI * 2,
    }));
  };
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = performance.now() / 1000;
    for (const s of stars) {
      const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.8 + s.blink));
      ctx.fillStyle = `rgba(160,200,255,${alpha})`;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
      s.y += s.speed;
      if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
    }
    requestAnimationFrame(draw);
  };
  window.addEventListener('resize', resize);
  resize(); draw();
})();

// ---- UTILITY ----
const $ = id => document.getElementById(id);
const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- SCREEN MANAGER ----
const Screens = {
  current: 'splash',
  go(id) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
    });
    const next = document.getElementById('screen-' + id);
    if (next) {
      next.classList.add('active');
      // scroll to top
      next.scrollTop = 0;
    }
    this.current = id;
  }
};

// ---- GAME STATE ----
const State = {
  queue: [],          // flat list of {word, steps[], potongan}
  qIndex: 0,          // current question group index
  stepIndex: 0,       // current step 0-5
  score: 0,
  correct: 0,
  wrong: 0,
  combo: 0,
  totalSteps: 0,
  stepsPlayed: 0,
  locked: false,      // prevent double-tap
  milestoneCorrect: 0,   // correct count within current 6-step block
  milestoneWrong: 0,     // wrong count within current 6-step block

  init() {
    // Flatten DB into queue: each lafadz as one unit with its steps
    const items = [];
    for (const potongan of AMOGENZ_DB_TAJWID) {
      for (const lafadz of potongan.analysis) {
        const stepsArr = Object.values(lafadz.steps); // steps 1-6
        items.push({
          word: lafadz.word,
          teks_potongan: potongan.teks_potongan,
          steps: stepsArr,
        });
      }
    }
    this.queue = shuffle(items);
    this.qIndex = 0;
    this.stepIndex = 0;
    this.score = 0;
    this.correct = 0;
    this.wrong = 0;
    this.combo = 0;
    this.stepsPlayed = 0;
    this.totalSteps = this.queue.reduce((s, q) => s + q.steps.length, 0);
    this.locked = false;
    this.milestoneCorrect = 0;
    this.milestoneWrong = 0;
  },

  get currentItem() { return this.queue[this.qIndex]; },
  get currentStep() { return this.currentItem?.steps[this.stepIndex]; },
  get isLastStep()  { return this.stepIndex >= this.currentItem?.steps.length - 1; },
  get isLastItem()  { return this.qIndex >= this.queue.length - 1; },
};

// ---- UI HELPERS ----
function updateHUD() {
  const pct = State.totalSteps > 0
    ? (State.stepsPlayed / State.totalSteps) * 100 : 0;
  $('progress-fill').style.width = pct + '%';
  $('progress-label').textContent = `${State.stepsPlayed} / ${State.totalSteps}`;
  $('score-val').textContent = State.score;
}

function animateScore(from, to) {
  const el = $('score-val');
  const dur = 400;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    el.textContent = Math.round(from + (to - from) * t);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function showComboFlash(text) {
  const el = $('combo-flash');
  el.textContent = text;
  el.classList.remove('pop');
  void el.offsetWidth; // reflow
  el.classList.add('pop');
}

// ---- RENDER STEP ----
function renderStep() {
  const item = State.currentItem;
  const step = State.currentStep;
  if (!item || !step) return;

  // Arabic word
  $('arabic-word').textContent = item.word;

  // Step badge
  $('step-num').textContent = State.stepIndex + 1;

  // Question card animate
  const qcard = $('q-card');
  qcard.classList.remove('card-enter');
  void qcard.offsetWidth;
  qcard.classList.add('card-enter');
  $('question-text').textContent = step.question;

  // Shuffle options
  const opts = shuffle([...step.options]);
  const area = $('options-area');
  area.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];
  opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'opt-btn';
    btn.style.animationDelay = `${i * 50}ms`;
    btn.innerHTML = `<span class="opt-letter">${letters[i]}.</span> ${opt}`;
    btn.addEventListener('click', () => handleAnswer(opt, step.correct, step.explanation, opts));
    area.appendChild(btn);
    // stagger entrance
    btn.style.opacity = '0';
    btn.style.transform = 'translateX(-12px)';
    setTimeout(() => {
      btn.style.transition = 'opacity 180ms ease, transform 180ms ease';
      btn.style.opacity = '1';
      btn.style.transform = 'translateX(0)';
    }, 80 + i * 60);
  });

  // Hide explanation
  $('explanation-box').classList.add('hidden');
  State.locked = false;
}

// ---- HANDLE ANSWER ----
async function handleAnswer(chosen, correct, explanation, allOpts) {
  if (State.locked) return;
  State.locked = true;
  SFX.click();

  const isCorrect = chosen === correct;
  State.stepsPlayed++;

  // Find and mark buttons
  const btns = $('options-area').querySelectorAll('.opt-btn');
  btns.forEach(btn => {
    const txt = btn.textContent.substring(3); // strip "A. "
    btn.disabled = true;
    if (txt === correct) {
      btn.classList.add('correct');
    } else if (txt === chosen && !isCorrect) {
      btn.classList.add('wrong');
    } else {
      btn.classList.add('pixel-btn--disabled');
    }
  });

  if (isCorrect) {
    State.correct++;
    State.milestoneCorrect++;
    State.combo++;
    const pts = 10 + (State.combo >= 3 ? 5 : 0); // combo bonus
    const oldScore = State.score;
    State.score += pts;
    SFX.correct();
    animateScore(oldScore, State.score);

    if (State.combo >= 3) {
      showComboFlash(`🔥 COMBO ×${State.combo}  +${pts}pts`);
    } else {
      showComboFlash(`+${pts} PTS ✓`);
    }
  } else {
    State.wrong++;
    State.milestoneWrong++;
    State.combo = 0;
    SFX.wrong();
    showComboFlash('✗ SALAH');
  }

  updateHUD();

  // Show explanation
  const box = $('explanation-box');
  box.classList.remove('hidden');
  const header = box.querySelector('.expl-header');
  header.className = 'expl-header ' + (isCorrect ? 'correct' : 'wrong');
  $('expl-icon').textContent = isCorrect ? '✓' : '✗';
  $('expl-title').textContent = isCorrect ? 'BENAR!' : 'KURANG TEPAT!';
  $('expl-text').textContent = explanation;

  // Auto scroll explanation into view
  setTimeout(() => {
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
}

// ---- NEXT STEP / NEXT ITEM ----
function advance() {
  SFX.next();
  const item = State.currentItem;

  if (!State.isLastStep) {
    // next step in same lafadz
    State.stepIndex++;
    renderStep();
  } else {
    // end of lafadz steps — show milestone popup
    const mCorrect = State.milestoneCorrect;
    const mWrong = State.milestoneWrong;
    const wordLabel = item.word || '';

    // Reset milestone counters for next block
    State.milestoneCorrect = 0;
    State.milestoneWrong = 0;

    if (!State.isLastItem) {
      showMilestone(mCorrect, mWrong, wordLabel, () => {
        State.qIndex++;
        State.stepIndex = 0;
        transitionCard(() => renderStep());
      });
    } else {
      // GAME OVER — show milestone then result
      showMilestone(mCorrect, mWrong, wordLabel, () => {
        showResult();
      });
    }
  }
}

function transitionCard(cb) {
  const card = $('q-card');
  const arabic = $('arabic-word');
  card.style.transition = 'opacity 200ms, transform 200ms';
  arabic.style.transition = 'opacity 200ms, transform 200ms';
  card.style.opacity = '0';
  card.style.transform = 'translateY(-12px)';
  arabic.style.opacity = '0';
  arabic.style.transform = 'translateY(-8px)';

  setTimeout(() => {
    cb();
    card.style.transition = 'opacity 220ms, transform 220ms';
    arabic.style.transition = 'opacity 220ms, transform 220ms';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
    arabic.style.opacity = '1';
    arabic.style.transform = 'translateY(0)';
  }, 220);
}

// ---- MILESTONE POPUP (setiap selesai 1 lafadz / 6 langkah) ----
function showMilestone(correct, wrong, word, onNext) {
  const total = correct + wrong;
  SFX.complete();

  // Tentukan pangkat & pesan
  let pangkat, badge, pesan, starCount, tier;

  if (wrong === 0) {
    // Semua benar
    pangkat = '⭐ SENIOR ⭐';
    badge = '🏅';
    starCount = 6;
    tier = 'senior';
    const pesanSenior = [
      'Luar biasa! Kamu kuasai semua langkah tanpa satu pun salah. Terus pertahankan!',
      'Sempurna! Otakmu kayak hafidz sejati. MasyaAllah!',
      'Wah, 6/6 benar! Kamu ini calon ulama nih, serius deh!',
      'Mantap jiwa! Zero mistake, full marks. Jangan berhenti belajar!',
    ];
    pesan = pesanSenior[Math.floor(Math.random() * pesanSenior.length)];

  } else if (correct >= wrong) {
    // Lebih banyak benar (atau sama)
    pangkat = '📘 PELAJAR';
    badge = '🎓';
    starCount = Math.max(1, correct);
    tier = 'pelajar';
    const pesanPelajar = [
      `${correct} benar dari ${total}. Bagus! Tapi masih ada ruang untuk naik level. Ayo ulangi yang salah!`,
      'Progress yang bagus! Ilmu tajwid butuh proses, dan kamu sudah di jalur yang tepat.',
      'Keren, kamu sudah lebih paham dari sebelumnya. Keep going, jangan nyerah!',
      'Salah itu wajar, yang penting mau belajar lagi. Semangat terus!',
    ];
    pesan = pesanPelajar[Math.floor(Math.random() * pesanPelajar.length)];

  } else {
    // Lebih banyak salah
    pangkat = '📖 PERLU BELAJAR LAGI';
    badge = '💪';
    starCount = Math.max(0, correct);
    tier = 'belajar';
    const pesanBelajar = [
      'Hadeuhh... belajar lagi aja dulu yaa! Tapi tenang, setiap ulama juga pernah jadi pemula kok.',
      'Wkwkwk, masih banyak yang meleset nih. Tapi semangat! Ulangi dan pasti bisa!',
      'Jangan galau, ini namanya proses belajar! Baca lagi materinya, terus coba lagi ya.',
      'Hmm, kayaknya tajwidnya perlu di-review nih. Tapi yang penting udah mau coba!',
    ];
    pesan = pesanBelajar[Math.floor(Math.random() * pesanBelajar.length)];
  }

  // Isi konten popup
  const overlay = document.getElementById('milestone-overlay');
  const card = document.getElementById('milestone-card');
  document.getElementById('milestone-badge').textContent = badge;
  document.getElementById('milestone-pangkat').textContent = pangkat;
  document.getElementById('milestone-word').textContent = word;
  document.getElementById('ms-correct').textContent = correct;
  document.getElementById('ms-wrong').textContent = wrong;
  document.getElementById('milestone-pesan').textContent = pesan;

  // Bintang
  const starsEl = document.getElementById('milestone-stars');
  starsEl.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('span');
    s.className = 'ms-star' + (i < starCount ? ' ms-star--lit' : '');
    s.textContent = '★';
    starsEl.appendChild(s);
  }

  // Set tier class
  card.className = 'milestone-card milestone-' + tier;

  // Tampilkan overlay
  overlay.classList.remove('hidden');
  overlay.classList.add('show');

  // Tombol lanjut
  const btnNext = document.getElementById('btn-milestone-next');
  const newBtnNext = btnNext.cloneNode(true);
  btnNext.parentNode.replaceChild(newBtnNext, btnNext);
  newBtnNext.addEventListener('click', () => {
    SFX.click();
    overlay.classList.remove('show');
    overlay.classList.add('hidden');
    onNext();
  });

  // Tombol share
  const btnShare = document.getElementById('btn-share');
  const newBtnShare = btnShare.cloneNode(true);
  btnShare.parentNode.replaceChild(newBtnShare, btnShare);
  newBtnShare.addEventListener('click', () => {
    SFX.click();
    shareResult(card, pangkat, correct, wrong, word, pesan);
  });
}

// ---- SHARE / SCREENSHOT ----
async function shareResult(card, pangkat, correct, wrong, word, pesan) {
  const shareText = `🕌 TAJWID AI — AMOGENZ\n\n${pangkat}\nLafadz: ${word}\n✅ Benar: ${correct}/6  ❌ Salah: ${wrong}/6\n\n"${pesan}"\n\n🔗 Coba juga di tajwid.amogenz.xyz`;

  // Coba screenshot dulu pakai html2canvas
  if (typeof html2canvas !== 'undefined') {
    try {
      const btn = document.getElementById('btn-share') || document.querySelector('.milestone-share-btn');
      if (btn) btn.textContent = '⏳ Proses...';

      const canvas = await html2canvas(card, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });

      if (btn) btn.innerHTML = '<span>📤 BAGIKAN</span>';

      canvas.toBlob(async (blob) => {
        const file = new File([blob], 'tajwid-ai-result.png', { type: 'image/png' });

        // Coba Web Share API dengan file
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: 'Tajwid AI — Amogenz',
              text: shareText,
              files: [file],
            });
            return;
          } catch (e) {
            // fallback ke download
          }
        }

        // Fallback: download gambar
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tajwid-ai-result.png';
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
      return;
    } catch (e) {
      // html2canvas gagal, fallback ke text share
    }
  }

  // Fallback: share teks saja
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Tajwid AI', text: shareText });
      return;
    } catch (e) {}
  }

  // Fallback terakhir: copy ke clipboard
  try {
    await navigator.clipboard.writeText(shareText);
    alert('✅ Hasil disalin ke clipboard!\nBisa paste di WA, IG, dll.');
  } catch (e) {
    alert(shareText);
  }
}


function showResult() {
  SFX.complete();
  const total = State.correct + State.wrong;
  const pct = total > 0 ? (State.correct / total) * 100 : 0;
  let rank = '';
  let trophy = '';
  if (pct >= 90) { rank = '★ HAFIDZ MUDA ★'; trophy = '🏆'; }
  else if (pct >= 75) { rank = '◆ MAHIR'; trophy = '🥇'; }
  else if (pct >= 60) { rank = '▲ BERKEMBANG'; trophy = '🥈'; }
  else               { rank = '▷ TERUS BERLATIH'; trophy = '📖'; }

  $('result-trophy').textContent = trophy;
  $('result-score').textContent = State.score;
  $('stat-correct').textContent = State.correct;
  $('stat-wrong').textContent = State.wrong;
  $('stat-total').textContent = total;
  $('result-rank').textContent = rank;
  Screens.go('result');
}

// ---- PAUSE / RESUME ----
function pauseGame() {
  $('pause-score-val').textContent = State.score;
  Screens.go('pause');
}
function resumeGame() {
  Screens.go('game');
}

// ---- START GAME ----
function startGame() {
  SFX.start();
  State.init();
  updateHUD();
  Screens.go('game');
  // scroll card stage to top
  setTimeout(() => {
    document.querySelector('.card-stage').scrollTop = 0;
    renderStep();
  }, 50);
}

// ---- EVENT LISTENERS ----
$('btn-start').addEventListener('click', () => {
  SFX.click();
  startGame();
});
$('btn-info').addEventListener('click', () => {
  SFX.click();
  Screens.go('howto');
});
$('btn-howto-close').addEventListener('click', () => {
  SFX.click();
  Screens.go('splash');
});
$('btn-howto-ok').addEventListener('click', () => {
  SFX.click();
  startGame();
});
$('btn-pause').addEventListener('click', () => {
  SFX.click();
  pauseGame();
});
$('btn-resume').addEventListener('click', () => {
  SFX.click();
  resumeGame();
});
$('btn-quit').addEventListener('click', () => {
  SFX.click();
  Screens.go('splash');
});
$('btn-next').addEventListener('click', () => {
  advance();
});
$('btn-replay').addEventListener('click', () => {
  SFX.click();
  startGame();
});
$('btn-home').addEventListener('click', () => {
  SFX.click();
  Screens.go('splash');
});

// ---- KEYBOARD SUPPORT ----
document.addEventListener('keydown', (e) => {
  if (Screens.current === 'game') {
    if (e.key === 'Escape') pauseGame();
    if (['a','b','c','d'].includes(e.key.toLowerCase())) {
      const idx = 'abcd'.indexOf(e.key.toLowerCase());
      const btns = $('options-area').querySelectorAll('.opt-btn');
      if (btns[idx] && !btns[idx].disabled) btns[idx].click();
    }
    if (e.key === 'Enter' && !$('explanation-box').classList.contains('hidden')) {
      advance();
    }
  }
  if (Screens.current === 'pause' && e.key === 'Escape') resumeGame();
});

// ---- SWIPE TO CLOSE PAUSE ----
let touchStart = 0;
document.addEventListener('touchstart', e => { touchStart = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchend', e => {
  if (Screens.current === 'pause') {
    const dy = touchStart - e.changedTouches[0].clientY;
    if (dy > 60) resumeGame();
  }
}, { passive: true });

// ---- PREVENT SCROLL BOUNCE ----
document.body.addEventListener('touchmove', e => {
  if (!e.target.closest('.card-stage, .panel-body, .howto-body')) {
    e.preventDefault();
  }
}, { passive: false });

// ---- INIT SPLASH ----
Screens.go('splash');
