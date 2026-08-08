'use strict';
/* ================= Flick Football Chaos ================= */

/* ---------- constants & geometry (logical units) ---------- */
const W = 600, H = 900;
const SIDE_L = 22, SIDE_R = W - 22;          // side walls
const TOP_Y = 72, BOT_Y = H - 72;            // goal lines
const BACK_TOP = 18, BACK_BOT = H - 18;      // back of the nets
// Narrowed from 100 (playtester defect: a 200-wide mouth is 36% of the
// pitch and made direct shots too forgiving). 80 keeps a generous target
// for a five-year-old while giving the keeper a mouth it can meaningfully
// cover without spanning it end to end.
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
const STOP_SPEED = 13, MAX_MOVE_TIME = 9;
const WIN_SCORE = 3;
const STEP = 1 / 120;

// ---- goalkeepers (playtester defect: direct shots scored too easily) ----
// One extra, unflickable body per side. It moves only horizontally, along
// its own goal mouth, sliding toward the ball's x between turns (never
// mid-flight) at a capped speed so it lags rather than snaps to cover a
// shot. It is a plain physics body (BODY_REST applies via the normal
// collideCircles path) but invM 0, like the goalposts, so the ball bounces
// off it without ever knocking it out of position.
const KEEPER_R = PLAYER_R;
// Keepers were invM 0 when they were fixed obstacles. Now that the child can
// flick them they must have real mass, or two keepers pass straight through
// each other (collideCircles bails when both masses are infinite) and a flicked
// keeper ploughs through everything without ever slowing. Slightly heavier than
// an outfield player, so the ball cannot easily barge it off its line.
const KEEPER_INV_M = 0.18;
const KEEPER_Y_INSET = 26; // how far in front of its own goal line it stands
// Per-turn cap on keeper movement. The mouth is only ~108 wide at the keeper's
// clamped range, so at 70 it crosses in two turns and barely trails play at
// all — this is the dial to turn down if keepers feel too hard to beat.
const KEEPER_MAX_STEP = 70;
// A keeper only keeps goal while it is on its line; beyond this it is out of
// position and jogging back, which is what makes a rush-out cost something.
const KEEPER_ON_LINE = 30, KEEPER_RETURN_STEP = 70;
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
const KEEPER_REACT_SPEED = 300;    // px per second once it has read the shot
const KEEPER_REACT_DELAY = 0.12;   // seconds of reaction time before it moves
// How badly it can misread the shot. Never zero: a keeper that always dived
// correctly would make placement pointless, and the cup's rising skill is
// meant to close this gap, not shut it.
const KEEPER_READ_BASE = 26;       // px of error even for the best keeper
const KEEPER_READ_RANGE = 74;      // px more at the worst

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
  state: 'START', // START | HUMAN_QUESTION | HUMAN_AIM | MOVING | AI_WAIT | AI_SAVE_QUESTION | GOAL_PAUSE | OVER
  turn: 'human', mover: 'human',
  maths: null, mathsOn: true, startBand: 3,
  mode: 'single',   // 'single' | 'cup' — only the cup advances the draw
  keeperDive: null, // {x, wait} once the AI keeper has read the shot in flight
  turnCount: 0, sinceChaos: 0, modifier: null,
  friction: BASE_FRICTION, powerMult: 1,
  pendingPrize: null,
  pendingAiShot: null, pendingSaveX: null,
  score: { human: 0, ai: 0 }, lastScorer: null,
  timer: 0, moveTime: 0, ballRot: 0,
  drag: null, aiChoice: null, askedLastTurn: false, threatPath: null,
  shake: 0, slowmo: 0, trail: [],
  save: null, slot: null, aiSkill: 0.55,
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
  // Kept out of game.players on purpose: that array is what pointerdown
  // scans for a draggable human player and what pickAiPlayer scans for a
  // CPU shooter, so keeping keepers separate is what makes them unflickable
  // and un-choosable as a shooter, with no extra "is this a keeper" guard
  // needed at either call site.
  game.keepers = [
    { x: W / 2, y: TOP_Y + KEEPER_Y_INSET, vx: 0, vy: 0, r: KEEPER_R, invM: KEEPER_INV_M,
      team: 'ai', keeper: true, home: [W / 2, TOP_Y + KEEPER_Y_INSET] },
    { x: W / 2, y: BOT_Y - KEEPER_Y_INSET, vx: 0, vy: 0, r: KEEPER_R, invM: KEEPER_INV_M,
      team: 'human', keeper: true, home: [W / 2, BOT_Y - KEEPER_Y_INSET] },
  ];
}

const movers = () => [...game.players, ...game.keepers, game.ball];
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
  for (const o of movers()) { [o.x, o.y] = o.home; o.vx = o.vy = 0; }
  game.ballRot = 0;
  game.drag = null;
  game.aiChoice = null;
}

