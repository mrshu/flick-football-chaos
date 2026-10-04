'use strict';
// Exercise real question callbacks, pointer input, sizing and turn transitions.
// Browser surfaces are stubbed; streak helpers and persistence are unchanged.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var Bonuses = require('./bonuses.js');
var Store = require('./store.js');
var Tournament = require('./tournament.js');
var checks = 0;
function ok(condition, message) { checks++; assert.ok(condition, message); }
function eq(actual, expected, message) { checks++; assert.strictEqual(actual, expected, message); }
function deep(actual, expected, message) {
  checks++;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)),
    JSON.parse(JSON.stringify(expected)), message);
}
function near(actual, expected, message) {
  checks++;
  assert.ok(Math.abs(actual - expected) < 1e-7, message);
}
function noop() {}
function classes() {
  var values = new Set();
  return {
    add: function (value) { values.add(value); },
    remove: function (value) { values.delete(value); },
    contains: function (value) { return values.has(value); },
    toggle: function (value, force) {
      var add = force === undefined ? !values.has(value) : !!force;
      if (add) { values.add(value); } else { values.delete(value); }
      return add;
    }
  };
}
var drawing = new Proxy({}, { get: function (target, key) {
  return key in target ? target[key] : noop;
} });
function node() {
  return {
    style: {}, classList: classes(), listeners: {}, textContent: '',
    addEventListener: function (type, callback) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(callback);
    },
    dispatch: function (type, event) {
      (this.listeners[type] || []).forEach(function (callback) { callback(event || {}); });
    },
    getContext: function () { return drawing; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 600, height: 900 }; },
    setPointerCapture: noop
  };
}
var nodes = {};
function el(id) { return nodes[id] || (nodes[id] = node()); }
var quizCalls = [];
var seed = 7;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
var testMath = Object.create(Math);
testMath.random = random;
var context = vm.createContext({
  console: console, Math: testMath, setTimeout: noop, clearTimeout: noop,
  requestAnimationFrame: noop, performance: { now: function () { return 1000; } },
  window: { addEventListener: noop },
  document: { getElementById: el, addEventListener: noop, body: node() },
  Bonuses: Bonuses, Store: Store, Tournament: Tournament,
  Formation: require('./formation.js'), Maths: require('./maths.js'),
  Names: require('./names.js'), Flags: require('./flags.js'), Locker: require('./locker.js'),
  Quiz: {
    show: function (question, prize, answer, skip) {
      quizCalls.push({ question: question, prize: prize, answer: answer, skip: skip });
    },
    hide: noop
  }
});
var source = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
var boot = source.indexOf('/* ---------- boot ---------- */');
assert.ok(boot > 0, 'game boot marker exists');
vm.runInContext(source.slice(0, boot), context, { filename: 'game.js' });
var api = vm.runInContext('({ game, init, recordAnswer, applyStreakPowers, consumeStreakPowers, ' +
  'isBonusActive, startTurn, restart, finishQuestion, askQuestion, askSaveQuestion, settle, ' +
  'goalScored, afterGoal, drawAim, clearModifier, pickBonus, computeAiShot, pickAiPlayer })', context);
vm.runInContext('var streakGuideCalls = 0; var originalStreakGuide = drawCoachingLine; ' +
  'drawCoachingLine = function () { streakGuideCalls++; return originalStreakGuide.apply(null, arguments); };', context);
function guideCalls() { return vm.runInContext('streakGuideCalls', context); }
var game = api.game;
function fixture() {
  seed = 7; testMath.random = random;
  api.init(); api.clearModifier();
  var positions = [[120, 650], [300, 600], [470, 700], [130, 250], [300, 300], [470, 180]];
  game.players.forEach(function (player, i) {
    player.x = positions[i][0]; player.y = positions[i][1]; player.home = positions[i].slice();
  });
  game.state = 'HUMAN_AIM'; game.mover = 'human'; game.mathsOn = true;
  game.slot = Store.emptySlot(); game.save = Store.emptyState(); game.save.slots[0] = game.slot;
  game.maths = null; game.lastBonus = null;
  game.opponent = Tournament.opponentFor(0, 0, game.slot.band); game.aiSkill = game.opponent.skill;
  game.turnCount = 10; game.sinceChaos = 10; game.humanTurns = 10; game.nextQuestionTurn = 999;
  game.score.human = game.score.ai = 0; game.lastScorer = null;
  game.plannedAiShot = game.pendingAiShot = null; game.pendingSaveX = game.threatPath = null;
  quizCalls.length = 0;
}
function pointer(type, x, y) {
  el('game').dispatch(type, { clientX: x, clientY: y, pointerId: 1, preventDefault: noop });
}
function aim(player) {
  pointer('pointerdown', player.x, player.y);
  pointer('pointermove', player.x, player.y + 60);
}
function flick(player) {
  aim(player);
  pointer('pointerup', player.x, player.y + 60);
}
function snapshot(list) { return list.map(function (body) { return { x: body.x, y: body.y, r: body.r }; }); }
function allBodies() { return game.players.concat(game.keepers, [game.ball]); }
function powers(coach, big, small) {
  game.slot.streakPowers = { coach: coach, big: big, small: small };
  api.applyStreakPowers();
}

