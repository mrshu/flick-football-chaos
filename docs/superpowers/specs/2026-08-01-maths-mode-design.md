# Flick Football Chaos — Maths Mode Design

Date: 2026-08-01
Status: approved design, ready for implementation planning

## 1. Purpose

Turn the existing arcade game into an educational one for ages 5–12, where a
child practises arithmetic as a side effect of playing football. The maths must
feel like part of the game rather than a toll paid to reach it.

Success looks like: a child *wants* to play again tomorrow, and the day after.

Total practice volume comes from **repeat play over weeks, not density within a
session**. A child who plays twenty short matches across a fortnight does far
more maths than one drilled hard once and put off. Every design decision below
is therefore judged on whether it makes a child want another go — not on how
many questions can be packed into a single match.

## 2. Goals

- Maths practice woven into the existing turn loop, not gating it.
- Difficulty that rises and falls automatically to keep the child at roughly
  80% success.
- Content spanning ages 5–12 (number bonds through simple equations).
- Language independence: the game must be playable with no reading at all.
- Engagement through competence and collection, not compulsion.

## 3. Non-goals

- No accounts, networking, leaderboards, or multiplayer.
- No speech synthesis (explicitly declined).
- No cup/tournament arc (deferred).
- No penalty-shootout minigame (deferred).
- No timers or time pressure visible to the player.
- No word problems in any language.

## 4. Constraints

These are hard and shape the architecture:

- **Language independence.** No text anywhere in the game, new or existing.
  Numerals and `+ − × ÷ =` are the only notation assumed. This is
  *near*-universal, not literally universal — it presumes Western Arabic
  digits, which dominate maths schooling but are not the only system in use.
- **Runs from `file://`.** ES modules cannot load over `file://`, so
  `<script type="module">` is ruled out. All files stay plain scripts loaded in
  order, each attaching a single global.
- **No assets, frameworks, or build step.** Everything drawn procedurally, as
  in the existing game.
- **Touch and mouse equally.** Tap targets sized for a 5-year-old on a phone.

## 5. Core mechanic: the Charged Shot

One question per turn, immediately before the human aims.

- **Correct** → the player glows gold and the flick gets a power multiplier of
  `1.35`. Streak advances.
- **Wrong** → the correct answer flashes green, the tapped choice flashes red,
  and the child **still takes a normal shot**. No turn is lost. Streak resets.

The no-penalty rule is deliberate: losing a turn for a wrong answer teaches a
child that maths is the obstacle between them and football.

The CPU never answers questions and never receives charges. This asymmetry
makes the game easier for the child, which is intended.

### Optional bonus question

After answering, the child may voluntarily take a second question for
additional charge. It works by making the child *choose* extra maths to get a
reward they want.

Per §1 this is a **secondary** lever — it raises density within a session,
where wanting to return matters more — but it costs almost nothing to build on
top of the question flow that already exists.

## 6. Wordless UI

Every existing string is replaced. This is a change to the current game, not
only to the new mode.

| Current | Replacement |
| --- | --- |
| `YOU 0` / `0 CPU` | Blue disc `0` — `0` red disc |
| `Your turn — drag a blue player` | Pulsing blue dot + animated drag-arrow diagram |
| `CPU is thinking…` | Pulsing red dot + animated ellipsis |
| `Nice flick!` / `CPU shoots!` | Removed (redundant with the physics) |
| `GOAL!` / `CPU SCORES!` | Ball burst in the scoring team's colour + confetti |
| `You Win! 🏆` / `CPU Wins 🤖` | Trophy or robot glyph + `3` – `1` |
| `Final score 3 – 1` | Digits only |
| `Play Again` | `↻` glyph |
| Footer hint sentence | Small looping drag-and-release animation |
| Chaos banner text | Icon only (🎈 💥 🧊 🐜) |

### Intro screen

Shown at boot. Wordless:

- A grid of eight large buttons showing the digits `5`–`12` (age → starting
  band).
- One `⚽` button for plain arcade play with no maths.
- Selection persists, so a returning child skips straight in via `↻`; a small
  grid glyph returns to the selector.

## 7. Maths content

### 7.1 Bands

Eight bands map to ages 5–12. The band is a *point on a continuous scale*, not
a discrete mode (see §8).

| Band | Age | Content | Example |
| --- | --- | --- | --- |
| 1 | 5 | Counting and bonds to 5, quantities drawn as footballs | `⚽⚽ + ⚽ = □` |
| 2 | 6 | ± within 10, bonds to 10 | `3 + □ = 10` |
| 3 | 7 | ± within 20, doubles, step sequences | `2, 4, 6, □, 10` |
| 4 | 8 | ×2 ×5 ×10, ± within 100, halves and quarters | `7 × 5 = □` |
| 5 | 9 | Tables to 12, division facts, fractions of amounts | `¼ × 12 = □` |
| 6 | 10 | Multi-digit ±, fraction comparison, simple decimals | `0.25 + 0.5 = □` |
| 7 | 11 | Percentages, ratio, order of operations | `2 + 3 × 4 = □` |
| 8 | 12 | Negatives, squares and roots, simple equations | `□ − 7 = −2` |

### 7.2 Question forms

Form variety matters as much as content — the same skill in different shapes
stays interesting:

- Direct evaluation: `7 × 5 = □`
- Missing operand: `3 + □ = 10`
- Sequence gap: `2, 4, 6, □, 10`
- Comparison: `7 □ 5` answered with `<`, `>`, `=`
- Visual fraction: a bar split into parts

The unknown is always a box `□`, never a Latin letter, keeping band 8 algebra
language-free.

### 7.3 Distractors

Normally four choices: the answer plus three **near misses** chosen from
off-by-one, the result of the other operation, a digit reversal, or a common
place-value slip. Near misses make a wrong tap diagnostic of a specific
misconception rather than random noise.

Choice count is not always four. It is reduced to 2 or 3 at the bottom of the
difficulty scale as a support mechanism — see §8.6.

Choices are deduplicated. Where the answer space is too small to yield enough
distinct plausible distractors (band 1 answers run 1–5), the count drops rather
than emitting a duplicate.

## 8. Adaptive difficulty

### 8.1 Continuous scale

Difficulty is a float in `[1.0, 8.0]`. For difficulty `d`, let `b = floor(d)`
and `f = d − b`; a question is drawn from band `b + 1` with probability `f`,
otherwise from band `b`. At `3.4` that is 40% band 4, 60% band 3 — so
progression is a gradual shift in mix, with no cliff between levels.

The intro selection sets the starting value. Adaptation runs from there.

### 8.2 Signals

Two signals, not one. Response time separates fluency from finger-counting: a
child answering `7 × 8` in 1.5s has mastered it; one taking 12s has not.

Expected time per question is `2500 + 900 × band` ms. Fast is under 60% of
expected, slow is over 140%.

| Outcome | Step |
| --- | --- |
| Correct, fast | `+0.100` |
| Correct, mid | `+0.075` |
| Correct, slow | `+0.040` |
| Wrong | `−0.300` |

Timing is **measured but never displayed**. There is no visible timer and no
time pressure.

### 8.3 Why those numbers

A random walk with up-step `u` and down-step `d` settles where
`p·u = (1 − p)·d`, i.e. at accuracy `p* = d / (u + d)`.

With `u ≈ 0.075` (typical mix) and `d = 0.300`, `p* = 0.3 / 0.375 = 0.80` —
the 80% target. Retuning the target is therefore a single ratio change rather
than guesswork.

Steps are small so the difficulty drifts rather than lurching, and the
asymmetry between up and down prevents oscillation at band boundaries.

### 8.4 Weak-spot weighting

