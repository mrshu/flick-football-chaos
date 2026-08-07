# Over-12 Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the maths ladder with bands 9–11 (algebra, drawn geometry, sequences) for 16+ players, plus a harder answer format, a pro skin, and a form rating with personal bests.

**Architecture:** Bands 9–11 are added to `Maths._BANDS` as pure generators exactly like bands 1–8, then the engine ceiling (`MAX_BAND`) rises from 8 to 11 in one task. Two new render tokens (`var` text, `diag` inline canvas) carry algebra and geometry through the existing quiz panel. Everything else — age row, store clamps, stats card, `body.pro` skin — is a thin edit to existing files.

**Tech Stack:** Plain ES5 JavaScript (no build, no dependencies), Node's bare `node test.js` for tests, canvas 2D for diagrams.

**Spec:** `docs/superpowers/specs/2026-08-07-over-12-design.md` — read it before starting.

## Global Constraints

- **ES5 only**: `var`, `function`, string concatenation. No arrow functions, `let`/`const`, template literals, or classes — match the surrounding code exactly.
- **No ES modules**: files are plain scripts attaching one global each; must work over `file://`.
- **No frameworks, assets, or build step.** Diagrams are drawn procedurally on canvas.
- **Wordless UI**: new question content uses only numerals, operator glyphs, `x`/`y`, `°`, and drawings. No words in questions or diagrams.
- **Pure maths.js**: no DOM, no game state, no `Math.random` — callers pass `rand` in. Only `quiz.js` touches the DOM.
- **Every answer is a single whole number** (or one of `< > =` for existing comparison questions).
- **Tests**: run with `node test.js`; it prints a count and `ALL PASS` or exits non-zero. New generator tests recompute answers from the *rendered* tokens, not by repeating the generator's own formula.
- **Commits**: Conventional Commits with a prose body (why + what), wrapped at 72 columns, committed via `git commit -F - <<'EOF' ... EOF`. Never `-m` with backticks.
- **No AI attribution anywhere.**
- **Nothing blocks.** Every command gets an explicit timeout (≤120s). The game runs from `file://` by design — open the file directly rather than starting a server. If a server is genuinely needed, start it in the background and kill it before finishing; never run one in the foreground.
- **Bounded visual iteration.** Browser verification steps cap out: if a browser tool fails three times, stop and report rather than retrying; if a drawing has not converged after roughly six look-adjust cycles, settle on the best version, and report what is still imperfect. A task that reports an honest partial result beats one that grinds.

---

### Task 1: Band 9 generators (`eqn2`, `expand`, `angleLine`, `seqRule`)

**Files:**
- Modify: `maths.js` (add generators after `genEqn`, register `_BANDS[9]` next to the `_BANDS[8]` assignment at line ~374)
- Test: `test.js` (extend `TOKEN_TYPES` at line ~116; add checks after the band-8 checks)

**Interfaces:**
- Consumes: `_randInt(rand, lo, hi)`, `_pick(rand, arr)`, `OP` from `maths.js`.
- Produces: `Maths._BANDS[9]` = `[genEqn2, genExpand, genAngleLine, genSeqRule]`, skills `'eqn2' | 'expand' | 'angleLine' | 'seqRule'`. New token shapes later tasks rely on: `{ t: 'var', v: <string> }` and `{ t: 'diag', kind: 'angleLine', known: <int> }`.
- Note: band 9 stays *unreachable in play* until Task 4 raises the ceiling — tests reach it directly via `Maths._BANDS[9]`, so nothing is broken in between.

- [ ] **Step 1: Write the failing tests**

In `test.js`, extend the token whitelist (line ~116):

```js
var TOKEN_TYPES = ['num', 'balls', 'op', 'eq', 'box', 'frac', 'bar', 'sep', 'pct', 'pow', 'var', 'diag'];
```

After the band-8 test block (find `checkGenerators(8, true)` or the last band-8 `(function () {...})()`), add:

```js
// ---- Over-12: band 9 ----
checkGenerators(9, false);

(function () {
  var rand = makeRng(91), i, q, m;

  // eqn2 renders [var 'ax', +, b, =, c, sep, var 'x', =, box]; recompute
  // a·answer + b === c from the rendered parts.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[9][0](rand);
    eq(q.skill, 'eqn2', 'band 9 gen 0 is eqn2');
    m = /^(\d+)x$/.exec(q.render[0].v);
    ok(!!m, 'eqn2 leads with a coefficient-x token');
    eq(Number(m[1]) * q.answer + q.render[2].v, q.render[4].v,
       'eqn2 recomputes from the rendered parts');
    ok(q.answer >= 2 && q.answer <= 12, 'eqn2 solutions stay small and whole');
  }

  // expand renders [var 'a(x+b)', =, var 'ax', +, box]; answer === a·b.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[9][1](rand);
    eq(q.skill, 'expand', 'band 9 gen 1 is expand');
    m = /^(\d+)\(x\+(\d+)\)$/.exec(q.render[0].v);
    ok(!!m, 'expand leads with a bracket token');
    eq(q.answer, Number(m[1]) * Number(m[2]),
       'expand recomputes a·b from the bracket');
    eq(q.render[2].v, m[1] + 'x', 'expanded x-term matches the coefficient');
  }

  // angleLine: two angles on a straight line sum to 180.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[9][2](rand);
    eq(q.skill, 'angleLine', 'band 9 gen 2 is angleLine');
    eq(q.render[0].t, 'diag', 'angleLine renders a diagram');
    eq(q.render[0].kind, 'angleLine', 'angleLine diagram kind');
    eq(q.answer + q.render[0].known, 180, 'angles on a line sum to 180');
    ok(q.render[0].known >= 25 && q.render[0].known <= 155,
       'angleLine known angle is drawable');
  }

  // seqRule: linear sequence, gap mid-sequence; recompute step from two
  // adjacent visible terms and the answer from a visible reference.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[9][3](rand);
    eq(q.skill, 'seqRule', 'band 9 gen 3 is seqRule');
    var nums = [], k, idx = 0, gap = -1;
    for (k = 0; k < q.render.length; k++) {
      if (q.render[k].t === 'num') { nums.push({ i: idx, v: q.render[k].v }); idx++; }
      else if (q.render[k].t === 'box') { gap = idx; idx++; }
    }
    ok(gap >= 1 && gap <= 3, 'seqRule gap is mid-sequence');
    eq(nums.length, 4, 'seqRule shows four known terms');
    var a = null, b = null;
    for (k = 0; k + 1 < nums.length; k++) {
      if (nums[k + 1].i === nums[k].i + 1) { a = nums[k]; b = nums[k + 1]; break; }
    }
    ok(!!a, 'seqRule has two adjacent visible terms');
    var step = b.v - a.v;
    ok(step >= 3 && step <= 9, 'seqRule step is 3-9');
    eq(q.answer, a.v + (gap - a.i) * step,
       'seqRule recomputes the hidden term from a visible one');
  }
})();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test.js`
Expected: FAIL — `band 9 has generators` (Maths._BANDS[9] is undefined; the harness may throw there, which is the same signal).