// Both actual quiz paths can award streak powers, including coincident refreshes.
[3, 5, 8, 15, 24, 40].forEach(function (threshold) {
  fixture();
  game.slot.stats.curStreak = threshold - 1;
  game.slot.streakPowers = { coach: 2, big: 2, small: 2 };
  api.askQuestion();
  eq(quizCalls.length, 1, 'streak ' + threshold + ' uses a real advertised bonus question');
  quizCalls[0].answer(true, 1500);
  eq(game.slot.stats.curStreak, threshold, 'a correct bonus answer advances the streak');
  var ids = Bonuses.streakRewards(threshold).map(function (reward) { return reward.id; });
  ['coach', 'big', 'small'].forEach(function (id) {
    eq(game.slot.streakPowers[id], ids.indexOf(id) >= 0 ? 3 : 2,
      'streak ' + threshold + ' refreshes only qualifying ' + id + ' charges');
  });
  eq(game.state === 'HUMAN_AIM' || game.state === 'HUMAN_SETUP', true,
    'a streak reward still lets the advertised football prize continue');
  ids.forEach(function (id) { ok(api.isBonusActive(id), 'new ' + id + ' power arms for the upcoming flick'); });
});
[5, 8].forEach(function (threshold) {
  fixture(); game.slot.stats.curStreak = threshold - 1;
  game.state = 'AI_SAVE_QUESTION'; game.mover = 'ai';
  game.aiChoice = api.pickAiPlayer();
  var shot = api.computeAiShot(), preview = JSON.stringify(shot.preview);
  game.pendingAiShot = shot; game.pendingSaveX = 300;
  var before = snapshot(game.players.concat([game.ball]));
  api.askSaveQuestion();
  eq(quizCalls[0].prize, 'save', 'streak milestone is answered through a real save callback');
  quizCalls[0].answer(true, 1500);
  eq(game.slot.stats.curStreak, threshold, 'a correct save answer advances the same streak');
  eq(game.slot.streakPowers[threshold === 5 ? 'big' : 'small'], 3,
    'a save earns three future size assists');
  deep(game.activeStreakPowers, [], 'future assists remain unarmed during the CPU shot');
  deep(snapshot(game.players.concat([game.ball])), before,
    'earning future size powers preserves queued-shot outfield and ball geometry');
  eq(JSON.stringify(shot.preview), preview, 'earning a size power preserves the cached CPU preview');
  eq(shot.player.vx, shot.vx, 'CPU playback preserves the queued horizontal velocity');
  eq(shot.player.vy, shot.vy, 'CPU playback preserves the queued vertical velocity');
});

fixture(); game.slot.stats.curStreak = 14;
game.slot.streakPowers = { coach: 3, big: 3, small: 2 };
api.recordAnswer(true, 1500);
deep(game.slot.streakPowers, { coach: 3, big: 3, small: 2 }, 'repeated milestones refresh without stacking');

// Wrong answers and skips preserve already paid charges; only wrong breaks the streak.
fixture(); powers(2, 2, 2); game.slot.stats.curStreak = 7;
api.askQuestion(); quizCalls[0].answer(false, 1500);
eq(game.slot.stats.curStreak, 0, 'a wrong bonus answer breaks the streak');
deep(game.slot.streakPowers, { coach: 2, big: 2, small: 2 }, 'a wrong answer does not revoke paid assists');
ok(api.isBonusActive('coach') && api.isBonusActive('big') && api.isBonusActive('small'),
  'paid assists remain armed after a wrong answer');
fixture(); powers(2, 2, 2); game.slot.stats.curStreak = 7;
api.askQuestion(); quizCalls[0].skip();
eq(game.slot.stats.curStreak, 7, 'skipping a bonus question preserves the streak');
eq(game.slot.stats.answered, 0, 'skipping does not record an answer');
deep(game.slot.streakPowers, { coach: 2, big: 2, small: 2 }, 'skipping a question spends no assist');
['wrong', 'skip'].forEach(function (answer) {
  fixture(); game.slot.stats.curStreak = 7;
  game.slot.streakPowers = { coach: 2, big: 2, small: 2 };
  game.state = 'AI_SAVE_QUESTION'; game.mover = 'ai'; game.aiChoice = api.pickAiPlayer();
  var shot = api.computeAiShot(); game.pendingAiShot = shot; game.pendingSaveX = 300;
  api.askSaveQuestion();
  if (answer === 'wrong') quizCalls[0].answer(false, 1500); else quizCalls[0].skip();
  eq(game.slot.stats.curStreak, answer === 'wrong' ? 0 : 7,
    'a ' + answer + ' save answer handles the shared streak consistently');
  deep(game.slot.streakPowers, { coach: 2, big: 2, small: 2 },
    'a ' + answer + ' save answer spends no human assist');
  deep(game.activeStreakPowers, [], 'a declined save does not arm human assists during CPU movement');
  eq(game.state, 'MOVING', 'a declined save resumes the original CPU shot');
  eq(shot.player.vx, shot.vx, 'a declined save preserves the queued CPU shot');
});

