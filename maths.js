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

  function make(difficulty, state, rand) { return null; }
  function update(state, outcome) { return state; }
  function newState(startBand) { return { difficulty: startBand, mastery: {} }; }

  return {
    make: make, update: update, newState: newState,
    _randInt: _randInt, _pick: _pick, _shuffle: _shuffle
  };
})();

if (typeof module !== 'undefined') { module.exports = Maths; }