Per-skill mastery is an exponentially-weighted moving average of correctness,
initialised at `0.5`. When choosing a question type within the selected band:

- 60% of the time, weight types by `(1 − mastery + 0.1)` — favouring weak spots.
- 40% of the time, choose uniformly.

The 40% matters. Relentlessly drilling only weaknesses is how a child comes to
hate the subject, and mixed practice beats blocked practice for retention
anyway.

### 8.5 Dignity

Difficulty decreases are silent — no "level down" moment, no visible number. In
a wordless game this is free.

### 8.6 Floor support

Difficulty cannot fall below `1.0`, which creates a problem the rest of the
model hides: a child who finds even band 1 hard has nowhere to descend to, and
gets stuck well below the 80% target. That is the child who least deserves a
frustrating experience.

Below the floor, the lever becomes **choice count** rather than difficulty:

| Difficulty | Answer choices |
| --- | --- |
| `≤ 1.25` | 2 |
| `≤ 1.75` | 3 |
| `> 1.75` | 4 |

Fewer options means less to read, less to compare, and a better chance — which
lifts the weakest learner back toward target without ever showing them
something easier than the easiest content.

### 8.7 Validation

The tuning above is not guesswork; it was simulated before being written down.
Learners of fixed ability were run for 60,000 questions each against the update
rule.

| Learner ability | Settles at band | Observed accuracy |
| --- | --- | --- |
| 1.5 | 1.29 | 75.8% |
| 3.0 | 2.37 | 79.2% |
| 4.5 | 3.87 | 79.2% |
| 6.0 | 5.37 | 79.2% |
| 7.5 | 6.87 | 79.3% |

All land in the 72–88% band, matching the predicted `p* = 0.80`, and
difficulty never escaped `[1.0, 8.0]`.

The first row is why §8.6 exists: **without floor support that learner sat at
64.8%**. The simulation is worth reproducing as part of `test.js`.

## 9. Rewards, streaks and unlocks

### 9.0 Why a child comes back

Since practice volume is driven by repeat play (§1), the mechanics below are
chosen specifically as reasons to start another match:

1. **The game is fun without the maths.** The flick physics, the chaos, the
   near-misses. Nothing else works if this is not true, and it already is.
2. **Feeling competent.** The adaptive engine (§8) is a *retention* mechanic as
   much as a pedagogical one. A child held near 80% success always feels good
   at this, and people return to things they feel good at. A child who feels
   stupid does not come back, however many rewards are on offer.
3. **Visible, permanent progress.** Unlocks accumulate and never expire, and
   the next one is always visible as a filling silhouette — there is always a
   near-term reason to play one more.
4. **The game keeps changing.** Themes, balls and hats alter how it *looks* over
   time, so it stays novel rather than same-y.
5. **Escalating spectacle.** The streak tiers give something to chase within a
   session, ending in genuine silliness.
6. **Ownership.** Cosmetics are earned and chosen, so the game becomes *theirs*.
7. **Low friction to restart.** Short matches and a one-tap `↻`, no menus in the
   way of another go.

### 9.1 Streak spectacle

Streak counts consecutive correct answers and resets to zero **only** on a
wrong answer.

| Streak | Reward |
| --- | --- |
| 3 | A chaos modifier fires (the existing system, now *earned* rather than random) |
| 5 | Chaos modifier + screen shake + enlarged confetti |
| 8 | All three human players launch together along the aim vector, fanned slightly |

Past 8, every further 3 correct answers re-fires the tier-8 reward. Progress is
shown as filling pips, not text.

### 9.2 Procedural unlocks

Cumulative correct answers unlock cosmetics, all drawn in code:

- **Ball skins:** classic, stripes, stars, flames, beach, gold
- **Player hats:** cap, crown, party hat
- **Pitch themes:** night, snow, space

Ten milestones map one-to-one, in order, to the twelve cosmetics above minus
the two defaults (classic ball, day pitch, which start unlocked):

