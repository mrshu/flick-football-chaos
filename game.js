'use strict';
/* ================= Flick Football Chaos ================= */

/* ---------- constants & geometry (logical units) ---------- */
const W = 600, H = 900;
const SIDE_L = 22, SIDE_R = W - 22;          // side walls
const TOP_Y = 72, BOT_Y = H - 72;            // goal lines
const BACK_TOP = 18, BACK_BOT = H - 18;      // back of the nets
const MOUTH_HALF = 100;
const MOUTH_L = W / 2 - MOUTH_HALF, MOUTH_R = W / 2 + MOUTH_HALF;

const PLAYER_R = 26, BALL_R = 13, POST_R = 7;
const BASE_FRICTION = 0.982, SLIPPERY_FRICTION = 0.992; // per 1/60 s
const WALL_REST = 0.8, BODY_REST = 0.9;
const MAX_DRAG = 170, MAX_LAUNCH = 1500, SPEED_CAP = 2100;
const STOP_SPEED = 13, MAX_MOVE_TIME = 9;
const WIN_SCORE = 3;
const STEP = 1 / 120;

/* ---------- DOM ---------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const hudScoreH = el('scoreHuman'), hudScoreA = el('scoreAi'), hudTurn = el('turnMsg');
const chaosBanner = el('chaosBanner'), goalFlash = el('goalFlash');
const overlay = el('overlay'), overTitle = el('overTitle'), overSub = el('overSub');

/* ---------- responsive canvas ---------- */
function fitCanvas() {
  const stage = el('stage');
  const scale = Math.max(0.1, Math.min(stage.clientWidth / W, stage.clientHeight / H));
  canvas.style.width = (W * scale) + 'px';
  canvas.style.height = (H * scale) + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(W * scale * dpr));
  canvas.height = Math.max(1, Math.round(H * scale * dpr));
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}
window.addEventListener('resize', fitCanvas);

/* ---------- fullscreen ---------- */
const wrapEl = el('wrap'), fsBtn = el('fsBtn');
const requestFs = wrapEl.requestFullscreen || wrapEl.webkitRequestFullscreen;
const exitFs = document.exitFullscreen || document.webkitExitFullscreen;
const inFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

if (!requestFs) {
  fsBtn.classList.add('hidden'); // iOS Safari cannot fullscreen non-video elements
} else {
  const toggleFullscreen = () => {
    // the browser requires a user gesture; on refusal we stay windowed, but say why
    const p = inFullscreen() ? exitFs.call(document) : requestFs.call(wrapEl);
    if (p && p.catch) p.catch(err => console.warn('Fullscreen refused:', err && err.message));
  };
  fsBtn.addEventListener('click', toggleFullscreen);
  window.addEventListener('keydown', e => {
    if (e.key !== 'f' && e.key !== 'F') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave Cmd/Ctrl+F for browser find
    e.preventDefault();
    toggleFullscreen();
  });
  const onFsChange = () => {
    const on = inFullscreen();
    fsBtn.innerHTML = on ? '&#10005;' : '&#9974;';
    fsBtn.title = on ? 'Exit fullscreen (F)' : 'Fullscreen (F)';
    fitCanvas();                              // layout settles a frame later on some browsers
    requestAnimationFrame(fitCanvas);
  };
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
}

/* ---------- sound (tiny generated blips) ---------- */
const SFX = (() => {
  let ac = null;
  function ctxAudio() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function blip(freq, dur, type, vol, slideTo) {
    try {
      const c = ctxAudio(), o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), c.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.12, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + dur + 0.02);
    } catch (e) { /* audio unavailable — game plays silently */ }
  }
  return {
    unlock() { try { ctxAudio(); } catch (e) {} },
    select() { blip(520, 0.07, 'square', 0.07); },
    launch() { blip(200, 0.18, 'sawtooth', 0.1, 460); },
    hit(v)   { blip(140 + v * 120, 0.06, 'triangle', Math.min(0.14, 0.04 + v * 0.06)); },
    chaos()  { blip(330, 0.1, 'square', 0.1, 660); },
    goal()   { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'square', 0.11), i * 110)); },
    win(good) {
      const seq = good ? [523, 659, 784, 1047] : [392, 330, 262, 196];
      seq.forEach((f, i) => setTimeout(() => blip(f, 0.2, 'square', 0.1), i * 140));
    },
  };
})();

