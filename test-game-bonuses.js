'use strict';
// Exercise the real game functions and registered pointer handlers. Only the
// browser surfaces are stubbed: reward geometry, turn flow, question callbacks,
// circle collisions, and the persistence schema are the production code.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var Bonuses = require('./bonuses.js');
var Store = require('./store.js');
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
function node() {
  return {
    style: {}, classList: classes(), listeners: {}, textContent: '',
    addEventListener: function (type, callback) {
      if (!this.listeners[type]) { this.listeners[type] = []; }
      this.listeners[type].push(callback);
    },
    dispatch: function (type, event) {
      (this.listeners[type] || []).forEach(function (callback) { callback(event || {}); });
    },
    getContext: function () { return {}; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 600, height: 900 }; },
    setPointerCapture: noop
  };
}
var nodes = {};
function el(id) { return nodes[id] || (nodes[id] = node()); }
var quizCalls = [];
var quiz = {
  show: function (question, prize, answer, skip) {
    quizCalls.push({ question: question, prize: prize, answer: answer, skip: skip });
  },
  hide: noop
};
var seed = 7;
function seededRandom() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
var testMath = Object.create(Math);
testMath.random = seededRandom;
var context = vm.createContext({
  console: console, Math: testMath, setTimeout: noop, clearTimeout: noop,
  requestAnimationFrame: noop, performance: { now: function () { return 1000; } },
  window: { addEventListener: noop },
  document: { getElementById: el, addEventListener: noop, body: node() },
  Bonuses: Bonuses, Store: Store, Quiz: quiz,
  Formation: require('./formation.js'), Maths: require('./maths.js'),
  Names: require('./names.js'), Flags: require('./flags.js'),
  Tournament: require('./tournament.js'), Locker: require('./locker.js')
});
var source = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
var boot = source.indexOf('/* ---------- boot ---------- */');
assert.ok(boot > 0, 'game boot marker exists');
vm.runInContext(source.slice(0, boot), context, { filename: 'game.js' });
var api = vm.runInContext('({ game, init, clearModifier, activateBonus, finishQuestion, askQuestion, ' +
  'growStriker, canGrow, pickBonus, keeperReact, collideCircles, settle, goalScored, afterGoal })', context);
var game = api.game;

// An open, deterministic formation makes every advertised advantage usable.
// Tests that need congestion change only the relevant body's coordinates.
function fixture() {
  testMath.random = seededRandom;
  api.init();
  api.clearModifier();
  var positions = [[120, 650], [300, 600], [470, 700],
                   [130, 250], [300, 300], [470, 180]];
  game.players.forEach(function (player, i) {
    player.x = positions[i][0]; player.y = positions[i][1];
    player.home = positions[i].slice();
  });
  game.state = 'HUMAN_AIM';
  game.mover = 'human'; game.mathsOn = true;
  game.lastBonus = null; game.maths = null;
  game.score.human = game.score.ai = 0;
  game.turnCount = 10; game.sinceChaos = 10;
  game.slot = Store.emptySlot();
  game.save = Store.emptyState(); game.save.slots[0] = game.slot;
  quizCalls.length = 0;
}
function movers() { return game.players.concat(game.keepers, [game.ball]); }
function snapshot(list) {
  return list.map(function (body) {
    return { x: body.x, y: body.y, r: body.r, vx: body.vx, vy: body.vy };
  });
}
function positions(list) { return list.map(function (body) { return [body.x, body.y]; }); }
function pointer(type, x, y) {
  el('game').dispatch(type, { clientX: x, clientY: y, pointerId: 1, preventDefault: noop });
}
function flick(player) {
  pointer('pointerdown', player.x, player.y);
  pointer('pointermove', player.x, player.y + 60);
  pointer('pointerup', player.x, player.y + 60);
}

fixture();
var before = snapshot(movers());
api.finishQuestion(true, 'small');
game.players.forEach(function (player, i) {
  near(player.r, player.team === 'ai' ? 26 * Bonuses.SHRINK : 26,
    'Tiny defenders changes only red outfield radii');
  eq(player.x, before[i].x, 'shrinking does not reposition players');
  eq(player.y, before[i].y, 'shrinking keeps their vertical positions');
});
deep(game.keepers.map(function (keeper) { return keeper.r; }), [26, 26],
  'both keepers retain their ordinary size');
