# ⚽ Flick Football Chaos

A turn-based flick-football game that teaches maths from age 5 to 16+ by
making the maths worth doing.

**[▶ Play it](https://mrshu.github.io/flick-football-chaos/)** — no install, no
account, works on a phone.

<p align="center">
  <img src="docs/img/06-pitch.jpg" width="320" alt="The pitch: drag a blue player back and release to flick">
  <img src="docs/img/05-quiz.jpg" width="320" alt="A question offering a bonus before the shot">
</p>

---

## The idea

Most educational games are a quiz with a game bolted on: answer ten questions,
then you may play. A child learns very quickly that the game is the reward and
the maths is the toll.

Here the maths *is* a move. Before some turns you are offered a question, and
getting it right hands you something you actually wanted a second ago — an
extra flick, a shooting guide, or a goalkeeper who dives the right way. You can
always skip it.
The pitch does not wait for you to be good at arithmetic; it just plays better
when you are.

Two rules follow from that, and most of the design falls out of them:

- **A wrong answer never costs a turn.** It costs the bonus, nothing else.
  Being wrong has to be survivable or a child stops guessing, and a child who
  stops guessing stops learning.
- **Questions are occasional.** Roughly one turn in three, and only when you
  are in the attacking half with something to gain. Asked every turn, they stop
  being an opportunity and become a toll again.

---

## Playing

**Drag a blue player back and release** — like a catapult. Further back is
harder. First to three goals wins.

<img src="docs/img/06-pitch.jpg" width="360" align="right" alt="Aiming a shot">

- Your **goalkeeper** (teal) is a player like any other. You can flick it
  upfield as a clearance — at the real cost of leaving your goal empty.
- The **opposing keeper** holds still while you aim, then dives once you have
  flicked, at where it reads the ball going. It reads imperfectly, and how
  quickly and accurately it reacts improves through the cup.
- Beating it is about **placement and timing**. Move closer and hit a quick
  corner shot to outrun a strong keeper; even the final's reading is imperfect.
- In the **no-maths arcade mode**, occasional chaos makes the pitch slippery,
  the ball bigger, players smaller, or shots more powerful. These effects last
  one turn and can affect either team.

### Shot feedback

After your flick settles, a brief touchline note explains what happened:
missed ball contact, a player hitting a defender, a ball off the post or
wall, or a keeper stopping, deflecting or slowing an on-target shot.
A keeper brush is described as a touch, rather than claiming a save.
Useful advances are acknowledged too. A short aiming tip appears where
helpful; repeating the same outcome does not repeat its advice.

Feedback uses real collision evidence, never the CPU's planning previews.
It does not interrupt play, and goals take precedence over the note.

### Earned bonuses

With maths on, a correct answer earns a football advantage. The offer shows
its name, a small pitch picture, and what it will do before you answer.

| Bonus | What you get |
| --- | --- |
| Keeper feint | The opposing keeper will not dive during your next flick. It still blocks a shot aimed straight at it. |
| Second chance | One extra flick before the CPU responds, from where the first flick left the pieces. No extra question; either side's goal ends it. |
| Coaching line | While aiming, see the first contact and the ball's initial direction, stopping at the next obstacle. It does not predict rebounds or a moving keeper. |
| Run into space | Drag a blue outfield player within its highlighted circle to reposition it, then take your normal flick. You can also tap a player then a destination, or skip setup. Bodies and posts block the run. |
| Tiny defenders | Red outfield players shrink for your flick. Your players and both keepers stay their normal size. Defenders regain their size in nearby free space without shoving your pieces. |
| Big striker | A blue striker with room to grow gets bigger, making ball contact easier. Selecting a different blue outfield player transfers the growth if it fits; keepers stay normal. |

Offers avoid immediate repeats and omit situational powers when there is no
eligible defender, striker, keeper or setup space. A wrong answer or skip still
gives you your ordinary flick. Save questions occasionally offer a keeper dive
when an actual CPU shot is predicted to score; other threats play normally.

The first two player turns are football only. Bonus and save offers share a
cooldown: at least two clear player turns between questions, or four after
you choose **Keep playing**. Eligible attacks and saves do not always ask.
The smaller question card keeps its answers readable without a pulsing reward.

### Streak powers

Correct answers in a row also earn powers for **three of your flicks**:

| Correct-answer streak | Lasting power |
| --- | --- |
| 3 | Coaching line |
| 5 | Big striker |
| 8 | Tiny defenders |

The footballs beside your streak fill toward the next reward, and earned-power
badges show the flicks remaining. Milestones repeat: six correct refreshes
Coaching line, ten refreshes Big striker, and so on. A refresh restores three
uses rather than stacking an unlimited advantage.

Both bonus and save answers count. Wrong answers break the streak but keep
earned powers; skipping preserves both. Powers carry across goals, matches and
reloads for that team. They combine with ordinary bonuses and only spend uses
on actual human flicks, including an earned extra flick. Big striker keeps its
use if your selected player cannot grow or is the keeper. No-maths mode keeps
the saved powers for later.

<br clear="right">

---

## The maths

<img src="docs/img/05-quiz.jpg" width="300" align="right" alt="One half of 28">

Questions are drawn from **eleven bands**, ages 5 to 16+:

| Band | Roughly | What it asks |
|-----:|:--------|:-------------|
| 1 | 5 | counting to 5, number bonds to 5 |
| 2 | 6 | adding and subtracting within 10 and 20 |
| 3 | 7 | within 20, doubles, sequences |
| 4 | 8 | multiplication, within 100, halves |
| 5 | 9 | times tables, division, fractions of a number |
| 6 | 10 | within 1000, decimals, comparing fractions |
| 7 | 11 | percentages, order of operations, ratio |
| 8 | 12 | negatives, squares, roots, simple equations |
| 9 | 13 | two-step equations, expanding, angles, sequences |
| 10 | 14–15 | simultaneous equations, Pythagoras, quadratic sequences |
| 11 | 16+ | index laws, inequalities, geometric sequences, areas |

You pick a starting band once, when you make a team. After that the game moves
you.

<br clear="right">

### How it adapts

The difficulty is a continuous number, not a level. Every answer nudges it:

- **Right, and quick** → up a lot. A child who is fast *and* correct is bored,
  and the fix for bored is not more of the same.
- **Right, but slow** → up a little.
- **Wrong** → down four times as far as a single right answer moves you up.

Those steps are chosen so the random walk settles where you are **right about
80% of the time** — high enough to feel good, low enough to be learning. A
child who is suddenly flying can climb more than a whole year's band in a few
questions; one who is struggling drops back within a few.

At the very bottom the game runs out of easier questions, so it gives ground a
different way: the number of answer choices falls from four to three to two.
Being right stays possible.

At the top the same lever runs the other way. From band 9 the choices rise
to five, then six at band 11 — not because the numbers need it, but because a
learner who has reached simultaneous equations or index laws deserves a
format where a lucky guess buys less. The 80% the difficulty curve is aiming
for should mean something.

---

## The cup

<p align="center">
  <img src="docs/img/04-bracket.jpg" width="440" alt="A sixteen-team knockout bracket">
</p>

A real sixteen-team knockout, drawn in full. You take the seed-2 line; every
other match is settled by seed, which is not a shortcut — it is what makes your
four opponents rise in strength in step with the difficulty curve, with the top
seed waiting in the final. Rounds you have not reached stay undecided, because
in a real knockout they have not been played yet either.

Opponents get stronger on the pitch as well: for a younger team's first season,
an opening opponent tries one imperfect flick, while a final opponent compares
up to eighteen plausible shots and chooses a scoring opportunity or useful
field position. Keepers react sooner,
move faster and read shots more accurately each round. Older teams start with
stronger opponents; later seasons add challenge, capped at eighteen shot
candidates with keepers that can still be beaten. Cup progress and the team's
home age band choose the opponent's visible football level; maths keeps
adapting to answers.

Football difficulty runs from Level 0 Practice to Level 10 Elite. Every step
improves aiming and keeper reactions, with intermediate levels between the
existing tuned profiles. A younger team's first cup climbs through Levels
2, 5, 8 and 10. Older teams and later cups start higher, while all four rounds
still increase in difficulty and cap at Level 10. The draw, introduction,
scoreboard and result show your rival's fictional captain, flag and level.

Rivals also have a stable football style, introduced before kickoff and
shown beside their level during play:

| Style | What changes on the pitch |
| --- | --- |
| Direct attacker | Looks for a shot into the open corner and values goal proximity. |
| Space builder | Tries softer diagonal advances to change the shooting lane, alongside direct finishes. |
| Bank-shot specialist | Tries side-wall rebounds and direct shots, favoring useful flank setups when neither scores. |

Styles change decisions while keeping the chosen level's aim, launch limit,
keeper settings and shot-search budget. Every candidate uses ordinary
physics; a genuine goal is preferred to a setup move. The same captain
keeps their style across friendlies, cup rounds and reloads.

For a single match, choose any level from 0 to 10 with the slider or step buttons.
The same level uses the same aim and keeper settings, independently of age,
maths and cup progress; the rival's style determines its tactical choices.
Level 0 has loose aim and a slow keeper for practice;
even Level 10 has imperfect aiming and finite keeper speed.

The local "Finding an opponent" introduction cycles through rival badges,
slows down, then reveals your opponent with a crest entrance and short fanfare.
"Reveal now" jumps ahead; the match always waits for "Kick off". Reduced-motion
settings use a shorter, still reveal. Friendly matches leave the cup intact.

Losing a round replays it. It never eliminates you: a child losing the final
should not lose the tournament.

---

## Teams

<p align="center">
  <img src="docs/img/01-modes.jpg" width="320" alt="One match or tournament">
  <img src="docs/img/02-teams.jpg" width="320" alt="Three save slots">
</p>

Three save slots, so siblings can share a tablet without dragging each other's
difficulty around — the adaptive state is per slot, and an average of two
children describes neither.

<img src="docs/img/03-editor.jpg" width="300" align="right" alt="Picking a badge, a name and an age">

Each team gets a badge, a name and an age. The name is filled in for you: pick
a flag and you are that country, pick anything else and you get an invented
name built from syllables. A dice rerolls it, and once you type your own it
stops being overwritten.

The age also sets the starting band and, from 13 up, swaps the bright
playroom look for a restrained "pro" skin — squarer panels, dark broadcast
colours, calmer motion. Nothing moves or resizes; it is the same markup in
darker, straighter clothes, because a 16 year old should not have to play on
a screen built to delight a 6 year old.

Everything lives in `localStorage`, and every read is repaired on the way in —
a corrupt save yields a fresh slot rather than a broken game.

<br clear="right">

<p align="center">
  <img src="docs/img/07-stats.jpg" width="380" alt="Time played, matches, goals, questions answered">
</p>

---

## Running it

There is no build step. Clone it and open `index.html`.

```sh
git clone https://github.com/mrshu/flick-football-chaos.git
cd flick-football-chaos
open index.html          # or: python3 -m http.server 8000
```

Run the tests with Node — no framework, no dependencies:

```sh
node test.js             # 50,504 checks, including styles and shot feedback
```

The suite is deliberately small for what it covers. It has been checked by
mutation testing: breaking a constant or flipping a comparison in the maths
engine makes it fail. A test that cannot fail is not a test.

### Maths lab

Open `maths-lab.html` to see what `maths.js` actually produces. The tests prove
the generators are correct; this is for judging whether the questions are any
good — which is not something an assertion can tell you.

<p align="center">
  <img src="docs/img/08-maths-lab.jpg" width="560" alt="Sample questions per band, and the adaptive engine settling six learners near 80%">
</p>

It renders questions with the game's own renderer, so a question here looks
exactly like a question in a match, and it runs the adaptive engine against the
same synthetic learner `test.js` asserts against — so the lab and the suite
cannot quietly disagree.

---

## How it is put together

```
index.html      markup for every screen
style.css       all of it
game.js         the game: physics, turns, AI, rendering, screens
maths.js        question generators and the adaptive engine   (pure)
tournament.js   the sixteen-team draw and its resolution      (pure)
formation.js    kickoff layouts, keeper geometry, AI aiming   (pure)
opponents.js    rival styles, shot intents and setup choices  (pure)
shot-feedback.js real contact evidence and flick outcomes     (pure)
bonuses.js      reward descriptions, contact guides, setup moves (pure)
names.js        invented team names, and every country name   (pure)
flags.js        the picker: continents sliced out of names.js  (pure)
store.js        localStorage, per slot, with repair           (pure-ish)
quiz.js         the question panel
test.js         the whole suite, including the two bonus test files
```

The modules marked pure have no DOM, no game state, and no randomness of their
own — the caller passes a random function in. That is what makes them testable
against a fixed seed, and it is why the tests can simulate four thousand
questions and assert where a learner ends up. The synthetic learner they do it
with lives in `maths.js` and the maths lab runs the same one, so the lab and
the suite cannot quietly disagree about what a child is.

Where a module does touch a browser — `store.js` reaching for `localStorage`,
`quiz.js` for `document` — the suite stubs the handful of calls it makes, so
loading a corrupt save and drawing a question are both tested rather than
taken on trust.

A few constraints that shaped the code:

- **No frameworks, no build, no dependencies.** It has to keep working in five
  years with nothing installed.
- **No ES modules.** They cannot load over `file://`, and opening the file has
  to work.
- **No image or audio assets.** Everything is drawn on a canvas, styled in CSS,
  or is an emoji. Nothing to fetch, nothing to break.
- **As little language as possible.** The controls carry icons first and words
  second; the questions themselves are symbols and numbers, so the maths does
  not need reading. The interface text is English for now.