function restart() {
  // Time on a pitch, measured from kickoff to full time. Wall-clock from the
  // start screen would count a tablet left face-up on a sofa as practice.
  game.kickoffAt = Date.now();
  game.score.human = game.score.ai = 0;
  game.turnCount = 0;
  game.sinceChaos = 0;
  game.particles = [];
  game.lastScorer = null;
  clearModifier();
  resetPositions();
  Quiz.hide();
  game.pendingPrize = null;
  game.pendingAiShot = null;
  game.pendingSaveX = null;
  game.threatPath = null;
  overlay.classList.add('hidden');
  goalFlash.classList.add('hidden');
  updateScore();
  startTurn('human');
}

/* ---------- persistence ---------- */
// The child's slot is loaded once at boot and written back whenever something
// they earned changes. Everything here tolerates storage being unavailable.
function persist() {
  if (game.save) { Store.save(game.save); }
}

function loadProgress() {
  game.save = Store.load();
  game.slot = Store.activeSlot(game.save);
  if (game.slot.maths) { game.maths = game.slot.maths; }
  game.aiSkill = Tournament.skillFor(game.slot.cup.index, game.slot.cup.season);
}

// Adaptive state belongs to the slot, so a sibling on another slot is not
// dragged around by this child's answers.
function rememberMaths() {
  if (!game.slot || !game.maths) { return; }
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

/* ---------- human-turn maths question ---------- */
// A modal precedes every human turn, advertising one of the chaos modifiers
// as its prize before the question is even shown — the win must be obvious
// up front. Answering right fires that exact modifier; answering wrong
// still hands the player their flick, and skipping is instant and free.
// Quiz.js owns the cancellable feedback timer, so the flash-then-continue
// behaviour lives in one place.
// Chance of allowing a bonus question on the turn straight after one. 0 gives
// roughly a question every 4.4 turns, 1 gives every 2.9.
const BONUS_REPEAT_CHANCE = 0.5;

// A question before every single shot reads as a tax on playing. The save
// question already only fires when the CPU actually threatens; the bonus
// question now follows the same rule, so it arrives when a bonus could win
// something rather than on every turn.
function worthABonus() {
  // Attacking half only: a giant ball or a super shot is worth something when
  // the ball is up near the CPU's goal, and worth little from your own box.
  if (game.ball.y > H / 2) { return false; }
  // Asking two turns running is allowed only sometimes. A hard "never twice"
  // rule caps this at half your turns and made questions too sparse; removing
  // it entirely puts you back to one every turn whenever you camp in their
  // half, which was too much. This is the dial between those.
  if (game.askedLastTurn && Math.random() >= BONUS_REPEAT_CHANCE) {
    game.askedLastTurn = false;
    return false;
  }
  game.askedLastTurn = true;
  return true;
}

// Both question flavours record the same way. Streaks and the fastest
// correct answer live in slot.stats so they survive across sessions and
// repair like every other counter.
function recordAnswer(correct, elapsedMs) {
  if (!game.slot) { return; }
  var st = game.slot.stats;
  st.answered += 1;
  if (correct) {
    st.correct += 1;
    st.curStreak += 1;
    if (st.curStreak > st.bestStreak) { st.bestStreak = st.curStreak; }
    if (!st.bestMs || elapsedMs < st.bestMs) { st.bestMs = elapsedMs; }
  } else {
    st.curStreak = 0;
  }
}

function askQuestion() {
  document.getElementById('quiz').classList.remove('saving');
  if (!game.maths) { game.maths = Maths.newState(game.startBand); }
  game.state = 'HUMAN_QUESTION';
  setTurnMsg('Your turn', 'human');
  var q = Maths.make(game.maths.difficulty, game.maths, Math.random);
  var keys = Object.keys(MODIFIERS);
  var prizeId = keys[(Math.random() * keys.length) | 0];
  game.pendingPrize = prizeId;
  Quiz.show(q, prizeId, function (chosen, correct, elapsedMs) {
    game.maths = Maths.update(game.maths, {
      correct: correct, elapsedMs: elapsedMs, band: q.band, skill: q.skill
    });
    recordAnswer(correct, elapsedMs);
    rememberMaths();
    finishQuestion(correct);
  }, function () {
    finishQuestion(false); // skip: no penalty, but no prize either
  }, 'Answer for a bonus');
}

function finishQuestion(correct) {
  var prizeId = game.pendingPrize;
  game.pendingPrize = null;
  if (correct && prizeId) { activateModifier(prizeId); }
  game.state = 'HUMAN_AIM';
  setTurnMsg('Your turn — drag a blue player', 'human');
}

/* ---------- CPU save question ---------- */
// Mirrors askQuestion/finishQuestion above but themed as a save rather
// than a bonus - a glove glyph and "Answer to save!" instead of a prize -
// and is only ever shown by aiLaunch after its forward simulation found
// the pending shot on target. No timer: the game waits for the child, the
// same as the bonus question.
function askSaveQuestion() {
  document.getElementById('quiz').classList.add('saving');
  if (!game.maths) { game.maths = Maths.newState(game.startBand); }
  setTurnMsg('CPU shoots — save it!', 'ai');
  var q = Maths.make(game.maths.difficulty, game.maths, Math.random);
  Quiz.show(q, 'save', function (chosen, correct, elapsedMs) {
    game.maths = Maths.update(game.maths, {
      correct: correct, elapsedMs: elapsedMs, band: q.band, skill: q.skill
    });
    recordAnswer(correct, elapsedMs);
    rememberMaths();
    finishSaveQuestion(correct);
  }, function () {
    finishSaveQuestion(false); // skip: shot stands, but no Maths.update - declining says nothing about ability
  }, 'Answer to save!');
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
    if (!simulateAiShot(shot).scores) { return true; }
  }
  diveKeeper(firstX); // nothing stops it - keep the honest dive rather than none
  return false;
}



