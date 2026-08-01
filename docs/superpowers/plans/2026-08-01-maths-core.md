# Maths Core (`maths.js`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, headless maths engine — question generation across eight difficulty bands plus the adaptive difficulty engine — fully tested in Node before any UI exists.

**Architecture:** One file, `maths.js`, exposing a single global `Maths` via an IIFE, with a Node `module.exports` tail so the same file runs in the browser and under `node`. No DOM, no game state, no `Math.random` — randomness is injected so every test is reproducible. A sibling `test.js` runs the whole suite with no framework.

**Tech Stack:** Plain ES5-compatible JavaScript (no modules, no build step), Node for the test runner.

This is **Plan 1 of 7**, covering Phase 1 of the spec (`docs/superpowers/specs/2026-08-01-maths-mode-design.md` §15). It delivers a tested library, not a user-visible change — deliberately, because §12 notes a generator that marks wrong answers correct actively teaches error and casual play will never catch it.

## Global Constraints

- **No ES modules.** `maths.js` is loaded via a plain `<script>` tag, because ES modules cannot load over `file://` and the game must run by opening `index.html` (spec §4).
- **No frameworks, no dependencies, no build step.** Node's standard library only, and only in `test.js`.
- **No `Math.random()` inside `maths.js`.** A `rand` function is always injected (spec §10.2).
- **No `Date.now()` inside `maths.js`.** Elapsed time is passed in.
- **All arithmetic in integers internally.** Decimals are formed only at the point of display, and restricted to multiples of `0.25`, which are binary-exact (spec §11).
- **No negative values in any question below band 8** (spec §11).
- **Division is always exact** in bands 4–6; no remainders (spec §11).
- **Language-independent:** `render` emits only token objects, never words. Token types are exactly `num`, `balls`, `op`, `eq`, `box`, `frac`, `bar`, `sep`, `pct`, `pow` (spec §10.2).
- **ES5 syntax** (`var`, `function`) to match the existing `game.js` style and avoid any transpilation question.
- **Commit messages follow the repo standard in `CLAUDE.md`:** Conventional Commits, with a body giving the motivation (why) and the concrete change (what/how), wrapped at 72 columns. Use `git commit -F - <<'EOF'` rather than `-m`, which mangles backticks. Each task's commit step below contains the exact message to use.

---

### Task 1: Test harness and module skeleton

**Files:**
- Create: `maths.js`
- Create: `test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: global `Maths` object with `module.exports` tail. `test.js` helpers `ok(cond, msg)`, `eq(actual, expected, msg)`, `makeRng(seed) → function(): number`, `done()`.

- [ ] **Step 1: Write the failing test**

Create `test.js`:

```js
'use strict';
var Maths = require('./maths.js');

var checks = 0, failures = 0;

function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
}

function eq(actual, expected, msg) {
  ok(actual === expected, msg + ' (got ' + actual + ', want ' + expected + ')');
}

