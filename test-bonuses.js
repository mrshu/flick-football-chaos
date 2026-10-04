'use strict';
var assert = require('assert');
var Bonuses = require('./bonuses.js');
var checks = 0;
function ok(condition, message) { checks++; assert.ok(condition, message); }
function near(actual, expected, message) {
  checks++; assert.ok(Math.abs(actual - expected) < 1e-6,
    message + ' (got ' + actual + ', want ' + expected + ')');
}
function eq(actual, expected, message) { checks++; assert.deepStrictEqual(actual, expected, message); }
function body(x, y, r) { return { x: x, y: y, r: r }; }
var bounds = { left: 0, right: 500, top: 0, bottom: 500 };
var right = { vx: 10, vy: 0 };

eq(Object.keys(Bonuses.DEFS).sort(), ['big', 'coach', 'feint', 'move', 'second', 'small'],
  'six helpful rewards are advertised');
Object.keys(Bonuses.DEFS).forEach(function (id) {
  ['glyph', 'name', 'hint', 'kind'].forEach(function (key) {
    ok(typeof Bonuses.DEFS[id][key] === 'string' && Bonuses.DEFS[id][key].length > 0,
      id + ' has ' + key);
  });
});
eq([Bonuses.SHRINK, Bonuses.GROW, Bonuses.MOVE_LIMIT], [0.62, 1.35, 85],
  'size and movement constants match the reward design');

var shooter = body(50, 250, 10), ball = body(150, 250, 5);
var g = Bonuses.guide(shooter, right, ball, [], bounds, 400);
eq(g.contact, { x: 135, y: 250 }, 'straight guide stops the striker at the ball surface');
ok(g.hitBall, 'straight guide contacts the ball first');
eq(g.ballEnd, { x: 330, y: 250 }, 'straight ball guide is capped at 180px');
eq([shooter, ball], [body(50, 250, 10), body(150, 250, 5)], 'guide leaves bodies unchanged');

g = Bonuses.guide(shooter, right, ball, [body(100, 250, 20)], bounds, 400);
eq(g.contact, { x: 70, y: 250 }, 'a defender blocks the first leg');
ok(!g.hitBall && g.ballEnd === null, 'a blocked striker has no outgoing ball prediction');
g = Bonuses.guide(shooter, right, ball, [], bounds, 50);
eq(g.contact, { x: 100, y: 250 }, 'short power limits first-leg travel');
ok(!g.hitBall && g.ballEnd === null, 'weak shot does not promise a ball hit');
g = Bonuses.guide(shooter, right, ball, [], bounds, 85);
ok(g.hitBall, 'contact exactly at the requested power limit counts as a hit');
g = Bonuses.guide(shooter, right, ball, [], bounds, 0);
eq(g.contact, { x: 50, y: 250 }, 'zero travel leaves the guide at the striker');
eq(Bonuses.guide(shooter, { vx: 0, vy: 0 }, ball, [], bounds), null,
  'a zero velocity has no guide');
eq(Bonuses.guide(shooter, { vx: NaN, vy: 2 }, ball, [], bounds), null,
  'invalid velocity has no guide');

var missBall = body(150, 350, 5);
g = Bonuses.guide(shooter, right, missBall, [], bounds, 1000);
eq(g.contact, { x: 490, y: 250 }, 'right wall is inset by striker radius');
ok(!g.hitBall, 'a ball off the first-leg ray is missed');
g = Bonuses.guide(shooter, { vx: -8, vy: 0 }, missBall, [], bounds, 1000);
eq(g.contact, { x: 10, y: 250 }, 'left wall is inset by striker radius');
g = Bonuses.guide(shooter, { vx: 0, vy: -8 }, missBall, [], bounds, 1000);
eq(g.contact, { x: 50, y: 10 }, 'top wall is inset by striker radius');
g = Bonuses.guide(shooter, { vx: 0, vy: 8 }, missBall, [], bounds, 1000);
eq(g.contact, { x: 50, y: 490 }, 'bottom wall is inset by striker radius');

var offCentreBall = body(150, 259, 5);
g = Bonuses.guide(shooter, right, offCentreBall, [], bounds, 400);
near(g.contact.x, 138, 'off-centre first contact uses expanded circle');
near(g.ballEnd.x, 294, 'off-centre ball follows collision normal x');
near(g.ballEnd.y, 367, 'off-centre ball follows collision normal y');
var tangentBall = body(150, 265, 5);
g = Bonuses.guide(shooter, right, tangentBall, [], bounds, 400);
eq(g.contact, { x: 150, y: 250 }, 'tangent guide reaches the single touching point');
ok(g.hitBall && g.ballEnd === null, 'tangency cannot promise outgoing ball travel');
g = Bonuses.guide(shooter, right, body(150, 265.01, 5), [], bounds, 400);
ok(!g.hitBall && g.ballEnd === null, 'a near-tangent miss is still a miss');

