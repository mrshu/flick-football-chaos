'use strict';
var assert = require('assert');
var Tournament = require('./tournament.js');
var checks = 0;
function ok(condition, message) { checks++; assert.ok(condition, message); }
function eq(actual, expected, message) { checks++; assert.strictEqual(actual, expected, message); }
function deep(actual, expected, message) { checks++; assert.deepStrictEqual(actual, expected, message); }
function fixed(value) { return function () { return value; }; }
var flags = Object.keys(Tournament.BY_SEED).map(function (seed) { return Tournament.BY_SEED[seed]; });
var mexico = Tournament.BY_SEED[15], brazil = Tournament.BY_SEED[1];

deep(Tournament.LEVELS.map(function (entry) { return entry.level; }), [1, 2, 3, 4],
  'four relative football levels are available');
Tournament.LEVELS.forEach(function (entry) {
  ok(typeof entry.name === 'string' && entry.name.length > 0, 'each level has a readable name');
  ok(typeof entry.hint === 'string' && entry.hint.length > 0, 'each level explains its football challenge');
});
deep([0, 1, 2, 3].map(Tournament.roundName), ['Round of 16', 'Quarter-final', 'Semi-final', 'Final'],
  'cup rounds have human-readable names');
eq(Tournament.roundName(1.9), 'Quarter-final', 'fractional round indices floor consistently');
eq(Tournament.roundName(-1), 'Round of 16', 'negative round indices clamp to the opening round');
eq(Tournament.roundName(99), 'Final', 'round indices cannot exceed the final');
[undefined, null, false, '2', {}, NaN, Infinity].forEach(function (value) {
  eq(Tournament.roundName(value), 'Round of 16', 'invalid round indices start at the opening round');
});
eq(Tournament.captainName(mexico), 'Mateo', 'Mexico has the fixed fictional captain Mateo');
eq(Tournament.captainName(brazil), 'Rafa', 'Brazil has the fixed fictional captain Rafa');
eq(Tournament.captainName(Tournament.RESERVE), 'Sasha', 'reserve Switzerland has its own captain');
eq(Tournament.captainName('missing'), 'Rival', 'unknown flags have a safe caption');

// Every level preserves the existing age-sensitive physics and increases
// actual shot choice and keeper challenge within that child's age band.
[0, 3, 9, 11].forEach(function (band) {
  var previous = null;
  for (var level = 1; level <= 4; level++) {
    var friendly = Tournament.matchFor('single', level, { index: 3, season: 6 }, band, '', fixed(0));
    eq(friendly.level, level, 'friendly level matches the chosen difficulty');
    eq(friendly.round, null, 'friendlies have no cup round label');
    eq(friendly.season, null, 'friendlies have no inherited cup season');
    deep(friendly.profile, Tournament.opponentFor(level - 1, 0, band),
      'friendly level retains the tuned profile for home band ' + band);
    if (previous) {
      ok(friendly.profile.skill > previous.skill, 'higher friendly levels improve aiming');
      ok(friendly.profile.shotAttempts > previous.shotAttempts, 'higher levels compare more shot choices');
      ok(friendly.profile.keeperSpeed > previous.keeperSpeed, 'higher levels have faster keepers');
      ok(friendly.profile.keeperDelay < previous.keeperDelay, 'higher keepers react sooner');
      ok(friendly.profile.keeperError < previous.keeperError, 'higher keepers read shots more accurately');
    }
    previous = friendly.profile;
  }
});
deep(Tournament.matchFor('single', 1, null, 3, '', fixed(0)).profile,
  { skill: 0.20, shotAttempts: 1, keeperSpeed: 240, keeperDelay: 0.20, keeperError: 85.2 },
  'the opening profile retains its existing physics values');
var beforeCup = Tournament.matchFor('single', 2, { index: 0, season: 0 }, 9, '', fixed(0.3));
var afterCup = Tournament.matchFor('single', 2, { index: 3, season: 100 }, 9, '', fixed(0.3));
deep(afterCup, beforeCup, 'friendly difficulty and identity are independent of cup progress');
var unreadableCup = {};
Object.defineProperty(unreadableCup, 'index', { get: function () { throw new Error('must not inspect cup'); } });
deep(Tournament.matchFor('single', 2, unreadableCup, 9, '', fixed(0.3)), beforeCup,
  'friendly matchmaking does not inspect tournament state');

// The friendly pool is the actual seeded country pool, with the player's
// own flag removed before sampling, including at both random boundaries.
var selected = new Set();
for (var i = 0; i < flags.length; i++) {
  var match = Tournament.matchFor('single', 2, {}, 3, '', fixed((i + 0.5) / flags.length));
  selected.add(match.flag);
  ok(match.name !== 'Rival', 'every selectable friendly has a fixed captain');
}
deep(Array.from(selected).sort(), flags.slice().sort(), 'every seeded country can be a friendly opponent');
flags.forEach(function (own) {
  [0, 0.25, 0.5, 0.75, 1].forEach(function (sample) {
    var match = Tournament.matchFor('single', 1, null, 3, own, fixed(sample));
    ok(match.flag !== own, 'friendly matchmaking never chooses the child\'s own flag');
    ok(flags.indexOf(match.flag) >= 0, 'excluding a flag still chooses an actual cup country');
  });
});