// Deterministic LCG so every run is reproducible.
function makeRng(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function done() {
  console.log(checks + ' checks, ' + failures + ' failures');
  process.exit(failures ? 1 : 0);
}

// ---- Task 1 ----
ok(typeof Maths === 'object' && Maths !== null, 'Maths module loads');
ok(typeof Maths.make === 'function', 'Maths.make is a function');
ok(typeof Maths.update === 'function', 'Maths.update is a function');
ok(typeof Maths.newState === 'function', 'Maths.newState is a function');

var r1 = makeRng(42), r2 = makeRng(42);
eq(r1(), r2(), 'same seed yields same first value');
ok(r1() !== r1(), 'successive values differ');

done();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test.js`
Expected: FAIL — `Cannot find module './maths.js'`

- [ ] **Step 3: Write minimal implementation**

Create `maths.js`:

```js
'use strict';
var Maths = (function () {

  function make(difficulty, state, rand) { return null; }
  function update(state, outcome) { return state; }
  function newState(startBand) { return { difficulty: startBand, mastery: {} }; }

  return { make: make, update: update, newState: newState };
})();

if (typeof module !== 'undefined') { module.exports = Maths; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test.js`
Expected: PASS — `6 checks, 0 failures`, exit code 0

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
test: add maths module skeleton and test harness

Previously the maths engine did not exist; this commit lays down the
module shape and a dependency-free test runner so every later task has
somewhere to land and something to prove itself against.

`maths.js` is an IIFE assigning a global rather than an ES module,
because ES modules cannot load over `file://` and the game must run by
opening `index.html`; a `module.exports` tail lets Node test the same
file unchanged.

- Add `maths.js` with stub `make`, `update` and `newState`, replaced by
  later tasks
- Add `test.js` with `ok`/`eq` assertions, a seeded LCG `makeRng` so
  runs are reproducible, and `done()` exiting non-zero on any failure
- Keep ES5 syntax and inject randomness rather than calling
  `Math.random`, matching the constraints the rest of the plan relies on
EOF
```

---

### Task 2: Random helpers

**Files:**
- Modify: `maths.js`
- Modify: `test.js`

**Interfaces:**
- Consumes: `Maths` IIFE from Task 1.
- Produces: `Maths._randInt(rand, lo, hi) → integer in [lo,hi]`, `Maths._pick(rand, array) → element`, `Maths._shuffle(rand, array) → new shuffled array` (does not mutate input). Underscore prefix marks these as internal-but-exported-for-test.

- [ ] **Step 1: Write the failing test**

Append to `test.js`, immediately before the `done();` call:

```js
// ---- Task 2 ----
(function () {
  var rand = makeRng(7), i, v, seen = {};
  for (i = 0; i < 2000; i++) {
    v = Maths._randInt(rand, 3, 6);
    ok(v >= 3 && v <= 6, 'randInt stays in range');
    ok(v === Math.floor(v), 'randInt returns an integer');
    seen[v] = true;
  }
  ok(seen[3] && seen[4] && seen[5] && seen[6], 'randInt reaches both bounds');

  eq(Maths._randInt(rand, 5, 5), 5, 'randInt with equal bounds returns that value');

  var arr = [1, 2, 3, 4, 5];
  var sh = Maths._shuffle(makeRng(1), arr);
  eq(arr.join(','), '1,2,3,4,5', 'shuffle does not mutate its input');
  eq(sh.slice().sort().join(','), '1,2,3,4,5', 'shuffle preserves elements');
  eq(Maths._shuffle(makeRng(9), arr).join(','),
     Maths._shuffle(makeRng(9), arr).join(','), 'shuffle is deterministic per seed');

  // The three assertions above all pass against a no-op `return arr.slice()`.
  // This one is what makes a dead shuffle fail. A correct shuffle may return
  // the original order by chance, so require only that some seed reorders.
  var reordered = false, sd;
  for (sd = 1; sd <= 20 && !reordered; sd++) {
    if (Maths._shuffle(makeRng(sd), arr).join(',') !== arr.join(',')) { reordered = true; }
  }
  ok(reordered, 'shuffle actually reorders elements across seeds');

  ok(arr.indexOf(Maths._pick(makeRng(3), arr)) !== -1, 'pick returns a member');
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test.js`
Expected: FAIL — `TypeError: Maths._randInt is not a function`

- [ ] **Step 3: Write minimal implementation**

In `maths.js`, add these functions inside the IIFE above `make`, and add them to the returned object:

```js
  function _randInt(rand, lo, hi) {
    return lo + Math.floor(rand() * (hi - lo + 1));
  }

  function _pick(rand, arr) {
    return arr[_randInt(rand, 0, arr.length - 1)];
  }

  function _shuffle(rand, arr) {
    var out = arr.slice(), i, j, t;
    for (i = out.length - 1; i > 0; i--) {
      j = _randInt(rand, 0, i);
      t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }
```

Update the return statement:

```js
  return {
    make: make, update: update, newState: newState,
    _randInt: _randInt, _pick: _pick, _shuffle: _shuffle
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test.js`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
feat: add seeded random helpers to maths module

Previously each generator would have had to reimplement bounded random
draws; this commit adds three shared helpers so band code stays focused
on arithmetic rather than plumbing.

Randomness is taken as an injected `rand` function rather than read from
`Math.random`, which is what makes every generator test reproducible.

- Add `_randInt`, `_pick` and `_shuffle` inside the `Maths` IIFE
- Make `_shuffle` copy its input, so callers' arrays are never mutated
- Cover range, both bounds, determinism per seed, and non-mutation
EOF
```

---

### Task 3: Choice count and distractor building

**Files:**
- Modify: `maths.js`
- Modify: `test.js`

**Interfaces:**
- Consumes: `_randInt`, `_shuffle` from Task 2.
- Produces:
  - `Maths.choiceCount(difficulty) → 2 | 3 | 4` implementing spec §8.6.
  - `Maths.buildChoices(answer, count, near, rand, min) → array` — always contains `answer`, never contains duplicates, length `≤ count`, and every numeric entry `≥ min`. `near` is an array of candidate near-misses; `min` defaults to `0`. If `answer` is a string (comparison questions), only `near` is used and no numeric padding occurs.

- [ ] **Step 1: Write the failing test**

Append to `test.js` before `done();`:

```js
// ---- Task 3 ----
(function () {
  eq(Maths.choiceCount(1.0), 2, 'floor difficulty gives 2 choices');
  eq(Maths.choiceCount(1.25), 2, '1.25 boundary gives 2 choices');
  eq(Maths.choiceCount(1.26), 3, 'just above 1.25 gives 3 choices');
  eq(Maths.choiceCount(1.75), 3, '1.75 boundary gives 3 choices');
  eq(Maths.choiceCount(1.76), 4, 'just above 1.75 gives 4 choices');
  eq(Maths.choiceCount(8.0), 4, 'top difficulty gives 4 choices');

  var rand = makeRng(11), i, c, j;

  for (i = 0; i < 500; i++) {
    c = Maths.buildChoices(7, 4, [6, 8, 14], rand, 0);
    ok(c.indexOf(7) !== -1, 'choices contain the answer');
    eq(c.length, 4, 'choices honour the requested count');
    for (j = 0; j < c.length; j++) {
      ok(c.indexOf(c[j]) === j, 'no duplicate choices');
      ok(c[j] >= 0, 'no choice below min');
    }
  }

  // Tiny answer space: padding must not produce duplicates or go below min.
  for (i = 0; i < 500; i++) {
    c = Maths.buildChoices(1, 4, [2], rand, 0);
    ok(c.indexOf(1) !== -1, 'small-space choices contain the answer');
    for (j = 0; j < c.length; j++) {
      ok(c.indexOf(c[j]) === j, 'small-space choices are unique');
      ok(c[j] >= 0, 'small-space choices respect min');
    }
  }

  // Negative-capable band 8.
  c = Maths.buildChoices(-2, 4, [-1, -3, 2], rand, -20);
  ok(c.indexOf(-2) !== -1, 'negative answers are supported');

  // String answers (comparison questions) use `near` verbatim.
  c = Maths.buildChoices('<', 3, ['>', '='], rand, 0);
  eq(c.length, 3, 'comparison gives three symbol choices');
  ok(c.indexOf('<') !== -1 && c.indexOf('>') !== -1 && c.indexOf('=') !== -1,
     'comparison choices are the three symbols');
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test.js`
Expected: FAIL — `TypeError: Maths.choiceCount is not a function`

- [ ] **Step 3: Write minimal implementation**

Add inside the IIFE in `maths.js`:

```js
  function choiceCount(difficulty) {
    if (difficulty <= 1.25) { return 2; }
    if (difficulty <= 1.75) { return 3; }
    return 4;
  }

  function buildChoices(answer, count, near, rand, min) {
    if (min === undefined) { min = 0; }
    var out = [answer], i, v;

    // Strings (comparison answers) take their alternatives verbatim.
    if (typeof answer === 'string') {
      for (i = 0; i < near.length && out.length < count; i++) {
        if (out.indexOf(near[i]) === -1) { out.push(near[i]); }
      }
      return _shuffle(rand, out);
    }

    var pool = _shuffle(rand, near);
    for (i = 0; i < pool.length && out.length < count; i++) {
      v = pool[i];
      if (typeof v === 'number' && v >= min && out.indexOf(v) === -1) { out.push(v); }
    }

    // Pad outward from the answer until we have enough distinct options.
    for (i = 1; out.length < count && i <= 12; i++) {
      if (out.length < count && answer + i >= min && out.indexOf(answer + i) === -1) {
        out.push(answer + i);
      }
      if (out.length < count && answer - i >= min && out.indexOf(answer - i) === -1) {
        out.push(answer - i);
      }
    }

    return _shuffle(rand, out);
  }
```

Add `choiceCount: choiceCount, buildChoices: buildChoices` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test.js`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
feat: add choice count and distractor generation

Previously nothing turned an answer into a set of tappable options; this
commit adds that, plus the floor-support rule that keeps the weakest
learners near the target success rate.

Difficulty cannot fall below band 1, so at the bottom of the scale the
lever becomes the number of choices rather than the content: fewer
options mean less to compare and a better chance.

- Add `choiceCount`, returning 2 at difficulty <= 1.25, 3 at <= 1.75,
  else 4
- Add `buildChoices`, which always includes the answer, never emits a
  duplicate, and respects a minimum value so low bands stay positive
- Pad outward from the answer when near-misses run short, and pass
  string answers (comparison questions) through untouched
EOF
```

---

### Task 4: Bands 1 and 2

**Files:**
- Modify: `maths.js`
- Modify: `test.js`

**Interfaces:**
- Consumes: `_randInt`, `_pick` from Task 2.
- Produces: `Maths._BANDS` — an object keyed `1`–`8`, each value an array of generator functions. Every generator has signature `gen(rand) → {render, answer, skill, near}` where `render` is a token array, `answer` is a number or string, `skill` is a string id for mastery tracking, and `near` is an array of candidate near-misses. Band 1 skills: `count`, `bond5`. Band 2 skills: `add10`, `sub10`, `bond10`.

- [ ] **Step 1: Write the failing test**

Append to `test.js` before `done();`. This helper is reused by Tasks 5–7, so define it once here:

```js
// ---- Band generator shared checks (used by Tasks 4-7) ----
var TOKEN_TYPES = ['num', 'balls', 'op', 'eq', 'box', 'frac', 'bar', 'sep', 'pct', 'pow'];

function checkGenerators(band, allowNegative) {
  var gens = Maths._BANDS[band], rand = makeRng(1000 + band), g, q, i, k, tok;
  ok(gens && gens.length > 0, 'band ' + band + ' has generators');
  for (g = 0; g < gens.length; g++) {
    for (i = 0; i < 300; i++) {
      q = gens[g](rand);
      ok(!!q && typeof q === 'object', 'band ' + band + ' generator returns an object');
      ok(typeof q.skill === 'string' && q.skill.length > 0,
         'band ' + band + ' question has a skill id');
      ok(q.answer !== undefined && q.answer !== null,
         'band ' + band + ' question has an answer');
      if (typeof q.answer === 'number') {
        ok(isFinite(q.answer), 'band ' + band + ' answer is finite');
        if (!allowNegative) {
          ok(q.answer >= 0, 'band ' + band + ' answer is not negative');
        }
      }
      ok(Object.prototype.toString.call(q.render) === '[object Array]' && q.render.length > 0,
         'band ' + band + ' render is a non-empty array');
      for (k = 0; k < q.render.length; k++) {
        tok = q.render[k];
        ok(TOKEN_TYPES.indexOf(tok.t) !== -1,
           'band ' + band + ' token type "' + tok.t + '" is known');
        if (tok.t === 'num' || tok.t === 'balls' || tok.t === 'pct') {
          ok(typeof tok.v === 'number' && isFinite(tok.v),
             'band ' + band + ' ' + tok.t + ' token has a finite value');
          if (!allowNegative) {
            ok(tok.v >= 0, 'band ' + band + ' displayed value is not negative');
          }
        }
      }
      ok(Object.prototype.toString.call(q.near) === '[object Array]',
         'band ' + band + ' provides near-miss candidates');
      // Distractors are checked as strictly as the answer. Several generators
      // build them as `answer - k`, which goes negative whenever the answer is
      // small — a class of bug that is invisible unless `near` is inspected.
      for (k = 0; k < q.near.length; k++) {
        if (typeof q.near[k] === 'number') {
          ok(isFinite(q.near[k]), 'band ' + band + ' near value is finite');
          if (!allowNegative) {
            ok(q.near[k] >= 0, 'band ' + band + ' near value is not negative');
          }
        }
      }
    }
  }
}

// ---- Task 4 ----
checkGenerators(1, false);
checkGenerators(2, false);

(function () {
  // Band 1 must stay within bonds-to-5 and use football pictograms.
  var rand = makeRng(5), i, q, usedBalls = false;
  for (i = 0; i < 400; i++) {
    q = Maths._BANDS[1][0](rand);
    ok(q.answer <= 5, 'band 1 counting answers stay within 5');
    for (var k = 0; k < q.render.length; k++) {
      if (q.render[k].t === 'balls') { usedBalls = true; }
    }
  }
  ok(usedBalls, 'band 1 renders quantities as footballs');

  for (i = 0; i < 400; i++) {
    q = Maths._BANDS[2][0](rand);
    ok(q.answer <= 10, 'band 2 addition stays within 10');
  }
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test.js`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading '1')`

- [ ] **Step 3: Write minimal implementation**

Add inside the IIFE in `maths.js`, above `make`:

```js
  var OP = { add: '+', sub: '−', mul: '×', div: '÷' };

  // --- band 1: counting and bonds to 5 ---
  function genCount(rand) {
    var a = _randInt(rand, 1, 3), b = _randInt(rand, 1, Math.min(3, 5 - a));
    return {
      render: [{ t: 'balls', v: a }, { t: 'op', v: OP.add },
               { t: 'balls', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a + b, skill: 'count',
      near: [a + b + 1, a + b - 1, a, b]
    };
  }

  function genBond5(rand) {
    var a = _randInt(rand, 1, 4);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.add }, { t: 'box' },
               { t: 'eq' }, { t: 'num', v: 5 }],
      answer: 5 - a, skill: 'bond5',
      near: [5 - a + 1, 5 - a - 1, a, 5]
    };
  }

  // --- band 2: addition, subtraction and bonds within 10 ---
  function genAdd10(rand) {
    var a = _randInt(rand, 1, 9), b = _randInt(rand, 1, 10 - a);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.add },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a + b, skill: 'add10',
      near: [a + b + 1, a + b - 1, Math.abs(a - b), a + b + 2]
    };
  }

  function genSub10(rand) {
    var a = _randInt(rand, 2, 10), b = _randInt(rand, 1, a);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.sub },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a - b, skill: 'sub10',
      near: [a - b + 1, a - b - 1, a + b, b]
    };
  }

  function genBond10(rand) {
    var a = _randInt(rand, 1, 9);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.add }, { t: 'box' },
               { t: 'eq' }, { t: 'num', v: 10 }],
      answer: 10 - a, skill: 'bond10',
      near: [10 - a + 1, 10 - a - 1, a, 10]
    };
  }

  var _BANDS = {
    1: [genCount, genBond5],
    2: [genAdd10, genSub10, genBond10]
  };
