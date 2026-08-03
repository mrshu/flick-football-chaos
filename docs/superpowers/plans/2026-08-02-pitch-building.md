# Pitch Building Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make maths build the pitch, during the opponent's turn, so the child's own turn is pure football and every correct answer leaves a visible object that changes how the game plays.

**Architecture:** `pitch.js` (new) owns earned objects — what they are, how they are drawn so their effect is obvious, and how they affect physics. `game.js` asks the question during `AI_WAIT`/`MOVING` on the CPU's turn, and spawns an object on a correct answer. The modal quiz panel is retired. `maths.js` untouched.

**Tech Stack:** Plain ES5, no modules, no build step, no assets. Node for tests.

## The design, and why

Everything built so far has the shape *"answer a question, receive a prize."* A child sees through that — it is the Math Blaster failure the research documents. This inverts it: **the reward is a better pitch, not an advantage.**

A pinball table is fun *because* it is crowded with bumpers. Plain grass is the boring version. So each correct answer drops an object that stays for the match, and by the end the child is playing pinball-football on a pitch they built by doing maths.

Three consequences that make this different from a prize:

- **Objects are neutral.** They affect whichever body reaches them, CPU included. Nothing to balance, nothing to trivialise, and the effect is *more chaos* — the part of this game that is already fun.
- **The maths happens in dead time.** The question appears when the CPU's turn starts, while the child is passively watching the red player wind up and the ball roll. Their own turn is untouched football. Interruption research says subtask boundaries cost least; this is the cleanest boundary the game has.
- **Ignoring it costs nothing.** No question ever blocks play. A child who never answers gets a completely normal game on plain grass.

### Timing

The CPU turn gives `0.9s` of `AI_WAIT` plus physics settling — typically 2–5 seconds, capped at 9. The question appears at the start of `AI_WAIT` and stays answerable **until the child begins their drag**, which gives the CPU's whole turn plus the beginning of their own.

**There is no timer and no countdown.** Sumdog's timed modes are specifically criticised for poor fit at this age range. The question simply stops being answerable when the child starts playing, which needs no clock and applies no pressure.

## Global Constraints

- **No ES modules, no frameworks, no dependencies, no build step.** Plain `<script>` tags: `maths.js`, `prizes.js`, `streak-rules.js`, `pitch.js`, `quiz.js`, `game.js`.
- **ES5 syntax** in new files; match local style when editing `game.js`.
- **Never modify `maths.js`.** Confirm with `git status --porcelain` before each commit.
- **Wordless.** Digits, symbols, shapes, colour and motion only.
- **No assets.** Every object drawn from circles, arcs, lines and polygons.
- **An object's shape must telegraph its effect** — see the visual language rules below. This is a hard requirement, not polish.
- **Nothing blocks the football.** No modal, no gate, no state that prevents aiming.
- **`node test.js` must pass**, currently 845,259 checks.
- **Commit messages**: Conventional Commits, motivation-and-change body wrapped at 72 columns, via `git commit -F - <<'EOF'` — never `-m`.
- **Simplicity is a standing owner directive.**

## Visual language — how an object says what it does

A five-year-old cannot read a legend, so the shape carries the meaning:

- **Outward-pointing triangles around a rim** mean *this pushes things away*. Used by the bumper.
- **Parallel motion streaks** mean *things slide here*. Used by the ice patch.
- On contact, an object **reacts visibly** — the bumper's spikes pulse outward and it flashes; the ice patch's streaks sweep. The reaction is what teaches the rule, since it happens exactly when the child is watching the consequence.
- A newly earned object **lands with a short pop animation** so the child sees where it came from and connects it to the answer they just gave.

## Deliberately Not In This Version

Smallest thing that tests the central claim — *is a built-up pitch more fun than empty grass?* — which cannot be settled by reasoning.

Not building: score-gating, objects that favour the child, persistence between matches, kickbacks, extra players, ramps, the streak escalation, or the advertised-prize plan (which this supersedes). The provisional age row stays as-is.

