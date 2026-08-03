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

## 5. Core mechanic: the Advertised Prize

One question per turn, immediately before the human aims — **offered, not
imposed**.

The panel shows three things at once: **the prize you would win**, the
question, and a skip control.

```
        🎈  <- the prize, shown before you answer
      12 - 8 = []
   [ 4 ]  [ 5 ]  [ 3 ]        [ skip ]
```

- **Correct** -> the advertised chaos modifier fires for this turn, with its
  banner. Streak advances.
- **Wrong** -> the correct answer flashes green, the tapped choice flashes red,
  and the child **still takes a normal shot**. No turn is lost. Streak resets.
- **Skip** -> straight to aiming. No prize, no penalty, no comment.

### Why the prize is shown first

Showing the reward before the question turns a toll booth into an offer. A
child who can see they are playing *for* a Giant Ball is choosing to do maths;
a child handed a question with no visible stake is paying a tax to reach the
football.

### Why the prize is a chaos modifier

The chaos modifiers already exist, are genuinely funny, and read as a single
icon with no words. More importantly they are **unconditional**: the modifier
fires whether or not the child then aims well.

This replaces an earlier design in which a correct answer multiplied flick
power by 1.35. That was abandoned because the reward was invisible (a
multiplier cannot be seen), *contingent* on a second skill (a child good at
maths and bad at flicking received nothing), and occasionally a penalty (more
power overshoots, and ruins a delicate positioning nudge).

Chaos is therefore **earned only** while maths is on; the random per-turn roll
survives only in the maths-off arcade mode.

### Why skipping is allowed

If answering is optional, no child is ever blocked, and every question answered
is one the child chose. That is the whole "doing a ton of maths by accident"
goal (§1).

The risk is real and accepted: a child *can* skip everything and do no maths.
The prize therefore has to carry the entire motivation, which is why it must be
something genuinely wanted rather than a number.

### Streak escalation

The prize shown escalates with the streak, so the offer gets louder the better
the child is doing (§9.1). Streak progress is displayed as filling pips beside
the prize, so there is always a visible next rung.

The CPU never answers questions and never receives prizes. This asymmetry makes
the game easier for the child, which is intended.

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

### Setup screen

Shown at boot. One flat screen, no nested menus — three rows of choices and a
play button, everything visible at once with the current selection highlighted.

| Row | Choices | Meaning |
| --- | --- | --- |
| Team | three slot cards | Who is playing (§14) — everything earned belongs to the selected slot |
| Mode | `⚽` \| `🏆` | One match, or a five-match cup (§13) |
| Maths | `⚽` `5` `6` `7` `8` `9` `10` `11` `12` | No maths, or starting band by age |
| Opposition | `★` `★★` `★★★` | AI strength (§13.6) — dimmed when `🏆` is chosen, since the cup sets its own curve |

Then a large `▶`. Plus the selected team's trophy shelf (§13.5).

Four rows plus a play button is a lot for a small phone in portrait; the screen
may scroll, but `▶` stays pinned and reachable without scrolling.

Stars carry "easy / normal / hard" without language, which the words themselves
could not; digits carry the age band.

**The two axes are orthogonal**, so all four combinations are valid and there
are no invalid states to guard against:

| | No maths | With maths |
| --- | --- | --- |
| **Single** | The original arcade game | One match with questions |
| **Cup** | Football-only tournament | The full educational campaign |

Choosing a single match rather than a cup matters: committing a child to five
matches when they have ten minutes is a good way to have them not start at all.

Selections persist, so a returning child taps `▶` once — or `↻` from the end
screen to replay immediately. A small grid glyph returns here.

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
64.8%**. This is reproduced against the real engine in `test.js`; the standalone
prototype it was first measured with has been removed to avoid two sources of
truth.

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
4. **An unfinished cup.** A tournament three opponents deep is the most concrete
   "come back tomorrow" in the design (§13). Unlike everything else here it
   leaves a *specific* thing outstanding rather than a general sense of
   progress, which is a stronger pull.
5. **The game keeps changing.** Themes, balls and hats alter how it *looks* over
   time, so it stays novel rather than same-y.
6. **Escalating spectacle.** The streak tiers give something to chase within a
   session, ending in genuine silliness.
7. **Ownership.** Cosmetics are earned and chosen, so the game becomes *theirs*.
8. **Low friction to restart.** Short matches and a one-tap `↻`, no menus in the
   way of another go.

### 9.1 Streak spectacle

Streak counts consecutive correct answers and resets to zero **only** on a
wrong answer.

| Streak | Prize shown before the question |
| --- | --- |
| 1-2 | One chaos modifier |
| 3-4 | One chaos modifier + screen shake |
| 5-7 | Two chaos modifiers at once |
| 8+ | All three human players launch together, fanned — re-offered every third answer |

