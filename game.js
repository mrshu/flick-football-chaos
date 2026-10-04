'use strict';
/* ================= Flick Football Chaos ================= */

/* ---------- constants & geometry (logical units) ---------- */
const W = 600, H = 900;
const SIDE_L = 22, SIDE_R = W - 22;          // side walls
const TOP_Y = 72, BOT_Y = H - 72;            // goal lines
const BACK_TOP = 18, BACK_BOT = H - 18;      // back of the nets
// Narrowed from 100 (playtester defect: a 200-wide mouth is 36% of the pitch
// and made direct shots too forgiving), then widened again from 80 once the
// keeper started reading shots: the posts no longer have to carry the
// difficulty on their own, and at 80 the goals simply looked too small.
const MOUTH_HALF = 95;
const MOUTH_L = W / 2 - MOUTH_HALF, MOUTH_R = W / 2 + MOUTH_HALF;

const PLAYER_R = 26, BALL_R = 13, POST_R = 7;
const BASE_FRICTION = 0.982, SLIPPERY_FRICTION = 0.992; // per 1/60 s
// WALL_REST lowered from 0.8 (playtester defect: a side-wall ricochet kept
// 80% of its speed and regularly funnelled wildly-mis-aimed shots into the
// goal). 0.6 was tuned against the measurement harness in the plan doc - it
// kills the wall-bounce-then-score pattern without making the side walls
// feel dead for ordinary play. BODY_REST (player/ball hits) is untouched -
// the flick must stay springy.
const WALL_REST = 0.6, BODY_REST = 0.9;
const MAX_DRAG = 170, MAX_LAUNCH = 1500, SPEED_CAP = 2100;
// Below this a drag is a tap, not a flick: a five-year-old's accidental touch
// must not spend a turn. drawAim uses the same number, so the arrow only
// appears once releasing would actually launch.
const MIN_DRAG = MAX_DRAG * 0.07;
const STOP_SPEED = 13, MAX_MOVE_TIME = 9;
const WIN_SCORE = 3;
const STEP = 1 / 120;

// ---- goalkeepers (playtester defect: direct shots scored too easily) ----
// One extra body per side, a plain physics body like any other (BODY_REST
// applies through the normal collideCircles path). What it does on a shot is
// in keeperReact; what the child can do with theirs is in pointerdown.
const KEEPER_R = PLAYER_R;
// Keepers were invM 0 when they were fixed obstacles. Now that the child can
// flick them they must have real mass, or two keepers pass straight through
// each other (collideCircles bails when both masses are infinite) and a flicked
// keeper ploughs through everything without ever slowing. Slightly heavier than
// an outfield player, so the ball cannot easily barge it off its line.
const KEEPER_INV_M = 0.18;
const KEEPER_Y_INSET = 26; // how far in front of its own goal line it stands
const KEEPER_MIN_X = MOUTH_L + KEEPER_R, KEEPER_MAX_X = MOUTH_R - KEEPER_R;
// The AI keeper's line, and how it reacts once a shot is on its way.
//
// It reads the shot rather than the aim. Tracking the aim while the child was
// still lining up punished them for taking care: measured over the goal mouth,
// a shot aimed for a second went in 14% of the time against 32% for a static
// keeper, while a hurried flick beat it 59% of the time. Reacting to the ball
// puts that the right way round — a well-placed shot is rewarded, and the
// keeper is beaten by placement rather than by haste.
const KEEPER_LINE_Y = TOP_Y + KEEPER_Y_INSET;
// Tournament.opponentFor controls reaction speed, delay, and reading error.
// Even the strongest keeper has error and a finite travel speed, so a quick
// corner shot can still beat it.

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
const MODIFIERS = {
  giant:    '\u{1F388} GIANT BALL',
  super:    '\u{1F4A5} SUPER SHOT',
  slippery: '\u{1F9CA} SLIPPERY PITCH',
  tiny:     '\u{1F41C} TINY PLAYERS',
};

const game = {
  players: [], ball: null, posts: [], keepers: [],
  // AI_SAVE_QUESTION: a CPU shot was simulated forward and found to be on
  // target; the modal is up, waiting on the child's save question. No
  // timer drives it - see askSaveQuestion.
  state: 'START', // START | MATCHMAKING | HUMAN_QUESTION | HUMAN_SETUP | HUMAN_AIM | MOVING | AI_WAIT | AI_SAVE_QUESTION | GOAL_PAUSE | OVER
  mover: 'human',
  maths: null, mathsOn: true,
  mode: 'single',   // 'single' | 'cup' — only the cup advances the draw
  friendlyLevel: 1,
  matchOpponent: null, matchReady: false, // identity stays fixed through full time
  keeperDive: null, // {x, wait} once the AI keeper has read the shot in flight
  turnCount: 0, sinceChaos: 0,
  friction: BASE_FRICTION, powerMult: 1,
  bonus: null, lastBonus: null, extraFlicks: 0, bigStriker: null, setup: null,
  activeStreakPowers: [], // armed for this human flick, including its final use
  plannedAiShot: null, pendingAiShot: null, pendingSaveX: null,
  score: { human: 0, ai: 0 }, lastScorer: null,
  timer: 0, moveTime: 0, ballRot: 0,
  drag: null, aiChoice: null, threatPath: null,
  humanTurns: 0, nextQuestionTurn: 3,
  shake: 0, trail: [],
  save: null, slot: null, aiSkill: 0.20,
  opponent: Tournament.opponentFor(0, 0),
  particles: [], lastHitSfx: 0,
};

function init() {
  game.posts = [
    [MOUTH_L, TOP_Y], [MOUTH_R, TOP_Y], [MOUTH_L, BOT_Y], [MOUTH_R, BOT_Y],
  ].map(([x, y]) => ({ x, y, vx: 0, vy: 0, r: POST_R, invM: 0 }));
  game.players = [];
  const formation = Formation.make(Math.random);
  for (const team of ['human', 'ai']) {
    for (const [x, y] of formation[team]) {
      game.players.push({ x, y, vx: 0, vy: 0, r: PLAYER_R, invM: 0.25, team, home: [x, y] });
    }
  }
  game.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: BALL_R, invM: 1, team: null, home: [W / 2, H / 2] };
  // Kept out of game.players on purpose: that array is what pickAiPlayer
  // scans for a CPU shooter, so keeping keepers separate is what makes them
  // un-choosable as one, with no "is this a keeper" guard at that call site.
  // pointerdown scans every mover instead, because the child may flick theirs.
  game.keepers = [
    { x: W / 2, y: TOP_Y + KEEPER_Y_INSET, vx: 0, vy: 0, r: KEEPER_R, invM: KEEPER_INV_M,
      team: 'ai', home: [W / 2, TOP_Y + KEEPER_Y_INSET] },
    { x: W / 2, y: BOT_Y - KEEPER_Y_INSET, vx: 0, vy: 0, r: KEEPER_R, invM: KEEPER_INV_M,
      team: 'human', home: [W / 2, BOT_Y - KEEPER_Y_INSET] },
  ];
  aiKeeper = game.keepers[0];
  humanKeeper = game.keepers[1];
  movers = [...game.players, ...game.keepers, game.ball];
}

// Every body the physics moves, in a fixed order the lookahead relies on: the
// ball is always last. Built once in init(), because nothing afterwards adds or
// removes one - chaos modifiers and resetPositions mutate them in place - and
// physicsStep would otherwise rebuild it twelve times a frame.
let movers = [], aiKeeper = null, humanKeeper = null;
const opp = t => (t === 'human' ? 'ai' : 'human');

// A fresh random formation (mirrored, exploit-free per Formation.make) is
// dealt out at every kickoff and every goal reset - not just once at boot -
// so the same straight-up opening never repeats and each restart looks
// different. Only outfield players move; the ball always resets to centre.
function resetPositions() {
  const formation = Formation.make(Math.random);
  let hi = 0, ai = 0;
  for (const p of game.players) {
    p.home = p.team === 'human' ? formation.human[hi++] : formation.ai[ai++];
  }
  for (const o of movers) { [o.x, o.y] = o.home; o.vx = o.vy = 0; }
  game.ballRot = 0;
}

function restart() {
  // The introduction chooses the rival once. Direct restarts also prepare a
  // match, but goals and cup advancement never replace the active identity.
  if (game.state !== 'MATCHMAKING' || !game.matchOpponent) {
    game.matchOpponent = Tournament.matchFor(game.mode, game.friendlyLevel,
      game.slot.cup, game.slot.band, game.slot.emoji, Math.random);
  }
  game.opponent = game.matchOpponent.profile;
  game.aiSkill = game.opponent.skill;
  // Time on a pitch, measured from kickoff to full time. Wall-clock from the
  // start screen would count a tablet left face-up on a sofa as practice.
  game.kickoffAt = Date.now();
  game.score.human = game.score.ai = 0;
  game.turnCount = 0;
  game.humanTurns = 0;
  game.nextQuestionTurn = 3;
  game.sinceChaos = 0;
  game.particles = [];
  game.lastScorer = null;
  clearModifier();
  resetPositions();
  Quiz.hide();
  game.plannedAiShot = null;
  game.pendingAiShot = null;
  game.pendingSaveX = null;
  game.threatPath = null;
  overlay.classList.add('hidden');
  goalFlash.classList.add('hidden');
  updateScore();
  startTurn('human');
  el('hud').classList.remove('hidden');
  refreshOpponentHud();
  fitCanvas();
}

/* ---------- persistence ---------- */
// The child's slot is loaded once at boot and written back whenever something
// they earned changes. Everything here tolerates storage being unavailable.
function persist() { Store.save(game.save); }

// Teams whose home band is 9+ get the broadcast look. A class on body and
// CSS overrides only - layout, markup and physics are identical, and a
// sibling's younger team on the same device is untouched.
function applySkin() {
  document.body.classList.toggle('pro', game.slot.band >= 9);
}

function loadProgress() {
  game.save = Store.load();
  game.slot = Store.activeSlot(game.save);
  applySkin();
  // aiSkill is not set here: boot calls refreshStart() next, which does it.
}

// Adaptive state belongs to the slot, so a sibling on another slot is not
// dragged around by this child's answers.
function rememberMaths() {
  game.slot.maths = game.maths;
  persist();
}

/* ---------- HUD helpers ---------- */
function updateScore() {
  hudScoreH.textContent = game.score.human;
  hudScoreA.textContent = game.score.ai;
}
function setTurnMsg(text, team) {
  hudTurn.textContent = text;
  hudTurn.className = team;
}

function rivalName() { return game.matchOpponent ? game.matchOpponent.name : 'Opponent'; }

function levelLabel(level) {
  return 'Level ' + level + ' · ' + Tournament.LEVELS[level - 1].name;
}

function seasonHint(opponent) {
  if (!opponent || !opponent.season || opponent.season < 2) return '';
  return 'Season ' + opponent.season + ' — tougher than the first cup';
}

function refreshOpponentHud() {
  el('hudYouFlag').textContent = game.slot.emoji || '⚽';
  el('hudYouName').textContent = game.slot.name || 'You';
  if (game.matchOpponent) {
    el('hudFoeFlag').textContent = game.matchOpponent.flag;
    el('hudFoeName').textContent = game.matchOpponent.name;
    el('hudFoeLevel').textContent = 'Level ' + game.matchOpponent.level;
    el('hudFoeName').title = game.matchOpponent.name + ' · ' + Names.country(game.matchOpponent.flag);
  }
}

// Matching is a short local reveal, with an explicit kickoff. Nothing starts
// while the child is reading it, and backing out leaves cup progress intact.
function findOpponent() {
  el('hud').classList.add('hidden');
  clearModifier();
  Quiz.hide();
  overlay.classList.add('hidden');
  goalFlash.classList.add('hidden');
  game.matchOpponent = Tournament.matchFor(game.mode, game.friendlyLevel,
    game.slot.cup, game.slot.band, game.slot.emoji, Math.random);
  game.state = 'MATCHMAKING';
  game.matchReady = false;
  game.timer = .7;
  game.plannedAiShot = game.pendingAiShot = null;
  game.pendingSaveX = game.threatPath = null;
  const foe = game.matchOpponent;
  el('matchRound').textContent = foe.round || 'One match';
  el('matchTitle').textContent = 'Finding an opponent…';
  el('matchYouFlag').textContent = game.slot.emoji;
  el('matchYouName').textContent = game.slot.name || 'You';
  el('matchFoeFlag').textContent = '?';
  el('matchFoeName').textContent = 'Searching…';
  el('matchFoeCountry').textContent = '';
  el('matchLevel').textContent = levelLabel(foe.level);
  el('matchHint').textContent = Tournament.LEVELS[foe.level - 1].hint;
  el('matchSeason').textContent = seasonHint(foe);
  el('matchGo').disabled = true;
  el('matchSearch').classList.remove('hidden');
  el('matchmaking').classList.remove('hidden');
  if (el('matchBack').focus) el('matchBack').focus();
  game.score.human = game.score.ai = 0;
  updateScore();
  refreshStreakHud();
  // In a cup the draw already found the rival: introduce that known opponent.
  if (game.mode === 'cup') revealOpponent();
}

