'use strict';
var assert = require('assert');
var Tournament = require('./tournament.js');
var checks = 0;
function ok(condition, message) { checks++; assert.ok(condition, message); }
function eq(actual, expected, message) { checks++; assert.strictEqual(actual, expected, message); }
function deep(actual, expected, message) { checks++; assert.deepStrictEqual(actual, expected, message); }
function near(actual, expected, message) { checks++; assert.ok(Math.abs(actual - expected) < 1e-9, message); }
function fixed(value) { return function () { return value; }; }
var flags = Object.keys(Tournament.BY_SEED).map(function (seed) { return Tournament.BY_SEED[seed]; });
var mexico = Tournament.BY_SEED[15], brazil = Tournament.BY_SEED[1];

deep(Tournament.LEVELS.map(function (entry) { return entry.level; }),
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'eleven absolute football levels include practice level zero');
Tournament.LEVELS.forEach(function (entry, index) {
  eq(entry.level, index, 'level metadata is indexed directly by its visible number');
  ok(typeof entry.name === 'string' && entry.name.length > 0, 'each level has a readable name');
  ok(typeof entry.hint === 'string' && entry.hint.length > 0, 'each level explains its football challenge');
});
deep([0, 2, 5, 8, 10].map(function (level) { return Tournament.LEVELS[level].name; }),
  ['Practice', 'Starter', 'Sharp', 'Tough', 'Elite'], 'established descriptions anchor the full scale');
deep([0, 1, 2, 3].map(Tournament.roundName), ['Round of 16', 'Quarter-final', 'Semi-final', 'Final'],
  'round names remain independent of football levels');
eq(Tournament.roundName(1.9), 'Quarter-final', 'fractional round indices floor consistently');
eq(Tournament.roundName(-1), 'Round of 16', 'negative round indices clamp to the opening round');
eq(Tournament.roundName(99), 'Final', 'round indices cannot exceed the final');
[undefined, null, false, '2', {}, NaN, Infinity].forEach(function (value) {
  eq(Tournament.roundName(value), 'Round of 16', 'invalid round indices start at the opening round');
});
eq(Tournament.captainName(mexico), 'Mateo', 'Mexico keeps the fictional captain Mateo');
eq(Tournament.captainName(brazil), 'Rafa', 'Brazil keeps the fictional captain Rafa');
eq(Tournament.captainName(Tournament.RESERVE), 'Sasha', 'reserve Switzerland keeps its captain');
eq(Tournament.captainName('missing'), 'Rival', 'unknown flags have a safe caption');

// The published scale uses the established physics at its legacy anchors.
deep(Tournament.profileForLevel(0), { skill: 0.03, shotAttempts: 1, keeperSpeed: 150,
  keeperDelay: 0.35, keeperError: 105 }, 'practice level has loose shooting and a patient keeper');
[[2, 0, 0, 0], [5, 1, 0, 0], [8, 2, 0, 0], [10, 3, 6, 11]].forEach(function (anchor) {
  deep(Tournament.profileForLevel(anchor[0]), Tournament.opponentFor(anchor[1], anchor[2], anchor[3]),
    'level ' + anchor[0] + ' preserves its legacy physics anchor exactly');
});
var midpoint = Tournament.profileForLevel(9);
eq(midpoint.shotAttempts, 12, 'intermediate strong levels receive a bounded integer search budget');
eq(midpoint.keeperSpeed, 299, 'the speed halfway between the last anchors interpolates');
near(midpoint.skill, 0.825, 'the aiming skill halfway between the last anchors interpolates');
near(Tournament.profileForLevel(1).skill, 0.115, 'the first step improves aim above practice');
near(Tournament.profileForLevel(1).keeperDelay, 0.275, 'the first step improves keeper reaction time');