The prize is always **displayed before the child answers** (§5), so the streak
is felt as a rising offer rather than discovered afterwards.

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

Counts and unlocks are **per slot** (§14.1), so siblings each earn their own
rather than one child's practice unlocking rewards for another.

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
maths.js       →  pure question generation + adaptive engine. No DOM, no game state.
tournament.js  →  pure cup state: opponents, index, season. No DOM, no game knowledge.
quiz.js        →  renders a question, handles taps, reports the result. DOM only.
game.js        →  physics, rendering, turn loop. Gains one new state.

game.js → quiz.js → maths.js
game.js → tournament.js              (both leaf modules depend on nothing)
```

Two pure leaves, one DOM layer, one game layer. Both leaves are testable in
Node without a browser.

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

With maths switched off (`⚽` in the Maths row of §6), the new state is skipped
entirely: chaos modifiers revert to firing randomly as they do today, no
charges are granted, and no unlock progress accrues (unlocks are earned by
correct answers). This is independent of the Mode row — a football-only cup
still advances through crests and still awards a trophy.

Equipped cosmetics always apply, so anything already earned is enjoyed in
maths-free play too.

### 10.4 Persistence

`localStorage` under an `ffc.` prefix. Progress is stored **per slot** rather
than globally — see §14.5 for the full shape and the robustness rules.

All access wrapped in `try/catch` falling back to in-memory defaults —
`localStorage` throws in some private browsing modes, and the game is fully
playable unpersisted.

## 11. Edge cases

- **Floating point.** `0.1 + 0.2 !== 0.3`. All arithmetic is done in integers
  internally and formatted only for display. No float equality anywhere.
- **No negatives before band 8.** A six-year-old should never be shown `−3`.
- **Division is always exact** in bands 4–6; no remainders.
- **Stacked modifiers.** From streak 5 the prize is *two* chaos modifiers at
  once, but `activateModifier` was written for one at a time: a second call
  overwrites `game.modifier` and the banner, and Giant Ball plus Tiny Players
  are contradictory rather than merely additive. Stacking must therefore apply
  both effects, show both icons, and be undone completely by `clearModifier`.
  Combinations that fight each other (Giant Ball with Tiny Players) are
  excluded when the pair is drawn.
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

**Tournament invariants** (`tournament.js` is pure, so these are cheap):

- `recordResult(false)` never advances the index; `recordResult(true)` advances
  by exactly one
- the index never exceeds the opponent count; completing the last opponent
  increments the season and resets the index
- `skill` is strictly increasing across the five opponents, and never exceeds
  the `0.95` cap of §13.2 — including in later seasons, where the raised base
  must still clamp
- state survives a serialise/deserialise round trip unchanged

**Slot and persistence invariants** (§14) — the storage layer is pure enough to
test headlessly with a stubbed store:

- a corrupt, truncated or non-JSON slot value loads as empty rather than
  throwing
- an unknown `ffc.v` triggers migration rather than a crash or silent data loss
- a throwing `localStorage` (private mode) degrades to in-memory without
  breaking play
- writes to slot 1 never alter slots 0 or 2 — the isolation that §14.1 depends
  on
- a slot round-trips through save and load unchanged, including an empty name
  and a multi-byte emoji
- deleting a slot clears only that slot and leaves `ffc.active` valid

**Browser verification** of the turn flow, wordless UI, unlock milestones, and
cup progression, as done for the base game.

**Playtest requirement** (§13.3): confirm a young child can actually beat
opponent 5. With no dynamic mercy, the fixed curve is the only safeguard, and
this cannot be verified by unit tests.

## 13. The cup

A five-opponent tournament, which exists to serve repeat play (§1): a
part-finished cup is a concrete reason to come back tomorrow.

### 13.1 One of two modes

The cup is chosen on the setup screen (§6) alongside the single-match option,
and is independent of whether maths is switched on — a football-only cup is a
perfectly good thing to want.

Progress shows as a row of five procedurally-drawn crests (colour plus a simple
pattern — stripes, halves, sash, quarters, hoops), completed ones ticked, the
current one highlighted. No names, no text.

Cup progress is saved after every match, so a part-finished tournament survives
closing the tab — which is the entire point of it (§9.0).

**Choosing `🏆` always resumes an unfinished cup**, and only starts a fresh one
when the previous is complete. There is deliberately no "abandon cup" action:
it would be the single destructive control in the game, and confirming it
wordlessly is awkward. Since a loss never costs progress (§13.3), a child has
no reason to want one — the only escape from a hard opponent is `⚽` single
match, which is always one tap away and costs the cup nothing.

### 13.2 Rising AI quality

The opposition must genuinely get better. `aiLaunch()` currently has a fixed
aim error of `0.14` rad and semi-random power; the cup threads one `skill`
value `s ∈ [0, 1]` through it, driving three behaviours:

| Behaviour | Formula |
| --- | --- |
| Aim error | `0.24 − 0.19·s` rad (≈0.21 → 0.06) |
| Power jitter | `0.28 − 0.24·s` (sloppy → calibrated) |
| Player choice | nearest-to-ball when `s < 0.5`; angle-to-goal weighted when `s ≥ 0.5` |

Opponents run `s = 0.15, 0.35, 0.55, 0.75, 0.95`. One number, three effects,
one qualitative switch — no new AI subsystem.

**The ceiling is capped at `0.95` deliberately.** Zero aim error would make the
final opponent close to unbeatable, and §13.3 removes the safety net that would
otherwise catch a stuck child.

### 13.3 Losing costs progress but never destroys it

Lose and you replay the same opponent. The arc only ever moves forward.
Elimination would mean a child losing the final loses everything, which
contradicts the rule that a wrong answer never costs a turn.

There is **no dynamic mercy** — an opponent's skill does not drop after
repeated losses. This keeps the challenge honest and avoids an older child
noticing they are being patronised, but it has a consequence worth stating
plainly:

> The fixed skill curve is now the *only* thing standing between a young child
> and an unwinnable wall. If a 5-year-old cannot beat opponent 5, they have no
> route forward except persistence.

Three things make that acceptable, and all three need checking in playtest:

1. The ceiling cap above.
2. The child earns chaos modifiers; the CPU never does.
3. The physics is genuinely chaotic — collisions and bounces mean upsets happen
   regardless of aim quality.

If playtesting shows opponent 5 walling young children, the fix is lowering the
top of the curve, not reintroducing dynamic mercy.

### 13.4 Two difficulty systems, deliberately orthogonal

Maths difficulty adapts **invisibly to the child** (§8). Football difficulty
rises **visibly through the cup**. These are not welded together on purpose: a
child may be a fine footballer and shaky at times tables, or the reverse.

### 13.5 Trophy shelf

Completing a cup adds a trophy to the selected team's shelf (§14.1) on the setup
screen and begins a new season with a slightly higher base skill, giving
indefinite replay without new content.

Trophies are kept **separate from the cosmetic unlocks** rather than tangled
into them: cosmetics come from correct answers, trophies from winning cups. Two
categories, no shared currency to reason about.

### 13.6 Single-match difficulty

A single match gets the same three AI behaviours, set directly instead of by
cup progression — one shared `skill` knob, two ways of reaching it. This applies
whether or not maths is switched on:

| Button | Meaning | `skill` |
| --- | --- | --- |
| `★` | Easy | `0.20` |
| `★★` | Normal | `0.55` |
| `★★★` | Hard | `0.90` |

Stars rather than words, for the reason in §6. The chosen value feeds the exact
same formulas in §13.2, so there is a single AI difficulty implementation with
no second code path to keep in sync.

The row is dimmed when `🏆` is selected: the cup supplies its own rising curve,
and letting both set `skill` would be two controls fighting over one value.

### 13.7 Module

```js
Tournament.state()          → {season, index, opponents, lastResult}
Tournament.current()        → {crest, skill}
Tournament.recordResult(won) → newState   // advances only on a win
```

Pure, no DOM, no game knowledge — the same shape as `maths.js`. `game.js` reads
`Tournament.current().skill` when configuring the AI and calls `recordResult()`
at match end. Persisted alongside the other `ffc.` keys (§10.4).

## 14. Slots and team identity

Three save slots, each with a customisable team, all persisted to
`localStorage`.

### 14.1 A slot is a player, not just a cup

Three slots with distinct team identities are really three *players* — most
obviously siblings sharing a tablet. That drives the most important decision
here: **everything earned lives inside the slot**, including the adaptive maths
state.

If difficulty and mastery were global, a seven-year-old and a five-year-old
sharing a device would drag each other's difficulty around and the adaptive
engine (§8) would serve both badly — it would be tuning to the average of two
different children, which describes neither.

Per slot: team identity, cup progress, maths difficulty and mastery, correct
answer totals, unlocks and equipped cosmetics, trophies.

Global: only the last-used setup choices (mode, band, stars), as a convenience.

A single child wanting three parallel cups is served by the same model at no
cost — they simply use three teams.

### 14.2 Team identity

- **Emoji** — required, chosen from a curated grid of ~30 (animals, weather,
  sport, symbols). A curated grid rather than the system emoji picker: it is
  tap-only, needs no keyboard, and is not overwhelming for a young child.
- **Name** — *optional* text, up to 12 characters, may be empty.

The name is the one place text appears, and it does not break §4: the game
still ships no words, and the child supplies their own in their own language.
Because it needs a keyboard, it must never be required — a slot with only an
emoji is complete and usable.

The team emoji appears on the player's side of the HUD during matches, so the
identity is part of play rather than a label seen once.

**Rendering user input:** names are written with `textContent` or canvas
`fillText`, never `innerHTML`. The data is local-only, but building a habit of
injecting user strings as markup is a defect regardless of reachability.

### 14.3 Discoverability

Slots appear as a row of three cards at the top of the setup screen (§6), each
showing its emoji large, its name beneath, and a small `✏️` badge in the
corner. Tapping a card selects it; tapping `✏️` opens the editor with the emoji
grid and the name field.

An empty slot shows `+`; tapping it creates a team and opens the editor
immediately, so the first thing a new player does is choose their emoji.

### 14.4 Deleting a slot

This is the one destructive control in the game, which §13.1 otherwise avoids.
It cannot be dodged here: with a fixed three slots, a full set must be
reclaimable.

It is made safe rather than absent: a `🗑` on the editor requires a second tap
to confirm, the button turning red with `✓` / `✗` between taps. Wordless, and
no single tap destroys anything.

### 14.5 Storage

```
ffc.v          → schema version (integer)
ffc.slots      → [slot, slot, slot]   (null for empty)
ffc.active     → 0 | 1 | 2
ffc.setup      → {mode, band, stars}  (last-used, global)
```

Each slot:

```js
{
  emoji: '🦁', name: 'Lions',
  cup:      {season, index, results},
  maths:    {difficulty, mastery},
  stats:    {correct, total},
  unlocked: [...], equipped: {ball, hat, pitch},
  trophies: 2
}
```

Total well under any quota. Three rules keep it robust:

- **Every read is wrapped.** A corrupt or partial value yields an empty slot
  rather than a crash — a bad save must never brick the game.
- **`ffc.v` is checked on load**, so a future schema change can migrate instead
  of breaking existing players.
- **`localStorage` may be unavailable** (private mode) and throws; the existing
  in-memory fallback (§10.4) applies, with progress lost on close. This is not
  surfaced, because warning about it wordlessly is not realistic.

## 15. Implementation order

This is larger than one sitting, and the pieces have a natural dependency
order. Each phase leaves the game playable, so progress is verifiable
throughout rather than only at the end.

1. **`maths.js` + `test.js`** — question generation and the adaptive engine,
   headless. No UI. Fully tested before anything is wired up, because a
   generator that marks wrong answers correct poisons everything downstream.
2. **`quiz.js` + the `HUMAN_QUESTION` state** — panel, tap handling, charged
   shot, streak pips. The game is now educational and playable end to end.
3. **`storage.js` + slots** (§14) — the slot model, per-slot state, and the
   wrapped/versioned `localStorage` layer. Early, because the cup, unlocks and
   maths state all persist through it, and retrofitting per-slot isolation
   afterwards means touching every one of them again.
4. **Wordless conversion + setup screen** (§6) — replace every string in the
   existing UI, and build the team/mode/maths/opposition rows. Depends on
   phase 3 for the team cards.
5. **`tournament.js` + AI skill** (§13) — parameterise `aiLaunch()` with one
   `skill` value, add crests, the cup row, the star opposition buttons and the
   trophy shelf. Both the cup and the single-match stars depend on the AI
   parameterisation, which is small and could be pulled earlier on its own.
6. **Juice** (§9.3) — shake, hit-stop, trails, slow motion. Independent of
   everything above; large felt improvement for small effort.
7. **Unlocks** (§9.2) — milestones, procedural cosmetics, the filling
   silhouette. Last because it depends on both a working correct-answer count
   and the slot storage from phase 3.

Phases 1–2 deliver the core educational ask and leave the game fully playable.
Phases 3–7 are separable and could each be their own plan if preferred.

## 16. Deferred

Recorded so the reasoning is not lost:

- **Penalty shootout** — rapid-fire questions earning penalty kicks. This
  raises *density* within a session, which §1 identifies as the lesser lever;
  it does little for wanting to return. Easy to add later if more practice per
  sitting is ever wanted.
- **Cup run** — no longer deferred; brought into scope as §13.
- **Speech synthesis** — would let a pre-reader play unaided; declined in
  favour of a silent game.
- **Answer-zone goals and numbered players** — alternative integrations
  considered and rejected: answer zones fire only on goals (≈5 questions a
  match), numbered players allow a 1-in-3 guess and can punish a correct answer
  with poor positioning.
