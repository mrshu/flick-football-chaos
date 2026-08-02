'use strict';
var Pitch = (function () {

  var KINDS = ['bumper', 'ice'];
  // A portrait phone pitch already holds 6 players and a ball. Past a handful
  // of objects it reads as soup rather than a playground.
  var MAX = 6;
  var RADIUS = { bumper: 26, ice: 46 };

  // Keep the area in front of each goal clear: an object parked there could
  // wall off the goal and make the match unwinnable.
  function inGoalApproach(x, y, W, H) {
    return x > W * 0.3 && x < W * 0.7 && (y < H * 0.19 || y > H * 0.81);
  }

  function create(kind, x, y) {
    return { kind: kind, x: x, y: y, r: RADIUS[kind] || 26, born: 0 };
  }

  function pickSpot(existing, rand, W, H) {
    if (existing.length >= MAX) { return null; }
    var tries, x, y, i, ok_;
    for (tries = 0; tries < 200; tries++) {
      x = W * 0.1 + rand() * W * 0.8;
      y = H * 0.16 + rand() * H * 0.68;
      if (inGoalApproach(x, y, W, H)) { continue; }
      ok_ = true;
      for (i = 0; i < existing.length; i++) {
        if (Math.hypot(x - existing[i].x, y - existing[i].y) < 90) { ok_ = false; break; }
      }
      if (ok_) { return { x: x, y: y }; }
    }
    return null;
  }

  return { KINDS: KINDS, MAX: MAX, RADIUS: RADIUS, create: create, pickSpot: pickSpot };
})();

if (typeof module !== 'undefined') { module.exports = Pitch; }
