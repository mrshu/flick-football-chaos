'use strict';
var Maths = (function () {

  function _randInt(rand, lo, hi) {
    return lo + Math.floor(rand() * (hi - lo + 1));
  }

  function _pick(rand, arr) {
    return arr[_randInt(rand, 0, arr.length - 1)];
  }

  function _shuffle(rand, arr) {
    var out = arr.slice(), i, j, t;
    for (i = out.length - 1; i > 0; i--) {
      j = _randInt(rand, 0, i);
      t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  // A numeric distractor is only worth offering if it's close enough to the
  // answer to look like a believable mis-computation. The band scales with
  // the answer's magnitude: being off by 10 on "6 + 6" (answer 12, band
  // ±7) is not a plausible slip, but being off by 10 on "42 + 43" (answer
  // 85, band ±51) is - a fixed absolute tolerance would be either too
  // strict for big answers or too loose for small ones.
  function _plausibleDistractor(d, answer) {
    return Math.abs(d - answer) <= Math.max(3, Math.round(Math.abs(answer) * 0.6));
  }

  function choiceCount(difficulty) {
    if (difficulty <= 1.25) { return 2; }
    if (difficulty <= 1.75) { return 3; }
    return 4;
  }

  function buildChoices(answer, count, near, rand, min) {
    if (min === undefined) { min = 0; }
    var out = [answer], i, v;

    // Strings (comparison answers) take their alternatives verbatim.
    if (typeof answer === 'string') {
      for (i = 0; i < near.length && out.length < count; i++) {
        if (out.indexOf(near[i]) === -1) { out.push(near[i]); }
      }
      return _shuffle(rand, out);
    }

    var pool = _shuffle(rand, near.filter(function (v) {
      return _plausibleDistractor(v, answer);
    }));
    for (i = 0; i < pool.length && out.length < count; i++) {
      v = pool[i];
      if (typeof v === 'number' && v >= min && out.indexOf(v) === -1) { out.push(v); }
    }

    // Pad outward from the answer until we have enough distinct options.
    // Maximum count is 4, so at most 3 extra values needed; each iteration offers 2 candidates.
    for (i = 1; out.length < count && i <= 12; i++) {
      if (out.length < count && answer + i >= min && out.indexOf(answer + i) === -1) {
        out.push(answer + i);
      }
      if (out.length < count && answer - i >= min && out.indexOf(answer - i) === -1) {
        out.push(answer - i);
      }
    }

    return _shuffle(rand, out);
  }

  var OP = { add: '+', sub: '−', mul: '×', div: '÷' };

  // --- band 1: counting and bonds to 5 ---
  function genCount(rand) {
    var a = _randInt(rand, 1, 3), b = _randInt(rand, 1, Math.min(3, 5 - a));
    return {
      render: [{ t: 'balls', v: a }, { t: 'op', v: OP.add },
               { t: 'balls', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a + b, skill: 'count',
      near: [a + b + 1, a + b - 1, a, b]
    };
  }

  function genBond5(rand) {
    var a = _randInt(rand, 1, 4);
    return {
      render: [{ t: 'balls', v: a }, { t: 'op', v: OP.add }, { t: 'box' },
               { t: 'eq' }, { t: 'balls', v: 5 }],
      answer: 5 - a, skill: 'bond5',
      near: [5 - a + 1, 5 - a - 1, a, 5]
    };
  }

  // --- band 2: addition, subtraction and bonds within 10 ---
  function genAdd10(rand) {
    var a = _randInt(rand, 1, 9), b = _randInt(rand, 1, 10 - a);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.add },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a + b, skill: 'add10',
      near: [a + b + 1, a + b - 1, Math.abs(a - b), a + b + 2]
    };
  }

  function genSub10(rand) {
    var a = _randInt(rand, 2, 10), b = _randInt(rand, 1, a);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.sub },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a - b, skill: 'sub10',
      near: [a - b + 1, Math.max(0, a - b - 1), a + b, b]
    };
  }

  function genBond10(rand) {
    var a = _randInt(rand, 1, 9);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.add }, { t: 'box' },
               { t: 'eq' }, { t: 'num', v: 10 }],
      answer: 10 - a, skill: 'bond10',
      near: [10 - a + 1, 10 - a - 1, a, 10]
    };
  }

  // --- band 3: within 20, doubles, sequences ---
  function genAdd20(rand) {
    var a = _randInt(rand, 2, 15), b = _randInt(rand, 2, 20 - a);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.add },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a + b, skill: 'add20',
      near: [a + b + 1, a + b - 1, a + b + 10, Math.abs(a - b)]
    };
  }

  function genSub20(rand) {
    var a = _randInt(rand, 5, 20), b = _randInt(rand, 1, a);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.sub },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a - b, skill: 'sub20',
      near: [a - b + 1, Math.max(0, a - b - 1), a + b, b]
    };
  }

  function genDouble(rand) {
    var a = _randInt(rand, 2, 10);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.add },
               { t: 'num', v: a }, { t: 'eq' }, { t: 'box' }],
      answer: a * 2, skill: 'double',
      near: [a * 2 + 1, a * 2 - 1, a, a * 2 + 2]
    };
  }

  function genSeq(rand) {
    var step = _pick(rand, [2, 5, 10]);
    var start = step * _randInt(rand, 1, 4);
    var gap = _randInt(rand, 1, 3); // index of the hidden term among 5
    var render = [], i, v;
    for (i = 0; i < 5; i++) {
      v = start + i * step;
      if (i > 0) { render.push({ t: 'sep' }); }
      render.push(i === gap ? { t: 'box' } : { t: 'num', v: v });
    }
    var answer = start + gap * step;
    return {
      render: render, answer: answer, skill: 'seq',
      near: [answer + step, answer - step, answer + 1, answer - 1]
    };
  }

  // --- band 4: easy tables, within 100, halves ---
  function genMul(rand) {
    var a = _pick(rand, [2, 5, 10]), b = _randInt(rand, 2, 12);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.mul },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a * b, skill: 'mul',
      near: [a * b + a, a * b - a, a + b, a * b + 1]
    };
  }

  function genAdd100(rand) {
    var a = _randInt(rand, 10, 89), b = _randInt(rand, 5, 99 - a);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.add },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a + b, skill: 'add100',
      near: [a + b + 10, a + b - 10, a + b + 1, a + b - 1]
    };
  }

  function genSub100(rand) {
    var a = _randInt(rand, 20, 99), b = _randInt(rand, 5, a);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.sub },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a - b, skill: 'sub100',
      near: [a - b + 10, Math.max(0, a - b - 10), a - b + 1, a + b]
    };
  }

  function genHalf(rand) {
    var n = _randInt(rand, 1, 15) * 2;
    return {
      render: [{ t: 'frac', n: 1, d: 2 }, { t: 'op', v: OP.mul },
               { t: 'num', v: n }, { t: 'eq' }, { t: 'box' }],
      answer: n / 2, skill: 'half',
      near: [n, n / 2 + 1, n / 2 - 1, n / 2 + 2]
    };
  }

  // --- band 5: tables to 12, division, fractions of amounts ---
  function genTable(rand) {
    var a = _randInt(rand, 2, 12), b = _randInt(rand, 2, 12);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.mul },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a * b, skill: 'table',
      near: [a * b + a, a * b - a, a * b + b, a + b]
    };
  }

  function genDiv(rand) {
    var b = _randInt(rand, 2, 12), q = _randInt(rand, 2, 12), a = b * q;
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.div },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: q, skill: 'div',
      near: [q + 1, q - 1, b, a - b]
    };
  }

  function genFracOf(rand) {
    var d = _pick(rand, [2, 3, 4]), k = _randInt(rand, 2, 8), n = d * k;
    return {
      render: [{ t: 'frac', n: 1, d: d }, { t: 'op', v: OP.mul },
               { t: 'num', v: n }, { t: 'eq' }, { t: 'box' }],
      answer: k, skill: 'fracOf',
      near: [k + 1, k - 1, n, d]
    };
  }

  // --- band 6: multi-digit, decimals, fraction comparison ---
  function genAdd1000(rand) {
    var a = _randInt(rand, 100, 800);
    // b never exceeds a, so the subtraction branch cannot go negative.
    var b = _randInt(rand, 20, Math.min(199, a));
    var addition = rand() < 0.5;
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: addition ? OP.add : OP.sub },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: addition ? a + b : a - b, skill: 'add1000',
      near: addition ? [a + b + 10, a + b - 10, a + b + 100, a - b]
                     : [a - b + 10, Math.max(0, a - b - 10), a - b + 100, a + b]
    };
  }

  // Quarters only: multiples of 0.25 are binary-exact, so no float drift.
  function genDec(rand) {
    var aq = _randInt(rand, 1, 8), bq = _randInt(rand, 1, 8); // quarter units
    var sum = (aq + bq) / 4;
    return {
      render: [{ t: 'num', v: aq / 4 }, { t: 'op', v: OP.add },
               { t: 'num', v: bq / 4 }, { t: 'eq' }, { t: 'box' }],
      answer: sum, skill: 'dec',
      near: [(aq + bq + 1) / 4, (aq + bq - 1) / 4,
             (aq + bq + 4) / 4, Math.abs(aq - bq) / 4]
    };
  }

  function genFracCmp(rand) {
    var an = _randInt(rand, 1, 5), ad = _randInt(rand, 2, 6);
    var bn = _randInt(rand, 1, 5), bd = _randInt(rand, 2, 6);
    var left = an * bd, right = bn * ad; // cross-multiply, integers only
    var answer = left < right ? '<' : (left > right ? '>' : '=');
    var all = ['<', '>', '='], near = [], i;
    for (i = 0; i < all.length; i++) { if (all[i] !== answer) { near.push(all[i]); } }
    return {
      render: [{ t: 'frac', n: an, d: ad }, { t: 'box' }, { t: 'frac', n: bn, d: bd }],
      answer: answer, skill: 'fracCmp', near: near
    };
  }

  var _BANDS = {
    1: [genCount, genBond5],
    2: [genAdd10, genSub10, genBond10]
  };

  _BANDS[3] = [genAdd20, genSub20, genDouble, genSeq];
  _BANDS[4] = [genMul, genAdd100, genSub100, genHalf];
  _BANDS[5] = [genTable, genDiv, genFracOf];
  _BANDS[6] = [genAdd1000, genDec, genFracCmp];

  // --- band 7: percentages, order of operations, ratio ---
  function genPct(rand) {
    var p = _pick(rand, [10, 25, 50, 75]);
    var n = _randInt(rand, 1, 10) * 20; // divisible by 20, so all four are exact
    var answer = n * p / 100;
    return {
      render: [{ t: 'pct', v: p }, { t: 'op', v: OP.mul },
               { t: 'num', v: n }, { t: 'eq' }, { t: 'box' }],
      answer: answer, skill: 'pct',
      // Math.round keeps the "halved it" misconception without offering a
      // fractional choice to an integer question.
      near: [answer * 2, Math.round(answer / 2), answer + 10, n - answer]
    };
  }

  function genOrder(rand) {
    var a = _randInt(rand, 2, 12), b = _randInt(rand, 2, 9), c = _randInt(rand, 2, 9);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.add },
               { t: 'num', v: b }, { t: 'op', v: OP.mul },
               { t: 'num', v: c }, { t: 'eq' }, { t: 'box' }],
      answer: a + b * c, skill: 'order',
      near: [(a + b) * c, a + b + c, a + b * c + 1, a * b + c]
    };
  }

  function genRatio(rand) {
    var a = _randInt(rand, 1, 6), b = _randInt(rand, 1, 6), k = _randInt(rand, 2, 5);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: ':' }, { t: 'num', v: b },
               { t: 'eq' },
               { t: 'num', v: a * k }, { t: 'op', v: ':' }, { t: 'box' }],
      answer: b * k, skill: 'ratio',
      near: [b * k + b, b * k - b, b + k, a * k]
    };
  }

  // --- band 8: negatives, squares, roots, equations ---
  function genNeg(rand) {
    var a = _randInt(rand, 1, 9), b = _randInt(rand, 1, 12);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.sub },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a - b, skill: 'neg',
      near: [b - a, a - b + 1, a - b - 1, a + b]
    };
  }

  function genSquare(rand) {
    var n = _randInt(rand, 2, 12);
    return {
      render: [{ t: 'pow', v: n, e: 2 }, { t: 'eq' }, { t: 'box' }],
      answer: n * n, skill: 'square',
      near: [n * 2, n * n + n, n * n - n, n * n + 1]
    };
  }

  function genRoot(rand) {
    var n = _randInt(rand, 2, 12), sq = n * n;
    return {
      render: [{ t: 'op', v: '√' }, { t: 'num', v: sq },
               { t: 'eq' }, { t: 'box' }],
      answer: n, skill: 'root',
      near: [n + 1, n - 1, Math.round(sq / 2), n * 2]
    };
  }

  function genEqn(rand) {
    var x = _randInt(rand, 1, 12), b = _randInt(rand, 1, 12);
    return {
      render: [{ t: 'box' }, { t: 'op', v: OP.add }, { t: 'num', v: b },
               { t: 'eq' }, { t: 'num', v: x + b }],
      answer: x, skill: 'eqn',
      near: [x + b, x + 1, x - 1, b]
    };
  }

  // --- band 9: two-step equations, expanding, angles on a line, sequences ---
  // The unknown is written `x`, so the question row reads "3x + 4 = 19 , x = □".
  function genEqn2(rand) {
    var a = _randInt(rand, 2, 6), x = _randInt(rand, 2, 12), b = _randInt(rand, 1, 12);
    var c = a * x + b;
    return {
      render: [{ t: 'var', v: a + 'x' }, { t: 'op', v: OP.add }, { t: 'num', v: b },
               { t: 'eq' }, { t: 'num', v: c }, { t: 'sep' },
               { t: 'var', v: 'x' }, { t: 'eq' }, { t: 'box' }],
      answer: x, skill: 'eqn2',
      // Forgot to divide (ax), forgot to subtract (c/a, rounded), off by one.
      near: [a * x, Math.round(c / a), x + 1, x - 1]
    };
  }

  function genExpand(rand) {
    var a = _randInt(rand, 2, 9), b = _randInt(rand, 2, 9);
    return {
      render: [{ t: 'var', v: a + '(x+' + b + ')' }, { t: 'eq' },
               { t: 'var', v: a + 'x' }, { t: 'op', v: OP.add }, { t: 'box' }],
      answer: a * b, skill: 'expand',
      // Forgot to multiply (b), added instead (a+b), slipped a row on tables.
      near: [b, a + b, a * b + a, a * b - a]
    };
  }

  function genAngleLine(rand) {
    var known = _randInt(rand, 25, 155);
    return {
      render: [{ t: 'diag', kind: 'angleLine', known: known }, { t: 'box' }],
      answer: 180 - known, skill: 'angleLine',
      // Read the wrong angle (known), guessed a right angle's complement.
      near: [known, 180 - known + 10, 180 - known - 10, 90 - (known % 90)]
    };
  }

  function genSeqRule(rand) {
    var step = _randInt(rand, 3, 9);
    var start = _randInt(rand, 2, 20);
    var gap = _randInt(rand, 1, 3);
    var render = [], i;
    for (i = 0; i < 5; i++) {
      if (i > 0) { render.push({ t: 'sep' }); }
      render.push(i === gap ? { t: 'box' } : { t: 'num', v: start + i * step });
    }
    var answer = start + gap * step;
    return {
      render: render, answer: answer, skill: 'seqRule',
      near: [answer + step, answer - step, answer + 1, answer - 1]
    };
  }

  _BANDS[7] = [genPct, genOrder, genRatio];
  _BANDS[8] = [genNeg, genSquare, genRoot, genEqn];
  _BANDS[9] = [genEqn2, genExpand, genAngleLine, genSeqRule];

  // --- band 10: simultaneous equations, triangle angles, Pythagoras ---
  function genSimul(rand) {
    var y = _randInt(rand, 1, 9), x = y + _randInt(rand, 1, 9);
    return {
      render: [{ t: 'var', v: 'x' }, { t: 'op', v: OP.add }, { t: 'var', v: 'y' },
               { t: 'eq' }, { t: 'num', v: x + y }, { t: 'sep' },
               { t: 'var', v: 'x' }, { t: 'op', v: OP.sub }, { t: 'var', v: 'y' },
               { t: 'eq' }, { t: 'num', v: x - y }, { t: 'sep' },
               { t: 'var', v: 'x' }, { t: 'eq' }, { t: 'box' }],
      answer: x, skill: 'simul',
      // Solved for the wrong letter (y), added the equations' right sides.
      near: [y, x + y, x + 1, x - 1]
    };
  }

  function genAngleTri(rand) {
    var a = _randInt(rand, 30, 100), b = _randInt(rand, 30, Math.min(100, 160 - a));
    var c = 180 - a - b;
    return {
      render: [{ t: 'diag', kind: 'angleTri', a: a, b: b }, { t: 'box' }],
      answer: c, skill: 'angleTri',
      // Subtracted from 90 or 360, read a labelled angle, off by ten.
      near: [c + 10, c - 10, a + b, 180 - c]
    };
  }

  // Whole-number hypotenuses only, so the answer needs no root extraction.
  var TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15],
                 [8, 15, 17], [7, 24, 25], [12, 16, 20], [20, 21, 29]];

  function genPythag(rand) {
    var t = _pick(rand, TRIPLES);
    var flip = rand() < 0.5;
    var la = flip ? t[1] : t[0], lb = flip ? t[0] : t[1];
    return {
      render: [{ t: 'diag', kind: 'pythag', legA: la, legB: lb }, { t: 'box' }],
      answer: t[2], skill: 'pythag',
      // Added the legs, took the longer leg, off by one.
      near: [la + lb, Math.max(la, lb), t[2] + 1, t[2] - 1]
    };
  }

  function genSeqQuad(rand) {
    var c = _randInt(rand, 0, 10), render = [], i, v;
    for (i = 1; i <= 5; i++) {
      v = i * i + c;
      if (i > 1) { render.push({ t: 'sep' }); }
      render.push(i === 5 ? { t: 'box' } : { t: 'num', v: v });
    }
    var answer = 25 + c;
    return {
      render: render, answer: answer, skill: 'seqQuad',
      // Continued linearly (repeating the last difference), off by two.
      near: [16 + c + (16 + c - (9 + c)), answer + 2, answer - 2, answer + 1]
    };
  }

  _BANDS[10] = [genSimul, genAngleTri, genPythag, genSeqQuad];

  // --- band 11: index laws, inequalities, geometric sequences, areas ---
  function genIndices(rand) {
    var base = _randInt(rand, 2, 5);
    var div = rand() < 0.4;
    var p = _randInt(rand, 2, 5), q = _randInt(rand, 2, 5);
    if (div && p <= q) { p = q + _randInt(rand, 1, 3); } // keep p−q ≥ 1
    return {
      render: [{ t: 'pow', v: base, e: p }, { t: 'op', v: div ? OP.div : OP.mul },
               { t: 'pow', v: base, e: q }, { t: 'eq' },
               { t: 'pow', v: base, e: '□' }],
      answer: div ? p - q : p + q, skill: 'indices',
      // Multiplied the exponents, kept one of them, off by one.
      near: [p * q, p, q, (div ? p - q : p + q) + 1]
    };
  }

  function genIneq(rand) {
    var a = _randInt(rand, 2, 9), x = _randInt(rand, 2, 12);
    var c = a * x + _randInt(rand, 1, a); // a·x < c ≤ a·(x+1)
    return {
      render: [{ t: 'var', v: a + 'x' }, { t: 'op', v: '<' }, { t: 'num', v: c },
               { t: 'sep' }, { t: 'var', v: 'x' }, { t: 'eq' }, { t: 'box' }],
      answer: x, skill: 'ineq',
      // Rounded up instead, divided and truncated wrongly, off by two.
      near: [x + 1, x - 1, Math.round(c / a), x + 2]
    };
  }

  function genSeqGeo(rand) {
    var r = _pick(rand, [2, 3]);
    var start = _randInt(rand, 2, 6);
    var gap = _randInt(rand, 2, 4);
    var render = [], i, v;
    for (i = 0; i < 5; i++) {
      v = start * Math.pow(r, i);
      if (i > 0) { render.push({ t: 'sep' }); }
      render.push(i === gap ? { t: 'box' } : { t: 'num', v: v });
    }
    var answer = start * Math.pow(r, gap);
    var prev = start * Math.pow(r, gap - 1);
    var prevprev = start * Math.pow(r, gap - 2);
    return {
      render: render, answer: answer, skill: 'seqGeo',
      // Continued linearly from the two terms before the gap.
      near: [prev + (prev - prevprev), answer + r, answer - r, prev]
    };
  }

  function genAreaComp(rand) {
    var W = _randInt(rand, 6, 12), H = _randInt(rand, 5, 10);
    var w = _randInt(rand, 2, W - 3), h = _randInt(rand, 2, H - 2);
    return {
      render: [{ t: 'diag', kind: 'areaComp', W: W, H: H, w: w, h: h }, { t: 'box' }],
      answer: W * H - w * h, skill: 'areaComp',
      // Ignored the notch, subtracted lengths instead of area.
      near: [W * H, W * H - w - h, W * H - w * h + h, W * H - w * h - w]
    };
  }

  _BANDS[11] = [genIndices, genIneq, genSeqGeo, genAreaComp];

  // Bands 1-8 cover ages 5-12; 9-11 carry the ladder to 16+ (see the over-12
  // spec). One constant, so the ceiling cannot disagree with itself.
  var MAX_BAND = 11;

  function newState(startBand) {
    var d = typeof startBand === 'number' ? startBand : 1;
    if (d < 1) { d = 1; }
    if (d > MAX_BAND) { d = MAX_BAND; }
    // `home` is the band an adult chose for this child, and it is the single
    // most reliable thing the engine is ever told. Acceleration is allowed to
    // roam a few bands either side of it and no further; see update().
    return { difficulty: d, home: d, mastery: {}, fastStreak: 0, wrongStreak: 0 };
  }

  function pickBand(difficulty, rand) {
    var b = Math.floor(difficulty), f = difficulty - b;
    if (b < 1) { b = 1; f = 0; }
    if (b >= MAX_BAND) { return MAX_BAND; }
    return rand() < f ? b + 1 : b;
  }

  // Each generator's skill id, resolved once at load rather than on every
  // call. Placed after every _BANDS[n] assignment so the table is complete.
  var _skillIndex = (function () {
    var idx = {}, b, i, gens, fixed = function () { return 0.5; };
    for (b = 1; b <= MAX_BAND; b++) {
      gens = _BANDS[b];
      idx[b] = [];
      for (i = 0; i < gens.length; i++) {
        idx[b].push(gens[i](fixed).skill);
      }
    }
    return idx;
  })();

  // 60% of the time favour weak skills, 40% uniform (spec 8.4).
  function pickGenerator(band, state, rand) {
    var gens = _BANDS[band], skills = _skillIndex[band];
    var i, m, w, weights = [], total = 0, r;
    if (rand() < 0.4) { return gens[_randInt(rand, 0, gens.length - 1)]; }
    for (i = 0; i < gens.length; i++) {
      m = state.mastery[skills[i]] !== undefined
        ? state.mastery[skills[i]] : 0.5;
      w = 1 - m + 0.1;
      weights.push(w);
      total += w;
    }
    r = rand() * total;
    for (i = 0; i < gens.length; i++) {
      r -= weights[i];
      if (r <= 0) { return gens[i]; }
    }
    return gens[gens.length - 1];
  }

  function make(difficulty, state, rand) {
    var band = pickBand(difficulty, rand);
    var q = pickGenerator(band, state, rand)(rand);
    var min = band >= 8 ? -30 : 0;
    var choices = buildChoices(q.answer, choiceCount(difficulty), q.near, rand, min);
    return {
      render: q.render, answer: q.answer, choices: choices,
      skill: q.skill, band: band
    };
  }
  // A random walk with up-step u and down-step d settles at accuracy
  // p* = d / (u + d). With UP_MID = 0.075 and DOWN = 0.300, p* = 0.80 —
  // the intended 80% success target (spec 8.7, checked by the convergence
  // test). UP_FAST/UP_SLOW are faster/slower variants of the same up-step.
  var UP_FAST = 0.100, UP_MID = 0.075, UP_SLOW = 0.040, DOWN = 0.300;
  var MASTERY_ALPHA = 0.25;

  // Acceleration: a plain random walk needs dozens of correct answers to
  // climb out of a band a misplaced child has clearly outgrown (12 fast
  // answers in a row only reaches 2.20 from band 1). ACCEL_TRIGGER lets a
  // few (3) fast-correct or wrong answers pass unaccelerated — that is
  // ordinary good/bad play — before every further answer in the same
  // direction jumps further than the last, up to ACCEL_CAP. Young bands
  // (<=4) accelerate upward at full strength because their content is
  // thin and a capable child exhausts it fast; bands 5-8 hold real ground
  // that still rewards practice, so ACCEL_UP_OLD_RATIO damps the climb
  // there. The same growing-jump shape mirrors downward off any streak of
  // wrong answers, with no band damping: an overshoot can strand a child
  // several bands above their level, and the plain -0.300 step would take
  // many demoralising failures to climb back down from there, at whatever
  // band that turns out to be.
  // A climb has to be earned over more answers than a fall. The asymmetry is
  // deliberate: being stuck too high means sitting through questions you
  // cannot read, and a wrong answer costing nothing in the game does not make
  // it free — it costs a bonus, a turn's attention, and some of a child's
  // willingness to keep trying.
  //
  // Doubting on the third wrong rather than the fourth gets a stranded child
  // home one question sooner. Doubting on the second was tried and moved the
  // settled accuracy from 81% to 84%: eager descent is itself a bias, and it
  // parks children on easier questions than the 80% target intends.
  var ACCEL_TRIGGER_UP = 3;
  var ACCEL_TRIGGER_DOWN = 2;
  var ACCEL_UP_YOUNG = 0.45;
  var ACCEL_UP_OLD_RATIO = 0.35;
  var ACCEL_DOWN = 0.45;

  // The two directions are capped separately, and deliberately unequally.
  //
  // A shared cap of 1.2 let a run of ten fast-correct answers carry a child
  // from band 1 to band 8 — counting footballs to solving equations — with
  // single steps of 1.3 bands near the end. At band 1 there are only two
  // answers to choose from, so a few of those "correct" answers can be luck,
  // and the child who gets flung there then needed seven wrong answers in a
  // row to climb back down. Seven failures is not a correction, it is a
  // reason to stop playing.
  //
  // Capping the climb at 0.40 holds the largest up-step to half a band, so an
  // unbroken hot streak still clears two bands in about seven answers — fast
  // enough for the child who has plainly outgrown their level — but crossing
  // the whole scale takes a sustained run rather than one lucky afternoon.
  // The fall keeps the old cap: an overshoot has to be cheaper to undo than
  // it was to make.
  var ACCEL_CAP_UP = 0.25;
  var ACCEL_CAP_DOWN = 1.2;

  // How far from the chosen band acceleration is willing to travel. Two years
  // was the brief ("do not hesitate to make them jump even two and more
  // years"); three is that, with room. Past it a child still climbs, at the
  // ordinary +0.100 a fast-correct answer earns — which takes a sustained run
  // across sessions rather than one lucky afternoon. Being genuinely four
  // years ahead of your age is rare enough to be worth proving slowly.
  var ACCEL_REACH = 3;

  // A correct answer is weaker evidence when there were fewer wrong answers to
  // avoid. At the bottom of the scale only two choices are offered, so half of
  // those "correct" answers are a coin landing the right way up: four lucky
  // taps is a 1-in-16 event, and that used to be enough to arm the
  // accelerator. Weighting the streak by 1 - 1/choices means a child on
  // two-choice questions needs six good answers to start climbing fast, and a
  // child on four-choice questions needs four.
  function evidence(choices) { return 1 - 1 / choices; }

  function accelExtra(streak, unit, cap, trigger) {
    var extra;
    if (streak <= trigger) { return 0; }
    extra = unit * (streak - trigger);
    return extra > cap ? cap : extra;
  }

  function expectedMs(band) { return 2500 + 900 * band; }

  function update(state, outcome) {
    var d = state.difficulty, step, exp = expectedMs(outcome.band);
    var fastStreak = state.fastStreak || 0, wrongStreak = state.wrongStreak || 0;
    var home = typeof state.home === 'number' ? state.home : d;
    // Beyond a few bands from where an adult placed them, the climb loses its
    // accelerator. A hard ceiling would be wrong — advanced children and
    // mis-set ages are both real — so this only slows the ascent, it does not
    // stop it.
    var mayAccelerate = d <= home + ACCEL_REACH;
    if (outcome.correct) {
      if (outcome.elapsedMs < exp * 0.6) {
        // The streak counts evidence, not answers: a two-choice question is
        // worth half of a four-choice one.
        fastStreak += evidence(choiceCount(d));
        wrongStreak = 0;
        step = UP_FAST + (mayAccelerate ? accelExtra(fastStreak,
          d <= 4 ? ACCEL_UP_YOUNG : ACCEL_UP_YOUNG * ACCEL_UP_OLD_RATIO,
          ACCEL_CAP_UP, ACCEL_TRIGGER_UP) : 0);
      } else {
        fastStreak = 0;
        wrongStreak = 0;
        step = outcome.elapsedMs > exp * 1.4 ? UP_SLOW : UP_MID;
      }
    } else {
      fastStreak = 0;
      wrongStreak += 1;
      // Falling is never gated by reach: a child who has ended up too high
      // must be able to get back down from wherever that is.
      step = -DOWN - accelExtra(wrongStreak, ACCEL_DOWN, ACCEL_CAP_DOWN,
                                ACCEL_TRIGGER_DOWN);
    }
    d += step;
    if (d < 1) { d = 1; }
    if (d > MAX_BAND) { d = MAX_BAND; }

    var mastery = {}, k;
    for (k in state.mastery) {
      if (Object.prototype.hasOwnProperty.call(state.mastery, k)) {
        mastery[k] = state.mastery[k];
      }
    }
    var prev = mastery[outcome.skill] !== undefined ? mastery[outcome.skill] : 0.5;
    mastery[outcome.skill] =
      prev + MASTERY_ALPHA * ((outcome.correct ? 1 : 0) - prev);

    return { difficulty: d, home: home, mastery: mastery,
             fastStreak: fastStreak, wrongStreak: wrongStreak };
  }

  return {
    make: make, update: update, newState: newState,
    choiceCount: choiceCount, buildChoices: buildChoices,
    _randInt: _randInt, _pick: _pick, _shuffle: _shuffle,
    _BANDS: _BANDS, MAX_BAND: MAX_BAND
  };
})();

if (typeof module !== 'undefined') { module.exports = Maths; }