function revealOpponent() {
  if (game.state !== 'MATCHMAKING' || game.matchReady) return;
  const foe = game.matchOpponent;
  game.matchReady = true;
  el('matchTitle').textContent = game.mode === 'cup' ? 'Meet your opponent' : 'Opponent found!';
  el('matchFoeFlag').textContent = foe.flag;
  el('matchFoeName').textContent = foe.name;
  el('matchFoeCountry').textContent = Names.country(foe.flag);
  el('matchGo').disabled = false;
  el('matchSearch').classList.add('hidden');
  refreshOpponentHud();
}

el('matchGo').addEventListener('click', () => {
  if (game.state !== 'MATCHMAKING' || !game.matchReady) return;
  SFX.unlock();
  el('matchmaking').classList.add('hidden');
  restart();
});
el('matchBack').addEventListener('click', () => {
  SFX.select();
  goHome();
});

/* ---------- chaos modifiers ---------- */
function activateModifier(id) {
  if (id === 'giant') game.ball.r = BALL_R * 1.9;
  if (id === 'tiny') game.players.forEach(p => { p.r = PLAYER_R * 0.62; });
  if (id === 'slippery') game.friction = SLIPPERY_FRICTION;
  if (id === 'super') game.powerMult = 1.6;
  chaosBanner.textContent = MODIFIERS[id] + ' — this turn!';
  chaosBanner.classList.remove('hidden');
  SFX.chaos();
}
function clearModifier() {
  const restoringDefenders = isBonusActive('small');
  game.friction = BASE_FRICTION;
  game.powerMult = 1;
  game.ball.r = BALL_R;
  game.players.forEach(p => { p.r = PLAYER_R; });
  if (restoringDefenders) restoreDefenderSpace();
  game.bonus = null;
  game.activeStreakPowers = [];
  game.extraFlicks = 0;
  game.bigStriker = null;
  game.setup = null;
  game.drag = null;
  game.keeperDive = null;
  el('bonusAction').classList.add('hidden');
  chaosBanner.classList.add('hidden');
  refreshStreakHud();
}

/* ---------- earned football bonuses ---------- */
const BONUS_BOUNDS = { left: SIDE_L, right: SIDE_R, top: TOP_Y, bottom: BOT_Y };

function isBonusActive(id) {
  return game.bonus === id || game.activeStreakPowers.includes(id);
}

function refreshStreakHud() {
  const hud = el('streakHud'), oldHeight = hud.offsetHeight;
  function write(id, value) {
    const node = el(id), text = String(value);
    if (node.textContent !== text) node.textContent = text;
  }
  const visible = game.mathsOn && game.slot &&
    !['START', 'MATCHMAKING', 'OVER'].includes(game.state);
  hud.classList.toggle('hidden', !visible);
  if (visible) {
    const streak = game.slot.stats.curStreak;
    const next = Bonuses.nextStreakReward(streak);
    const interval = Bonuses.STREAK_REWARDS.find(reward => reward.id === next.id).at;
    const needed = next.at - streak;
    const progress = interval - needed;
    hud.classList.toggle('hot', streak >= 3);
    write('streakCount', streak);
    write('streakProgress', needed + ' more for ' + Bonuses.DEFS[next.id].name);
    write('streakTarget', Bonuses.DEFS[next.id].glyph);
    for (let i = 0; i < 8; i++) {
      const pip = el('streakPip' + i);
      pip.classList.toggle('hidden', i >= interval);
      pip.classList.toggle('complete', i < progress);
      pip.classList.toggle('next', i === progress);
    }
    let any = false;
    for (const reward of Bonuses.STREAK_REWARDS) {
      const id = reward.id, remaining = game.slot.streakPowers[id];
      const inUse = game.state === 'MOVING' && game.mover === 'human' &&
        game.activeStreakPowers.includes(id);
      const chipId = 'streak' + id[0].toUpperCase() + id.slice(1);
      const chip = el(chipId);
      const show = remaining > 0 || inUse;
      chip.classList.toggle('hidden', !show);
      if (show) {
        const count = remaining > 0 ? remaining + (remaining === 1 ? ' flick' : ' flicks') : 'last flick';
        write(chipId + 'Count', count);
        any = true;
      }
    }
    el('streakPowers').classList.toggle('hidden', !any);
  }
  // Refit when the strip changes height so portrait input stays aligned.
  if (hud.offsetHeight !== oldHeight) fitCanvas();
}

function prepareBigStriker() {
  const choices = game.players.filter(canGrow).sort((a, b) =>
    Math.hypot(a.x - game.ball.x, a.y - game.ball.y) - Math.hypot(b.x - game.ball.x, b.y - game.ball.y));
  if (choices.length) growStriker(choices[0]);
}

function applyStreakPowers() {
  game.activeStreakPowers = game.mathsOn ? Bonuses.STREAK_REWARDS
    .filter(reward => game.slot.streakPowers[reward.id] > 0).map(reward => reward.id) : [];
  if (game.activeStreakPowers.includes('small')) {
    game.players.filter(p => p.team === 'ai').forEach(p => { p.r = PLAYER_R * Bonuses.SHRINK; });
  }
  if (game.activeStreakPowers.includes('big') && !game.bigStriker) prepareBigStriker();
  refreshStreakHud();
}

function consumeStreakPowers(player) {
  let used = false;
  for (const id of game.activeStreakPowers) {
    // A keeper or a striker without growth space should not waste this perk.
    if (id === 'big' && (game.bigStriker !== player || player.r <= PLAYER_R)) continue;
    game.slot.streakPowers[id] = Math.max(0, game.slot.streakPowers[id] - 1);
    used = true;
  }
  if (used) persist();
  refreshStreakHud();
}

function restoreDefenderSpace() {
  // A tiny defender can finish closer to the ball than a full-sized one can.
  // Restore it into nearby free space before the CPU chooses its shot; do not
  // let expansion shove the ball or the child's pieces on the next frame.
  const obstacles = [...movers, ...game.posts];
  for (const p of game.players.filter(p => p.team === 'ai')) {
    function fits(x, y) {
      return x - p.r >= SIDE_L && x + p.r <= SIDE_R &&
        y - p.r >= TOP_Y && y + p.r <= BOT_Y && obstacles.every(o => o === p ||
          Math.hypot(o.x - x, o.y - y) >= p.r + o.r + 0.1);
    }
    if (fits(p.x, p.y)) continue;
    const origin = { x: p.x, y: p.y };
    let found = false;
    for (let distance = 4; distance < Math.hypot(W, H) && !found; distance += 4) {
      for (let n = 0; n < 24; n++) {
        const a = n * Math.PI / 12;
        const x = origin.x + Math.cos(a) * distance, y = origin.y + Math.sin(a) * distance;
        if (fits(x, y)) { p.x = x; p.y = y; found = true; break; }
      }
    }
  }
}

function canGrow(player) {
  const r = PLAYER_R * Bonuses.GROW;
  return game.players.includes(player) && player.team === 'human' &&
    player.x - r >= SIDE_L && player.x + r <= SIDE_R &&
    player.y - r >= TOP_Y && player.y + r <= BOT_Y &&
    [...movers, ...game.posts].every(o => o === player ||
      Math.hypot(o.x - player.x, o.y - player.y) >= o.r + r + 2);
}

function growStriker(player) {
  if (game.bigStriker) game.bigStriker.r = PLAYER_R;
  game.bigStriker = null;
  if (canGrow(player)) {
    player.r = PLAYER_R * Bonuses.GROW;
    game.bigStriker = player;
  }
}

function hasSetupSpace() {
  return game.players.some(p => p.team === 'human' && [0, 1, 2, 3, 4, 5, 6, 7].some(n => {
    const a = n * Math.PI / 4;
    const target = Bonuses.moveTarget(p,
      { x: p.x + Math.cos(a) * Bonuses.MOVE_LIMIT, y: p.y + Math.sin(a) * Bonuses.MOVE_LIMIT },
      movers, game.posts, BONUS_BOUNDS);
    return target && Math.hypot(target.x - p.x, target.y - p.y) >= MIN_DRAG;
  }));
}

function pickBonus() {
  const ids = ['second'];
  if (!isBonusActive('coach')) ids.push('coach');
  if (Math.abs(aiKeeper.y - KEEPER_LINE_Y) < KEEPER_R && game.ball.y > KEEPER_LINE_Y) ids.push('feint');
  if (!isBonusActive('small') && game.players.some(p => p.team === 'ai' && p.y < game.ball.y + PLAYER_R)) ids.push('small');
  if (!isBonusActive('big') && game.players.some(canGrow)) ids.push('big');
  if (hasSetupSpace()) ids.push('move');
  // Offer a useful effect and avoid showing the same prize twice running.
  const fresh = ids.filter(id => id !== game.lastBonus);
  const choices = fresh.length ? fresh : ids;
  const id = choices[(Math.random() * choices.length) | 0];
  game.lastBonus = id;
  return id;
}

function announceBonus(id, hint) {
  const def = Bonuses.DEFS[id];
  const streakFlicks = game.activeStreakPowers.includes(id) && game.slot.streakPowers[id];
  const detail = hint || (streakFlicks ? streakFlicks + ' streak flicks earned' :
    id === 'second' ? '2 flicks before ' + rivalName() :
    id === 'move' ? 'Move a blue player, then flick' : 'This flick');
  chaosBanner.textContent = def.glyph + ' ' + def.name + ' — ' + detail;
  chaosBanner.classList.remove('hidden');
}

function activateBonus(id) {
  game.bonus = id;
  if (id === 'small') game.players.filter(p => p.team === 'ai').forEach(p => { p.r = PLAYER_R * Bonuses.SHRINK; });
  if (id === 'big') prepareBigStriker();
  if (id === 'second') game.extraFlicks = 1;
  if (id === 'move') {
    game.state = 'HUMAN_SETUP';
    game.setup = { player: null, target: null, pointer: null, dragging: false, grabbed: false, startPoint: null };
    el('bonusAction').classList.remove('hidden');
    setTurnMsg('Move blue, then flick', 'human');
  }
  announceBonus(id);
  SFX.chaos();
}

function finishSetup(target) {
  if (target && game.setup && game.setup.player) {
    Object.assign(game.setup.player, target);
    SFX.select();
  }
  game.setup = null;
  el('bonusAction').classList.add('hidden');
  game.state = 'HUMAN_AIM';
  setTurnMsg('Your turn — drag a blue player', 'human');
  announceBonus('move', target ? 'New position ready — take your flick' : 'Take your normal flick');
}

el('bonusAction').addEventListener('click', () => {
  if (game.state === 'HUMAN_SETUP') finishSetup(null);
});

/* ---------- human-turn maths question ---------- */
// A question advertises a useful football bonus before it is answered.
// Earned advantages are separate from the maths-off arcade chaos catalogue.
// Answering right grants that exact advantage; answering wrong
// still hands the player their flick, and skipping is instant and free.
// Quiz.js owns the cancellable feedback timer, so the flash-then-continue
// behaviour lives in one place.
// Both flavours share one cooldown. Start with two football-only turns and
// leave at least two ordinary human turns between offers. Skipping buys a
// longer break without changing the learner's maths level or costing a flick.
const QUESTION_GAP = 3, SKIP_QUESTION_GAP = 5;
const BONUS_QUESTION_CHANCE = 0.40, SAVE_QUESTION_CHANCE = 0.55;

function questionReady() { return game.humanTurns >= game.nextQuestionTurn; }
function reserveQuestion() { game.nextQuestionTurn = game.humanTurns + QUESTION_GAP; }
function skipQuestion() { game.nextQuestionTurn = game.humanTurns + SKIP_QUESTION_GAP; }

function worthABonus() {
  // Attacking half only: offer help when there is an attacking opportunity.
  return game.ball.y <= H / 2 && questionReady() && Math.random() < BONUS_QUESTION_CHANCE;
}

