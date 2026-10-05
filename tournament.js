'use strict';
// The cup: a sixteen-team knockout the child plays their way through.
//
// It exists to serve repeat play. A part-finished cup leaves a specific thing
// outstanding, which pulls harder than a general sense of progress — a child
// two rounds in has a reason to come back that a score never gives. Drawing the
// whole draw, not just their next opponent, is what makes it a tournament: they
// can see who is waiting on the other side.
//
// Pure: no DOM or game state. Friendly matchmaking accepts a random source;
// cup opponents follow the seeded draw. The game reads `matchFor` to configure
// a match, `bracket` to draw the tree, and calls `recordResult` at full time.
var Opponents = (typeof Opponents !== 'undefined') ? Opponents : require('./opponents.js');
var Tournament = (function () {

  var ROUNDS = 4;                  // 16 -> 8 -> 4 -> 2 -> 1
  var SLOTS = 16;
  var YOU_SEED = 2;                // the child's line in the draw

  // Countries by seed. Seed 2 is absent on purpose: that place is the child's.
  var BY_SEED = {
    1: '\u{1F1E7}\u{1F1F7}',  3: '\u{1F1E6}\u{1F1F7}',  4: '\u{1F1EA}\u{1F1F8}',
    5: '\u{1F1E9}\u{1F1EA}',  6: '\u{1F1EC}\u{1F1E7}',  7: '\u{1F1F3}\u{1F1F1}',
    8: '\u{1F1F5}\u{1F1F9}',  9: '\u{1F1E7}\u{1F1EA}', 10: '\u{1F1ED}\u{1F1F7}',
   11: '\u{1F1EE}\u{1F1F9}', 12: '\u{1F1F2}\u{1F1E6}', 13: '\u{1F1EF}\u{1F1F5}',
   14: '\u{1F1FA}\u{1F1F8}', 15: '\u{1F1F2}\u{1F1FD}', 16: '\u{1F1F0}\u{1F1F7}'
  };

  // The standard sixteen-team draw, read top to bottom. The 1-16, 8-9, 5-12
  // pairing is not decoration: it is what makes each line meet progressively
  // stronger opposition instead of hitting a wall in the first round.
  var DRAW = [1, 16, 8, 9, 5, 12, 4, 13, 3, 14, 6, 11, 7, 10, 2, 15];

  // What is at stake in each round, so the cup has a shape a child recognises.
  var ROUND_ICONS = ['\u{1F3DF}', '\u{1F949}', '\u{1F948}', '\u{1F3C6}'];

  // Legacy skill anchors, deliberately capped below 1. The absolute level
  // scale reuses their tuned aim, shot-selection and goalkeeper profiles.
  var SKILL = [0.20, 0.45, 0.70, 0.95];

  // A child may pick a country as their own badge, and one of these fifteen
  // would then appear twice in the same draw. Whichever clashes is swapped for
  // a reserve, so every flag in the tree stands for exactly one team.
  var RESERVE = '\u{1F1E8}\u{1F1ED}';   // Switzerland

  // A level means the same football challenge in every mode and age band.
  // Age and cup progress choose a visible level, never hidden extra strength.
  var LEVELS = [
    { level: 0, name: 'Practice', hint: 'Loose aim and a slow keeper give you room to practise.' },
    { level: 1, name: 'Gentle', hint: 'A patient keeper and a little more accurate shooting.' },
    { level: 2, name: 'Starter', hint: 'Simple shot choices and a steady keeper.' },
    { level: 3, name: 'Steady', hint: 'Better aim and quicker reactions.' },
    { level: 4, name: 'Skilled', hint: 'More shot choices and sharper saves.' },
    { level: 5, name: 'Sharp', hint: 'Careful shot choices and a quick keeper.' },
    { level: 6, name: 'Strong', hint: 'Accurate shots and faster keeper movement.' },
    { level: 7, name: 'Advanced', hint: 'Find gaps against confident shooting and sharp saves.' },
    { level: 8, name: 'Tough', hint: 'Strong shooting and quick reactions reward good placement.' },
    { level: 9, name: 'Expert', hint: 'Many shot choices and a very quick keeper.' },
    { level: 10, name: 'Elite', hint: 'The strongest shooting and fastest keeper; corners still count.' }
  ];
  var ROUND_NAMES = ['Round of 16', 'Quarter-final', 'Semi-final', 'Final'];
  var CAPTAIN_BY_SEED = {
    1: 'Rafa', 3: 'Nico', 4: 'Alex', 5: 'Leon', 6: 'Charlie',
    7: 'Sam', 8: 'Tiago', 9: 'Noor', 10: 'Luka', 11: 'Marco',
    12: 'Amine', 13: 'Ren', 14: 'Jordan', 15: 'Mateo', 16: 'Min'
  };
  var CAPTAINS = {};
  Object.keys(BY_SEED).forEach(function (seed) {
    CAPTAINS[BY_SEED[seed]] = CAPTAIN_BY_SEED[seed];
  });
  CAPTAINS[RESERVE] = 'Sasha';

  function boundedInteger(value, fallback, min, max) {
    return typeof value === 'number' && isFinite(value)
      ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
  }
  function roundName(index) {
    return ROUND_NAMES[boundedInteger(index, 0, 0, ROUNDS - 1)];
  }
  function captainName(flag) {
    return Object.prototype.hasOwnProperty.call(CAPTAINS, flag) ? CAPTAINS[flag] : 'Rival';
  }

  // Choose an identity once for a match. Rendering the reveal, HUD or result
  // must reuse this object rather than choosing a new friendly every time.
  function matchFor(mode, level, cup, band, avoidFlag, rng) {
    var round, year, flag;
    if (mode === 'cup') {
      cup = cup && typeof cup === 'object' ? cup : {};
      round = boundedInteger(cup.index, 0, 0, ROUNDS - 1);
      year = boundedInteger(cup.season, 0, 0, Number.MAX_SAFE_INTEGER - 1);
      var cols = bracket(round, avoidFlag);
      flag = cols[round][youAt(cols, round) ^ 1].flag;
      level = levelForCup(round, year, band);
      return {
        level: level, name: captainName(flag), flag: flag,
        style: Opponents.styleFor(captainName(flag)),
        round: roundName(round), season: year + 1,
        profile: profileForLevel(level)
      };
    }
    level = boundedInteger(level, 2, 0, 10);
    var flags = Object.keys(BY_SEED).map(function (seed) { return BY_SEED[seed]; })
      .filter(function (candidate) { return candidate !== avoidFlag; });
    var sample;
    try { sample = (typeof rng === 'function' ? rng : Math.random)(); }
    catch (e) { sample = 0; }
    if (typeof sample !== 'number' || !isFinite(sample)) { sample = 0; }
    var index = Math.min(flags.length - 1,
      Math.floor(Math.max(0, Math.min(1, sample)) * flags.length));
    flag = flags[index];
    return {
      level: level, name: captainName(flag), flag: flag, round: null, season: null,
      style: Opponents.styleFor(captainName(flag)),
      profile: profileForLevel(level)
    };
  }

  function entrant(seed, avoid) {
    if (seed === YOU_SEED) { return { you: true, seed: seed }; }
    var flag = BY_SEED[seed];
    return { you: false, seed: seed, flag: (flag === avoid) ? RESERVE : flag };
  }

  // Resolve the draw as far as it has actually been played. `played` is how
  // many rounds the child has won, which is also the round they are now in.
  //
  // Every match not involving the child is settled by seed. That is not a
  // shortcut: it is what makes their four opponents rise in strength, with the
  // top seed waiting in the final. Rounds the child has
  // not reached stay undecided, because in a real knockout they have not been
  // played yet either.
  //
  // Returns five columns — 16 entrants, then the winners of each round — where
  // an undecided place is null and a beaten team carries `out`.
  function bracket(played, avoid) {
    var cols = [], first = [], r, i, prev, next, a, b, w;
    for (i = 0; i < SLOTS; i++) { first.push(entrant(DRAW[i], avoid)); }
    cols.push(first);

    for (r = 0; r < ROUNDS; r++) {
      prev = cols[r];
      next = [];
      for (i = 0; i < prev.length; i += 2) {
        a = prev[i]; b = prev[i + 1];
        if (r >= played) { next.push(null); continue; }
        w = (a.you || b.you) ? (a.you ? a : b) : (a.seed < b.seed ? a : b);
        (w === a ? b : a).out = true;
        next.push({ you: !!w.you, seed: w.seed, flag: w.flag });
      }
      cols.push(next);
    }
    return cols;
  }

  // Where the child stands in a resolved draw: the column is the round, the row
  // is their place in it. Their opponent is always the other half of the pair,
  // which is the row with the low bit flipped.
  function youAt(cols, round) {
    var row = cols[round], i;
    for (i = 0; i < row.length; i++) { if (row[i] && row[i].you) { return i; } }
    return -1;
  }

  // The lowest opponent strength an age band will accept.
  //
  // SKILL above is calibrated for a child climbing the cup over many sessions:
  // the first round is a pushover on purpose, because that is what makes a
  // five-year-old believe the thing is winnable at all. An older beginner needs
  // none of that, and until now got it anyway — a sixteen-year-old's first cup
  // opponent was the same 0.20 walkover. The band an adult chose is the only
  // signal of age the game has, so it sets a minimum here rather than letting
  // someone wade through three walkovers to reach a real match.
  //
  // Band 0 means "no maths" was picked, which says nothing about age, so it
  // floors at 0 like the young bands. Anything that is not a finite number is
  // treated the same way: `skillFor` runs before a slot has loaded.
  //
  // `skillFor` does not clamp the ladder up to this floor — that flattens the
  // first three rounds into repeats of the same match, which defeats the
  // point of a cup. Instead the floor sets where an older player STARTS: the
  // ladder's own range is rescaled to run from the floor up to the same 0.95
  // final, so a band-11 player's first round already opens hard (around
  // 0.83) and every round after still climbs, exactly as it does for a young
  // band, arriving at the same tuned final. The 0.95 ceiling itself never
  // moves — it is tuned against the best keeper — only the rungs beneath it
  // start higher.
  var BAND_FLOOR = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.45, 0.65, 0.80];

  function skillFloor(band) {
    if (typeof band !== 'number' || !isFinite(band)) { return 0; }
    var b = Math.floor(band);
    if (b < 0) { return 0; }
    if (b >= BAND_FLOOR.length) { b = BAND_FLOOR.length - 1; }
    return BAND_FLOOR[b];
  }

  // Later seasons lift the opponent a little so a returning child is not
  // replaying the same four matches, without ever exceeding the cap above.
  // The age floor is blended in rather than clamped on afterwards: see the
  // comment above BAND_FLOOR for why.
  function skillFor(index, season, band) {
    var CAP = 0.95;
    var base = SKILL[Math.max(0, Math.min(ROUNDS - 1, index))];
    var ladder = base + Math.min(0.15, (season || 0) * 0.05);
    var floor = skillFloor(band);
    if (floor === 0) { return Math.min(CAP, ladder); }
    var capped = Math.min(CAP, ladder);
    return floor + (capped / CAP) * (CAP - floor);
  }

  // Football difficulty has more than an aiming-error dial. Later opponents
  // compare more plausible flicks and their keeper reads and reaches shots
  // sooner. The home age band sets the starting level; answering a maths
  // question never secretly changes the football opponent mid-match.
  function opponentFor(index, season, band) {
    var round = typeof index === 'number' && isFinite(index) ? Math.floor(index) : 0;
    round = Math.max(0, Math.min(ROUNDS - 1, round));
    var year = typeof season === 'number' && isFinite(season) ? Math.floor(season) : 0;
    year = Math.max(0, Math.min(6, year));
    var skill = skillFor(round, year, band);
    var pace = Math.max(0, Math.min(1, (skill - 0.20) / 0.75));
    return {
      skill: skill,
      shotAttempts: [1, 3, 6, 10][round] + Math.round(skillFloor(band) * 3) + year,
      keeperSpeed: 240 + 60 * pace + year * 3,
      keeperDelay: Math.max(0.10, 0.20 - 0.08 * pace - year * 0.003),
      keeperError: Math.max(26, 26 + 74 * (1 - skill) - year * 0.5)
    };
  }

  // Keep the established football profiles as anchors. Interpolating these
  // makes all eleven steps meaningful without giving a keeper perfect aim,
  // instant reactions, or more shot searches than the previous hardest cup.
  var PROFILE_ANCHORS = [
    { level: 0, profile: { skill: 0.03, shotAttempts: 1, keeperSpeed: 150,
      keeperDelay: 0.35, keeperError: 105 } },
    { level: 2, profile: opponentFor(0, 0, 0) },
    { level: 5, profile: opponentFor(1, 0, 0) },
    { level: 8, profile: opponentFor(2, 0, 0) },
    { level: 10, profile: opponentFor(3, 6, 11) }
  ];

  function profileForLevel(level) {
    level = boundedInteger(level, 2, 0, 10);
    for (var i = 0; i < PROFILE_ANCHORS.length; i++) {
      var upper = PROFILE_ANCHORS[i];
      if (level === upper.level) { return Object.assign({}, upper.profile); }
      if (level < upper.level) {
        var lower = PROFILE_ANCHORS[i - 1];
        var fraction = (level - lower.level) / (upper.level - lower.level);
        var profile = {};
        Object.keys(lower.profile).forEach(function (key) {
          profile[key] = lower.profile[key] + (upper.profile[key] - lower.profile[key]) * fraction;
        });
        profile.shotAttempts = Math.round(profile.shotAttempts);
        return profile;
      }
    }
  }

  function levelForCup(index, season, band) {
    var round = boundedInteger(index, 0, 0, ROUNDS - 1);
    var ageLift = Math.round(skillFloor(band) * 6);
    var seasonLift = boundedInteger(season, 0, 0, 3);
    var base = Math.min(7, 2 + ageLift + seasonLift);
    // Reserve a higher visible level for every remaining round, even once
    // age and season have brought the opening opponent near the ceiling.
    return Math.min(7 + round, base + [0, 3, 6, 8][round]);
  }

  function roundIcon(i) {
    return ROUND_ICONS[Math.max(0, Math.min(ROUNDS - 1, i))];
  }

  // Losing costs progress but never destroys it: you replay the same round.
  // Elimination would mean a child losing the final loses everything, which
  // contradicts the rule that a wrong answer never costs a turn.
  function recordResult(cup, won) {
    var index = cup.index | 0, season = cup.season | 0;
    if (!won) { return { season: season, index: index }; }
    index += 1;
    if (index >= ROUNDS) { return { season: season + 1, index: 0 }; }
    return { season: season, index: index };
  }

  function isComplete(cup, previousIndex) {
    return cup.index === 0 && previousIndex === ROUNDS - 1;
  }

  return {
    COUNT: ROUNDS, SLOTS: SLOTS, DRAW: DRAW, BY_SEED: BY_SEED, RESERVE: RESERVE,
    LEVELS: LEVELS, roundName: roundName, captainName: captainName, matchFor: matchFor,
    profileForLevel: profileForLevel, levelForCup: levelForCup,
    bracket: bracket, youAt: youAt, roundIcon: roundIcon,
    skillFor: skillFor, skillFloor: skillFloor, opponentFor: opponentFor,
    recordResult: recordResult, isComplete: isComplete
  };
})();

if (typeof module !== 'undefined') { module.exports = Tournament; }