/* ---------- goalkeepers ---------- */
// Repositioned once per turn setup (never mid-flight, never as part of
// either side's move) so it can never cost the CPU its turn. Both keepers
// track the same ball x regardless of whose turn is starting - real
// keepers do not stop watching the ball when it is the other side's turn.
function updateKeepers() {
  // Deliberately does nothing to a keeper's position. Keepers are ordinary
  // bodies: they stay where play or the child's flick leaves them, and are put
  // back on their line by resetPositions() after a goal, exactly like every
  // outfield player. Anything that repositioned them between turns moved a
  // piece the child had not touched.
  for (const k of game.keepers) { k.vx = 0; k.vy = 0; }
}

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
// Weaker keepers misread by more, which is most of what the cup's rising skill
// actually buys. It moves at a fixed speed from wherever it stands, so a shot
// into the far corner is genuinely harder to reach than one hit at the keeper.
function keeperReact(dt) {
  var k = game.keepers.filter(function (g) { return g.team === 'ai'; })[0];
  if (!k) { return; }
  if (game.state !== 'MOVING' || game.mover !== 'human') { game.keeperDive = null; return; }

  var predicted = crossingX(game.ball);
  if (predicted === null) { return; }        // not coming: hold position

  if (game.keeperDive === null || game.keeperDive === undefined) {
    var spread = KEEPER_READ_BASE + KEEPER_READ_RANGE * (1 - game.aiSkill);
    game.keeperDive = {
      x: predicted + (Math.random() * 2 - 1) * spread,
      wait: KEEPER_REACT_DELAY
    };
  }
  if (game.keeperDive.wait > 0) { game.keeperDive.wait -= dt; return; }

  k.x = Formation.keeperStep(k.x, game.keeperDive.x, KEEPER_REACT_SPEED * dt,
                             KEEPER_MIN_X, KEEPER_MAX_X);
  // Along the line only. Nudging it forward would take it out of its own goal
  // and hand the child an empty net for missing.
  k.y = KEEPER_LINE_Y;
  k.vx = k.vy = 0;
}

// A correct save answer jumps the human keeper straight to the shot's
// predicted crossing point (known because the shot was already simulated
// - see simulateAiShot), clamped into its own goal mouth.
// Formation.keeperStep with an unlimited step is exactly a clamp-to-target,
// i.e. a "dive" with no lag. The ball then genuinely collides with the
// repositioned keeper when the shot plays out - nothing about the save is
// faked.
function diveKeeper(x) {
  var keeper = game.keepers.filter(function (k) { return k.team === 'human'; })[0];
  keeper.x = Formation.keeperStep(keeper.x, x, Infinity, KEEPER_MIN_X, KEEPER_MAX_X);
}

/* ---------- turn flow ---------- */
function startTurn(team) {
  updateKeepers();
  game.turn = team;
  game.turnCount++;
  game.sinceChaos++;
  // Random chaos is only for the maths-off arcade mode; with maths on it is
  // left for a later pass to redefine how chaos is earned.
  if (!game.mathsOn && game.turnCount > 2 && game.sinceChaos >= 2 && Math.random() < 0.5) {
    const keys = Object.keys(MODIFIERS);
    activateModifier(keys[(Math.random() * keys.length) | 0]);
    game.sinceChaos = 0;
  }
  if (team === 'human') {
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
    setTurnMsg('CPU is thinking…', 'ai');
  }
}

function settle() {
  for (const o of movers()) o.vx = o.vy = 0;
  clearModifier();
  startTurn(opp(game.mover));
}