- [ ] **Step 3: Implement the four generators**

In `maths.js`, after `genEqn` (line ~371) add:

```js
  // --- band 9: two-step equations, expanding, angles on a line, sequences ---
  // The unknown is written `x`, so the question row reads "3x + 4 = 19 , x = □".
  function genEqn2(rand) {
    var a = _randInt(rand, 2, 6), x = _randInt(rand, 2, 12), b = _randInt(rand, 1, 12);
    var c = a * x + b;
    return {
      render: [{ t: 'var', v: a + 'x' }, { t: 'op', v: OP.add }, { t: 'num', v: b },
               { t: 'eq' }, { t: 'num', v: c }, { t: 'sep' },
               { t: 'var', v: 'x' }, { t: 'eq' }, { t: 'box' }],
      answer: x, skill: 'eqn2',
      // Forgot to divide (ax), forgot to subtract (c/a, rounded), off by one.
      near: [a * x, Math.round(c / a), x + 1, x - 1]
    };
  }

  function genExpand(rand) {
    var a = _randInt(rand, 2, 9), b = _randInt(rand, 2, 9);
    return {
      render: [{ t: 'var', v: a + '(x+' + b + ')' }, { t: 'eq' },
               { t: 'var', v: a + 'x' }, { t: 'op', v: OP.add }, { t: 'box' }],
      answer: a * b, skill: 'expand',
      // Forgot to multiply (b), added instead (a+b), slipped a row on tables.
      near: [b, a + b, a * b + a, a * b - a]
    };
  }

  function genAngleLine(rand) {
    var known = _randInt(rand, 25, 155);
    return {
      render: [{ t: 'diag', kind: 'angleLine', known: known }, { t: 'box' }],
      answer: 180 - known, skill: 'angleLine',
      // Read the wrong angle (known), guessed a right angle's complement.
      near: [known, 180 - known + 10, 180 - known - 10, 90 - (known % 90)]
    };
  }

  function genSeqRule(rand) {
    var step = _randInt(rand, 3, 9);
    var start = _randInt(rand, 2, 20);
    var gap = _randInt(rand, 1, 3);
    var render = [], i;
    for (i = 0; i < 5; i++) {
      if (i > 0) { render.push({ t: 'sep' }); }
      render.push(i === gap ? { t: 'box' } : { t: 'num', v: start + i * step });
    }
    var answer = start + gap * step;
    return {
      render: render, answer: answer, skill: 'seqRule',
      near: [answer + step, answer - step, answer + 1, answer - 1]
    };
  }
```

And next to `_BANDS[8] = [...]` (line ~374):

```js
  _BANDS[9] = [genEqn2, genExpand, genAngleLine, genSeqRule];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test.js`
Expected: ALL PASS (the `_skillIndex` IIFE loops `b <= 8`, so it ignores band 9 for now — that changes in Task 4).

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
feat: add band 9 generators for early-teen maths

Previously the ladder topped out at band 8; this adds the first of
three bands above it, per the over-12 spec. The band is registered
but unreachable until the engine ceiling rises in a later commit.

- Two-step equations, bracket expansion, angles on a line, sequences
- New render token shapes: var text and an angleLine diagram
- Tests recompute every answer from the rendered tokens
EOF
```

---

### Task 2: Band 10 generators (`simul`, `angleTri`, `pythag`, `seqQuad`)

**Files:**
- Modify: `maths.js` (after the band-9 generators)
- Test: `test.js` (after the band-9 tests)

**Interfaces:**
- Consumes: `_randInt`, `_pick`, `OP`, `{t:'var'}`/`{t:'diag'}` shapes from Task 1.
- Produces: `Maths._BANDS[10]` = `[genSimul, genAngleTri, genPythag, genSeqQuad]`; diagram kinds `'angleTri'` (`{ kind, a, b }`, both known angles) and `'pythag'` (`{ kind, legA, legB }`).

- [ ] **Step 1: Write the failing tests**

```js
// ---- Over-12: band 10 ----
checkGenerators(10, false);

