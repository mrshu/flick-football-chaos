# Quiz Integration (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the tested maths engine to the playable arcade game, so a correct answer before your flick powers up the shot — the smallest change that makes this an educational game rather than two disconnected halves.

**Architecture:** A new `quiz.js` renders a question's tokens into a DOM panel over the pitch and reports the tapped answer through a callback. `game.js` gains one state, `HUMAN_QUESTION`, ahead of `HUMAN_AIM`, plus a charge multiplier and a streak counter. `maths.js` is untouched. Dependency direction stays one-way: `game.js → quiz.js → maths.js`.

**Tech Stack:** Plain ES5 JavaScript, no modules, no build step. Node for the existing test suite.

This is **Plan 2 of 7**, covering Phase 2 of `docs/superpowers/specs/2026-08-01-maths-mode-design.md` §15. Phase 1 (`maths.js`) is complete on this branch: 845,247 assertions passing.

## Global Constraints

- **No ES modules.** All files load via plain `<script>` tags in order, because ES modules cannot load over `file://` and the game must run by opening `index.html`. Load order is `maths.js`, `quiz.js`, `game.js`.
- **No frameworks, dependencies, or build step.**
- **ES5 syntax** (`var`, `function`) throughout, matching `game.js` and `maths.js`.
- **`maths.js` must not be modified by this plan.** It is finished and independently verified.
- **A wrong answer never costs a turn.** The child still flicks, at normal power. Losing a turn would teach a child that maths is the obstacle between them and football.
- **User-supplied and generated text is written with `textContent`, never `innerHTML`** — except for the one documented `pow` superscript case, which uses fixed markup and generator-supplied integers.
- **The combined power multiplier is capped at 2.0**, so a charged Super Shot cannot produce an absurd flick.
- **The CPU never answers questions and never receives a charge.** `aiLaunch` keeps using `game.powerMult` alone.
- **Commit messages** follow the repo standard in `CLAUDE.md`: Conventional Commits with a body giving motivation (why) and the concrete change (what/how), wrapped at 72 columns, written via `git commit -F - <<'EOF'` — never `-m`.
- **Simplicity is a standing owner directive.** Add the minimum that works. No speculative generality.

## Deliberately Deferred to Later Phases

Do not build these here, and do not work around their absence:

- **Wordless UI (Phase 3).** The existing English strings stay for now. The quiz panel may use symbols only, which it naturally does.
- **Slots and `localStorage` (Phase 3).** Adaptive state lives in memory and resets on reload. That is expected.
- **The cup, juice, unlocks (Phases 5–7).**

The **age selector in Task 4 is provisional scaffolding**, not the Phase 3 setup screen. Without it there is no way to see any band but the default, which makes the phase untestable. It is explicitly replaced in Phase 3.

---

### Task 1: `quiz.js` — token renderer and answer panel

**Files:**
- Create: `quiz.js`
- Modify: `index.html` (panel markup + script tag)
- Modify: `style.css` (panel styles)

**Interfaces:**
- Consumes: `Maths` global (read-only — never modify `maths.js`).
- Produces: global `Quiz` with:
  - `Quiz.show(question, onAnswer)` — renders `question` (a `Maths.make(...)` result) into the panel, makes it visible, and calls `onAnswer(chosenValue, isCorrect, elapsedMs)` once, after the feedback delay. Ignores further taps after the first.
  - `Quiz.hide()` — hides the panel and clears it.

- [ ] **Step 1: Add the panel markup**

In `index.html`, immediately after the `<div id="goalFlash" ...>` line and before `<div id="overlay" ...>`, add:

```html
    <div id="quiz" class="hidden">
      <div id="quizQ"></div>
      <div id="quizChoices"></div>
    </div>
```

Change the script tags at the bottom of the file from the single `<script src="game.js"></script>` to, in this exact order:

```html
<script src="maths.js"></script>
<script src="quiz.js"></script>
<script src="game.js"></script>
```

- [ ] **Step 2: Add the panel styles**

Append to `style.css`:

```css
#quiz {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(92%, 430px);
  padding: 20px 16px 16px;
  border-radius: 18px;
  background: rgba(6, 20, 44, .93);
  box-shadow: 0 12px 44px rgba(0, 0, 0, .6);
  z-index: 4;
  text-align: center;
}

#quizQ {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 64px;
  font-size: clamp(26px, 5.5vh, 40px);
  font-weight: 800;
}

.qBalls { display: flex; gap: 3px; }
.qBall {
  width: clamp(16px, 3vh, 24px);
  height: clamp(16px, 3vh, 24px);
  border-radius: 50%;
  background: #fff;
  border: 2px solid #222;
}
.qBox {
  min-width: 46px;
  height: 46px;
  border: 4px dashed rgba(255, 255, 255, .85);
  border-radius: 10px;
}
.qFrac { display: inline-flex; flex-direction: column; font-size: .6em; line-height: 1.05; }
.qFrac span:last-child { border-top: 3px solid #fff; }

#quizChoices { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 18px; }
#quizChoices button {
  font: inherit;
  font-weight: 800;
  font-size: clamp(20px, 3.4vh, 27px);
  min-width: 78px;
  padding: 13px 8px;
  border: none;
  border-radius: 14px;
  background: #3b82f6;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 5px 0 #1e50b0;
}
#quizChoices button:active { transform: translateY(3px); box-shadow: 0 2px 0 #1e50b0; }
#quizChoices button.right { background: #2ec27e; box-shadow: 0 5px 0 #1a8a55; }
#quizChoices button.wrong { background: #ef4444; box-shadow: 0 5px 0 #a51f1f; }
```

- [ ] **Step 3: Write `quiz.js`**

Create `quiz.js`:

```js
'use strict';
var Quiz = (function () {

  var panel, qEl, choicesEl, shownAt = 0, answered = false, done = null, current = null;
  // The feedback delay must be cancellable. Without a stored handle, a stale
  // timer can blank a freshly-shown question, or fire an answer callback for a
  // question the game already dismissed via hide() — which restart() does.
  var timer = 0;

  function stopTimer() { if (timer) { clearTimeout(timer); timer = 0; } }

  function ready() {
    if (!panel) {
      panel = document.getElementById('quiz');
      qEl = document.getElementById('quizQ');
      choicesEl = document.getElementById('quizChoices');
    }
  }

  // One display token -> one element. `√` arrives as an ordinary `op` token and
  // renders inline ("√ 49 = box"), which reads correctly; it simply has no
  // overbar. `pow` is the only token needing markup, and both its values come
  // from the generator as integers.
  function renderToken(t) {
    var e = document.createElement('span'), i, b;
    if (t.t === 'num') { e.textContent = t.v; }
    else if (t.t === 'balls') {
      e.className = 'qBalls';
      for (i = 0; i < t.v; i++) {
        b = document.createElement('i');
        b.className = 'qBall';
        e.appendChild(b);
      }
    }
    else if (t.t === 'op') { e.textContent = t.v; }
    else if (t.t === 'eq') { e.textContent = '='; }
    else if (t.t === 'sep') { e.textContent = ','; }
    else if (t.t === 'box') { e.className = 'qBox'; }
    else if (t.t === 'pct') { e.textContent = t.v + '%'; }
    else if (t.t === 'pow') { e.innerHTML = String(t.v) + '<sup>' + String(t.e) + '</sup>'; }
    else if (t.t === 'frac') {
      e.className = 'qFrac';
      var n = document.createElement('span'), d = document.createElement('span');
      n.textContent = t.n;
      d.textContent = t.d;
      e.appendChild(n);
      e.appendChild(d);
    }
    else { e.textContent = '?'; }
    return e;
  }

  function markAndFinish(chosen, btn) {
    if (answered) { return; }
    answered = true;
    var correct = chosen === current.answer;
    var elapsed = Date.now() - shownAt;
    btn.className = correct ? 'right' : 'wrong';
    if (!correct) {
      // Show what the right answer was, so a wrong tap teaches rather than scolds.
      var all = choicesEl.childNodes, i;
      for (i = 0; i < all.length; i++) {
        if (all[i].__value === current.answer) { all[i].className = 'right'; }
      }
    }
    var cb = done;
    stopTimer();
    timer = setTimeout(function () {
      timer = 0;
      hide();
      if (cb) { cb(chosen, correct, elapsed); }
    }, correct ? 420 : 1150);
  }

  function show(question, onAnswer) {
    ready();
    stopTimer();
    current = question;
    done = onAnswer;
    answered = false;
    qEl.innerHTML = '';
    choicesEl.innerHTML = '';
    var i, t, btn;
    for (i = 0; i < question.render.length; i++) {
      qEl.appendChild(renderToken(question.render[i]));
    }
    for (i = 0; i < question.choices.length; i++) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = question.choices[i];
      btn.__value = question.choices[i];
      (function (b) {
        b.addEventListener('click', function () { markAndFinish(b.__value, b); });
      })(btn);
      choicesEl.appendChild(btn);
    }
    panel.classList.remove('hidden');
    shownAt = Date.now();
  }

  function hide() {
    ready();
    stopTimer();
    panel.classList.add('hidden');
    qEl.innerHTML = '';
    choicesEl.innerHTML = '';
    current = null;
    done = null;
  }

  return { show: show, hide: hide };
})();
```

