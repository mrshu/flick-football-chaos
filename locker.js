'use strict';
// The locker: which cosmetics a slot has earned, and which comes next.
//
// Everything is computed from the slot's counters (stats.correct, trophies)
// every time it is asked, never from a stored list — so the ledger cannot
// drift out of step with the record, and a hand-edited or partial save simply
// re-derives the truth. The slot's `unlocked` array is not the ledger: it is
// the list of unlocks the child has already been *shown*, so a reveal fires
// exactly once per item (see `fresh`).
//
// The milestone table is deliberately front-loaded: a reward inside the first
// match or two establishes that playing yields things. Nothing here ever
// expires or is taken away.
var Locker = (function () {

  // The full catalogue, in display order within each kind.
  //   at:  cumulative correct answers required (0 = unlocked from the start)
  //   cup: trophies required instead — the beach ball is the one cosmetic
  //        that a cup buys, so the trophy shelf is worth something too.
  var ITEMS = [
    { id: 'classic', kind: 'ball',  at: 0 },
    { id: 'stripes', kind: 'ball',  at: 10 },
    { id: 'stars',   kind: 'ball',  at: 100 },
    { id: 'flames',  kind: 'ball',  at: 400 },
    { id: 'beach',   kind: 'ball',  at: 0, cup: 1 },
    { id: 'gold',    kind: 'ball',  at: 1000 },
    { id: 'none',    kind: 'hat',   at: 0 },
    { id: 'cap',     kind: 'hat',   at: 25 },
    { id: 'crown',   kind: 'hat',   at: 175 },
    { id: 'party',   kind: 'hat',   at: 550 },
    { id: 'day',     kind: 'pitch', at: 0 },
    { id: 'night',   kind: 'pitch', at: 50 },
    { id: 'snow',    kind: 'pitch', at: 275 },
    { id: 'space',   kind: 'pitch', at: 750 }
  ];

  // The spec's milestone table: every correct-answer unlock in the order it
  // arrives. The catalogue above is grouped by kind for display; this is the
  // same items in earning order, which is what a progress widget reads.
  var MILESTONES = ITEMS.filter(function (it) { return it.at > 0 && !it.cup; })
                        .sort(function (a, b) { return a.at - b.at; });

  function byId(id) {
    for (var i = 0; i < ITEMS.length; i++) {
      if (ITEMS[i].id === id) { return ITEMS[i]; }
    }
    return null;
  }

  function has(item, slot) {
    if (item.cup) { return (slot.trophies || 0) >= item.cup; }
    return (slot.stats.correct || 0) >= item.at;
  }

  // Every id this slot has earned, defaults included.
  function earned(slot) {
    return ITEMS.filter(function (it) { return has(it, slot); })
                .map(function (it) { return it.id; });
  }

  // The next correct-answer milestone, with the previous one so a caller can
  // draw the filling silhouette: fraction = (correct - prev) / (at - prev).
  // Null once gold is earned; the cup-bought beach ball never appears here,
  // because "answer more questions" is not how it is won.
  function next(slot) {
    var prev = 0, i;
    for (i = 0; i < MILESTONES.length; i++) {
      if (!has(MILESTONES[i], slot)) {
        return { id: MILESTONES[i].id, kind: MILESTONES[i].kind,
                 at: MILESTONES[i].at, prev: prev };
      }
      prev = MILESTONES[i].at;
    }
    return null;
  }

  // Earned but not yet shown: what the full-time card should reveal, in
  // milestone order. Defaults never announce themselves. Consuming these is
  // the caller's job — append them to slot.unlocked and persist.
  function fresh(slot) {
    var seenAlready = slot.unlocked || [];
    return ITEMS.filter(function (it) {
      return (it.at > 0 || it.cup) && has(it, slot) &&
             seenAlready.indexOf(it.id) === -1;
    }).sort(function (a, b) { return (a.cup ? 0 : a.at) - (b.cup ? 0 : b.at); })
      .map(function (it) { return it.id; });
  }

  return { ITEMS: ITEMS, MILESTONES: MILESTONES,
           byId: byId, earned: earned, next: next, fresh: fresh };
})();

if (typeof module !== 'undefined') { module.exports = Locker; }