eq(game.ball.r, 13, 'Tiny defenders leaves the ball unchanged');
api.clearModifier();
deep(snapshot(movers()), before, 'clearing Tiny defenders restores normal body geometry');
eq(game.bonus, null, 'clearing removes the active reward');

// Restoring a defender must not leave the CPU aiming from overlapping bodies
// or expand a defender through the ball, blue pieces, posts, or pitch walls.
function restoredDefendersAreClear(message) {
  var obstacles = movers().concat(game.posts);
  game.players.filter(function (player) { return player.team === 'ai'; }).forEach(function (player) {
    eq(player.r, 26, message + ': defender returns to its ordinary radius');
    ok(player.x - player.r >= 22 && player.x + player.r <= 578 &&
      player.y - player.r >= 72 && player.y + player.r <= 828,
      message + ': restored defender fits entirely inside the pitch');
    obstacles.forEach(function (other) {
      if (other !== player) {
        ok(Math.hypot(player.x - other.x, player.y - other.y) >= player.r + other.r,
          message + ': restored defender clears every body and post');
      }
    });
  });
  ok(game.players.includes(game.aiChoice) && game.aiChoice.team === 'ai',
    message + ': CPU chooses a restored outfielder');
  ok(obstacles.every(function (other) {
    return other === game.aiChoice || Math.hypot(game.aiChoice.x - other.x,
      game.aiChoice.y - other.y) >= game.aiChoice.r + other.r;
  }), message + ': CPU choice sees legal positions before launching');
}

fixture();
api.finishQuestion(true, 'small');
var tinyDefender = game.players[3];
game.ball.x = tinyDefender.x; game.ball.y = tinyDefender.y + 30;
ok(Math.hypot(tinyDefender.x - game.ball.x, tinyDefender.y - game.ball.y) >=
  tinyDefender.r + game.ball.r, 'the 30px tiny-defender fixture starts without overlap');
var fixedBodies = game.players.filter(function (player) { return player.team === 'human'; })
  .concat(game.keepers, [game.ball]);
before = snapshot(fixedBodies);
game.state = 'MOVING';
api.settle();
eq(game.state, 'AI_WAIT', 'Tiny defenders ends before the CPU aims');
deep(snapshot(fixedBodies), before, 'restoration preserves the ball, blue pieces, and both keepers');
restoredDefendersAreClear('ball-adjacent restoration');

fixture();
api.finishQuestion(true, 'small');
// The first two tiny defenders fit against the left wall and clear each other.
// The third clears a goal post at its small size but needs space when restored.
game.players[3].x = 22 + game.players[3].r; game.players[3].y = 250;
game.players[4].x = 22 + game.players[4].r; game.players[4].y = 285;
game.players[5].x = 215; game.players[5].y = 98;
game.ball.x = 70; game.ball.y = 250;
fixedBodies = game.players.filter(function (player) { return player.team === 'human'; })
  .concat(game.keepers, [game.ball]);
before = snapshot(fixedBodies);
game.state = 'MOVING';
api.settle();
deep(snapshot(fixedBodies), before, 'crowded restoration moves only the red defenders');
restoredDefendersAreClear('boundary and post restoration');
ok(movers().every(function (body) { return body.vx === 0 && body.vy === 0; }),
  'restoration creates no synthetic launch velocity');