- [ ] **Step 4: Verify in the browser**

Serve the directory (`python3 -m http.server 8500`) and open it. The game will not yet ask questions — `game.js` is untouched. Verify the panel renders by running this in the browser console:

```js
Quiz.show(Maths.make(1, Maths.newState(1), Math.random),
          function (c, ok, ms) { console.log('answered', c, ok, ms + 'ms'); });
```

Expected: a panel appears over the pitch with footballs and two answer buttons. Tapping one colours it, and after the delay the panel hides and the callback logs. Repeat with difficulty `6`, `7` and `8` and confirm fractions, percentages and `pow` superscripts all render. Note percentages come from band **7** (`genPct`), not band 8 — band 8 is negatives, squares, roots and equations.

Confirm the browser console shows no errors.

- [ ] **Step 5: Commit**

```bash
git add quiz.js index.html style.css
git commit -F - <<'EOF'
feat: add the quiz panel and token renderer

Previously the maths engine had no way to reach the screen; this commit
adds `quiz.js`, which turns a question's display tokens into DOM and
reports the tapped answer back through a callback.

The renderer is deliberately the only place that understands tokens, so
the engine stays free of presentation and the game stays free of maths.
A wrong tap also lights the correct choice, so the moment teaches rather
than only scores.

- Add `quiz.js` with `Quiz.show(question, onAnswer)` and `Quiz.hide()`
- Add the panel markup and styles, and load maths.js, quiz.js, game.js
  in dependency order as plain scripts
- Build every label with `textContent`, the single exception being the
  `pow` superscript, whose values are generator-supplied integers
EOF
```

---

### Task 2: The `HUMAN_QUESTION` turn state

**Files:**
- Modify: `game.js`

**Interfaces:**
- Consumes: `Quiz.show/hide` from Task 1, `Maths.make/update/newState`.
- Produces: `game.maths` (adaptive state), `game.state` gains `'HUMAN_QUESTION'`, and `askQuestion()`.

- [ ] **Step 1: Add the adaptive state**

In `game.js`, in the `game` object literal (near `state:`), add these fields:

```js
  maths: null, mathsOn: true, startBand: 3,
```

- [ ] **Step 2: Ask a question at the start of each human turn**

Replace the human branch of `startTurn` — currently:

```js
  if (team === 'human') {
    game.state = 'HUMAN_AIM';
    setTurnMsg('Your turn — drag a blue player', 'human');
  } else {
```

with:

```js
  if (team === 'human') {
    if (game.mathsOn) {
      askQuestion();
    } else {
      game.state = 'HUMAN_AIM';
      setTurnMsg('Your turn — drag a blue player', 'human');
    }
  } else {
```

- [ ] **Step 3: Add `askQuestion`**

Add above `startTurn`:

```js
function askQuestion() {
  if (!game.maths) { game.maths = Maths.newState(game.startBand); }
  game.state = 'HUMAN_QUESTION';
  setTurnMsg('Answer to charge your shot', 'human');
  var q = Maths.make(game.maths.difficulty, game.maths, Math.random);
  Quiz.show(q, function (chosen, correct, elapsedMs) {
    game.maths = Maths.update(game.maths, {
      correct: correct, elapsedMs: elapsedMs, band: q.band, skill: q.skill
    });
    onAnswered(correct);
    game.state = 'HUMAN_AIM';
    setTurnMsg(correct ? 'Charged! Take your shot' : 'Your turn — drag a blue player', 'human');
  });
}
```

