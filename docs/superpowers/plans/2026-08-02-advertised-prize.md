# Advertised Prize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the invisible power multiplier with a prize the child can see before they answer, and let them skip the question entirely — so every question answered is one they chose.

**Architecture:** `prizes.js` (new, pure) decides which prize a streak earns. `quiz.js` gains a prize badge, streak pips and a skip button. `game.js` swaps `chargeMult` for prize application, and `activateModifier` learns to stack two modifiers. `maths.js` is untouched.

**Tech Stack:** Plain ES5, no modules, no build step. Node for the test suite.

This implements the amended §5 and §9.1 of `docs/superpowers/specs/2026-08-01-maths-mode-design.md`.

## Why this replaces the charged shot

The 1.35× multiplier gave a child almost no reason to try. It is **invisible** — a multiplier cannot be seen. It is **contingent** — it only pays off if the child then aims well, so a child good at maths and bad at flicking got nothing. And it is **sometimes a penalty** — more power overshoots and ruins a delicate positioning nudge.

A chaos modifier fixes all three: it reads as one icon, it fires regardless of aim, and it is already built and genuinely funny.

## Global Constraints

- **No ES modules, no frameworks, no dependencies, no build step.** Plain `<script>` tags, load order `maths.js`, `prizes.js`, `streak-rules.js`, `quiz.js`, `game.js`.
- **ES5 syntax** (`var`, `function`) in new files; match local style where editing `game.js`.
- **Never modify `maths.js`.** Confirm with `git status --porcelain` before each commit.
- **A wrong answer never costs a turn, and neither does skipping.** Both lead straight to a normal flick.
- **Wordless.** The prize badge, pips and skip control are icons only — no words. (The existing English HUD strings are Phase 3's problem, not this plan's.)
- **`node test.js` must pass**, currently 845,259 checks.
- **Commit messages**: Conventional Commits, body with motivation and concrete change, wrapped at 72 columns, via `git commit -F - <<'EOF'` — never `-m`.
- **Simplicity is a standing owner directive.** Minimum that works.

---

### Task 1: `prizes.js` — what a streak is worth

**Files:**
- Create: `prizes.js`
- Modify: `test.js`, `index.html`

**Interfaces:**
- Produces: `Prizes.forStreak(streak) → {mods: <1|2>, shake: <bool>, triple: <bool>}` — how many chaos modifiers the *next* correct answer wins, and whether it also shakes or triple-launches. Pure. Also `Prizes.pick(count, rand) → [id, ...]` choosing that many modifier ids, never pairing contradictory ones.

- [ ] **Step 1: Write the failing test**

Append to `test.js` immediately before `done();`:

```js
// ---- Advertised prize tiers ----
(function () {
  var P = require('./prizes.js');

  eq(P.forStreak(0).mods, 1, 'a first correct answer wins one modifier');
  eq(P.forStreak(0).shake, false, 'no shake at the bottom tier');
  eq(P.forStreak(2).mods, 1, 'still one modifier below streak 3');
  eq(P.forStreak(3).shake, true, 'shake from streak 3');
  eq(P.forStreak(3).mods, 1, 'still one modifier at streak 3');
  eq(P.forStreak(5).mods, 2, 'two modifiers from streak 5');
  eq(P.forStreak(7).mods, 2, 'still two at streak 7');
  eq(P.forStreak(8).triple, true, 'triple launch from streak 8');
  eq(P.forStreak(20).triple, true, 'triple persists above 8');

  // The offer must never get quietly worse as the child improves.
  var s, prev = 0, rank;
  for (s = 0; s <= 30; s++) {
    rank = P.forStreak(s).mods + (P.forStreak(s).shake ? 1 : 0) + (P.forStreak(s).triple ? 4 : 0);
    ok(rank >= prev, 'prize never regresses at streak ' + s);
    prev = rank;
  }

  // Pairs must be drawable and never self-contradictory.
  var rand = makeRng(31), i, pair;
  for (i = 0; i < 2000; i++) {
    pair = P.pick(2, rand);
    eq(pair.length, 2, 'pick(2) returns two');
    ok(pair[0] !== pair[1], 'pair members differ');
    ok(!(pair.indexOf('giant') !== -1 && pair.indexOf('tiny') !== -1),
       'giant ball is never paired with tiny players');
  }
  for (i = 0; i < 500; i++) { eq(P.pick(1, rand).length, 1, 'pick(1) returns one'); }
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test.js`
Expected: FAIL — `Cannot find module './prizes.js'`