/* ---------- game state ---------- */
const HOME = {
  human: [[300, 790], [168, 648], [432, 648]],
  ai:    [[300, 110], [168, 252], [432, 252]],
};
const MODIFIERS = {
  giant:    '\u{1F388} GIANT BALL',
  super:    '\u{1F4A5} SUPER SHOT',
  slippery: '\u{1F9CA} SLIPPERY PITCH',
  tiny:     '\u{1F41C} TINY PLAYERS',
};

const game = {
  players: [], ball: null, posts: [],
  state: 'HUMAN_AIM', // HUMAN_AIM | MOVING | AI_WAIT | GOAL_PAUSE | OVER
  turn: 'human', mover: 'human',
  turnCount: 0, sinceChaos: 0, modifier: null,
  friction: BASE_FRICTION, powerMult: 1,
  score: { human: 0, ai: 0 }, lastScorer: null,
  timer: 0, moveTime: 0, ballRot: 0,
  drag: null, aiChoice: null,
  particles: [], lastHitSfx: 0,
};

function init() {
  game.posts = [
    [MOUTH_L, TOP_Y], [MOUTH_R, TOP_Y], [MOUTH_L, BOT_Y], [MOUTH_R, BOT_Y],
  ].map(([x, y]) => ({ x, y, vx: 0, vy: 0, r: POST_R, invM: 0 }));
  game.players = [];
  for (const team of ['human', 'ai']) {
    for (const [x, y] of HOME[team]) {
      game.players.push({ x, y, vx: 0, vy: 0, r: PLAYER_R, invM: 0.25, team, home: [x, y] });
    }
  }
  game.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: BALL_R, invM: 1, team: null, home: [W / 2, H / 2] };
}

const movers = () => [...game.players, game.ball];
const opp = t => (t === 'human' ? 'ai' : 'human');

function resetPositions() {
  for (const o of movers()) { [o.x, o.y] = o.home; o.vx = o.vy = 0; }
  game.ballRot = 0;
  game.drag = null;
  game.aiChoice = null;
}

function restart() {
  game.score.human = game.score.ai = 0;
  game.turnCount = 0;
  game.sinceChaos = 0;
  game.particles = [];
  game.lastScorer = null;
  clearModifier();
  resetPositions();
  overlay.classList.add('hidden');
  goalFlash.classList.add('hidden');
  updateScore();
  startTurn('human');
}

/* ---------- HUD helpers ---------- */
function updateScore() {
  hudScoreH.textContent = game.score.human;
  hudScoreA.textContent = game.score.ai;
}
function setTurnMsg(text, team) {
  hudTurn.textContent = text;
  hudTurn.className = team || '';
}

/* ---------- chaos modifiers ---------- */
function activateModifier(id) {
  game.modifier = id;
  if (id === 'giant') game.ball.r = BALL_R * 1.9;
  if (id === 'tiny') game.players.forEach(p => { p.r = PLAYER_R * 0.62; });
  if (id === 'slippery') game.friction = SLIPPERY_FRICTION;
  if (id === 'super') game.powerMult = 1.6;
  chaosBanner.textContent = MODIFIERS[id] + ' — this turn!';
  chaosBanner.classList.remove('hidden');
  SFX.chaos();
}
function clearModifier() {
  game.modifier = null;
  game.friction = BASE_FRICTION;
  game.powerMult = 1;
  if (game.ball) game.ball.r = BALL_R;
  game.players.forEach(p => { p.r = PLAYER_R; });
  chaosBanner.classList.add('hidden');
}