function goalScored(scorer) {
  addShake(SHAKE_GOAL);
  game.slowmo = 0.55;   // a beat of slow motion so the goal lands
  game.trail.length = 0;
  game.score[scorer]++;
  game.lastScorer = scorer;
  // Counted for every goal in every mode: the record is of what the child did,
  // not of what the cup made of it.
  if (game.slot) {
    game.slot.stats[scorer === 'human' ? 'goalsFor' : 'goalsAgainst'] += 1;
  }
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
  var trophyWon = false;
  if (game.slot) {
    game.slot.stats.matches += 1;
    if (winner === 'human') { game.slot.stats.wins += 1; }
    if (game.kickoffAt) { game.slot.stats.ms += Date.now() - game.kickoffAt; }
    game.kickoffAt = 0;
  }
  // A single match is a friendly: it costs nothing and wins nothing. Only the
  // cup moves the draw on, or a child could lose their place in it by asking
  // for a kickabout.
  if (game.slot && game.mode === 'cup') {
    const before = game.slot.cup.index;
    game.slot.cup = Tournament.recordResult(game.slot.cup, winner === 'human');
    if (Tournament.isComplete(game.slot.cup, before)) { game.slot.trophies += 1; trophyWon = true; }
    // The index has already rolled back to zero, so remember that this cup was
    // finished: the bracket owes the child the sight of themselves lifting it.
    game.wonCup = trophyWon;
    game.aiSkill = Tournament.skillFor(game.slot.cup.index, game.slot.cup.season);
  }
  // After both branches: a friendly still moves the counters above, and losing
  // those on a refresh would make the record quietly wrong.
  if (game.slot) { persist(); }
  // Anything the match earned is revealed here, at full time — never while a
  // question is open, so the questions stay a move and not a shop. The ledger
  // is derived from the counters; `unlocked` only records what has been shown,
  // which makes each reveal fire exactly once and lets a stale save replay it.
  var freshIds = game.slot ? Locker.fresh(game.slot) : [];
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
    persist();
  }
  game.state = 'OVER';
  overTitle.textContent = winner === 'human' ? 'You Win! \u{1F3C6}' : 'CPU Wins \u{1F916}';
  overSub.textContent = `Final score ${game.score.human} – ${game.score.ai}`;
  // The button does different things per mode, so it should not promise the
  // same one: in the cup it goes to the next round, in a friendly it finishes.
  el('again').textContent = game.mode === 'cup' ? 'Next round' : 'Finish';
  overlay.classList.remove('hidden');
  setTurnMsg(winner === 'human' ? 'Champion!' : 'Better luck next time!', winner);
  SFX.win(winner === 'human');
  if (trophyWon) { overTitle.textContent = '\u{1F3C6} CUP WON \u{1F3C6}'; }
}

/* ---------- AI ---------- */
// Shooter selection is angle-aware (Formation.chooseShooter): it scores each
// CPU player by whether hitting the ball from their position would actually
// send it goalward, not just by raw distance. Cheap vector maths only - no
// simulation or search, so the AI stays light.
function pickAiPlayer() {
  const aiPlayers = game.players.filter(p => p.team === 'ai');
  return Formation.chooseShooter(aiPlayers, game.ball, BOT_Y);
}

// Computes the CPU's shot without mutating anything, so it can be tried
// out in simulateAiShot before it is committed to. Aims at the goal-mouth
// corner furthest from the human keeper (Formation.farCorner) rather than
// dead centre - "aim away from the keeper", the owner's instruction - with
// a small random margin off the post so the exact target still varies shot
// to shot. Aim error and power are also tightened a little further than
// before (0.07->0.05 rad of error; 0.58->0.6 power floor, 0.09->0.08
// randomness) now that the save question gives the child a second line of
// defence - see aiLaunch and the playtest notes for why this stayed modest.
function computeAiShot() {
  const p = game.aiChoice || pickAiPlayer();
  const b = game.ball;
  const keeper = game.keepers.filter(k => k.team === 'human')[0]; // defends the goal the CPU shoots at
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
  setTurnMsg('CPU shoots!', 'ai');
  SFX.launch();
}