// A paid coaching line survives across football turns, including its last shot.
fixture(); powers(1, 0, 0);
var player = game.players[1], calls = guideCalls();
aim(player); api.drawAim();
eq(guideCalls(), calls + 1, 'paid coaching invokes the real coaching drawing while aiming');
pointer('pointerup', player.x, player.y + 60);
eq(game.slot.streakPowers.coach, 0, 'the last valid flick spends the last coaching charge');
ok(api.isBonusActive('coach'), 'the last coaching assist remains active for that shot');
eq(el('streakCoachCount').textContent, 'last flick', 'the final active shot has a visible last-flick label');
api.settle();
eq(game.state, 'AI_WAIT', 'the last paid flick gives the CPU its normal turn');
ok(!api.isBonusActive('coach'), 'coaching expires only after its paid shot settles');
game.mover = 'ai'; api.settle();
aim(game.players[1]); calls = guideCalls(); api.drawAim();
eq(guideCalls(), calls, 'no coaching line remains on the next unearned flick');
pointer('pointercancel', game.players[1].x, game.players[1].y);

// Real pointer interactions distinguish taps, cancelled drags and setup from shots.
fixture(); powers(3, 3, 3); player = game.players[1];
pointer('pointerdown', player.x, player.y); pointer('pointerup', player.x, player.y);
deep(game.slot.streakPowers, { coach: 3, big: 3, small: 3 }, 'a tap spends no paid flick');
aim(player); pointer('pointercancel', player.x, player.y + 60);
deep(game.slot.streakPowers, { coach: 3, big: 3, small: 3 }, 'a cancelled drag spends no paid flick');
api.finishQuestion(true, 'move');
pointer('pointerdown', game.players[0].x, game.players[0].y);
pointer('pointerup', game.players[0].x + 30, game.players[0].y);
eq(game.state, 'HUMAN_AIM', 'a legal setup completes before its football flick');
deep(game.slot.streakPowers, { coach: 3, big: 3, small: 3 }, 'repositioning spends no paid flick');
flick(game.players[1]);
deep(game.slot.streakPowers, { coach: 2, big: 2, small: 2 }, 'the subsequent actual shot spends every used assist');

// Growth charges are paid only when the chosen shooter actually grows.
fixture(); powers(2, 2, 2); var keeper = game.keepers[1];
flick(keeper);
eq(game.slot.streakPowers.big, 2, 'flicking the keeper preserves the unused growth charge');
eq(game.slot.streakPowers.coach, 1, 'the coaching assist still applies to a keeper flick');
eq(game.slot.streakPowers.small, 1, 'small defenders still apply to a keeper flick');
eq(keeper.r, 26, 'the human keeper always keeps its normal size');
fixture(); powers(2, 2, 2); player = game.players[0];
game.players[3].x = player.x + 26 + 26 + 1; game.players[3].y = player.y;
// Even a small defender must be inside the proposed grown-radius margin.
game.players[3].x = player.x + 26 + game.players[3].r + 1;
flick(player);
eq(player.r, 26, 'a crowded shooter keeps its normal size');
eq(game.slot.streakPowers.big, 2, 'an unsafe growth selection preserves its charge');
fixture(); powers(1, 1, 1); player = game.players[1]; flick(player);
eq(game.slot.streakPowers.big, 0, 'a genuinely grown striker spends its growth charge');
near(player.r, 26 * Bonuses.GROW, 'last growth charge keeps the larger radius during movement');
game.players.filter(function (p) { return p.team === 'ai'; }).forEach(function (p) {
  near(p.r, 26 * Bonuses.SHRINK, 'last tiny-defender charge keeps reduced collision geometry during movement');
});
api.settle();
game.players.forEach(function (p) { eq(p.r, 26, 'CPU planning sees restored ordinary player sizes'); });

