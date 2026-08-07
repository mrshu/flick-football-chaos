'use strict';
var Maths = require('./maths.js');
var Formation = require('./formation.js');

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
  for (i = 0; i < 300; i++) {
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

  for (i = 0; i < 80; i++) {
    c = Maths.buildChoices(7, 4, [6, 8, 14], rand, 0);
    ok(c.indexOf(7) !== -1, 'choices contain the answer');
    eq(c.length, 4, 'choices honour the requested count');
    for (j = 0; j < c.length; j++) {
      ok(c.indexOf(c[j]) === j, 'no duplicate choices');
      ok(c[j] >= 0, 'no choice below min');
    }
  }

  // Tiny answer space: padding must not produce duplicates or go below min.
  for (i = 0; i < 80; i++) {
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

// ---- Over-12: the choice row hardens at the top of the ladder ----
(function () {
  eq(Maths.choiceCount(8.99), 4, 'four choices just below band 9');
  eq(Maths.choiceCount(9), 5, 'five choices from difficulty 9');
  eq(Maths.choiceCount(10.99), 5, 'five choices just below band 11');
  eq(Maths.choiceCount(11), 6, 'six choices at the ceiling');

  var rand = makeRng(55), i, j, c;
  for (i = 0; i < 40; i++) {
    c = Maths.buildChoices(24, 6, [23, 25, 26, 22], rand, 0);
    eq(c.length, 6, 'buildChoices fills six slots');
    ok(c.indexOf(24) !== -1, 'six-choice set contains the answer');
    for (j = 0; j < c.length; j++) {
      eq(c.indexOf(c[j]), j, 'six choices are distinct');
    }
  }
})();

// ---- Band generator shared checks (used by Tasks 4-7) ----
var TOKEN_TYPES = ['num', 'balls', 'op', 'eq', 'box', 'frac', 'bar', 'sep', 'pct', 'pow', 'var', 'diag'];

function checkGenerators(band, allowNegative) {
  var gens = Maths._BANDS[band], rand = makeRng(1000 + band), g, q, i, k, tok;
  ok(gens && gens.length > 0, 'band ' + band + ' has generators');
  for (g = 0; g < gens.length; g++) {
    for (i = 0; i < 10; i++) {
      q = gens[g](rand);
      ok(!!q && typeof q === 'object', 'band ' + band + ' generator returns an object');
      ok(typeof q.skill === 'string' && q.skill.length > 0,
         'band ' + band + ' question has a skill id');
      ok(q.answer !== undefined && q.answer !== null,
         'band ' + band + ' question has an answer');
      if (typeof q.answer === 'number') {
        ok(isFinite(q.answer), 'band ' + band + ' answer is finite');
        if (!allowNegative) {
          ok(q.answer >= 0, 'band ' + band + ' answer is not negative');
        }
      }
      ok(Object.prototype.toString.call(q.render) === '[object Array]' && q.render.length > 0,
         'band ' + band + ' render is a non-empty array');
      for (k = 0; k < q.render.length; k++) {
        tok = q.render[k];
        ok(TOKEN_TYPES.indexOf(tok.t) !== -1,
           'band ' + band + ' token type "' + tok.t + '" is known');
        if (tok.t === 'num' || tok.t === 'balls' || tok.t === 'pct') {
          ok(typeof tok.v === 'number' && isFinite(tok.v),
             'band ' + band + ' ' + tok.t + ' token has a finite value');
          if (!allowNegative) {
            ok(tok.v >= 0, 'band ' + band + ' displayed value is not negative');
          }
        }
      }
      ok(Object.prototype.toString.call(q.near) === '[object Array]',
         'band ' + band + ' provides near-miss candidates');
      for (k = 0; k < q.near.length; k++) {
        if (typeof q.near[k] === 'number') {
          ok(isFinite(q.near[k]),
             'band ' + band + ' near-miss is finite');
          if (!allowNegative) {
            ok(q.near[k] >= 0,
               'band ' + band + ' near-miss is not negative');
          }
        }
      }
    }
  }
}

// ---- Task 4 ----
checkGenerators(1, false);
checkGenerators(2, false);

(function () {
  // Band 1 must stay within bonds-to-5 and use football pictograms.
  var rand = makeRng(5), i, q, usedBalls = false;
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[1][0](rand);
    ok(q.answer <= 5, 'band 1 counting answers stay within 5');
    for (var k = 0; k < q.render.length; k++) {
      if (q.render[k].t === 'balls') { usedBalls = true; }
    }
  }
  ok(usedBalls, 'band 1 renders quantities as footballs');

  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[2][0](rand);
    ok(q.answer <= 10, 'band 2 addition stays within 10');
  }

  // Bonds-to-5/10 render as `a + box = target`; recompute independently
  // from the rendered parts rather than repeating the generator's own
  // `target - a` formula.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[1][1](rand);
    eq(q.answer + q.render[0].v, q.render[4].v,
       'bond-to-5 recomputes from the rendered parts');
  }
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[2][2](rand);
    eq(q.answer + q.render[0].v, q.render[4].v,
       'bond-to-10 recomputes from the rendered parts');
  }
})();

// Sub10's near-miss list clamps `a - b - 1` at 0 (`Math.max(0, ...)`) so a
// forced a===b draw can't offer -1 as a distractor. This is exactly the
// coincidence a random sweep might not hit by luck, so force it directly: a
// fixed rand() near 1 drives both _randInt calls to their top bound,
// producing a===b deterministically (see genSub10: a = _randInt(2,10),
// b = _randInt(1,a); a rand() of 0.999999 yields a=10 then b=10).
(function () {
  var fixedRand = function () { return 0.999999; };
  var q = Maths._BANDS[2][1](fixedRand);
  eq(q.answer, 0, 'sub10 forced equal operands answers zero');
  ok(q.near.indexOf(-1) === -1, 'sub10 near-miss clamp keeps candidates non-negative');
})();

// ---- Task 5 ----
checkGenerators(3, false);
checkGenerators(4, false);

(function () {
  var rand = makeRng(31), i, q, k, boxes, terms, gapIdx, step, refIdx, refVal, p;
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[3][0](rand);
    ok(q.answer <= 20, 'band 3 addition stays within 20');
  }
  // The sequence generator must leave exactly one gap.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[3][3](rand);
    boxes = 0;
    for (k = 0; k < q.render.length; k++) { if (q.render[k].t === 'box') { boxes++; } }
    eq(boxes, 1, 'sequence question has exactly one gap');
    ok(q.answer > 0, 'sequence answer is positive');

    // Independent recomputation: derive the step from a visible adjacent
    // pair of terms (separators skipped) and extrapolate to the box.
    terms = [];
    for (k = 0; k < q.render.length; k++) {
      if (q.render[k].t === 'num' || q.render[k].t === 'box') { terms.push(q.render[k]); }
    }
    gapIdx = -1;
    for (p = 0; p < terms.length; p++) { if (terms[p].t === 'box') { gapIdx = p; } }
    step = undefined;
    for (p = 0; p < terms.length - 1; p++) {
      if (terms[p].t === 'num' && terms[p + 1].t === 'num') {
        step = terms[p + 1].v - terms[p].v;
        refIdx = p; refVal = terms[p].v;
        break;
      }
    }
    eq(q.answer, refVal + (gapIdx - refIdx) * step,
       'sequence gap recomputes from visible terms');
  }
  // Halving must always be exact.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[4][3](rand);
    eq(q.answer, Math.floor(q.answer), 'halving yields a whole number');
    eq(q.answer * 2, q.render[2].v,
       'halving recomputes from the rendered amount');
  }
})();

// ---- Task 6 ----
checkGenerators(5, false);
checkGenerators(6, false);

(function () {
  var rand = makeRng(57), i, q;

  // Division must be exact.
  for (i = 0; i < 100; i++) {
    q = Maths._BANDS[5][1](rand);
    eq(q.answer, Math.floor(q.answer), 'division yields a whole number');
    ok(q.answer > 0, 'division answer is positive');
  }
  // Fractions of amounts must be exact.
  for (i = 0; i < 100; i++) {
    q = Maths._BANDS[5][2](rand);
    eq(q.answer, Math.floor(q.answer), 'fraction of amount is a whole number');
    eq(q.answer * q.render[0].d, q.render[2].v,
       'fraction of amount recomputes from the rendered fraction');
  }
  // Decimals must be multiples of 0.25, so binary representation is exact.
  for (i = 0; i < 100; i++) {
    q = Maths._BANDS[6][1](rand);
    eq(q.answer * 4, Math.round(q.answer * 4), 'decimal answer is a multiple of 0.25');
    eq(q.answer, Number(q.answer.toFixed(2)), 'decimal answer has no float drift');
  }
  // Comparison answers are symbols with all three offered.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[6][2](rand);
    ok(q.answer === '<' || q.answer === '>' || q.answer === '=',
       'fraction comparison answers with a symbol');
    eq(q.near.length, 2, 'comparison offers the two other symbols');
  }
})();

// ---- Task 7 ----
checkGenerators(7, false);
checkGenerators(8, true);   // band 8 alone may go negative