// Both question flavours record the same way. Streaks and the fastest
// correct answer live in slot.stats so they survive across sessions and
// repair like every other counter.
function recordAnswer(correct, elapsedMs) {
  var st = game.slot.stats;
  st.answered += 1;
  if (correct) {
    st.correct += 1;
    st.curStreak += 1;
    if (st.curStreak > st.bestStreak) { st.bestStreak = st.curStreak; }
    const rewards = Bonuses.streakRewards(st.curStreak);
    for (const reward of rewards) {
      game.slot.streakPowers[reward.id] = Math.max(game.slot.streakPowers[reward.id], reward.flicks);
    }
    if (rewards.length) {
      const hud = el('streakHud');
      hud.classList.remove('earned');
      void hud.offsetWidth; // restart the short, answer-triggered celebration
      hud.classList.add('earned');
    }
    // 0 is the "no record yet" sentinel, so a 0ms (or negative, from a
    // clock adjustment) elapsed time can never be stored as a record.
    if (elapsedMs > 0 && (!st.bestMs || elapsedMs < st.bestMs)) { st.bestMs = elapsedMs; }
  } else {
    st.curStreak = 0;
  }
  // A save answer can earn future powers, but must not change the bodies of
  // the CPU shot already queued against this exact pitch geometry.
  refreshStreakHud();
}

function askQuestion() {
  reserveQuestion();
  if (!game.maths) { game.maths = Maths.newState(game.slot.band); }
  game.state = 'HUMAN_QUESTION';
  setTurnMsg('Your turn', 'human');
  var q = Maths.make(game.maths.difficulty, game.maths, Math.random);
  var prizeId = pickBonus();
  Quiz.show(q, prizeId, function (correct, elapsedMs) {
    game.maths = Maths.update(game.maths, {
      correct: correct, elapsedMs: elapsedMs, band: q.band, skill: q.skill
    });
    recordAnswer(correct, elapsedMs);
    rememberMaths();
    finishQuestion(correct, prizeId);
  }, function () {
    skipQuestion();
    finishQuestion(false, prizeId); // skip: no penalty, but no prize either
  }, 'Optional bonus');
}

function finishQuestion(correct, prizeId) {
  game.state = 'HUMAN_AIM';
  setTurnMsg('Your turn — drag a blue player', 'human');
  applyStreakPowers();
  if (correct) { activateBonus(prizeId); }
}

/* ---------- CPU save question ---------- */
// Mirrors askQuestion/finishQuestion above but themed as a save rather
// than a bonus - a glove glyph and "Answer to save!" instead of a prize -
// and is only ever shown by aiLaunch after its forward simulation found
// the pending shot on target. No timer: the game waits for the child, the
// same as the bonus question.
function askSaveQuestion() {
  reserveQuestion();
  if (!game.maths) { game.maths = Maths.newState(game.slot.band); }
  setTurnMsg(rivalName() + ' shoots — save it!', 'ai');
  var q = Maths.make(game.maths.difficulty, game.maths, Math.random);
  Quiz.show(q, 'save', function (correct, elapsedMs) {
    game.maths = Maths.update(game.maths, {
      correct: correct, elapsedMs: elapsedMs, band: q.band, skill: q.skill
    });
    recordAnswer(correct, elapsedMs);
    rememberMaths();
    finishSaveQuestion(correct);
  }, function () {
    skipQuestion();
    finishSaveQuestion(false); // skip: shot stands, but no Maths.update - declining says nothing about ability
  }, 'Save chance');
}

function finishSaveQuestion(correct) {
  var shot = game.pendingAiShot, saveX = game.pendingSaveX;
  game.pendingAiShot = null;
  game.pendingSaveX = null;
  game.threatPath = null;
  if (correct) { saveShot(shot, saveX); }
  commitAiShot(shot);
}

// Diving changes the physics the prediction was made against, so diving once to
// the predicted point saved only ~83% of shots, and iterating from there still
// left ~10% conceded. "I answered correctly and it still went in" reads as the
// game cheating, so instead: try the keeper across its whole line and take the
// first position that genuinely stops the shot. Roughly a dozen short
// simulations, run once, only when a save has been earned.
function saveShot(shot, firstX) {
  var candidates = [firstX], span = KEEPER_MAX_X - KEEPER_MIN_X, i, x;
  for (i = 0; i <= 12; i++) { candidates.push(KEEPER_MIN_X + span * i / 12); }
  for (i = 0; i < candidates.length; i++) {
    x = candidates[i];
    diveKeeper(x);
    if (!simulateAiShot(shot).scores) { return; }
  }
  diveKeeper(firstX); // nothing stops it - keep the honest dive rather than none
}



/* ---------- goalkeepers ---------- */
// Keepers are ordinary bodies. Nothing repositions them between turns: they
// stay where play or the child's flick leaves them, and are put back on their
// line by resetPositions() after a goal, exactly like every outfield player.
//
// Where a ball on its current heading would cross the keeper's line. Straight
// extrapolation: between the ball and the goal there is nothing to curve it,
// and friction changes when it arrives, not where.
function crossingX(ball) {
  if (ball.vy > -1e-6 || ball.y <= KEEPER_LINE_Y) { return null; }
  return ball.x + ball.vx * (KEEPER_LINE_Y - ball.y) / ball.vy;
}

// The keeper dives once the shot is on its way, at a point it has read off the
// ball — imperfectly. The misread is drawn once per shot, not per frame, or the
// errors would average out and leave a perfect tracker.
//
// Later keepers also react sooner and move faster. They still travel from
// where they stand, so a quick far-corner shot can outrun even the final's.
function keeperReact(dt) {
  if (game.state !== 'MOVING' || game.mover !== 'human') { game.keeperDive = null; return; }
  if (game.bonus === 'feint') { game.keeperDive = null; return; }
  var k = aiKeeper;

  var predicted = crossingX(game.ball);
  if (predicted === null) { return; }        // not coming: hold position

  if (game.keeperDive === null) {
    var spread = game.opponent.keeperError;
    game.keeperDive = {
      x: predicted + (Math.random() * 2 - 1) * spread,
      wait: game.opponent.keeperDelay
    };
  }
  if (game.keeperDive.wait > 0) { game.keeperDive.wait -= dt; return; }

  k.x = Formation.keeperStep(k.x, game.keeperDive.x, game.opponent.keeperSpeed * dt,
                             KEEPER_MIN_X, KEEPER_MAX_X);
  // Along the line only. Nudging it forward would take it out of its own goal
  // and hand the child an empty net for missing.
  k.y = KEEPER_LINE_Y;
  k.vx = k.vy = 0;
}

// Formation.keeperStep with an unlimited step is exactly a clamp-to-target:
// a dive with no lag, into the goal mouth. The ball then genuinely collides
// with the repositioned keeper when the shot plays out - nothing about the
// save is faked. Which x saveShot picks is saveShot's business.
function diveKeeper(x) {
  humanKeeper.x = Formation.keeperStep(humanKeeper.x, x, Infinity, KEEPER_MIN_X, KEEPER_MAX_X);
}

/* ---------- turn flow ---------- */
function startTurn(team) {
  game.turnCount++;
  game.sinceChaos++;
  // Arcade chaos remains random. Maths earns separate player advantages.
  if (!game.mathsOn && game.turnCount > 2 && game.sinceChaos >= 2 && Math.random() < 0.5) {
    const keys = Object.keys(MODIFIERS);
    activateModifier(keys[(Math.random() * keys.length) | 0]);
    game.sinceChaos = 0;
  }
  if (team === 'human') {
    game.humanTurns++;
    game.state = 'HUMAN_AIM';
    applyStreakPowers();
    if (game.mathsOn && worthABonus()) {
      askQuestion();
    } else {
      game.state = 'HUMAN_AIM';
      setTurnMsg('Your turn — drag a blue player', 'human');
    }
  } else {
    game.state = 'AI_WAIT';
    game.timer = 0.9;
    game.aiChoice = pickAiPlayer();
    game.plannedAiShot = computeAiShot();
    setTurnMsg(rivalName() + ' is thinking…', 'ai');
  }
  refreshStreakHud();
}

function settle() {
  for (const o of movers) o.vx = o.vy = 0;
  const again = game.mover === 'human' && game.extraFlicks > 0;
  clearModifier();
  if (again) {
    // Keep the settled positions. No question or turn setup here: the prize
    // is exactly one follow-up flick, so it cannot earn or chain another.
    game.state = 'HUMAN_AIM';
    applyStreakPowers();
    announceBonus('second', 'One more flick before ' + rivalName());
    setTurnMsg('Second chance — take one more flick', 'human');
    return;
  }
  startTurn(opp(game.mover));
}

function goalScored(scorer) {
  game.extraFlicks = 0; // either side's goal ends the opportunity
  addShake(SHAKE_MAX);
  game.trail.length = 0;
  game.score[scorer]++;
  game.lastScorer = scorer;
  // Counted for every goal in every mode: the record is of what the child did,
  // not of what the cup made of it.
  game.slot.stats[scorer === 'human' ? 'goalsFor' : 'goalsAgainst'] += 1;
  updateScore();
  goalFlash.textContent = scorer === 'human' ? 'GOAL!' : rivalName() + ' scores!';
  goalFlash.classList.remove('hidden');
  if (!document.body.classList.contains('pro')) {
    confetti(scorer === 'human' ? TOP_Y : BOT_Y, scorer === 'human' ? 1 : -1);
  }
  SFX.goal();
  game.state = 'GOAL_PAUSE';
  refreshStreakHud();
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
  const finishedOpponent = game.matchOpponent;
  var trophyWon = false;
  game.slot.stats.matches += 1;
  if (winner === 'human') { game.slot.stats.wins += 1; }
  game.slot.stats.ms += Date.now() - game.kickoffAt;
  game.kickoffAt = 0;
  // A single match is a friendly: it costs nothing and wins nothing. Only the
  // cup moves the draw on, or a child could lose their place in it by asking
  // for a kickabout.
  if (game.mode === 'cup') {
    const before = game.slot.cup.index;
    game.slot.cup = Tournament.recordResult(game.slot.cup, winner === 'human');
    if (Tournament.isComplete(game.slot.cup, before)) { game.slot.trophies += 1; trophyWon = true; }
    // The index has already rolled back to zero, so remember that this cup was
    // finished: the bracket owes the child the sight of themselves lifting it.
    game.wonCup = trophyWon;
  }
  // Anything the match earned is revealed here, at full time — never while a
  // question is open, so the questions stay a move and not a shop. The ledger
  // is derived from the counters; `unlocked` only records what has been shown,
  // which makes each reveal fire exactly once and lets a stale save replay it.
  var freshIds = Locker.fresh(game.slot);
  el('overUnlocks').classList.toggle('hidden', !freshIds.length);
  if (freshIds.length) {
    var row = el('overUnlockRow');
    row.innerHTML = '';
    freshIds.forEach(function (id) {
      var cv = document.createElement('canvas');
      cv.width = cv.height = 56;
      paintCosmeticTile(cv, Locker.byId(id));
      row.appendChild(cv);
      game.slot.unlocked.push(id);
    });
  }
  // After every branch above: a friendly still moves the counters, and losing
  // those on a refresh would make the record quietly wrong.
  persist();
  game.state = 'OVER';
  refreshStreakHud();
  overTitle.textContent = winner === 'human' ? 'You Win! \u{1F3C6}' : rivalName() + ' wins!';
  overSub.textContent = `Final score ${game.score.human} – ${game.score.ai}`;
  el('overOpponent').textContent = finishedOpponent
    ? finishedOpponent.flag + ' ' + finishedOpponent.name + ' · ' + levelLabel(finishedOpponent.level)
    : '';
  const cupNext = game.mode === 'cup' && !trophyWon;
  el('overNext').classList.toggle('hidden', !cupNext);
  if (cupNext) {
    const next = Tournament.matchFor('cup', 1, game.slot.cup, game.slot.band, game.slot.emoji);
    el('overNext').textContent = winner === 'human'
      ? 'Up next: ' + next.flag + ' ' + next.name + ' · Level ' + next.level + ' — a tougher opponent'
      : 'Try Level ' + next.level + ' again. Your cup progress is safe.';
  }
  // The button does different things per mode, so it should not promise the
  // same one: in the cup it goes to the next round, in a friendly it finishes.
  el('again').textContent = game.mode !== 'cup' ? 'Finish' :
    trophyWon ? 'See your cup' : winner === 'human' ? 'Next round' : 'Try again';
  overlay.classList.remove('hidden');
  setTurnMsg(trophyWon ? 'Cup champion!' : 'Full time', winner);
  SFX.win(winner === 'human');
  if (trophyWon) { overTitle.textContent = '\u{1F3C6} CUP WON \u{1F3C6}'; }
}

