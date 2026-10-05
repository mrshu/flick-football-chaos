'use strict';
var assert = require('assert');
var Opponents = require('./opponents.js');
var checks = 0;
function ok(condition, message) { checks++; assert.ok(condition, message); }
function eq(actual, expected, message) { checks++; assert.deepStrictEqual(actual, expected, message); }
function near(actual, expected, message) {
  checks++; assert.ok(Math.abs(actual - expected) < 1e-8,
    message + ' (got ' + actual + ', want ' + expected + ')');
}
var g = {
  W: 600, H: 900, SIDE_L: 22, SIDE_R: 578, TOP_Y: 72, BOT_Y: 828,
  BACK_BOT: 882, MOUTH_L: 205, MOUTH_R: 395, BALL_R: 13, WALL_REST: 0.6
};
var ball = { x: 300, y: 450 }, keeper = { x: 330, r: 26 };
function middle() { return 0.5; }
function intent(id, attempt, b, k, bounds) {
  return Opponents.shotIntent(id, b || ball, k || keeper, bounds || g, attempt, middle);
}

eq(Object.keys(Opponents.STYLES).sort(), ['banker', 'builder', 'direct'], 'three football styles');
Object.keys(Opponents.STYLES).forEach(function (id) {
  var style = Opponents.STYLES[id];
  eq(style.id, id, 'catalog id matches its key');
  ['name', 'icon', 'hint', 'counterTip'].forEach(function (key) {
    ok(typeof style[key] === 'string' && style[key].length > 0, id + ' has visible ' + key);
  });
  ok(!('skill' in style) && !('shotAttempts' in style) && !('keeperSpeed' in style),
    'style descriptor does not modify numeric strength');
});
var seen = {};
['Rafa', 'Nico', 'Alex', 'Leon', 'Charlie', 'Sam', 'Tiago', 'Noor', 'Luka', 'Marco',
  'Amine', 'Ren', 'Jordan', 'Mateo', 'Min', 'Sasha'].forEach(function (name) {
  var style = Opponents.styleFor(name);
  eq(Opponents.styleFor(name), style, 'captain identity has a stable style');
  eq(Opponents.styleFor(' ' + name.toUpperCase() + ' '), style, 'normalised identity is stable');
  ok(Opponents.STYLES[style.id] === style, 'identity returns a catalog descriptor');
  seen[style.id] = true;
});
eq(Object.keys(seen).sort(), ['banker', 'builder', 'direct'], 'existing captains represent every style');
eq(Opponents.styleFor(null), Opponents.STYLES.direct, 'missing identity has a deterministic fallback');
var originalRandom = Math.random;
Math.random = function () { throw new Error('ambient randomness must not be used'); };
try {
  Opponents.styleFor('Rafa');
  Opponents.shotIntent('builder', ball, keeper, g, 0);
  ok(true, 'identity and omitted shot RNG never use ambient Math.random');
} finally { Math.random = originalRandom; }

var direct = intent('direct', 0);
eq(direct.kind, 'direct', 'direct attacker opens with a direct shot');
ok(direct.x < 300 && direct.x > g.MOUTH_L + g.BALL_R, 'direct shot aims away from right-side keeper');
ok(direct.y > g.BOT_Y + g.BALL_R, 'direct destination is fully inside the attacking goal');
eq(direct.powerScale, 1, 'direct intent adds no power');
var opposite = intent('direct', 0, ball, { x: 270, r: 26 });
near(opposite.x, 600 - direct.x, 'moving the keeper mirrors the open corner');
eq(intent('unknown', 0), direct, 'unknown style safely behaves as direct');

var builder = intent('builder', 0);
eq(builder.kind, 'build', 'even one search candidate shows the builder style');
ok(builder.y > ball.y && builder.y < g.BOT_Y - 150, 'builder advances without targeting the goal');
ok(Math.abs(builder.x - ball.x) > 40, 'builder changes the shooting lane diagonally');
ok(builder.powerScale > 0 && builder.powerScale < 1, 'builder deliberately makes a softer flick');
eq(intent('builder', 1).kind, 'direct', 'builder includes a scoring attempt in a two-candidate budget');
eq(intent('builder', 0, { x: 300, y: 760 }).kind, 'direct', 'builder takes a close-range finish');
var leftBuild = intent('builder', 0, { x: 170, y: 420 });
var rightBuild = intent('builder', 0, { x: 430, y: 420 });
near(leftBuild.x, 600 - rightBuild.x, 'builder diagonals mirror across the field');
near(leftBuild.y, rightBuild.y, 'builder progress does not favour one wing');