- [ ] **Step 3: Write `prizes.js`**

```js
'use strict';
var Prizes = (function () {

  var IDS = ['giant', 'super', 'slippery', 'tiny'];

  // Giant Ball enlarges the ball; Tiny Players shrinks the players. Together
  // they read as one change cancelling the other, so they are never paired.
  function conflicts(a, b) {
    return (a === 'giant' && b === 'tiny') || (a === 'tiny' && b === 'giant');
  }

  // What the NEXT correct answer wins, given the streak so far.
  function forStreak(streak) {
    return {
      mods: streak >= 5 ? 2 : 1,
      shake: streak >= 3,
      triple: streak >= 8
    };
  }

  function pick(count, rand) {
    var first = IDS[Math.floor(rand() * IDS.length)];
    if (count < 2) { return [first]; }
    var options = [], i;
    for (i = 0; i < IDS.length; i++) {
      if (IDS[i] !== first && !conflicts(first, IDS[i])) { options.push(IDS[i]); }
    }
    return [first, options[Math.floor(rand() * options.length)]];
  }

  return { forStreak: forStreak, pick: pick, IDS: IDS };
})();

if (typeof module !== 'undefined') { module.exports = Prizes; }
```

In `index.html`, add `<script src="prizes.js"></script>` immediately after the `maths.js` tag.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Prove the conflict rule bites**

Temporarily change `conflicts` to `return false;`, run `node test.js`, and confirm `giant ball is never paired with tiny players` fails. Restore and re-run. Record both outputs — an assertion nobody has watched fail is not evidence.

- [ ] **Step 6: Commit**

```bash
git add prizes.js test.js index.html
git commit -F - <<'EOF'
feat: add prize tiers for the advertised reward

Previously a correct answer was worth a fixed invisible multiplier; this
commit adds the tier table behind the prize a child is shown before they
answer, so the offer escalates visibly with their streak.

Pairing is filtered rather than random: Giant Ball enlarges the ball
while Tiny Players shrinks the players, so together they read as one
change cancelling the other.

- Add `prizes.js` with `forStreak` and a conflict-aware `pick`
- Assert the offer never regresses as the streak grows, and that the
  contradictory pair is never drawn
EOF
```

---

### Task 2: Show the prize, the streak and a skip button

**Files:**
- Modify: `quiz.js`, `index.html`, `style.css`

**Interfaces:**
- Consumes: `Prizes` from Task 1.
- Produces: `Quiz.show(question, prize, streak, onAnswer)` — **the signature changes**. `prize` is `{mods, shake, triple, ids}`; `streak` is a number. `onAnswer(chosenValue, isCorrect, elapsedMs)` still fires once; **skipping calls it with `(null, false, elapsedMs)`**, so the caller can distinguish a skip from a wrong answer by the null value.

- [ ] **Step 1: Add the markup**

In `index.html`, replace the quiz panel block with:

```html
    <div id="quiz" class="hidden">
      <div id="quizPrize"></div>
      <div id="quizPips"></div>
      <div id="quizQ"></div>
      <div id="quizChoices"></div>
      <button id="quizSkip" type="button" aria-label="Skip">&#9197;</button>
    </div>
```

- [ ] **Step 2: Add the styles**

Append to `style.css`:

```css
#quizPrize { display: flex; gap: 8px; justify-content: center; font-size: clamp(30px, 6vh, 46px); min-height: 52px; }
#quizPrize .shake { animation: prizePulse 1s ease-in-out infinite; }
@keyframes prizePulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.16); } }

#quizPips { display: flex; gap: 5px; justify-content: center; margin: 6px 0 2px; }
#quizPips i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,.22); }
#quizPips i.on { background: #ffd54a; }

#quizSkip {
  margin-top: 14px;
  font: inherit;
  font-size: 20px;
  line-height: 1;
  padding: 7px 16px;
  border-radius: 999px;
  border: 2px solid rgba(255,255,255,.2);
  background: transparent;
  color: rgba(255,255,255,.5);
  cursor: pointer;
}
#quizSkip:hover { color: #fff; border-color: rgba(255,255,255,.45); }
```