---

### Task 1: `pitch.js` — the object model

**Files:**
- Create: `pitch.js`
- Modify: `test.js`, `index.html`

**Interfaces:**
- Produces: `Pitch.create(kind, x, y) → object` with `{kind, x, y, r, born}`; `Pitch.KINDS` (`['bumper','ice']`); `Pitch.pickSpot(existing, rand, W, H) → {x, y}` choosing a free position that does not overlap an existing object or sit in a goal mouth; `Pitch.MAX` (the hard cap on objects).

- [ ] **Step 1: Write the failing test**

Append to `test.js` before `done();`:

```js
// ---- Pitch objects ----
(function () {
  var P = require('./pitch.js');

  ok(P.MAX >= 3 && P.MAX <= 10, 'object cap is a sane small number (got ' + P.MAX + ')');
  eq(P.KINDS.length, 2, 'two object kinds in this version');

  var o = P.create('bumper', 300, 450);
  eq(o.kind, 'bumper', 'create keeps the kind');
  eq(o.x, 300, 'create keeps x');
  ok(o.r > 0, 'object has a radius');

  // Spots must avoid each other and both goal mouths, or the pitch becomes
  // unplayable and objects can block a goal entirely.
  var rand = makeRng(9), existing = [], i, spot, k;
  for (i = 0; i < P.MAX; i++) {
    spot = P.pickSpot(existing, rand, 600, 900);
    ok(spot !== null, 'a spot is found while under the cap');
    for (k = 0; k < existing.length; k++) {
      ok(Math.hypot(spot.x - existing[k].x, spot.y - existing[k].y) > 40,
         'spots do not crowd each other');
    }
    // Goal mouths span x 200..400, and the nets sit beyond y<72 and y>828.
    ok(!(spot.x > 180 && spot.x < 420 && (spot.y < 170 || spot.y > 730)),
       'no spot sits in front of a goal');
    ok(spot.x > 40 && spot.x < 560 && spot.y > 120 && spot.y < 780,
       'spots stay inside the pitch');
    existing.push(P.create('bumper', spot.x, spot.y));
  }
  eq(P.pickSpot(existing, rand, 600, 900), null, 'returns null once the pitch is full');
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test.js`
Expected: FAIL — `Cannot find module './pitch.js'`

- [ ] **Step 3: Write `pitch.js`**

```js
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
```

In `index.html`, add `<script src="pitch.js"></script>` before the `quiz.js` tag.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Prove the goal guard bites**

Temporarily make `inGoalApproach` `return false;`, run `node test.js`, and confirm `no spot sits in front of a goal` fails. Restore, re-run, confirm pass. Record both outputs.

- [ ] **Step 6: Commit**

```bash
git add pitch.js test.js index.html
git commit -F - <<'EOF'
feat: add the earned pitch object model

Previously a correct answer produced an invisible multiplier; this
commit adds the objects that will instead be dropped onto the pitch, so
answering leaves something the child can see and play around.

Placement is guarded rather than free: the area in front of each goal
stays clear, because an object parked there could wall the goal off and
make a match unwinnable, and objects are kept apart so a portrait phone
pitch does not turn into soup.

- Add `pitch.js` with `create`, a cap of six, and a `pickSpot` that
  avoids goal approaches, existing objects and the pitch edges
- Return null rather than looping forever once the pitch is full
EOF
```

---

### Task 2: Ask during the CPU's turn, not the child's

**Files:**
- Modify: `game.js`, `index.html`, `style.css`

**Interfaces:**
- Consumes: `Maths`, `Pitch`.
- Produces: `game.pending` — the live question, or `null`. The `HUMAN_QUESTION` state is **deleted**.

- [ ] **Step 1: Retire the blocking state**