// The save mechanic's gate (owner instruction: "simulate its shot forward
// ... and check whether it would score"). Only a shot simulateAiShot finds
// on target pauses for a save question - otherwise play proceeds exactly
// as before. Gating matters for three reasons: it keeps the question from
// appearing on every single turn, it makes the moment mean something, and
// it teaches the child this is the dangerous moment - a question over a
// shot that was never going in would just be noise. Also skipped entirely
// in no-maths mode, since there is no maths to answer with.
function aiLaunch() {
  const shot = computeAiShot();
  if (!game.mathsOn) { commitAiShot(shot); return; }
  const sim = simulateAiShot(shot);
  if (!sim.onTarget) { commitAiShot(shot); return; }
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

// simActive guards this during the save mechanic's forward lookahead (see
// simulateAiShot below) - that run must be silent and must not disturb the
// real hit-sound cooldown, since nothing has actually happened on screen.
let simActive = false;

function hitSfx(impact) {
  if (impact > SHAKE_HIT_THRESHOLD) { addShake(Math.min(2, impact / 700)); }
  if (simActive) return;
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
  const list = movers();
  advanceBodies(list, game.friction, dt);
  const b = game.ball;
  game.ballRot += (Math.hypot(b.vx, b.vy) / Math.max(b.r, 1)) * dt * (b.vx < 0 ? -1 : 1);
  resolveCollisions(list, b);
  if (game.state === 'MOVING') {
    if (b.y + b.r < TOP_Y) goalScored('human');       // ball fully inside top goal
    else if (b.y - b.r > BOT_Y) goalScored('ai');     // ball fully inside bottom goal
  }
}

const allStopped = () => movers().every(o => Math.hypot(o.vx, o.vy) < STOP_SPEED);

function cloneBody(o) {
  return { x: o.x, y: o.y, vx: o.vx, vy: o.vy, r: o.r, invM: o.invM };
}

// The save mechanic's forward lookahead (owner instruction: "simulate its
// shot forward ... and check whether it would score"). Clones every mover
// (posts are immovable - invM 0 - so the real ones are safe to reuse
// as-is) and replays advanceBodies/resolveCollisions on the clones only,
// so nothing here touches the real game state or plays a sound
// (simActive silences hitSfx for the duration). Bounded to MAX_MOVE_TIME
// worth of steps, same ceiling a real move gets, then gives up - one shot
// played out once, not a search over shot choices, so this stays cheap.
function simulateAiShot(shot) {
  const list = movers();
  const clones = list.map(cloneBody);
  const shooterIdx = list.indexOf(shot.player);
  const simBall = clones[clones.length - 1]; // movers() always ends with game.ball
  clones[shooterIdx].vx = shot.vx;
  clones[shooterIdx].vy = shot.vy;
  simActive = true;
  const maxSteps = Math.ceil(MAX_MOVE_TIME / STEP);
  let scores = false, crossX = null;
  const path = [];
  // A shot the child never gets to defend is a shot they cannot learn from, so
  // "threatening" is deliberately wider than "certain goal": anything that ends
  // up near the mouth counts, and near-misses are exactly the moments worth
  // saving. Track the ball's closest approach to the goal line and its x there.
  let bestDy = Infinity, bestX = simBall.x;
  for (let i = 0; i < maxSteps; i++) {
    advanceBodies(clones, game.friction, STEP);
    resolveCollisions(clones, simBall);
    if (i % 6 === 0) { path.push(simBall.x, simBall.y); }
    const dy = BOT_Y - simBall.y;
    if (dy < bestDy) { bestDy = dy; bestX = simBall.x; }
    if (simBall.y - simBall.r > BOT_Y) { scores = true; crossX = simBall.x; break; } // would score for ai
    if (simBall.y + simBall.r < TOP_Y) { break; }                                     // own-goal fluke: not this shot's target
    if (clones.every(o => Math.hypot(o.vx, o.vy) < STOP_SPEED)) { break; }            // settled without scoring
  }
  simActive = false;
  // Only a shot that would actually go in. Widening this to near-misses took
  // the save question to 80% of CPU turns, which with the bonus question meant
  // roughly one question every turn — the owner playing it reported questions
  // "all the time". A save is worth asking for when there is a goal to stop.
  const threatening = scores;
  return { onTarget: threatening, scores: scores, x: scores ? crossX : bestX, path: path };
}


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
  // Keepers are draggable too: rushing yours out is a real clearance, at the
  // real cost of leaving the goal empty for the CPU's next shot.
  for (const pl of game.players.concat(game.keepers)) {
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

el('again').addEventListener('click', () => {
  SFX.unlock();
  overlay.classList.add('hidden');
  // Next opponent, or the same one again after a loss — either way the child
  // sees who they are facing before play resumes. A friendly just kicks off.
  if (game.mode === 'cup' && game.slot && game.slot.emoji) {
    // A finished cup is drawn one last time with the child in the champion's
    // place. From there the button goes home, not into the next season.
    showBracket(game.wonCup ? Tournament.COUNT : undefined);
    game.wonCup = false;
  } else if (game.slot && game.slot.emoji) {
    // A friendly finishes: show what it added to the record, then go home.
    // Kicking straight into another match made the result meaningless — there
    // was nothing between one game and the next.
    showStats(true);
  } else {
    restart();
  }
});

el('roundGo').addEventListener('click', () => {
  SFX.unlock();
  hideBracket();
  if (bracketFinal) { bracketFinal = false; goHome(); } else { restart(); }
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
  game.drag = null;
  Quiz.hide();
  overlay.classList.add('hidden');
  refreshStart();
  showStep('team');
  el('startScreen').classList.remove('hidden');
}

// A curated grid rather than the system emoji picker: it is tap-only, needs no
// keyboard, and is not overwhelming for a five-year-old.
var BADGES = ['\u{1F981}','\u{1F42F}','\u{1F438}','\u{1F984}','\u{1F996}','\u{1F419}',
              '\u{1F41D}','\u{1F98A}','\u{1F43C}','\u{1F992}','\u{1F988}','\u{1F985}',
              '\u26BD','\u{1F525}','\u26A1','\u2B50','\u{1F308}','\u{1F680}',
              '\u{1F451}','\u{1F48E}','\u{1F340}','\u{1F3B8}','\u{1F36A}','\u{1F47D}',
              // Countries, so a child can play as their own — the opponents are
              // countries too, which is what makes the cup read as a World Cup.
              '\u{1F1EC}\u{1F1E7}','\u{1F1FA}\u{1F1F8}','\u{1F1E9}\u{1F1EA}','\u{1F1EE}\u{1F1F9}',
              '\u{1F1F5}\u{1F1F9}','\u{1F1E6}\u{1F1F7}','\u{1F1F2}\u{1F1FD}','\u{1F1F0}\u{1F1F7}',
              '\u{1F1F5}\u{1F1F1}','\u{1F1E8}\u{1F1FF}','\u{1F1F8}\u{1F1F0}','\u{1F1FA}\u{1F1E6}'];

function slotLabel(slot) { return slot.emoji || '\uFF0B'; }

function paintSlots() {
  var row = el('slotRow');
  if (!row || !game.save) { return; }
  row.innerHTML = '';
  game.save.slots.forEach(function (slot, i) {
    var card = document.createElement('div');
    card.className = 'slotCard' + (i === game.save.active ? ' on' : '') + (slot.emoji ? '' : ' empty');
    var badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = slotLabel(slot);
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
        refreshStart();
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

function refreshStart() {
  paintSlots();
  paintCup();
  paintNextUnlock();
  if (game.slot && game.slot.maths) {
    game.aiSkill = Tournament.skillFor(game.slot.cup.index, game.slot.cup.season);
  }
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
  var band = paintAges(game.slot.band, function (b) { band = b; });
  grid.innerHTML = '';
  BADGES.forEach(function (b) {
    var btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = b;
    if (b === chosen) { btn.className = 'on'; }
    btn.addEventListener('click', function () {
      chosen = b;
      [].forEach.call(grid.children, function (c) { c.className = (c.textContent === b) ? 'on' : ''; });
      // A badge the child has not overtyped renames the team with it, so
      // picking a flag gives you that country rather than a stray invention.
      if (!typed) { nameInput.value = Names.forBadge(b, Math.random); }
      SFX.select();
    });
    grid.appendChild(btn);
  });

  // Never open on an empty field. A child who will not type still leaves with
  // a team that is called something.
  nameInput.value = game.slot.name || Names.forBadge(chosen, Math.random);
  nameInput.oninput = function () { typed = true; };
  el('teamDice').onclick = function () {
    typed = false;
    nameInput.value = Names.make(Math.random);
    SFX.select();
  };
  el('teamDelete').className = '';
  ed.classList.remove('hidden');

  // A way out that changes nothing. Without it, tapping the empty "+" slot to
  // see what it did trapped the child on this card with only "save" and
  // "delete" — neither of which is "I did not mean to be here".
  el('teamCancel').onclick = function () {
    if (!game.slot.emoji && typeof returnTo === 'number') {
      game.save.active = returnTo;
      game.slot = Store.activeSlot(game.save);
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
    if (band !== game.slot.band) { game.slot.maths = null; game.maths = null; }
    game.slot.band = band;
    persist();
    ed.classList.add('hidden');
    refreshStart();
  };
  // Deleting is the one destructive control here, so it takes two taps.
  el('teamDelete').onclick = function () {
    var btn = el('teamDelete');
    if (btn.className !== 'arm') { btn.className = 'arm'; return; }
    Store.clearSlot(game.save, game.save.active);
    game.slot = Store.activeSlot(game.save);
    game.maths = null;
    persist();
    ed.classList.add('hidden');
    refreshStart();
  };
}

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
  box.textContent = cell ? (cell.you ? (game.slot.emoji || '⚽') : cell.flag) : '';
  return box;
}

function showBracket(played) {
  var view = el('bracket'), tree = el('bracketTree'), heads = el('bracketRounds');
  if (!view || !game.slot) { return false; }
  if (typeof played !== 'number') { played = game.slot.cup.index; }
  // Winning the cup has to be an ending. On the champion view this screen's
  // button goes back to the menu instead of kicking off the next season —
  // otherwise the child lifts the trophy and is immediately playing again,
  // which reads as the win not having counted.
  bracketFinal = played >= Tournament.COUNT;
  el('roundGo').textContent = bracketFinal ? '\u{1F3E0}' : '▶';
  // On the champion view the main button already goes home; a second one
  // beside it would just be two ways to do the same thing.
  el('bracketBack').classList.toggle('hidden', bracketFinal);
  var mine = game.slot.emoji || '⚽';
  var cols = Tournament.bracket(played, mine), c, i, cell, colEl, head;
  // The child's next opponent is the other half of their pair in this round.
  var foeRow = played < Tournament.COUNT ? (Tournament.youAt(cols, played) ^ 1) : -1;
  var foe = foeRow >= 0 ? cols[played][foeRow] : null;

  // The one thing they need off this screen is who they play next, so it is
  // stated once at full size; the draw behind it is context for that tie.
  el('tieMe').textContent = mine;
  el('tieMeName').textContent = game.slot.name || '';
  el('tieFoe').textContent = foe ? foe.flag : '\u{1F3C6}';
  el('tieFoeName').textContent = foe ? (Names.country(foe.flag) || '') : '';
  el('tieRound').textContent = foe ? Tournament.roundIcon(played) : '\u{1F389}';
  el('bracketCaption').textContent = foe ? 'Next match' : 'You won the cup!';

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
    heads.appendChild(head);
  }

  el('bracketTitle').textContent = game.slot.trophies
    ? '\u{1F3C6}×' + game.slot.trophies
    : '\u{1F3C6}';
  view.classList.remove('hidden');
  return true;
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
  if (!pips || !game.slot) { return; }
  pips.innerHTML = '';
  for (var i = 0; i < Tournament.COUNT; i++) {
    var p = document.createElement('i');
    p.className = 'pip' + (i < game.slot.cup.index ? ' done' : '');
    pips.appendChild(p);
  }
  var n = Math.min(12, game.slot.trophies);
  shelf.textContent = n ? new Array(n + 1).join('\u{1F3C6}') : '';
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
  var grid = el('statsGrid'), s = game.slot && game.slot.stats;
  if (!s) { return; }
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
      Maths.rating(game.slot.maths ? game.slot.maths.difficulty
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
  el('statsWho').textContent = (game.slot.emoji || '⚽') +
    (game.slot.name ? ' ' + game.slot.name : '');
  el('statsPanel').classList.remove('hidden');
}

el('startStats').addEventListener('click', function () {
  if (!game.slot || !game.slot.emoji) { return; }
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
    var th = PITCH_THEMES[item.id] || PITCH_THEMES.day;
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
  if (item.cup) { return (game.slot.trophies || 0) / item.cup; }
  return (game.slot.stats.correct || 0) / item.at;
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
          ? '\u{1F3C6} ' + (game.slot.trophies || 0) + '/' + it.cup
          : (game.slot.stats.correct || 0) + '/' + it.at;
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
  if (!game.slot || !game.slot.emoji) { return; }
  el('lockerWho').textContent = (game.slot.emoji || '⚽') +
    (game.slot.name ? ' ' + game.slot.name : '');
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
  if (!wrap) { return; }
  var n = (game.slot && game.slot.emoji && game.slot.band > 0)
    ? Locker.next(game.slot) : null;
  if (!n) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  // Filled across this leg only (from the last milestone, not from zero), so
  // the next reward always looks reachable rather than a thousand answers away.
  paintCosmeticTile(el('nextUnlockArt'), Locker.byId(n.id),
    (game.slot.stats.correct - n.prev) / (n.at - n.prev));
}

// Wire the age row inside the team editor. Returns the band it starts on and
// reports every change back, so the caller keeps a single source of truth.
function paintAges(current, onPick) {
  var btns = el('teamAges').querySelectorAll('.ageBtn'), i;
  var band = (typeof current === 'number') ? current : Store.DEFAULT_BAND;

  function paint() {
    for (var k = 0; k < btns.length; k++) {
      var b = Number(btns[k].getAttribute('data-band'));
      btns[k].className = (b === band) ? 'ageBtn on' : 'ageBtn';
      // Echo the chosen button next to the cake, so the row is unmistakably
      // an age and the current answer is readable without hunting for it.
      if (b === band) { el('ageValue').textContent = btns[k].textContent; }
    }
  }
  for (i = 0; i < btns.length; i++) {
    (function (btn) {
      btn.onclick = function () {
        band = Number(btn.getAttribute('data-band'));
        paint();
        onPick(band);
        SFX.select();
      };
    })(btns[i]);
  }
  paint();
  return band;
}

// Starting is two questions, asked in that order: what kind of game, then who
// you are playing as. Putting both on one screen meant a child had to take in
// teams, cup progress and trophies before knowing whether any of it applied to
// what they wanted to do.
//
// A single match changes no cup progress and never opens the draw; the cup does
// both. Everything else — age, adaptive state, badge — comes from the active
// team either way, so neither mode needs a settings screen behind it.
//
// The boot sequence never calls restart(), so game.state stays 'START' — which
// blocks the pointerdown handler — until `startGo` fires.
function showStep(step) {
  el('modeStep').classList.toggle('hidden', step !== 'mode');
  el('teamStep').classList.toggle('hidden', step !== 'team');
  // Cup progress belongs to the cup. In a friendly it is noise.
  el('cupProgress').classList.toggle('hidden', game.mode !== 'cup');
}

function pickMode(mode) {
  SFX.unlock();
  game.mode = mode;
  refreshStart();
  showStep('team');
  // A first-time child has no team at all; go straight to making one rather
  // than showing them a row of empty slots to decipher.
  if (!game.slot || !game.slot.emoji) { openTeamEditor(); }
}

function startPlaying() {
  SFX.unlock();
  // An empty slot has nobody to play as. Make the team first.
  if (!game.slot || !game.slot.emoji) { openTeamEditor(); return; }
  game.mathsOn = game.slot.band > 0;
  game.startBand = game.slot.band > 0 ? game.slot.band : 1;
  game.maths = game.slot.maths || null;
  el('startScreen').classList.add('hidden');
  // A team entering the cup meets its next opponent on the draw, not by being
  // dropped straight onto the pitch.
  if (game.mode === 'cup') { showBracket(); } else { restart(); }
}

el('pickSingle').addEventListener('click', function () { pickMode('single'); });
el('pickCup').addEventListener('click', function () { pickMode('cup'); });
el('startBack').addEventListener('click', function () { SFX.select(); showStep('mode'); });
el('startGo').addEventListener('click', startPlaying);

/* ---------- juice ---------- */
// Screen shake, a ball trail and a brief slow-motion on goals. None of it
// changes the rules; it exists because a hard collision that registers only as
// a number is a hard collision the child does not feel.
// Kept deliberately small. Shake should register a hard hit at the edge of
// vision, not make a child track a moving pitch while they are trying to aim.
const SHAKE_MAX = 3.5;
const SHAKE_HIT_THRESHOLD = 420;   // only genuinely heavy contact shakes at all
const SHAKE_GOAL = 3.5;

function addShake(amount) {
  game.shake = Math.min(SHAKE_MAX, game.shake + amount);
}

function updateJuice(dt) {
  game.shake *= Math.pow(0.0025, dt);          // decays in ~a fifth of a second
  if (game.shake < 0.05) game.shake = 0;
  if (game.slowmo > 0) game.slowmo = Math.max(0, game.slowmo - dt);

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
  const id = game.slot && game.slot.equipped && game.slot.equipped[kind];
  return (id && Locker.byId(id)) ? id : COSMETIC_DEFAULTS[kind];
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
// at a glance without any label - and is never mistaken for a draggable
// blue player.
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
  if (game.pendingSaveX !== null && game.pendingSaveX !== undefined) {
    ctx.beginPath();
    ctx.arc(game.pendingSaveX, BOT_Y, 13 + 5 * pulse, 0, 6.29);
    ctx.strokeStyle = 'rgba(255,64,64,0.95)';
    ctx.lineWidth = 4; ctx.stroke();
  }
  ctx.restore();
}

function drawKeeper(p) {
  const kit = KEEPER_KIT[p.team] || KEEPER_KIT.human;

  ctx.beginPath();
  ctx.ellipse(p.x + 3, p.y + 4, p.r, p.r * 0.92, 0, 0, 6.29);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();

  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.29);
  ctx.fillStyle = kit.body; ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = kit.edge; ctx.stroke();

  ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.45, 0, 6.29);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.45, 0, 6.29);
  ctx.lineWidth = 2; ctx.strokeStyle = kit.edge; ctx.stroke();

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
  let sx = 0, sy = 0;
  if (game.shake > 0) {
    sx = (Math.random() * 2 - 1) * game.shake;
    sy = (Math.random() * 2 - 1) * game.shake;
    ctx.save();
    ctx.translate(sx, sy);
  }
  drawPitch();
  for (const k of game.keepers) drawKeeper(k);
  drawThreat(t);
  for (const p of game.players) drawPlayer(p, t);
  drawTrail();
  drawBall(game.ball);
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

  if (game.state === 'AI_WAIT') {
    game.timer -= dt;
    if (game.timer <= 0) aiLaunch();
  } else if (game.state === 'GOAL_PAUSE') {
    game.timer -= dt;
    if (game.timer <= 0) afterGoal();
  } else if (game.state === 'MOVING') {
    acc += dt * (game.slowmo > 0 ? 0.35 : 1);
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

  keeperReact(dt);
  updateJuice(dt);
  updateParticles(dt);
  draw(now / 1000);
  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
// The pitch renders immediately (as a static backdrop, same trick the win
// overlay already relies on) but nothing is playable: game.state stays
// 'START' until the start screen's Play button calls restart().
init();
loadProgress();
// After loadProgress, not before: the start-screen block runs at parse time,
// when game.slot is still null and there is nothing to paint.
refreshStart();
showStep('mode');
fitCanvas();
requestAnimationFrame(frame);