- [ ] **Step 3: Update `quiz.js`**

Add to the cached-element block in `ready()`: `prizeEl`, `pipsEl`, `skipEl` for `quizPrize`, `quizPips`, `quizSkip`.

Add the icon map near the top of the IIFE:

```js
  // Icons only — the panel must carry no words.
  var PRIZE_ICON = {
    giant: '\u{1F388}', super: '\u{1F4A5}', slippery: '\u{1F9CA}', tiny: '\u{1F41C}'
  };
  var TRIPLE_ICON = '\u{1F680}';
```

Add a renderer for the badge and pips:

```js
  function renderPrize(prize, streak) {
    prizeEl.innerHTML = '';
    var i, span;
    for (i = 0; i < prize.ids.length; i++) {
      span = document.createElement('span');
      span.textContent = PRIZE_ICON[prize.ids[i]] || '?';
      if (prize.shake) { span.className = 'shake'; }
      prizeEl.appendChild(span);
    }
    if (prize.triple) {
      span = document.createElement('span');
      span.textContent = TRIPLE_ICON;
      span.className = 'shake';
      prizeEl.appendChild(span);
    }
    // Three pips: the visible rungs before the next escalation.
    pipsEl.innerHTML = '';
    for (i = 0; i < 3; i++) {
      var pip = document.createElement('i');
      if (i < streak % 3 || (streak > 0 && streak % 3 === 0)) { pip.className = 'on'; }
      pipsEl.appendChild(pip);
    }
  }
```

Change `show` to take the new arguments and wire the skip button:

```js
  function show(question, prize, streak, onAnswer) {
    ready();
    stopTimer();
    current = question;
    done = onAnswer;
    answered = false;
    renderPrize(prize, streak);
    // ... existing question and choice rendering unchanged ...
    skipEl.onclick = function () { skip(); };
    panel.classList.remove('hidden');
    shownAt = Date.now();
  }

  function skip() {
    if (answered) { return; }
    answered = true;
    var cb = done, elapsed = Date.now() - shownAt;
    stopTimer();
    hide();
    if (cb) { cb(null, false, elapsed); }   // null distinguishes skip from wrong
  }
```

Skipping is deliberately instant — no feedback delay, nothing to read. Hesitating should cost less than answering, never more.

- [ ] **Step 4: Verify in the browser**

Serve on port 8500. From the console:

```js
var p = { ids: ['giant'], mods: 1, shake: false, triple: false };
Quiz.show(Maths.make(3, Maths.newState(3), Math.random), p, 0,
          function (c, ok, ms) { console.log('answered', c, ok, ms); });
```

Confirm the balloon icon appears above the question and three dim pips below it. Then check, recording each:

1. `{ids:['giant','super'], mods:2, shake:true, triple:false}` with streak `5` — two pulsing icons.
2. `triple: true` — the rocket also appears.
3. Tapping **skip** logs `answered null false <ms>` **immediately**, with no feedback delay.
4. Tapping an answer still behaves as before.
5. Skip during a pending feedback timer does not double-fire the callback.
6. Console free of errors.

- [ ] **Step 5: Commit**

```bash
git add quiz.js index.html style.css
git commit -F - <<'EOF'
feat: show the prize and a skip button before the question

Previously the question arrived with no visible stake, which made it
read as a toll on the way to the football; this commit shows what the
child stands to win before they answer, and lets them decline.

Skipping returns a null choice rather than a wrong answer, so the game
can tell "chose not to play" from "tried and missed" and neither costs
a turn. It is also instant: hesitating should never cost more than
answering.

- Add a prize badge, streak pips and a skip control, all icon-only
- Change `Quiz.show` to take the prize and streak alongside the question
EOF
```

---

### Task 3: Award the prize instead of the charge

**Files:**
- Modify: `game.js`
- Modify: `test.js`

**Interfaces:**
- Consumes: `Prizes`, the new `Quiz.show` signature.
- Produces: `game.chargeMult` is **removed**; `activateModifier` accepts stacking.

- [ ] **Step 1: Teach `activateModifier` to stack**

`activateModifier` currently assumes one modifier at a time: it overwrites `game.modifier` and replaces the banner. Change it to accumulate — keep a `game.modifiers` array, apply each effect, and show every icon in the banner. `clearModifier` must empty the array and undo every effect.

