'use strict';
var Maths = require('./maths.js');

var checks = 0, failures = 0;

function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
}

function eq(actual, expected, msg) {
  ok(actual === expected, msg + ' (got ' + actual + ', want ' + expected + ')');
}

// Deterministic LCG so every run is reproducible.
function makeRng(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function done() {
  console.log(checks + ' checks, ' + failures + ' failures');
  process.exit(failures ? 1 : 0);
}

// ---- Task 1 ----
ok(typeof Maths === 'object' && Maths !== null, 'Maths module loads');
ok(typeof Maths.make === 'function', 'Maths.make is a function');
ok(typeof Maths.update === 'function', 'Maths.update is a function');
ok(typeof Maths.newState === 'function', 'Maths.newState is a function');

var r1 = makeRng(42), r2 = makeRng(42);
eq(r1(), r2(), 'same seed yields same first value');
ok(r1() !== r1(), 'successive values differ');

// ---- Task 2 ----
(function () {
  var rand = makeRng(7), i, v, seen = {};
  for (i = 0; i < 2000; i++) {
    v = Maths._randInt(rand, 3, 6);
    ok(v >= 3 && v <= 6, 'randInt stays in range');
    ok(v === Math.floor(v), 'randInt returns an integer');
    seen[v] = true;
  }
  ok(seen[3] && seen[4] && seen[5] && seen[6], 'randInt reaches both bounds');

  eq(Maths._randInt(rand, 5, 5), 5, 'randInt with equal bounds returns that value');

  var arr = [1, 2, 3, 4, 5];
  var sh = Maths._shuffle(makeRng(1), arr);
  eq(arr.join(','), '1,2,3,4,5', 'shuffle does not mutate its input');
  eq(sh.slice().sort().join(','), '1,2,3,4,5', 'shuffle preserves elements');
  eq(Maths._shuffle(makeRng(9), arr).join(','),
     Maths._shuffle(makeRng(9), arr).join(','), 'shuffle is deterministic per seed');

  ok(arr.indexOf(Maths._pick(makeRng(3), arr)) !== -1, 'pick returns a member');

  var reordered = false, sd;
  for (sd = 1; sd <= 20 && !reordered; sd++) {
    if (Maths._shuffle(makeRng(sd), arr).join(',') !== arr.join(',')) { reordered = true; }
  }
  ok(reordered, 'shuffle actually reorders elements across seeds');
})();

// ---- Task 3 ----
(function () {
  eq(Maths.choiceCount(1.0), 2, 'floor difficulty gives 2 choices');
  eq(Maths.choiceCount(1.25), 2, '1.25 boundary gives 2 choices');
  eq(Maths.choiceCount(1.26), 3, 'just above 1.25 gives 3 choices');
  eq(Maths.choiceCount(1.75), 3, '1.75 boundary gives 3 choices');
  eq(Maths.choiceCount(1.76), 4, 'just above 1.75 gives 4 choices');
  eq(Maths.choiceCount(8.0), 4, 'top difficulty gives 4 choices');

  var rand = makeRng(11), i, c, j;

  for (i = 0; i < 500; i++) {
    c = Maths.buildChoices(7, 4, [6, 8, 14], rand, 0);
    ok(c.indexOf(7) !== -1, 'choices contain the answer');
    eq(c.length, 4, 'choices honour the requested count');
    for (j = 0; j < c.length; j++) {
      ok(c.indexOf(c[j]) === j, 'no duplicate choices');
      ok(c[j] >= 0, 'no choice below min');
    }
  }

  // Tiny answer space: padding must not produce duplicates or go below min.
  for (i = 0; i < 500; i++) {
    c = Maths.buildChoices(1, 4, [2], rand, 0);
    ok(c.indexOf(1) !== -1, 'small-space choices contain the answer');
    eq(c.length, 4, 'small-space choices reach requested count via padding');
    for (j = 0; j < c.length; j++) {
      ok(c.indexOf(c[j]) === j, 'small-space choices are unique');
      ok(c[j] >= 0, 'small-space choices respect min');
    }
  }

  // Negative-capable band 8.
  c = Maths.buildChoices(-2, 4, [-1, -3, 2], rand, -20);
  ok(c.indexOf(-2) !== -1, 'negative answers are supported');
  for (j = 0; j < c.length; j++) {
    ok(c[j] >= -20, 'negative-range choices respect min');
  }

  // String answers (comparison questions) use `near` verbatim.
  c = Maths.buildChoices('<', 3, ['>', '='], rand, 0);
  eq(c.length, 3, 'comparison gives three symbol choices');
  ok(c.indexOf('<') !== -1 && c.indexOf('>') !== -1 && c.indexOf('=') !== -1,
     'comparison choices are the three symbols');
})();

done();