```

Add `_BANDS: _BANDS` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test.js`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
feat: add band 1 and 2 question generators

Previously no questions existed; this commit adds the two easiest
bands, covering ages five and six.

Band 1 renders quantities as footballs rather than digits, so a child
who cannot yet read numerals can still answer by counting.

- Add `genCount` and `genBond5` for counting and bonds within 5
- Add `genAdd10`, `genSub10` and `genBond10` for work within 10
- Establish the generator contract returning `render`, `answer`,
  `skill` and `near`, which every later band follows
- Add a shared `checkGenerators` test helper reused by later bands
EOF
```

---

### Task 5: Bands 3 and 4

**Files:**
- Modify: `maths.js`
- Modify: `test.js`

**Interfaces:**
- Consumes: `_randInt`, `_pick`, `OP`, `_BANDS` from Task 4.
- Produces: `_BANDS[3]` (skills `add20`, `sub20`, `double`, `seq`) and `_BANDS[4]` (skills `mul`, `add100`, `sub100`, `half`).

- [ ] **Step 1: Write the failing test**

Append to `test.js` before `done();`:

```js
// ---- Task 5 ----
checkGenerators(3, false);
checkGenerators(4, false);

(function () {
  var rand = makeRng(31), i, q, k, boxes;
  for (i = 0; i < 400; i++) {
    q = Maths._BANDS[3][0](rand);
    ok(q.answer <= 20, 'band 3 addition stays within 20');
  }
  // The sequence generator must leave exactly one gap.
  for (i = 0; i < 400; i++) {
    q = Maths._BANDS[3][3](rand);
    boxes = 0;
    for (k = 0; k < q.render.length; k++) { if (q.render[k].t === 'box') { boxes++; } }
    eq(boxes, 1, 'sequence question has exactly one gap');
    ok(q.answer > 0, 'sequence answer is positive');
  }
  // Halving must always be exact.
  for (i = 0; i < 400; i++) {
    q = Maths._BANDS[4][3](rand);
    eq(q.answer, Math.floor(q.answer), 'halving yields a whole number');
  }
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test.js`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading '0')` for band 3

- [ ] **Step 3: Write minimal implementation**

Add inside the IIFE, after the band 2 generators:

```js
  // --- band 3: within 20, doubles, sequences ---
  function genAdd20(rand) {
    var a = _randInt(rand, 2, 15), b = _randInt(rand, 2, 20 - a);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.add },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a + b, skill: 'add20',
      near: [a + b + 1, a + b - 1, a + b + 10, Math.abs(a - b)]
    };
  }

  function genSub20(rand) {
    var a = _randInt(rand, 5, 20), b = _randInt(rand, 1, a);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.sub },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a - b, skill: 'sub20',
      near: [a - b + 1, Math.max(0, a - b - 1), a + b, b]
    };
  }

  function genDouble(rand) {
    var a = _randInt(rand, 2, 10);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.add },
               { t: 'num', v: a }, { t: 'eq' }, { t: 'box' }],
      answer: a * 2, skill: 'double',
      near: [a * 2 + 1, a * 2 - 1, a, a * 2 + 2]
    };
  }

  function genSeq(rand) {
    var step = _pick(rand, [2, 5, 10]);
    var start = step * _randInt(rand, 1, 4);
    var gap = _randInt(rand, 1, 3); // index of the hidden term among 5
    var render = [], i, v;
    for (i = 0; i < 5; i++) {
      v = start + i * step;
      if (i > 0) { render.push({ t: 'sep' }); }
      render.push(i === gap ? { t: 'box' } : { t: 'num', v: v });
    }
    var answer = start + gap * step;
    return {
      render: render, answer: answer, skill: 'seq',
      near: [answer + step, answer - step, answer + 1, answer - 1]
    };
  }

  // --- band 4: easy tables, within 100, halves ---
  function genMul(rand) {
    var a = _pick(rand, [2, 5, 10]), b = _randInt(rand, 2, 12);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.mul },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a * b, skill: 'mul',
      near: [a * b + a, a * b - a, a + b, a * b + 1]
    };
  }

  function genAdd100(rand) {
    var a = _randInt(rand, 10, 89), b = _randInt(rand, 5, 99 - a);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.add },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a + b, skill: 'add100',
      near: [a + b + 10, a + b - 10, a + b + 1, a + b - 1]
    };
  }

  function genSub100(rand) {
    var a = _randInt(rand, 20, 99), b = _randInt(rand, 5, a);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.sub },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a - b, skill: 'sub100',
      near: [a - b + 10, Math.max(0, a - b - 10), a - b + 1, a + b]
    };
  }

  function genHalf(rand) {
    var n = _randInt(rand, 1, 15) * 2;
    return {
      render: [{ t: 'frac', n: 1, d: 2 }, { t: 'op', v: OP.mul },
               { t: 'num', v: n }, { t: 'eq' }, { t: 'box' }],
      answer: n / 2, skill: 'half',
      near: [n, n / 2 + 1, n / 2 - 1, n / 2 + 2]
    };
  }
```

Extend `_BANDS`:

```js
  _BANDS[3] = [genAdd20, genSub20, genDouble, genSeq];
  _BANDS[4] = [genMul, genAdd100, genSub100, genHalf];
```

Place these two lines directly after the `var _BANDS = {...};` declaration.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test.js`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
feat: add band 3 and 4 question generators

Previously only bands 1 and 2 existed; this commit adds ages seven and
eight, introducing the first non-linear question shapes.

Sequences and halving broaden the question forms beyond `a op b`, which
matters because form variety keeps practice interesting at a fixed
skill level.

- Add `genAdd20`, `genSub20`, `genDouble` and `genSeq` for band 3
- Add `genMul`, `genAdd100`, `genSub100` and `genHalf` for band 4
- Keep halving exact by generating from an even multiple
- Cover the single-gap invariant for sequences and whole-number halves
EOF
```

---

### Task 6: Bands 5 and 6

**Files:**
- Modify: `maths.js`
- Modify: `test.js`

**Interfaces:**
- Consumes: `_randInt`, `_pick`, `OP`, `_BANDS` from Task 5.
- Produces: `_BANDS[5]` (skills `table`, `div`, `fracOf`) and `_BANDS[6]` (skills `add1000`, `dec`, `fracCmp`). Decimal answers are multiples of `0.25` only. `fracCmp` answers are the strings `'<'`, `'>'`, `'='`.

- [ ] **Step 1: Write the failing test**

Append to `test.js` before `done();`:

```js
// ---- Task 6 ----
checkGenerators(5, false);
checkGenerators(6, false);

(function () {
  var rand = makeRng(57), i, q;

  // Division must be exact.
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[5][1](rand);
    eq(q.answer, Math.floor(q.answer), 'division yields a whole number');
    ok(q.answer > 0, 'division answer is positive');
  }
  // Fractions of amounts must be exact.
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[5][2](rand);
    eq(q.answer, Math.floor(q.answer), 'fraction of amount is a whole number');
  }
  // Decimals must be multiples of 0.25, so binary representation is exact.
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[6][1](rand);
    eq(q.answer * 4, Math.round(q.answer * 4), 'decimal answer is a multiple of 0.25');
    eq(q.answer, Number(q.answer.toFixed(2)), 'decimal answer has no float drift');
  }
  // Comparison answers are symbols with all three offered.
  for (i = 0; i < 300; i++) {
    q = Maths._BANDS[6][2](rand);
    ok(q.answer === '<' || q.answer === '>' || q.answer === '=',
       'fraction comparison answers with a symbol');
    eq(q.near.length, 2, 'comparison offers the two other symbols');
  }
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test.js`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading '1')` for band 5

- [ ] **Step 3: Write minimal implementation**

Add inside the IIFE, after the band 4 generators:

```js
  // --- band 5: tables to 12, division, fractions of amounts ---
  function genTable(rand) {
    var a = _randInt(rand, 2, 12), b = _randInt(rand, 2, 12);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.mul },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a * b, skill: 'table',
      near: [a * b + a, a * b - a, a * b + b, a + b]
    };
  }

  function genDiv(rand) {
    var b = _randInt(rand, 2, 12), q = _randInt(rand, 2, 12), a = b * q;
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.div },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: q, skill: 'div',
      near: [q + 1, q - 1, b, a - b]
    };
  }

  function genFracOf(rand) {
    var d = _pick(rand, [2, 3, 4]), k = _randInt(rand, 2, 8), n = d * k;
    return {
      render: [{ t: 'frac', n: 1, d: d }, { t: 'op', v: OP.mul },
               { t: 'num', v: n }, { t: 'eq' }, { t: 'box' }],
      answer: k, skill: 'fracOf',
      near: [k + 1, k - 1, n, d]
    };
  }

  // --- band 6: multi-digit, decimals, fraction comparison ---
  function genAdd1000(rand) {
    var a = _randInt(rand, 100, 800);
    // b never exceeds a, so the subtraction branch cannot go negative.
    var b = _randInt(rand, 20, Math.min(199, a));
    var addition = rand() < 0.5;
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: addition ? OP.add : OP.sub },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: addition ? a + b : a - b, skill: 'add1000',
      near: addition ? [a + b + 10, a + b - 10, a + b + 100, a - b]
                     : [a - b + 10, Math.max(0, a - b - 10), a - b + 100, a + b]
    };
  }

  // Quarters only: multiples of 0.25 are binary-exact, so no float drift.
  function genDec(rand) {
    var aq = _randInt(rand, 1, 8), bq = _randInt(rand, 1, 8); // quarter units
    var sum = (aq + bq) / 4;
    return {
      render: [{ t: 'num', v: aq / 4 }, { t: 'op', v: OP.add },
               { t: 'num', v: bq / 4 }, { t: 'eq' }, { t: 'box' }],
      answer: sum, skill: 'dec',
      near: [(aq + bq + 1) / 4, (aq + bq - 1) / 4,
             (aq + bq + 4) / 4, Math.abs(aq - bq) / 4]
    };
  }

  function genFracCmp(rand) {
    var an = _randInt(rand, 1, 5), ad = _randInt(rand, 2, 6);
    var bn = _randInt(rand, 1, 5), bd = _randInt(rand, 2, 6);
    var left = an * bd, right = bn * ad; // cross-multiply, integers only
    var answer = left < right ? '<' : (left > right ? '>' : '=');
    var all = ['<', '>', '='], near = [], i;
    for (i = 0; i < all.length; i++) { if (all[i] !== answer) { near.push(all[i]); } }
    return {
      render: [{ t: 'frac', n: an, d: ad }, { t: 'box' }, { t: 'frac', n: bn, d: bd }],
      answer: answer, skill: 'fracCmp', near: near
    };
  }