fixture();
api.finishQuestion(true, 'big');
var initialBig = game.bigStriker;
ok(initialBig && initialBig.team === 'human', 'Big striker initially picks an eligible blue outfielder');
near(initialBig.r, 26 * Bonuses.GROW, 'initially selected striker grows');
var selected = game.players[0];
pointer('pointerdown', selected.x, selected.y);
eq(game.bigStriker, selected, 'selecting another blue outfielder transfers Big striker');
near(selected.r, 26 * Bonuses.GROW, 'selected outfielder gets the larger contact circle');
eq(initialBig.r, 26, 'switching restores the previous striker');
pointer('pointercancel', selected.x, selected.y);
eq(game.state, 'HUMAN_AIM', 'cancelled aiming retains the reward');
selected = game.players[2];
pointer('pointerdown', selected.x, selected.y);
eq(game.bigStriker, selected, 'Big striker can be transferred again before launching');
pointer('pointercancel', selected.x, selected.y);
var keeper = game.keepers[1];
pointer('pointerdown', keeper.x, keeper.y);
eq(keeper.r, 26, 'Big striker never grows the human keeper');
eq(game.bigStriker, null, 'selecting the keeper restores the previous outfielder');
eq(selected.r, 26, 'a keeper flick does not leave an unrelated large striker');
pointer('pointercancel', keeper.x, keeper.y);
selected = game.players[0];
game.players[3].x = selected.x + 55; game.players[3].y = selected.y;
pointer('pointerdown', selected.x, selected.y);
eq(selected.r, 26, 'a striker blocked by a neighbour cannot grow through it');
eq(game.bigStriker, null, 'unsafe growth does not retain a grown selection');
pointer('pointercancel', selected.x, selected.y);
game.players[3].x = 130; game.players[3].y = 250;
selected.x = 49;
pointer('pointerdown', selected.x, selected.y);
eq(selected.r, 26, 'growth respects the pitch boundary');
pointer('pointercancel', selected.x, selected.y);
api.clearModifier();
ok(game.players.every(function (player) { return player.r === 26; }),
  'clearing Big striker restores every outfielder');

fixture();
api.finishQuestion(true, 'feint');
game.state = 'MOVING';
game.ball.x = 250; game.ball.y = 350; game.ball.vy = -300;
var redKeeper = game.keepers[0];
var keeperPosition = [redKeeper.x, redKeeper.y];
game.keeperDive = { x: 240, wait: 0 };
api.keeperReact(0.5);
deep([redKeeper.x, redKeeper.y], keeperPosition, 'Feint prevents automatic keeper movement');
eq(game.keeperDive, null, 'Feint cancels an existing automatic dive');
game.ball.x = redKeeper.x; game.ball.y = redKeeper.y + redKeeper.r + game.ball.r - 1;
api.collideCircles(redKeeper, game.ball);
ok(game.ball.vy > -300, 'the feinted keeper still blocks the ball through normal collisions');
ok(redKeeper.vy < 0, 'Feint retains the keeper as a real movable physics body');
api.clearModifier();
game.ball.x = 250; game.ball.y = 350; game.ball.vx = 0; game.ball.vy = -300;
game.keeperDive = { x: 240, wait: 0 };
api.keeperReact(0.2);
ok(redKeeper.x < keeperPosition[0], 'keeper reactions resume after the reward clears');

fixture();
api.finishQuestion(true, 'second');
eq(game.extraFlicks, 1, 'Second chance grants exactly one following flick');
flick(game.players[0]);
eq(game.state, 'MOVING', 'the first Second chance flick launches normally');
game.players[0].x += 30; game.ball.x += 25;
var settledPositions = positions(movers());
api.settle();
eq(game.state, 'HUMAN_AIM', 'settling gives the child their earned follow-up');
eq(game.turnCount, 10, 'the follow-up does not increment the turn counter');
eq(quizCalls.length, 0, 'the follow-up does not ask another question');
deep(positions(movers()), settledPositions, 'Second chance preserves the resulting positions');
ok(movers().every(function (body) { return body.vx === 0 && body.vy === 0; }),
  'all bodies settle before the follow-up');
eq(game.extraFlicks, 0, 'the following flick cannot chain another extra flick');
eq(game.bonus, null, 'the original reward is cleared before the follow-up');
flick(game.players[0]);
api.settle();
eq(game.state, 'AI_WAIT', 'settling the following flick hands play to the CPU');
eq(game.turnCount, 11, 'the CPU turn increments the normal counter once');
eq(quizCalls.length, 0, 'neither Second chance flick asks a further quiz');

