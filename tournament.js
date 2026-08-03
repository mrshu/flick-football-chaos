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

  // Opponents are countries. Abstract shields told a child nothing; a flag is
  // recognisable on sight and turns five arbitrary opponents into a World Cup
  // run. Flags are emoji, so they still need no image assets.
  //
  // Ordered so the toughest reputations arrive last, matching the skill curve.
  var CRESTS = [
    { flag: '\u{1F1EF}\u{1F1F5}', tint: '#f87171' },   // Japan
    { flag: '\u{1F1F3}\u{1F1F1}', tint: '#fb923c' },   // Netherlands
    { flag: '\u{1F1EA}\u{1F1F8}', tint: '#fbbf24' },   // Spain
    { flag: '\u{1F1EB}\u{1F1F7}', tint: '#60a5fa' },   // France
    { flag: '\u{1F1E7}\u{1F1F7}', tint: '#4ade80' }    // Brazil
  ];

  // The five rounds of a knockout, so the cup has a shape a child recognises
  // rather than being five interchangeable matches.
  var ROUNDS = ['\u{1F3DF}', '\u{1F949}', '\u{1F948}', '\u{1F947}', '\u{1F3C6}'];

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

  function roundIcon(i) { return ROUNDS[Math.max(0, Math.min(COUNT - 1, i))]; }

  return {
    COUNT: COUNT, CRESTS: CRESTS, SKILL: SKILL, ROUNDS: ROUNDS, roundIcon: roundIcon,
    skillFor: skillFor, crestFor: crestFor,
    recordResult: recordResult, isComplete: isComplete
  };
})();

if (typeof module !== 'undefined') { module.exports = Tournament; }
