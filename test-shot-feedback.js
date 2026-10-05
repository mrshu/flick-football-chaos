'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ShotFeedback = require('./shot-feedback.js');
var checks = 0;
function eq(actual, expected, message) { checks++; assert.strictEqual(actual, expected, message); }
function deep(actual, expected, message) { checks++; assert.deepStrictEqual(actual, expected, message); }
function ok(condition, message) { checks++; assert.ok(condition, message); }
var start = { x: 300, y: 450 }, same = { x: 300, y: 450 };
function strike(speed) { return { kind: 'ball', actor: 'shooter', speed: speed === undefined ? 500 : speed }; }
function impact(kind, before, after, onTarget, speed) {
  return { kind: kind, actor: 'ball', speed: speed === undefined ? 250 : speed,
    beforeBall: before, afterBall: after, onTarget: onTarget };
}
function ledger(events) {
  var state = ShotFeedback.create();
  events.forEach(function (event) { ShotFeedback.contact(state, event); });
  return state;
}
function outcome(events, end, goal) {
  return ShotFeedback.result(ledger(events), { startBall: start, endBall: end || same, goal: goal });
}
var forward = { vx: 0, vy: -500 }, reverse = { vx: 0, vy: 250 };
var stopped = { vx: 0, vy: 0 }, sideways = { vx: 450, vy: -120 };

deep(outcome([]), { id: 'miss', title: 'Missed the ball', tip: 'Aim your player at the ball.', icon: '\u2197' },
  'a flick with no ball touch or movement explains the genuine miss');
eq(outcome([], { x: 305, y: 450 }).id, 'miss', 'tiny final displacement does not suggest meaningful ball movement');
eq(outcome([], { x: 300, y: 350 }).id, 'upfield',
  'observed movement prevents a false miss even if an indirect contact was not reported');
eq(outcome([strike()], { x: 300, y: 350 }).title, 'Ball moved upfield', 'forward progress receives factual success feedback');
eq(outcome([strike()], { x: 370, y: 450 }).title, 'Ball in play', 'sideways movement is not called upfield');
eq(outcome([strike()], { x: 300, y: 550 }).title, 'Ball in play', 'backward movement is not praised as forward progress');
eq(outcome([strike()]).id, 'play', 'a touched ball that returns to its origin is not called a miss');
eq(outcome([strike()], { x: 300, y: 435 }).id, 'play', 'small progress does not receive exaggerated upfield praise');

var obstruction = { kind: 'defender', actor: 'shooter', speed: 200 };
eq(outcome([obstruction]).id, 'defender-before-ball', 'a defender struck before reaching a stationary ball explains the obstruction');
eq(outcome([obstruction]).title, 'Player hit a defender', 'before-ball copy states the observed contact without claiming a saved shot');
eq(outcome([obstruction, strike()], { x: 300, y: 300 }).id, 'upfield',
  'a striker that later reaches the ball is not permanently labelled blocked');
eq(outcome([obstruction], { x: 300, y: 300 }).id, 'upfield',
  'an indirect chain moving the ball overrides an earlier shooter obstruction');
['keeper', 'post', 'wall'].forEach(function (kind) {
  eq(outcome([{ kind: kind, actor: 'shooter', speed: 200 }]).id, kind + '-before-ball',
    'a genuine before-ball ' + kind + ' contact has distinct factual feedback');
  eq(outcome([strike(), { kind: kind, actor: 'shooter', speed: 200 }]).id, 'play',
    'a later shooter-to-' + kind + ' collision cannot describe the ball outcome');
});
eq(outcome([{ kind: 'defender', actor: 'ball', speed: 200 }]).id, 'miss',
  'a purported ball blocker before any ball strike cannot become a saved or blocked shot');
eq(outcome([{ kind: 'wall', actor: 'shooter', speed: 200 }, obstruction]).id, 'wall-before-ball',
  'the first actual before-ball obstruction retains its causal order');

// Positive impulse evidence is required. Stationary overlap, separation,
// invalid values and low-speed incidental brushes cannot invent a blocker.
[0, -100, NaN, Infinity, undefined, '200'].forEach(function (speed) {
  eq(outcome([{ kind: 'ball', speed: speed }]).id, 'miss', 'invalid ball impulse is not accepted as a strike');
  eq(outcome([strike(), { kind: 'keeper', actor: 'ball', speed: speed,
    beforeBall: forward, afterBall: stopped, onTarget: true }]).id, 'play',
    'invalid keeper impulse cannot claim a save');
});
eq(outcome([{ kind: 'defender', actor: 'shooter', speed: 3 }]).id, 'miss',
  'a weak brush before missing the ball does not blame a defender');