['human', 'ai'].forEach(function (scorer) {
  fixture();
  api.finishQuestion(true, 'second');
  game.state = 'MOVING';
  api.goalScored(scorer);
  eq(game.state, 'GOAL_PAUSE', scorer + ' goal pauses play normally');
  eq(game.extraFlicks, 0, scorer + ' goal cancels the extra flick immediately');
  game.mathsOn = false;
  api.afterGoal();
  eq(game.bonus, null, scorer + ' goal clears the reward before kickoff');
  eq(game.turnCount, 11, scorer + ' goal resumes with a normal new turn');
});

fixture();
api.askQuestion();
var advertised = quizCalls[0];
ok(!!Bonuses.DEFS[advertised.prize], 'questions advertise a helpful reward');
before = snapshot(movers());
advertised.answer(false, 1200);
eq(game.state, 'HUMAN_AIM', 'a wrong answer still allows a normal flick');
eq(game.bonus, null, 'a wrong answer grants no effect');
eq(game.slot.stats.answered, 1, 'wrong answers are recorded');
deep(snapshot(movers()), before, 'wrong answers do not change any body');
fixture();
api.askQuestion();
advertised = quizCalls[0];
var mathsBefore = JSON.stringify(game.maths);
before = snapshot(movers());
advertised.skip();
eq(game.state, 'HUMAN_AIM', 'skipping immediately allows a normal flick');
eq(game.bonus, null, 'skipping grants no effect');
eq(game.slot.stats.answered, 0, 'skipping is not recorded as an incorrect answer');
eq(JSON.stringify(game.maths), mathsBefore, 'skipping does not alter maths ability');
deep(snapshot(movers()), before, 'skipping does not change any body');
fixture();
api.askQuestion();
advertised = quizCalls[0];
advertised.answer(true, 1200);
eq(game.bonus, advertised.prize, 'a correct answer grants the exact advertised reward');
eq(game.slot.stats.correct, 1, 'earning a reward records the correct answer');

fixture();
api.finishQuestion(true, 'move');
eq(game.state, 'HUMAN_SETUP', 'Run into space opens positioning before the flick');
ok(!el('bonusAction').classList.contains('hidden'), 'setup exposes the normal-flick escape button');
selected = game.players[0];
var others = movers().filter(function (body) { return body !== selected; });
before = snapshot(others);
pointer('pointerdown', selected.x, selected.y);
pointer('pointermove', selected.x + 80, selected.y);
pointer('pointerup', selected.x + 80, selected.y);
deep([selected.x, selected.y], [200, 650], 'a clear setup drag moves the selected outfielder');
eq(game.state, 'HUMAN_AIM', 'valid setup returns to normal aiming');
eq(game.setup, null, 'a valid reposition consumes the one setup');
deep(snapshot(others), before, 'reposition changes no other body');
eq(selected.vx, 0, 'reposition does not launch the player');
ok(el('bonusAction').classList.contains('hidden'), 'setup escape button hides after a move');

fixture();
api.finishQuestion(true, 'move');
selected = game.players[0];
pointer('pointerdown', selected.x, selected.y);
pointer('pointermove', -1000, selected.y);
pointer('pointerup', -1000, selected.y);
eq(selected.x, 48, 'setup clamps a run against the radius-adjusted left boundary');
ok(120 - selected.x <= Bonuses.MOVE_LIMIT, 'boundary clamping retains the maximum run distance');
eq(game.state, 'HUMAN_AIM', 'a bounded valid move completes setup');

fixture();
api.finishQuestion(true, 'move');
selected = game.players[0];
game.players[3].x = 180; game.players[3].y = 650;
before = snapshot(movers());
pointer('pointerdown', selected.x, selected.y);
pointer('pointermove', selected.x + 120, selected.y);
eq(game.setup.target, null, 'a blocked route has no valid setup target');
pointer('pointerup', selected.x + 120, selected.y);
eq(game.state, 'HUMAN_SETUP', 'an invalid drop does not spend the positioning reward');
ok(!!game.setup, 'invalid positioning can be retried');
deep(snapshot(movers()), before, 'an invalid drop changes no body');
pointer('pointerdown', selected.x, selected.y);
pointer('pointermove', selected.x - 60, selected.y);
pointer('pointercancel', selected.x - 60, selected.y);
eq(game.setup.target, null, 'a cancelled pointer clears its uncommitted target');
deep(snapshot(movers()), before, 'a cancelled pointer commits no reposition');
el('bonusAction').dispatch('click');
eq(game.state, 'HUMAN_AIM', 'the normal-flick button cancels setup and returns to aiming');
eq(game.setup, null, 'cancelling setup removes the pending interaction');
deep(snapshot(movers()), before, 'cancelling setup leaves the formation unchanged');

