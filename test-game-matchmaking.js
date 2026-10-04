'use strict';
// Test actual menu/intro buttons and the game's frame-driven local reveal.
// Only the DOM and drawing surfaces are stubbed; tournament data, turn flow,
// result persistence and recorded football profiles are production code.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var Store = require('./store.js');
var Tournament = require('./tournament.js');
var checks = 0;
function ok(condition, message) { checks++; assert.ok(condition, message); }
function eq(actual, expected, message) { checks++; assert.strictEqual(actual, expected, message); }
function deep(actual, expected, message) {
  checks++;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message);
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
      if (add) values.add(value); else values.delete(value);
      return add;
    }
  };
}
var drawing = new Proxy({}, { get: function (target, key) {
  if (key in target) return target[key];
  if (key === 'createRadialGradient' || key === 'createLinearGradient') return function () {
    return { addColorStop: noop };
  };
  if (key === 'measureText') return function () { return { width: 20 }; };
  return noop;
} });
function node(tag) {
  var attributes = {}, children = [], html = '', text = '';
  var result = {
    tagName: (tag || 'div').toUpperCase(), style: {}, classList: classes(), listeners: {},
    width: 56, height: 56, disabled: false, className: '',
    addEventListener: function (type, callback) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(callback);
    },
    // Deliberately dispatch disabled clicks too: the production listener must
    // reject early kickoff rather than trusting only the browser's disabled UI.
    dispatch: function (type, event) {
      (this.listeners[type] || []).forEach(function (callback) {
        callback(event || { preventDefault: noop, stopPropagation: noop });
      });
    },
    appendChild: function (child) { children.push(child); return child; },
    setAttribute: function (name, value) { attributes[name] = String(value); },
    getAttribute: function (name) { return attributes[name] === undefined ? null : attributes[name]; },
    querySelector: function (selector) {
      var child = children.find(function (entry) { return entry.tagName.toLowerCase() === selector; });
      if (!child) { child = node(selector); children.push(child); }
      return child;
    },
    querySelectorAll: function () { return []; },
    getContext: function () { return drawing; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 600, height: 900 }; },
    setPointerCapture: noop
  };
  Object.defineProperties(result, {
    children: { get: function () { return children; } },
    innerHTML: {
      get: function () { return html; },
      set: function (value) { html = value; children = []; }
    },
    textContent: {
      get: function () { return text; },
      set: function (value) { text = String(value); children = []; }
    }
  });
  return result;
}
var nodes = {};
function el(id) { return nodes[id] || (nodes[id] = node()); }
var seed = 31;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
var testMath = Object.create(Math); testMath.random = random;
var context = vm.createContext({
  console: console, Math: testMath, setTimeout: noop, clearTimeout: noop,
  requestAnimationFrame: noop, performance: { now: function () { return 1000; } },
  window: { addEventListener: noop },
  document: { getElementById: el, createElement: node, addEventListener: noop, body: node() },
  Store: Store, Tournament: Tournament, Bonuses: require('./bonuses.js'),
  Formation: require('./formation.js'), Maths: require('./maths.js'),
  Names: require('./names.js'), Flags: require('./flags.js'), Locker: require('./locker.js'),
  Quiz: { show: noop, hide: noop }
});
var source = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
var boot = source.indexOf('/* ---------- boot ---------- */');
assert.ok(boot > 0, 'game boot marker exists');
vm.runInContext(source.slice(0, boot), context, { filename: 'game.js' });
var api = vm.runInContext('({ game, init, clearModifier, configureOpponent, findOpponent, ' +
  'revealOpponent, startPlaying, showBracket, goalScored, afterGoal, frame })', context);