var previous = null;
for (var level = 0; level <= 10; level++) {
  var profile = Tournament.profileForLevel(level);
  Object.keys(profile).forEach(function (key) {
    ok(typeof profile[key] === 'number' && isFinite(profile[key]), 'every football parameter remains finite');
  });
  ok(profile.skill >= 0.03 && profile.skill <= 0.95, 'aiming stays imperfect and within its tested cap');
  ok(profile.shotAttempts >= 1 && profile.shotAttempts <= 18 && Math.floor(profile.shotAttempts) === profile.shotAttempts,
    'shot lookahead uses a bounded integer budget');
  ok(profile.keeperSpeed >= 150 && profile.keeperSpeed <= 318, 'keeper travel speed remains finite and bounded');
  ok(profile.keeperDelay >= 0.10 && profile.keeperDelay <= 0.35, 'keepers never react instantly');
  ok(profile.keeperError >= 26 && profile.keeperError <= 105, 'keepers always retain reading error');
  if (previous) {
    ok(profile.skill > previous.skill, 'every adjacent level improves aiming');
    ok(profile.shotAttempts >= previous.shotAttempts, 'higher levels never lose shot choices');
    ok(profile.keeperSpeed > previous.keeperSpeed, 'every adjacent level increases keeper speed');
    ok(profile.keeperDelay < previous.keeperDelay, 'every adjacent level reacts sooner');
    ok(profile.keeperError < previous.keeperError, 'every adjacent level reads shots more accurately');
  }
  previous = profile;
  [0, 3, 9, 11].forEach(function (band) {
    var friendly = Tournament.matchFor('single', level, { index: 3, season: 6 }, band, '', fixed(0));
    eq(friendly.level, level, 'friendly selection preserves the exact chosen level, including zero');
    eq(friendly.round, null, 'friendlies have no inherited cup round');
    eq(friendly.season, null, 'friendlies have no inherited cup season');
    deep(friendly.profile, profile, 'the same friendly level means the same strength at every age');
  });
}
var beforeCup = Tournament.matchFor('single', 0, { index: 0, season: 0 }, 0, '', fixed(0.3));
var afterCup = Tournament.matchFor('single', 0, { index: 3, season: 100 }, 11, '', fixed(0.3));
deep(afterCup, beforeCup, 'practice remains practice even for an older team with completed cups');
var unreadableCup = {};
Object.defineProperty(unreadableCup, 'index', { get: function () { throw new Error('must not inspect cup'); } });
deep(Tournament.matchFor('single', 0, unreadableCup, 11, '', fixed(0.3)), beforeCup,
  'friendly matchmaking does not inspect tournament state');

// Every cup retains four increasing challenges. Age and season select the
// visible level, so there is no hidden strength behind an identical label.
deep([0, 1, 2, 3].map(function (round) { return Tournament.levelForCup(round, 0, 3); }),
  [2, 5, 8, 10], 'a young team starts with the familiar scale anchors');
deep([0, 1, 2, 3].map(function (round) { return Tournament.levelForCup(round, 100, 11); }),
  [7, 8, 9, 10], 'strong cups reserve a higher level for each remaining round');
[0, 3, 8, 9, 10, 11].forEach(function (band) {
  [0, 1, 2, 3, 6, 100].forEach(function (season) {
    var last = -1;
    for (var round = 0; round < 4; round++) {
      var chosen = Tournament.levelForCup(round, season, band);
      ok(chosen > last && chosen <= 10, 'every round increases its visible level even at the ceiling');
      var match = Tournament.matchFor('cup', 0, { index: round, season: season }, band, '', function () {
        throw new Error('cup identity must never draw a random opponent');
      });
      eq(match.level, chosen, 'cup matchmaking displays its chosen strength');
      deep(match.profile, Tournament.profileForLevel(chosen), 'cup physics exactly match its displayed level');
      deep(match.profile, Tournament.matchFor('single', chosen, null, 0, '', fixed(0)).profile,
        'cup and friendly opponents of the same level have identical physics');
      eq(match.season, season + 1, 'the actual cup season remains one-based');
      last = chosen;
    }
  });
});
[0, 1, 2, 3].forEach(function (round) {
  var last = -1;
  for (var season = 0; season <= 6; season++) {
    var chosen = Tournament.levelForCup(round, season, 3);
    ok(chosen >= last, 'later seasons never lower the same round\'s visible level');
    last = chosen;
  }
  eq(Tournament.levelForCup(round, 3, 3), Tournament.levelForCup(round, 100, 3),
    'season progression plateaus honestly at its bounded level');
});
var firstFinal = Tournament.matchFor('cup', 0, { index: 3, season: 0 }, 3);
var laterFinal = Tournament.matchFor('cup', 0, { index: 3, season: 100 }, 11);
eq(firstFinal.level, 10, 'the first final reaches the maximum football challenge');
deep(firstFinal.profile, laterFinal.profile, 'later Level10 finals add no hidden extra difficulty');
eq(firstFinal.name, laterFinal.name, 'a capped later final still keeps its captain');

