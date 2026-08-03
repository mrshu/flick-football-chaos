'use strict';
// The cup: five opponents of rising skill, played in order.
//
// It exists to serve repeat play. A part-finished cup leaves a specific thing
// outstanding, which pulls harder than a general sense of progress — a child
// who is three crests in has a reason to come back that a score never gives.
//
// Pure: no DOM, no game state, no randomness of its own. The game reads
// `skillFor` when configuring the CPU and calls `recordResult` at full time.
var Tournament = (function () {

  var COUNT = 5;

  // Each opponent is one colour plus one pattern, drawn from primitives. No
  // names anywhere, so the cup reads the same in any language.
  var CRESTS = [
    { fill: '#4ade80', ink: '#14532d', pattern: 'stripes' },
    { fill: '#60a5fa', ink: '#1e3a8a', pattern: 'halves' },
    { fill: '#c084fc', ink: '#4c1d95', pattern: 'sash' },
    { fill: '#fb923c', ink: '#7c2d12', pattern: 'quarters' },
    { fill: '#f87171', ink: '#7f1d1d', pattern: 'hoops' }
  ];

  // Rising, and deliberately capped below 1. The child cannot be given a
  // perfect opponent: with no dynamic mercy anywhere in the design, this curve
  // is the only thing standing between a five-year-old and an unwinnable wall.
  var SKILL = [0.15, 0.35, 0.55, 0.75, 0.95];

  // Later seasons lift the floor a little so a returning child is not replaying
  // the same five matches, without ever exceeding the cap above.
  function skillFor(index, season) {
    var base = SKILL[Math.max(0, Math.min(COUNT - 1, index))];
    return Math.min(0.95, base + Math.min(0.15, (season || 0) * 0.05));
  }

  function crestFor(index) {
    return CRESTS[Math.max(0, Math.min(COUNT - 1, index))];
  }

  // Losing costs progress but never destroys it: you replay the same opponent.
  // Elimination would mean a child losing the final loses everything, which
  // contradicts the rule that a wrong answer never costs a turn.
  function recordResult(cup, won) {
    var index = cup.index | 0, season = cup.season | 0;
    if (!won) { return { season: season, index: index }; }
    index += 1;
    if (index >= COUNT) { return { season: season + 1, index: 0 }; }
    return { season: season, index: index };
  }

  function isComplete(cup, previousIndex) {
    return cup.index === 0 && previousIndex === COUNT - 1;
  }

  return {
    COUNT: COUNT, CRESTS: CRESTS, SKILL: SKILL,
    skillFor: skillFor, crestFor: crestFor,
    recordResult: recordResult, isComplete: isComplete
  };
})();

if (typeof module !== 'undefined') { module.exports = Tournament; }