/* ---------- turn flow ---------- */
function startTurn(team) {
  game.turn = team;
  game.turnCount++;
  game.sinceChaos++;
  if (game.turnCount > 2 && game.sinceChaos >= 2 && Math.random() < 0.5) {
    const keys = Object.keys(MODIFIERS);
    activateModifier(keys[(Math.random() * keys.length) | 0]);
    game.sinceChaos = 0;
  }
  if (team === 'human') {
    game.state = 'HUMAN_AIM';
    setTurnMsg('Your turn — drag a blue player', 'human');
  } else {
    game.state = 'AI_WAIT';
    game.timer = 0.9;
    game.aiChoice = pickAiPlayer();
    setTurnMsg('CPU is thinking…', 'ai');
  }
}

function settle() {
  for (const o of movers()) o.vx = o.vy = 0;
  clearModifier();
  startTurn(opp(game.mover));
}

function goalScored(scorer) {
  game.score[scorer]++;
  game.lastScorer = scorer;
  updateScore();
  goalFlash.textContent = scorer === 'human' ? 'GOAL!' : 'CPU SCORES!';
  goalFlash.classList.remove('hidden');
  confetti(scorer === 'human' ? W / 2 : W / 2, scorer === 'human' ? TOP_Y : BOT_Y,
           scorer === 'human' ? 1 : -1);
  SFX.goal();
  game.state = 'GOAL_PAUSE';
  game.timer = 1.7;
}

function afterGoal() {
  goalFlash.classList.add('hidden');
  clearModifier();
  if (game.score[game.lastScorer] >= WIN_SCORE) {
    gameOver(game.lastScorer);
  } else {
    resetPositions();
    startTurn(opp(game.lastScorer)); // conceding team plays next
  }
}

function gameOver(winner) {
  game.state = 'OVER';
  overTitle.textContent = winner === 'human' ? 'You Win! \u{1F3C6}' : 'CPU Wins \u{1F916}';
  overSub.textContent = `Final score ${game.score.human} – ${game.score.ai}`;
  overlay.classList.remove('hidden');
  setTurnMsg(winner === 'human' ? 'Champion!' : 'Better luck next time!', winner);
  SFX.win(winner === 'human');
}

/* ---------- AI ---------- */
function pickAiPlayer() {
  const b = game.ball;
  let best = null, bestScore = Infinity;
  for (const p of game.players) {
    if (p.team !== 'ai') continue;
    const d = Math.hypot(p.x - b.x, p.y - b.y);
    const wrongSide = p.y > b.y - 6 ? 420 : 0; // player between ball and its own target goal
    if (d + wrongSide < bestScore) { bestScore = d + wrongSide; best = p; }
  }
  return best;
}

function aiLaunch() {
  const p = game.aiChoice || pickAiPlayer();
  const b = game.ball;
  let dx = W / 2 - b.x, dy = BACK_BOT - b.y;
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl; dy /= dl;
  // contact point slightly behind the ball so the hit pushes it goalward
  const tx = b.x - dx * (b.r + p.r) * 0.85;
  const ty = b.y - dy * (b.r + p.r) * 0.85;
  let ang = Math.atan2(ty - p.y, tx - p.x);
  ang += (Math.random() * 2 - 1) * 0.14; // aim error keeps the AI beatable
  const dist = Math.hypot(tx - p.x, ty - p.y);
  const power = Math.min(1, 0.5 + dist / 650 + Math.random() * 0.18);
  const sp = power * MAX_LAUNCH * game.powerMult;
  p.vx = Math.cos(ang) * sp;
  p.vy = Math.sin(ang) * sp;
  game.mover = 'ai';
  game.moveTime = 0;
  game.state = 'MOVING';
  game.aiChoice = null;
  setTurnMsg('CPU shoots!', 'ai');
  SFX.launch();
}