/* ---------- AI ---------- */
// Shooter selection is angle-aware (Formation.chooseShooter): it scores each
// CPU player by whether hitting the ball from their position would actually
// send it goalward, not just by raw distance.
function pickAiPlayer() {
  const aiPlayers = game.players.filter(p => p.team === 'ai');
  return Formation.chooseShooter(aiPlayers, game.ball, BOT_Y);
}

// Each candidate is an ordinary, imperfect flick toward the open goal corner.
// A stronger opponent gets more chances to notice a blocked or poorly aimed
// candidate before committing. It cannot exceed the human's launch power.
function candidateAiShot() {
  const p = game.aiChoice;
  const b = game.ball;
  const keeper = humanKeeper;   // defends the goal the CPU shoots at
  const margin = KEEPER_R + 4 + Math.random() * 18;
  // Keepers no longer drift on their own, so always shooting at the corner
  // furthest from this one would mean scoring in the same unguarded spot every
  // single time. Go for the open side most of the time, but not always, and
  // not always to the same depth.
  const targetX = Math.random() < 0.75
    ? Formation.farCorner(keeper.x, MOUTH_L, MOUTH_R, margin)
    : MOUTH_L + margin + Math.random() * (MOUTH_R - MOUTH_L - 2 * margin);
  let dx = targetX - b.x, dy = BACK_BOT - b.y;
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl; dy /= dl;
  // contact point slightly behind the ball so the hit pushes it goalward
  const tx = b.x - dx * (b.r + p.r) * 0.85;
  const ty = b.y - dy * (b.r + p.r) * 0.85;
  let ang = Math.atan2(ty - p.y, tx - p.x);
  // One skill value drives the CPU's aim and its power discipline. It rises
  // through the cup, so a later opponent misses less and wastes less.
  const sk = game.aiSkill;
  ang += (Math.random() * 2 - 1) * (0.24 - 0.19 * sk);
  const dist = Math.hypot(tx - p.x, ty - p.y);
  const power = Math.min(1, 0.6 + dist / 720 + Math.random() * (0.28 - 0.24 * sk));
  const sp = power * MAX_LAUNCH * game.powerMult;
  return { player: p, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp };
}

function computeAiShot() {
  let best = null, bestValue = -Infinity;
  for (let i = 0; i < game.opponent.shotAttempts; i++) {
    const shot = candidateAiShot();
    const preview = simulateAiShot(shot);
    shot.preview = preview;
    if (preview.scores) { return shot; }
    // Prefer useful settled field position over a brief advance that rebounds
    // back into danger. An own goal is worse than any non-scoring alternative.
    const value = preview.ownGoal ? -Infinity : -Math.hypot(preview.ballX - W / 2, BOT_Y - preview.ballY);
    if (best === null || value > bestValue) { best = shot; bestValue = value; }
  }
  return best;
}

// Actually fires a computed shot: assigns the velocity and starts the
// move. Split out from aiLaunch so the "shot missed" path and the "save
// failed or was skipped" path commit the exact same shot object that was
// simulated, rather than recomputing (and risking a different) one.
function commitAiShot(shot) {
  const p = shot.player;
  p.vx = shot.vx;
  p.vy = shot.vy;
  game.mover = 'ai';
  game.moveTime = 0;
  game.state = 'MOVING';
  game.aiChoice = null;
  game.plannedAiShot = null;
  setTurnMsg(rivalName() + ' shoots!', 'ai');
  SFX.launch();
}

// A save is an occasional earned rescue, not an answer prompt over every CPU
// goal. It shares the bonus cooldown and is only offered for a real scoring
// threat. Commit the exact planned shot whether an offer is shown or not.
function aiLaunch() {
  const shot = game.plannedAiShot || computeAiShot();
  const sim = shot.preview;
  if (!game.mathsOn || !questionReady() || !sim.scores || Math.random() >= SAVE_QUESTION_CHANCE) {
    commitAiShot(shot); return;
  }
  game.pendingAiShot = shot;
  game.pendingSaveX = sim.x;
  game.threatPath = sim.path;
  game.state = 'AI_SAVE_QUESTION';
  askSaveQuestion();
}

/* ---------- physics ---------- */
function collideCircles(a, b) {
  const invSum = a.invM + b.invM;
  if (invSum === 0) return;
  let dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  const minD = a.r + b.r;
  if (d >= minD) return;
  if (d < 1e-4) { d = 1e-4; dx = d; dy = 0; }    // perfectly stacked: push apart along +x
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

// simActive guards this during the save mechanic's forward lookahead (see
// simulateAiShot below). Nothing in that run has happened on screen, so it
// must neither shake the pitch nor make a sound, and must not spend the real
// hit-sound cooldown on collisions the child never saw.
let simActive = false;

function hitSfx(impact) {
  if (simActive) return;
  if (impact > SHAKE_HIT_THRESHOLD) { addShake(Math.min(2, impact / 700)); }
  const now = performance.now();
  if (impact > 90 && now - game.lastHitSfx > 50) {
    game.lastHitSfx = now;
    SFX.hit(Math.min(1, impact / 1200));
  }
}

// isBall is passed in rather than compared against game.ball so the same
// function works unchanged on simulateAiShot's cloned ball.
function walls(o, isBall) {
  if (o.x - o.r < SIDE_L) { o.x = SIDE_L + o.r; o.vx = Math.abs(o.vx) * WALL_REST; hitSfx(Math.abs(o.vx)); }
  if (o.x + o.r > SIDE_R) { o.x = SIDE_R - o.r; o.vx = -Math.abs(o.vx) * WALL_REST; hitSfx(Math.abs(o.vx)); }
  if (isBall && o.x > MOUTH_L + 4 && o.x < MOUTH_R - 4) {
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

// Split out of physicsStep so simulateAiShot can run the identical
// movement/friction rule on its own cloned bodies - the lookahead can only
// ever match real play if it is, literally, the same code.
function advanceBodies(list, friction, dt) {
  const fr = Math.pow(friction, dt * 60);
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
}

// Same reasoning as advanceBodies: the collision/wall-bounce pass, shared
// between real play and the save mechanic's lookahead. ballRef marks which
// element of list is "the ball" for the in-mouth wall rule, since it can't
// be identified by comparing to game.ball when list is a set of clones.
function resolveCollisions(list, ballRef) {
  for (let it = 0; it < 2; it++) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) collideCircles(list[i], list[j]);
    for (const o of list) for (const post of game.posts) collideCircles(o, post);
    for (const o of list) walls(o, o === ballRef);
  }
}

function physicsStep(dt) {
  advanceBodies(movers, game.friction, dt);
  const b = game.ball;
  game.ballRot += (Math.hypot(b.vx, b.vy) / b.r) * dt * (b.vx < 0 ? -1 : 1);
  resolveCollisions(movers, b);
  if (b.y + b.r < TOP_Y) goalScored('human');       // ball fully inside top goal
  else if (b.y - b.r > BOT_Y) goalScored('ai');     // ball fully inside bottom goal
}

const allStopped = (list) => list.every(o => Math.hypot(o.vx, o.vy) < STOP_SPEED);

function cloneBody(o) {
  return { x: o.x, y: o.y, vx: o.vx, vy: o.vy, r: o.r, invM: o.invM };
}

// Shared lookahead for CPU shot choice and earned saves. Clones every mover
// (posts are immovable - invM 0 - so the real ones are safe to reuse
// as-is) and replays advanceBodies/resolveCollisions on the clones only,
// so nothing here touches the real game state or plays a sound
// (simActive silences hitSfx for the duration). Bounded to MAX_MOVE_TIME
// worth of steps, same ceiling a real move gets. Shot search is also bounded
// by the opponent's small candidate budget and stops at the first scorer.
function simulateAiShot(shot) {
  const clones = movers.map(cloneBody);
  const shooterIdx = movers.indexOf(shot.player);
  const simBall = clones[clones.length - 1]; // movers always ends with game.ball
  clones[shooterIdx].vx = shot.vx;
  clones[shooterIdx].vy = shot.vy;
  simActive = true;
  const maxSteps = Math.ceil(MAX_MOVE_TIME / STEP);
  let scores = false, ownGoal = false, crossX = null;
  const path = [];
  for (let i = 0; i < maxSteps; i++) {
    advanceBodies(clones, game.friction, STEP);
    resolveCollisions(clones, simBall);
    if (i % 6 === 0) { path.push(simBall.x, simBall.y); }
    if (simBall.y - simBall.r > BOT_Y) { scores = true; crossX = simBall.x; break; } // would score for ai
    if (simBall.y + simBall.r < TOP_Y) { ownGoal = true; break; }
    if (allStopped(clones)) { break; }                                                // settled without scoring
  }
  simActive = false;
  return { scores: scores, ownGoal: ownGoal, x: crossX, path: path,
           ballX: simBall.x, ballY: simBall.y };
}


/* ---------- input (pointer events cover mouse + touch) ---------- */
function ptFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}

function updateSetupPointer(point) {
  const setup = game.setup;
  setup.pointer = point;
  // Keep the original grab offset. A tap near a disc's edge selects it; it
  // must not consume the setup by moving its centre to the finger.
  const requested = setup.grabbed && setup.player ? {
    x: setup.player.x + point.x - setup.startPoint.x,
    y: setup.player.y + point.y - setup.startPoint.y
  } : point;
  setup.target = setup.player ? Bonuses.moveTarget(setup.player, requested,
    movers, game.posts, BONUS_BOUNDS) : null;
}

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  SFX.unlock();
  if (game.state === 'HUMAN_SETUP') {
    const point = ptFromEvent(e);
    const blue = game.players.filter(p => p.team === 'human' &&
      Math.hypot(p.x - point.x, p.y - point.y) < p.r + 22)
      .sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
    if (blue) game.setup.player = blue;
    game.setup.grabbed = !!blue;
    game.setup.startPoint = point;
    game.setup.dragging = true;
    updateSetupPointer(point);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    return;
  }
  if (game.state !== 'HUMAN_AIM') return;
  const p = ptFromEvent(e);
  let best = null, bd = Infinity;
  // Keepers are draggable too: rushing yours out is a real clearance, at the
  // real cost of leaving the goal empty for the CPU's next shot.
  for (const pl of movers) {
    if (pl.team !== 'human') continue;
    const d = Math.hypot(pl.x - p.x, pl.y - p.y);
    if (d < pl.r + 22 && d < bd) { bd = d; best = pl; }
  }
  if (best) {
    if (isBonusActive('big')) {
      growStriker(best);
      if (game.bonus === 'big') {
        announceBonus('big', game.bigStriker ? 'Bigger blue striker — line up your flick' :
          best === humanKeeper ? 'Your keeper keeps its normal size' : 'No room here — try another blue player');
      }
    }
    game.drag = { player: best, px: p.x, py: p.y };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    SFX.select();
  }
});

canvas.addEventListener('pointermove', e => {
  if (game.state === 'HUMAN_SETUP' && game.setup.dragging) {
    e.preventDefault();
    updateSetupPointer(ptFromEvent(e));
    return;
  }
  if (!game.drag) return;
  e.preventDefault();
  const p = ptFromEvent(e);
  game.drag.px = p.x;
  game.drag.py = p.y;
});