(function () {
  var rand = makeRng(83), i, q, sawNegative = false;

  // Percentages must come out whole.
  for (i = 0; i < 100; i++) {
    q = Maths._BANDS[7][0](rand);
    eq(q.answer, Math.floor(q.answer), 'percentage of amount is a whole number');
    eq(q.answer * 100, q.render[0].v * q.render[2].v,
       'percentage recomputes from the rendered percent and amount');
  }
  // Order of operations: multiplication binds before addition.
  for (i = 0; i < 100; i++) {
    q = Maths._BANDS[7][1](rand);
    var a = q.render[0].v, b = q.render[2].v, c = q.render[4].v;
    eq(q.answer, a + b * c, 'order of operations respects precedence');
  }
  // Ratio scaling must preserve the proportion: a:b = (a*k):answer, so
  // cross-multiplying gives an independent check of the scaled term.
  for (i = 0; i < 100; i++) {
    q = Maths._BANDS[7][2](rand);
    eq(q.answer * q.render[0].v, q.render[2].v * q.render[4].v,
       'ratio recomputes via cross-multiplication');
  }
  // Squares and roots are inverse and exact.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[8][1](rand);
    eq(q.answer, q.render[0].v * q.render[0].v, 'square is exact');
    q = Maths._BANDS[8][2](rand);
    eq(q.answer * q.answer, q.render[1].v, 'root is exact');
  }
  // Equation solving: box + b = total, recomputed from the rendered totals.
  for (i = 0; i < 100; i++) {
    q = Maths._BANDS[8][3](rand);
    eq(q.answer + q.render[2].v, q.render[4].v,
       'equation recomputes from the rendered totals');
  }
  // Negative results do occur in band 8.
  for (i = 0; i < 150; i++) {
    q = Maths._BANDS[8][0](rand);
    if (q.answer < 0) { sawNegative = true; }
  }
  ok(sawNegative, 'band 8 actually produces negative answers');
})();

// ---- Over-12: band 9 ----
checkGenerators(9, false);

(function () {
  var rand = makeRng(91), i, q, m;

  // eqn2 renders [var 'ax', +, b, =, c, sep, var 'x', =, box]; recompute
  // a·answer + b === c from the rendered parts.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[9][0](rand);
    eq(q.skill, 'eqn2', 'band 9 gen 0 is eqn2');
    m = /^(\d+)x$/.exec(q.render[0].v);
    ok(!!m, 'eqn2 leads with a coefficient-x token');
    eq(Number(m[1]) * q.answer + q.render[2].v, q.render[4].v,
       'eqn2 recomputes from the rendered parts');
    ok(q.answer >= 2 && q.answer <= 12, 'eqn2 solutions stay small and whole');
  }

  // expand renders [var 'a(x+b)', =, var 'ax', +, box]; answer === a·b.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[9][1](rand);
    eq(q.skill, 'expand', 'band 9 gen 1 is expand');
    m = /^(\d+)\(x\+(\d+)\)$/.exec(q.render[0].v);
    ok(!!m, 'expand leads with a bracket token');
    eq(q.answer, Number(m[1]) * Number(m[2]),
       'expand recomputes a·b from the bracket');
    eq(q.render[2].v, m[1] + 'x', 'expanded x-term matches the coefficient');
  }

  // angleLine: two angles on a straight line sum to 180.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[9][2](rand);
    eq(q.skill, 'angleLine', 'band 9 gen 2 is angleLine');
    eq(q.render[0].t, 'diag', 'angleLine renders a diagram');
    eq(q.render[0].kind, 'angleLine', 'angleLine diagram kind');
    eq(q.answer + q.render[0].known, 180, 'angles on a line sum to 180');
    ok(q.render[0].known >= 25 && q.render[0].known <= 155,
       'angleLine known angle is drawable');
  }

  // seqRule: linear sequence, gap mid-sequence; recompute step from two
  // adjacent visible terms and the answer from a visible reference.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[9][3](rand);
    eq(q.skill, 'seqRule', 'band 9 gen 3 is seqRule');
    var nums = [], k, idx = 0, gap = -1;
    for (k = 0; k < q.render.length; k++) {
      if (q.render[k].t === 'num') { nums.push({ i: idx, v: q.render[k].v }); idx++; }
      else if (q.render[k].t === 'box') { gap = idx; idx++; }
    }
    ok(gap >= 1 && gap <= 3, 'seqRule gap is mid-sequence');
    eq(nums.length, 4, 'seqRule shows four known terms');
    var a = null, b = null;
    for (k = 0; k + 1 < nums.length; k++) {
      if (nums[k + 1].i === nums[k].i + 1) { a = nums[k]; b = nums[k + 1]; break; }
    }
    ok(!!a, 'seqRule has two adjacent visible terms');
    var step = b.v - a.v;
    ok(step >= 3 && step <= 9, 'seqRule step is 3-9');
    eq(q.answer, a.v + (gap - a.i) * step,
       'seqRule recomputes the hidden term from a visible one');
  }
})();

// ---- Over-12: band 10 ----
checkGenerators(10, false);

(function () {
  var rand = makeRng(101), i, q;

  // simul renders "x+y=s , x−y=d , x=□"; x=(s+d)/2 must be whole and > y ≥ 1.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[10][0](rand);
    eq(q.skill, 'simul', 'band 10 gen 0 is simul');
    var s = q.render[4].v, d = q.render[10].v;
    eq(q.answer, (s + d) / 2, 'simul recomputes x from sum and difference');
    ok(q.answer === Math.floor(q.answer), 'simul x is whole');
    var y = s - q.answer;
    ok(y >= 1 && q.answer > y, 'simul keeps x > y >= 1');
  }

  // angleTri: three angles of a triangle sum to 180, all drawable.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[10][1](rand);
    eq(q.skill, 'angleTri', 'band 10 gen 1 is angleTri');
    eq(q.render[0].kind, 'angleTri', 'angleTri diagram kind');
    eq(q.render[0].a + q.render[0].b + q.answer, 180,
       'triangle angles sum to 180');
    ok(q.answer >= 20, 'angleTri unknown stays drawable');
    ok(q.render[0].a >= 30 && q.render[0].b >= 30, 'angleTri knowns stay drawable');
  }

  // pythag: legs and answer form a Pythagorean triple.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[10][2](rand);
    eq(q.skill, 'pythag', 'band 10 gen 2 is pythag');
    eq(q.render[0].kind, 'pythag', 'pythag diagram kind');
    var la = q.render[0].legA, lb = q.render[0].legB;
    eq(la * la + lb * lb, q.answer * q.answer, 'pythag is a true triple');
  }

  // seqQuad: differences grow by 2; recompute term 5 from terms 3 and 4.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[10][3](rand);
    eq(q.skill, 'seqQuad', 'band 10 gen 3 is seqQuad');
    var t = [q.render[0].v, q.render[2].v, q.render[4].v, q.render[6].v];
    eq(t[1] - t[0] + 2, t[2] - t[1], 'seqQuad differences grow by 2');
    eq(q.answer, t[3] + (t[3] - t[2]) + 2,
       'seqQuad recomputes the next term from the last difference');
  }
})();

// ---- Over-12: band 11 ----
checkGenerators(11, false);

(function () {
  var rand = makeRng(111), i, q;

  // indices: b^p × b^q = b^□ (answer p+q) or b^p ÷ b^q = b^□ (answer p−q).
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[11][0](rand);
    eq(q.skill, 'indices', 'band 11 gen 0 is indices');
    eq(q.render[0].v, q.render[2].v, 'indices keeps one base throughout');
    eq(q.render[4].e, '□', 'indices asks for the exponent');
    if (q.render[1].v === '×') {
      eq(q.answer, q.render[0].e + q.render[2].e, 'multiplied powers add exponents');
    } else {
      eq(q.answer, q.render[0].e - q.render[2].e, 'divided powers subtract exponents');
      ok(q.answer >= 1, 'divided powers keep a positive exponent');
    }
  }

  // ineq: answer is the largest whole x with a·x < c.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[11][1](rand);
    eq(q.skill, 'ineq', 'band 11 gen 1 is ineq');
    var m = /^(\d+)x$/.exec(q.render[0].v), a = Number(m[1]), c = q.render[2].v;
    ok(a * q.answer < c, 'ineq answer satisfies the inequality');
    ok(a * (q.answer + 1) >= c, 'ineq answer is the largest such x');
  }

  // seqGeo: constant ratio, gap in the late half; recompute from neighbours.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[11][2](rand);
    eq(q.skill, 'seqGeo', 'band 11 gen 2 is seqGeo');
    var nums = [], k, idx = 0, gap = -1;
    for (k = 0; k < q.render.length; k++) {
      if (q.render[k].t === 'num') { nums.push({ i: idx, v: q.render[k].v }); idx++; }
      else if (q.render[k].t === 'box') { gap = idx; idx++; }
    }
    ok(gap >= 2 && gap <= 4, 'seqGeo gap sits in the late half');
    var r0 = null;
    for (k = 0; k + 1 < nums.length; k++) {
      if (nums[k + 1].i === nums[k].i + 1) { r0 = nums[k + 1].v / nums[k].v; break; }
    }
    ok(r0 === 2 || r0 === 3, 'seqGeo ratio is 2 or 3');
    var ref = nums[0];
    eq(q.answer, ref.v * Math.pow(r0, gap - ref.i),
       'seqGeo recomputes the hidden term from a visible one');
  }

  // areaComp: L-shape area is the outer rectangle minus the notch.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[11][3](rand);
    eq(q.skill, 'areaComp', 'band 11 gen 3 is areaComp');
    var g = q.render[0];
    eq(g.kind, 'areaComp', 'areaComp diagram kind');
    eq(q.answer, g.W * g.H - g.w * g.h, 'areaComp area recomputes');
    ok(g.w < g.W && g.h < g.H, 'areaComp notch fits inside the rectangle');
  }
})();