`onAnswered` is added in Task 3. For this task only, add a temporary stub directly above `askQuestion` so the file runs:

```js
function onAnswered(correct) { /* rewards land in Task 3 */ }
```

- [ ] **Step 4: Keep the panel out of the way of everything else**

`restart()` must clear a panel left open by a mid-question restart. In `restart()`, directly after `resetPositions();`, add:

```js
  Quiz.hide();
  game.streak = 0;
```

(`game.streak` is declared in Task 3; assigning it here is harmless beforehand.)

Also confirm by reading the code that `pointerdown` cannot start a drag during a question: the handler already returns unless `game.state === 'HUMAN_AIM'`, so no change is needed. Note this in your report.

- [ ] **Step 5: Verify in the browser**

Serve and reload. Expected: on your turn a question appears before you can aim; the pitch is not draggable until you answer; after answering the panel disappears and the flick works normally. Play through a full match. Confirm:
- a wrong answer still lets you flick
- no question appears during the goal pause or after the win overlay
- `Play Again` resets cleanly with no panel stuck open
- the console shows no errors

- [ ] **Step 6: Commit**

```bash
git add game.js
git commit -F - <<'EOF'
feat: ask a maths question before each human turn

Previously the maths engine and the game ran side by side without ever
meeting; this commit inserts a HUMAN_QUESTION state ahead of aiming, so
each turn starts with a question and the adaptive engine sees the result.

The question gates aiming but never the turn itself: answering wrongly
still hands the player their flick, because losing a turn would teach a
child that maths stands between them and football.

- Add `askQuestion`, driving `Maths.make` and feeding `Maths.update`
- Carry adaptive state on `game.maths`, seeded from `game.startBand`
- Hide any open panel on restart, so a mid-question replay starts clean
EOF
```

---

### Task 3: Charged shot and streak rewards

**Files:**
- Modify: `game.js`
- Modify: `test.js`

**Interfaces:**
- Consumes: `onAnswered` stub from Task 2 (replace it).
- Produces: `game.chargeMult`, `game.streak`, and `Game.streakReward(streak)` — a pure function exported for test, returning `null`, `'chaos'`, `'chaosBig'` or `'triple'`.

- [ ] **Step 1: Write the failing test**

Append to `test.js`, immediately before the `done();` call:

```js
// ---- Phase 2: streak rewards ----
(function () {
  var Game = require('./streak-rules.js');
  eq(Game.streakReward(0), null, 'no reward at zero');
  eq(Game.streakReward(1), null, 'no reward at one');
  eq(Game.streakReward(2), null, 'no reward at two');
  eq(Game.streakReward(3), 'chaos', 'chaos modifier at three');
  eq(Game.streakReward(4), null, 'nothing at four');
  eq(Game.streakReward(5), 'chaosBig', 'bigger reward at five');
  eq(Game.streakReward(6), null, 'nothing at six');
  eq(Game.streakReward(8), 'triple', 'triple launch at eight');
  // Past eight, every further three re-fires the top tier.
  eq(Game.streakReward(11), 'triple', 'top tier repeats at eleven');
  eq(Game.streakReward(14), 'triple', 'top tier repeats at fourteen');
  eq(Game.streakReward(12), null, 'nothing between repeats');
  var s, seen = 0;
  for (s = 1; s <= 60; s++) { if (Game.streakReward(s)) { seen++; } }
  ok(seen > 0 && seen < 60, 'rewards are occasional, not every answer (' + seen + '/60)');
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test.js`
Expected: FAIL — `Cannot find module './streak-rules.js'`

- [ ] **Step 3: Write the rule module and wire it in**

Create `streak-rules.js` — a tiny file so the rule is testable in Node without loading the DOM-dependent `game.js`:

```js
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
```

In `index.html`, add `<script src="streak-rules.js"></script>` immediately before the `quiz.js` tag.

In `game.js`, add to the `game` object literal:

```js
  chargeMult: 1, streak: 0,
```

Replace the Task 2 `onAnswered` stub with:

