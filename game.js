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
  turnCount: 0, sinceChaos: 0, modifier: null,
  friction: BASE_FRICTION, powerMult: 1,
  pendingPrize: null,
  pendingAiShot: null, pendingSaveX: null,
  score: { human: 0, ai: 0 }, lastScorer: null,
  timer: 0, moveTime: 0, ballRot: 0,
  drag: null, aiChoice: null, askedLastTurn: false, threatPath: null,
  shake: 0, slowmo: 0, trail: [],
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
  addShake(SHAKE_MAX);
  game.slowmo = 0.55;   // a beat of slow motion so the goal lands
  game.trail.length = 0;
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
  ang += (Math.random() * 2 - 1) * 0.05; // aim error keeps the AI beatable
  const dist = Math.hypot(tx - p.x, ty - p.y);
  const power = Math.min(1, 0.6 + dist / 720 + Math.random() * 0.08);
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
  if (impact > 240) { addShake(Math.min(6, impact / 260)); }
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

el('again').addEventListener('click', () => { SFX.unlock(); restart(); });

// Start screen: age (and "no maths") is chosen once, before any football is
// playable. Play hides the overlay and starts the match; the boot sequence
// never calls restart() on its own, so game.state stays 'START' — which
// blocks the pointerdown handler — until this fires.
(function () {
  var screen = el('startScreen'), ageBtns = screen.querySelectorAll('.ageBtn'), playBtn = el('startPlay');
  var selectedBand = game.startBand, i;

  function paint() {
    for (var k = 0; k < ageBtns.length; k++) {
      var b = Number(ageBtns[k].getAttribute('data-band'));
      ageBtns[k].className = (b === selectedBand) ? 'ageBtn on' : 'ageBtn';
    }
  }
  paint();

  for (i = 0; i < ageBtns.length; i++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        selectedBand = Number(btn.getAttribute('data-band'));
        paint();
        SFX.select();
      });
    })(ageBtns[i]);
  }

  playBtn.addEventListener('click', function () {
    SFX.unlock();
    game.mathsOn = selectedBand > 0;
    game.startBand = selectedBand > 0 ? selectedBand : 1;
    game.maths = null;
    screen.classList.add('hidden');
    restart();
  });
})();

/* ---------- juice ---------- */
// Screen shake, a ball trail and a brief slow-motion on goals. None of it
// changes the rules; it exists because a hard collision that registers only as
// a number is a hard collision the child does not feel.
const SHAKE_MAX = 9;

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
fitCanvas();
requestAnimationFrame(frame);