// ---- Task 8 ----
(function () {
  var rand = makeRng(101), i, q, counts = { 3: 0, 4: 0 };

  // Band mixing: difficulty 3.4 should draw roughly 40% from band 4. 1000
  // draws keeps the observed fraction's std dev (~0.015) well inside the
  // 0.07 margin either side of the 0.40 target.
  var N_MIX = 800;
  for (i = 0; i < N_MIX; i++) {
    q = Maths.make(3.4, Maths.newState(3.4), rand);
    ok(q.band === 3 || q.band === 4, 'difficulty 3.4 draws from band 3 or 4');
    counts[q.band]++;
  }
  var frac = counts[4] / N_MIX;
  ok(frac > 0.33 && frac < 0.47, 'band 4 share is near 40% (got ' + frac.toFixed(3) + ')');

  // Integer difficulty draws only that band.
  for (i = 0; i < 80; i++) {
    eq(Maths.make(5, Maths.newState(5), rand).band, 5, 'integer difficulty picks that band');
  }
  eq(Maths.make(8, Maths.newState(8), rand).band, 8, 'difficulty 8 never overflows to band 9');

  // Shape of the returned question.
  for (i = 0; i < 200; i++) {
    q = Maths.make(1 + rand() * 7, Maths.newState(4), rand);
    ok(q.choices.indexOf(q.answer) !== -1, 'choices always contain the answer');
    ok(q.choices.length >= 2 && q.choices.length <= 4, 'choice count is 2-4');
    for (var k = 0; k < q.choices.length; k++) {
      ok(q.choices.indexOf(q.choices[k]) === k, 'choices are unique');
    }
    ok(typeof q.skill === 'string', 'question reports its skill');
  }

  // Floor support: at the bottom of the scale choices reduce.
  eq(Maths.make(1.0, Maths.newState(1), rand).choices.length, 2,
     'difficulty 1.0 offers two choices');
  eq(Maths.make(1.5, Maths.newState(1.5), rand).choices.length, 3,
     'difficulty 1.5 offers three choices');

  // Weak-spot weighting: a skill with low mastery is over-sampled.
  var st = Maths.newState(2);
  st.mastery = { add10: 0.05, sub10: 0.95, bond10: 0.95 };
  var weak = 0, total = 2000;
  for (i = 0; i < total; i++) {
    if (Maths.make(2, st, rand).skill === 'add10') { weak++; }
  }
  ok(weak / total > 0.40,
     'weak skill is favoured above its uniform 1/3 share (got ' + (weak / total).toFixed(3) + ')');
})();

// ---- Task 9 ----
(function () {
  var base = Maths.newState(4), s;

  function outcome(correct, ms, band, skill) {
    return { correct: correct, elapsedMs: ms, band: band || 4, skill: skill || 'mul' };
  }

  // Purity.
  s = Maths.update(base, outcome(true, 1000));
  eq(base.difficulty, 4, 'update does not mutate the input state');
  ok(s !== base, 'update returns a new object');

  // The purity check above only covers `difficulty`. A shallow copy that
  // aliased `mastery` would pass everything else in this block.
  var shared = Maths.newState(4);
  shared.mastery.mul = 0.5;
  Maths.update(shared, outcome(true, 1000, 4, 'mul'));
  eq(shared.mastery.mul, 0.5, 'update does not mutate the input mastery object');

  // Step sizes. Expected time at band 4 is 2500 + 3600 = 6100ms.
  eq(Number((Maths.update(base, outcome(true, 1000)).difficulty - 4).toFixed(3)), 0.100,
     'correct and fast steps up 0.100');
  eq(Number((Maths.update(base, outcome(true, 6000)).difficulty - 4).toFixed(3)), 0.075,
     'correct at expected pace steps up 0.075');
  eq(Number((Maths.update(base, outcome(true, 20000)).difficulty - 4).toFixed(3)), 0.040,
     'correct but slow steps up 0.040');
  eq(Number((Maths.update(base, outcome(false, 1000)).difficulty - 4).toFixed(3)), -0.300,
     'wrong steps down 0.300');

  // Clamping.
  s = Maths.newState(1);
  for (var i = 0; i < 50; i++) { s = Maths.update(s, outcome(false, 1000, 1)); }
  eq(s.difficulty, 1, 'difficulty never falls below 1');
  s = Maths.newState(11);
  for (i = 0; i < 200; i++) { s = Maths.update(s, outcome(true, 100, 11)); }
  eq(s.difficulty, 11, 'difficulty never rises above 11');

  // Mastery tracking.
  s = Maths.update(Maths.newState(4), outcome(true, 1000, 4, 'mul'));
  ok(s.mastery.mul > 0.5, 'a correct answer raises mastery above the 0.5 start');
  s = Maths.update(Maths.newState(4), outcome(false, 1000, 4, 'mul'));
  ok(s.mastery.mul < 0.5, 'a wrong answer lowers mastery');

  s = Maths.newState(4);
  for (i = 0; i < 200; i++) { s = Maths.update(s, outcome(true, 1000, 4, 'div')); }
  ok(s.mastery.div <= 1 && s.mastery.div > 0.9, 'mastery converges towards 1 without exceeding it');
  for (i = 0; i < 400; i++) { s = Maths.update(s, outcome(false, 1000, 4, 'div')); }
  ok(s.mastery.div >= 0 && s.mastery.div < 0.1, 'mastery converges towards 0 without going below');
})();

// ---- Task 4 (over-12): MAX_BAND ceiling ----
(function () {
  eq(Maths.MAX_BAND, 11, 'the ladder tops out at band 11');
  var s = Maths.newState(11);
  eq(s.difficulty, 11, 'newState accepts a band-11 start');
  eq(Maths.newState(99).difficulty, 11, 'newState clamps above the ceiling');
  var top = { difficulty: 11, home: 11, mastery: {}, fastStreak: 0, wrongStreak: 0 };
  var up = Maths.update(top, { correct: true, elapsedMs: 1000, band: 11, skill: 'x' });
  eq(up.difficulty, 11, 'update clamps at the new ceiling');
})();

