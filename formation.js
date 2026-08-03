'use strict';
/* ================= Formation & shooter-selection helpers =================
 * Pure, dependency-free geometry helpers shared by the game and its tests.
 * No DOM access here so `node test.js` can `require('./formation.js')`
 * directly, the same trick `maths.js` already uses.
 *
 * Geometry mirrors the constants in game.js (pitch 600x900, goal lines at
 * y=72/828, players r=26, ball r=13). They are duplicated here rather than
 * shared via a module system because there is no build step.
 */
var Formation = (function () {

  var W = 600, H = 900;
  var SIDE_L = 22, SIDE_R = W - 22;
  var TOP_Y = 72, BOT_Y = H - 72;
  var HALF_Y = H / 2;               // 450 - the halfway line
  var GOAL_X = W / 2;                // 300 - both goal mouths are centred here
  var PLAYER_R = 26, BALL_R = 13;
  var BALL_HOME_X = W / 2, BALL_HOME_Y = H / 2; // (300, 450)

  // The kickoff exploit: ball at (300,450) sits on the same vertical line as
  // both goal centres (300,72) and (300,828). Any player also on that line
  // can score with a dead-straight flick, every match, forever. This is the
  // minimum perpendicular distance a player's centre must clear from that
  // line, with enough margin over PLAYER_R + BALL_R (39) that the player
  // can never overlap the ball either.
  var MIN_LINE_DIST = 50;

  // Zones below are deliberately generous margins, not tight optimisation:
  // this is a children's game, not a packing problem. Each zone is chosen so
  // the invariants below hold by construction, not by rejection sampling:
  //   - every player's |x - GOAL_X| >= 56, comfortably over MIN_LINE_DIST
  //     (50) and over PLAYER_R + BALL_R (39), so the ball-goal line is
  //     always clear and no player can start on top of the ball.
  //   - the deep player and the two forwards are separated in y by >=70,
  //     over 2*PLAYER_R (52), so they can never overlap regardless of x.
  //   - the two forwards are separated in x by >=112, over 2*PLAYER_R (52),
  //     so they can never overlap regardless of y.
  //   - every zone stays within the pitch rectangle with several pixels of
  //     margin, and entirely on the human side of the halfway line.
  var DEEP_Y_MIN = 700, DEEP_Y_MAX = 795;     // nearest own goal
  var DEEP_OFF_MIN = 56, DEEP_OFF_MAX = 110;  // |x - GOAL_X|, either side

  var FWD_Y_MIN = 500, FWD_Y_MAX = 640;       // further forward, toward halfway
  var FL_X_MIN = SIDE_L + PLAYER_R + 10;       // 58
  var FL_X_MAX = GOAL_X - MIN_LINE_DIST - 6;   // 244
  var FR_X_MIN = GOAL_X + MIN_LINE_DIST + 6;   // 356
  var FR_X_MAX = SIDE_R - PLAYER_R - 10;       // 542

  function lerp(rand, lo, hi) { return lo + rand() * (hi - lo); }

  // One team's shape: one player deep (near their own goal), two further
  // forward and spread left/right - "recognisably football-ish", not a
  // uniform scatter.
  function makeHalf(rand) {
    var deepSide = rand() < 0.5 ? -1 : 1;
    var deepX = GOAL_X + deepSide * lerp(rand, DEEP_OFF_MIN, DEEP_OFF_MAX);
    var deepY = lerp(rand, DEEP_Y_MIN, DEEP_Y_MAX);

    var flX = lerp(rand, FL_X_MIN, FL_X_MAX);
    var flY = lerp(rand, FWD_Y_MIN, FWD_Y_MAX);

    var frX = lerp(rand, FR_X_MIN, FR_X_MAX);
    var frY = lerp(rand, FWD_Y_MIN, FWD_Y_MAX);

    return [[deepX, deepY], [flX, flY], [frX, frY]];
  }

  // Generates a fresh kickoff formation. `rand` is any `() => [0,1)`
  // generator (Math.random in the game, a seeded LCG in tests).
  //
  // The human formation is generated first, then mirrored about the
  // halfway line (y=450) to build the AI's: y -> H - y, x unchanged. Both
  // teams get an identically-shaped formation, so randomisation only ever
  // adds variety - never a positional advantage to either side.
  function make(rand) {
    var human = makeHalf(rand);
    var ai = human.map(function (pos) { return [pos[0], H - pos[1]]; });
    return { human: human, ai: ai };
  }

  // Scores an AI player by how well a hit "through" the ball (from the
  // player, past the ball's centre) would send the ball toward the target
  // goal - the dot product of (player->ball) with (ball->goal), both unit
  // vectors, so it is 1 when the push is dead-on goalward and -1 when it
  // would send the ball straight backwards. Ties (e.g. two players equally
  // well aligned) are broken by picking the nearer one. Deliberately just
  // vector maths - no simulation or search, so it stays cheap.
  function chooseShooter(aiPlayers, ball, targetGoalY) {
    var EPS = 1e-6;
    var gx = GOAL_X - ball.x, gy = targetGoalY - ball.y;
    var glen = Math.sqrt(gx * gx + gy * gy) || 1;
    var ugx = gx / glen, ugy = gy / glen;

    var best = null, bestAlign = -Infinity, bestDist = Infinity, i, p;
    for (i = 0; i < aiPlayers.length; i++) {
      p = aiPlayers[i];
      var dx = ball.x - p.x, dy = ball.y - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var align;
      if (dist < EPS) {
        align = -Infinity; // standing on the ball: no defined push direction
      } else {
        align = (dx / dist) * ugx + (dy / dist) * ugy;
      }
      var diff = align - bestAlign;
      if (best === null || diff > EPS || (diff > -EPS && dist < bestDist)) {
        best = p; bestAlign = align; bestDist = dist;
      }
    }
    return best;
  }

  // Picks the goal-mouth x-coordinate furthest from a keeper's current x,
  // clamped inward by `margin` (kept off the post) - i.e. "shoot at the
  // open corner", the target aiLaunch uses now that the CPU is meant to
  // shoot better. Pure and dependency-free so `node test.js` can check it
  // directly, same reasoning as `chooseShooter`/`keeperStep` below. A
  // keeper standing exactly at the mouth's centre is a tie, broken toward
  // the right post - arbitrary, but deterministic and still inside the
  // mouth. `margin` is clamped to half the mouth width so an oversized
  // margin can never push the target outside [mouthL, mouthR].
  function farCorner(keeperX, mouthL, mouthR, margin) {
    var half = (mouthR - mouthL) / 2;
    if (margin > half) { margin = half; }
    var distToL = keeperX - mouthL, distToR = mouthR - keeperX;
    return distToL > distToR ? mouthL + margin : mouthR - margin;
  }

  // Pure step function for the goalkeepers (playtester defect 3): slide a
  // keeper's x toward the ball's x by at most maxStep, then clamp to the
  // patrol range. Capping the step (rather than snapping straight to the
  // target) is what makes the keeper lag instead of teleporting, and the
  // clamp is what keeps it from wandering out of its own goal mouth. Kept
  // here, not in game.js, purely so `node test.js` can exercise it without
  // a DOM - game.js supplies the real bounds (goal-mouth-derived) and calls
  // this once per turn, never mid-flight.
  function keeperStep(x, targetX, maxStep, minX, maxX) {
    var dx = targetX - x;
    if (dx > maxStep) { dx = maxStep; }
    else if (dx < -maxStep) { dx = -maxStep; }
    var next = x + dx;
    if (next < minX) { next = minX; }
    else if (next > maxX) { next = maxX; }
    return next;
  }

  return {
    make: make,
    chooseShooter: chooseShooter,
    farCorner: farCorner,
    keeperStep: keeperStep,
    // Geometry exposed so tests can check placement without duplicating
    // (and risking drift from) these numbers.
    W: W, H: H, SIDE_L: SIDE_L, SIDE_R: SIDE_R, TOP_Y: TOP_Y, BOT_Y: BOT_Y,
    HALF_Y: HALF_Y, GOAL_X: GOAL_X, PLAYER_R: PLAYER_R, BALL_R: BALL_R,
    BALL_HOME_X: BALL_HOME_X, BALL_HOME_Y: BALL_HOME_Y,
    MIN_LINE_DIST: MIN_LINE_DIST,
  };
})();

if (typeof module !== 'undefined') { module.exports = Formation; }
