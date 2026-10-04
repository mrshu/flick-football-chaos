'use strict';
/* ==================== Helpful football bonuses ====================
 * Shared reward copy and pure geometry. The browser uses the `Bonuses`
 * global; Node tests load the same object without a DOM or build step.
 */
var Bonuses = (function () {
  var EPS = 1e-7;
  var SHRINK = 0.62, GROW = 1.35, MOVE_LIMIT = 85;
  var STREAK_REWARDS = [
    { at: 3, id: 'coach', flicks: 3 },
    { at: 5, id: 'big', flicks: 3 },
    { at: 8, id: 'small', flicks: 3 }
  ];
  var DEFS = {
    feint: {
      glyph: '↪', name: 'Keeper feint', kind: 'football',
      hint: 'The opposing keeper will not dive on your next flick.'
    },
    second: {
      glyph: '↻', name: 'Second chance', kind: 'football',
      hint: 'Take one extra flick before the red team responds.'
    },
    coach: {
      glyph: '↗', name: 'Coaching line', kind: 'control',
      hint: 'See your first contact and the ball’s first direction.'
    },
    move: {
      glyph: '➜', name: 'Run into space', kind: 'control',
      hint: 'Move one blue player a short distance, then flick.'
    },
    small: {
      glyph: '🐜', name: 'Tiny defenders', kind: 'size',
      hint: 'Smaller red defenders open gaps; their keeper stays normal.'
    },
    big: {
      glyph: '💪', name: 'Big striker', kind: 'size',
      hint: 'Grow a blue striker to make the ball easier to hit.'
    }
  };

  function finite(n) { return typeof n === 'number' && isFinite(n); }
  function streakNumber(n) {
    return finite(n) && n >= 0 && Math.floor(n) === n && n <= Number.MAX_SAFE_INTEGER;
  }
  function streakRewards(streak) {
    if (!streakNumber(streak) || streak === 0) { return []; }
    return STREAK_REWARDS.filter(function (reward) {
      return streak % reward.at === 0;
    }).map(function (reward) {
      return { at: reward.at, id: reward.id, flicks: reward.flicks };
    });
  }
  function nextStreakReward(streak) {
    if (!streakNumber(streak)) { streak = 0; }
    var next = null, nearest = Infinity;
    STREAK_REWARDS.forEach(function (reward) {
      var distance = reward.at - streak % reward.at;
      // Ties use the published order: coaching line, big striker, defenders.
      if (distance < nearest) {
        nearest = distance;
        next = { at: streak + distance, id: reward.id, flicks: reward.flicks };
      }
    });
    return next;
  }
  function point(p) { return p && finite(p.x) && finite(p.y); }
  function circle(p) { return point(p) && finite(p.r) && p.r >= 0; }
  function inset(bounds, r) {
    if (!bounds || !finite(bounds.left) || !finite(bounds.right) ||
        !finite(bounds.top) || !finite(bounds.bottom)) { return null; }
    var b = {
      left: bounds.left + r, right: bounds.right - r,
      top: bounds.top + r, bottom: bounds.bottom - r
    };
    return b.left <= b.right && b.top <= b.bottom ? b : null;
  }

  // Distance to the first wall for a circle's centre along a unit ray.
  function wallDistance(p, dx, dy, bounds, r) {
    var b = inset(bounds, r);
    if (!b) { return null; }
    if (p.x < b.left - EPS || p.x > b.right + EPS ||
        p.y < b.top - EPS || p.y > b.bottom + EPS) { return 0; }
    var t = Infinity;
    if (dx > EPS) { t = Math.min(t, (b.right - p.x) / dx); }
    if (dx < -EPS) { t = Math.min(t, (b.left - p.x) / dx); }
    if (dy > EPS) { t = Math.min(t, (b.bottom - p.y) / dy); }
    if (dy < -EPS) { t = Math.min(t, (b.top - p.y) / dy); }
    return Math.max(0, t);
  }

  // Minkowski sum: moving a circle is a point ray against an expanded
  // circle. Already touching or overlapping circles only block an approach;
  // a ray leaving them is allowed, matching a striker moving off contact.
  function circleDistance(p, dx, dy, other, movingRadius) {
    var cx = other.x - p.x, cy = other.y - p.y;
    var along = cx * dx + cy * dy;
    var radius = movingRadius + other.r;
    var gap = cx * cx + cy * cy - radius * radius;
    if (gap <= EPS) { return along > EPS ? 0 : null; }
    var perpendicular2 = cx * cx + cy * cy - along * along;
    var discriminant = radius * radius - perpendicular2;
    if (discriminant < -EPS) { return null; }
    var t = along - Math.sqrt(Math.max(0, discriminant));
    return t >= -EPS ? Math.max(0, t) : null;
  }

  // contact is the striker CENTRE at its first contact, not the shared
  // surface point. maxTravel limits this first leg, which lets the game use
  // the current drag strength. This is a first-contact aid, not a full
  // simulation: a stationary ball gets a short normal-direction guide and
  // no bounces, keeper movement, or goals are predicted.
  function guide(shooter, velocity, ball, obstacles, bounds, maxTravel) {
    if (!circle(shooter) || !circle(ball) || !velocity ||
        !finite(velocity.vx) || !finite(velocity.vy)) { return null; }
    var speed = Math.hypot(velocity.vx, velocity.vy);
    if (speed <= EPS) { return null; }
    if (maxTravel === undefined) { maxTravel = 600; }
    if (!finite(maxTravel) || maxTravel < 0) { return null; }
    var dx = velocity.vx / speed, dy = velocity.vy / speed;
    var wall = wallDistance(shooter, dx, dy, bounds, shooter.r);
    if (wall === null) { return null; }
    var distance = Math.min(maxTravel, wall), first = null;
    var others = obstacles || [];
    for (var i = 0; i < others.length; i++) {
      var obstacle = others[i];
      if (obstacle === shooter || obstacle === ball) { continue; }
      if (!circle(obstacle)) { return null; }
      var t = circleDistance(shooter, dx, dy, obstacle, shooter.r);
      if (t !== null && (t < distance - EPS ||
          (first === null && t <= distance + EPS && t < wall - EPS))) {
        distance = t; first = obstacle;
      }
    }
    var ballDistance = circleDistance(shooter, dx, dy, ball, shooter.r);
    if (ballDistance !== null && (ballDistance < distance - EPS ||
        (first === null && ballDistance <= distance + EPS && ballDistance < wall - EPS))) {
      distance = ballDistance; first = ball;
    }
    var contact = { x: shooter.x + dx * distance, y: shooter.y + dy * distance };
    var result = { contact: contact, hitBall: first === ball, ballEnd: null };
    if (!result.hitBall) { return result; }

    // Only the closing component of the striker's velocity pushes a ball.
    // A tangent contact therefore has no outgoing ball line.
    var nx = ball.x - contact.x, ny = ball.y - contact.y;
    var length = Math.hypot(nx, ny);
    if (length <= EPS) { return result; }
    nx /= length; ny /= length;
    if (dx * nx + dy * ny <= EPS) { return result; }
    var ballWall = wallDistance(ball, nx, ny, bounds, ball.r);
    if (ballWall === null) { return null; }
    var ballTravel = Math.min(180, ballWall);
    for (i = 0; i < others.length; i++) {
      obstacle = others[i];
      if (obstacle === shooter || obstacle === ball) { continue; }
      t = circleDistance(ball, nx, ny, obstacle, ball.r);
      if (t !== null) { ballTravel = Math.min(ballTravel, t); }
    }
    result.ballEnd = { x: ball.x + nx * ballTravel, y: ball.y + ny * ballTravel };
    return result;
  }

  // Clamp to the allowed run distance and radius-adjusted pitch. Reject
  // crossing a body even if the destination itself looks free. No body is
  // moved by this helper; the game commits the returned point explicitly.
  function moveTarget(player, target, bodies, posts, bounds, maxDistance) {
    if (!circle(player) || !point(target)) { return null; }
    if (maxDistance === undefined) { maxDistance = MOVE_LIMIT; }
    if (!finite(maxDistance) || maxDistance < 0) { return null; }
    var b = inset(bounds, player.r);
    if (!b) { return null; }
    var dx = target.x - player.x, dy = target.y - player.y;
    var distance = Math.hypot(dx, dy);
    if (distance > maxDistance) {
      dx *= maxDistance / distance; dy *= maxDistance / distance;
    }
    var result = {
      x: Math.max(b.left, Math.min(b.right, player.x + dx)),
      y: Math.max(b.top, Math.min(b.bottom, player.y + dy))
    };
    dx = result.x - player.x; dy = result.y - player.y;
    var pathLength2 = dx * dx + dy * dy;
    if (pathLength2 > maxDistance * maxDistance + EPS) { return null; }
    // Dropping a player back where it started cancels the interaction, even
    // when a previous collision left another body inside the 2px margin.
    if (pathLength2 <= EPS * EPS) { return result; }
    var blockers = (bodies || []).concat(posts || []);
    for (var i = 0; i < blockers.length; i++) {
      var other = blockers[i];
      if (other === player) { continue; }
      if (!circle(other)) { return null; }
      var radius = player.r + other.r + 2;
      var ox = player.x - other.x, oy = player.y - other.y;
      var initial2 = ox * ox + oy * oy;
      var finalX = result.x - other.x, finalY = result.y - other.y;
      var final2 = finalX * finalX + finalY * finalY;
      if (initial2 < radius * radius - EPS) {
        // A touching start may escape its small safety-margin deficit, but
        // an actual overlap must not turn into a teleport through a body.
        var physicalRadius = player.r + other.r;
        if (initial2 >= physicalRadius * physicalRadius - EPS &&
            ox * dx + oy * dy >= -EPS && final2 >= radius * radius - EPS) {
          continue;
        }
        return null;
      }
      var u = Math.max(0, Math.min(1, -(ox * dx + oy * dy) / pathLength2));
      var closestX = ox + dx * u, closestY = oy + dy * u;
      if (closestX * closestX + closestY * closestY < radius * radius - EPS) {
        return null;
      }
    }
    return result;
  }

  return {
    DEFS: DEFS, SHRINK: SHRINK, GROW: GROW, MOVE_LIMIT: MOVE_LIMIT,
    STREAK_REWARDS: STREAK_REWARDS,
    streakRewards: streakRewards, nextStreakReward: nextStreakReward,
    guide: guide, moveTarget: moveTarget
  };
}());

if (typeof module !== 'undefined' && module.exports) { module.exports = Bonuses; }