// Keep the frame's real state transitions while avoiding irrelevant pitch art.
vm.runInContext('draw = function () {};', context);
var game = api.game, frameTime = 1000;
function fixture(mode, index, season, band, emoji) {
  seed = 31; testMath.random = random;
  api.init(); api.clearModifier();
  game.slot = Store.emptySlot(); game.save = Store.emptyState(); game.save.slots[0] = game.slot;
  game.slot.emoji = emoji || '\u26BD'; game.slot.name = 'Home'; game.slot.band = band || 3;
  game.slot.cup = { index: index || 0, season: season || 0 };
  game.slot.stats.curStreak = 7; game.slot.stats.bestStreak = 7;
  game.slot.streakPowers = { coach: 2, big: 1, small: 3 };
  game.state = 'START'; game.mode = mode || 'single'; game.friendlyLevel = 1;
  game.mathsOn = true; game.maths = null; game.mover = 'human';
  game.matchOpponent = null; game.matchReady = false; game.wonCup = false;
  game.turnCount = 0; game.humanTurns = 0; game.nextQuestionTurn = 999;
  game.score.human = game.score.ai = 0; game.kickoffAt = 0; game.lastScorer = null;
  game.plannedAiShot = game.pendingAiShot = null; game.pendingSaveX = game.threatPath = null;
  game.particles = []; game.trail = []; game.shake = 0;
  frameTime = 1000; vm.runInContext('last = 1000; acc = 0; bracketFinal = false;', context);
  ['matchmaking', 'bracket', 'overlay'].forEach(function (id) { el(id).classList.add('hidden'); });
}
function advance(frames) {
  for (var i = 0; i < frames; i++) { frameTime += 100; api.frame(frameTime); }
}
function pointer(type, x, y) {
  el('game').dispatch(type, { clientX: x, clientY: y, pointerId: 1, preventDefault: noop });
}
function attemptFlick() {
  var player = game.players[1];
  pointer('pointerdown', player.x, player.y);
  pointer('pointermove', player.x, player.y + 60);
  pointer('pointerup', player.x, player.y + 60);
}
function kickoff() {
  if (!game.matchReady) advance(8);
  el('matchGo').dispatch('click');
}
function finish(winner) {
  game.score[winner] = 2;
  api.goalScored(winner); api.afterGoal();
}

// Menu selections affect the exact launched profile, independent of cup progress.
[1, 2, 3, 4].forEach(function (level) {
  fixture('single', 3, 6, 9);
  el('level' + level).dispatch('click');
  eq(game.friendlyLevel, level, 'the actual difficulty button selects level ' + level);
  eq(el('level' + level).getAttribute('aria-pressed'), 'true', 'chosen level has a pressed state');
  api.startPlaying();
  eq(game.state, 'MATCHMAKING', 'starting a friendly opens its reveal');
  var revealed = game.matchOpponent;
  eq(revealed.level, level, 'the chosen level appears on the revealed opponent');
  deep(revealed.profile, Tournament.opponentFor(level - 1, 0, 9), 'cup history cannot strengthen a friendly profile');
  eq(game.turnCount, 0, 'the reveal starts no football turns');
  eq(game.kickoffAt, 0, 'the reveal starts no match timer');
  ok(el('streakHud').classList.contains('hidden'), 'maths streak HUD is hidden while finding a rival');
  kickoff();
  eq(game.matchOpponent, revealed, 'kickoff preserves the exact revealed opponent object');
  eq(game.opponent, revealed.profile, 'kickoff launches the revealed football profile');
  eq(game.aiSkill, revealed.profile.skill, 'aiming uses the selected football profile');
  eq(game.state, 'HUMAN_AIM', 'kickoff starts the normal first human turn');
  eq(el('hudFoeName').textContent, revealed.name, 'the playing HUD displays the revealed captain');
  eq(el('hudFoeFlag').textContent, revealed.flag, 'the playing HUD displays the revealed flag');
  eq(el('hudFoeLevel').textContent, 'Level ' + level, 'the playing HUD displays the chosen level');
});