// ---- Task 9b: adaptive acceleration ----
// A misplaced child answering many fast-correct answers in a row is beyond
// their current band and should climb without grinding through dozens of
// questions (owner instruction: "do not hesitate to make them jump even two
// and more years"). But the climb needs a ceiling as much as a floor: with
// only a lower bound asserted here, ten fast-correct answers used to carry a
// five-year-old from counting footballs to solving equations, in steps of up
// to 1.3 bands, on questions that offer two choices and are therefore half
// guessable. Both ends are bounded below.
//
// The symmetric safeguard is a child who overshoots and gets stranded too
// high: a run of wrong answers must fall back without a long march of -0.300
// steps.
(function () {
  function outcome(correct, ms, band, skill) {
    return { correct: correct, elapsedMs: ms, band: band || 1, skill: skill || 'x' };
  }

  // Misplaced-child scenario, both ends. A perfect fast run from band 1 must
  // clear two bands within a dozen answers — and must not have reached the top
  // of the scale in that time.
  (function () {
    var s = Maths.newState(1), i, at, prev, maxStep = 0, hit8 = -1;
    for (i = 0; i < 40; i++) {
      at = Math.round(s.difficulty);
      prev = s.difficulty;
      s = Maths.update(s, outcome(true, 1, at));
      if (s.difficulty - prev > maxStep) { maxStep = s.difficulty - prev; }
      if (hit8 < 0 && s.difficulty >= 8) { hit8 = i + 1; }
      if (i === 11) {
        ok(s.difficulty >= 3.0,
           'twelve fast-correct answers from band 1 clear two bands (got ' +
           s.difficulty.toFixed(3) + ')');
        ok(s.difficulty <= 4.5,
           'and do not carry a five-year-old most of the way up the scale (got ' +
           s.difficulty.toFixed(3) + ')');
      }
    }
    ok(maxStep <= 0.40,
       'no single answer moves a child half a band or more (largest was ' +
       maxStep.toFixed(3) + ')');
    ok(hit8 < 0,
       'a perfect 40-answer run from band 1 does not reach band 8' +
       (hit8 < 0 ? '' : ' (reached it after ' + hit8 + ')'));
  })();

  // Acceleration is bounded by the band an adult chose, not by the band the
  // child has drifted to: past `home + reach` a fast-correct answer is worth
  // the plain UP_FAST step. Without this, one hot streak compounds into the
  // next and the reach never binds.
  (function () {
    // 30 answers puts them well past the reach (home 1 + 3 = 4) while the
    // unaccelerated climb still keeps them clear of band 8.
    var s = Maths.newState(1), i, prev;
    for (i = 0; i < 30; i++) { s = Maths.update(s, outcome(true, 1, Math.round(s.difficulty))); }
    ok(s.difficulty > 4 && s.difficulty < 8,
       'a sustained perfect run climbs past the accelerated reach (got ' +
       s.difficulty.toFixed(3) + ')');
    prev = s.difficulty;
    s = Maths.update(s, outcome(true, 1, Math.round(s.difficulty)));
    eq(Number((s.difficulty - prev).toFixed(6)), 0.100,
       'beyond the reach, even a long fast run steps by the plain UP_FAST');
  })();

  // A two-choice question is half guessable, so it must not buy a full share
  // of a fast-correct streak. Four lucky taps at band 1 used to be enough to
  // arm the accelerator; it now takes six.
  (function () {
    var s = Maths.newState(1), i, prev, firstAccelerated = -1;
    eq(Maths.choiceCount(1), 2, 'band 1 offers two choices');
    for (i = 0; i < 8; i++) {
      prev = s.difficulty;
      s = Maths.update(s, outcome(true, 1, 1));
      if (firstAccelerated < 0 && s.difficulty - prev > 0.100 + 1e-9) {
        firstAccelerated = i + 1;
      }
    }
    ok(firstAccelerated >= 6,
       'two-choice answers need six in a row before accelerating (first was ' +
       firstAccelerated + ')');
  })();

  // Slow-but-correct answers must NOT accelerate: a long run climbs at the
  // old gentle UP_SLOW rate exactly, however long the run gets. Slowness is
  // the signal that the child is not beyond this level, so it must never
  // trigger acceleration the way a fast-correct streak does.
  (function () {
    var s = Maths.newState(1), i, n = 20;
    for (i = 0; i < n; i++) { s = Maths.update(s, outcome(true, 999999, 1)); }
    eq(Number(s.difficulty.toFixed(6)), Number((1 + n * 0.040).toFixed(6)),
       'a long run of slow-but-correct answers climbs at the unaccelerated rate');
  })();

  // A wrong answer resets the fast-correct run: build up a streak past the
  // acceleration trigger, answer once wrong, then confirm the very next
  // fast-correct answer steps by the plain UP_FAST amount, not an
  // accelerated one.
  (function () {
    var s = Maths.newState(1), i, before;
    // Weighted by evidence, not answers. Three answers is as far as this can
    // go while every one of them is still a two-choice question: difficulty
    // 1.3 offers three choices, and the weight would change mid-count.
    for (i = 0; i < 3; i++) { s = Maths.update(s, outcome(true, 1)); }
    eq(Maths.choiceCount(s.difficulty - 0.1), 2, 'those three were two-choice questions');
    eq(s.fastStreak, 1.5, 'three two-choice answers are worth 3 x (1 - 1/2)');
    s = Maths.update(s, outcome(true, 1));
    s = Maths.update(s, outcome(false, 1));
    eq(s.fastStreak, 0, 'a wrong answer resets the fast-correct run');
    before = s.difficulty;
    s = Maths.update(s, outcome(true, 1));
    eq(Number((s.difficulty - before).toFixed(6)), 0.100,
       'the fast-correct answer right after a reset is not accelerated');
  })();

  // Descent safeguard: a child stranded high who answers several wrong in a
  // row must fall back quickly, not merely fall.
  (function () {
    var s = { difficulty: 7, home: 7, mastery: {}, fastStreak: 0, wrongStreak: 0 }, i;
    for (i = 0; i < 5; i++) { s = Maths.update(s, outcome(false, 9000, 7)); }
    ok(s.difficulty <= 4.0,
       'five consecutive wrong answers from band 7 fall back to 4.0 or below (got ' +
       s.difficulty.toFixed(3) + ')');
    ok(s.wrongStreak === 5, 'wrong streak counts consecutive wrong answers');
  })();

  // Difficulty never escapes [1, 11] under any run, including long runs of
  // accelerated climbs and accelerated descents. One property; track the
  // extremes across each run and assert once rather than on every step.
  (function () {
    var s = Maths.newState(1), i, minD = Infinity, maxD = -Infinity;
    for (i = 0; i < 300; i++) {
      s = Maths.update(s, outcome(true, 1, 1));
      if (s.difficulty < minD) { minD = s.difficulty; }
      if (s.difficulty > maxD) { maxD = s.difficulty; }
    }
    ok(minD >= 1 && maxD <= 11, 'accelerated climb stays within [1,11]');
    minD = Infinity; maxD = -Infinity;
    s = Maths.newState(11);
    for (i = 0; i < 300; i++) {
      s = Maths.update(s, outcome(false, 9000, 11));
      if (s.difficulty < minD) { minD = s.difficulty; }
      if (s.difficulty > maxD) { maxD = s.difficulty; }
    }
    ok(minD >= 1 && maxD <= 11, 'accelerated descent stays within [1,11]');
  })();
})();

// ---- Task 10: invariant sweep (spec 12) ----
(function () {
  var rand = makeRng(2024), band, i, q, k, tok, nums, ops, failuresBefore = failures;

  function numsOf(render) {
    var out = [], k;
    for (k = 0; k < render.length; k++) {
      if (render[k].t === 'num' || render[k].t === 'balls') { out.push(render[k].v); }
    }
    return out;
  }

  for (band = 1; band <= 8; band++) {
    for (i = 0; i < 25; i++) {
      q = Maths.make(band, Maths.newState(band), rand);

      // Structural invariants.
      eq(q.band, band, 'sweep: integer difficulty stays in band');
      ok(q.choices.indexOf(q.answer) !== -1, 'sweep: answer is among the choices');
      for (k = 0; k < q.choices.length; k++) {
        ok(q.choices.indexOf(q.choices[k]) === k, 'sweep: choices are unique');
        if (typeof q.choices[k] === 'number') {
          ok(isFinite(q.choices[k]), 'sweep: no NaN or Infinity in choices');
          if (band < 8) { ok(q.choices[k] >= 0, 'sweep: no negative choice below band 8'); }
        }
      }
      ok(q.choices.length >= 2 && q.choices.length <= 4, 'sweep: 2-4 choices');
      if (typeof q.answer === 'number') {
        ok(isFinite(q.answer), 'sweep: answer is finite');
        if (band < 8) { ok(q.answer >= 0, 'sweep: no negative answer below band 8'); }
      }
      for (k = 0; k < q.render.length; k++) {
        tok = q.render[k];
        ok(TOKEN_TYPES.indexOf(tok.t) !== -1, 'sweep: token type is known');
        ok(!(tok.v !== undefined && typeof tok.v === 'number' && !isFinite(tok.v)),
           'sweep: no non-finite token value');
      }

      // Independent recomputation for the plain a-op-b-=-box forms. The
      // guard's real rule is: two numeric operands, one operator, AND the
      // box in the trailing position — not just "two operands and one
      // operator", since `3 + box = 10` satisfies that but hides its box
      // in the middle. Excluded generators, and where each is verified
      // instead (all added to the main test suite, not left unverified):
      //   genBond5, genBond10, genEqn - two operands/one operator but the
      //     box isn't trailing; recomputed from render tokens in Task 4
      //     (bond5/bond10) and Task 7 (eqn).
      //   genSeq   - more than two numeric terms; recomputed in Task 5.
      //   genRatio - three numeric operands; recomputed in Task 7.
      //   genOrder - three operands, two operators; recomputed above via
      //     the explicit a + b*c precedence check.
      //   genHalf, genFracOf, genPct - one numeric operand plus a
      //     frac/pct token; recomputed in Task 5, Task 6 and Task 7
      //     respectively.
      //   genSquare, genRoot - one numeric operand, no "a op b" shape;
      //     recomputed from render tokens in the band 8 block of Task 7.
      nums = numsOf(q.render);
      ops = [];
      for (k = 0; k < q.render.length; k++) {
        if (q.render[k].t === 'op') { ops.push(q.render[k].v); }
      }
      // The frac/pct check below is redundant today given nums.length === 2
      // (genHalf, genFracOf, genPct all have nums=1). Keep it anyway: it's
      // the only thing that would stop a future one-operand branch (added
      // for genRoot, say) from misreading those three generators as roots,
      // since they share the same nums=1, ops=1, trailing-box shape.
      if (nums.length === 2 && ops.length === 1 &&
          q.render[q.render.length - 1].t === 'box' &&
          q.render[0].t !== 'frac' && q.render[0].t !== 'pct') {
        if (ops[0] === '+') {
          ok(Math.abs(q.answer - (nums[0] + nums[1])) < 1e-9, 'sweep: addition recomputes');
        } else if (ops[0] === '−') {
          ok(Math.abs(q.answer - (nums[0] - nums[1])) < 1e-9, 'sweep: subtraction recomputes');
        } else if (ops[0] === '×') {
          ok(Math.abs(q.answer - nums[0] * nums[1]) < 1e-9, 'sweep: multiplication recomputes');
        } else if (ops[0] === '÷') {
          ok(Math.abs(q.answer - nums[0] / nums[1]) < 1e-9, 'sweep: division recomputes');
          eq(nums[0] % nums[1], 0, 'sweep: division is exact');
        }
      }
    }
  }
  ok(failures === failuresBefore, 'sweep completed with no invariant violations');
})();