// Names, roster selection and own-flag avoidance remain independent of scale.
var selected = new Set();
for (var i = 0; i < flags.length; i++) {
  var match = Tournament.matchFor('single', 2, {}, 3, '', fixed((i + 0.5) / flags.length));
  selected.add(match.flag);
  ok(match.name !== 'Rival', 'every selectable friendly has a fixed captain');
}
deep(Array.from(selected).sort(), flags.slice().sort(), 'every actual seeded country remains selectable');
flags.forEach(function (own) {
  [0, 0.5, 1].forEach(function (sample) {
    var match = Tournament.matchFor('single', 0, null, 3, own, fixed(sample));
    ok(match.flag !== own, 'friendly matchmaking never chooses the child\'s own flag');
    ok(flags.indexOf(match.flag) >= 0, 'excluding a flag still chooses an actual cup country');
  });
});
var expected = [
  { flag: mexico, name: 'Mateo' }, { flag: Tournament.BY_SEED[7], name: 'Sam' },
  { flag: Tournament.BY_SEED[3], name: 'Nico' }, { flag: brazil, name: 'Rafa' }
];
expected.forEach(function (identity, index) {
  var cup = { index: index, season: 0 };
  var match = Tournament.matchFor('cup', 0, cup, 3, '');
  eq(match.name, identity.name, 'cup captain stays consistent with its country');
  eq(match.flag, identity.flag, 'cup reveal retains its actual seeded foe');
  eq(match.round, Tournament.roundName(index), 'cup match names its actual round');
  deep(cup, { index: index, season: 0 }, 'choosing an opponent does not advance the cup');
  var reserve = Tournament.matchFor('cup', 0, cup, 3, identity.flag);
  eq(reserve.flag, Tournament.RESERVE, 'an own-country clash uses the bracket reserve');
  eq(reserve.name, 'Sasha', 'the reserve reveal retains its own captain');
  var cols = Tournament.bracket(index, identity.flag);
  eq(reserve.flag, cols[index][Tournament.youAt(cols, index) ^ 1].flag,
    'reserve reveal and bracket agree on identity');
});

// Inputs floor/clamp with safe defaults, without treating chosen zero as absent.
[
  [undefined, 2], [null, 2], [false, 2], ['10', 2], [{}, 2], [NaN, 2],
  [Infinity, 2], [-Infinity, 2], [-10, 0], [0, 0], [1.9, 1], [2.9, 2], [99, 10]
].forEach(function (test) {
  var match = Tournament.matchFor('single', test[0], null, 3, '', fixed(0));
  eq(match.level, test[1], 'invalid friendly levels repair without discarding zero');
  deep(match.profile, Tournament.profileForLevel(test[1]), 'repaired selection uses its actual profile');
  deep(Tournament.profileForLevel(test[0]), Tournament.profileForLevel(test[1]),
    'direct profile inputs share the same floor/clamp/default rules');
});
[null, undefined, false, 'bad', {}, { index: '3', season: '5' },
  { index: NaN, season: Infinity }, { index: -3, season: -1 }
].forEach(function (cup) {
  var match = Tournament.matchFor('cup', 10, cup, 3);
  eq(match.level, 2, 'malformed cup state defaults to the young opening challenge');
  eq(match.season, 1, 'malformed cup state defaults to its first season');
  eq(match.name, 'Mateo', 'malformed cup state retains a coherent identity');
});
deep(Tournament.levelForCup(NaN, Infinity, '11'), 2, 'invalid age and cup choices use the opening default');
eq(Tournament.levelForCup(2.9, 1.9, 9), Tournament.levelForCup(2, 1, 9), 'fractional cup choices floor consistently');
eq(Tournament.levelForCup(999, 999, 999), 10, 'excessive cup values cap at the strongest challenge');
var repaired = Tournament.matchFor('cup', 0, { index: 999, season: 2.9 }, 3);
eq(repaired.level, 10, 'an excessive cup index caps at the final challenge');
eq(repaired.season, 3, 'fractional displayed seasons floor consistently');
eq(Tournament.matchFor('unknown', 2, null, 3, '', fixed(0)).round, null, 'unknown modes use friendly matchmaking');
[undefined, NaN, Infinity, '0.5', {}, -3, 99].forEach(function (sample) {
  ok(flags.indexOf(Tournament.matchFor('single', 0, null, 3, '', fixed(sample)).flag) >= 0,
    'invalid random values still choose a valid opponent');
});
ok(flags.indexOf(Tournament.matchFor('single', 0, null, 3, '', function () {
  throw new Error('unavailable random source');
}).flag) >= 0, 'a failing random source has a safe identity fallback');
ok(flags.indexOf(Tournament.matchFor('single', 0, null, 3, '', 'bad').flag) >= 0,
  'a non-function random source uses the ordinary random source');

var original = Tournament.matchFor('cup', 0, { index: 0, season: 0 }, 3, '');
var copy = Tournament.matchFor('cup', 0, { index: 0, season: 0 }, 3, '');
ok(original !== copy && original.profile !== copy.profile, 'matches and profiles are independent objects');
original.name = 'Changed'; original.profile.shotAttempts = 999;
eq(copy.name, 'Mateo', 'editing one match cannot rename another');
eq(copy.profile.shotAttempts, 1, 'editing one match cannot strengthen another');
deep(Tournament.matchFor('cup', 0, { index: 0, season: 0 }, 3, ''), copy,
  'future matches retain their fixed identity and absolute profile');
var editable = Tournament.profileForLevel(10); editable.keeperError = 0;
ok(Tournament.profileForLevel(10).keeperError > 0, 'editing a profile cannot remove error from the shared anchor');

if (require.main === module) console.log(checks + ' opponent level checks, 0 failures');
module.exports = { checks: checks };