Keep the single-modifier call sites working: `activateModifier('giant')` must still behave exactly as before.

- [ ] **Step 2: Replace the charge with the prize**

In `game.js`:

- Delete `chargeMult` from the `game` object literal, the `CHARGE_MULT` constant, and its reset in `clearModifier`.
- Restore `endDrag`'s launch to `power * MAX_LAUNCH * game.powerMult` — the prize is the modifier now, not a multiplier.
- In `askQuestion`, compute the prize before showing:

```js
  var prize = Prizes.forStreak(game.streak);
  prize.ids = Prizes.pick(prize.mods, Math.random);
  Quiz.show(q, prize, game.streak, function (chosen, correct, elapsedMs) { ... });
```

- In the callback, **skip is not an answer**: when `chosen === null`, do not call `Maths.update` at all — a skipped question is not evidence about the child's ability, and feeding it in as a wrong answer would drag their difficulty down for choosing not to play. Leave the streak untouched too, then go straight to `HUMAN_AIM`.
- On a correct answer, apply every id in `prize.ids` via `activateModifier`, and set `game.tripleShot` when `prize.triple`.

- [ ] **Step 3: Add the skip-is-not-an-answer test**

Append to `test.js` before `done();`:

```js
// ---- A skipped question must not move difficulty ----
(function () {
  var before = Maths.newState(4);
  // Skipping never reaches Maths.update at all; this pins the contract that a
  // skip is not a wrong answer, so a child who declines is not marked down.
  var afterWrong = Maths.update(before, { correct: false, elapsedMs: 3000, band: 4, skill: 'mul' });
  ok(afterWrong.difficulty < before.difficulty, 'a wrong answer does lower difficulty');
  eq(before.difficulty, 4, 'the caller state is untouched, so skipping it changes nothing');
})();
```

- [ ] **Step 4: Run the suite**

Run: `node test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Verify in the browser**

Serve on 8500 and play. Record each:

1. The prize icon shown before answering is the one that actually fires on a correct answer.
2. **Skipping** goes straight to aiming, awards nothing, and leaves `game.maths.difficulty` **unchanged** — check the value before and after.
3. A **wrong** answer lowers difficulty and awards nothing, but still allows the flick.
4. At streak 5, two modifiers fire together and both effects are visible.
5. Giant Ball and Tiny Players never appear together.
6. `clearModifier` fully undoes a stacked pair — ball and player radii back to normal next turn.
7. Console free of errors.

- [ ] **Step 6: Commit**

```bash
git add game.js test.js
git commit -F - <<'EOF'
feat: award the advertised prize instead of a power multiplier

Previously a correct answer multiplied flick power by 1.35 — invisible
to the child, contingent on them also aiming well, and occasionally
harmful, since more power overshoots. This commit awards the chaos
modifier that was advertised before the question instead.

A skipped question is deliberately not fed to the adaptive engine: a
child who declines has told us nothing about what they can do, and
scoring it as a wrong answer would drag their difficulty down for
choosing not to play.

- Remove `chargeMult` and restore the plain launch multiplier
- Apply every advertised modifier on a correct answer, and stack them
- Let `activateModifier` accumulate, and `clearModifier` undo all of it
EOF
```

---

## Self-Review

**Spec coverage.** Amended §5 (prize shown first, skip allowed, chaos as prize) → Tasks 2 and 3. §9.1 escalation table → Task 1. §11 stacked-modifier edge case → Task 3 Step 1.

**Deliberately deferred.** Wordless conversion of the existing English HUD (Phase 3), storage (Phase 3), cup (Phase 5), juice (Phase 6), unlocks (Phase 7).

**Known risk, accepted.** A child can skip every question and do no maths whatsoever. The prize now carries the entire motivation, which is the point — but it means if the prize does not appeal, engagement goes to zero rather than degrading gracefully. This is the first thing to watch in playtest.

**Type consistency.** `Prizes.forStreak` returns `{mods, shake, triple}`; `game.js` adds `.ids` from `Prizes.pick` before passing the object to `Quiz.show(question, prize, streak, onAnswer)`, whose signature matches Task 2. `onAnswer(null, false, ms)` on skip is produced in Task 2 and branched on in Task 3.