| Correct answers | Unlock |
| --- | --- |
| 10 | Stripes ball |
| 25 | Cap |
| 50 | Night pitch |
| 100 | Stars ball |
| 175 | Crown |
| 275 | Snow pitch |
| 400 | Flames ball |
| 550 | Party hat |
| 750 | Space pitch |
| 1000 | Gold ball |

The first is deliberately early — a reward within the first match or two
establishes that playing yields things. A silhouette fills as the next
approaches.

Nothing is ever lost or expires. This is the strongest "one more go" driver and
is healthy precisely because it is pure accumulation.

### 9.3 Juice

The cheapest large improvement to how the game feels:

- Screen shake on hard collisions and goals, amplitude proportional to impact,
  decaying.
- Hit-stop: freeze physics 40–70 ms on very hard collisions.
- Ball trail: fading circles from recent positions.
- Slow motion: physics at 0.3× for ~0.6 s as a goal goes in.

### 9.4 Hook ethics

The users are children, so the engagement mechanics deliberately rely on
competence, collection and curiosity. Explicitly excluded: daily-streak guilt,
artificial scarcity, and anything that punishes stopping. Those drive numbers
but buy engagement with anxiety, and a child who feels bad about missing a day
associates that feeling with maths.

## 10. Architecture

### 10.1 Files

`game.js` is already 654 lines; folding maths in would push it past 1,000.

```
maths.js  →  pure question generation + adaptive engine. No DOM, no game state.
quiz.js   →  renders a question, handles taps, reports the result. DOM only.
game.js   →  physics, rendering, turn loop. Gains one new state.

game.js → quiz.js → maths.js         (maths.js depends on nothing)
```

Loaded as plain scripts in that order (see §4 on `file://`). `maths.js` ends
with `if (typeof module !== 'undefined') module.exports = Maths;` so Node can
test it without affecting the browser.

### 10.2 Generator contract

```js
Maths.make(difficulty, state, rand) → {
  render:  [{t:'balls',v:2}, {t:'op',v:'+'}, {t:'num',v:3}, {t:'eq'}, {t:'box'}],
  answer:  5,
  choices: [4, 5, 6, 7],   // shuffled, always contains answer
  skill:   'bonds',        // for mastery tracking
  band:    1
}
```

`render` is a token list, not a string — this is what keeps it wordless and
lets band 1 draw footballs where band 7 draws digits. Token types: `num`,
`balls`, `op`, `eq`, `box`, `frac`, `bar`, `sep`, `pct`, `pow`.

`rand` is injected rather than calling `Math.random` internally, so tests are
reproducible.

```js
Maths.update(state, {correct, elapsedMs, band, skill}) → newState
```

Pure: returns updated difficulty and mastery. No side effects.

### 10.3 State machine

One state is inserted into the existing loop:

```
HUMAN_QUESTION → HUMAN_AIM → MOVING → AI_WAIT → MOVING → HUMAN_QUESTION
```

The question panel overlays the pitch, then clears entirely so aiming is
unobstructed.

In arcade (`⚽`) mode the new state is skipped entirely: chaos modifiers revert
to firing randomly as they do today, no charges are granted, and no unlock
progress accrues (unlocks are earned by correct answers). Equipped cosmetics
still apply, so anything already earned is enjoyed in arcade play too.

### 10.4 Persistence

`localStorage` under an `ffc.` prefix: starting band, current difficulty,
mastery map, cumulative correct count, unlocked cosmetics, equipped cosmetics.

All access wrapped in `try/catch` falling back to in-memory defaults —
`localStorage` throws in some private browsing modes, and the game is fully
playable unpersisted.

## 11. Edge cases

- **Floating point.** `0.1 + 0.2 !== 0.3`. All arithmetic is done in integers
  internally and formatted only for display. No float equality anywhere.