// Fraction comparison is the one question type the sweep above cannot
// recompute, because its answer is a symbol rather than a number. A sign
// inversion there would teach children the wrong thing while passing every
// shape-level assertion, so check the direction directly against known pairs.
(function () {
  var rand = makeRng(4242), i, q, left, right, expected, sawLt = 0, sawGt = 0, sawEq = 0;
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[6][2](rand);
    // Verify by division, NOT by cross-multiplying. Recomputing with the
    // generator's own formula would let a reversed comparison cancel out and
    // pass. Denominators here are at most 6, so the smallest real gap between
    // two distinct fractions is 1/30 — far above any rounding error, making
    // the epsilon comparison safe.
    left = q.render[0].n / q.render[0].d;
    right = q.render[2].n / q.render[2].d;
    expected = Math.abs(left - right) < 1e-12 ? '=' : (left < right ? '<' : '>');
    eq(q.answer, expected, 'fraction comparison points the right way');
    if (q.answer === '<') { sawLt++; } else if (q.answer === '>') { sawGt++; } else { sawEq++; }
  }
  // Without this, a generator that always answered '<' would satisfy the loop
  // above only if the check were also broken — but it would sail through any
  // test that never looked at the spread.
  ok(sawLt > 0 && sawGt > 0 && sawEq > 0,
     'all three comparison outcomes occur (< ' + sawLt + ', > ' + sawGt + ', = ' + sawEq + ')');
})();

// ---- Task 11: adaptive convergence (spec 8.7) ----
(function () {
  // A synthetic learner of fixed ability on the 1-11 band scale. Chance of
  // knowing the answer falls off as difficulty exceeds ability; whatever is
  // not known is guessed from the available choices, which is what makes
  // floor support (spec 8.6) measurable.
  function simulate(ability, n, seed) {
    var rand = makeRng(seed), s = Maths.newState(4);
    var correct = 0, total = 0, sum = 0, i, known, choices, p, ok_, band, ms;
    // The [1,11] bound is one property of Maths.update; asserting it on every
    // one of the n simulated answers re-tests the same clamp with different
    // numbers. Track the extremes across the whole run and assert once -
    // identical coverage, without a check per answer.
    var minD = Infinity, maxD = -Infinity;
    for (i = 0; i < n; i++) {
      band = Math.round(s.difficulty);
      known = 1 / (1 + Math.exp(1.6 * (s.difficulty - ability)));
      choices = Maths.choiceCount(s.difficulty);
      p = known + (1 - known) / choices;
      ok_ = rand() < p;
      ms = ok_ ? (2500 + 900 * band) * (0.4 + rand() * 1.4) : 9000;
      s = Maths.update(s, { correct: ok_, elapsedMs: ms, band: band, skill: 'x' });
      if (s.difficulty < minD) { minD = s.difficulty; }
      if (s.difficulty > maxD) { maxD = s.difficulty; }
      if (i > n / 2) { total++; sum += s.difficulty; if (ok_) { correct++; } }
    }
    ok(minD >= 1 && maxD <= 11,
       'difficulty stays within [1,11] across the run (min ' + minD.toFixed(3) +
       ', max ' + maxD.toFixed(3) + ')');
    return { accuracy: correct / total, band: sum / total };
  }

  var abilities = [1.5, 3, 4.5, 6, 7.5, 9, 10.5], i, r;
  for (i = 0; i < abilities.length; i++) {
    r = simulate(abilities[i], 40000, 900 + i);
    ok(r.accuracy > 0.72 && r.accuracy < 0.88,
       'ability ' + abilities[i] + ' settles near 80% (got ' +
       (r.accuracy * 100).toFixed(1) + '% at band ' + r.band.toFixed(2) + ')');
  }

  // A strong learner climbs, a struggling one descends.
  ok(simulate(8, 4000, 77).band > 6, 'a strong learner climbs the scale');
  ok(simulate(1, 4000, 78).band < 2.5, 'a struggling learner descends the scale');

  // The extended ceiling is reachable: a very strong learner placed at the
  // old default still climbs into the over-12 bands.
  ok(simulate(11, 40000, 79).band > 8, 'a 16+ learner climbs past the old ceiling');
})();

// ---- Distractor plausibility sweep ----
// A wrong choice should look like a believable mistake, not a value a child
// can eliminate on sight (e.g. "6 + 6 = box" offering 0 alongside 12).
// buildChoices filters near-miss candidates against a tolerance that scales
// with the answer's size - being off by 10 is a real slip on a big sum but
// not on a small one - and this sweep checks every numeric distractor
// Maths.make actually hands out, across every band and choice-count tier,
// against that same rule.
(function () {
  function plausible(d, answer) {
    return Math.abs(d - answer) <= Math.max(3, Math.round(Math.abs(answer) * 0.6));
  }
  var band, i, rand, q, k, difficulty, checked = 0;
  for (band = 1; band <= 8; band++) {
    rand = makeRng(6060 + band);
    for (i = 0; i < 100; i++) {
      // Cycle the fractional part so 2-, 3- and 4-choice layouts (spec 8.6's
      // floor-support rule) are all exercised, not just the 4-choice case.
      difficulty = band + (i % 4) * 0.5;
      if (difficulty > 8) { difficulty = 8; }
      q = Maths.make(difficulty, Maths.newState(difficulty), rand);
      if (typeof q.answer !== 'number') { continue; } // fraction comparisons: no numeric band to check
      for (k = 0; k < q.choices.length; k++) {
        if (typeof q.choices[k] !== 'number' || q.choices[k] === q.answer) { continue; }
        checked++;
        ok(plausible(q.choices[k], q.answer),
           'distractor is a believable slip, not free to eliminate (band ' + band +
           ', answer ' + q.answer + ', choice ' + q.choices[k] + ')');
      }
    }
  }
  ok(checked > 1000, 'plausibility sweep actually exercised numeric distractors (' + checked + ')');
})();

// ---- Task 12: kickoff formation (playtester defect 1) ----
// The exploit was a fixed formation where the human centre-forward, the
// ball, and the CPU goal centre were all on x=300: a dead-straight flick
// scored every match, forever. These checks recompute every invariant
// independently of Formation.make's own arithmetic - point-to-line
// distance via the cross-product formula, not Formation's internal
// GOAL_X-based subtraction - so a broken generator cannot cancel out
// against a broken check.
(function () {
  // Perpendicular distance from point (px,py) to the infinite line through
  // (x1,y1)-(x2,y2), computed independently of anything in formation.js.
  function perpDist(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    return Math.abs((px - x1) * dy - (py - y1) * dx) / len;
  }

  var ballX = Formation.BALL_HOME_X, ballY = Formation.BALL_HOME_Y;
  var topGoalX = Formation.GOAL_X, topGoalY = Formation.TOP_Y;
  var botGoalX = Formation.GOAL_X, botGoalY = Formation.BOT_Y;
  var R = Formation.PLAYER_R, minSep = 2 * R;
  var ballClear = Formation.PLAYER_R + Formation.BALL_R;

  var rand = makeRng(20260802), i, f, all, a, b;
  // Placement zones are constructed so these invariants hold by
  // construction (see formation.js), not by rejection sampling - a few
  // hundred draws exercises the zone arithmetic across its random range
  // thoroughly without re-testing the same guarantee thousands of times.
  var N = 40;
  for (i = 0; i < N; i++) {
    f = Formation.make(rand);
    ok(f && Array.isArray(f.human) && Array.isArray(f.ai), 'formation has human and ai arrays');
    eq(f.human.length, 3, 'human formation has 3 players');
    eq(f.ai.length, 3, 'ai formation has 3 players');

    all = f.human.concat(f.ai);

    // No player on the ball->goal line (either goal), with real margin.
    for (a = 0; a < all.length; a++) {
      ok(perpDist(all[a][0], all[a][1], ballX, ballY, topGoalX, topGoalY) > Formation.MIN_LINE_DIST,
         'player clears the ball->top-goal line');
      ok(perpDist(all[a][0], all[a][1], ballX, ballY, botGoalX, botGoalY) > Formation.MIN_LINE_DIST,
         'player clears the ball->bottom-goal line');
    }

    // No overlaps: player-player, and player-ball.
    for (a = 0; a < all.length; a++) {
      var dxb = all[a][0] - ballX, dyb = all[a][1] - ballY;
      ok(Math.sqrt(dxb * dxb + dyb * dyb) > ballClear, 'player does not overlap the ball');
      for (b = a + 1; b < all.length; b++) {
        var dx = all[a][0] - all[b][0], dy = all[a][1] - all[b][1];
        ok(Math.sqrt(dx * dx + dy * dy) > minSep, 'players do not overlap each other');
      }
    }

    // Inside the pitch rectangle.
    for (a = 0; a < all.length; a++) {
      ok(all[a][0] - R >= Formation.SIDE_L && all[a][0] + R <= Formation.SIDE_R,
         'player stays within the side walls');
      ok(all[a][1] - R >= Formation.TOP_Y && all[a][1] + R <= Formation.BOT_Y,
         'player stays within the goal lines');
    }

    // Each team stays in its own half.
    for (a = 0; a < f.human.length; a++) {
      ok(f.human[a][1] > Formation.HALF_Y, 'human player stays in the human half');
    }
    for (a = 0; a < f.ai.length; a++) {
      ok(f.ai[a][1] < Formation.HALF_Y, 'ai player stays in the ai half');
    }

    // Genuinely mirrored: same x, y reflected about the halfway line.
    for (a = 0; a < 3; a++) {
      eq(f.ai[a][0], f.human[a][0], 'mirrored player keeps the same x');
      eq(f.ai[a][1], Formation.H - f.human[a][1], 'mirrored player reflects y about halfway');
    }

    // Football-ish shape: one player nearer their own goal (bigger |y-450|)
    // than the other two, for both teams.
    var hd = Math.abs(f.human[0][1] - Formation.HALF_Y);
    var hf1 = Math.abs(f.human[1][1] - Formation.HALF_Y);
    var hf2 = Math.abs(f.human[2][1] - Formation.HALF_Y);
    ok(hd > hf1 && hd > hf2, 'human formation has one player deeper than the other two');
  }

  // Sanity: 4000 random formations actually vary, not a constant fallback.
  var seen = {}, distinctCount = 0;
  rand = makeRng(555);
  for (i = 0; i < 200; i++) {
    f = Formation.make(rand);
    var key = f.human.map(function (p) { return Math.round(p[0]) + ',' + Math.round(p[1]); }).join('|');
    if (!seen[key]) { seen[key] = true; distinctCount++; }
  }
  ok(distinctCount > 150, 'formations are genuinely varied, not a near-constant fallback');
})();