```

Extend `_BANDS` beneath the band 4 assignment:

```js
  _BANDS[5] = [genTable, genDiv, genFracOf];
  _BANDS[6] = [genAdd1000, genDec, genFracCmp];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test.js`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
feat: add band 5 and 6 question generators

Previously the ladder stopped at band 4; this commit adds ages nine and
ten, where fractions and decimals first appear.

Decimals are restricted to multiples of 0.25 because those are exactly
representable in binary, which sidesteps float drift entirely rather
than papering over it with a tolerance.

- Add `genTable`, `genDiv` and `genFracOf` for band 5, generating
  division from a known product so it is always exact
- Add `genAdd1000`, `genDec` and `genFracCmp` for band 6
- Compare fractions by cross-multiplying integers, avoiding division
- Answer comparison questions with the symbols `<`, `>` and `=`
EOF
```

---

### Task 7: Bands 7 and 8

**Files:**
- Modify: `maths.js`
- Modify: `test.js`

**Interfaces:**
- Consumes: `_randInt`, `_pick`, `OP`, `_BANDS` from Task 6.
- Produces: `_BANDS[7]` (skills `pct`, `order`, `ratio`) and `_BANDS[8]` (skills `neg`, `square`, `root`, `eqn`). Band 8 is the only band permitted negative values.