g = Bonuses.guide(shooter, right, ball, [body(250, 250, 10)], bounds, 400);
eq(g.ballEnd, { x: 235, y: 250 }, 'outgoing ball guide stops before a defender');
g = Bonuses.guide(body(350, 250, 10), right, body(450, 250, 5), [], bounds, 400);
eq(g.ballEnd, { x: 495, y: 250 }, 'outgoing ball stops at its own radius-adjusted wall');
g = Bonuses.guide(body(135, 250, 10), right, ball, [], bounds, 400);
ok(g.hitBall && g.contact.x === 135, 'a touching striker approaching the ball hits immediately');
g = Bonuses.guide(body(135, 250, 10), { vx: -1, vy: 0 }, ball, [], bounds, 400);
ok(!g.hitBall, 'a striker leaving the ball does not predict a hit');
g = Bonuses.guide(shooter, right, ball, [body(150, 250, 5)], bounds, 400);
ok(!g.hitBall, 'a tied blocker is conservative rather than promising a clean ball hit');

var player = body(250, 250, 10);
eq(Bonuses.moveTarget(player, { x: 300, y: 250 }, [player], [], bounds),
  { x: 300, y: 250 }, 'an unobstructed reposition ignores the selected player');
eq(Bonuses.moveTarget(player, { x: 450, y: 250 }, [], [], bounds),
  { x: 335, y: 250 }, 'a run is capped at 85px');
var corner = body(25, 25, 10);
eq(Bonuses.moveTarget(corner, { x: 0, y: 0 }, [], [], bounds),
  { x: 10, y: 10 }, 'pitch bounds keep the entire player inside');
eq(Bonuses.moveTarget(body(475, 475, 10), { x: 500, y: 500 }, [], [], bounds),
  { x: 490, y: 490 }, 'bottom and right reposition bounds are inset too');
var blocked = body(285, 250, 10);
eq(Bonuses.moveTarget(player, { x: 330, y: 250 }, [player, blocked], [], bounds),
  null, 'reposition cannot pass through a body even to a free endpoint');
eq(Bonuses.moveTarget(player, { x: 275, y: 250 }, [blocked], [], bounds),
  null, 'reposition cannot finish overlapping a body');
eq(Bonuses.moveTarget(player, { x: 330, y: 250 }, [], [body(285, 250, 3)], bounds),
  null, 'goal posts block the reposition path');
eq(Bonuses.moveTarget(player, { x: 330, y: 250 }, [body(285, 272, 10)], [], bounds),
  { x: 330, y: 250 }, 'a path can exactly clear the 2px margin');
eq(Bonuses.moveTarget(player, { x: 330, y: 250 }, [body(285, 271.9, 10)], [], bounds),
  null, 'a path must retain the entire 2px margin');
eq(Bonuses.moveTarget(player, { x: 250, y: 250 }, [body(260, 250, 10)], [], bounds),
  { x: 250, y: 250 }, 'same-position drop cancels even in a crowded start');
eq(Bonuses.moveTarget(player, { x: 220, y: 250 }, [body(270, 250, 10)], [], bounds),
  { x: 220, y: 250 }, 'a touching player can run away from its initial margin deficit');
eq(Bonuses.moveTarget(player, { x: 280, y: 250 }, [body(270, 250, 10)], [], bounds),
  null, 'a touching player cannot move toward or through its neighbour');
eq(Bonuses.moveTarget(player, { x: 220, y: 250 }, [body(269, 250, 10)], [], bounds),
  null, 'actual overlap does not permit a teleport');
eq(Bonuses.moveTarget(player, { x: 300, y: 250 }, [], [], bounds, 20),
  { x: 270, y: 250 }, 'the caller may lower the allowed run distance');
eq(Bonuses.moveTarget(player, { x: Infinity, y: 250 }, [], [], bounds),
  null, 'invalid requested points are rejected');
eq(player, body(250, 250, 10), 'reposition leaves its input player unchanged');

if (require.main === module) console.log(checks + ' bonus checks, 0 failures');
module.exports = { checks: checks };