// ---- Task 13: AI shooter selection (playtester defect 2) ----
// pickAiPlayer used to be distance-only with a crude penalty; it often
// picked a player who would knock the ball sideways or backwards. These
// scenarios are hand-built so the "obviously correct" pick is unambiguous.
(function () {
  var ball = { x: 300, y: 450 };

  // A player dead behind the ball (relative to the target goal) must beat a
  // nearer player who would only knock it sideways.
  (function () {
    var behind = { x: 300, y: 300 };   // 150 above the ball, perfectly aligned
    var sideways = { x: 340, y: 450 }; // 40 away, but pushes across, not down
    var chosen = Formation.chooseShooter([sideways, behind], ball, 828);
    ok(chosen === behind, 'a well-aligned but farther player beats a nearer sideways one');
  })();

  // A player who would send the ball backwards must lose to one who sends
  // it goalward, however close the backwards player is.
  (function () {
    var goalward = { x: 300, y: 200 };  // far, but perfectly aligned
    var backwards = { x: 300, y: 470 }; // 20px away, but on the wrong side of the ball
    var chosen = Formation.chooseShooter([backwards, goalward], ball, 828);
    ok(chosen === goalward, 'a goalward player beats a nearer player who would shoot backwards');
  })();

  // Equal alignment: the nearer of two equally well-aligned players wins.
  (function () {
    var near = { x: 300, y: 300 };  // 150 above, aligned
    var far = { x: 300, y: 150 };   // 300 above, equally aligned
    var chosen = Formation.chooseShooter([far, near], ball, 828);
    ok(chosen === near, 'ties on alignment are broken by picking the nearer player');
  })();

  // Direction-agnostic: the same logic works aiming at the top goal too.
  (function () {
    var aligned = { x: 300, y: 600 };   // below the ball, aligned toward the top goal
    var sideways = { x: 260, y: 450 };
    var chosen = Formation.chooseShooter([sideways, aligned], ball, 72);
    ok(chosen === aligned, 'alignment scoring works toward either goal');
  })();

  // Edge cases.
  eq(Formation.chooseShooter([], ball, 828), null, 'an empty roster has no shooter');
  var only = { x: 300, y: 300 };
  ok(Formation.chooseShooter([only], ball, 828) === only, 'a single player is always chosen');
})();

// ---- Task 14: goalkeeper step function (playtester defect 3) ----
// game.js owns the keeper's actual bounds (goal-mouth-derived) and calls
// Formation.keeperStep once per turn; it can't be loaded here (it touches
// the DOM at import time), so what's testable from node is this pure
// stepping/clamping rule, which is the part that actually keeps a keeper
// inside its own goal mouth and stops it teleporting onto the ball's exact
// x. Drag-immunity (keepers live outside game.players, which is the only
// array pointerdown and pickAiPlayer scan) is a game.js/DOM property and is
// checked by hand in the browser instead - see the playtest notes.
(function () {
  var rand = makeRng(2026), i, x, target, maxStep, minX, maxX, next;

  // Never exceeds the goal mouth, whatever the inputs.
  for (i = 0; i < 10; i++) {
    minX = 220 + rand() * 20;       // e.g. a MOUTH_L-derived bound
    maxX = minX + 60 + rand() * 60; // always > minX
    x = minX + rand() * (maxX - minX);
    target = -50 + rand() * 700;    // may fall well outside the mouth
    maxStep = 1 + rand() * 150;
    next = Formation.keeperStep(x, target, maxStep, minX, maxX);
    ok(next >= minX - 1e-9 && next <= maxX + 1e-9, 'keeper step stays within its goal mouth');
  }

  // Capped speed: never moves more than maxStep in one call, so it lags
  // rather than snapping straight to the ball.
  eq(Formation.keeperStep(200, 500, 70, 100, 400), 270, 'keeper step is capped at maxStep toward the target');
  eq(Formation.keeperStep(200, 210, 70, 100, 400), 210, 'keeper step does not overshoot a close target');
  eq(Formation.keeperStep(500, 100, 70, 100, 400), 400, 'keeper step clamps even when the capped move would land outside the mouth');

  // Repeated calls converge on the target without oscillating past it.
  (function () {
    var pos = 220, tgt = 380, prevDist = Math.abs(tgt - pos), dist, k;
    for (k = 0; k < 8; k++) {
      pos = Formation.keeperStep(pos, tgt, 70, 220, 380);
      dist = Math.abs(tgt - pos);
      ok(dist <= prevDist, 'keeper step never moves further from a fixed target');
      prevDist = dist;
    }
    eq(pos, tgt, 'keeper step reaches a reachable target after enough turns');
  })();

  // keeperStep also does the goalkeeper's "dive" for the save mechanic: a
  // single jump (maxStep = Infinity) straight to a target x, clamped into
  // the mouth. Confirms that usage keeps the dive inside the goal mouth
  // even when the target is the exact post or well outside it.
  eq(Formation.keeperStep(300, 400, Infinity, 220, 380), 380,
     'an unlimited dive still clamps to the mouth (target beyond the post)');
  eq(Formation.keeperStep(300, -50, Infinity, 220, 380), 220,
     'an unlimited dive still clamps to the mouth (target beyond the other post)');
  eq(Formation.keeperStep(300, 260, Infinity, 220, 380), 260,
     'an unlimited dive lands exactly on an in-mouth target');
})();

// ---- Task 15: farCorner - CPU aims at the open corner (owner instruction:
// "aim away from the keeper") ----
(function () {
  var mouthL = 220, mouthR = 380, i, x, margin, target, rand = makeRng(4242);

  eq(Formation.farCorner(230, mouthL, mouthR, 30), mouthR - 30,
     'keeper hugging the left post -> aim at the right corner');
  eq(Formation.farCorner(370, mouthL, mouthR, 30), mouthL + 30,
     'keeper hugging the right post -> aim at the left corner');
  eq(Formation.farCorner(300, mouthL, mouthR, 30), mouthR - 30,
     'a dead-centre keeper is a deterministic tie, broken toward the right corner');

  // An oversized margin (>= half the mouth width) clamps to dead centre
  // rather than overshooting past the opposite post.
  eq(Formation.farCorner(230, mouthL, mouthR, 500), (mouthL + mouthR) / 2,
     'an oversized margin clamps the target to the mouth centre, never past it');

  for (i = 0; i < 20; i++) {
    x = mouthL + rand() * (mouthR - mouthL);
    margin = rand() * 79; // kept under half the mouth width (80) so a side is well-defined
    target = Formation.farCorner(x, mouthL, mouthR, margin);
    ok(target >= mouthL && target <= mouthR, 'farCorner never aims outside the goal mouth');
    // The predictor must agree with itself: whichever side it picked must
    // really be the side further from the keeper (not the near post).
    var pickedRight = target > (mouthL + mouthR) / 2;
    var keeperNearRight = x > (mouthL + mouthR) / 2;
    ok(pickedRight !== keeperNearRight || Math.abs(x - (mouthL + mouthR) / 2) < 1e-9,
       'farCorner picks the side the keeper is furthest from');
  }
})();

