'use strict';
/* ==================== Opponent football styles ====================
 * Styles describe decisions, not strength. The caller retains the level's
 * aim error, launch cap, keeper settings and candidate budget, and simulates
 * every candidate through the game's ordinary physics.
 */
var Opponents = (function () {
  var IDS = ['direct', 'builder', 'banker'];
  var STYLES = {
    direct: {
      id: 'direct', name: 'Direct attacker', icon: '🎯',
      hint: 'Shoots toward the open corner whenever it can.',
      counterTip: 'Keep a blue player between the ball and your goal.'
    },
    builder: {
      id: 'builder', name: 'Space builder', icon: '↗',
      hint: 'Uses shorter diagonal advances to find a new shooting lane.',
      counterTip: 'Cover the next lane as well as the ball.'
    },
    banker: {
      id: 'banker', name: 'Bank-shot specialist', icon: '↪',
      hint: 'Tries side-wall rebounds as well as direct shots.',
      counterTip: 'Watch the side walls and the far corner.'
    }
  };

  function finite(n) { return typeof n === 'number' && isFinite(n); }
  function number(n, fallback) { return finite(n) ? n : fallback; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function styleId(id) {
    return Object.prototype.hasOwnProperty.call(STYLES, id) ? id : 'direct';
  }

  // Stable across reloads, level changes and modes. Identity consumes no
  // random sample, so revealing an opponent cannot change its next shot.
  function styleFor(identity) {
    var key = typeof identity === 'string' ? identity.trim().toLowerCase() : '';
    if (!key) { return STYLES.direct; }
    var hash = 0;
    for (var i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    return STYLES[IDS[hash % IDS.length]];
  }

  function geometry(input) {
    input = input || {};
    var w = Math.max(100, number(input.W, 600));
    var h = Math.max(100, number(input.H, 900));
    var left = number(input.SIDE_L, 22), right = number(input.SIDE_R, w - 22);
    var top = number(input.TOP_Y, 72), bottom = number(input.BOT_Y, h - 72);
    if (right - left < 50) { left = 0; right = w; }
    if (bottom - top < 50) { top = 0; bottom = h; }
    var mouthL = number(input.MOUTH_L, w / 2 - 95);
    var mouthR = number(input.MOUTH_R, w / 2 + 95);
    if (mouthR <= mouthL) { mouthL = w * 0.35; mouthR = w * 0.65; }
    return {
      width: right - left, height: bottom - top,
      left: left, right: right, top: top, bottom: bottom,
      back: Math.max(bottom + 1, number(input.BACK_BOT, h - 18)),
      mouthL: mouthL, mouthR: mouthR, centre: (mouthL + mouthR) / 2,
      radius: clamp(number(input.BALL_R, 13), 1, Math.min(right - left, bottom - top) / 4),
      // Side-wall restitution changes only horizontal velocity in game.js.
      // The virtual target accounts for that loss rather than assuming an
      // elastic billiards bounce. Callers may pass their actual WALL_REST.
      restitution: clamp(number(input.WALL_REST, 0.6), 0.05, 1)
    };
  }

  function sample(rng) {
    var n = 0.5;
    if (typeof rng === 'function') {
      try { n = rng(); } catch (e) { n = 0.5; }
    }
    return clamp(number(n, 0.5), 0, 1);
  }

  // x/y is the desired BALL destination, not the striker's contact point.
  // Bank destinations deliberately lie beyond the side wall; bounce records
  // the first wall intersection for callers that want to inspect the intent.
  // powerScale <= 1 is a deliberate softer flick, never a strength boost.
  function shotIntent(id, ball, keeper, input, attempt, rng) {
    var g = geometry(input);
    ball = ball || {}; keeper = keeper || {};
    var bx = clamp(number(ball.x, g.centre), g.left + g.radius, g.right - g.radius);
    var by = clamp(number(ball.y, (g.top + g.bottom) / 2), g.top + g.radius, g.bottom - g.radius);
    var kx = number(keeper.x, g.centre), kr = Math.max(g.radius, number(keeper.r, 26));
    var a = finite(attempt) ? Math.max(0, Math.floor(attempt)) % 3 : 0;
    var variation = sample(rng), choice = sample(rng);
    var margin = Math.min((g.mouthR - g.mouthL) / 2, kr + 4 + variation * 18);
    var openX = kx > g.centre ? g.mouthL + margin : g.mouthR - margin;
    var targetX = choice < 0.8 ? openX :
      g.mouthL + margin + ((choice - 0.8) / 0.2) * (g.mouthR - g.mouthL - margin * 2);
    var direct = { x: targetX, y: g.back, kind: 'direct', powerScale: 1 };
    id = styleId(id);

    // A low-budget builder still makes a visibly different first choice.
    // Close to goal it takes the available finish instead of laying it off.
    if (id === 'builder' && a !== 1 && by < g.bottom - g.height * 0.22) {
      var laneX = g.left + g.width * (bx < g.centre ? 0.64 : 0.36);
      if (a === 2) { laneX = g.left + g.width * (bx < g.centre ? 0.42 : 0.58); }
      var advance = g.height * (0.14 + variation * 0.08);
      return {
        x: clamp(laneX, bx - g.width * 0.28, bx + g.width * 0.28),
        y: Math.min(g.bottom - g.radius * 3, by + advance),
        kind: 'build', powerScale: 0.65 + choice * 0.15
      };
    }

    // Even a one-candidate opponent tries a bank. The second candidate is
    // direct; the third explores the other wall without enlarging the budget.
    if (id === 'banker' && a !== 1) {
      var side = bx < g.centre ? -1 : 1;
      if (a === 2) { side = -side; }
      var wallX = side < 0 ? g.left + g.radius : g.right - g.radius;
      var goalY = g.bottom + g.radius + 4;
      var mirrorX = wallX + (wallX - targetX) / g.restitution;
      var fraction = (wallX - bx) / (mirrorX - bx);
      var bounceY = by + (goalY - by) * fraction;
      // A rebound past the solid goal-line edge is not a plausible bank.
      // Likewise, do not propose an immediate bounce from a touching ball.
      if (fraction > 0.001 && fraction < 1 && bounceY <= g.bottom - g.radius) {
        return {
          x: mirrorX, y: goalY, kind: 'bank', powerScale: 1, bankSide: side,
          bounce: { x: wallX, y: bounceY }
        };
      }
    }
    return direct;
  }

  // Scores always win; own goals and invalid previews are never an upgrade.
  // Otherwise styles value the final settled ball, not a momentary advance.
  // path/startX/startY only describe the starting lane; no bodies are moved.
  function positionValue(id, preview, input) {
    if (!preview || preview.ownGoal) { return -Infinity; }
    if (preview.scores) { return Infinity; }
    if (!finite(preview.ballX) || !finite(preview.ballY)) { return -Infinity; }
    var g = geometry(input), x = preview.ballX, y = preview.ballY;
    var progress = clamp((y - g.top) / g.height, -1, 2);
    var goalDistance = Math.hypot((x - g.centre) / g.width, (g.bottom - y) / g.height);
    var edgeDistance = Math.max(0, Math.min(x - g.left, g.right - x)) / g.width;
    var path = preview.path || [];
    var startX = number(preview.startX, number(path[0], x));
    var startY = number(preview.startY, number(path[1], y));
    var advance = clamp((y - startY) / g.height, -1, 1);
    id = styleId(id);
    if (id === 'builder') {
      var laneChange = Math.min(0.28, Math.abs(x - startX) / g.width);
      var room = Math.min(0.2, edgeDistance);
      return progress + advance * 0.4 + laneChange * 0.45 + room * 0.4 - goalDistance * 0.12;
    }
    if (id === 'banker') {
      // Leave room to strike toward a wall again; hugging the wall is worse
      // than staging in a flank, and forward progress still dominates.
      var flank = Math.max(0, 1 - Math.abs(edgeDistance - 0.18) / 0.18);
      return progress + advance * 0.25 + flank * 0.16 - goalDistance * 0.15;
    }
    return -goalDistance;
  }

  return { STYLES: STYLES, styleFor: styleFor, shotIntent: shotIntent, positionValue: positionValue };
})();

if (typeof module !== 'undefined') { module.exports = Opponents; }