In `game.js`:
- Delete `askQuestion()` and its `HUMAN_QUESTION` state entirely, along with the `Quiz.show(...)` call in `startTurn`. The human branch of `startTurn` returns to setting `HUMAN_AIM` directly.
- Delete the `chargeMult` field, the `CHARGE_MULT` constant, and the capped multiplier in `endDrag`, restoring `power * MAX_LAUNCH * game.powerMult`.
- Leave `streak`, `tripleShot` and `streak-rules.js` in place but unused for now; a later pass decides their fate.

- [ ] **Step 2: Ask when the CPU starts playing**

Add a strip to `index.html`, directly after the `<header id="hud">…</header>` block:

```html
  <div id="ask" class="hidden">
    <div id="askQ"></div>
    <div id="askChoices"></div>
  </div>
```

Style it as a **slim strip that never covers the pitch** — append to `style.css`:

```css
#ask {
  width: min(96vw, 560px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 7px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .07);
}
#askQ { display: flex; align-items: center; gap: 6px; font-size: clamp(17px, 2.8vh, 24px); font-weight: 800; }
#askChoices { display: flex; gap: 7px; }
#askChoices button {
  font: inherit;
  font-weight: 800;
  font-size: clamp(15px, 2.4vh, 20px);
  min-width: 48px;
  padding: 6px 9px;
  border: none;
  border-radius: 10px;
  background: #3b82f6;
  color: #fff;
  cursor: pointer;
}
#askChoices button.right { background: #2ec27e; }
#askChoices button.wrong { background: #ef4444; }
```

In `startTurn`, when the turn passes to the CPU **and** `game.mathsOn`, build a question and show the strip. Reuse `Quiz`'s existing `renderToken` logic by exporting it (`Quiz.renderToken`) rather than duplicating token rendering — one renderer, one place to fix.

- [ ] **Step 3: Close the question when the child starts playing**

In the `pointerdown` handler, when a drag begins, clear any unanswered question and hide the strip. There is deliberately **no timer**: the question simply stops being available once football resumes.

- [ ] **Step 4: Feed the result to the adaptive engine**

On an answer, call `Maths.update` exactly as before. On a correct answer, spawn an object (Task 3). An **unanswered** question must **not** reach `Maths.update` — a child who chose not to answer has told us nothing about their ability, and scoring it wrong would lower their difficulty for declining.

- [ ] **Step 5: Verify in the browser**

Serve on 8500. Confirm and record:
1. The question appears when red starts their turn, in a strip **above** the pitch that never covers it.
2. Your own turn has **no question at all** — you can drag and flick immediately.
3. Answering during red's turn works while the ball is still rolling.
4. Starting a drag with the question unanswered dismisses it silently.
5. There is no countdown or timer anywhere.
6. `off` still disables questions entirely.
7. Console free of errors.

- [ ] **Step 6: Commit**

```bash
git add game.js index.html style.css
git commit -F - <<'EOF'
feat: ask the maths question during the opponent's turn

Previously a modal panel covered the pitch and gated every human turn,
which made the maths a toll on the way to the football; this commit
moves the question into the dead time the child already spends watching
the CPU wind up and the ball roll.

The child's own turn is now pure football with nothing overlaid, and the
question closes silently the moment they start a drag, so it needs no
timer and applies no time pressure.

- Delete the blocking HUMAN_QUESTION state and the charge multiplier
- Ask at the start of the CPU's turn in a strip above the pitch
- Reuse the existing token renderer rather than duplicating it
- Leave an unanswered question out of the adaptive engine, since
  declining says nothing about what the child can do
EOF
```

---

### Task 3: Objects that land, collide, and show what they do

**Files:**
- Modify: `game.js`

**Interfaces:**
- Consumes: `Pitch`.
- Produces: `game.objects` — earned objects, drawn and collided, cleared on `restart()`.

- [ ] **Step 1: Spawn on a correct answer**

Add `objects: []` to the `game` object literal. On a correct answer, call `Pitch.pickSpot(game.objects, Math.random, W, H)`; if it returns a spot, push `Pitch.create(kind, spot.x, spot.y)` choosing the kind at random from `Pitch.KINDS`. If it returns `null` the pitch is full — award nothing and do not error.