- **No negatives before band 8.** A six-year-old should never be shown `−3`.
- **Division is always exact** in bands 4–6; no remainders.
- **Power stacking.** Charge (`1.35`) can coincide with the Super Shot chaos
  modifier (`1.6`) for `2.16×`. The combined multiplier is capped at `2.0`, and
  `chargeMult` is cleared at turn end alongside `clearModifier()`.
- **No question** during goal pauses or after the match ends.
- **Restart** resets streak and match state; difficulty, mastery and unlocks
  persist.
- **Difficulty clamped** to `[1.0, 8.0]`; steps can never drive it outside.
- **Distractor exhaustion** in band 1 falls back to three choices (§7.3).

## 12. Testing

The worst defect in an educational game is a question whose "correct" answer is
wrong — it actively teaches error, and casual play will not catch it. `maths.js`
being pure is what makes catching this cheap.

`node test.js`, no framework, non-zero exit on failure.

**Generator invariants** — 2,000 seeded questions per band, asserting:

- `choices` contains `answer`
- choices are unique, and the count matches the §8.6 rule for that difficulty
  (2, 3 or 4) — never a duplicate to pad the list
- `answer` matches an independent recomputation from `render`
- no `NaN`, `Infinity`, or `undefined` in any field
- no negative values below band 8
- division questions divide exactly
- decimal questions land on safe values (halves, quarters, tenths)
- every `render` token is a known type with valid fields

**Adaptive engine properties** — simulate synthetic learners with fixed
accuracy `p`:

- a learner at `p = 0.95` drifts upward; at `p = 0.4` drifts downward
- difficulty never leaves `[1.0, 8.0]`
- a learner at `p = 0.80` converges to a stable band rather than oscillating
- mastery values stay within `[0, 1]`
- **the §8.7 convergence table reproduces**: learners of ability 1.5 through
  7.5 all settle at 72–88% observed accuracy, including the weakest, who
  regresses to ~65% if floor support (§8.6) is broken

**Browser verification** of the turn flow, wordless UI, and unlock milestones,
as done for the base game.

## 13. Implementation order

This is larger than one sitting, and the pieces have a natural dependency
order. Each phase leaves the game playable, so progress is verifiable
throughout rather than only at the end.

1. **`maths.js` + `test.js`** — question generation and the adaptive engine,
   headless. No UI. Fully tested before anything is wired up, because a
   generator that marks wrong answers correct poisons everything downstream.
2. **`quiz.js` + the `HUMAN_QUESTION` state** — panel, tap handling, charged
   shot, streak pips. The game is now educational and playable end to end.
3. **Wordless conversion** — replace every string in the existing UI (§6) and
   add the intro selector. Self-contained and touches mostly presentation.
4. **Juice** (§9.3) — shake, hit-stop, trails, slow motion. Independent of
   everything above; large felt improvement for small effort.
5. **Unlocks** (§9.2) — persistence, milestones, procedural cosmetics, the
   filling silhouette. Last because it depends on a working correct-answer
   count and is the most self-contained.

Phases 1–2 deliver the core ask. Phases 3–5 are separable and could each be
their own plan if preferred.

## 14. Deferred

Recorded so the reasoning is not lost:

- **Penalty shootout** — rapid-fire questions earning penalty kicks. This
  raises *density* within a session, which §1 identifies as the lesser lever;
  it does little for wanting to return. Easy to add later if more practice per
  sitting is ever wanted.
- **Cup run** — five opponents of rising difficulty with crests. Note this was
  the one deferred item that served **repeat play** rather than density: a
  part-finished tournament is a concrete reason to come back tomorrow. Worth
  revisiting first if retention proves weaker than hoped.
- **Speech synthesis** — would let a pre-reader play unaided; declined in
  favour of a silent game.
- **Answer-zone goals and numbered players** — alternative integrations
  considered and rejected: answer zones fire only on goals (≈5 questions a
  match), numbered players allow a 1-in-3 guess and can punish a correct answer
  with poor positioning.