/* ---------- physics ---------- */
function collideCircles(a, b) {
  const invSum = a.invM + b.invM;
  if (invSum === 0) return;
  let dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  const minD = a.r + b.r;
  if (d >= minD) return;
  if (d < 1e-4) { d = 1e-4; dx = minD; dy = 0; } // perfectly stacked: push apart along x
  const nx = dx / d, ny = dy / d;
  const overlap = minD - d;
  a.x -= nx * overlap * (a.invM / invSum);
  a.y -= ny * overlap * (a.invM / invSum);
  b.x += nx * overlap * (b.invM / invSum);
  b.y += ny * overlap * (b.invM / invSum);
  const velN = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (velN > 0) return;
  const j = -(1 + BODY_REST) * velN / invSum;
  a.vx -= j * nx * a.invM; a.vy -= j * ny * a.invM;
  b.vx += j * nx * b.invM; b.vy += j * ny * b.invM;
  hitSfx(-velN);
}

function hitSfx(impact) {
  const now = performance.now();
  if (impact > 90 && now - game.lastHitSfx > 50) {
    game.lastHitSfx = now;
    SFX.hit(Math.min(1, impact / 1200));
  }
}

function walls(o) {
  const isBall = o === game.ball;
  if (o.x - o.r < SIDE_L) { o.x = SIDE_L + o.r; o.vx = Math.abs(o.vx) * WALL_REST; hitSfx(Math.abs(o.vx)); }
  if (o.x + o.r > SIDE_R) { o.x = SIDE_R - o.r; o.vx = -Math.abs(o.vx) * WALL_REST; hitSfx(Math.abs(o.vx)); }
  const inMouth = o.x > MOUTH_L + 4 && o.x < MOUTH_R - 4;
  if (isBall && inMouth) {
    // ball may pass the goal line; keep it inside the net box
    if (o.y < TOP_Y || o.y > BOT_Y) {
      if (o.x - o.r < MOUTH_L) { o.x = MOUTH_L + o.r; o.vx = Math.abs(o.vx) * WALL_REST; }
      if (o.x + o.r > MOUTH_R) { o.x = MOUTH_R - o.r; o.vx = -Math.abs(o.vx) * WALL_REST; }
    }
    if (o.y - o.r < BACK_TOP) { o.y = BACK_TOP + o.r; o.vy = Math.abs(o.vy) * WALL_REST; }
    if (o.y + o.r > BACK_BOT) { o.y = BACK_BOT - o.r; o.vy = -Math.abs(o.vy) * WALL_REST; }
  } else {
    if (o.y - o.r < TOP_Y) { o.y = TOP_Y + o.r; o.vy = Math.abs(o.vy) * WALL_REST; hitSfx(Math.abs(o.vy)); }
    if (o.y + o.r > BOT_Y) { o.y = BOT_Y - o.r; o.vy = -Math.abs(o.vy) * WALL_REST; hitSfx(Math.abs(o.vy)); }
  }
}

function physicsStep(dt) {
  const list = movers();
  const fr = Math.pow(game.friction, dt * 60);
  for (const o of list) {
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    o.vx *= fr; o.vy *= fr;
    const sp = Math.hypot(o.vx, o.vy);
    if (sp > SPEED_CAP) { o.vx *= SPEED_CAP / sp; o.vy *= SPEED_CAP / sp; }
    if (!isFinite(o.x) || !isFinite(o.y) || !isFinite(o.vx) || !isFinite(o.vy)) {
      o.x = W / 2; o.y = H / 2; o.vx = o.vy = 0;
    }
  }
  const b = game.ball;
  game.ballRot += (Math.hypot(b.vx, b.vy) / Math.max(b.r, 1)) * dt * (b.vx < 0 ? -1 : 1);
  for (let it = 0; it < 2; it++) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) collideCircles(list[i], list[j]);
    for (const o of list) for (const post of game.posts) collideCircles(o, post);
    for (const o of list) walls(o);
  }
  if (game.state === 'MOVING') {
    if (b.y + b.r < TOP_Y) goalScored('human');       // ball fully inside top goal
    else if (b.y - b.r > BOT_Y) goalScored('ai');     // ball fully inside bottom goal
  }
}

const allStopped = () => movers().every(o => Math.hypot(o.vx, o.vy) < STOP_SPEED);