function endDrag(e) {
  if (game.state === 'HUMAN_SETUP') {
    e.preventDefault();
    const setup = game.setup;
    if (!setup.dragging) return;
    updateSetupPointer(ptFromEvent(e));
    setup.dragging = false;
    const target = setup.target;
    if (target && setup.player && Math.hypot(target.x - setup.player.x, target.y - setup.player.y) >= MIN_DRAG) {
      finishSetup(target);
    }
    return;
  }
  if (!game.drag) return;
  e.preventDefault();
  const { player, px, py } = game.drag;
  game.drag = null;
  const dx = player.x - px, dy = player.y - py;
  const len = Math.hypot(dx, dy);
  if (len < MIN_DRAG) return;   // too gentle: cancel, keep aiming
  const sp = Math.min(len / MAX_DRAG, 1) * MAX_LAUNCH * game.powerMult;
  player.vx = (dx / len) * sp;
  player.vy = (dy / len) * sp;
  game.keeperDive = null;
  game.mover = 'human';
  game.moveTime = 0;
  game.state = 'MOVING';
  consumeStreakPowers(player);
  setTurnMsg('Nice flick!', 'human');
  SFX.launch();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => {
  game.drag = null;
  if (game.setup) { game.setup.dragging = false; game.setup.target = null; }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

el('again').addEventListener('click', () => {
  SFX.unlock();
  overlay.classList.add('hidden');
  // Next opponent, or the same one again after a loss — either way the child
  // sees who they are facing before play resumes. A friendly just kicks off.
  if (game.mode === 'cup') {
    // A finished cup is drawn one last time with the child in the champion's
    // place. From there the button goes home, not into the next season.
    showBracket(game.wonCup ? Tournament.COUNT : undefined);
    game.wonCup = false;
  } else {
    // A friendly finishes: show what it added to the record, then go home.
    // Kicking straight into another match made the result meaningless — there
    // was nothing between one game and the next.
    showStats(true);
  }
});

el('roundGo').addEventListener('click', () => {
  SFX.unlock();
  hideBracket();
  if (bracketFinal) { bracketFinal = false; goHome(); } else { findOpponent(); }
});

// The draw is a screen a child can arrive at and decide against. Leaving it
// costs nothing: cup progress is only written at full time, so backing out
// here returns them to exactly the round they were on.
el('bracketBack').addEventListener('click', () => {
  SFX.select();
  hideBracket();
  goHome();
});

// Back to the menu, with the game parked so nothing on the pitch is live.
// Everything the child might want next — another cup, a friendly, their
// stats — is a choice on that screen rather than something they are dropped
// into.
function goHome() {
  game.state = 'START';
  el('hud').classList.add('hidden');
  game.matchReady = false;
  el('matchmaking').classList.add('hidden');
  clearModifier();
  game.plannedAiShot = game.pendingAiShot = null;
  game.pendingSaveX = game.threatPath = null;
  Quiz.hide();
  overlay.classList.add('hidden');
  refreshStart();
  showStep('team');
  el('startScreen').classList.remove('hidden');
}

// A curated grid rather than the system emoji picker: it is tap-only, needs no
// keyboard, and is not overwhelming for a five-year-old.
var FUN = ['\u{1F981}','\u{1F42F}','\u{1F438}','\u{1F984}','\u{1F996}','\u{1F419}',
           '\u{1F41D}','\u{1F98A}','\u{1F43C}','\u{1F992}','\u{1F988}','\u{1F985}',
           '\u26BD','\u{1F525}','\u26A1','\u2B50','\u{1F308}','\u{1F680}',
           '\u{1F451}','\u{1F48E}','\u{1F340}','\u{1F3B8}','\u{1F36A}','\u{1F47D}'];

// Countries, so a child can play as their own — the opponents are countries
// too, which is what makes the cup read as a World Cup. Only eleven live on the
// card. Twenty-four inventions, eleven flags and the door into the flag screen
// come to thirty-six tiles: six rows, exactly what this grid has always been.
// The card cannot afford another row — it already scrolls on a short phone — so
// every other country in the world sits one tap behind that door (flags.js).
var BADGES = FUN.concat(Flags.QUICK);

// The door tile itself. A globe, not a flag: it stands for all of them, rather
// than for one country a child might think they had just chosen.
var FLAG_DOOR = '\u{1F310}';

// Badge and name, as the stats and locker panels both head themselves.
function teamLabel() {
  return game.slot.emoji + (game.slot.name ? ' ' + game.slot.name : '');
}

function paintSlots() {
  var row = el('slotRow');
  row.innerHTML = '';
  game.save.slots.forEach(function (slot, i) {
    var card = document.createElement('div');
    card.className = 'slotCard' + (i === game.save.active ? ' on' : '') + (slot.emoji ? '' : ' empty');
    var badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = slot.emoji || '\uFF0B';
    card.appendChild(badge);
    if (slot.name) {
      var who = document.createElement('div');
      who.className = 'who'; who.textContent = slot.name;
      card.appendChild(who);
    }
    // Select this slot, and say where to go back to if the editor is cancelled.
    function choose() {
      var was = game.save.active;
      game.save.active = i;
      game.slot = Store.activeSlot(game.save);
      applySkin();
      persist();
      return was;
    }

    if (slot.emoji) {
      // A real button, not a decoration. Editing used to need a second click on
      // an already-selected card, which is a gesture nothing on screen taught
      // and which does nothing at all the first time you try it.
      var pen = document.createElement('button');
      pen.type = 'button';
      pen.className = 'pencil';
      pen.textContent = '\u270E';
      pen.setAttribute('aria-label', 'Edit team');
      pen.addEventListener('click', function (e) {
        e.stopPropagation();       // editing is not also "just select this"
        var was = choose();
        openTeamEditor(was);
        SFX.select();
      });
      card.appendChild(pen);
    }
    card.addEventListener('click', function () {
      // Tapping a card only ever picks that team. An empty one has no team to
      // pick, so it goes straight to making one.
      var was = choose();
      if (!game.slot.emoji) { openTeamEditor(was); }
      refreshStart();
      SFX.select();
    });
    row.appendChild(card);
  });
}

function configureOpponent() {
  game.opponent = game.mode === 'cup'
    ? Tournament.opponentFor(game.slot.cup.index, game.slot.cup.season, game.slot.band)
    : Tournament.opponentFor(game.friendlyLevel - 1, 0, game.slot.band);
  game.aiSkill = game.opponent.skill;
}

function refreshStart() {
  paintSlots();
  paintCup();
  paintNextUnlock();
  // Must not be gated on game.slot.maths: changing a team's age is exactly
  // what clears maths (see the team editor's OK handler), so guarding on it
  // would skip this recompute at the one moment the band actually changed.
  configureOpponent();
  paintOpponentChoice();
  refreshOpponentHud();
  refreshStreakHud();
}

// Making a team is where a child says who they are: badge, name, and age. Age
// used to sit on the start screen, which re-asked it on every visit and applied
// it to whichever slot happened to be active — wrong on a shared tablet, where
// each slot is a different child.
function openTeamEditor(returnTo) {
  var ed = el('teamEditor'), grid = el('badgeGrid'), nameInput = el('teamName');
  var chosen = game.slot.emoji || BADGES[0];
  // Once the child edits the name it is theirs; picking badges stops rewriting it.
  var typed = !!game.slot.name;
  paintAges(game.slot.band);
  grid.innerHTML = '';

  // A badge the child has not overtyped renames the team with it, so picking a
  // flag gives you that country rather than a stray invention.
  function choose(b) {
    chosen = b;
    if (!typed) { nameInput.value = Names.forBadge(b, Math.random); }
    paintChoice();
    SFX.select();
  }

  // Which tile wears the highlight. A flag chosen on the other screen has no
  // tile of its own, so the door wears it instead and shows that flag — the
  // child can see what they picked without this card growing a row for it.
  function paintChoice() {
    var away = Flags.isFlag(chosen) && BADGES.indexOf(chosen) === -1;
    BADGES.forEach(function (b, i) {
      grid.children[i].className = (b === chosen) ? 'on' : '';
    });
    door.className = away ? 'door on' : 'door';
    doorFace.textContent = away ? chosen : FLAG_DOOR;
    doorPip.textContent = away ? FLAG_DOOR : '';
  }

  BADGES.forEach(function (b) {
    var btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = b;
    btn.addEventListener('click', function () { choose(b); });
    grid.appendChild(btn);
  });

  // The last tile is a door, not a badge: it opens the flag screen, where the
  // rest of the world's countries are.
  var door = document.createElement('button');
  door.type = 'button';
  door.setAttribute('aria-label', 'All flags');
  var doorFace = document.createElement('span');
  var doorPip = document.createElement('i');
  doorPip.className = 'pip';
  door.appendChild(doorFace);
  door.appendChild(doorPip);
  door.addEventListener('click', function () {
    SFX.select();
    showFlagPicker(chosen, choose);
  });
  grid.appendChild(door);
  paintChoice();

  // Never open on an empty field. A child who will not type still leaves with
  // a team that is called something.
  nameInput.value = game.slot.name || Names.forBadge(chosen, Math.random);
  nameInput.oninput = function () { typed = true; };
  el('teamDice').onclick = function () {
    typed = false;
    nameInput.value = Names.make(Math.random);
    SFX.select();
  };
  var del = el('teamDelete');
  del.className = '';
  ed.classList.remove('hidden');

  // A way out that changes nothing. Without it, tapping the empty "+" slot to
  // see what it did trapped the child on this card with only "save" and
  // "delete" — neither of which is "I did not mean to be here".
  el('teamCancel').onclick = function () {
    if (!game.slot.emoji && typeof returnTo === 'number') {
      game.save.active = returnTo;
      game.slot = Store.activeSlot(game.save);
      applySkin();
      persist();
    }
    ed.classList.add('hidden');
    refreshStart();
    SFX.select();
  };

  el('teamOk').onclick = function () {
    game.slot.emoji = chosen;
    // The name may still be cleared by hand: it needs a keyboard, and a
    // five-year-old may not type. The badge alone is a complete team.
    game.slot.name = nameInput.value.slice(0, 12);
    // Changing the age is the child telling us the old level was wrong, so the
    // adaptive state it produced is thrown away with it.
    if (editorBand !== game.slot.band) { game.slot.maths = null; game.maths = null; }
    game.slot.band = editorBand;
    applySkin();
    persist();
    ed.classList.add('hidden');
    refreshStart();
  };
  // Deleting is the one destructive control here, so it takes two taps.
  del.onclick = function () {
    if (del.className !== 'arm') { del.className = 'arm'; return; }
    Store.clearSlot(game.save, game.save.active);
    game.slot = Store.activeSlot(game.save);
    applySkin();
    game.maths = null;
    persist();
    ed.classList.add('hidden');
    refreshStart();
  };
}

/* ---- the flag picker ---- */
// Every country in the world, on a screen of its own.
//
// The team card could not hold them: two hundred tiles is nine more rows on a
// card that already runs past the bottom of a short phone. So this borrows the
// shape the cup draw and the locker already established — a full screen, one
// job, one back arrow — because a child who has learned one of those screens
// has learned this one too.
//
// It opens on the star: the thirty countries a child actually asks for, in
// reach without a tab, a scroll or a word. The continents behind it are for the
// long tail. `chosen` is the badge the editor is currently showing, so a child
// already wearing something the star does not hold opens on the continent that
// does. `onPick` hands the flag back; picking also leaves, because choosing is
// the only reason to be here.
function showFlagPicker(chosen, onPick) {
  var view = el('flagPicker'), tabs = el('flagTabs'), grid = el('flagGrid');
  var region = Flags.tabOf(chosen);

  function paintTabs() {
    [].forEach.call(tabs.children, function (t, i) {
      // The star keeps its own look whether or not it is the open tab, so the
      // first tab never reads as just another continent.
      t.className = (i === region ? 'on ' : '') + (Flags.TABS[i].star ? 'top' : '');
    });
  }

  function paintGrid() {
    var flags = Flags.TABS[region].flags;
    grid.innerHTML = '';
    // Back to the top on every tab: a child who has scrolled Africa should not
    // land halfway down Asia with no idea what is above them.
    grid.scrollTop = 0;
    flags.forEach(function (f) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = f;
      btn.setAttribute('aria-label', Names.country(f));
      if (f === chosen) { btn.className = 'on'; }
      btn.addEventListener('click', function () {
        hideFlagPicker();
        onPick(f);
      });
      grid.appendChild(btn);
    });
  }

  tabs.innerHTML = '';
  Flags.TABS.forEach(function (r, i) {
    var tab = document.createElement('button');
    tab.type = 'button';
    tab.textContent = r.icon;
    tab.addEventListener('click', function () {
      region = i;
      paintTabs();
      paintGrid();
      SFX.select();
    });
    tabs.appendChild(tab);
  });

  paintTabs();
  paintGrid();
  view.classList.remove('hidden');
}

function hideFlagPicker() { el('flagPicker').classList.add('hidden'); }

// Leaving with nothing chosen has to be as cheap as it looks: the same arrow,
// in the same place, as the cup draw's way out. Nothing is written until the
// editor's own tick, so backing out here cannot have changed anything.
el('flagBack').addEventListener('click', function () {
  SFX.select();
  hideFlagPicker();
});

// The tournament as its own screen: the whole sixteen-team draw, read left to
// right, collapsing into one champion. A list of the child's own four matches
// told them where they were but not what they were in; this shows them the
// other half of the draw, who is still alive in it, and who is waiting.
//
// `played` overrides how far the draw is resolved. It exists for the moment the
// cup is won, when the child's own index has already rolled back to zero but
// they should still get to see themselves lifting it.
var bracketFinal = false;   // is the draw currently showing a finished cup?

function bracketBox(cell, state) {
  var box = document.createElement('div');
  box.className = 'bx ' + state;
  box.textContent = cell ? (cell.you ? game.slot.emoji : cell.flag) : '';
  return box;
}

function showBracket(played) {
  el('hud').classList.add('hidden');
  var view = el('bracket'), tree = el('bracketTree'), heads = el('bracketRounds');
  if (typeof played !== 'number') { played = game.slot.cup.index; }
  // Winning the cup has to be an ending. On the champion view this screen's
  // button goes back to the menu instead of kicking off the next season —
  // otherwise the child lifts the trophy and is immediately playing again,
  // which reads as the win not having counted.
  bracketFinal = played >= Tournament.COUNT;
  el('roundGo').textContent = bracketFinal ? '\u{1F3E0}' : '▶';
  el('roundGo').setAttribute('aria-label', bracketFinal ? 'Go home' : 'Meet your opponent');
  // On the champion view the main button already goes home; a second one
  // beside it would just be two ways to do the same thing.
  el('bracketBack').classList.toggle('hidden', bracketFinal);
  var mine = game.slot.emoji;
  var cols = Tournament.bracket(played, mine), c, i, cell, colEl, head;
  // The child's next opponent is the other half of their pair in this round.
  var foeRow = played < Tournament.COUNT ? (Tournament.youAt(cols, played) ^ 1) : -1;
  var foe = foeRow >= 0 ? cols[played][foeRow] : null;
  var next = foe ? Tournament.matchFor('cup', 1, game.slot.cup, game.slot.band, mine) : null;

  // The one thing they need off this screen is who they play next, so it is
  // stated once at full size; the draw behind it is context for that tie.
  el('tieMe').textContent = mine;
  el('tieMeName').textContent = game.slot.name || '';
  el('tieFoe').textContent = foe ? foe.flag : '\u{1F3C6}';
  el('tieFoeName').textContent = next ? next.name : '';
  el('tieFoeCountry').textContent = foe ? (Names.country(foe.flag) || '') : '';
  el('tieRound').textContent = foe ? Tournament.roundIcon(played) : '\u{1F389}';
  el('bracketCaption').textContent = foe ? Tournament.roundName(played) : 'You won the cup!';
  el('tieLevel').textContent = next ? levelLabel(next.level) : '';
  el('tieLevel').classList.toggle('hidden', !next);
  el('tieChallenge').textContent = next ? Tournament.LEVELS[next.level - 1].hint : '';
  el('tieSeason').textContent = seasonHint(next);

  tree.innerHTML = '';
  for (c = 0; c < cols.length; c++) {
    colEl = document.createElement('div');
    colEl.className = 'col';
    // Two boxes to a tie. Wrapping each pair is what makes the draw read as
    // eight matches rather than a list of sixteen countries; the wrapper holds
    // the same height its two cells did, so the elbows still line up.
    var tie = null;
    for (i = 0; i < cols[c].length; i++) {
      if (i % 2 === 0) {
        tie = document.createElement('div');
        tie.className = 'match';
        colEl.appendChild(tie);
      }
      cell = document.createElement('div');
      cell.className = 'cell';
      cell.appendChild(bracketBox(cols[c][i], boxState(cols[c][i], c, i, played, foeRow)));
      tie.appendChild(cell);
    }
    tree.appendChild(colEl);
  }

  // One cup per round, over the column of that round's winners. Column 0 is the
  // entrants, so it has nothing at stake and gets a blank.
  heads.innerHTML = '';
  for (c = 0; c <= Tournament.COUNT; c++) {
    head = document.createElement('div');
    head.className = (c === played + 1) ? 'on' : '';
    head.textContent = c === 0 ? '' : Tournament.roundIcon(c - 1);
    if (c > 0) {
      var label = document.createElement('small');
      label.textContent = 'Lv ' + c;
      head.appendChild(label);
    }
    heads.appendChild(head);
  }

  el('bracketTitle').textContent = game.slot.trophies
    ? '\u{1F3C6}×' + game.slot.trophies
    : '\u{1F3C6}';
  view.classList.remove('hidden');
}

function boxState(cell, col, row, played, foeRow) {
  if (!cell) { return 'tbd'; }
  if (cell.you) { return 'you'; }
  if (cell.out) { return 'out'; }
  if (col === played && row === foeRow) { return 'foe'; }
  return 'live';
}

function hideBracket() { el('bracket').classList.add('hidden'); }

// Cup progress on the start screen is four pips, not four flags. A row of
// countries there meant nothing: the child had not seen the draw yet, so it
// read as decoration. Pips say the only thing that belongs on this screen —
// how far through the cup this team is.
function paintCup() {
  var pips = el('cupPips'), shelf = el('trophyShelf');
  pips.innerHTML = '';
  for (var i = 0; i < Tournament.COUNT; i++) {
    var p = document.createElement('i');
    p.className = 'pip' + (i < game.slot.cup.index ? ' done' : '');
    pips.appendChild(p);
  }
  var n = Math.min(12, game.slot.trophies);
  shelf.textContent = n ? new Array(n + 1).join('\u{1F3C6}') : '';
  el('cupOpponent').textContent = 'Next: Level ' + (game.slot.cup.index + 1) +
    ' · ' + Tournament.roundName(game.slot.cup.index) +
    (game.slot.cup.season > 0 ? ' · Season ' + (game.slot.cup.season + 1) : '');
}

function paintOpponentChoice() {
  Tournament.LEVELS.forEach(function (choice) {
    var button = el('level' + choice.level);
    button.setAttribute('aria-pressed', String(choice.level === game.friendlyLevel));
    // Keep the visible names in sync with the shared opponent catalogue.
    button.querySelector('span').textContent = choice.name;
  });
  el('opponentChoiceHint').textContent = Tournament.LEVELS[game.friendlyLevel - 1].hint +
    (game.slot.band > 0 ? ' Matched to your team’s age.' : '');
}

for (let level = 1; level <= 4; level++) {
  el('level' + level).addEventListener('click', function () {
    game.friendlyLevel = level;
    configureOpponent();
    paintOpponentChoice();
    SFX.select();
  });
}


// What this team has done, as icons and numbers. No text, so it reads the same
// in any language, and no history — every figure is a counter the play loop
// already keeps, which is why the panel cannot disagree with the game.
function fmtTime(ms) {
  var mins = Math.floor(ms / 60000);
  if (mins < 60) { return mins + '′'; }               // 47′
  return Math.floor(mins / 60) + ':' + ('0' + (mins % 60)).slice(-2);
}

// Where the stats panel's close button leads. From the menu it just closes;
// after a friendly it carries on home, so the match ends somewhere rather than
// dropping the child back on a dead pitch.
var statsThenHome = false;

function showStats(thenHome) {
  var grid = el('statsGrid'), s = game.slot.stats;
  statsThenHome = !!thenHome;
  var pct = s.answered ? Math.round(s.correct * 100 / s.answered) : 0;
  var rows = [
    ['⏱', 'Time played', fmtTime(s.ms)],
    ['\u{1F3DF}', 'Matches', s.matches],
    ['\u{1F3C5}', 'Won', s.wins],
    ['\u{1F3C6}', 'Cups', game.slot.trophies],
    ['⚽', 'Goals scored', s.goalsFor],
    ['\u{1F9E4}', 'Goals let in', s.goalsAgainst],
    ['\u{1F9EE}', 'Questions', s.answered],
    // "Correct", not "right first time": there is only ever one attempt.
    ['✅', 'Correct', s.correct + (s.answered ? ' · ' + pct + '%' : '')],
    ['\u{1F4C8}', 'Form',
      game.slot.band === 0 ? '—'
        : Maths.rating(game.slot.maths ? game.slot.maths.difficulty
                                        : (game.slot.band || 1))],
    ['⚡', 'Fastest correct', s.bestMs ? (s.bestMs / 1000).toFixed(1) + 's' : '—'],
    ['\u{1F525}', 'Best streak', s.bestStreak]
  ];
  grid.innerHTML = '';
  rows.forEach(function (r) {
    ['statIcon', 'statLabel', 'statVal'].forEach(function (cls, n) {
      var cell = document.createElement('div');
      cell.className = cls;
      cell.textContent = String(r[n]);
      grid.appendChild(cell);
    });
  });
  el('statsWho').textContent = teamLabel();
  el('statsPanel').classList.remove('hidden');
}

el('startStats').addEventListener('click', function () {
  if (!game.slot.emoji) { return; }
  SFX.select();
  showStats();
});
el('statsClose').addEventListener('click', function () {
  SFX.select();
  el('statsPanel').classList.add('hidden');
  if (statsThenHome) { statsThenHome = false; goHome(); }
});

/* ---------- the locker ---------- */
// Cosmetics earned by playing (locker.js owns the ledger; this is the shop
// window). Everything is drawn by the same painters the match uses, so a tile
// is an honest preview, not an icon of one.
// `progress` (0..1, default 1) shades the item down from the top, so a locked
// cosmetic is the thing itself filling up rather than a blacked-out blob. A
// child should be able to see what they are working towards — that is the
// whole point of showing it locked at all — so the shade is translucent and
// never quite empties.
function paintCosmeticTile(canvas, item, progress) {
  var c = canvas.getContext('2d'), s = canvas.width, m = s / 2;
  c.clearRect(0, 0, s, s);
  if (item.kind === 'ball') {
    c.save(); c.translate(m, m);
    paintBallFace(c, s * 0.36, item.id);
    c.restore();
  } else if (item.kind === 'hat') {
    // the child's own blue player, trying the hat on
    var r = s * 0.28, y = m + s * 0.14;
    c.beginPath(); c.arc(m, y, r, 0, 6.29);
    c.fillStyle = '#3b82f6'; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#1e50b0'; c.stroke();
    c.beginPath(); c.arc(m, y, r * 0.45, 0, 6.29);
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
    paintHat(c, m, y, r, item.id);
  } else {
    // a patch of turf: base coat, one mowing stripe, the halfway line
    var th = PITCH_THEMES[item.id];
    c.fillStyle = th.base; c.fillRect(0, 0, s, s);
    c.fillStyle = th.stripe;
    c.fillRect(0, 0, s, s / 3); c.fillRect(0, s * 2 / 3, s, s / 3);
    if (th.stars) {
      c.fillStyle = 'rgba(255,255,255,0.6)';
      for (var i = 0; i < 12; i++) c.fillRect((i * 17 + 5) % s, (i * 23 + 7) % s, 2, 2);
    }
    c.strokeStyle = th.line; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, m); c.lineTo(s, m); c.stroke();
    c.beginPath(); c.arc(m, m, s * 0.17, 0, 6.29); c.stroke();
  }

  // source-atop confines the shade to what was actually drawn, so a ball fills
  // like a gauge while the tile behind it stays clear.
  var f = (progress === undefined) ? 1 : Math.max(0.12, Math.min(1, progress));
  if (f < 1) {
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = 'rgba(9,16,38,0.76)';
    c.fillRect(0, 0, s, s * (1 - f));
    c.restore();
  }
}