```js
var CHARGE_MULT = 1.35, MAX_TOTAL_MULT = 2.0;

function onAnswered(correct) {
  if (!correct) {
    game.streak = 0;
    game.chargeMult = 1;
    return;
  }
  game.chargeMult = CHARGE_MULT;
  game.streak++;
  var reward = StreakRules.streakReward(game.streak);
  if (reward === 'chaos' || reward === 'chaosBig') {
    var keys = Object.keys(MODIFIERS);
    activateModifier(keys[(Math.random() * keys.length) | 0]);
    game.sinceChaos = 0;
  } else if (reward === 'triple') {
    game.tripleShot = true;
  }
}
```

Add `tripleShot: false,` to the `game` object literal.

- [ ] **Step 4: Apply the charge to the human flick only**

In `endDrag` (the human launch), replace:

```js
  const sp = power * MAX_LAUNCH * game.powerMult;
```

with:

```js
  const sp = power * MAX_LAUNCH * Math.min(game.powerMult * game.chargeMult, MAX_TOTAL_MULT);
```

Leave the identical line inside `aiLaunch` **unchanged** — the CPU never receives a charge.

- [ ] **Step 5: Fire the triple shot**

Still in `endDrag`, directly after the two lines that set `player.vx` and `player.vy`, add:

```js
  if (game.tripleShot) {
    // Every human player fires along the same aim, fanned slightly.
    var mates = game.players.filter(function (p) { return p.team === 'human' && p !== player; });
    var baseAng = Math.atan2(player.vy, player.vx);
    mates.forEach(function (p, i) {
      var a = baseAng + (i === 0 ? -0.22 : 0.22);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
    });
    game.tripleShot = false;
  }
```

- [ ] **Step 6: Clear the charge at turn end**

In `clearModifier()`, add as the final line of the function:

```js
  game.chargeMult = 1;
```

`settle()` already calls `clearModifier()`, so the charge cannot leak into a later turn.

- [ ] **Step 7: Run test to verify it passes**

Run: `node test.js`
Expected: PASS, 0 failures.

- [ ] **Step 8: Verify the cap holds**

In the browser console, force the worst case and confirm the multiplier is capped:

```js
game.powerMult = 1.6; game.chargeMult = 1.35;
console.log('combined', Math.min(game.powerMult * game.chargeMult, 2.0));  // expect 2, not 2.16
```

- [ ] **Step 9: Commit**

```bash
git add streak-rules.js game.js index.html test.js
git commit -F - <<'EOF'
feat: reward correct answers with a charged shot and streaks

Previously answering correctly changed nothing; this commit makes a right
answer worth something immediately — a stronger flick — and builds a
streak toward larger rewards, so there is a reason to keep answering
rather than tapping at random.

Streak tiers live in their own `streak-rules.js` so the rule is testable
in Node without loading the DOM-dependent game, and the top tier repeats
every third answer past eight rather than going quiet on a long run.

- Add `streak-rules.js` with `streakReward`, covered by unit tests
- Multiply the human flick by a 1.35 charge, capped at 2.0 combined so a
  charged Super Shot cannot become absurd
- Leave `aiLaunch` untouched, so the CPU is never charged
- Clear the charge in `clearModifier`, which `settle` already calls, so
  it cannot leak into a later turn
EOF
```

---

### Task 4: Provisional age selector and end-to-end verification

**Files:**
- Modify: `index.html`, `style.css`, `game.js`

**Interfaces:**
- Consumes: everything above.
- Produces: no new API. Adds a temporary control so every band is reachable.

**This control is scaffolding.** Phase 3 replaces it with the wordless setup screen. Keep it crude on purpose — it exists so this phase is testable and playable, not to be good UI.

- [ ] **Step 1: Add the control**

In `index.html`, immediately after the `<header id="hud">…</header>` block, add:

```html
  <div id="ageRow" title="Provisional — replaced by the setup screen in Phase 3">
    <button type="button" data-band="0">off</button>
  </div>
```

Append to `style.css`:

```css
#ageRow { display: flex; gap: 5px; flex-wrap: wrap; justify-content: center; }
#ageRow button {
  font: inherit;
  font-weight: 800;
  font-size: 13px;
  min-width: 34px;
  padding: 5px 7px;
  border-radius: 9px;
  border: 2px solid rgba(255, 255, 255, .22);
  background: rgba(255, 255, 255, .07);
  color: #fff;
  cursor: pointer;
}
#ageRow button.on { background: linear-gradient(135deg, #ffd54a, #ff8a3d); color: #2b1600; border-color: transparent; }
```

- [ ] **Step 2: Wire it up**

In `game.js`, add near the other DOM wiring (beside the `#again` listener):

```js
// Provisional band picker — replaced by the wordless setup screen in Phase 3.
(function () {
  var row = el('ageRow'), age;
  for (age = 5; age <= 12; age++) {
    (function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = a;
      b.setAttribute('data-band', a - 4);
      row.appendChild(b);
    })(age);
  }
  row.addEventListener('click', function (e) {
    var band = e.target.getAttribute && e.target.getAttribute('data-band');
    if (band === null) { return; }
    band = Number(band);
    var kids = row.childNodes, i;
    for (i = 0; i < kids.length; i++) {
      if (kids[i].className !== undefined) { kids[i].className = ''; }
    }
    e.target.className = 'on';
    game.mathsOn = band > 0;
    game.startBand = band > 0 ? band : 1;
    game.maths = null;
    restart();
  });
})();
```

- [ ] **Step 3: End-to-end verification**

Serve and play a full match at several ages. Confirm each of these, and record the result of each in your report:

1. **Age 5** shows footballs and **two** answer buttons (floor support).
2. **Age 12** shows negatives, squares, roots or `□ + b = c` equations, with four buttons.
3. A **correct** answer visibly strengthens the flick versus a wrong one at the same drag length.
4. A **wrong** answer lights the right choice green and still lets you flick.
5. **Three correct in a row** fires a chaos modifier and shows its banner.
6. **`off`** disables questions entirely and the game plays exactly as before.
7. **`Play Again`** after a win resets cleanly with no panel stuck open.
8. Switching age mid-match restarts and asks questions from the new band.
9. The console is free of errors throughout.

- [ ] **Step 4: Confirm the suite still passes**

Run: `node test.js`
Expected: PASS, 0 failures. `maths.js` must be unchanged — confirm with `git status --porcelain`.

- [ ] **Step 5: Commit**

```bash
git add index.html style.css game.js
git commit -F - <<'EOF'
docs: add a provisional band picker for testing phase 2

Previously the starting band was a constant, so only one of the eight
bands could be reached and the phase could not be exercised end to end;
this commit adds a crude age row that also toggles maths off entirely.

This control is scaffolding and is deliberately not designed: Phase 3
replaces it with the wordless setup screen, so effort spent styling it
now would be thrown away.

- Add an age row driving `game.startBand` and `game.mathsOn`
- Reset adaptive state and restart the match when the band changes
EOF
```

---

## Self-Review

**Spec coverage.** §5 charged shot → Task 3. §5 no-penalty rule → Task 2 Step 5, Task 4 check 4. §9.1 streak tiers → Task 3. §10.3 `HUMAN_QUESTION` state → Task 2. §11 power stacking cap → Task 3 Steps 4 and 8. §11 no question during goal pause or after game over → Task 2 Step 5 (the state machine only calls `askQuestion` from `startTurn`).

**Deliberately out of scope**, each with its own plan: §6 wordless UI and setup screen, §9.2 unlocks, §9.3 juice, §13 the cup, §14 slots and storage.

**Known gaps carried forward.** The optional bonus question (§5) is not built — it is a density lever the owner ranked below repeat play, and it costs nothing to add later on top of `askQuestion`. Adaptive state resets on reload until Phase 3 adds storage. The `bar` token still has no emitter, so `renderToken` has no branch for it and falls through to `'?'`; that is correct until a generator emits one.

**Type consistency.** `Quiz.show(question, onAnswer)` is defined in Task 1 and called with that arity in Task 2. `onAnswer(chosen, correct, elapsedMs)` matches the `Maths.update` outcome fields assembled in Task 2. `StreakRules.streakReward` is defined in Task 3 and tested with the same name. `game.chargeMult`, `game.streak`, `game.tripleShot` are all declared in the Task 3 object-literal edit before first use.