eq(outcome([strike(), impact('post', forward, reverse, true, 3)]).id, 'play',
  'a weak incidental post touch does not claim an off-the-post attempt');
eq(outcome([strike(), impact('keeper', forward, stopped, true, 3)]).id, 'play',
  'a weak incidental keeper touch does not claim a stop');
eq(outcome([strike(2)]).id, 'play', 'a small genuine ball impulse still prevents a false miss');
eq(outcome([null, {}, { kind: 'unknown', actor: 'shooter', speed: 100 }]).id, 'miss',
  'malformed events and unknown kinds contribute no evidence');
eq(outcome([strike(), { kind: 'keeper', speed: 200, beforeBall: forward, afterBall: stopped, onTarget: true }]).id,
  'play', 'a blocker without a known ball/shooter actor is not inferred');

eq(outcome([strike(), impact('keeper', forward, reverse, true)]).id, 'keeper-stopped',
  'a keeper reversing an on-target incoming shot explains the stop');
eq(outcome([strike(), impact('keeper', forward, stopped, true)]).title, 'Keeper stopped the shot',
  'a keeper stopping an on-target shot gets factual stop copy');
eq(outcome([strike(), impact('keeper', forward, sideways, true)]).title, 'Keeper deflected the shot',
  'a large turn is distinguished from completely stopping the ball');
eq(outcome([strike(), impact('keeper', forward, { vx: 0, vy: -200 }, true)]).title, 'Keeper slowed the shot',
  'a slowed ball still going goalward is not called stopped or saved');
eq(outcome([strike(), impact('keeper', forward, { vx: 0, vy: -470 }, true)]).id, 'keeper-contact',
  'a small change to an on-target ball remains a modest contact');
eq(outcome([strike(), impact('keeper', forward, stopped, false)]).title, 'Keeper got a touch',
  'keeper contact with an off-target ball is never automatically a save');
eq(outcome([strike(), impact('keeper', forward, stopped)]).id, 'keeper-contact',
  'a heading not confirmed on target receives modest contact copy');
eq(outcome([strike(), impact('keeper', { vx: 300, vy: 120 }, stopped, true)]).id, 'keeper-contact',
  'a ball heading away from the attacking goal cannot be a saved shot');
eq(outcome([strike(), impact('keeper', { vx: 100, vy: 0 }, stopped, true)]).id, 'keeper-contact',
  'a sideways-moving ball cannot be a saved goalward shot');
eq(outcome([strike(), impact('keeper', { vx: 0, vy: -5 }, stopped, true)]).id, 'keeper-contact',
  'an almost-stopped ball cannot become a dramatic keeper stop');
eq(outcome([strike(), impact('keeper', null, stopped, true)]).id, 'keeper-contact',
  'missing incoming velocity does not justify a save claim');
eq(outcome([strike(), impact('keeper', forward, { vx: NaN, vy: 0 }, true)]).id, 'keeper-contact',
  'invalid outgoing velocity does not justify a save claim');

eq(outcome([strike(), impact('defender', forward, stopped, true)]).id, 'defender-stopped',
  'an opposition defender actually stopping a goalward shot gets a qualified blocker outcome');
eq(outcome([strike(), impact('defender', forward, sideways, true)]).title, 'Defender deflected the shot',
  'a defender deflection is described without claiming a complete block');
eq(outcome([strike(), impact('defender', forward, reverse, false)]).title, 'Defender contact',
  'an off-target defender contact remains factual without a failure tip');
eq(outcome([strike(), impact('defender', forward, reverse, false)]).tip, '',
  'mere defender contact supplies no speculative coaching tip');

eq(outcome([strike(), impact('post', forward, reverse, true)]).id, 'post',
  'an actual ball-to-post impulse after the strike has its own outcome');
eq(outcome([strike(), impact('post', forward, reverse, true)]).tip, 'Aim a little inside the posts.',
  'an attacking post hit receives one short placement tip');
eq(outcome([strike(), impact('post', { vx: 0, vy: 400 }, forward, false)]).tip, '',
  'a post hit while travelling away from the attack goal does not give placement advice');
eq(outcome([strike(), impact('wall', forward, sideways, false)]).title, 'Off the wall',
  'a ball wall ricochet is factual rather than automatically an error');