// How far this slot is towards an item it has not earned yet, 0..1. Cup items
// are bought with a different currency, so they count trophies instead.
function cosmeticProgress(item) {
  if (item.cup) { return game.slot.trophies / item.cup; }
  return game.slot.stats.correct / item.at;
}

var LOCKER_GRIDS = { ball: 'lockerBall', hat: 'lockerHat', pitch: 'lockerPitch' };

function paintLocker() {
  var earnedNow = Locker.earned(game.slot);
  Object.keys(LOCKER_GRIDS).forEach(function (kind) {
    var grid = el(LOCKER_GRIDS[kind]);
    grid.innerHTML = '';
    Locker.ITEMS.filter(function (it) { return it.kind === kind; }).forEach(function (it) {
      var have = earnedNow.indexOf(it.id) !== -1;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = (equippedId(kind) === it.id ? 'on' : '') + (have ? '' : ' locked');
      var cv = document.createElement('canvas');
      cv.width = cv.height = 56;
      paintCosmeticTile(cv, it, have ? 1 : cosmeticProgress(it));
      btn.appendChild(cv);
      // The price, under the art rather than over it: a tag sitting on the
      // corner clipped its own last digit, and a tick on a locked item read as
      // "you have this". "180/400" explains itself and the fill above it. An
      // earned tile keeps the empty line so every tile is the same height.
      var need = document.createElement('span');
      need.className = 'need';
      if (!have) {
        need.textContent = it.cup
          ? '\u{1F3C6} ' + game.slot.trophies + '/' + it.cup
          : game.slot.stats.correct + '/' + it.at;
      }
      btn.appendChild(need);
      btn.addEventListener('click', function () {
        if (!have) { return; }   // a locked tile is a goal, not a button
        game.slot.equipped[kind] = it.id;
        persist();
        paintLocker();
        SFX.select();
      });
      grid.appendChild(btn);
    });
  });
}

