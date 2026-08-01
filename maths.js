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
      near: [a - b + 1, a - b - 1, a + b, b]
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

  var _BANDS = {
    1: [genCount, genBond5],
    2: [genAdd10, genSub10, genBond10]
  };

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