(function () {
  var rand = makeRng(101), i, q;

  // simul renders "x+y=s , x−y=d , x=□"; x=(s+d)/2 must be whole and > y ≥ 1.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[10][0](rand);
    eq(q.skill, 'simul', 'band 10 gen 0 is simul');
    var s = q.render[4].v, d = q.render[10].v;
    eq(q.answer, (s + d) / 2, 'simul recomputes x from sum and difference');
    ok(q.answer === Math.floor(q.answer), 'simul x is whole');
    var y = s - q.answer;
    ok(y >= 1 && q.answer > y, 'simul keeps x > y >= 1');
  }

  // angleTri: three angles of a triangle sum to 180, all drawable.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[10][1](rand);
    eq(q.skill, 'angleTri', 'band 10 gen 1 is angleTri');
    eq(q.render[0].kind, 'angleTri', 'angleTri diagram kind');
    eq(q.render[0].a + q.render[0].b + q.answer, 180,
       'triangle angles sum to 180');
    ok(q.answer >= 20, 'angleTri unknown stays drawable');
    ok(q.render[0].a >= 30 && q.render[0].b >= 30, 'angleTri knowns stay drawable');
  }

  // pythag: legs and answer form a Pythagorean triple.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[10][2](rand);
    eq(q.skill, 'pythag', 'band 10 gen 2 is pythag');
    eq(q.render[0].kind, 'pythag', 'pythag diagram kind');
    var la = q.render[0].legA, lb = q.render[0].legB;
    eq(la * la + lb * lb, q.answer * q.answer, 'pythag is a true triple');
  }

  // seqQuad: differences grow by 2; recompute term 5 from terms 3 and 4.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[10][3](rand);
    eq(q.skill, 'seqQuad', 'band 10 gen 3 is seqQuad');
    var t = [q.render[0].v, q.render[2].v, q.render[4].v, q.render[6].v];
    eq(t[1] - t[0] + 2, t[2] - t[1], 'seqQuad differences grow by 2');
    eq(q.answer, t[3] + (t[3] - t[2]) + 2,
       'seqQuad recomputes the next term from the last difference');
  }
})();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test.js`
Expected: FAIL at `band 10 has generators`.

- [ ] **Step 3: Implement the four generators**

```js
  // --- band 10: simultaneous equations, triangle angles, Pythagoras ---
  function genSimul(rand) {
    var y = _randInt(rand, 1, 9), x = y + _randInt(rand, 1, 9);
    return {
      render: [{ t: 'var', v: 'x' }, { t: 'op', v: OP.add }, { t: 'var', v: 'y' },
               { t: 'eq' }, { t: 'num', v: x + y }, { t: 'sep' },
               { t: 'var', v: 'x' }, { t: 'op', v: OP.sub }, { t: 'var', v: 'y' },
               { t: 'eq' }, { t: 'num', v: x - y }, { t: 'sep' },
               { t: 'var', v: 'x' }, { t: 'eq' }, { t: 'box' }],
      answer: x, skill: 'simul',
      // Solved for the wrong letter (y), added the equations' right sides.
      near: [y, x + y, x + 1, x - 1]
    };
  }

  function genAngleTri(rand) {
    var a = _randInt(rand, 30, 100), b = _randInt(rand, 30, Math.min(100, 160 - a));
    var c = 180 - a - b;
    return {
      render: [{ t: 'diag', kind: 'angleTri', a: a, b: b }, { t: 'box' }],
      answer: c, skill: 'angleTri',
      // Subtracted from 90 or 360, read a labelled angle, off by ten.
      near: [c + 10, c - 10, a + b, 180 - c]
    };
  }

  // Whole-number hypotenuses only, so the answer needs no root extraction.
  var TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15],
                 [8, 15, 17], [7, 24, 25], [12, 16, 20], [20, 21, 29]];

  function genPythag(rand) {
    var t = _pick(rand, TRIPLES);
    var flip = rand() < 0.5;
    var la = flip ? t[1] : t[0], lb = flip ? t[0] : t[1];
    return {
      render: [{ t: 'diag', kind: 'pythag', legA: la, legB: lb }, { t: 'box' }],
      answer: t[2], skill: 'pythag',
      // Added the legs, took the longer leg, off by one.
      near: [la + lb, Math.max(la, lb), t[2] + 1, t[2] - 1]
    };
  }

  function genSeqQuad(rand) {
    var c = _randInt(rand, 0, 10), render = [], i, v;
    for (i = 1; i <= 5; i++) {
      v = i * i + c;
      if (i > 1) { render.push({ t: 'sep' }); }
      render.push(i === 5 ? { t: 'box' } : { t: 'num', v: v });
    }
    var answer = 25 + c;
    return {
      render: render, answer: answer, skill: 'seqQuad',
      // Continued linearly (repeating the last difference), off by two.
      near: [16 + c + (16 + c - (9 + c)), answer + 2, answer - 2, answer + 1]
    };
  }

  _BANDS[10] = [genSimul, genAngleTri, genPythag, genSeqQuad];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test.js` — expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
feat: add band 10 generators for GCSE-level maths

Second of the three over-12 bands: simultaneous equations in
sum/difference form, triangle angle sums, Pythagorean triples and
quadratic sequences. Still unreachable until the ceiling rises.

- Triples list keeps every hypotenuse whole
- Triangle angle bounds keep every diagram drawable
- Tests recompute answers from rendered tokens and diagram params
EOF
```

---

### Task 3: Band 11 generators (`indices`, `ineq`, `seqGeo`, `areaComp`)

**Files:**
- Modify: `maths.js` (after the band-10 generators)
- Test: `test.js` (after the band-10 tests)

**Interfaces:**
- Consumes: `_randInt`, `_pick`, `OP`, token shapes from Tasks 1–2. `pow` tokens may carry the string `'□'` as their exponent — the renderer already prints `t.e` verbatim.
- Produces: `Maths._BANDS[11]` = `[genIndices, genIneq, genSeqGeo, genAreaComp]`; diagram kind `'areaComp'` (`{ kind, W, H, w, h }` — outer rectangle W×H minus a w×h corner notch).

- [ ] **Step 1: Write the failing tests**

```js
// ---- Over-12: band 11 ----
checkGenerators(11, false);

(function () {
  var rand = makeRng(111), i, q;

  // indices: b^p × b^q = b^□ (answer p+q) or b^p ÷ b^q = b^□ (answer p−q).
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[11][0](rand);
    eq(q.skill, 'indices', 'band 11 gen 0 is indices');
    eq(q.render[0].v, q.render[2].v, 'indices keeps one base throughout');
    eq(q.render[4].e, '□', 'indices asks for the exponent');
    if (q.render[1].v === '×') {
      eq(q.answer, q.render[0].e + q.render[2].e, 'multiplied powers add exponents');
    } else {
      eq(q.answer, q.render[0].e - q.render[2].e, 'divided powers subtract exponents');
      ok(q.answer >= 1, 'divided powers keep a positive exponent');
    }
  }

  // ineq: answer is the largest whole x with a·x < c.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[11][1](rand);
    eq(q.skill, 'ineq', 'band 11 gen 1 is ineq');
    var m = /^(\d+)x$/.exec(q.render[0].v), a = Number(m[1]), c = q.render[2].v;
    ok(a * q.answer < c, 'ineq answer satisfies the inequality');
    ok(a * (q.answer + 1) >= c, 'ineq answer is the largest such x');
  }

  // seqGeo: constant ratio, gap in the late half; recompute from neighbours.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[11][2](rand);
    eq(q.skill, 'seqGeo', 'band 11 gen 2 is seqGeo');
    var nums = [], k, idx = 0, gap = -1;
    for (k = 0; k < q.render.length; k++) {
      if (q.render[k].t === 'num') { nums.push({ i: idx, v: q.render[k].v }); idx++; }
      else if (q.render[k].t === 'box') { gap = idx; idx++; }
    }
    ok(gap >= 2 && gap <= 4, 'seqGeo gap sits in the late half');
    var r0 = null;
    for (k = 0; k + 1 < nums.length; k++) {
      if (nums[k + 1].i === nums[k].i + 1) { r0 = nums[k + 1].v / nums[k].v; break; }
    }
    ok(r0 === 2 || r0 === 3, 'seqGeo ratio is 2 or 3');
    var ref = nums[0];
    eq(q.answer, ref.v * Math.pow(r0, gap - ref.i),
       'seqGeo recomputes the hidden term from a visible one');
  }

  // areaComp: L-shape area is the outer rectangle minus the notch.
  for (i = 0; i < 80; i++) {
    q = Maths._BANDS[11][3](rand);
    eq(q.skill, 'areaComp', 'band 11 gen 3 is areaComp');
    var g = q.render[0];
    eq(g.kind, 'areaComp', 'areaComp diagram kind');
    eq(q.answer, g.W * g.H - g.w * g.h, 'areaComp area recomputes');
    ok(g.w < g.W && g.h < g.H, 'areaComp notch fits inside the rectangle');
  }
})();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test.js` — expected: FAIL at `band 11 has generators`.

- [ ] **Step 3: Implement the four generators**