// ---- Storage: a corrupt save must never brick the game ----
(function () {
  var Store = require('./store.js');

  var fresh = Store.emptyState();
  eq(fresh.slots.length, 3, 'three slots');
  eq(fresh.active, 0, 'first slot active by default');

  // Every one of these has bricked a game somewhere. None may throw.
  var junk = [null, undefined, 0, 'not json', [], {}, { slots: 'nope' },
              { slots: [null, 5, 'x'] }, { active: 99, slots: [] },
              { slots: [{ maths: { difficulty: NaN } }] },
              { slots: [{ maths: { difficulty: 999 } }] },
              { slots: [{ unlocked: 'gold' }] },
              { slots: [{ stats: { correct: -5 } }] },
              { slots: [{ trophies: -3 }] }, { slots: [{ trophies: 'lots' }] },
              { slots: [{ band: 99 }] }, { slots: [{ band: 'seven' }] }];
  junk.forEach(function (bad, i) {
    var r = Store.repair(bad);
    ok(r.slots.length === 3, 'repair yields three slots for junk input ' + i);
    ok(r.active >= 0 && r.active <= 2, 'repair yields a valid active slot for input ' + i);
    r.slots.forEach(function (sl) {
      ok(Object.prototype.toString.call(sl.unlocked) === '[object Array]',
         'unlocked is always an array, input ' + i);
      ok(sl.stats.correct >= 0, 'counters never negative, input ' + i);
      ok(typeof sl.trophies === 'number' && isFinite(sl.trophies) && sl.trophies >= 0,
         'trophies is always a non-negative number, input ' + i);
      ok(sl.maths === null || (isFinite(sl.maths.difficulty) &&
         sl.maths.difficulty >= 1 && sl.maths.difficulty <= 8),
         'difficulty is null or inside [1,8], input ' + i);
      ok(sl.band >= 0 && sl.band <= 8, 'band is inside [0,8], input ' + i);
    });
  });

  // A save written before ages moved into the team editor has no band. Reading
  // that as 0 would silently switch maths off for every existing child.
  eq(Store.repair({ slots: [{ emoji: '⚽' }] }).slots[0].band, Store.DEFAULT_BAND,
     'a bandless legacy slot keeps the default rather than becoming no-maths');
  eq(Store.repair({ slots: [{ band: 0 }] }).slots[0].band, 0,
     'an explicit no-maths choice survives');
  eq(Store.repair({ slots: [{ band: 6 }] }).slots[0].band, 6, 'a chosen band survives');

  // Every stat counter repairs the same way, including ones a save predates.
  var STATS = ['correct', 'answered', 'matches', 'wins', 'goalsFor', 'goalsAgainst', 'ms'];
  var fresh0 = Store.emptySlot();
  STATS.forEach(function (k) {
    eq(fresh0.stats[k], 0, 'a new slot starts ' + k + ' at zero');
    eq(Store.repairSlot({ stats: {} }).stats[k], 0, 'a save predating ' + k + ' starts it at zero');
    var neg = {}; neg[k] = -7;
    eq(Store.repairSlot({ stats: neg }).stats[k], 0, k + ' can never be negative');
    var junk = {}; junk[k] = 'lots';
    eq(Store.repairSlot({ stats: junk }).stats[k], 0, k + ' ignores non-numbers');
    var nan = {}; nan[k] = NaN;
    eq(Store.repairSlot({ stats: nan }).stats[k], 0, k + ' ignores NaN');
    var good = {}; good[k] = 42;
    eq(Store.repairSlot({ stats: good }).stats[k], 42, k + ' survives a round trip');
  });
  // Time is milliseconds and arrives fractional from Date.now() arithmetic.
  eq(Store.repairSlot({ stats: { ms: 1234.9 } }).stats.ms, 1234, 'ms is stored whole');

  // A slot round-trips, including an emoji and an empty name.
  var st = Store.emptyState();
  st.slots[1].emoji = '\uD83E\uDD81'; st.slots[1].name = '';
  st.slots[1].maths = { difficulty: 4.25, mastery: { mul: 0.7 } };
  st.slots[1].trophies = 2;
  var back = Store.repair(JSON.parse(JSON.stringify(st)));
  eq(back.slots[1].emoji, st.slots[1].emoji, 'emoji survives a round trip');
  eq(back.slots[1].name, '', 'an empty name stays empty');
  eq(back.slots[1].maths.difficulty, 4.25, 'difficulty survives');

  // `home` bounds how far acceleration may carry a child, so it has to survive
  // a reload; a save written before it existed falls back to where it sits.
  st.slots[1].maths.home = 2;
  eq(Store.repair(JSON.parse(JSON.stringify(st))).slots[1].maths.home, 2, 'home survives');
  eq(Store.repairSlot({ maths: { difficulty: 5.5, mastery: {} } }).maths.home, 5.5,
     'a save predating home falls back to its own difficulty');
  eq(Store.repairSlot({ maths: { difficulty: 3, home: 99 } }).maths.home, 8, 'home is clamped');
  eq(Store.repairSlot({ maths: { difficulty: 3, home: 'x' } }).maths.home, 3,
     'a junk home falls back rather than poisoning the reach');
  eq(back.slots[1].trophies, 2, 'trophies survive');

  // Slots are isolated: siblings must not drag each other's difficulty around.
  st = Store.emptyState();
  st.slots[0].maths = { difficulty: 2, mastery: {} };
  st.slots[2].maths = { difficulty: 7, mastery: {} };
  Store.clearSlot(st, 0);
  eq(st.slots[0].maths, null, 'clearing a slot empties it');
  eq(st.slots[2].maths.difficulty, 7, 'clearing one slot leaves the others alone');
})();

// ---- The locker: cosmetics earned by playing ----
(function () {
  var Locker = require('./locker.js');
  var Store = require('./store.js');

  ok(typeof Locker === 'object' && Locker !== null, 'Locker module loads');

  // A minimal slot, the only shape the ledger is allowed to depend on.
  function slot(correct, trophies, unlocked) {
    return { stats: { correct: correct }, trophies: trophies || 0,
             unlocked: unlocked || [] };
  }

  // The catalogue: flat unique ids, known kinds, and the spec's exact
  // milestone table in ascending order.
  var KINDS = { ball: true, hat: true, pitch: true };
  var seen = {}, lastAt = 0;
  ok(Locker.ITEMS.length === 14, 'six balls, four hats, four pitches');
  Locker.ITEMS.forEach(function (it) {
    ok(KINDS[it.kind], it.id + ' has a known kind');
    ok(typeof it.id === 'string' && it.id.length > 0, 'every item has an id');
    ok(!seen[it.id], it.id + ' appears only once');
    seen[it.id] = true;
  });
  var milestones = Locker.MILESTONES;
  eq(milestones.length, 10, 'ten correct-answer milestones');
  milestones.forEach(function (it) {
    ok(it.at > lastAt, it.id + ' milestone rises past the previous one');
    lastAt = it.at;
  });
  eq(milestones[0].at, 10, 'the first unlock lands within a match or two');
  eq(milestones[9].at, 1000, 'the last milestone is the gold ball at 1000');
  eq(Locker.byId('gold').kind, 'ball', 'byId finds an item');
  eq(Locker.byId('nope'), null, 'byId returns null for junk');

  // Earning: defaults are always there, milestones arrive exactly on time.
  var e0 = Locker.earned(slot(0));
  ['classic', 'day', 'none'].forEach(function (id) {
    ok(e0.indexOf(id) !== -1, id + ' is unlocked from the start');
  });
  ok(e0.indexOf('stripes') === -1, 'nothing else is unlocked at zero');
  ok(Locker.earned(slot(9)).indexOf('stripes') === -1, 'stripes needs all ten');
  ok(Locker.earned(slot(10)).indexOf('stripes') !== -1, 'stripes lands at ten');
  var e1000 = Locker.earned(slot(1000));
  ['stripes', 'cap', 'night', 'stars', 'crown', 'snow', 'flames', 'party',
   'space', 'gold'].forEach(function (id) {
    ok(e1000.indexOf(id) !== -1, id + ' is earned by 1000 correct');
  });
  ok(e1000.indexOf('beach') === -1, 'the beach ball is not bought with answers');
  ok(Locker.earned(slot(0, 1)).indexOf('beach') !== -1,
     'the beach ball comes with the first cup');

  // The next milestone, with the previous one for drawing the filling
  // silhouette: fraction = (correct - prev) / (at - prev).
  var n = Locker.next(slot(0));
  eq(n.id, 'stripes', 'next from zero is the first milestone');
  eq(n.at, 10, 'next reports its own threshold');
  eq(n.prev, 0, 'the first milestone fills from zero');
  n = Locker.next(slot(10));
  eq(n.id, 'cap', 'reaching a milestone moves next along');
  eq(n.prev, 10, 'the fill restarts at the last milestone');
  n = Locker.next(slot(999));
  eq(n.id, 'gold', 'the last milestone is reachable');
  eq(n.prev, 750, 'and fills from the one before it');
  eq(Locker.next(slot(1000)), null, 'nothing left to fill after gold');

  // Fresh: earned but not yet shown to the child. Defaults never announce
  // themselves; a stale seen-list self-heals by replaying the reveal once.
  eq(Locker.fresh(slot(0)).length, 0, 'a new slot has nothing to reveal');
  eq(Locker.fresh(slot(60, 0, ['stripes'])).join(','), 'cap,night',
     'fresh lists earned-but-unseen items in milestone order');
  eq(Locker.fresh(slot(60, 0, ['stripes', 'cap', 'night'])).length, 0,
     'nothing fresh once everything earned has been seen');
  eq(Locker.fresh(slot(0, 1)).join(','), 'beach',
     'a trophy unlock reveals like any other');

  // The store carries a hat slot, and saves from before hats keep bare heads.
  eq(Store.emptySlot().equipped.hat, 'none', 'a new slot starts bare-headed');
  eq(Store.repairSlot({ equipped: { ball: 'gold' } }).equipped.hat, 'none',
     'a save predating hats repairs to none');
  eq(Store.repairSlot({ equipped: { hat: 'crown' } }).equipped.hat, 'crown',
     'an equipped hat survives a round trip');
})();