- [ ] **Step 1: Write the failing test**

Append to `test.js` before `done();`:

```js
// ---- Task 7 ----
checkGenerators(7, false);
checkGenerators(8, true);   // band 8 alone may go negative

(function () {
  var rand = makeRng(83), i, q, sawNegative = false;

  // Percentages must come out whole.
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[7][0](rand);
    eq(q.answer, Math.floor(q.answer), 'percentage of amount is a whole number');
  }
  // Order of operations: multiplication binds before addition.
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[7][1](rand);
    var a = q.render[0].v, b = q.render[2].v, c = q.render[4].v;
    eq(q.answer, a + b * c, 'order of operations respects precedence');
    ok(q.answer !== (a + b) * c || b * c === (a + b) * c - a,
       'order question is not trivially ambiguous');
  }
  // Squares and roots are inverse and exact.
  for (i = 0; i < 300; i++) {
    q = Maths._BANDS[8][1](rand);
    eq(q.answer, q.render[0].v * q.render[0].v, 'square is exact');
    q = Maths._BANDS[8][2](rand);
    eq(q.answer * q.answer, q.render[1].v, 'root is exact');
  }
  // Negative results do occur in band 8.
  for (i = 0; i < 500; i++) {
    q = Maths._BANDS[8][0](rand);
    if (q.answer < 0) { sawNegative = true; }
  }
  // Not `sawNegative || true` — that is a tautology, and negative results are
  // the one property distinguishing band 8 from every other band.
  ok(sawNegative, 'band 8 actually produces negative answers');
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test.js`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading '0')` for band 7

- [ ] **Step 3: Write minimal implementation**

Add inside the IIFE, after the band 6 generators:

```js
  // --- band 7: percentages, order of operations, ratio ---
  function genPct(rand) {
    var p = _pick(rand, [10, 25, 50, 75]);
    var n = _randInt(rand, 1, 10) * 20; // divisible by 20, so all four are exact
    var answer = n * p / 100;
    return {
      render: [{ t: 'pct', v: p }, { t: 'op', v: OP.mul },
               { t: 'num', v: n }, { t: 'eq' }, { t: 'box' }],
      answer: answer, skill: 'pct',
      // Math.round keeps the "halved it" misconception without offering a
      // fractional choice to an integer question.
      near: [answer * 2, Math.round(answer / 2), answer + 10, n - answer]
    };
  }

  function genOrder(rand) {
    var a = _randInt(rand, 2, 12), b = _randInt(rand, 2, 9), c = _randInt(rand, 2, 9);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.add },
               { t: 'num', v: b }, { t: 'op', v: OP.mul },
               { t: 'num', v: c }, { t: 'eq' }, { t: 'box' }],
      answer: a + b * c, skill: 'order',
      near: [(a + b) * c, a + b + c, a + b * c + 1, a * b + c]
    };
  }

  function genRatio(rand) {
    var a = _randInt(rand, 1, 6), b = _randInt(rand, 1, 6), k = _randInt(rand, 2, 5);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: ':' }, { t: 'num', v: b },
               { t: 'eq' },
               { t: 'num', v: a * k }, { t: 'op', v: ':' }, { t: 'box' }],
      answer: b * k, skill: 'ratio',
      near: [b * k + b, b * k - b, b + k, a * k]
    };
  }

  // --- band 8: negatives, squares, roots, equations ---
  function genNeg(rand) {
    var a = _randInt(rand, 1, 9), b = _randInt(rand, 1, 12);
    return {
      render: [{ t: 'num', v: a }, { t: 'op', v: OP.sub },
               { t: 'num', v: b }, { t: 'eq' }, { t: 'box' }],
      answer: a - b, skill: 'neg',
      near: [b - a, a - b + 1, a - b - 1, a + b]
    };
  }

  function genSquare(rand) {
    var n = _randInt(rand, 2, 12);
    return {
      render: [{ t: 'pow', v: n, e: 2 }, { t: 'eq' }, { t: 'box' }],
      answer: n * n, skill: 'square',
      near: [n * 2, n * n + n, n * n - n, n * n + 1]
    };
  }

  function genRoot(rand) {
    var n = _randInt(rand, 2, 12), sq = n * n;
    return {
      render: [{ t: 'op', v: '√' }, { t: 'num', v: sq },
               { t: 'eq' }, { t: 'box' }],
      answer: n, skill: 'root',
      near: [n + 1, n - 1, Math.round(sq / 2), n * 2]
    };
  }

  function genEqn(rand) {
    var x = _randInt(rand, 1, 12), b = _randInt(rand, 1, 12);
    return {
      render: [{ t: 'box' }, { t: 'op', v: OP.add }, { t: 'num', v: b },
               { t: 'eq' }, { t: 'num', v: x + b }],
      answer: x, skill: 'eqn',
      near: [x + b, x + 1, x - 1, b]
    };
  }
```

Extend `_BANDS`:

```js
  _BANDS[7] = [genPct, genOrder, genRatio];
  _BANDS[8] = [genNeg, genSquare, genRoot, genEqn];
```

Note the `genRoot` render puts the radical `op` token *before* its operand, which is why the test reads `q.render[1].v` for the radicand.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test.js`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
feat: add band 7 and 8 question generators

Previously the ladder stopped at band 6; this commit completes it with
ages eleven and twelve.

Band 8 is the only band permitted negative values, and the unknown stays
a box rather than a Latin letter so early algebra needs no language.

- Add `genPct`, `genOrder` and `genRatio` for band 7, drawing amounts
  divisible by 20 so every percentage lands whole
- Add `genNeg`, `genSquare`, `genRoot` and `genEqn` for band 8
- Generate roots from a known square, keeping them exact
- Reuse the `op` token for `:` and the radical rather than widening the
  token vocabulary