var bank = intent('banker', 0);
eq(bank.kind, 'bank', 'even one search candidate shows the bank specialist');
ok(bank.x > g.SIDE_R && bank.bankSide === 1, 'bank intent aims beyond the radius-adjusted right wall');
near(bank.bounce.x, g.SIDE_R - g.BALL_R, 'bank hits at the ball-centre wall position');
ok(bank.bounce.y > ball.y && bank.bounce.y <= g.BOT_Y - g.BALL_R,
  'bank reaches a side wall before the solid bottom boundary');
// The wall reverses/damps horizontal speed while vertical speed is retained.
var outgoingSlope = (bank.y - bank.bounce.y) / (direct.x - bank.bounce.x);
var incomingSlope = (bank.bounce.y - ball.y) / (bank.bounce.x - ball.x);
near(outgoingSlope, -incomingSlope / g.WALL_REST, 'virtual target compensates real horizontal bounce loss');
eq(intent('banker', 1).kind, 'direct', 'banker includes a direct attempt in a two-candidate budget');
eq(intent('banker', 2).bankSide, -1, 'third bank candidate explores the other wall');
eq(intent('banker', 0, { x: 300, y: 814 }).kind, 'direct', 'impossible late wall rebound falls back to direct');
eq(intent('banker', 0, { x: g.SIDE_R - g.BALL_R, y: 450 }).kind, 'direct',
  'ball already touching the proposed wall is not given an immediate bank');
var elastic = intent('banker', 0, ball, keeper, Object.assign({}, g, { WALL_REST: 1 }));
near(elastic.x, 2 * elastic.bounce.x - direct.x, 'elastic geometry reduces to the ordinary mirror target');

Object.keys(Opponents.STYLES).forEach(function (id) {
  for (var a = 0; a < 9; a++) {
    var choice = intent(id, a);
    ok(isFinite(choice.x) && isFinite(choice.y), id + ' has a finite target');
    ok(choice.powerScale > 0 && choice.powerScale <= 1, id + ' never raises the launch cap');
  }
  var malformed = Opponents.shotIntent(id, { x: NaN, y: Infinity }, { x: NaN }, {}, NaN,
    function () { return NaN; });
  ok(isFinite(malformed.x) && isFinite(malformed.y), id + ' has finite missing-data fallbacks');
  eq(Opponents.positionValue(id, { scores: true, ownGoal: false }, g), Infinity,
    id + ' prioritises every genuine goal');
  eq(Opponents.positionValue(id, { scores: true, ownGoal: true }, g), -Infinity,
    id + ' rejects own goals even with contradictory scoring metadata');
  eq(Opponents.positionValue(id, { ownGoal: true, ballX: 300, ballY: 900 }, g), -Infinity,
    id + ' cannot prefer an own goal to a settled position');
  eq(Opponents.positionValue(id, { ballX: NaN, ballY: 700 }, g), -Infinity,
    id + ' rejects invalid physics previews');
});

function preview(x, y) { return { ballX: x, ballY: y, path: [300, 450] }; }
var centre = preview(300, 620), diagonal = preview(390, 620), flank = preview(122, 620);
ok(Opponents.positionValue('direct', centre, g) > Opponents.positionValue('direct', diagonal, g),
  'direct attacker prefers the central route toward goal');
ok(Opponents.positionValue('builder', diagonal, g) > Opponents.positionValue('builder', centre, g),
  'builder prefers a changed interior lane at equal progress');
ok(Opponents.positionValue('banker', flank, g) > Opponents.positionValue('banker', centre, g),
  'banker values a flank from which another bank can be struck');
ok(Opponents.positionValue('banker', flank, g) > Opponents.positionValue('banker', preview(565, 620), g),
  'banker does not treat hugging a wall as a useful bank setup');
Object.keys(Opponents.STYLES).forEach(function (id) {
  ok(Opponents.positionValue(id, preview(300, 700), g) > Opponents.positionValue(id, preview(390, 350), g),
    id + ' values substantial forward progress over retreat');
});
var calls = 0;
Opponents.shotIntent('builder', ball, keeper, g, 0, function () { calls++; return 0.5; });
eq(calls, 2, 'intent sampling is bounded to two injected random draws');
var frozenBall = Object.freeze({ x: 300, y: 450 });
var frozenKeeper = Object.freeze({ x: 330, r: 26 });
Object.keys(Opponents.STYLES).forEach(function (id) {
  Opponents.shotIntent(id, frozenBall, frozenKeeper, Object.freeze(g), 0, middle);
  Opponents.positionValue(id, Object.freeze(preview(300, 620)), g);
});
ok(true, 'style decisions leave geometry and physics inputs unchanged');
if (require.main === module) console.log('Opponent styles: ' + checks + ' checks passed.');
module.exports = { checks: checks };