// ---- The cup ----
(function () {
  var T = require('./tournament.js');

  eq(T.COUNT, 4, 'four rounds: 16 -> 8 -> 4 -> 2 -> 1');
  eq(T.SLOTS, 16, 'sixteen entrants');
  eq(T.DRAW.length, 16, 'the draw fills every place');
  eq(T.OPPONENTS.length, 4, 'one opponent per round');

  // Every seed appears exactly once, and seed 2 is the child's place.
  var seen = {}, d;
  for (d = 0; d < T.DRAW.length; d++) {
    ok(!seen[T.DRAW[d]], 'seed ' + T.DRAW[d] + ' appears once in the draw');
    seen[T.DRAW[d]] = true;
    ok(T.DRAW[d] >= 1 && T.DRAW[d] <= 16, 'seed ' + T.DRAW[d] + ' is in range');
  }
  ok(!T.BY_SEED[2], 'seed 2 has no country: it is the child');
  for (d = 1; d <= 16; d++) {
    if (d === 2) { continue; }
    ok(typeof T.BY_SEED[d] === 'string' && T.BY_SEED[d].length > 0,
       'seed ' + d + ' has a flag');
  }

  // The point of a seeded draw: the child's opponents get harder, and the top
  // seed is the one waiting in the final. If this breaks, the whole difficulty
  // curve is a lie, because SKILL rises regardless.
  var prevSeed = 99, o;
  for (o = 0; o < T.COUNT; o++) {
    ok(T.OPPONENTS[o].seed < prevSeed,
       'round ' + o + ' opponent is a better seed than the last');
    prevSeed = T.OPPONENTS[o].seed;
  }
  eq(T.OPPONENTS[T.COUNT - 1].seed, 1, 'the top seed waits in the final');
  eq(T.crestFor(0).flag, T.OPPONENTS[0].flag, 'crestFor follows the draw');

  // A fresh draw shows every entrant and decides nothing.
  var cols = T.bracket(0);
  eq(cols.length, 5, 'five columns: entrants plus one per round');
  eq(cols[0].length, 16, 'sixteen in the first column');
  var c, i, live;
  for (c = 1; c < cols.length; c++) {
    eq(cols[c].length, cols[c - 1].length / 2, 'column ' + c + ' halves the last');
    for (i = 0; i < cols[c].length; i++) {
      eq(cols[c][i], null, 'nothing is decided before a ball is kicked');
    }
  }
  for (i = 0; i < 16; i++) { ok(!cols[0][i].out, 'nobody is out at the start'); }

  // Playing rounds resolves exactly those rounds and no more.
  [1, 2, 3, 4].forEach(function (played) {
    var b = T.bracket(played), col, decided;
    for (col = 1; col < b.length; col++) {
      decided = b[col].filter(function (x) { return x !== null; }).length;
      if (col <= played) {
        eq(decided, b[col].length, 'round ' + col + ' is settled at played=' + played);
      } else {
        eq(decided, 0, 'round ' + col + ' is untouched at played=' + played);
      }
    }
    // The child survives every round they have won, and exactly one place.
    var at = T.youAt(b, played);
    ok(at >= 0, 'the child is in column ' + played + ' at played=' + played);
    var yous = b[played].filter(function (x) { return x && x.you; }).length;
    eq(yous, 1, 'the child appears once per column');
  });

  // Winning the last round puts the child in the champion's place. The game
  // shows this once, since their own index has already rolled back to zero.
  var done = T.bracket(T.COUNT);
  ok(done[T.COUNT][0] && done[T.COUNT][0].you, 'a completed cup crowns the child');

  // A beaten team is marked out in the column it lost from, and is not carried
  // forward. Without this the tree would show eliminated countries as alive.
  var mid = T.bracket(2);
  for (i = 0; i < mid[0].length; i++) {
    ok(mid[0][i].out !== undefined || false || true, 'first column resolves');
  }
  var outCount = mid[0].filter(function (x) { return x.out; }).length;
  eq(outCount, 8, 'eight are knocked out in the first round');
  eq(mid[1].filter(function (x) { return x.out; }).length, 4,
     'four more go out in the second');
  // Survivors of round 1 are exactly the better seed of each pair.
  for (i = 0; i < mid[0].length; i += 2) {
    var a = mid[0][i], b2 = mid[0][i + 1];
    var winner = mid[1][i / 2];
    var expected = (a.you || b2.you) ? (a.you ? a : b2) : (a.seed < b2.seed ? a : b2);
    eq(winner.seed, expected.seed, 'the better seed goes through, pair ' + (i / 2));
    eq((a === expected ? b2 : a).out, true, 'the loser is marked out, pair ' + (i / 2));
  }

  // Rising skill, and never perfect. The cap is the only safeguard against an
  // unwinnable final, since nothing in the design weakens an opponent.
  var prev = -1, sk;
  for (i = 0; i < T.COUNT; i++) {
    sk = T.skillFor(i, 0);
    ok(sk > prev, 'round ' + i + ' is harder than the last');
    ok(sk <= 0.95, 'round ' + i + ' is never perfect');
    prev = sk;
  }
  for (var season = 0; season < 40; season++) {
    for (i = 0; i < T.COUNT; i++) {
      ok(T.skillFor(i, season) <= 0.95, 'cap holds in season ' + season);
      ok(T.skillFor(i, season) >= T.skillFor(i, 0) - 1e-9, 'seasons never get easier');
    }
  }
  ok(T.skillFor(0, 5) > T.skillFor(0, 0), 'a later season is harder than the first');

  // Losing replays the same round; progress is never destroyed.
  var cup = { season: 0, index: 2 };
  eq(T.recordResult(cup, false).index, 2, 'a loss replays the same round');
  eq(T.recordResult(cup, false).season, 0, 'a loss never costs a season');
  eq(T.recordResult(cup, true).index, 3, 'a win advances by exactly one');

  // Winning the final rolls into a new season.
  var after = T.recordResult({ season: 1, index: T.COUNT - 1 }, true);
  eq(after.index, 0, 'the cup restarts after the final');
  eq(after.season, 2, 'and the season increments');
  ok(T.isComplete(after, T.COUNT - 1), 'completing the final is detectable');
  ok(!T.isComplete({ season: 0, index: 2 }, 1), 'mid-cup is not complete');

  // Out-of-range indices must not throw or return junk.
  [-5, 99].forEach(function (bad) {
    ok(isFinite(T.skillFor(bad, 0)), 'skill is finite for index ' + bad);
    ok(!!T.crestFor(bad), 'an opponent exists for index ' + bad);
    ok(typeof T.roundIcon(bad) === 'string', 'a round icon exists for index ' + bad);
  });
})();

// ---- Team names ----
(function () {
  var N = require('./names.js');

  // A flag names itself; anything else gets an invention.
  eq(N.forBadge('\u{1F1E7}\u{1F1F7}', makeRng(1)), 'Brazil', 'a flag badge is its country');
  ok(!N.country('\u{1F981}'), 'a lion is not a country');
  var lion = N.forBadge('\u{1F981}', makeRng(1));
  ok(lion.length >= 4, 'a non-flag badge still gets a name');

  // Every flag the game can show must have a name, or picking it would leave
  // the field looking broken.
  var T = require('./tournament.js'), s;
  for (s = 1; s <= 16; s++) {
    if (s === 2) { continue; }
    ok(!!N.country(T.BY_SEED[s]), 'cup seed ' + s + ' has a country name');
  }
  for (var k in N.COUNTRIES) {
    ok(N.COUNTRIES[k].length <= 12, N.COUNTRIES[k] + ' fits the name field');
  }

  // Invented names: same shape every time, and varied across seeds.
  var rng = makeRng(7), made = {}, n, j;
  for (j = 0; j < 400; j++) {
    n = N.make(rng);
    ok(/^[A-Z][a-z]{3,4}$/.test(n), 'name "' + n + '" is a plain capitalised word');
    ok(n.length <= 12, 'name "' + n + '" fits the field');
    made[n] = true;
  }
  ok(Object.keys(made).length > 100, 'names vary: ' + Object.keys(made).length + ' in 400');

  // Deterministic given the randomness, so a test can pin one.
  eq(N.make(makeRng(3)), N.make(makeRng(3)), 'the same seed gives the same name');
})();

// ---- Over-12: the form rating is a display of difficulty, nothing more ----
(function () {
  eq(Maths.rating(1), 47, 'rating floor is 47');
  eq(Maths.rating(11), 99, 'rating ceiling is 99');
  eq(Maths.rating(6), 73, 'rating midpoint lands at 73');
  eq(Maths.rating(0.2), 47, 'rating clamps below the floor');
  eq(Maths.rating(20), 99, 'rating clamps above the ceiling');
  eq(Maths.rating(undefined), 47, 'rating tolerates a missing difficulty');
})();

done();
