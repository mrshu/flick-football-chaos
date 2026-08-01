'use strict';
var Maths = (function () {

  function make(difficulty, state, rand) { return null; }
  function update(state, outcome) { return state; }
  function newState(startBand) { return { difficulty: startBand, mastery: {} }; }

  return { make: make, update: update, newState: newState };
})();

if (typeof module !== 'undefined') { module.exports = Maths; }