```js
  // --- band 11: index laws, inequalities, geometric sequences, areas ---
  function genIndices(rand) {
    var base = _randInt(rand, 2, 5);
    var div = rand() < 0.4;
    var p = _randInt(rand, 2, 5), q = _randInt(rand, 2, 5);
    if (div && p <= q) { p = q + _randInt(rand, 1, 3); } // keep p−q ≥ 1
    return {
      render: [{ t: 'pow', v: base, e: p }, { t: 'op', v: div ? OP.div : OP.mul },
               { t: 'pow', v: base, e: q }, { t: 'eq' },
               { t: 'pow', v: base, e: '□' }],
      answer: div ? p - q : p + q, skill: 'indices',
      // Multiplied the exponents, kept one of them, off by one.
      near: [p * q, p, q, (div ? p - q : p + q) + 1]
    };
  }

  function genIneq(rand) {
    var a = _randInt(rand, 2, 9), x = _randInt(rand, 2, 12);
    var c = a * x + _randInt(rand, 1, a); // a·x < c ≤ a·(x+1)
    return {
      render: [{ t: 'var', v: a + 'x' }, { t: 'op', v: '<' }, { t: 'num', v: c },
               { t: 'sep' }, { t: 'var', v: 'x' }, { t: 'eq' }, { t: 'box' }],
      answer: x, skill: 'ineq',
      // Rounded up instead, divided and truncated wrongly, off by two.
      near: [x + 1, x - 1, Math.round(c / a), x + 2]
    };
  }

  function genSeqGeo(rand) {
    var r = _pick(rand, [2, 3]);
    var start = _randInt(rand, 2, 6);
    var gap = _randInt(rand, 2, 4);
    var render = [], i, v;
    for (i = 0; i < 5; i++) {
      v = start * Math.pow(r, i);
      if (i > 0) { render.push({ t: 'sep' }); }
      render.push(i === gap ? { t: 'box' } : { t: 'num', v: v });
    }
    var answer = start * Math.pow(r, gap);
    var prev = start * Math.pow(r, gap - 1);
    var prevprev = start * Math.pow(r, gap - 2);
    return {
      render: render, answer: answer, skill: 'seqGeo',
      // Continued linearly from the two terms before the gap.
      near: [prev + (prev - prevprev), answer + r, answer - r, prev]
    };
  }

  function genAreaComp(rand) {
    var W = _randInt(rand, 6, 12), H = _randInt(rand, 5, 10);
    var w = _randInt(rand, 2, W - 3), h = _randInt(rand, 2, H - 2);
    return {
      render: [{ t: 'diag', kind: 'areaComp', W: W, H: H, w: w, h: h }, { t: 'box' }],
      answer: W * H - w * h, skill: 'areaComp',
      // Ignored the notch, subtracted lengths instead of area.
      near: [W * H, W * H - w - h, W * H - w * h + h, W * H - w * h - w]
    };
  }

  _BANDS[11] = [genIndices, genIneq, genSeqGeo, genAreaComp];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test.js` — expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
feat: add band 11 generators, the 16+ ceiling

Last of the three over-12 bands: index laws, integer inequalities,
geometric sequences and compound areas. With this the content for
the extended ladder is complete; the ceiling itself still sits at 8.

- Index questions ask for the exponent, keeping answers small
- Inequality answers are provably the largest satisfying integer
- L-shape areas recompute as outer rectangle minus corner notch
EOF
```

---

### Task 4: Raise the engine ceiling to `MAX_BAND = 11`

**Files:**
- Modify: `maths.js` — `newState` (line ~376), `pickBand` (~386), `_skillIndex` loop (~395), `make` min floor (~430), `update` clamp (~552), exports (~568)
- Test: `test.js` — convergence test (~703), plus any assertion hard-coding the old ceiling

**Interfaces:**
- Consumes: `_BANDS[9..11]` from Tasks 1–3.
- Produces: `Maths.MAX_BAND === 11`, exported. `newState`/`update` clamp difficulty to `[1, 11]`; `pickBand` reaches band 11; `make` uses a `-30` choice floor for every band ≥ 8.

- [ ] **Step 1: Write the failing tests**

Extend the convergence test (line ~703): change the in-run bound and add high abilities.

```js
    // was: ok(minD >= 1 && maxD <= 8, ...)
    ok(minD >= 1 && maxD <= 11,
       'difficulty stays within [1,11] across the run (min ' + minD.toFixed(3) +
       ', max ' + maxD.toFixed(3) + ')');
```

```js
  // was: var abilities = [1.5, 3, 4.5, 6, 7.5], ...
  var abilities = [1.5, 3, 4.5, 6, 7.5, 9, 10.5], i, r;
```

After the strong/struggling learner lines (~743), add:

```js
  // The extended ceiling is reachable: a very strong learner placed at the
  // old default still climbs into the over-12 bands.
  ok(simulate(11, 40000, 79).band > 8, 'a 16+ learner climbs past the old ceiling');
```

And a direct ceiling check near the other engine tests:

```js
(function () {
  eq(Maths.MAX_BAND, 11, 'the ladder tops out at band 11');
  var s = Maths.newState(11);
  eq(s.difficulty, 11, 'newState accepts a band-11 start');
  eq(Maths.newState(99).difficulty, 11, 'newState clamps above the ceiling');
  var top = { difficulty: 11, home: 11, mastery: {}, fastStreak: 0, wrongStreak: 0 };
  var up = Maths.update(top, { correct: true, elapsedMs: 1000, band: 11, skill: 'x' });
  eq(up.difficulty, 11, 'update clamps at the new ceiling');
})();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test.js`
Expected: FAIL — `Maths.MAX_BAND` is undefined; `newState(11)` currently clamps to 8. Note every failure name: if any *other* existing assertion fails because it hard-coded 8 (search `grep -n '8,' test.js` around `newState`/`update` tests, lines ~394–590), update it to 11 as part of Step 3 — the ceiling is exactly the kind of constant the suite was built to pin.

- [ ] **Step 3: Implement the ceiling raise**

In `maths.js`:

```js
  // Bands 1-8 cover ages 5-12; 9-11 carry the ladder to 16+ (see the over-12
  // spec). One constant, so the ceiling cannot disagree with itself.
  var MAX_BAND = 11;