// Cup identity comes from the resolved draw, including its reserve swap.
var expected = [
  { flag: mexico, name: 'Mateo' },
  { flag: Tournament.BY_SEED[7], name: 'Sam' },
  { flag: Tournament.BY_SEED[3], name: 'Nico' },
  { flag: brazil, name: 'Rafa' }
];
[0, 1, 6, 7].forEach(function (season) {
  [3, 11].forEach(function (band) {
    expected.forEach(function (identity, index) {
      var cup = { index: index, season: season };
      var match = Tournament.matchFor('cup', 99, cup, band, '', function () {
        throw new Error('cup identity must never draw a random opponent');
      });
      eq(match.level, index + 1, 'cup difficulty follows its actual round');
      eq(match.name, identity.name, 'cup captain stays consistent with its country');
      eq(match.flag, identity.flag, 'cup reveal uses the actual seeded foe');
      eq(match.round, Tournament.roundName(index), 'cup match announces its actual round');
      eq(match.season, season + 1, 'the displayed cup season is one-based');
      deep(match.profile, Tournament.opponentFor(index, season, band), 'cup tuning remains unchanged');
      deep(cup, { index: index, season: season }, 'choosing a cup opponent does not advance the draw');
    });
  });
});
expected.forEach(function (identity, index) {
  var match = Tournament.matchFor('cup', 1, { index: index, season: 0 }, 3, identity.flag);
  eq(match.flag, Tournament.RESERVE, 'own-country clashes use the same reserve as the bracket');
  eq(match.name, 'Sasha', 'the reserve reveal uses the reserve captain');
  var cols = Tournament.bracket(index, identity.flag);
  eq(match.flag, cols[index][Tournament.youAt(cols, index) ^ 1].flag,
    'revealed opponent and visible bracket resolve to the same identity');
});
var firstSeason = Tournament.matchFor('cup', 1, { index: 3, season: 0 }, 3);
var laterSeason = Tournament.matchFor('cup', 1, { index: 3, season: 1 }, 3);
eq(laterSeason.level, firstSeason.level, 'later seasons preserve the four-round level model');
eq(laterSeason.name, firstSeason.name, 'the same country keeps its captain in later seasons');
ok(laterSeason.profile.shotAttempts > firstSeason.profile.shotAttempts,
  'later seasons still improve shot search separately from the level label');
ok(laterSeason.profile.keeperSpeed > firstSeason.profile.keeperSpeed,
  'later seasons still improve keeper speed');

// Malformed choices use safe defaults and existing bounds without coercion.
[
  [undefined, 1], [null, 1], [false, 1], ['4', 1], [{}, 1], [NaN, 1],
  [Infinity, 1], [-Infinity, 1], [-10, 1], [0, 1], [1.9, 1], [2.9, 2], [99, 4]
].forEach(function (test) {
  var match = Tournament.matchFor('single', test[0], null, 3, '', fixed(0));
  eq(match.level, test[1], 'malformed friendly choices clamp or use the starter default');
  deep(match.profile, Tournament.opponentFor(test[1] - 1, 0, 3), 'repaired friendly choice uses the matching profile');
});
[null, undefined, false, 'bad', {}, { index: '3', season: '5' },
  { index: NaN, season: Infinity }, { index: -3, season: -1 }
].forEach(function (cup) {
  var match = Tournament.matchFor('cup', 4, cup, 3);
  eq(match.level, 1, 'malformed cup state defaults to its opening round');
  eq(match.season, 1, 'malformed cup state defaults to its first season');
  eq(match.name, 'Mateo', 'malformed cup state still has a coherent opponent identity');
});
var repaired = Tournament.matchFor('cup', 1, { index: 999, season: 2.9 }, 3);
eq(repaired.level, 4, 'an excessive cup index caps at the final');
eq(repaired.season, 3, 'fractional cup seasons floor consistently');
deep(repaired.profile, Tournament.opponentFor(3, 2, 3), 'repaired cup metadata keeps its profile aligned');
eq(Tournament.matchFor('unknown', 2, null, 3, '', fixed(0)).round, null,
  'unknown modes safely use friendly matchmaking');
[undefined, NaN, Infinity, '0.5', {}, -3, 99].forEach(function (sample) {
  ok(flags.indexOf(Tournament.matchFor('single', 1, null, 3, '', fixed(sample)).flag) >= 0,
    'malformed random values still choose a valid opponent');
});
ok(flags.indexOf(Tournament.matchFor('single', 1, null, 3, '', function () {
  throw new Error('unavailable random source');
}).flag) >= 0, 'a failing random source has a safe identity fallback');
ok(flags.indexOf(Tournament.matchFor('single', 1, null, 3, '', 'bad').flag) >= 0,
  'a non-function random source uses the ordinary random source');

var original = Tournament.matchFor('cup', 1, { index: 0, season: 0 }, 3, '');
var copy = Tournament.matchFor('cup', 1, { index: 0, season: 0 }, 3, '');
ok(original !== copy && original.profile !== copy.profile, 'matches and profiles are independent objects');
original.name = 'Changed'; original.profile.shotAttempts = 999;
eq(copy.name, 'Mateo', 'editing one match cannot rename another');
eq(copy.profile.shotAttempts, 1, 'editing one match cannot strengthen another');
deep(Tournament.matchFor('cup', 1, { index: 0, season: 0 }, 3, ''), copy,
  'future matches retain the fixed identity and tuned profile');

if (require.main === module) console.log(checks + ' opponent level checks, 0 failures');
module.exports = { checks: checks };
