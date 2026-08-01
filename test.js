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

// ---- Band generator shared checks (used by Tasks 4-7) ----
var TOKEN_TYPES = ['num', 'balls', 'op', 'eq', 'box', 'frac', 'bar', 'sep', 'pct', 'pow'];

function checkGenerators(band, allowNegative) {
  var gens = Maths._BANDS[band], rand = makeRng(1000 + band), g, q, i, k, tok;
  ok(gens && gens.length > 0, 'band ' + band + ' has generators');
  for (g = 0; g < gens.length; g++) {
    for (i = 0; i < 300; i++) {
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
  for (i = 0; i < 400; i++) {
    q = Maths._BANDS[1][0](rand);
    ok(q.answer <= 5, 'band 1 counting answers stay within 5');
    for (var k = 0; k < q.render.length; k++) {
      if (q.render[k].t === 'balls') { usedBalls = true; }
    }
  }
  ok(usedBalls, 'band 1 renders quantities as footballs');

  for (i = 0; i < 400; i++) {
    q = Maths._BANDS[2][0](rand);
    ok(q.answer <= 10, 'band 2 addition stays within 10');
  }

  // Bonds-to-5/10 render as `a + box = target`; recompute independently
  // from the rendered parts rather than repeating the generator's own
  // `target - a` formula.
  for (i = 0; i < 400; i++) {
    q = Maths._BANDS[1][1](rand);
    eq(q.answer + q.render[0].v, q.render[4].v,
       'bond-to-5 recomputes from the rendered parts');
  }
  for (i = 0; i < 400; i++) {
    q = Maths._BANDS[2][2](rand);
    eq(q.answer + q.render[0].v, q.render[4].v,
       'bond-to-10 recomputes from the rendered parts');
  }
})();

// ---- Task 5 ----
checkGenerators(3, false);
checkGenerators(4, false);

(function () {
  var rand = makeRng(31), i, q, k, boxes, terms, gapIdx, step, refIdx, refVal, p;
  for (i = 0; i < 400; i++) {
    q = Maths._BANDS[3][0](rand);
    ok(q.answer <= 20, 'band 3 addition stays within 20');
  }
  // The sequence generator must leave exactly one gap.
  for (i = 0; i < 400; i++) {
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
  for (i = 0; i < 400; i++) {
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
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[5][1](rand);
    eq(q.answer, Math.floor(q.answer), 'division yields a whole number');
    ok(q.answer > 0, 'division answer is positive');
  }
  // Fractions of amounts must be exact.
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[5][2](rand);
    eq(q.answer, Math.floor(q.answer), 'fraction of amount is a whole number');
    eq(q.answer * q.render[0].d, q.render[2].v,
       'fraction of amount recomputes from the rendered fraction');
  }
  // Decimals must be multiples of 0.25, so binary representation is exact.
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[6][1](rand);
    eq(q.answer * 4, Math.round(q.answer * 4), 'decimal answer is a multiple of 0.25');
    eq(q.answer, Number(q.answer.toFixed(2)), 'decimal answer has no float drift');
  }
  // Comparison answers are symbols with all three offered.
  for (i = 0; i < 300; i++) {
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
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[7][0](rand);
    eq(q.answer, Math.floor(q.answer), 'percentage of amount is a whole number');
    eq(q.answer * 100, q.render[0].v * q.render[2].v,
       'percentage recomputes from the rendered percent and amount');
  }
  // Order of operations: multiplication binds before addition.
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[7][1](rand);
    var a = q.render[0].v, b = q.render[2].v, c = q.render[4].v;
    eq(q.answer, a + b * c, 'order of operations respects precedence');
  }
  // Ratio scaling must preserve the proportion: a:b = (a*k):answer, so
  // cross-multiplying gives an independent check of the scaled term.
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[7][2](rand);
    eq(q.answer * q.render[0].v, q.render[2].v * q.render[4].v,
       'ratio recomputes via cross-multiplication');
  }
  // Squares and roots are inverse and exact.
  for (i = 0; i < 300; i++) {
    q = Maths._BANDS[8][1](rand);
    eq(q.answer, q.render[0].v * q.render[0].v, 'square is exact');
    q = Maths._BANDS[8][2](rand);
    eq(q.answer * q.answer, q.render[1].v, 'root is exact');
  }
  // Equation solving: box + b = total, recomputed from the rendered totals.
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[8][3](rand);
    eq(q.answer + q.render[2].v, q.render[4].v,
       'equation recomputes from the rendered totals');
  }
  // Negative results do occur in band 8.
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[8][0](rand);
    if (q.answer < 0) { sawNegative = true; }
  }
  ok(sawNegative, 'band 8 actually produces negative answers');
})();

