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

    var pool = _shuffle(rand, near);
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
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.add }, { t: 'box' },
               { t: 'eq' }, { t: 'num', v: 5 }],
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

  _BANDS[7] = [genPct, genOrder, genRatio];
  _BANDS[8] = [genNeg, genSquare, genRoot, genEqn];

  function make(difficulty, state, rand) { return null; }
  function update(state, outcome) { return state; }
  function newState(startBand) { return { difficulty: startBand, mastery: {} }; }

  return {
    make: make, update: update, newState: newState,
    choiceCount: choiceCount, buildChoices: buildChoices,
    _randInt: _randInt, _pick: _pick, _shuffle: _shuffle,
    _BANDS: _BANDS
  };
})();

if (typeof module !== 'undefined') { module.exports = Maths; }