```

Place it above `newState`, then replace every hard-coded 8:

- `newState`: `if (d > MAX_BAND) { d = MAX_BAND; }`
- `pickBand`: `if (b >= MAX_BAND) { return MAX_BAND; }`
- `_skillIndex` loop: `for (b = 1; b <= MAX_BAND; b++) {`
- `make`: `var min = band >= 8 ? -30 : 0;` (negatives stay legitimate distractors from band 8 up)
- `update`: `if (d > MAX_BAND) { d = MAX_BAND; }`
- exports: add `MAX_BAND: MAX_BAND,`

Leave `ACCEL_UP_YOUNG`/`d <= 4` damping untouched — bands 9–11 inherit the damped "old band" climb, as the spec requires.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test.js` — expected: ALL PASS. The convergence run is the slow part; the suite should still finish in well under a second.

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
feat: raise the difficulty ceiling from band 8 to band 11

Previously the walk clamped at 8 in four separate places; this
replaces every hard-coded ceiling with one MAX_BAND constant and
sets it to 11, making the over-12 bands reachable in play.

- newState, pickBand, update and the skill index share MAX_BAND
- Choice floor of -30 now applies to every band from 8 up
- Convergence suite extended with 9 and 10.5-ability learners
EOF
```

---

### Task 5: Harder answer format — 5 and 6 choices at the top

**Files:**
- Modify: `maths.js` — `choiceCount` (line ~31), the stale "Maximum count is 4" comment in `buildChoices` (~58)
- Test: `test.js` — after the existing `buildChoices` tests (~100)

**Interfaces:**
- Consumes: `MAX_BAND` from Task 4.
- Produces: `choiceCount(d)` returns 2/3/4 as today, 5 for `9 ≤ d < 11`, 6 for `d ≥ 11`. `buildChoices` yields `count` distinct choices for count up to 6. `evidence()` and the convergence maths pick this up automatically.

- [ ] **Step 1: Write the failing tests**

```js
// ---- Over-12: the choice row hardens at the top of the ladder ----
(function () {
  eq(Maths.choiceCount(8.99), 4, 'four choices just below band 9');
  eq(Maths.choiceCount(9), 5, 'five choices from difficulty 9');
  eq(Maths.choiceCount(10.99), 5, 'five choices just below band 11');
  eq(Maths.choiceCount(11), 6, 'six choices at the ceiling');

  var rand = makeRng(55), i, j, c;
  for (i = 0; i < 40; i++) {
    c = Maths.buildChoices(24, 6, [23, 25, 26, 22], rand, 0);
    eq(c.length, 6, 'buildChoices fills six slots');
    ok(c.indexOf(24) !== -1, 'six-choice set contains the answer');
    for (j = 0; j < c.length; j++) {
      eq(c.indexOf(c[j]), j, 'six choices are distinct');
    }
  }
})();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test.js` — expected: FAIL at `five choices from difficulty 9`. As in Task 4: if any *existing* assertion pinned "4 choices" at high difficulty, update it — the suite pinning constants is by design.

- [ ] **Step 3: Implement**

```js
  function choiceCount(difficulty) {
    if (difficulty <= 1.25) { return 2; }
    if (difficulty <= 1.75) { return 3; }
    // The top of the ladder hardens the format instead of the numbers: more
    // choices means less to gain from a guess (evidence() also weighs this).
    if (difficulty >= 11) { return 6; }
    if (difficulty >= 9) { return 5; }
    return 4;
  }
```

Update the padding comment in `buildChoices` (the loop already offers up to 24 candidates, plenty for 5 extras):

```js
    // Pad outward from the answer until we have enough distinct options.
    // Maximum count is 6, so at most 5 extra values needed; each iteration offers 2 candidates.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test.js` — expected: ALL PASS, including the distractor plausibility sweep, which iterates every band and now covers the 5- and 6-choice tiers.

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
feat: five choices from band 9 and six at the ceiling

The choice count already fell to 3 and 2 at the bottom of the
ladder as floor support; this mirrors it at the top, where the
format itself is the difficulty lever the spec asks for.

- choiceCount returns 5 at difficulty >= 9 and 6 at >= 11
- buildChoices comment updated for the six-choice maximum
- evidence() weighting picks the new counts up unchanged
EOF
```

---

### Task 6: Form rating in `maths.js`

**Files:**
- Modify: `maths.js` — new `rating` function near `expectedMs`, exported
- Test: `test.js`

**Interfaces:**
- Consumes: `MAX_BAND`.
- Produces: `Maths.rating(difficulty)` → integer 47–99. Task 9 displays it; it never feeds back into the engine.

- [ ] **Step 1: Write the failing tests**

```js
// ---- Over-12: the form rating is a display of difficulty, nothing more ----
(function () {
  eq(Maths.rating(1), 47, 'rating floor is 47');
  eq(Maths.rating(11), 99, 'rating ceiling is 99');
  eq(Maths.rating(6), 73, 'rating midpoint lands at 73');
  eq(Maths.rating(0.2), 47, 'rating clamps below the floor');
  eq(Maths.rating(20), 99, 'rating clamps above the ceiling');
  eq(Maths.rating(undefined), 47, 'rating tolerates a missing difficulty');
})();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test.js` — expected: FAIL, `Maths.rating is not a function`.

- [ ] **Step 3: Implement**

```js
  // A FIFA-style number for the stats card: difficulty 1 reads 47, the
  // ceiling reads 99. Display only - nothing in the engine reads it back.
  function rating(difficulty) {
    var d = (typeof difficulty === 'number' && isFinite(difficulty)) ? difficulty : 1;
    if (d < 1) { d = 1; }
    if (d > MAX_BAND) { d = MAX_BAND; }
    return Math.round(47 + (d - 1) * 52 / (MAX_BAND - 1));
  }
```

Add `rating: rating,` to the exports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test.js` — expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add maths.js test.js
git commit -F - <<'EOF'
feat: derive a 47-99 form rating from the difficulty

A number an older player can watch rise. It is a pure rescaling of
the engine's difficulty onto a familiar football-rating range and
is display-only: nothing in the adaptive walk reads it back.

- Maths.rating maps [1, MAX_BAND] onto [47, 99], clamped
- Tolerates a slot that has never answered a question
EOF
```

---

### Task 7: Render `var` and `diag` tokens, and let the lab reach band 11

**Files:**
- Modify: `quiz.js` — `renderToken` (line ~73)
- Modify: `style.css` — `.qVar` and `.qDiag` next to `.qFrac` (~374); confirm `#quizQ` wraps (line ~316: add `flex-wrap: wrap` if it is a flex row, or leave if it already wraps as inline content)
- Modify: `maths-lab.html` — band button loop at line ~136 (`b <= 8` → `b <= Maths.MAX_BAND`)

**Interfaces:**
- Consumes: token shapes from Tasks 1–3 (`var` strings; `diag` kinds `angleLine {known}`, `angleTri {a, b}`, `pythag {legA, legB}`, `areaComp {W, H, w, h}`), `Maths.MAX_BAND`.
- Produces: `renderToken` handles every token the generators emit. This is browser-only code — `test.js` has no DOM — so its gate is visual, in the maths lab.

- [ ] **Step 1: Add the `var` branch and CSS**

In `renderToken`, after the `pct` branch:

```js
    else if (t.t === 'var') { e.className = 'qVar'; e.textContent = t.v; }
    else if (t.t === 'diag') { e.className = 'qDiag'; e.appendChild(drawDiag(t)); }
```

In `style.css`, next to `.qFrac`:

```css
.qVar { font-style: italic; letter-spacing: .5px; }
.qDiag canvas { display: block; width: 180px; height: 110px; }
```

Check `#quizQ` (style.css ~316): if it is `display: flex` without wrapping, add `flex-wrap: wrap; row-gap: 6px;` so the three-part simultaneous-equation row and diagram-plus-box rows break cleanly on a phone.

- [ ] **Step 2: Implement `drawDiag`**

Above `renderToken` in `quiz.js`:

```js
  // One diagram per geometry skill, drawn fresh each time. Labels are
  // numerals and the degree sign only; the unknown is always '?'. Sized in
  // CSS pixels and scaled by devicePixelRatio so lines stay crisp.
  function drawDiag(t) {
    var W = 180, H = 110, dpr = window.devicePixelRatio || 1;
    var cv = document.createElement('canvas');
    cv.width = W * dpr; cv.height = H * dpr;
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.font = '700 14px "Trebuchet MS", Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    function line(x1, y1, x2, y2) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    if (t.kind === 'angleLine') {
      var rad = (180 - t.known) * Math.PI / 180; // ray angle from the +x axis
      var cx = 90, cy = 88, rx = cx + 80 * Math.cos(rad), ry = cy - 80 * Math.sin(rad);
      line(10, cy, 170, cy);
      line(cx, cy, rx, ry);
      ctx.beginPath(); ctx.arc(cx, cy, 24, -rad, 0, false); ctx.stroke();       // known, right side
      ctx.beginPath(); ctx.arc(cx, cy, 16, Math.PI, -rad, false); ctx.stroke(); // unknown, left side
      var mid = rad / 2;
      ctx.fillText(t.known + '°', cx + 40 * Math.cos(mid), cy - 40 * Math.sin(mid) - 4);
      var mid2 = (Math.PI + rad) / 2;
      ctx.fillText('?', cx + 30 * Math.cos(mid2), cy - 30 * Math.sin(mid2) - 2);
    } else if (t.kind === 'angleTri') {
      // Base corners carry the known angles; the apex is their intersection.
      var ax = 20, bx = 160, by = 96;
      var ta = Math.tan(t.a * Math.PI / 180), tb = Math.tan(t.b * Math.PI / 180);
      var px = ax + (bx - ax) * tb / (ta + tb);
      var py = by - (px - ax) * ta;
      if (py < 14) { py = 14; } // very tall triangles stay inside the canvas
      line(ax, by, bx, by); line(ax, by, px, py); line(bx, by, px, py);
      ctx.fillText(t.a + '°', ax + 26, by - 10);
      ctx.fillText(t.b + '°', bx - 26, by - 10);
      ctx.fillText('?', px, Math.max(py + 16, 24));
    } else if (t.kind === 'pythag') {
      var x0 = 30, y0 = 96, x1 = 150, y1 = 22;
      line(x0, y0, x1, y0); line(x1, y0, x1, y1); line(x0, y0, x1, y1);
      line(x1 - 10, y0, x1 - 10, y0 - 10); line(x1 - 10, y0 - 10, x1, y0 - 10);
      ctx.fillText(String(t.legA), (x0 + x1) / 2, y0 + 9);
      ctx.fillText(String(t.legB), x1 + (x1 > 160 ? -9 : 12), (y0 + y1) / 2);
      ctx.fillText('?', (x0 + x1) / 2 - 12, (y0 + y1) / 2 - 10);
    } else if (t.kind === 'areaComp') {
      // Outer W×H with the top-right w×h corner notched out, drawn to scale.
      var sc = Math.min(150 / t.W, 84 / t.H), ox = 14, oy = 12;
      var pw = t.W * sc, ph = t.H * sc, nw = t.w * sc, nh = t.h * sc;
      ctx.beginPath();
      ctx.moveTo(ox, oy + nh);
      ctx.lineTo(ox + pw - nw, oy + nh);
      ctx.lineTo(ox + pw - nw, oy);
      ctx.lineTo(ox + pw, oy);
      ctx.lineTo(ox + pw, oy + ph);
      ctx.lineTo(ox, oy + ph);
      ctx.closePath(); ctx.stroke();
      ctx.fillText(String(t.W), ox + pw / 2, oy + ph + 8);
      ctx.fillText(String(t.H), ox - 8, oy + nh + (ph - nh) / 2);
      ctx.fillText(String(t.w), ox + pw - nw / 2, oy - 2 + 8);
      ctx.fillText(String(t.h), ox + pw - nw - 8, oy + nh / 2);
      ctx.fillText('?', ox + (pw - nw) / 2, oy + nh + (ph - nh) / 2);
    }
    return cv;
  }
```

**Label placement rule (binding, overrides the offsets above).** Everything is drawn in white on a dark panel, so a number sitting on a line is unreadable. Therefore:

- **Every dimension and angle label sits *outside* the shape's outline** — below the base, left of a vertical side, beyond the vertex, clear of the arc. Never on a stroke, never inside the figure.
- **The only label allowed inside a figure is the `?` area marker** in `areaComp`, and it must be centred in open space with clear air around it.
- Angle labels in `angleTri` go outside the triangle past each labelled corner; `angleLine`'s known angle goes outside the arc, not between arc and ray.
- If a label cannot be placed clear at the current canvas size, grow the canvas or shrink the drawing — do not overlap.

The brief's pixel offsets are a starting point that does *not* yet satisfy this rule (e.g. `angleTri` currently places both known angles inside the triangle). Fixing them is part of the task, verified by eye in the lab at Step 4.

- [ ] **Step 3: Extend the maths lab's band row**

In `maths-lab.html` line ~136: change `for (b = 1; b <= 8; b++)` to `for (b = 1; b <= Maths.MAX_BAND; b++)`.

- [ ] **Step 4: Verify visually in the lab**

Run: `python3 -m http.server 8000` in the repo (or open the file directly) and open `maths-lab.html`. Click bands 9, 10, 11. Expected: every question renders — algebra with italic `x`, all four diagram kinds legible, labels not colliding, sequences wrapping cleanly. Fix drawing offsets until true. Also run `node test.js` — expected: ALL PASS (nothing Node-side changed).

- [ ] **Step 5: Commit**

```bash
git add quiz.js style.css maths-lab.html
git commit -F - <<'EOF'
feat: render algebra text and geometry diagrams in the quiz

The over-12 generators emit two token kinds the renderer did not
know: var (italic algebra text) and diag (a small canvas drawing).
Diagrams are numerals and a question mark only, so the wordless
constraint holds; maths.js stays DOM-free and only quiz.js draws.

- drawDiag covers angleLine, angleTri, pythag and areaComp
- Canvas scaled by devicePixelRatio; areaComp drawn to scale
- Maths lab band row now runs to Maths.MAX_BAND for eyeballing
EOF
```

---

### Task 8: Age row to 16+ and store clamps

**Files:**
- Modify: `index.html` — age buttons (lines 87–95, before the no-maths button)
- Modify: `store.js` — `repairSlot` band clamp (line ~71), maths difficulty/home clamps (~76–83), plus a `MAX_BAND` comment
- Test: `test.js` — alongside the store repair tests (~1009)

**Interfaces:**
- Consumes: nothing new — `paintAges` (game.js:1404) reads `data-band` generically and needs no change.
- Produces: teams can be created with home band 9/10/11; saves carrying them survive repair.

- [ ] **Step 1: Write the failing tests**

Near the existing store repair tests (~line 1009):

```js
// ---- Over-12: saves carry the extended bands ----
(function () {
  var r = Store.repairSlot({ band: 10, maths: { difficulty: 10.4, home: 10 } });
  eq(r.band, 10, 'an over-12 band survives repair');
  eq(r.maths.difficulty, 10.4, 'an over-12 difficulty survives repair');
  eq(r.maths.home, 10, 'an over-12 home survives repair');

  r = Store.repairSlot({ band: 99, maths: { difficulty: 14, home: 14 } });
  eq(r.band, 11, 'band clamps to the new ceiling');
  eq(r.maths.difficulty, 11, 'difficulty clamps to the new ceiling');
  eq(r.maths.home, 11, 'home clamps to the new ceiling');
})();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test.js` — expected: FAIL, `an over-12 band survives repair` (repairSlot clamps 10 → 8? No — 10 clamps to 8, so `eq(r.band, 10)` fails with actual 8).

- [ ] **Step 3: Implement**

`store.js` — one constant, three clamps (this file loads before `maths.js` on some pages and must stay standalone, so it keeps its own copy):

```js
  var MAX_BAND = 11;             // must match Maths.MAX_BAND; the ladder's top
```

- band: `base.band = Math.max(0, Math.min(MAX_BAND, raw.band | 0));`
- difficulty: `difficulty: Math.min(MAX_BAND, Math.max(1, raw.maths.difficulty)),`
- home: both `Math.min(8, ...)` → `Math.min(MAX_BAND, ...)`

`index.html` — insert before the no-maths button (keep `data-band` as the contract; labels are what a 16-year-old actually is, so the last three read as ages 13, 14–15, 16+):

```html
          <button type="button" class="ageBtn" data-band="9">13</button>
          <button type="button" class="ageBtn" data-band="10">14–15</button>
          <button type="button" class="ageBtn" data-band="11">16+</button>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test.js` — expected: ALL PASS. Then open `index.html` in a browser, open the team editor: the age row shows 5…12, 13, 14–15, 16+, 🚫; picking 16+ echoes "16+" next to the cake. If the row overflows the editor's width on a narrow phone (~360 px), let it wrap: `#teamAges { flex-wrap: wrap; }` in `style.css`.

- [ ] **Step 5: Commit**

```bash
git add index.html store.js test.js style.css
git commit -F - <<'EOF'
feat: age row reaches 16+ and saves carry the taller ladder

Previously the editor stopped at age 12 and store repair clamped
every band to 8, which would have quietly demoted an over-12 team
on reload. The row gains 13, 14-15 and 16+ buttons mapping to
bands 9-11, and every store clamp moves to a shared MAX_BAND.

- store.js keeps its own MAX_BAND copy; it must stay standalone
- paintAges needed no change: buttons carry data-band already
EOF
```

---

### Task 9: Personal bests and the stats card (rating, fastest, streak)

**Files:**
- Modify: `store.js` — `emptySlot().stats` (line ~45)
- Modify: `game.js` — extract `recordAnswer` from the two duplicated blocks (lines 349–352 and 383–386); extend `showStats` rows (~1235)
- Test: `test.js` — stats repair (the `STATS` list test at ~1053 enumerates counters; extend it)

**Interfaces:**
- Consumes: `Maths.rating` (Task 6).
- Produces: `slot.stats.bestMs` (fastest correct, ms, 0 = none yet), `slot.stats.curStreak`, `slot.stats.bestStreak`; `recordAnswer(correct, elapsedMs)` in game.js used by both question callbacks.

- [ ] **Step 1: Write the failing tests**

Find the stats-repair test around line 1053 (`STATS.forEach(...)`) and add the three new keys to its `STATS` list so they are repaired like every other counter. Then add:

```js
// ---- Over-12: personal bests repair like any other counter ----
(function () {
  var r = Store.repairSlot({ stats: { bestMs: 1234, curStreak: 3, bestStreak: 9 } });
  eq(r.stats.bestMs, 1234, 'fastest-correct survives repair');
  eq(r.stats.bestStreak, 9, 'best streak survives repair');
  eq(r.stats.curStreak, 3, 'current streak survives repair');
  r = Store.repairSlot({});
  eq(r.stats.bestMs, 0, 'a fresh slot has no fastest yet');
  eq(r.stats.bestStreak, 0, 'a fresh slot has no streak yet');
})();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test.js` — expected: FAIL, `fastest-correct survives repair` (unknown keys are dropped by the repair loop).

- [ ] **Step 3: Implement the store fields**

In `emptySlot().stats` add:

```js
        ms: 0,                       // time actually spent on a pitch
        bestMs: 0,                   // fastest correct answer; 0 = none yet
        curStreak: 0, bestStreak: 0  // correct-answer streak, current and best
```

(The repair loop iterates `base.stats` keys, so no repair change is needed — that is the point of that loop.)

- [ ] **Step 4: Extract `recordAnswer` in game.js**

Replace the duplicated block in *both* `askQuestion` (lines 349–352) and `askSaveQuestion` (383–386) with a call to one helper defined near `askQuestion`:

```js
// Both question flavours record the same way. Streaks and the fastest
// correct answer live in slot.stats so they survive across sessions and
// repair like every other counter.
function recordAnswer(correct, elapsedMs) {
  if (!game.slot) { return; }
  var st = game.slot.stats;
  st.answered += 1;
  if (correct) {
    st.correct += 1;
    st.curStreak += 1;
    if (st.curStreak > st.bestStreak) { st.bestStreak = st.curStreak; }
    if (!st.bestMs || elapsedMs < st.bestMs) { st.bestMs = elapsedMs; }
  } else {
    st.curStreak = 0;
  }
}
```

Call sites become `recordAnswer(correct, elapsedMs);` (skips never call it, matching today's behaviour).

- [ ] **Step 5: Extend the stats card**

In `showStats` (~1235), after the `['✅', 'Correct', ...]` row add:

```js
    ['\u{1F4C8}', 'Form',
      Maths.rating(game.slot.maths ? game.slot.maths.difficulty
                                   : (game.slot.band || 1))],
    ['⚡', 'Fastest correct', s.bestMs ? (s.bestMs / 1000).toFixed(1) + 's' : '—'],
    ['\u{1F525}', 'Best streak', s.bestStreak]
```

- [ ] **Step 6: Run tests, then verify in the browser**

Run: `node test.js` — expected: ALL PASS. In the browser: play a friendly, answer a few questions, open the stats card from the menu. Expected: Form shows a 47–99 number, fastest-correct shows seconds after the first correct answer, streak counts up and survives a reload.

- [ ] **Step 7: Commit**

```bash
git add store.js game.js test.js
git commit -F - <<'EOF'
feat: form rating and personal bests on the stats card

Progress an older player can point at: a 47-99 form figure straight
from the adaptive difficulty, the fastest correct answer, and the
longest streak. Recording is extracted into one recordAnswer helper
because the bonus and save questions were already duplicating it.

- bestMs/curStreak/bestStreak persist per slot and repair to zero
- Skipping still records nothing, as before
- Form falls back to the chosen band before any question is played
EOF
```

---

### Task 10: The pro skin

**Files:**
- Modify: `game.js` — `applySkin()` helper; call after each `game.slot = Store.activeSlot(game.save)` (lines 262, 982, 1070, 1096) and guard `confetti(...)` at line 537
- Modify: `style.css` — `body.pro` overrides at the end of the file
- Modify: `docs/superpowers/specs/2026-08-07-over-12-design.md` — §9 says "CSS-variable overrides"; the stylesheet has no custom properties, so amend to "CSS overrides keyed off a body class"

**Interfaces:**
- Consumes: `slot.band` (home band; 9+ means pro).
- Produces: `body.pro` class while an over-12 team is active; every visual change lives in CSS.

- [ ] **Step 1: Implement `applySkin`**

Near the top of game.js's slot handling (just after the first `game.slot =` at line 262 is fine):

```js
// Teams whose home band is 9+ get the broadcast look. A class on body and
// CSS overrides only - layout, markup and physics are identical, and a
// sibling's younger team on the same device is untouched.
function applySkin() {
  document.body.classList.toggle('pro',
    !!(game.slot && game.slot.band >= 9));
}
```

Add `applySkin();` immediately after each of the four `game.slot = Store.activeSlot(game.save);` assignments (lines 262, 982, 1070, 1096 — re-grep, they will have shifted).

Guard the goal celebration (line ~537):

```js
  if (!document.body.classList.contains('pro')) {
    confetti(...unchanged args...);
  }
```

(Keep `#goalFlash` — the spec keeps score flashes.)

- [ ] **Step 2: Add the CSS**

At the end of `style.css`:

```css
/* ---- the pro skin: broadcast graphics for over-12 teams ---- */
/* Overrides only. If a rule here needs new markup, it is wrong. */
body.pro {
  background: linear-gradient(180deg, #131a24 0%, #0a0f16 70%, #070b10 100%);
}
body.pro .team,
body.pro #turnMsg { border-radius: 4px; }
body.pro #quiz {
  border-radius: 8px;
  background: rgba(10, 16, 24, .96);
  box-shadow: 0 2px 0 #2b3746, 0 12px 44px rgba(0, 0, 0, .6);
}
body.pro #quizPrize {
  border-radius: 6px;
  background: linear-gradient(160deg, #35404e, #232c37);
}
body.pro #quizChoices button { border-radius: 6px; }
body.pro #goalFlash { animation: none; }
```

- [ ] **Step 3: Amend the spec wording**

In the spec's §9, change "implemented as CSS-variable overrides only" to "implemented as CSS overrides keyed off a single `body.pro` class (the stylesheet uses no custom properties, so plain descendant overrides are the variable-free equivalent)".

- [ ] **Step 4: Verify in the browser**

Open `index.html`. With a 16+ team active: darker background, squared corners, muted prize card, goals flash without confetti. Switch to a 5-year-old's slot: the playroom look returns immediately (that is what the four `applySkin()` call sites guarantee). Run `node test.js` — ALL PASS (nothing Node-side changed).

- [ ] **Step 5: Commit**

```bash
git add game.js style.css docs/superpowers/specs/2026-08-07-over-12-design.md
git commit -F - <<'EOF'
feat: broadcast-style pro skin for over-12 teams

A 16-year-old should not feel they are borrowing a little kid's
game. Teams with home band 9+ toggle a pro class on body: darker
palette, squared corners, muted prize card, confetti retired in
favour of the plain goal flash. CSS overrides only - no layout,
markup or physics changes, and per-slot as everything else.

- applySkin runs at every point the active slot changes
- Spec 9 amended: body-class CSS overrides, not CSS variables
EOF
```

---

### Task 11: README and final verification

**Files:**
- Modify: `README.md` — the band table (~lines 64–75), the "5–12 year olds" framing (line 3), and the test-count line (~162, update to the new count `node test.js` prints)
- Verify: everything, together

- [ ] **Step 1: Update the README**

- Line 3: "teaches maths to 5–12 year olds" → "teaches maths from age 5 to 16+".
- Band table: extend with
  `| 9 | 13 | two-step equations, expanding, angles, sequences |`
  `| 10 | 14–15 | simultaneous equations, Pythagoras, quadratic sequences |`
  `| 11 | 16+ | index laws, inequalities, geometric sequences, areas |`
- The maths section's "eight bands, roughly ages 5 to 12" → "eleven bands, ages 5 to 16+".
- Update the `node test.js` check count to whatever the suite now prints.

- [ ] **Step 2: Full verification**

- `node test.js` — ALL PASS, note the count.
- Maths lab: bands 9–11 sample correctly; the adaptive table still settles near 80%.
- Game: create a 16+ team → pro skin on, quiz shows 5–6 choices with diagrams rendering, stats card shows Form/fastest/streak; switch to a young team → everything back to the playroom look, 4 choices, band-appropriate questions.
- A pre-existing save (if one is around) still loads.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -F - <<'EOF'
docs: the README covers the ladder to 16+

The game now runs to band 11, so the front door should say so:
age range, the band table's three new rows, and the test count.
EOF
```

---

## Self-review notes

- **Spec coverage:** §4 content → Tasks 1–3; §5 rendering → Task 7; §6 engine → Task 4; §7 format → Task 5; §8 ages/saves → Task 8; §9 skin → Task 10; §10 rating/bests → Tasks 6+9; §11 validation → tests throughout, final sweep in Task 11.
- **Ordering:** bands land before the ceiling rises, so the suite is green after every task; renderer lands before the age row makes bands reachable by real players.
- **Known judgment calls:** diagram label offsets in Task 7 are eyeballed in the lab, deliberately — the tests pin the *data* (angles sum, triples, areas), the lab pins the *look*, same split the project already uses.