Clear `game.objects` in `restart()`.

- [ ] **Step 2: Make bumpers collide**

Bumpers are static circles, exactly like the existing goalposts. In `physicsStep`, alongside the existing posts loop, add bumpers:

```js
    for (const o of list) {
      for (const obj of game.objects) {
        if (obj.kind === 'bumper') { collideCircles(o, { x: obj.x, y: obj.y, vx: 0, vy: 0, r: obj.r, invM: 0 }); }
      }
    }
```

Bumpers should feel **springy**, not dead — a bumper the ball thuds against is not fun. Give the struck body a small outward impulse on contact so it kicks rather than merely blocks, and set `obj.hit = 0.25` so the draw code can flash it.

- [ ] **Step 3: Make ice reduce friction locally**

In the per-body friction step, if a body's centre is inside an ice patch, apply `SLIPPERY_FRICTION` instead of `game.friction` for that body this step.

- [ ] **Step 4: Draw them so the effect is obvious**

In `drawPitch` (so objects sit under the players), draw each object:

- **Bumper** — a filled circle with a ring, and **6 small triangles pointing outward** around its rim. Outward spikes read as *pushes away*. While `obj.hit > 0`, scale the triangles up and brighten the ring, then decay `hit` each frame.
- **Ice** — a pale translucent blue ellipse with **3 horizontal streak lines**. Parallel motion streaks read as *slides here*.
- A newly spawned object **pops in**: scale from 0 to 1 over ~0.25s using `obj.born`, so the child sees it arrive and connects it to their answer.

- [ ] **Step 5: Verify in the browser**

Serve on 8500. Confirm and record:
1. A correct answer during red's turn makes an object **pop in** visibly.
2. The bumper's outward spikes are legible, and it **flashes and kicks** when struck — check the ball changes direction with added energy, not less.
3. Ice visibly makes bodies slide further across it.
4. Objects never appear in front of either goal.
5. Objects stop appearing at the cap of six.
6. `Play Again` clears the pitch back to plain grass.
7. Objects affect the CPU's shots too — confirm by watching a red shot ricochet.
8. Console free of errors, and the game still runs at a sensible frame rate with six objects.

- [ ] **Step 6: Commit**

```bash
git add game.js
git commit -F - <<'EOF'
feat: drop earned objects onto the pitch

Previously answering correctly changed a number the child could not see;
this commit makes it drop a bumper or an ice patch onto the pitch, where
it stays for the match and changes how every later shot plays.

The objects are neutral and affect the CPU's shots as much as the
child's, which is deliberate: the reward is a more interesting pitch
rather than an advantage, so nothing needs balancing and a child who
ignores the maths still gets a normal game on plain grass.

- Spawn an object on a correct answer, up to a cap of six
- Collide bumpers as static circles and give them an outward kick, so
  they spring rather than thud
- Apply slippery friction to bodies crossing an ice patch
- Draw outward spikes for the bumper and motion streaks for the ice, so
  the shape itself says what the object does, and flash on contact
EOF
```

---

## Self-Review

**What this tests.** The one claim reasoning cannot settle: whether a child finds a built-up pitch more fun than empty grass. Everything else is deliberately deferred until that is answered.

**Known risks.** Six objects on a portrait phone may still read as clutter — the cap is a guess and wants playtesting. Neutral objects help the CPU too, which I believe is a feature but is untested. And `pickSpot` can return `null` and award nothing, which is a silent non-reward the child may find confusing; if playtest shows it matters, the fix is to replace the oldest object rather than skip.

**Type consistency.** `Pitch.create/pickSpot/KINDS/MAX` are defined in Task 1 and used with those names in Tasks 2–3. `game.objects` is declared in Task 3 Step 1 before use in Steps 2–4. `Quiz.renderToken` is exported in Task 2 Step 2 and is the only token renderer.
