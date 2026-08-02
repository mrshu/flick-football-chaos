'use strict';
var StreakRules = (function () {

  // 3 and 5 are one-off tiers; from 8 onward the top tier repeats every third
  // correct answer, so a long run keeps paying out instead of going quiet.
  function streakReward(streak) {
    if (streak === 3) { return 'chaos'; }
    if (streak === 5) { return 'chaosBig'; }
    if (streak >= 8 && (streak - 8) % 3 === 0) { return 'triple'; }
    return null;
  }

  return { streakReward: streakReward };
})();

if (typeof module !== 'undefined') { module.exports = StreakRules; }