fixture(); api.startPlaying();
var revealed = game.matchOpponent;
eq(el('matchGo').disabled, true, 'kickoff is disabled while the local reveal is searching');
eq(el('matchFoeFlag').textContent, '?', 'searching does not prematurely show the selected flag');
el('matchGo').dispatch('click');
eq(game.state, 'MATCHMAKING', 'even a dispatched disabled kickoff is ignored');
eq(game.turnCount, 0, 'early kickoff starts no turns');
attemptFlick();
eq(game.state, 'MATCHMAKING', 'canvas input cannot start a shot during the introduction');
eq(game.drag, null, 'canvas input cannot select a live player during the introduction');
game.players.forEach(function (player) { eq(player.vx + player.vy, 0, 'intro input leaves players stationary'); });
advance(6);
eq(game.matchReady, false, 'the brief searching phase lasts before revealing');
advance(2);
eq(game.matchReady, true, 'the real frame loop completes the local reveal');
eq(game.state, 'MATCHMAKING', 'a completed reveal still waits for explicit kickoff');
eq(game.turnCount, 0, 'reading the revealed rival starts no football turn');
eq(el('matchGo').disabled, false, 'completed reveal enables kickoff');
eq(el('matchFoeName').textContent, revealed.name, 'completed reveal announces its selected captain');
eq(el('matchFoeFlag').textContent, revealed.flag, 'completed reveal announces its selected flag');
ok(el('streakHud').classList.contains('hidden'), 'the maths strip stays hidden while reading the opponent card');
attemptFlick();
eq(game.state, 'MATCHMAKING', 'the revealed introduction still blocks canvas flicks');
el('matchGo').dispatch('click');
eq(game.matchOpponent, revealed, 'explicit kickoff does not reroll the opponent');
ok(el('matchmaking').classList.contains('hidden'), 'kickoff dismisses the opponent card');
eq(game.turnCount, 1, 'explicit kickoff begins exactly one football turn');
var started = game.kickoffAt;
el('matchGo').dispatch('click');
eq(game.turnCount, 1, 'a repeated kickoff event cannot restart an active match');
eq(game.kickoffAt, started, 'a repeated kickoff event does not reset playing time');

// Back cancels the frame-driven reveal without touching earned progress.
['single', 'cup'].forEach(function (mode) {
  fixture(mode, 2, 1);
  var before = JSON.parse(JSON.stringify(game.slot));
  api.findOpponent();
  eq(game.matchReady, mode === 'cup', 'cups introduce the opponent already known from their draw');
  el('matchBack').dispatch('click');
  eq(game.state, 'START', 'Back returns to the team screen');
  eq(game.matchReady, false, 'Back clears introduction readiness');
  ok(el('matchmaking').classList.contains('hidden'), 'Back hides the matchmaking card');
  deep(game.slot, before, 'Back preserves cup, stats and all earned assists');
  advance(20);
  eq(game.state, 'START', 'a cancelled reveal never reopens or kicks off later');
  eq(game.matchReady, false, 'later frames cannot finish a cancelled reveal');
  el('matchGo').dispatch('click');
  eq(game.state, 'START', 'stale kickoff after cancellation is ignored');
  deep(game.slot, before, 'stale reveal events leave earned progress intact');
});

// Goals change formations and scores while preserving the identity/profile.
['human', 'ai'].forEach(function (scorer) {
  fixture(); api.findOpponent(); kickoff();
  var opponent = game.matchOpponent, profile = game.opponent;
  api.goalScored(scorer); api.afterGoal();
  eq(game.matchOpponent, opponent, 'a ' + scorer + ' goal keeps the active opponent identity');
  eq(game.opponent, profile, 'a ' + scorer + ' goal keeps the active football difficulty');
  eq(el('hudFoeName').textContent, opponent.name, 'the HUD retains the rival through the next kickoff');
  eq(el('hudFoeLevel').textContent, 'Level ' + opponent.level, 'the HUD retains the chosen level through goals');
});

// The cup header, reveal and pitch agree with the actual bracket and reserve.
for (var round = 0; round < 4; round++) {
  var identity = Tournament.matchFor('cup', 1, { index: round, season: 0 }, 3, '');
  [identity.flag, '\u26BD'].forEach(function (ownFlag) {
    fixture('cup', round, 1, 3, ownFlag);
    api.startPlaying();
    eq(game.state, 'START', 'entering the cup waits on the draw before preparing a match');
    var cols = Tournament.bracket(round, ownFlag);
    var foeFlag = cols[round][Tournament.youAt(cols, round) ^ 1].flag;
    eq(el('tieFoe').textContent, foeFlag, 'the next-match bracket card uses the resolved foe flag');
    eq(el('tieFoeName').textContent, Tournament.captainName(foeFlag), 'the bracket card uses that flag\'s fixed captain');
    eq(el('tieLevel').textContent.indexOf('Level ' + (round + 1)), 0, 'bracket card announces the current level');
    eq(el('bracketCaption').textContent, Tournament.roundName(round), 'the bracket names the current knockout round');
    el('roundGo').dispatch('click');
    eq(game.state, 'MATCHMAKING', 'the bracket kickoff opens its known-opponent introduction');
    eq(game.matchReady, true, 'the known cup opponent is introduced immediately');
    eq(game.matchOpponent.flag, foeFlag, 'cup introduction agrees with its actual bracket foe');
    eq(el('matchFoeName').textContent, el('tieFoeName').textContent, 'cup captain stays consistent between draw and intro');
    eq(game.matchOpponent.level, round + 1, 'cup introduction keeps the actual round\'s level');
    eq(game.matchOpponent.season, 2, 'cup introduction announces the actual season separately');
    kickoff();
    eq(el('hudFoeFlag').textContent, foeFlag, 'cup pitch keeps the bracket flag, including reserve swaps');
  });
}