// Restoring a tiny defender must not push the ball or the child's pieces.
fixture(); powers(0, 0, 1);
var red = game.players[4]; red.x = game.ball.x + red.r + game.ball.r; red.y = game.ball.y;
var protectedBodies = game.players.filter(function (p) { return p.team === 'human'; }).concat([game.ball]);
var protectedBefore = snapshot(protectedBodies);
flick(game.players[0]); api.settle();
deep(snapshot(protectedBodies), protectedBefore, 'size expiry leaves ball and blue positions untouched');
allBodies().concat(game.posts).forEach(function (body) {
  if (body !== red) ok(Math.hypot(body.x - red.x, body.y - red.y) >= body.r + red.r + 0.099,
    'restored defender has free space before CPU planning');
});

// An extra flick is a second paid opportunity, with no extra question or turn.
fixture(); powers(3, 3, 3); api.finishQuestion(true, 'second');
flick(game.players[1]); api.settle();
eq(game.state, 'HUMAN_AIM', 'second chance immediately re-arms the next human opportunity');
deep(game.slot.streakPowers, { coach: 2, big: 2, small: 2 }, 'first shot consumes one set of charges');
ok(api.isBonusActive('coach') && api.isBonusActive('big') && api.isBonusActive('small'),
  'all remaining assists re-arm for the extra flick');
flick(game.players[1]);
deep(game.slot.streakPowers, { coach: 1, big: 1, small: 1 }, 'the extra actual flick consumes another set of charges');
api.settle(); eq(game.state, 'AI_WAIT', 'two flicks still end with exactly one CPU response');
eq(quizCalls.length, 0, 'second chance adds no maths interruption');
fixture(); powers(1, 1, 1); api.finishQuestion(true, 'second');
flick(game.players[1]); api.settle();
eq(game.state, 'HUMAN_AIM', 'an extra flick still follows a final paid shot');
deep(game.activeStreakPowers, [], 'expired assists do not re-arm for the extra flick');
game.players.forEach(function (p) { eq(p.r, 26, 'the extra unearned flick has ordinary geometry'); });
flick(game.players[1]);
deep(game.slot.streakPowers, { coach: 0, big: 0, small: 0 }, 'the extra unearned flick cannot make charges negative');

// Kickoffs and match restarts preserve saved rewards, including sibling isolation.
['human', 'ai'].forEach(function (scorer) {
  fixture(); powers(3, 3, 3); flick(game.players[1]);
  api.goalScored(scorer); api.afterGoal();
  deep(game.slot.streakPowers, { coach: 2, big: 2, small: 2 }, scorer + ' goal retains unused assists');
  eq(game.state, scorer === 'human' ? 'AI_WAIT' : 'HUMAN_AIM', 'the conceding side still kicks off');
  if (scorer === 'ai') ok(api.isBonusActive('coach'), 'a human kickoff re-arms earned coaching');
  else game.players.forEach(function (p) { eq(p.r, 26, 'a CPU kickoff has ordinary player sizes'); });
});
fixture(); powers(2, 2, 2); game.slot.stats.curStreak = 9;
api.restart();
deep(game.slot.streakPowers, { coach: 2, big: 2, small: 2 }, 'restarting a match retains saved remaining charges');
eq(game.slot.stats.curStreak, 9, 'a restart does not break the saved answer streak');
ok(api.isBonusActive('coach'), 'restarting arms paid assists for the first human flick');
api.clearModifier(); game.slot = game.save.slots[1]; api.startTurn('human');
deep(game.activeStreakPowers, [], 'a sibling without rewards receives no assist');
deep(game.save.slots[0].streakPowers, { coach: 2, big: 2, small: 2 }, 'switching teams preserves the other sibling\'s rewards');

fixture(); game.slot.streakPowers = { coach: 3, big: 3, small: 3 };
game.mathsOn = false; api.restart();
deep(game.activeStreakPowers, [], 'no-maths mode arms no saved assist');
game.players.forEach(function (p) { eq(p.r, 26, 'no-maths kickoff keeps normal player sizes'); });
flick(game.players[1]);
deep(game.slot.streakPowers, { coach: 3, big: 3, small: 3 }, 'no-maths flicks preserve saved charges');

// Existing paid assists are omitted from one-shot offers; a single fallback is legal.
fixture(); powers(3, 3, 3);
var offered = new Set();
for (var i = 0; i < 80; i++) offered.add(api.pickBonus());
ok(!offered.has('coach') && !offered.has('big') && !offered.has('small'),
  'one-shot prize offers do not duplicate active saved assists');
ok(offered.has('second'), 'an extra flick remains available alongside all three paid assists');
game.ball.y = 60; game.keepers[0].y = 300;
game.players.forEach(function (p) { p.x = 100; p.y = 450; });
game.lastBonus = 'second';
eq(api.pickBonus(), 'second', 'the only useful prize remains selectable when it was last offered');

if (require.main === module) console.log(checks + ' game streak checks, 0 failures');
module.exports = { checks: checks };
