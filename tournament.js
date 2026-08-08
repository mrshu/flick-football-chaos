'use strict';
// The cup: a sixteen-team knockout the child plays their way through.
//
// It exists to serve repeat play. A part-finished cup leaves a specific thing
// outstanding, which pulls harder than a general sense of progress — a child
// two rounds in has a reason to come back that a score never gives. Drawing the
// whole draw, not just their next opponent, is what makes it a tournament: they
// can see who is waiting on the other side.
//
// Pure: no DOM, no game state, no randomness of its own. The game reads
// `skillFor` when configuring the CPU, `bracket` when drawing the tree, and
// calls `recordResult` at full time.
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

  // Rising, and deliberately capped below 1. The child cannot be given a
  // perfect opponent: with no dynamic mercy anywhere in the design, this curve
  // is the only thing standing between a five-year-old and an unwinnable wall.
  var SKILL = [0.20, 0.45, 0.70, 0.95];

  // A child may pick a country as their own badge, and one of these fifteen
  // would then appear twice in the same draw. Whichever clashes is swapped for
  // a reserve, so every flag in the tree stands for exactly one team.
  var RESERVE = '\u{1F1E8}\u{1F1ED}';   // Switzerland

  function entrant(seed, avoid) {
    if (seed === YOU_SEED) { return { you: true, seed: seed }; }
    var flag = BY_SEED[seed];
    return { you: false, seed: seed, flag: (flag === avoid) ? RESERVE : flag };
  }

  // Resolve the draw as far as it has actually been played. `played` is how
  // many rounds the child has won, which is also the round they are now in.
  //
  // Every match not involving the child is settled by seed. That is not a
  // shortcut: it is what makes their four opponents rise in strength exactly as
  // SKILL does, with the top seed waiting in the final. Rounds the child has
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
        if (r >= played || !a || !b) { next.push(null); continue; }
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

  // The child's opponent in each round, derived from the draw rather than
  // listed beside it, so changing the draw cannot leave the two disagreeing.
  var OPPONENTS = (function () {
    var out = [], r, cols, at;
    for (r = 0; r < ROUNDS; r++) {
      cols = bracket(r);
      at = youAt(cols, r);
      out.push(cols[r][at ^ 1]);
    }
    return out;
  })();

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

  function crestFor(index, avoid) {
    var o = OPPONENTS[Math.max(0, Math.min(ROUNDS - 1, index))];
    return (o.flag === avoid) ? { seed: o.seed, flag: RESERVE } : o;
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
    SKILL: SKILL, ROUND_ICONS: ROUND_ICONS, OPPONENTS: OPPONENTS,
    BAND_FLOOR: BAND_FLOOR,
    bracket: bracket, youAt: youAt, roundIcon: roundIcon,
    skillFor: skillFor, skillFloor: skillFloor, crestFor: crestFor,
    recordResult: recordResult, isComplete: isComplete
  };
})();

if (typeof module !== 'undefined') { module.exports = Tournament; }
