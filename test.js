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
})();

done();
