'use strict';
// Exercise opponent decisions, their real physics previews and shared question
// pacing. Browser surfaces are stubbed, while the game's production code runs
// unchanged in a VM. Counting simulations verifies bounded work without timing
// assertions that depend on the machine running the suite.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var Store = require('./store.js');
var Tournament = require('./tournament.js');
var checks = 0;
function ok(value, message) { checks++; assert.ok(value, message); }
function eq(actual, expected, message) {
  checks++; assert.strictEqual(actual, expected, message);
}
function deep(actual, expected, message) {
  checks++;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)),
    JSON.parse(JSON.stringify(expected)), message);
}
function noop() {}
function node() {
  return {
    style: {}, classList: { add: noop, remove: noop, toggle: noop,
      contains: function () { return false; } },
    addEventListener: noop, getContext: function () { return {}; },
    getBoundingClientRect: function () {
      return { left: 0, top: 0, width: 600, height: 900 };
    },
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
  Store: Store, Tournament: Tournament, Bonuses: require('./bonuses.js'),
  Formation: require('./formation.js'), Maths: require('./maths.js'),
  Names: require('./names.js'), Flags: require('./flags.js'),
  Locker: require('./locker.js'),
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
var api = vm.runInContext('({ game, init, restart, clearModifier, pickAiPlayer, ' +
  'computeAiShot, simulateAiShot, keeperReact, advanceBodies, resolveCollisions, ' +
  'allStopped, physicsStep, startTurn, worthABonus, askQuestion, askSaveQuestion, aiLaunch, ' +
  'get movers() { return movers; } })', context);
var game = api.game;
vm.runInContext('var opponentSimulationCalls = 0; ' +
  'var originalOpponentSimulation = simulateAiShot; ' +
  'simulateAiShot = function (shot) { opponentSimulationCalls++; ' +
  'return originalOpponentSimulation(shot); };', context);
function simulationCalls() { return vm.runInContext('opponentSimulationCalls', context); }
function resetCalls() { vm.runInContext('opponentSimulationCalls = 0', context); }

function fixture(scene, round, season, band) {
  testMath.random = random;
  seed = 1000 + (scene || 0);
  api.init();
  api.clearModifier();
  game.slot = Store.emptySlot(); game.slot.band = band || 3;
  game.save = Store.emptyState(); game.save.slots[0] = game.slot;
  game.opponent = Tournament.opponentFor(round || 0, season || 0, game.slot.band);
  game.aiSkill = game.opponent.skill;
  game.aiChoice = api.pickAiPlayer();
  game.plannedAiShot = null;
  game.state = 'AI_WAIT'; game.mover = 'ai'; game.mathsOn = true;
  game.maths = null; game.humanTurns = 0; game.nextQuestionTurn = 3;
  game.keeperDive = null; game.pendingAiShot = null;
  game.pendingSaveX = null; game.threatPath = null;
  game.score.human = game.score.ai = 0;
  game.lastHitSfx = 0; game.shake = 0;
  quizCalls.length = 0;
  resetCalls();
}

// The same seeded scenes and candidate streams measure actual goals, rather
// than merely checking that a tuning number rises through the cup.
var counts = [], scenes = 24, repetitions = 4;
for (var round = 0; round < Tournament.COUNT; round++) {
  var goals = 0;
  for (var scene = 0; scene < scenes; scene++) {
    for (var rep = 0; rep < repetitions; rep++) {
      fixture(scene, round);
      seed = 3000 + scene * 100 + rep;
      var shot = api.computeAiShot();
      ok(shot.player === game.aiChoice, 'planned shot uses the highlighted player');
      ok(simulationCalls() >= 1 && simulationCalls() <= game.opponent.shotAttempts,
        'the search respects its opponent simulation budget');
      if (shot.preview.scores) { goals++; }
    }
  }
  counts.push(goals);
}
ok(counts[0] < scenes * repetitions * 0.30, 'opening opponent remains imperfect');
for (round = 1; round < counts.length; round++) {
  ok(counts[round] > counts[round - 1], 'each cup round finds more scoring shots');
}
ok(counts[3] >= scenes * repetitions * 0.45,
  'the final presents a real scoring threat in the fixed kickoff corpus');
ok(counts[3] < scenes * repetitions * 0.95, 'the final still has missed opportunities');
ok(counts[3] - counts[0] >= scenes * repetitions * 0.25,
  'the final is materially more threatening than the opener');

// A planned shot and its preview must remain the same after the thinking
// animation: no second random shot, phantom collisions or preview side effects.
for (round = 0; round < Tournament.COUNT; round++) {
  fixture(12, round);
  seed = 824 + round;
  var before = JSON.stringify(game);
  shot = api.computeAiShot();
  eq(JSON.stringify(game), before, 'planning does not mutate the real game');
  var preview = api.simulateAiShot(shot);
  deep(shot.preview, preview, 'cached prediction agrees with the exact chosen shot');
  eq(JSON.stringify(game), before, 'replaying a preview does not mutate the game');
  ok(isFinite(preview.ballX) && isFinite(preview.ballY), 'prediction exposes a finite final position');
  ok(typeof preview.ownGoal === 'boolean', 'prediction distinguishes own goals');
  game.mathsOn = false; game.plannedAiShot = shot;
  api.aiLaunch();
  eq(shot.player.vx, shot.vx, 'launch preserves the planned horizontal velocity');
  eq(shot.player.vy, shot.vy, 'launch preserves the planned vertical velocity');
  eq(game.plannedAiShot, null, 'committing a plan clears it');
  for (var step = 0; step < 1080; step++) {
    api.physicsStep(1 / 120);
    if (game.state === 'GOAL_PAUSE' || api.allStopped(api.movers)) { break; }
  }
  eq(game.score.ai, preview.scores ? 1 : 0, 'actual playback matches the predicted CPU goal');
  eq(game.score.human, preview.ownGoal ? 1 : 0, 'actual playback matches the predicted own goal');
  ok(Math.abs(game.ball.x - preview.ballX) < 1e-7 &&
    Math.abs(game.ball.y - preview.ballY) < 1e-7,
  'actual playback reaches the same final ball position as the preview');
}

fixture(5, 3, 100, 11);
shot = api.computeAiShot();
ok(game.opponent.shotAttempts <= 18, 'the strongest repeat-season search remains bounded');
ok(simulationCalls() <= 18, 'strong opponents never exceed eighteen simulations');

fixture(0);
game.players.forEach(function (player, i) {
  player.x = i % 2 ? 530 : 70; player.y = 400 + i * 55;
});
var backwardsShooter = game.players.filter(function (player) { return player.team === 'ai'; })[0];
backwardsShooter.x = 300; backwardsShooter.y = 520;
game.keepers[0].x = 231;
preview = api.simulateAiShot({ player: backwardsShooter, vx: 0, vy: -1500 });
ok(preview.ownGoal && !preview.scores,
  'a backwards scoring hit is classified as an own goal, not useful progress');
ok(preview.ballY + game.ball.r < 72, 'own-goal prediction ends inside the correct net');

// Direct ball shots isolate the keeper from outfield congestion. Central
// distant shots should become harder; a fast, well-placed close corner remains
// a route to a goal against the final's keeper.
function humanGoal(round, shotY, targetX, speed, randomSeed) {
  fixture(0, round);
  seed = randomSeed;
  game.players.forEach(function (player, i) {
    player.x = i % 2 ? 530 : 70; player.y = 400 + i * 55;
  });
  game.state = 'MOVING'; game.mover = 'human';
  var b = game.ball;
  b.x = 300; b.y = shotY;
  var angle = Math.atan2(60 - shotY, targetX - 300);
  b.vx = Math.cos(angle) * speed; b.vy = Math.sin(angle) * speed;
  for (var i = 0; i < 1080; i++) {
    api.keeperReact(1 / 120);
    api.advanceBodies(api.movers, game.friction, 1 / 120);
    api.resolveCollisions(api.movers, b);
    if (b.y + b.r < 72) { return true; }
    if (api.allStopped(api.movers)) { break; }
  }
  return false;
}
var central = [], closeCorners = 0;
for (round = 0; round < Tournament.COUNT; round++) {
  goals = 0;
  for (rep = 0; rep < 32; rep++) {
    if (humanGoal(round, 450, 300, 1100, rep * 7919 + 20)) { goals++; }
  }
  central.push(goals);
}
for (round = 1; round < central.length; round++) {
  ok(central[round] <= central[round - 1], 'successive keepers concede fewer central shots');
}
ok(central[3] < central[0], 'the final keeper is visibly harder to beat');
for (rep = 0; rep < 32; rep++) {
  if (humanGoal(3, 230, rep % 2 ? 227 : 373, 1300, rep * 7919 + 20)) {
    closeCorners++;
  }
}
ok(closeCorners >= 24, 'accurate fast close corners still beat the final keeper');

// Maths has one cooldown shared by attacking bonuses and goalkeeper saves.
fixture(0);
testMath.random = function () { return 0; };
game.ball.y = 350;
api.startTurn('human');
eq(game.state, 'HUMAN_AIM', 'the first human turn starts with football');
api.startTurn('human');
eq(game.state, 'HUMAN_AIM', 'the second human turn starts with football');
api.startTurn('human');
eq(game.state, 'HUMAN_QUESTION', 'an eligible later attack can offer a bonus');
eq(quizCalls.length, 1, 'exactly one question was offered');
eq(game.nextQuestionTurn, 6, 'a question reserves two question-free human turns');
quizCalls[0].answer(false, 1000);
eq(game.state, 'HUMAN_AIM', 'a wrong answer still grants a normal flick');
api.startTurn('human'); api.startTurn('human');
eq(quizCalls.length, 1, 'intervening human turns do not ask again');
api.startTurn('human');
eq(quizCalls.length, 2, 'a later attack can ask once the shared gap has elapsed');
quizCalls[1].skip();
eq(game.state, 'HUMAN_AIM', 'skipping a bonus still grants a normal flick');
eq(game.nextQuestionTurn, game.humanTurns + 5, 'skipping adds four question-free human turns');

fixture(0);
game.humanTurns = 3; game.ball.y = 350;
testMath.random = function () { return 0.9; };
ok(!api.worthABonus(), 'even eligible attacks can continue without a question');
testMath.random = function () { return 0; };
game.ball.y = 600;
ok(!api.worthABonus(), 'defensive human turns do not offer attacking bonuses');

function scoringPlan() {
  // The plan itself must come from real search/physics. These deterministic
  // scenes contain enough opportunities that a final finds a goal quickly.
  for (var n = 0; n < 24; n++) {
    fixture(n, 3); seed = 3000 + n * 100;
    var plan = api.computeAiShot();
    if (plan.preview.scores) { return plan; }
  }
  assert.fail('fixed scene corpus contains a scoring CPU plan');
}
shot = scoringPlan();
testMath.random = function () { return 0; };
game.plannedAiShot = shot; game.humanTurns = 4; game.nextQuestionTurn = 5;
api.aiLaunch();
eq(game.state, 'MOVING', 'a real threat during the shared cooldown plays without maths');
eq(quizCalls.length, 0, 'cooldown prevents an intervening save question');
eq(shot.player.vx, shot.vx, 'an ungated threat uses its original plan');

shot = scoringPlan();
testMath.random = function () { return 0.9; };
game.plannedAiShot = shot; game.humanTurns = 5; game.nextQuestionTurn = 5;
api.aiLaunch();
eq(game.state, 'MOVING', 'eligible dangerous shots sometimes proceed without maths');
eq(quizCalls.length, 0, 'an eligible threat does not always demand a save question');

shot = scoringPlan();
testMath.random = function () { return 0; };
game.plannedAiShot = shot; game.humanTurns = 5; game.nextQuestionTurn = 5;
api.aiLaunch();
eq(game.state, 'AI_SAVE_QUESTION', 'an eligible threat can offer a save');
eq(game.pendingAiShot, shot, 'the save question keeps the exact threatened shot');
eq(game.nextQuestionTurn, 8, 'saves reserve the same cooldown as attacking bonuses');
quizCalls[0].skip();
eq(game.state, 'MOVING', 'skipping a save lets the exact threatened shot play');
eq(game.nextQuestionTurn, 10, 'skipping a save also extends the shared quiet period');
eq(shot.player.vx, shot.vx, 'skipping does not reroll horizontal shot velocity');
eq(shot.player.vy, shot.vy, 'skipping does not reroll vertical shot velocity');

game.humanTurns = 50; game.nextQuestionTurn = 99;
api.restart();
eq(game.humanTurns, 1, 'a restarted match begins with its first human turn');
eq(game.nextQuestionTurn, 3, 'a restarted match resets the opening quiet period');
eq(game.plannedAiShot, null, 'a restarted match discards a stale CPU plan');

if (require.main === module) {
  console.log('Opponent/pacing checks: ' + checks + ' passed.');
  console.log('Seeded cup goals: ' + counts.join('/') + ' of ' + (scenes * repetitions) +
    '; keeper central goals: ' + central.join('/') + ' of 32; close corners: ' + closeCorners + ' of 32.');
}
module.exports = { checks: checks };