EOF
```

---

### Task 8: `Maths.make` — band mixing and weak-spot weighting

**Files:**
- Modify: `maths.js`
- Modify: `test.js`

**Interfaces:**
- Consumes: `_BANDS`, `choiceCount`, `buildChoices`, `_randInt`, `_shuffle`.
- Produces: `Maths.newState(startBand) → {difficulty, mastery}` and `Maths.make(difficulty, state, rand) → {render, answer, choices, skill, band}` per spec §10.2. Band selection follows §8.1; skill selection follows §8.4.

- [ ] **Step 1: Write the failing test**

Append to `test.js` before `done();`:

```js
// ---- Task 8 ----
(function () {
  var rand = makeRng(101), i, q, counts = { 3: 0, 4: 0 };

  // Band mixing: difficulty 3.4 should draw roughly 40% from band 4.
  for (i = 0; i < 4000; i++) {
    q = Maths.make(3.4, Maths.newState(3.4), rand);
    ok(q.band === 3 || q.band === 4, 'difficulty 3.4 draws from band 3 or 4');
    counts[q.band]++;
  }
  var frac = counts[4] / 4000;
  ok(frac > 0.33 && frac < 0.47, 'band 4 share is near 40% (got ' + frac.toFixed(3) + ')');

  // Integer difficulty draws only that band.
  for (i = 0; i < 500; i++) {
    eq(Maths.make(5, Maths.newState(5), rand).band, 5, 'integer difficulty picks that band');
  }
  eq(Maths.make(8, Maths.newState(8), rand).band, 8, 'difficulty 8 never overflows to band 9');

  // Shape of the returned question.
  for (i = 0; i < 2000; i++) {
    q = Maths.make(1 + rand() * 7, Maths.newState(4), rand);
    ok(q.choices.indexOf(q.answer) !== -1, 'choices always contain the answer');
    ok(q.choices.length >= 2 && q.choices.length <= 4, 'choice count is 2-4');
    for (var k = 0; k < q.choices.length; k++) {
      ok(q.choices.indexOf(q.choices[k]) === k, 'choices are unique');
    }
    ok(typeof q.skill === 'string', 'question reports its skill');
  }

  // Floor support: at the bottom of the scale choices reduce.
  eq(Maths.make(1.0, Maths.newState(1), rand).choices.length, 2,
     'difficulty 1.0 offers two choices');
  eq(Maths.make(1.5, Maths.newState(1.5), rand).choices.length, 3,
     'difficulty 1.5 offers three choices');

  // Weak-spot weighting: a skill with low mastery is over-sampled.
  var st = Maths.newState(2);
  st.mastery = { add10: 0.05, sub10: 0.95, bond10: 0.95 };
  var weak = 0, total = 6000;
  for (i = 0; i < total; i++) {
    if (Maths.make(2, st, rand).skill === 'add10') { weak++; }
  }
  ok(weak / total > 0.40,
     'weak skill is favoured above its uniform 1/3 share (got ' + (weak / total).toFixed(3) + ')');
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test.js`
Expected: FAIL — `TypeError: Cannot read properties of null (reading 'band')`

- [ ] **Step 3: Write minimal implementation**

Replace the stub `make` and `newState` in `maths.js`:

```js
  function newState(startBand) {
    var d = typeof startBand === 'number' ? startBand : 1;
    if (d < 1) { d = 1; }
    if (d > 8) { d = 8; }
    return { difficulty: d, mastery: {} };
  }

  function pickBand(difficulty, rand) {
    var b = Math.floor(difficulty), f = difficulty - b;
    if (b < 1) { b = 1; f = 0; }
    if (b >= 8) { return 8; }
    return rand() < f ? b + 1 : b;
  }

  // Each generator's skill id, resolved once at load rather than on every
  // call. Placed after every _BANDS[n] assignment so the table is complete.
  var _skillIndex = (function () {
    var idx = {}, b, i, gens, fixed = function () { return 0.5; };
    for (b = 1; b <= 8; b++) {
      gens = _BANDS[b];
      idx[b] = [];
      for (i = 0; i < gens.length; i++) {
        idx[b].push(gens[i](fixed).skill);
      }
    }
    return idx;
  })();

  // 60% of the time favour weak skills, 40% uniform (spec 8.4).
  function pickGenerator(band, state, rand) {
    var gens = _BANDS[band], skills = _skillIndex[band];
    var i, m, w, weights = [], total = 0, r;
    if (rand() < 0.4) { return gens[_randInt(rand, 0, gens.length - 1)]; }
    for (i = 0; i < gens.length; i++) {
      m = state.mastery && state.mastery[skills[i]] !== undefined
        ? state.mastery[skills[i]] : 0.5;
      w = 1 - m + 0.1;
      weights.push(w);
      total += w;
    }
    r = rand() * total;
    for (i = 0; i < gens.length; i++) {
      r -= weights[i];
      if (r <= 0) { return gens[i]; }
    }
    return gens[gens.length - 1];
  }

  function make(difficulty, state, rand) {
    var band = pickBand(difficulty, rand);
    var q = pickGenerator(band, state || { mastery: {} }, rand)(rand);
    var min = band === 8 ? -30 : 0;
    var choices = buildChoices(q.answer, choiceCount(difficulty), q.near, rand, min);
    return {
      render: q.render, answer: q.answer, choices: choices,
      skill: q.skill, band: band
    };
  }
```

Two placement notes. `_skillIndex` must sit **after** every `_BANDS[n]` assignment from Tasks 4–7, since it walks all eight bands at load time. It calls each generator once with a constant `0.5` source purely to read its `skill` id; those throwaway questions never reach a player, and it happens once rather than per call.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test.js`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
feat: add band mixing and weak-spot weighted question selection

Previously the bands existed but nothing chose between them; this commit
adds the selection layer that turns a continuous difficulty into a
concrete question.

Difficulty is a float, and the fractional part is the probability of
drawing from the band above, so progression is a gradual shift in mix
rather than a cliff between levels.

- Add `pickBand`, splitting difficulty into a band and a mix probability
- Add `pickGenerator`, favouring weak skills 60% of the time and
  choosing uniformly the other 40%, since drilling only weaknesses is
  how a child comes to resent the subject
- Resolve each generator's skill id once at load into `_skillIndex`
  rather than probing on every call
- Assemble `render`, `answer`, `choices`, `skill` and `band` in `make`
EOF
```

---

### Task 9: `Maths.update` — the adaptive engine

**Files:**
- Modify: `maths.js`
- Modify: `test.js`

**Interfaces:**
- Consumes: `newState` from Task 8.
- Produces: `Maths.update(state, outcome) → newState`, where `outcome` is `{correct: boolean, elapsedMs: number, band: number, skill: string}`. Pure — the input state is never mutated. Steps per spec §8.2; expected time `2500 + 900 × band` ms, fast `< 60%`, slow `> 140%`. Mastery is an EWMA initialised at `0.5`.

- [ ] **Step 1: Write the failing test**

Append to `test.js` before `done();`:

```js
// ---- Task 9 ----
(function () {
  var base = Maths.newState(4), s;

  function outcome(correct, ms, band, skill) {
    return { correct: correct, elapsedMs: ms, band: band || 4, skill: skill || 'mul' };
  }

  // Purity.
  s = Maths.update(base, outcome(true, 1000));
  eq(base.difficulty, 4, 'update does not mutate the input state');
  ok(s !== base, 'update returns a new object');

  // Step sizes. Expected time at band 4 is 2500 + 3600 = 6100ms.
  eq(Number((Maths.update(base, outcome(true, 1000)).difficulty - 4).toFixed(3)), 0.100,
     'correct and fast steps up 0.100');
  eq(Number((Maths.update(base, outcome(true, 6000)).difficulty - 4).toFixed(3)), 0.075,
     'correct at expected pace steps up 0.075');
  eq(Number((Maths.update(base, outcome(true, 20000)).difficulty - 4).toFixed(3)), 0.040,
     'correct but slow steps up 0.040');
  eq(Number((Maths.update(base, outcome(false, 1000)).difficulty - 4).toFixed(3)), -0.300,
     'wrong steps down 0.300');

  // Clamping.
  s = Maths.newState(1);
  for (var i = 0; i < 50; i++) { s = Maths.update(s, outcome(false, 1000, 1)); }
  eq(s.difficulty, 1, 'difficulty never falls below 1');
  s = Maths.newState(8);
  for (i = 0; i < 200; i++) { s = Maths.update(s, outcome(true, 100, 8)); }
  eq(s.difficulty, 8, 'difficulty never rises above 8');

  // Mastery tracking.
  s = Maths.update(Maths.newState(4), outcome(true, 1000, 4, 'mul'));
  ok(s.mastery.mul > 0.5, 'a correct answer raises mastery above the 0.5 start');
  s = Maths.update(Maths.newState(4), outcome(false, 1000, 4, 'mul'));
  ok(s.mastery.mul < 0.5, 'a wrong answer lowers mastery');

  s = Maths.newState(4);
  for (i = 0; i < 200; i++) { s = Maths.update(s, outcome(true, 1000, 4, 'div')); }
  ok(s.mastery.div <= 1 && s.mastery.div > 0.9, 'mastery converges towards 1 without exceeding it');
  for (i = 0; i < 400; i++) { s = Maths.update(s, outcome(false, 1000, 4, 'div')); }
  ok(s.mastery.div >= 0 && s.mastery.div < 0.1, 'mastery converges towards 0 without going below');
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test.js`
Expected: FAIL — `update does not mutate the input state` passes but step-size assertions fail, since the stub returns the state unchanged

- [ ] **Step 3: Write minimal implementation**

Replace the stub `update` in `maths.js`:

```js
  var UP_FAST = 0.100, UP_MID = 0.075, UP_SLOW = 0.040, DOWN = 0.300;
  var MASTERY_ALPHA = 0.25;

  function expectedMs(band) { return 2500 + 900 * band; }

  function update(state, outcome) {
    var d = state.difficulty, step, exp = expectedMs(outcome.band);
    if (outcome.correct) {
      if (outcome.elapsedMs < exp * 0.6) { step = UP_FAST; }
      else if (outcome.elapsedMs > exp * 1.4) { step = UP_SLOW; }
      else { step = UP_MID; }
    } else {
      step = -DOWN;
    }
    d += step;
    if (d < 1) { d = 1; }
    if (d > 8) { d = 8; }

    var mastery = {}, k;
    for (k in state.mastery) {
      if (Object.prototype.hasOwnProperty.call(state.mastery, k)) {
        mastery[k] = state.mastery[k];
      }
    }
    var prev = mastery[outcome.skill] !== undefined ? mastery[outcome.skill] : 0.5;
    mastery[outcome.skill] =
      prev + MASTERY_ALPHA * ((outcome.correct ? 1 : 0) - prev);

    return { difficulty: d, mastery: mastery };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test.js`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
feat: add adaptive difficulty engine

Previously difficulty never moved; this commit makes it track the child,
rising when they succeed and falling when they struggle.

Step sizes are derived rather than guessed: a random walk settles where
`p* = d / (u + d)`, so an up-step near 0.075 against a down-step of
0.300 targets 80% accuracy. Response time separates fluency from
finger-counting, and is measured but never shown.

- Add `update`, returning a new state rather than mutating the input
- Bucket correct answers by speed against `2500 + 900 * band` ms
- Clamp difficulty to [1, 8]
- Track per-skill mastery as an EWMA initialised at 0.5
EOF
```

---

### Task 10: Full invariant sweep

**Files:**
- Modify: `test.js`

**Interfaces:**
- Consumes: everything above.
- Produces: no new API. Implements the generator invariants of spec §12 across all eight bands at volume.

- [ ] **Step 1: Write the failing test**

Append to `test.js` before `done();`. Note this deliberately re-derives each answer from the rendered tokens rather than trusting the generator — the whole point is catching a question that teaches error:

```js
// ---- Task 10: invariant sweep (spec 12) ----
(function () {
  var rand = makeRng(2024), band, i, q, k, tok, nums, ops, failuresBefore = failures;

  function numsOf(render) {
    var out = [], k;
    for (k = 0; k < render.length; k++) {
      if (render[k].t === 'num' || render[k].t === 'balls') { out.push(render[k].v); }
    }
    return out;
  }

  for (band = 1; band <= 8; band++) {
    for (i = 0; i < 2000; i++) {
      q = Maths.make(band, Maths.newState(band), rand);

      // Structural invariants.
      eq(q.band, band, 'sweep: integer difficulty stays in band');
      ok(q.choices.indexOf(q.answer) !== -1, 'sweep: answer is among the choices');
      for (k = 0; k < q.choices.length; k++) {
        ok(q.choices.indexOf(q.choices[k]) === k, 'sweep: choices are unique');
        if (typeof q.choices[k] === 'number') {
          ok(isFinite(q.choices[k]), 'sweep: no NaN or Infinity in choices');
          if (band < 8) { ok(q.choices[k] >= 0, 'sweep: no negative choice below band 8'); }
        }
      }
      ok(q.choices.length >= 2 && q.choices.length <= 4, 'sweep: 2-4 choices');
      if (typeof q.answer === 'number') {
        ok(isFinite(q.answer), 'sweep: answer is finite');
        if (band < 8) { ok(q.answer >= 0, 'sweep: no negative answer below band 8'); }
      }
      for (k = 0; k < q.render.length; k++) {
        tok = q.render[k];
        ok(TOKEN_TYPES.indexOf(tok.t) !== -1, 'sweep: token type is known');
        ok(!(tok.v !== undefined && typeof tok.v === 'number' && !isFinite(tok.v)),
           'sweep: no non-finite token value');
      }

      // Independent recomputation for the plain a-op-b-=-box forms.
      nums = numsOf(q.render);
      ops = [];
      for (k = 0; k < q.render.length; k++) {
        if (q.render[k].t === 'op') { ops.push(q.render[k].v); }
      }
      if (nums.length === 2 && ops.length === 1 &&
          q.render[q.render.length - 1].t === 'box' &&
          q.render[0].t !== 'frac' && q.render[0].t !== 'pct') {
        if (ops[0] === '+') {
          ok(Math.abs(q.answer - (nums[0] + nums[1])) < 1e-9, 'sweep: addition recomputes');
        } else if (ops[0] === '−') {
          ok(Math.abs(q.answer - (nums[0] - nums[1])) < 1e-9, 'sweep: subtraction recomputes');
        } else if (ops[0] === '×') {
          ok(Math.abs(q.answer - nums[0] * nums[1]) < 1e-9, 'sweep: multiplication recomputes');
        } else if (ops[0] === '÷') {
          ok(Math.abs(q.answer - nums[0] / nums[1]) < 1e-9, 'sweep: division recomputes');
          eq(nums[0] % nums[1], 0, 'sweep: division is exact');
        }
      }
    }
  }
  ok(failures === failuresBefore, 'sweep completed with no invariant violations');
})();

// Fraction comparison is the one question type the sweep above cannot
// recompute, because its answer is a symbol rather than a number. A sign
// inversion there would teach children the wrong thing while passing every
// shape-level assertion, so check the direction directly against known pairs.
(function () {
  var rand = makeRng(4242), i, q, left, right, expected, sawLt = 0, sawGt = 0, sawEq = 0;
  for (i = 0; i < 3000; i++) {
    q = Maths._BANDS[6][2](rand);
    // Verify by division, NOT by cross-multiplying. Recomputing with the
    // generator's own formula would let a reversed comparison cancel out and
    // pass. Denominators here are at most 6, so the smallest real gap between
    // two distinct fractions is 1/30 — far above any rounding error, making
    // the epsilon comparison safe.
    left = q.render[0].n / q.render[0].d;
    right = q.render[2].n / q.render[2].d;
    expected = Math.abs(left - right) < 1e-12 ? '=' : (left < right ? '<' : '>');
    eq(q.answer, expected, 'fraction comparison points the right way');
    if (q.answer === '<') { sawLt++; } else if (q.answer === '>') { sawGt++; } else { sawEq++; }
  }
  // Without this, a generator that always answered '<' would satisfy the loop
  // above only if the check were also broken — but it would sail through any
  // test that never looked at the spread.
  ok(sawLt > 0 && sawGt > 0 && sawEq > 0,
     'all three comparison outcomes occur (< ' + sawLt + ', > ' + sawGt + ', = ' + sawEq + ')');
})();
```

- [ ] **Step 2: Run the sweep**

Run: `node test.js`
Expected: PASS. If any band fails, fix the offending generator in `maths.js` before continuing — a failure here means a question that would teach a child the wrong answer.

- [ ] **Step 3: Verify the sweep actually bites**

Temporarily break one generator to confirm the harness detects it. In `maths.js`, change `genAdd10`'s `answer: a + b` to `answer: a + b + 1`.

Run: `node test.js`
Expected: FAIL with `sweep: addition recomputes` and a non-zero exit code.

Then revert that change and re-run to confirm PASS.

- [ ] **Step 4: Commit**

```bash
git add test.js
git commit -F - <<'EOF'
test: add full generator invariant sweep across all bands

Previously each band was tested in isolation; this commit sweeps all
eight at volume, because the worst defect an educational game can ship
is a question whose stated answer is wrong.

The sweep re-derives each answer from the rendered tokens rather than
trusting the generator, so a generator and its own test cannot agree on
the same mistake.

- Generate 2000 questions per band and assert the answer is among the
  choices, choices are unique, and nothing is NaN or Infinite
- Assert no negative values below band 8 and that division is exact
- Verify every render token is a known type
- Deliberately break a generator to confirm the sweep detects it, then
  revert, so the suite is known to bite rather than assumed to
EOF
```

---

### Task 11: Adaptive convergence test

**Files:**
- Modify: `test.js`
- Delete: `docs/superpowers/specs/2026-08-01-adaptive-tuning-sim.js`

**Interfaces:**
- Consumes: `Maths.update`, `Maths.newState`.
- Produces: no new API. Reproduces the §8.7 convergence table against the real engine rather than the standalone prototype, and then removes the prototype so there is a single source of truth.

- [ ] **Step 1: Write the failing test**

Append to `test.js` before `done();`:

```js
// ---- Task 11: adaptive convergence (spec 8.7) ----
(function () {
  // A synthetic learner of fixed ability on the 1-8 band scale. Chance of
  // knowing the answer falls off as difficulty exceeds ability; whatever is
  // not known is guessed from the available choices, which is what makes
  // floor support (spec 8.6) measurable.
  function simulate(ability, n, seed) {
    var rand = makeRng(seed), s = Maths.newState(4);
    var correct = 0, total = 0, sum = 0, i, known, choices, p, ok_, band, ms;
    for (i = 0; i < n; i++) {
      band = Math.round(s.difficulty);
      known = 1 / (1 + Math.exp(1.6 * (s.difficulty - ability)));
      choices = Maths.choiceCount(s.difficulty);
      p = known + (1 - known) / choices;
      ok_ = rand() < p;
      ms = ok_ ? (2500 + 900 * band) * (0.4 + rand()) : 9000;
      s = Maths.update(s, { correct: ok_, elapsedMs: ms, band: band, skill: 'x' });
      if (i > n / 2) { total++; sum += s.difficulty; if (ok_) { correct++; } }
      ok(s.difficulty >= 1 && s.difficulty <= 8, 'difficulty stays within [1,8]');
    }
    return { accuracy: correct / total, band: sum / total };
  }

  var abilities = [1.5, 3, 4.5, 6, 7.5], i, r;
  for (i = 0; i < abilities.length; i++) {
    r = simulate(abilities[i], 40000, 900 + i);
    ok(r.accuracy > 0.72 && r.accuracy < 0.88,
       'ability ' + abilities[i] + ' settles near 80% (got ' +
       (r.accuracy * 100).toFixed(1) + '% at band ' + r.band.toFixed(2) + ')');
  }

  // A strong learner climbs, a struggling one descends.
  ok(simulate(8, 4000, 77).band > 6, 'a strong learner climbs the scale');
  ok(simulate(1, 4000, 78).band < 2.5, 'a struggling learner descends the scale');
})();
```

- [ ] **Step 2: Run test to verify it behaves**

Run: `node test.js`
Expected: PASS. If the weakest learner falls below 72%, floor support (Task 3's `choiceCount`) is not being applied — check that `make` passes `difficulty`, not `band`, to `choiceCount`.

- [ ] **Step 3: Remove the superseded prototype**

The standalone simulation in the spec folder was written to validate the tuning before implementation. Now that the real engine is covered, keeping both means two sources of truth that can drift.

```bash
git rm docs/superpowers/specs/2026-08-01-adaptive-tuning-sim.js
```

- [ ] **Step 4: Update the spec reference**

In `docs/superpowers/specs/2026-08-01-maths-mode-design.md` §8.7, replace the final line:

```
The simulation is worth reproducing as part of `test.js`.
```

with:

```
This is reproduced against the real engine in `test.js`; the standalone
prototype it was first measured with has been removed to avoid two sources of
truth.
```

- [ ] **Step 5: Run the whole suite and commit**

Run: `node test.js`
Expected: PASS, 0 failures, exit code 0

```bash
git add test.js docs/superpowers/specs/2026-08-01-maths-mode-design.md
git commit -F - <<'EOF'
test: verify adaptive convergence against the real engine

Previously the tuning was validated only by a standalone prototype
written during design; this commit reproduces that result against the
real engine and removes the prototype.

Keeping both would mean two implementations of the same tuning that can
drift apart silently, with no signal about which one is authoritative.

- Simulate learners of fixed ability and assert each settles at 72-88%
  observed accuracy, matching the design's convergence table
- Assert difficulty never escapes [1, 8] during simulation
- Assert a strong learner climbs and a struggling one descends
- Delete the superseded prototype and update the spec to point at
  `test.js` as the single source of truth
EOF
```

---

## Self-Review

**Spec coverage.** §7.1 bands 1–8 → Tasks 4–7. §7.2 question forms (evaluation, missing operand, sequence, comparison, visual fraction) → `genBond10`/`genEqn`, `genSeq`, `genFracCmp`, `genHalf`/`genFracOf`. §7.3 distractors → Task 3. §8.1 continuous scale and band mixing → Task 8 `pickBand`. §8.2 signals and step sizes → Task 9. §8.4 weak-spot weighting → Task 8 `pickGenerator`. §8.6 floor support → Task 3 `choiceCount`, exercised in Task 11. §8.7 validation → Task 11. §10.2 generator contract → Task 8. §11 float safety, negatives, exact division → Tasks 6, 7, 10. §12 generator invariants → Task 10.

**Deliberately out of scope** (each has its own plan): §6 wordless UI, §9 rewards and unlocks, §13 the cup, §14 slots and storage. `Maths` deliberately knows nothing about them.

**Known gap carried forward.** The `bar` token type is declared in the spec's vocabulary and validated by the sweep, but no band 6 generator emits one yet — `genFracCmp` uses `frac` instead. The visual fraction bar is a rendering enrichment for `quiz.js`, so it belongs in the Phase 2 plan rather than here; the token stays in `TOKEN_TYPES` so adding it later needs no test change.

**Type consistency.** `gen(rand) → {render, answer, skill, near}` is used identically in Tasks 4–7 and consumed in Task 8. `buildChoices(answer, count, near, rand, min)` is defined in Task 3 and called with exactly that arity in Task 8. `update(state, {correct, elapsedMs, band, skill})` is defined in Task 9 and called with those fields in Task 11. `OP` is defined in Task 4 and reused in 5–7. Operator comparisons in Task 10 use the same Unicode escapes (`−`, `×`, `÷`) as `OP`.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-01-maths-core.md`.