function showLocker() {
  if (!game.slot.emoji) { return; }
  el('lockerWho').textContent = teamLabel();
  paintLocker();
  el('lockerPanel').classList.remove('hidden');
}

el('startLocker').addEventListener('click', function () { SFX.select(); showLocker(); });
el('nextUnlock').addEventListener('click', function () { SFX.select(); showLocker(); });
el('lockerClose').addEventListener('click', function () {
  SFX.select();
  el('lockerPanel').classList.add('hidden');
});

// The next milestone on the start card: drawn in full, then hidden under a
// dark shade that retreats upward as the child's correct answers approach it.
// A silhouette that fills, never a number to read — tapping it opens the
// locker, where the price tags live.
function paintNextUnlock() {
  var wrap = el('nextUnlock');
  var n = (game.slot.emoji && game.slot.band > 0) ? Locker.next(game.slot) : null;
  if (!n) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  // Filled across this leg only (from the last milestone, not from zero), so
  // the next reward always looks reachable rather than a thousand answers away.
  paintCosmeticTile(el('nextUnlockArt'), Locker.byId(n.id),
    (game.slot.stats.correct - n.prev) / (n.at - n.prev));
}

// The band the age row is currently showing. It lives here rather than inside
// paintAges so the row and the save button read one value, not two kept equal
// by hand. Store.repairSlot guarantees game.slot.band is a number.
var editorBand = 0;

// Wire the age row inside the team editor.
function paintAges(current) {
  var btns = el('teamAges').querySelectorAll('.ageBtn'), i;
  editorBand = current;

  function paint() {
    for (var k = 0; k < btns.length; k++) {
      var b = Number(btns[k].getAttribute('data-band'));
      btns[k].className = (b === editorBand) ? 'ageBtn on' : 'ageBtn';
      // Echo the chosen button next to the cake, so the row is unmistakably
      // an age and the current answer is readable without hunting for it.
      if (b === editorBand) { el('ageValue').textContent = btns[k].textContent; }
    }
  }
  for (i = 0; i < btns.length; i++) {
    btns[i].onclick = function () {
      editorBand = Number(this.getAttribute('data-band'));
      paint();
      SFX.select();
    };
  }
  paint();
}

// Starting is two questions, asked in that order: what kind of game, then who
// you are playing as. Putting both on one screen meant a child had to take in
// teams, cup progress and trophies before knowing whether any of it applied to
// what they wanted to do.
//
// A single match changes no cup progress and never opens the draw; the cup does
// both. Everything else — age, adaptive state, badge — comes from the active
// team either way, so neither mode needs a settings screen behind it.
function showStep(step) {
  el('modeStep').classList.toggle('hidden', step !== 'mode');
  el('teamStep').classList.toggle('hidden', step !== 'team');
  // Cup progress belongs to the cup. In a friendly it is noise.
  el('cupProgress').classList.toggle('hidden', game.mode !== 'cup');
  el('opponentChoice').classList.toggle('hidden', game.mode !== 'single');
}

function pickMode(mode) {
  SFX.unlock();
  game.mode = mode;
  refreshStart();
  showStep('team');
  // A first-time child has no team at all; go straight to making one rather
  // than showing them a row of empty slots to decipher.
  if (!game.slot.emoji) { openTeamEditor(); }
}

function startPlaying() {
  SFX.unlock();
  // An empty slot has nobody to play as. Make the team first.
  if (!game.slot.emoji) { openTeamEditor(); return; }
  game.mathsOn = game.slot.band > 0;
  game.maths = game.slot.maths || null;
  el('startScreen').classList.add('hidden');
  // A team entering the cup meets its next opponent on the draw, not by being
  // dropped straight onto the pitch.
  if (game.mode === 'cup') { showBracket(); } else { findOpponent(); }
}

el('pickSingle').addEventListener('click', function () { pickMode('single'); });
el('pickCup').addEventListener('click', function () { pickMode('cup'); });
el('startBack').addEventListener('click', function () { SFX.select(); showStep('mode'); });
el('startGo').addEventListener('click', startPlaying);

/* ---------- juice ---------- */
// Screen shake and a ball trail. None of it
// changes the rules; it exists because a hard collision that registers only as
// a number is a hard collision the child does not feel.
// Kept deliberately small. Shake should register a hard hit at the edge of
// vision, not make a child track a moving pitch while they are trying to aim.
const SHAKE_MAX = 3.5;
const SHAKE_HIT_THRESHOLD = 420;   // only genuinely heavy contact shakes at all

function addShake(amount) {
  game.shake = Math.min(SHAKE_MAX, game.shake + amount);
}

function updateJuice(dt) {
  game.shake *= Math.pow(0.0025, dt);          // decays in ~a fifth of a second
  if (game.shake < 0.05) game.shake = 0;

  // Trail: a short history of ball positions, only while it is actually moving.
  const b = game.ball, sp = Math.hypot(b.vx, b.vy);
  if (sp > 90) {
    game.trail.push(b.x, b.y);
    while (game.trail.length > 26) { game.trail.shift(); game.trail.shift(); }
  } else if (game.trail.length) {
    game.trail.shift(); game.trail.shift();
  }
}

function drawTrail() {
  const tr = game.trail;
  if (tr.length < 4) return;
  ctx.save();
  for (let i = 0; i < tr.length - 2; i += 2) {
    const a = (i / (tr.length - 2));
    ctx.beginPath();
    ctx.arc(tr[i], tr[i + 1], game.ball.r * (0.25 + a * 0.55), 0, 6.29);
    ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.3).toFixed(3) + ')';
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- particles ---------- */
const CONFETTI_COLORS = ['#ffd54a', '#ff8a3d', '#57e389', '#6fb5ff', '#ff6b8a', '#c792ff'];
function confetti(y, dir) {
  for (let i = 0; i < 46; i++) {
    game.particles.push({
      x: W / 2 + (Math.random() - 0.5) * MOUTH_HALF * 2,
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
  const net = pitchTheme().net;
  ctx.fillStyle = 'rgba(' + net + ',0.13)';
  ctx.fillRect(MOUTH_L, top, MOUTH_HALF * 2, h);
  ctx.strokeStyle = 'rgba(' + net + ',0.3)';
  ctx.lineWidth = 1;
  for (let x = MOUTH_L; x <= MOUTH_R; x += 14) line(x, top, x, top + h);
  for (let y = top; y <= top + h; y += 14) line(MOUTH_L, y, MOUTH_R, y);
}

// Everything the pitch renderer needs to look like somewhere else. The lines
// and nets take a colour per theme because white vanishes on snow; everything
// else is the same pitch wearing different paint.
const PITCH_THEMES = {
  day:   { base: '#2e9e4f', stripe: 'rgba(255,255,255,0.06)',
           line: 'rgba(255,255,255,0.9)', net: '255,255,255', post: '#1b5e33' },
  night: { base: '#175233', stripe: 'rgba(255,255,255,0.045)',
           line: 'rgba(255,255,255,0.8)', net: '255,255,255', post: '#0b2e1e' },
  snow:  { base: '#c7d8e4', stripe: 'rgba(255,255,255,0.45)',
           line: 'rgba(37,78,110,0.7)', net: '37,78,110', post: '#7c99ad' },
  space: { base: '#1e1348', stripe: 'rgba(255,255,255,0.05)',
           line: 'rgba(196,181,253,0.85)', net: '196,181,253', post: '#0f0a24',
           stars: true },
};

// What this slot has chosen to wear. Falls back to the defaults whenever the
// save predates a kind or holds an id the catalogue does not know, so a
// hand-edited save draws the classic look rather than nothing.
const COSMETIC_DEFAULTS = { ball: 'classic', pitch: 'day', hat: 'none' };
function equippedId(kind) {
  const id = game.slot.equipped[kind];
  return Locker.byId(id) ? id : COSMETIC_DEFAULTS[kind];
}
function pitchTheme() { return PITCH_THEMES[equippedId('pitch')] || PITCH_THEMES.day; }

function drawPitch() {
  const th = pitchTheme();
  ctx.fillStyle = th.base;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = th.stripe;
  for (let i = 0; i < 9; i += 2) ctx.fillRect(0, i * 100, W, 100);

  // Space plays under a starfield: fixed pseudo-random positions, so the sky
  // holds still frame to frame instead of shimmering.
  if (th.stars) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 70; i++) {
      const sx = (i * 137 + 29) % W, sy = (i * 211 + 61) % H;
      ctx.fillRect(sx, sy, i % 3 ? 2 : 3, i % 3 ? 2 : 3);
    }
  }

  ctx.strokeStyle = th.line;
  ctx.lineWidth = 4;
  ctx.strokeRect(SIDE_L, TOP_Y, SIDE_R - SIDE_L, BOT_Y - TOP_Y);
  line(SIDE_L, H / 2, SIDE_R, H / 2);
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 72, 0, 6.29); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 5, 0, 6.29); ctx.fillStyle = th.line; ctx.fill();
  ctx.strokeRect(W / 2 - 140, TOP_Y, 280, 110);
  ctx.strokeRect(W / 2 - 140, BOT_Y - 110, 280, 110);

  drawNet(BACK_TOP, TOP_Y);
  drawNet(BACK_BOT, BOT_Y);

  for (const p of game.posts) {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.29);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = th.post; ctx.stroke();
  }
}

// The disc every body on the pitch is drawn as: drop shadow, coloured body,
// pale centre. Players and keepers differ only in their two colours and in
// what gets painted on top.
function drawDisc(p, body, edge) {
  ctx.beginPath();
  ctx.ellipse(p.x + 3, p.y + 4, p.r, p.r * 0.92, 0, 0, 6.29);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();

  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.29);
  ctx.fillStyle = body; ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = edge; ctx.stroke();

  ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.45, 0, 6.29);
  ctx.fillStyle = 'rgba(255,255,255,0.87)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = edge; ctx.stroke();
}

function drawPlayer(p, t) {
  const isHuman = p.team === 'human';
  drawDisc(p, isHuman ? '#3b82f6' : '#ef4444', isHuman ? '#1e50b0' : '#a51f1f');

  ctx.beginPath();
  ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.5, Math.PI * 0.9, Math.PI * 1.6);
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();

  // The locker's hat, worn by the child's outfield players only: the keeper's
  // kit is its identity, and the CPU has earned nothing.
  if (isHuman) paintHat(ctx, p.x, p.y, p.r, equippedId('hat'));

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

// A hat perched on the top edge of a player disc. Painted from the same
// routine in play and in the locker tiles, so trying one on is honest.
function paintHat(c, x, y, r, hat) {
  if (!hat || hat === 'none') return;
  if (hat === 'cap') {
    c.beginPath(); c.arc(x, y - r * 0.62, r * 0.55, Math.PI, 6.29);
    c.fillStyle = '#ef4444'; c.fill();
    c.lineWidth = 2; c.strokeStyle = '#991b1b'; c.stroke();
    c.beginPath();
    c.ellipse(x, y - r * 0.6, r * 0.72, r * 0.16, 0, 0, 6.29);
    c.fillStyle = '#b91c1c'; c.fill();
  } else if (hat === 'crown') {
    c.beginPath();
    c.moveTo(x - r * 0.6, y - r * 0.55);
    c.lineTo(x - r * 0.6, y - r * 1.15); c.lineTo(x - r * 0.3, y - r * 0.8);
    c.lineTo(x, y - r * 1.25); c.lineTo(x + r * 0.3, y - r * 0.8);
    c.lineTo(x + r * 0.6, y - r * 1.15); c.lineTo(x + r * 0.6, y - r * 0.55);
    c.closePath();
    c.fillStyle = '#fbbf24'; c.fill();
    c.lineWidth = 2; c.strokeStyle = '#b45309'; c.stroke();
  } else if (hat === 'party') {
    c.beginPath();
    c.moveTo(x, y - r * 1.45);
    c.lineTo(x - r * 0.45, y - r * 0.45); c.lineTo(x + r * 0.45, y - r * 0.45);
    c.closePath();
    c.fillStyle = '#8b5cf6'; c.fill();
    c.lineWidth = 2; c.strokeStyle = '#6d28d9'; c.stroke();
    c.beginPath(); c.arc(x, y - r * 1.45, r * 0.18, 0, 6.29);
    c.fillStyle = '#fbbf24'; c.fill();
  }
}