// ---- Task 8 ----
(function () {
  var rand = makeRng(101), i, q, counts = { 3: 0, 4: 0 };

  // Band mixing: difficulty 3.4 should draw roughly 40% from band 4.
  for (i = 0; i < 4000; i++) {
    q = Maths.make(3.4, Maths.newState(3.4), rand);
    ok(q.band === 3 || q.band === 4, 'difficulty 3.4 draws from band 3 or 4');
    counts[q.band]++;
  }
  var frac = counts[4] / 4000;
  ok(frac > 0.33 && frac < 0.47, 'band 4 share is near 40% (got ' + frac.toFixed(3) + ')');

  // Integer difficulty draws only that band.
  for (i = 0; i < 500; i++) {
    eq(Maths.make(5, Maths.newState(5), rand).band, 5, 'integer difficulty picks that band');
  }
  eq(Maths.make(8, Maths.newState(8), rand).band, 8, 'difficulty 8 never overflows to band 9');

  // Shape of the returned question.
  for (i = 0; i < 2000; i++) {
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
  var weak = 0, total = 6000;
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
  s = Maths.newState(8);
  for (i = 0; i < 200; i++) { s = Maths.update(s, outcome(true, 100, 8)); }
  eq(s.difficulty, 8, 'difficulty never rises above 8');

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
    for (i = 0; i < 2000; i++) {
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
  for (i = 0; i < 3000; i++) {
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
  // A synthetic learner of fixed ability on the 1-8 band scale. Chance of
  // knowing the answer falls off as difficulty exceeds ability; whatever is
  // not known is guessed from the available choices, which is what makes
  // floor support (spec 8.6) measurable.
  function simulate(ability, n, seed) {
    var rand = makeRng(seed), s = Maths.newState(4);
    var correct = 0, total = 0, sum = 0, i, known, choices, p, ok_, band, ms;
    for (i = 0; i < n; i++) {
      band = Math.round(s.difficulty);
      known = 1 / (1 + Math.exp(1.6 * (s.difficulty - ability)));
      choices = Maths.choiceCount(s.difficulty);
      p = known + (1 - known) / choices;
      ok_ = rand() < p;
      ms = ok_ ? (2500 + 900 * band) * (0.4 + rand() * 1.4) : 9000;
      s = Maths.update(s, { correct: ok_, elapsedMs: ms, band: band, skill: 'x' });
      if (i > n / 2) { total++; sum += s.difficulty; if (ok_) { correct++; } }
      ok(s.difficulty >= 1 && s.difficulty <= 8, 'difficulty stays within [1,8]');
    }
    return { accuracy: correct / total, band: sum / total };
  }

  var abilities = [1.5, 3, 4.5, 6, 7.5], i, r;
  for (i = 0; i < abilities.length; i++) {
    r = simulate(abilities[i], 40000, 900 + i);
    ok(r.accuracy > 0.72 && r.accuracy < 0.88,
       'ability ' + abilities[i] + ' settles near 80% (got ' +
       (r.accuracy * 100).toFixed(1) + '% at band ' + r.band.toFixed(2) + ')');
  }

  // A strong learner climbs, a struggling one descends.
  ok(simulate(8, 4000, 77).band > 6, 'a strong learner climbs the scale');
  ok(simulate(1, 4000, 78).band < 2.5, 'a struggling learner descends the scale');
})();

done();