/* ---------- input (pointer events cover mouse + touch) ---------- */
function ptFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  SFX.unlock();
  if (game.state !== 'HUMAN_AIM') return;
  const p = ptFromEvent(e);
  let best = null, bd = Infinity;
  for (const pl of game.players) {
    if (pl.team !== 'human') continue;
    const d = Math.hypot(pl.x - p.x, pl.y - p.y);
    if (d < pl.r + 22 && d < bd) { bd = d; best = pl; }
  }
  if (best) {
    game.drag = { player: best, px: p.x, py: p.y };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    SFX.select();
  }
});

canvas.addEventListener('pointermove', e => {
  if (!game.drag) return;
  e.preventDefault();
  const p = ptFromEvent(e);
  game.drag.px = p.x;
  game.drag.py = p.y;
});

function endDrag(e) {
  if (!game.drag) return;
  e.preventDefault();
  const { player, px, py } = game.drag;
  game.drag = null;
  const dx = player.x - px, dy = player.y - py;
  const len = Math.hypot(dx, dy);
  const power = Math.min(len / MAX_DRAG, 1);
  if (power < 0.07 || len < 1) return; // too gentle: cancel, keep aiming
  const sp = power * MAX_LAUNCH * game.powerMult;
  player.vx = (dx / len) * sp;
  player.vy = (dy / len) * sp;
  game.mover = 'human';
  game.moveTime = 0;
  game.state = 'MOVING';
  setTurnMsg('Nice flick!', 'human');
  SFX.launch();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => { game.drag = null; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

el('again').addEventListener('click', () => { SFX.unlock(); restart(); });

/* ---------- particles ---------- */
const CONFETTI_COLORS = ['#ffd54a', '#ff8a3d', '#57e389', '#6fb5ff', '#ff6b8a', '#c792ff'];
function confetti(x, y, dir) {
  for (let i = 0; i < 46; i++) {
    game.particles.push({
      x: x + (Math.random() - 0.5) * MOUTH_HALF * 2,
      y,
      vx: (Math.random() - 0.5) * 460,
      vy: dir * (60 + Math.random() * 420),
      life: 0.8 + Math.random() * 0.9,
      size: 4 + Math.random() * 5,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 12,
      color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
    });
  }
}
function updateParticles(dt) {
  for (const p of game.particles) {
    p.vy += 700 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.life -= dt;
  }
  game.particles = game.particles.filter(p => p.life > 0);
}

/* ---------- drawing ---------- */
function line(x1, y1, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function drawNet(yBack, yLine) {
  const top = Math.min(yBack, yLine), h = Math.abs(yLine - yBack);
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.fillRect(MOUTH_L, top, MOUTH_HALF * 2, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  for (let x = MOUTH_L; x <= MOUTH_R; x += 14) line(x, top, x, top + h);
  for (let y = top; y <= top + h; y += 14) line(MOUTH_L, y, MOUTH_R, y);
}

function drawPitch() {
  ctx.fillStyle = '#2e9e4f';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 9; i += 2) ctx.fillRect(0, i * 100, W, 100);

  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 4;
  ctx.strokeRect(SIDE_L, TOP_Y, SIDE_R - SIDE_L, BOT_Y - TOP_Y);
  line(SIDE_L, H / 2, SIDE_R, H / 2);
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 72, 0, 6.29); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 5, 0, 6.29); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  ctx.strokeRect(W / 2 - 140, TOP_Y, 280, 110);
  ctx.strokeRect(W / 2 - 140, BOT_Y - 110, 280, 110);

  drawNet(BACK_TOP, TOP_Y);
  drawNet(BACK_BOT, BOT_Y);

  for (const p of game.posts) {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.29);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#1b5e33'; ctx.stroke();
  }
}