// Goalkeeper: same silhouette as an outfield player but in its own colour
// (neither team's blue/red) with an outer ring, so it reads as "the keeper"
// at a glance without any label.
// Both keepers used to be the same gold, so a child could not tell which one
// was theirs. Each now wears a keeper kit tinted to its own side, while the
// outer ring stays the shared shape language that says "this is a keeper".
const KEEPER_KIT = {
  human: { body: '#14b8a6', edge: '#0f766e', ring: '#7db4ff' },
  ai:    { body: '#f59e0b', edge: '#b45309', ring: '#ff9e9e' },
};

// "Answer to save" says nothing about what is coming. The shot has already
// been simulated, so show the child exactly where the ball is about to go:
// its route, the spot it will cross the line, and the goal under threat.
function drawThreat(t) {
  const path = game.threatPath;
  if (!path || path.length < 4) return;
  const pulse = 0.55 + 0.45 * Math.sin(t * 7);

  // the goal mouth being attacked, throbbing red
  ctx.save();
  ctx.strokeStyle = 'rgba(255,64,64,' + (0.45 + 0.4 * pulse) + ')';
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(MOUTH_L, BOT_Y); ctx.lineTo(MOUTH_R, BOT_Y); ctx.stroke();

  // the ball's predicted route
  ctx.setLineDash([12, 10]);
  ctx.lineDashOffset = -t * 90;
  ctx.strokeStyle = 'rgba(255,90,90,0.85)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(path[0], path[1]);
  for (let i = 2; i < path.length; i += 2) ctx.lineTo(path[i], path[i + 1]);
  ctx.stroke();
  ctx.setLineDash([]);

  // where it will cross the line
  ctx.beginPath();
  ctx.arc(game.pendingSaveX, BOT_Y, 13 + 5 * pulse, 0, 6.29);
  ctx.strokeStyle = 'rgba(255,64,64,0.95)';
  ctx.lineWidth = 4; ctx.stroke();
  ctx.restore();
}

function drawKeeper(p) {
  const kit = KEEPER_KIT[p.team];
  drawDisc(p, kit.body, kit.edge);

  // The gloves: two small arcs either side, so a keeper reads as a keeper even
  // in a still frame, not just by its colour.
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = kit.ring;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6, Math.PI * 1.62, Math.PI * 0.38); ctx.stroke();
}

// The face of the ball, painted around an origin the caller has already
// translated (and, in play, rotated) to. Shared by the match renderer and the
// locker tiles, so what the child picks is exactly what they get.
function paintBallFace(c, r, skin) {
  c.beginPath(); c.arc(0, 0, r, 0, 6.29);
  c.fillStyle = skin === 'gold' ? '#fcd34d' : '#fff'; c.fill();
  c.lineWidth = 2;
  c.strokeStyle = skin === 'gold' ? '#92400e' : '#2b2b2b'; c.stroke();
  c.save();
  c.beginPath(); c.arc(0, 0, r - 1, 0, 6.29); c.clip();

  if (skin === 'stripes') {
    c.fillStyle = '#2563eb';
    for (let k = 0; k < 5; k += 2) c.fillRect(-r + k * r * 0.4, -r, r * 0.4, r * 2);
  } else if (skin === 'stars') {
    c.fillStyle = '#f59e0b';
    for (let k = 0; k < 5; k++) {
      const a = k * 1.2566 - Math.PI / 2;
      paintStar(c, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.3);
    }
  } else if (skin === 'flames') {
    const g = c.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#fde047'); g.addColorStop(0.55, '#f97316');
    g.addColorStop(1, '#b91c1c');
    c.fillStyle = g; c.fillRect(-r, -r, r * 2, r * 2);
    c.strokeStyle = 'rgba(127,29,29,0.8)'; c.lineWidth = r * 0.14;
    for (let k = 0; k < 3; k++) {
      c.beginPath(); c.arc(0, 0, r * (0.45 + k * 0.22), k * 2.1, k * 2.1 + 2.4);
      c.stroke();
    }
  } else if (skin === 'beach') {
    const cols = ['#ef4444', '#fbbf24', '#3b82f6'];
    for (let k = 0; k < 6; k++) {
      if (k % 2) continue;                     // white wedges stay the base coat
      c.beginPath(); c.moveTo(0, 0);
      c.arc(0, 0, r, k * 1.0472 - Math.PI / 2, (k + 1) * 1.0472 - Math.PI / 2);
      c.closePath(); c.fillStyle = cols[k / 2]; c.fill();
    }
    c.beginPath(); c.arc(0, 0, r * 0.22, 0, 6.29);
    c.fillStyle = '#fff'; c.fill();
  } else {                                     // classic and gold: pentagons
    c.fillStyle = skin === 'gold' ? '#b45309' : '#2b2b2b';
    c.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = k * 1.2566 - Math.PI / 2, rr = r * 0.4;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      k === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
    }
    c.closePath(); c.fill();
    for (let k = 0; k < 5; k++) {
      const a = k * 1.2566 - Math.PI / 2 + 0.63;
      c.beginPath();
      c.arc(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, r * 0.28, 0, 6.29);
      c.fill();
    }
    if (skin === 'gold') {                     // a shine, so gold reads as metal
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = r * 0.16;
      c.beginPath(); c.arc(0, 0, r * 0.72, Math.PI * 1.05, Math.PI * 1.45);
      c.stroke();
    }
  }
  c.restore();
}

function paintStar(c, x, y, r) {
  c.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    k === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
  }
  c.closePath(); c.fill();
}

function drawBall(b) {
  ctx.beginPath();
  ctx.ellipse(b.x + 2, b.y + 3, b.r, b.r * 0.92, 0, 0, 6.29);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();

  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(game.ballRot);
  paintBallFace(ctx, b.r, equippedId('ball'));
  ctx.restore();
}

function drawAim() {
  if (!game.drag) return;
  const { player, px, py } = game.drag;
  const dx = player.x - px, dy = player.y - py;
  const len = Math.hypot(dx, dy);
  if (len < MIN_DRAG) return;
  const power = Math.min(len / MAX_DRAG, 1);
  const nx = dx / len, ny = dy / len;
  if (isBonusActive('coach')) drawCoachingLine(player, nx, ny, power);
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

function bonusArrow(from, to, color) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
  if (length < 5) return;
  const nx = dx / length, ny = dy / length;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 4;
  line(from.x, from.y, to.x, to.y);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - nx * 12 - ny * 7, to.y - ny * 12 + nx * 7);
  ctx.lineTo(to.x - nx * 12 + ny * 7, to.y - ny * 12 - nx * 7);
  ctx.closePath(); ctx.fill();
}

function drawCoachingLine(player, nx, ny, power) {
  const speed = power * MAX_LAUNCH;
  const fr = Math.pow(game.friction, STEP * 60);
  const steps = Math.min(MAX_MOVE_TIME / STEP,
    Math.max(0, Math.ceil(Math.log(STOP_SPEED / speed) / Math.log(fr))));
  const travel = speed * STEP * (1 - Math.pow(fr, steps)) / (1 - fr);
  // A geometric aid for the first collision, not a promise about the goal.
  // Stop the ball arrow at the next obstacle: keeper reactions and rebounds
  // remain live football, rather than being portrayed as certain outcomes.
  const guide = Bonuses.guide(player, { vx: nx * speed, vy: ny * speed }, game.ball,
    [...movers.filter(o => o !== player && o !== game.ball), ...game.posts], BONUS_BOUNDS, travel);
  if (!guide) return;
  ctx.save();
  ctx.strokeStyle = guide.hitBall ? '#a7f3d0' : '#fbbf24';
  ctx.lineWidth = 3; ctx.setLineDash([5, 7]);
  line(player.x, player.y, guide.contact.x, guide.contact.y);
  ctx.beginPath(); ctx.arc(guide.contact.x, guide.contact.y, player.r, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  if (guide.hitBall) {
    const b = game.ball, dx = guide.contact.x - b.x, dy = guide.contact.y - b.y;
    const distance = Math.hypot(dx, dy) || 1;
    ctx.beginPath(); ctx.arc(b.x + dx / distance * b.r, b.y + dy / distance * b.r, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffeb85'; ctx.fill();
    if (guide.ballEnd) bonusArrow(b, guide.ballEnd, '#a7f3d0');
  }
  ctx.restore();
}

function drawBonusEffects(t) {
  if (!game.bonus && !game.activeStreakPowers.length) return;
  const pulse = 1 + Math.sin(t * 5) * 0.08;
  ctx.save();
  if (game.bonus === 'feint') {
    ctx.strokeStyle = '#ffeb85'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(aiKeeper.x, aiKeeper.y, (aiKeeper.r + 10) * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffeb85';
    ctx.fillRect(aiKeeper.x - 8, aiKeeper.y - aiKeeper.r - 22, 5, 14);
    ctx.fillRect(aiKeeper.x + 3, aiKeeper.y - aiKeeper.r - 22, 5, 14);
  }
  if (isBonusActive('big') && game.bigStriker) {
    const p = game.bigStriker;
    ctx.strokeStyle = '#ffeb85'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, (p.r + 8) * pulse, 0, Math.PI * 2); ctx.stroke();
  }
  if (isBonusActive('small')) {
    ctx.strokeStyle = 'rgba(255,235,133,.65)'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
    for (const p of game.players.filter(p => p.team === 'ai')) {
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (game.state === 'HUMAN_SETUP') {
    const setup = game.setup;
    if (!setup.player) {
      ctx.strokeStyle = '#a7f3d0'; ctx.lineWidth = 3;
      for (const p of game.players.filter(p => p.team === 'human')) {
        ctx.beginPath(); ctx.arc(p.x, p.y, (p.r + 10) * pulse, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      const p = setup.player;
      ctx.fillStyle = 'rgba(59,130,246,.13)'; ctx.strokeStyle = '#a7f3d0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, Bonuses.MOVE_LIMIT, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (setup.target) {
        bonusArrow(p, setup.target, '#a7f3d0');
        ctx.globalAlpha = .65;
        drawDisc({ ...setup.target, r: p.r }, '#3b82f6', '#a7f3d0');
      } else if (setup.pointer) {
        ctx.strokeStyle = '#f87171'; ctx.lineWidth = 4;
        const at = setup.pointer;
        line(at.x - 9, at.y - 9, at.x + 9, at.y + 9);
        line(at.x + 9, at.y - 9, at.x - 9, at.y + 9);
      }
    }
  }
  ctx.restore();
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
  if (game.shake > 0) {
    ctx.save();
    ctx.translate((Math.random() * 2 - 1) * game.shake,
                  (Math.random() * 2 - 1) * game.shake);
  }
  drawPitch();
  for (const k of game.keepers) drawKeeper(k);
  drawThreat(t);
  for (const p of game.players) drawPlayer(p, t);
  drawTrail();
  drawBall(game.ball);
  drawBonusEffects(t);
  drawAim();
  drawParticles();
  if (game.shake > 0) ctx.restore();
}

/* ---------- main loop ---------- */
let last = performance.now(), acc = 0;
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  if (game.state === 'MATCHMAKING') {
    if (!game.matchReady) {
      game.timer -= dt;
      if (game.timer <= 0) revealOpponent();
    }
  } else if (game.state === 'AI_WAIT') {
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
    else if (allStopped(movers) || game.moveTime > MAX_MOVE_TIME) settle();
  } else {
    acc = 0;
  }

  keeperReact(dt);
  updateJuice(dt);
  updateParticles(dt);
  draw(now / 1000);
  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
// The pitch renders immediately (as a static backdrop, same trick the win
// overlay already relies on) but nothing is playable: game.state stays
// 'START', which blocks pointer input until the match introduction's Kick off
// calls restart(). Finding a rival and reading the cup draw never start play.
init();
loadProgress();
// After loadProgress, not before: the start-screen block runs at parse time,
// when game.slot is still null and there is nothing to paint.
refreshStart();
showStep('mode');
fitCanvas();
requestAnimationFrame(frame);
