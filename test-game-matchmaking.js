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
  var attributes = {}, children = [], html = '', text = '', value = '';
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
      var target = this;
      (this.listeners[type] || []).forEach(function (callback) {
        callback.call(target, event || { preventDefault: noop, stopPropagation: noop });
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
    value: {
      get: function () { return value; },
      set: function (next) { value = String(next); }
    },
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
var reducedMotion = false;
var context = vm.createContext({
  console: console, Math: testMath, setTimeout: noop, clearTimeout: noop,
  requestAnimationFrame: noop, performance: { now: function () { return 1000; } },
  window: { addEventListener: noop, matchMedia: function () { return { matches: reducedMotion }; } },
  document: { getElementById: el, createElement: node, addEventListener: noop, body: node() },
  Store: Store, Tournament: Tournament, Bonuses: require('./bonuses.js'),
  Opponents: require('./opponents.js'), ShotFeedback: require('./shot-feedback.js'),
  Formation: require('./formation.js'), Maths: require('./maths.js'),
  Names: require('./names.js'), Flags: require('./flags.js'), Locker: require('./locker.js'),
  Quiz: { show: noop, hide: noop }
});
var source = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
var boot = source.indexOf('/* ---------- boot ---------- */');
assert.ok(boot > 0, 'game boot marker exists');
vm.runInContext(source.slice(0, boot), context, { filename: 'game.js' });
var api = vm.runInContext('({ game, init, clearModifier, configureOpponent, findOpponent, ' +
  'revealOpponent, startPlaying, paintCup, showBracket, goalScored, afterGoal, frame, ' +
  'collideCircles, settle, simulateAiShot, physicsStep, allStopped, get movers() { return movers; } })', context);
// Keep the frame's real state transitions while avoiding irrelevant pitch art.
vm.runInContext('draw = function () {};', context);
var game = api.game, frameTime = 1000;
var html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
var rangeMarkup = html.match(/<input\b(?=[^>]*\bid=["']opponentLevelInput["'])[^>]*>/);
ok(rangeMarkup, 'the difficulty picker contains a native input');
function inputAttribute(name) {
  var match = rangeMarkup[0].match(new RegExp('\\b' + name + '=["\\\']([^"\\\']*)["\\\']'));
  return match && match[1];
}
eq(inputAttribute('type'), 'range', 'the difficulty picker uses a native range');
eq(inputAttribute('min'), '0', 'the native difficulty range includes zero');
eq(inputAttribute('max'), '10', 'the native difficulty range reaches ten');
eq(inputAttribute('step'), '1', 'the native difficulty range uses integer steps');
eq(inputAttribute('value'), '2', 'the native range starts at level two');
eq(game.friendlyLevel, 2, 'new friendly selection defaults to level two');
var readoutMarkup = html.match(/<output\b(?=[^>]*\bid=["']opponentLevelReadout["'])[^>]*>([\s\S]*?)<\/output>/);
ok(readoutMarkup, 'the selected level has a native output readout');
ok(/\bid=["']opponentLevelValue["']/.test(readoutMarkup[1]), 'the output contains the selected number');
ok(/\bid=["']opponentLevelName["']/.test(readoutMarkup[1]), 'the output contains the selected challenge name');
function fixture(mode, index, season, band, emoji) {
  reducedMotion = false;
  seed = 31; testMath.random = random;
  api.init(); api.clearModifier();
  game.slot = Store.emptySlot(); game.save = Store.emptyState(); game.save.slots[0] = game.slot;
  game.slot.emoji = emoji || '\u26BD'; game.slot.name = 'Home';
  game.slot.band = band === undefined ? 3 : band;
  game.slot.cup = { index: index || 0, season: season || 0 };
  game.slot.stats.curStreak = 7; game.slot.stats.bestStreak = 7;
  game.slot.streakPowers = { coach: 2, big: 1, small: 3 };
  game.state = 'START'; game.mode = mode || 'single'; game.friendlyLevel = 2;
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
  if (!game.matchReady) advance(30);
  el('matchGo').dispatch('click');
}
function finish(winner) {
  game.score[winner] = 2;
  api.goalScored(winner); api.afterGoal();
}

function chooseLevel(value) {
  el('opponentLevelInput').value = String(value);
  el('opponentLevelInput').dispatch('input');
}

// Exercise the native range's actual input event at every absolute level.
for (var level = 0; level <= 10; level++) {
  fixture('single', 3, 6, 9);
  chooseLevel(level);
  eq(game.friendlyLevel, level, 'the actual range selects level ' + level);
  eq(el('opponentLevelInput').value, String(level), 'the range retains selected level ' + level);
  eq(el('opponentLevelValue').textContent, String(level), 'the readout displays selected level ' + level);
  eq(el('opponentLevelName').textContent, Tournament.LEVELS[level].name, 'the readout names selected level ' + level);
  eq(el('opponentLevelInput').getAttribute('aria-valuetext'),
    'Level ' + level + ' · ' + Tournament.LEVELS[level].name, 'the native range announces its named level');
  api.startPlaying();
  eq(game.state, 'MATCHMAKING', 'starting a friendly opens its reveal');
  var revealed = game.matchOpponent;
  eq(revealed.level, level, 'the chosen level appears on the revealed opponent');
  deep(revealed.profile, Tournament.profileForLevel(level), 'the chosen friendly uses its absolute football profile');
  eq(game.turnCount, 0, 'the reveal starts no football turns');
  eq(game.kickoffAt, 0, 'the reveal starts no match timer');
  ok(el('streakHud').classList.contains('hidden'), 'maths streak HUD is hidden while finding a rival');
  ok(el('matchStyle').classList.contains('hidden'), 'scouting does not reveal the chosen style early');
  kickoff();
  eq(el('matchStyleName').textContent, revealed.style.name, 'the reveal explains its real style');
  ok(!el('matchStyle').classList.contains('hidden'), 'the style appears with the actual rival');
  ok(el('hudFoeStyle').title.includes(revealed.style.name), 'the HUD retains the actual style');
  eq(game.matchOpponent, revealed, 'kickoff preserves the exact revealed opponent object');
  eq(game.opponent, revealed.profile, 'kickoff launches the revealed football profile');
  eq(game.aiSkill, revealed.profile.skill, 'aiming uses the selected football profile');
  eq(game.state, 'HUMAN_AIM', 'kickoff starts the normal first human turn');
  eq(el('hudFoeName').textContent, revealed.name, 'the playing HUD displays the revealed captain');
  eq(el('hudFoeFlag').textContent, revealed.flag, 'the playing HUD displays the revealed flag');
  eq(el('hudFoeLevel').textContent, 'Level ' + level, 'the playing HUD displays the chosen level');
}

// Boundaries also guard synthetic clicks on disabled stepper buttons.
fixture();
chooseLevel(0);
eq(el('levelDown').disabled, true, 'the lower stepper is disabled at zero');
for (var step = 0; step < 3; step++) el('levelDown').dispatch('click');
eq(game.friendlyLevel, 0, 'repeated lower-bound clicks preserve zero');
el('levelUp').dispatch('click');
eq(game.friendlyLevel, 1, 'the upper stepper advances from zero to one');
eq(el('opponentLevelValue').textContent, '1', 'stepping updates the selected level readout');
chooseLevel(10);
eq(el('levelUp').disabled, true, 'the upper stepper is disabled at ten');
for (step = 0; step < 3; step++) el('levelUp').dispatch('click');
eq(game.friendlyLevel, 10, 'repeated upper-bound clicks preserve ten');
el('levelDown').dispatch('click');
eq(game.friendlyLevel, 9, 'the lower stepper retreats from ten to nine');
chooseLevel(-100);
eq(game.friendlyLevel, 0, 'an out-of-range input clamps to zero');
chooseLevel(100);
eq(game.friendlyLevel, 10, 'an out-of-range input clamps to ten');

// Age only selects maths and a cup's starting ladder. It cannot silently
// alter the opponent the child explicitly selected for a friendly.
for (level = 0; level <= 10; level++) {
  [0, 3, 11].forEach(function (band) {
    [{ index: 0, season: 0 }, { index: 3, season: 100 }].forEach(function (cup) {
      fixture('single', cup.index, cup.season, band);
      chooseLevel(level);
      api.configureOpponent();
      deep(game.opponent, Tournament.profileForLevel(level),
        'friendly level ' + level + ' ignores age ' + band + ' and season ' + cup.season);
      eq(game.aiSkill, game.opponent.skill, 'friendly aiming keeps the selected absolute profile');
    });
  });
}

fixture(); api.startPlaying();
var revealed = game.matchOpponent;
var beforeReveal = JSON.parse(JSON.stringify(game.slot));
var searchSeed = seed;
eq(game.timer, 2.8, 'a friendly gets a dramatic 2.8-second reveal');
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
eq(game.matchReady, false, 'the dramatic search is still pending after 0.6 seconds');
ok(el('matchFoeFlag').textContent !== '?', 'the scouting reel visibly shows candidate teams');
eq(game.matchOpponent, revealed, 'visual candidate teams do not change the selected rival');
advance(21);
eq(game.matchReady, false, 'the rival remains concealed before the full reveal delay');
ok(el('matchmaking').classList.contains('closingIn'), 'the dramatic search closes in before revealing');
ok(el('matchFoeFlag').textContent !== revealed.flag, 'the scouting reel keeps the actual rival for its final reveal');
eq(seed, searchSeed, 'visual scouting does not consume future football randomness');
eq(game.turnCount, 0, 'the search countdown advances no football turns');
eq(game.humanTurns, 0, 'the search countdown advances no maths turn schedule');
eq(game.kickoffAt, 0, 'the search countdown advances no match timer');
deep(game.slot, beforeReveal, 'the search countdown changes no saved progress or earned rewards');
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

// The quick reveal skips presentation time, never the explicit kickoff.
fixture(); api.findOpponent(); revealed = game.matchOpponent;
beforeReveal = JSON.parse(JSON.stringify(game.slot));
el('matchReveal').dispatch('click');
eq(game.matchReady, true, 'quick reveal announces the selected rival immediately');
eq(game.state, 'MATCHMAKING', 'quick reveal still waits on the opponent card');
eq(game.matchOpponent, revealed, 'quick reveal keeps the originally selected identity');
eq(el('matchFoeName').textContent, revealed.name, 'quick reveal displays that captain');
eq(el('matchGo').disabled, false, 'quick reveal enables a separate kickoff');
eq(game.turnCount, 0, 'quick reveal starts no football turns');
eq(game.kickoffAt, 0, 'quick reveal starts no match timer');
deep(game.slot, beforeReveal, 'quick reveal awards and spends no earned progress');
advance(40);
eq(game.state, 'MATCHMAKING', 'waiting past the search duration still requires kickoff');
eq(game.turnCount, 0, 'waiting after quick reveal starts no football turns');
el('matchReveal').dispatch('click');
eq(game.matchOpponent, revealed, 'repeated quick reveals do not reroll the rival');
el('matchGo').dispatch('click');
eq(game.turnCount, 1, 'kickoff after quick reveal starts exactly one turn');
el('matchReveal').dispatch('click');
eq(game.state, 'HUMAN_AIM', 'a stale quick reveal cannot replace the active match');
eq(game.matchOpponent, revealed, 'a stale quick reveal keeps the launched rival');

// Reduced motion shortens the introduction and removes cycling candidates,
// while preserving the same explicit kickoff and selected opponent.
fixture(); reducedMotion = true; api.findOpponent(); revealed = game.matchOpponent;
eq(game.timer, 0.7, 'reduced motion gets a shorter 0.7-second introduction');
advance(6);
eq(game.matchReady, false, 'reduced motion still waits for its short reveal');
eq(el('matchFoeFlag').textContent, '?', 'reduced motion suppresses cycling candidate flags');
advance(2);
eq(game.matchReady, true, 'the frame loop completes the reduced-motion reveal');
eq(game.matchOpponent, revealed, 'reduced motion preserves the selected rival');
eq(game.state, 'MATCHMAKING', 'reduced-motion reveal still requires explicit kickoff');
eq(game.turnCount, 0, 'reduced-motion reveal starts no football turn');
el('matchGo').dispatch('click');
eq(game.turnCount, 1, 'explicit kickoff after reduced-motion reveal starts one turn');

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
  advance(40);
  eq(game.state, 'START', 'a cancelled reveal never reopens or kicks off later');
  eq(game.matchReady, false, 'later frames cannot finish a cancelled reveal');
  el('matchGo').dispatch('click');
  eq(game.state, 'START', 'stale kickoff after cancellation is ignored');
  el('matchReveal').dispatch('click');
  eq(game.state, 'START', 'stale quick reveal after cancellation is ignored');
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

// Actual challenge levels differ from round numbers. Check the opening young
// ladder and the strongest returning ladder all the way to their level-10 final.
[
  { band: 1, season: 0, levels: [2, 5, 8, 10] },
  { band: 11, season: 100, levels: [7, 8, 9, 10] }
].forEach(function (ladder) {
  for (var round = 0; round < 4; round++) {
    var actualLevel = Tournament.levelForCup(round, ladder.season, ladder.band);
    eq(actualLevel, ladder.levels[round], 'cup ladder rises to the expected absolute round level');
    var identity = Tournament.matchFor('cup', 2,
      { index: round, season: ladder.season }, ladder.band, '');
    [identity.flag, '\u26BD'].forEach(function (ownFlag) {
      fixture('cup', round, ladder.season, ladder.band, ownFlag);
      api.paintCup();
      api.startPlaying();
      eq(game.state, 'START', 'entering the cup waits on the draw before preparing a match');
      var cols = Tournament.bracket(round, ownFlag);
      var foeFlag = cols[round][Tournament.youAt(cols, round) ^ 1].flag;
      eq(el('tieFoe').textContent, foeFlag, 'the next-match bracket card uses the resolved foe flag');
      eq(el('tieFoeName').textContent, Tournament.captainName(foeFlag), 'the bracket card uses that flag\'s fixed captain');
      eq(el('tieLevel').textContent.indexOf('Level ' + actualLevel + ' '), 0,
        'bracket card announces the actual absolute challenge level');
      ok(el('cupOpponent').textContent.includes('Level ' + actualLevel),
        'the team-screen cup preview announces the actual challenge level');
      eq(el('bracketCaption').textContent, Tournament.roundName(round), 'the bracket names the current knockout round');
      el('roundGo').dispatch('click');
      eq(game.state, 'MATCHMAKING', 'the bracket kickoff opens its known-opponent introduction');
      eq(game.matchReady, true, 'the known cup opponent is introduced immediately');
      eq(game.matchOpponent.flag, foeFlag, 'cup introduction agrees with its actual bracket foe');
      eq(el('matchFoeName').textContent, el('tieFoeName').textContent, 'cup captain stays consistent between draw and intro');
      eq(game.matchOpponent.level, actualLevel, 'cup introduction keeps the actual round\'s level');
      eq(game.matchOpponent.season, ladder.season + 1, 'cup introduction announces the actual season separately');
      deep(game.matchOpponent.profile, Tournament.profileForLevel(actualLevel),
        'the visible cup level represents the exact football profile');
      kickoff();
      eq(el('hudFoeFlag').textContent, foeFlag, 'cup pitch keeps the bracket flag, including reserve swaps');
      eq(el('hudFoeLevel').textContent, 'Level ' + actualLevel, 'cup pitch keeps the actual challenge level');
    });
  }
});

fixture('cup', 0, 0); api.findOpponent(); kickoff();
var finished = game.matchOpponent, finishedProfile = game.opponent;
finish('human');
eq(game.slot.cup.index, 1, 'winning a cup match advances exactly one round');
eq(game.matchOpponent, finished, 'the result keeps the opponent actually beaten');
eq(game.opponent, finishedProfile, 'the result keeps the completed football profile');
eq(el('hudFoeName').textContent, finished.name, 'the scoreboard does not replace the beaten captain with the next one');
ok(el('overOpponent').textContent.includes(finished.name), 'the result names the captain actually played');
ok(el('overOpponent').textContent.includes('Level 2'), 'the result displays the completed level');
ok(el('overNext').textContent.includes('Level 5'), 'the next-match preview announces the advancing level');
ok(el('overNext').textContent.includes('tougher opponent'), 'the next round explains its increasing challenge');
eq(el('again').textContent, 'Next round', 'a cup win offers the actual next round');
el('again').dispatch('click');
eq(el('tieFoeName').textContent, 'Sam', 'the next draw advances to the correct captain');
ok(el('tieLevel').textContent.includes('Level 5'), 'the next draw advances its difficulty label');
eq(game.matchOpponent, finished, 'previewing the next draw does not rewrite the finished match');

fixture('cup', 2, 0); api.findOpponent(); kickoff(); finished = game.matchOpponent;
finish('ai');
eq(game.slot.cup.index, 2, 'losing preserves the current cup round');
eq(game.matchOpponent, finished, 'a loss keeps the rival who won');
eq(el('again').textContent, 'Try again', 'a cup loss offers an honest retry');
ok(el('overNext').textContent.includes('Level 8 again'), 'the loss preview retains the same challenge level');
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
ok(el('overOpponent').textContent.includes('Level 10'), 'the trophy result still displays the final level');
ok(el('overNext').classList.contains('hidden'), 'winning the cup does not advertise a fictitious tougher opener');
eq(el('again').textContent, 'See your cup', 'the trophy result offers the completed draw');
el('again').dispatch('click');
eq(el('bracketCaption').textContent, 'You won the cup!', 'the rollover shows a completed champion draw');
ok(el('tieLevel').classList.contains('hidden'), 'the champion draw shows no invented next-match level');
eq(game.matchOpponent, finished, 'the champion draw does not overwrite the final identity');
el('roundGo').dispatch('click');
eq(game.state, 'START', 'the champion button goes home instead of starting another cup');
eq(game.slot.stats.matches, 1, 'the final is recorded as exactly one completed match');

// Exercise the collision hooks with an actual pointer-launched human flick.
// Use ordinary radii and no active rewards so each contact is unambiguous.
function beginFeedbackShot() {
  fixture(); game.mathsOn = false;
  api.findOpponent(); kickoff();
  var player = game.players[1];
  player.x = 300; player.y = 620;
  pointer('pointerdown', player.x, player.y);
  pointer('pointermove', player.x, player.y + 60);
  pointer('pointerup', player.x, player.y + 60);
  eq(game.state, 'MOVING', 'a real flick starts the feedback ledger');
  ok(game.shotRecord, 'feedback is armed only after a valid launch');
  return player;
}
function strikeBall(player) {
  player.x = 300; player.y = 480; player.vx = 0; player.vy = -600;
  game.ball.x = 300; game.ball.y = 450; game.ball.vx = game.ball.vy = 0;
  api.collideCircles(player, game.ball);
}
function noteAfterSettle(expected) {
  api.settle();
  eq(el('shotFeedbackTitle').textContent, expected, 'real shot outcome is reported accurately');
  ok(!el('shotFeedback').classList.contains('hidden'), 'the outcome note is visible');
  eq(game.state, 'AI_WAIT', 'feedback leaves the normal opponent turn intact');
  eq(game.shotRecord, null, 'settlement closes the ledger before opponent planning');
}

var feedbackPlayer = beginFeedbackShot();
api.physicsStep(1 / 120);
noteAfterSettle('Missed the ball');
var firstTip = el('shotFeedbackTip').textContent;
ok(firstTip.length > 0, 'a missed flick gets a short useful tip');
// Another same-outcome flick reports the outcome without repeating its tip.
game.state = 'HUMAN_AIM';
attemptFlick(); api.settle();
eq(el('shotFeedbackTitle').textContent, 'Missed the ball', 'a repeated miss still explains the outcome');
eq(el('shotFeedbackTip').textContent, '', 'identical advice does not repeat every turn');
advance(45);
ok(el('shotFeedback').classList.contains('hidden'), 'the outcome note expires without input');

feedbackPlayer = beginFeedbackShot();
strikeBall(feedbackPlayer);
var ledgerBefore = JSON.stringify(game.shotRecord);
api.simulateAiShot({ player: game.players[4], vx: 0, vy: 1000 });
eq(JSON.stringify(game.shotRecord), ledgerBefore, 'lookahead never creates human feedback evidence');
var keeper = game.keepers[0];
keeper.x = 300; keeper.y = 98; keeper.vx = keeper.vy = 0;
game.ball.x = 300; game.ball.y = 130; game.ball.vx = 0; game.ball.vy = -600;
api.collideCircles(keeper, game.ball);
noteAfterSettle('Keeper stopped the shot');

feedbackPlayer = beginFeedbackShot();
strikeBall(feedbackPlayer);
var post = vm.runInContext('game.posts[0]', context);
game.ball.x = post.x + 13; game.ball.y = post.y + 10;
game.ball.vx = -300; game.ball.vy = -300;
api.collideCircles(game.ball, post);
noteAfterSettle('Off the post');

// A stationary blue teammate struck by a ricochet is not a new attempt.
feedbackPlayer = beginFeedbackShot();
strikeBall(feedbackPlayer);
post = vm.runInContext('game.posts[0]', context);
game.ball.x = post.x + 13; game.ball.y = post.y + 10;
game.ball.vx = -300; game.ball.vy = -300;
api.collideCircles(game.ball, post);
var teammate = game.players[0];
teammate.x = 300; teammate.y = 600; teammate.vx = teammate.vy = 0;
game.ball.x = 300; game.ball.y = 568; game.ball.vx = 0; game.ball.vy = 600;
api.collideCircles(teammate, game.ball);
noteAfterSettle('Off the post');

// A moving teammate can make a genuine fresh strike after a ricochet.
feedbackPlayer = beginFeedbackShot(); strikeBall(feedbackPlayer);
post = vm.runInContext('game.posts[0]', context);
game.ball.x = post.x + 13; game.ball.y = post.y + 10;
game.ball.vx = -300; game.ball.vy = -300;
api.collideCircles(game.ball, post);
teammate = game.players[0]; teammate.x = 300; teammate.y = 600;
teammate.vx = 0; teammate.vy = -500;
game.ball.x = 300; game.ball.y = 568; game.ball.vx = game.ball.vy = 0;
api.collideCircles(teammate, game.ball);
noteAfterSettle('Ball in play');

// Judge the incoming heading before overlap separation moves the ball.
feedbackPlayer = beginFeedbackShot(); strikeBall(feedbackPlayer);
keeper = game.keepers[0]; keeper.x = 196; keeper.y = 105;
keeper.vx = keeper.vy = 0;
game.ball.x = 216; game.ball.y = 130; game.ball.vx = 0; game.ball.vy = -600;
api.collideCircles(keeper, game.ball);
ok(game.ball.x > 218, 'the actual collision correction can move the ball across the safe-mouth boundary');
noteAfterSettle('Keeper got a touch');
eq(el('shotFeedbackTip').textContent, '', 'an off-target keeper touch gives no speculative save advice');

feedbackPlayer = beginFeedbackShot();
feedbackPlayer.x = 300; feedbackPlayer.y = 480; feedbackPlayer.vx = 0; feedbackPlayer.vy = -20;
game.ball.x = 300; game.ball.y = 450; game.ball.vx = game.ball.vy = 0;
api.collideCircles(feedbackPlayer, game.ball);
noteAfterSettle('Ball in play');

feedbackPlayer = beginFeedbackShot();
var defender = game.players[4];
feedbackPlayer.x = 300; feedbackPlayer.y = 600;
feedbackPlayer.vx = 0; feedbackPlayer.vy = -600;
defender.x = 300; defender.y = 554; defender.vx = defender.vy = 0;
api.collideCircles(feedbackPlayer, defender);
api.settle();
eq(el('shotFeedbackTitle').textContent, 'Player hit a defender', 'a red player obstructing the striker is explained');

feedbackPlayer = beginFeedbackShot();
strikeBall(feedbackPlayer);
api.goalScored('human');
ok(el('shotFeedback').classList.contains('hidden'), 'a goal takes precedence over shot feedback');
eq(game.shotRecord, null, 'scoring clears stale collision evidence');
api.afterGoal();
ok(el('shotFeedback').classList.contains('hidden'), 'the next kickoff does not reveal stale feedback');
feedbackPlayer = beginFeedbackShot();
el('matchBack').dispatch('click');
eq(game.shotRecord, null, 'going home discards an unfinished feedback ledger');

fixture('cup', 1); api.showBracket();
ok(el('tieStyle').textContent.includes(Tournament.matchFor('cup', 2, game.slot.cup, 3, game.slot.emoji).style.name),
  'the cup preview explains the next rival style');
api.findOpponent(); kickoff(); finish('human');
ok(el('overStyle').textContent.includes(game.matchOpponent.style.name), 'the result keeps the completed rival style');

if (require.main === module) console.log(checks + ' matchmaking checks, 0 failures');
module.exports = { checks: checks };