eq(outcome([strike(), impact('wall', forward, sideways, false)]).tip, '',
  'a possibly deliberate bank shot receives no failure tip');

// Precedence follows meaningful evidence from the current strike, not the
// last body brushed in a pile-up or a stale attempt before a re-strike.
eq(outcome([strike(), impact('keeper', forward, stopped, true),
  impact('defender', { vx: 0, vy: -2 }, stopped, false, 2)]).id, 'keeper-stopped',
  'a later incidental defender brush cannot overwrite a genuine keeper stop');
eq(outcome([strike(), impact('post', forward, reverse, true),
  impact('keeper', forward, stopped, false)]).id, 'post',
  'post evidence beats a later off-target keeper touch');
eq(outcome([strike(), impact('defender', forward, sideways, false),
  impact('keeper', forward, stopped, true)]).id, 'keeper-stopped',
  'a qualified keeper stop beats a preceding unqualified defender contact');
eq(outcome([strike(), impact('wall', forward, sideways, false),
  impact('keeper', forward, stopped, true)]).id, 'keeper-stopped',
  'a bank off a wall does not hide the eventual qualified keeper stop');
eq(outcome([strike(), impact('keeper', forward, stopped, true),
  impact('defender', forward, stopped, true)]).id, 'keeper-stopped',
  'the first qualified change keeps precedence during a multi-body pile-up');
eq(outcome([strike(), impact('keeper', forward, stopped, true), strike()], { x: 300, y: 300 }).id, 'upfield',
  'a new meaningful ball strike clears the earlier stopped-attempt outcome');
eq(outcome([strike(), impact('keeper', forward, stopped, true), strike(2)]).id, 'keeper-stopped',
  'a tiny subsequent brush does not erase the earlier keeper evidence');
eq(outcome([strike(), impact('post', forward, reverse, true),
  { kind: 'ball', actor: 'ball', speed: 200 }], { x: 300, y: 300 }).id, 'upfield',
  'a meaningful indirect re-strike also starts a fresh attempt');

['human', 'ai', true].forEach(function (goal) {
  [[], [obstruction], [strike(), impact('post', forward, reverse, true)],
    [strike(), impact('keeper', forward, stopped, true)]].forEach(function (events) {
    eq(outcome(events, same, goal), null, 'a ' + goal + ' goal suppresses all ordinary shot feedback');
  });
});
eq(ShotFeedback.result(null, { goal: 'ai' }), null, 'own-goal celebration also wins when no ledger exists');
eq(ShotFeedback.result(null, { startBall: start, endBall: same }).id, 'play',
  'an absent ledger does not fabricate a miss from an unchanged position');
eq(ShotFeedback.result(ShotFeedback.create(), {}).id, 'play',
  'missing positions cannot support a no-movement claim');
eq(ShotFeedback.result(ShotFeedback.create(), { startBall: start, endBall: { x: NaN, y: 450 } }).id, 'play',
  'invalid positions receive safe neutral feedback');

var incoming = { vx: 0, vy: -500 }, outgoing = { vx: 0, vy: 0 };
var state = ledger([strike(), impact('keeper', incoming, outgoing, true)]);
incoming.vy = 100; outgoing.vy = -500;
eq(ShotFeedback.result(state, { startBall: start, endBall: same }).id, 'keeper-stopped',
  'evidence snapshots do not change when live body velocities later mutate');
var snapshot = JSON.stringify(state), options = { startBall: start, endBall: same };
var message = ShotFeedback.result(state, options);
message.title = 'changed by the caller';
eq(ShotFeedback.result(state, options).title, 'Keeper stopped the shot', 'each result returns independent display copy');
eq(JSON.stringify(state), snapshot, 'producing display feedback does not mutate the evidence');
deep(options, { startBall: start, endBall: same }, 'producing display feedback does not mutate input positions');
var separate = ShotFeedback.create();
eq(ShotFeedback.result(separate, options).id, 'miss', 'a new flick inherits no evidence from another ledger');
ok(separate.contacts !== state.contacts, 'ledgers own independent evidence arrays');

var browser = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'shot-feedback.js'), 'utf8'), browser);
eq(typeof browser.ShotFeedback.create, 'function', 'the standalone file exports its browser global');
eq(browser.ShotFeedback.result(browser.ShotFeedback.create(), { startBall: start, endBall: same }).id,
  'miss', 'browser and CommonJS run the same outcome classification');

if (require.main === module) console.log(checks + ' shot-feedback checks, 0 failures');
module.exports = { checks: checks };