fixture();
api.finishQuestion(true, 'move');
keeper = game.keepers[1];
pointer('pointerdown', keeper.x, keeper.y);
pointer('pointermove', keeper.x + 70, keeper.y);
pointer('pointerup', keeper.x + 70, keeper.y);
eq(game.setup.player, null, 'Run into space cannot select the keeper');
eq(game.state, 'HUMAN_SETUP', 'a keeper drag does not consume an outfield reposition');
pointer('pointerdown', game.players[3].x, game.players[3].y);
eq(game.setup.player, null, 'Run into space cannot select an opposing player');

fixture();
var offered = new Set();
for (var i = 0; i < 6; i++) {
  game.lastBonus = null;
  testMath.random = (function (n) { return function () { return (n + 0.5) / 6; }; }(i));
  offered.add(api.pickBonus());
}
deep(Array.from(offered).sort(), ['big', 'coach', 'feint', 'move', 'second', 'small'],
  'an open attacking opportunity can offer all six rewards');
testMath.random = seededRandom;
var last = null;
for (i = 0; i < 120; i++) {
  var id = api.pickBonus();
  ok(id !== last, 'successive rewards do not repeat');
  ok(!!Bonuses.DEFS[id], 'every offer belongs to the helpful reward catalogue');
  last = id;
}

fixture();
game.keepers[0].y = 300; // a keeper away from its line cannot dive along it
game.ball.y = 140;
game.players.filter(function (player) { return player.team === 'ai'; }).forEach(function (player) {
  player.y = 400; // every red defender is already behind the attacking ball
});
game.players.filter(function (player) { return player.team === 'human'; }).forEach(function (player) {
  player.x = 48; // normal bodies fit, but enlarged strikers cannot
});
offered = new Set();
for (i = 0; i < 80; i++) { offered.add(api.pickBonus()); }
ok(!offered.has('feint'), 'a keeper off its line is not advertised as a feint opportunity');
ok(!offered.has('small'), 'defenders behind the ball do not earn a useless shrink offer');
ok(!offered.has('big'), 'Big striker is not offered when no blue outfielder can grow safely');
game.players = game.players.filter(function (player) { return player.team === 'ai'; });
offered = new Set();
for (i = 0; i < 40; i++) { offered.add(api.pickBonus()); }
ok(!offered.has('move'), 'an outfield run is not offered with no eligible blue outfielder');
deep(Array.from(offered).sort(), ['coach', 'second'], 'unavailable situational rewards leave valid fallbacks');

// Touches land anywhere on a disc, not only its exact centre. Selecting near
// its edge must wait for a destination rather than spending the setup.
fixture();
api.finishQuestion(true, 'move');
var edgeSelected = game.players[0];
var edgeBefore = positions(movers());
pointer('pointerdown', edgeSelected.x + 15, edgeSelected.y);
pointer('pointerup', edgeSelected.x + 15, edgeSelected.y);
eq(game.state, 'HUMAN_SETUP', 'an off-centre tap only selects the setup player');
deep(positions(movers()), edgeBefore, 'an off-centre selection does not move any piece');
var tappedDestination = { x: edgeSelected.x + 65, y: edgeSelected.y };
pointer('pointerdown', tappedDestination.x, tappedDestination.y);
pointer('pointerup', tappedDestination.x, tappedDestination.y);
eq(game.state, 'HUMAN_AIM', 'a second tap at a destination finishes setup');
deep([edgeSelected.x, edgeSelected.y], [tappedDestination.x, tappedDestination.y],
  'tap placement commits the requested destination');

if (require.main === module) console.log(checks + ' game bonus integration checks, 0 failures');
module.exports = { checks: checks };