fixture('cup', 0, 0); api.findOpponent(); kickoff();
var finished = game.matchOpponent, finishedProfile = game.opponent;
finish('human');
eq(game.slot.cup.index, 1, 'winning a cup match advances exactly one round');
eq(game.matchOpponent, finished, 'the result keeps the opponent actually beaten');
eq(game.opponent, finishedProfile, 'the result keeps the completed football profile');
eq(el('hudFoeName').textContent, finished.name, 'the scoreboard does not replace the beaten captain with the next one');
ok(el('overOpponent').textContent.includes(finished.name), 'the result names the captain actually played');
ok(el('overOpponent').textContent.includes('Level 1'), 'the result displays the completed level');
ok(el('overNext').textContent.includes('Level 2'), 'the next-match preview announces the advancing level');
ok(el('overNext').textContent.includes('tougher opponent'), 'the next round explains its increasing challenge');
eq(el('again').textContent, 'Next round', 'a cup win offers the actual next round');
el('again').dispatch('click');
eq(el('tieFoeName').textContent, 'Sam', 'the next draw advances to the correct captain');
ok(el('tieLevel').textContent.includes('Level 2'), 'the next draw advances its difficulty label');
eq(game.matchOpponent, finished, 'previewing the next draw does not rewrite the finished match');

fixture('cup', 2, 0); api.findOpponent(); kickoff(); finished = game.matchOpponent;
finish('ai');
eq(game.slot.cup.index, 2, 'losing preserves the current cup round');
eq(game.matchOpponent, finished, 'a loss keeps the rival who won');
eq(el('again').textContent, 'Try again', 'a cup loss offers an honest retry');
ok(el('overNext').textContent.includes('Level 3 again'), 'the loss preview retains the same challenge level');
ok(!el('overNext').textContent.includes('tougher'), 'a loss does not promise a fictitious stronger opponent');
el('again').dispatch('click');
eq(el('tieFoeName').textContent, finished.name, 'the retry draw keeps the same captain');
el('roundGo').dispatch('click');
eq(game.matchOpponent.name, finished.name, 'the retry introduction keeps the same opponent');
eq(game.matchOpponent.level, finished.level, 'the retry introduction keeps the same level');

fixture('cup', 3, 0); api.findOpponent(); kickoff(); finished = game.matchOpponent;
finish('human');
deep(game.slot.cup, { index: 0, season: 1 }, 'a final win rolls into the next saved season');
eq(game.slot.trophies, 1, 'a final win awards exactly one cup');
eq(game.matchOpponent, finished, 'trophy rollover keeps the final opponent on the result');
eq(el('hudFoeName').textContent, 'Rafa', 'the trophy result still displays the final captain');
ok(el('overOpponent').textContent.includes('Level 4'), 'the trophy result still displays the final level');
ok(el('overNext').classList.contains('hidden'), 'winning the cup does not advertise a tougher Level1 opener');
eq(el('again').textContent, 'See your cup', 'the trophy result offers the completed draw');
el('again').dispatch('click');
eq(el('bracketCaption').textContent, 'You won the cup!', 'the rollover shows a completed champion draw');
ok(el('tieLevel').classList.contains('hidden'), 'the champion draw shows no invented next-match level');
eq(game.matchOpponent, finished, 'the champion draw does not overwrite the final identity');
el('roundGo').dispatch('click');
eq(game.state, 'START', 'the champion button goes home instead of starting another cup');
eq(game.slot.stats.matches, 1, 'the final is recorded as exactly one completed match');

if (require.main === module) console.log(checks + ' matchmaking checks, 0 failures');
module.exports = { checks: checks };