function drawPlayer(p, t) {
  ctx.beginPath();
  ctx.ellipse(p.x + 3, p.y + 4, p.r, p.r * 0.92, 0, 0, 6.29);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();

  const isHuman = p.team === 'human';
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.29);
  ctx.fillStyle = isHuman ? '#3b82f6' : '#ef4444'; ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = isHuman ? '#1e50b0' : '#a51f1f'; ctx.stroke();

  ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.45, 0, 6.29);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.45, 0, 6.29);
  ctx.lineWidth = 2; ctx.strokeStyle = isHuman ? '#1e50b0' : '#a51f1f'; ctx.stroke();

  ctx.beginPath();
  ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.5, Math.PI * 0.9, Math.PI * 1.6);
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();

  // turn hints: pulse selectable blues, ring the CPU's pick
  const selected = game.drag && game.drag.player === p;
  if (selected || (game.state === 'AI_WAIT' && game.aiChoice === p)) {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 7, 0, 6.29);
    ctx.lineWidth = 4; ctx.strokeStyle = '#ffd54a'; ctx.stroke();
  } else if (game.state === 'HUMAN_AIM' && isHuman) {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6 + Math.sin(t * 5) * 2.5, 0, 6.29);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke();
  }
}

function drawBall(b) {
  ctx.beginPath();
  ctx.ellipse(b.x + 2, b.y + 3, b.r, b.r * 0.92, 0, 0, 6.29);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();

  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(game.ballRot);
  ctx.beginPath(); ctx.arc(0, 0, b.r, 0, 6.29);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#2b2b2b'; ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, b.r - 1, 0, 6.29); ctx.clip();
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    const a = k * 1.2566 - Math.PI / 2, rr = b.r * 0.4;
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  for (let k = 0; k < 5; k++) {
    const a = k * 1.2566 - Math.PI / 2 + 0.63;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * b.r * 0.85, Math.sin(a) * b.r * 0.85, b.r * 0.28, 0, 6.29);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

function drawAim() {
  if (!game.drag) return;
  const { player, px, py } = game.drag;
  const dx = player.x - px, dy = player.y - py;
  const len = Math.hypot(dx, dy);
  if (len < 6) return;
  const power = Math.min(len / MAX_DRAG, 1);
  const nx = dx / len, ny = dy / len;
  const col = `hsl(${120 * (1 - power)}, 95%, 55%)`;

  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  line(player.x, player.y, px, py);

  const aLen = (46 + power * 190) * (game.powerMult > 1 ? 1.15 : 1);
  const ex = player.x + nx * aLen, ey = player.y + ny * aLen;
  ctx.strokeStyle = col;
  ctx.lineWidth = 6;
  ctx.setLineDash([13, 11]);
  line(player.x + nx * (player.r + 4), player.y + ny * (player.r + 4), ex, ey);
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(ex + nx * 16, ey + ny * 16);
  ctx.lineTo(ex - ny * 9, ey + nx * 9);
  ctx.lineTo(ex + ny * 9, ey - nx * 9);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();

  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r + 11, -Math.PI / 2, -Math.PI / 2 + power * Math.PI * 2);
  ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.stroke();
}

function drawParticles() {
  for (const p of game.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
    ctx.restore();
  }
}

function draw(t) {
  ctx.clearRect(0, 0, W, H);
  drawPitch();
  for (const p of game.players) drawPlayer(p, t);
  drawBall(game.ball);
  drawAim();
  drawParticles();
}

/* ---------- main loop ---------- */
let last = performance.now(), acc = 0;
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  if (game.state === 'AI_WAIT') {
    game.timer -= dt;
    if (game.timer <= 0) aiLaunch();
  } else if (game.state === 'GOAL_PAUSE') {
    game.timer -= dt;
    if (game.timer <= 0) afterGoal();
  } else if (game.state === 'MOVING') {
    acc += dt;
    game.moveTime += dt;
    let steps = 0;
    while (acc >= STEP && steps < 12 && game.state === 'MOVING') {
      physicsStep(STEP);
      acc -= STEP;
      steps++;
    }
    if (game.state !== 'MOVING') acc = 0;
    else if (allStopped() || game.moveTime > MAX_MOVE_TIME) settle();
  } else {
    acc = 0;
  }

  updateParticles(dt);
  draw(now / 1000);
  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
init();
fitCanvas();
restart();
requestAnimationFrame(frame);
