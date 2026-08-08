'use strict';
// Every flag in the world, grouped so a child can find their own.
//
// The badge grid on the team card has room for a handful of countries and no
// more — it is one screen among several on a card that already runs past the
// bottom of a short phone. So the full set lives here and gets its own screen,
// the way the cup draw and the locker do. This file is only the data and the
// lookups over it; game.js paints the picker.
//
// Grouping is by continent, and the first tab is not a continent at all: it is
// the countries a child actually asks for. Alphabetical order is the one
// ordering a pre-reader cannot use, so it never decides what they see first —
// the star tab opens by default, and inside each continent the well-known
// countries lead before the alphabet takes over. A child who wants Spain or
// Slovakia never has to read, tap a tab, or scroll; the continents are the
// fallback for the long tail, not the price of entry.
//
// Every flag here must also appear in names.js — a flag with no country name
// would fill the team name field with an invented word instead.
//
// Pure: no DOM, no game state.
var Flags = (function () {

  // The tab glyphs are the only navigation, since the game has no words. Three
  // of them are the globe emoji actually turned to that part of the world;
  // Europe and Oceania have no globe of their own, so they get the thing a
  // small child already reads as that place. A child who guesses wrong taps
  // the next tab, which costs nothing.
  //
  // `alpha` is every country of that continent in English alphabetical order —
  // the order that is easy to keep correct. `lead` is the handful pulled to the
  // front of it, which is the order that is easy to USE. The two are merged
  // below, so a country added to `alpha` still appears even if nobody thinks to
  // rank it, and a country in `lead` cannot be lost from its continent.
  var REGIONS = [
    // Europe
    { id: 'eu', icon: '\u{1F3F0}',
      lead: [
      '\u{1F1EA}\u{1F1F8}', '\u{1F1E9}\u{1F1EA}', '\u{1F1EB}\u{1F1F7}', '\u{1F1EE}\u{1F1F9}', '\u{1F1EC}\u{1F1E7}',
      '\u{1F1F5}\u{1F1F9}', '\u{1F1F3}\u{1F1F1}', '\u{1F1F8}\u{1F1F0}', '\u{1F1E8}\u{1F1FF}', '\u{1F1F5}\u{1F1F1}',
      '\u{1F1FA}\u{1F1E6}', '\u{1F1E6}\u{1F1F9}', '\u{1F1ED}\u{1F1FA}', '\u{1F1ED}\u{1F1F7}', '\u{1F1E7}\u{1F1EA}',
      '\u{1F1E8}\u{1F1ED}', '\u{1F1F8}\u{1F1EA}', '\u{1F1F3}\u{1F1F4}', '\u{1F1E9}\u{1F1F0}', '\u{1F1EC}\u{1F1F7}'
      ], alpha: [
      '\u{1F1E6}\u{1F1F1}', '\u{1F1E6}\u{1F1E9}', '\u{1F1E6}\u{1F1F2}', '\u{1F1E6}\u{1F1F9}',
      '\u{1F1E6}\u{1F1FF}', '\u{1F1E7}\u{1F1FE}', '\u{1F1E7}\u{1F1EA}', '\u{1F1E7}\u{1F1E6}',
      '\u{1F1E7}\u{1F1EC}', '\u{1F1ED}\u{1F1F7}', '\u{1F1E8}\u{1F1FE}', '\u{1F1E8}\u{1F1FF}',
      '\u{1F1E9}\u{1F1F0}', '\u{1F1EA}\u{1F1EA}', '\u{1F1EB}\u{1F1EE}', '\u{1F1EB}\u{1F1F7}',
      '\u{1F1EC}\u{1F1EA}', '\u{1F1E9}\u{1F1EA}', '\u{1F1EC}\u{1F1F7}', '\u{1F1ED}\u{1F1FA}',
      '\u{1F1EE}\u{1F1F8}', '\u{1F1EE}\u{1F1EA}', '\u{1F1EE}\u{1F1F9}', '\u{1F1FD}\u{1F1F0}',
      '\u{1F1F1}\u{1F1FB}', '\u{1F1F1}\u{1F1EE}', '\u{1F1F1}\u{1F1F9}', '\u{1F1F1}\u{1F1FA}',
      '\u{1F1F2}\u{1F1F9}', '\u{1F1F2}\u{1F1E9}', '\u{1F1F2}\u{1F1E8}', '\u{1F1F2}\u{1F1EA}',
      '\u{1F1F3}\u{1F1F1}', '\u{1F1F2}\u{1F1F0}', '\u{1F1F3}\u{1F1F4}', '\u{1F1F5}\u{1F1F1}',
      '\u{1F1F5}\u{1F1F9}', '\u{1F1F7}\u{1F1F4}', '\u{1F1F7}\u{1F1FA}', '\u{1F1F8}\u{1F1F2}',
      '\u{1F1F7}\u{1F1F8}', '\u{1F1F8}\u{1F1F0}', '\u{1F1F8}\u{1F1EE}', '\u{1F1EA}\u{1F1F8}',
      '\u{1F1F8}\u{1F1EA}', '\u{1F1E8}\u{1F1ED}', '\u{1F1F9}\u{1F1F7}', '\u{1F1FA}\u{1F1E6}',
      '\u{1F1EC}\u{1F1E7}', '\u{1F1FB}\u{1F1E6}'
    ] },
    // Africa
    { id: 'af', icon: '\u{1F30D}',
      lead: [
      '\u{1F1F2}\u{1F1E6}', '\u{1F1EA}\u{1F1EC}', '\u{1F1F3}\u{1F1EC}', '\u{1F1FF}\u{1F1E6}', '\u{1F1EC}\u{1F1ED}',
      '\u{1F1F8}\u{1F1F3}', '\u{1F1E8}\u{1F1F2}', '\u{1F1E9}\u{1F1FF}', '\u{1F1F9}\u{1F1F3}', '\u{1F1F0}\u{1F1EA}',
      '\u{1F1EA}\u{1F1F9}', '\u{1F1E8}\u{1F1EE}'
      ], alpha: [
      '\u{1F1E9}\u{1F1FF}', '\u{1F1E6}\u{1F1F4}', '\u{1F1E7}\u{1F1EF}', '\u{1F1E7}\u{1F1FC}',
      '\u{1F1E7}\u{1F1EB}', '\u{1F1E7}\u{1F1EE}', '\u{1F1E8}\u{1F1F2}', '\u{1F1E8}\u{1F1FB}',
      '\u{1F1E8}\u{1F1EB}', '\u{1F1F9}\u{1F1E9}', '\u{1F1F0}\u{1F1F2}', '\u{1F1E8}\u{1F1EC}',
      '\u{1F1E8}\u{1F1E9}', '\u{1F1E9}\u{1F1EF}', '\u{1F1EA}\u{1F1EC}', '\u{1F1EC}\u{1F1F6}',
      '\u{1F1EA}\u{1F1F7}', '\u{1F1F8}\u{1F1FF}', '\u{1F1EA}\u{1F1F9}', '\u{1F1EC}\u{1F1E6}',
      '\u{1F1EC}\u{1F1F2}', '\u{1F1EC}\u{1F1ED}', '\u{1F1EC}\u{1F1F3}', '\u{1F1EC}\u{1F1FC}',
      '\u{1F1E8}\u{1F1EE}', '\u{1F1F0}\u{1F1EA}', '\u{1F1F1}\u{1F1F8}', '\u{1F1F1}\u{1F1F7}',
      '\u{1F1F1}\u{1F1FE}', '\u{1F1F2}\u{1F1EC}', '\u{1F1F2}\u{1F1FC}', '\u{1F1F2}\u{1F1F1}',
      '\u{1F1F2}\u{1F1F7}', '\u{1F1F2}\u{1F1FA}', '\u{1F1F2}\u{1F1E6}', '\u{1F1F2}\u{1F1FF}',
      '\u{1F1F3}\u{1F1E6}', '\u{1F1F3}\u{1F1EA}', '\u{1F1F3}\u{1F1EC}', '\u{1F1F7}\u{1F1FC}',
      '\u{1F1F8}\u{1F1F9}', '\u{1F1F8}\u{1F1F3}', '\u{1F1F8}\u{1F1E8}', '\u{1F1F8}\u{1F1F1}',
      '\u{1F1F8}\u{1F1F4}', '\u{1F1FF}\u{1F1E6}', '\u{1F1F8}\u{1F1F8}', '\u{1F1F8}\u{1F1E9}',
      '\u{1F1F9}\u{1F1FF}', '\u{1F1F9}\u{1F1EC}', '\u{1F1F9}\u{1F1F3}', '\u{1F1FA}\u{1F1EC}',
      '\u{1F1FF}\u{1F1F2}', '\u{1F1FF}\u{1F1FC}'
    ] },
    // The Americas
    { id: 'am', icon: '\u{1F30E}',
      lead: [
      '\u{1F1E7}\u{1F1F7}', '\u{1F1E6}\u{1F1F7}', '\u{1F1FA}\u{1F1F8}', '\u{1F1F2}\u{1F1FD}', '\u{1F1E8}\u{1F1E6}',
      '\u{1F1E8}\u{1F1F4}', '\u{1F1E8}\u{1F1F1}', '\u{1F1FA}\u{1F1FE}', '\u{1F1F5}\u{1F1EA}', '\u{1F1EF}\u{1F1F2}'
      ], alpha: [
      '\u{1F1E6}\u{1F1EC}', '\u{1F1E6}\u{1F1F7}', '\u{1F1E7}\u{1F1F8}', '\u{1F1E7}\u{1F1E7}',
      '\u{1F1E7}\u{1F1FF}', '\u{1F1E7}\u{1F1F4}', '\u{1F1E7}\u{1F1F7}', '\u{1F1E8}\u{1F1E6}',
      '\u{1F1E8}\u{1F1F1}', '\u{1F1E8}\u{1F1F4}', '\u{1F1E8}\u{1F1F7}', '\u{1F1E8}\u{1F1FA}',
      '\u{1F1E9}\u{1F1F2}', '\u{1F1E9}\u{1F1F4}', '\u{1F1EA}\u{1F1E8}', '\u{1F1F8}\u{1F1FB}',
      '\u{1F1EC}\u{1F1E9}', '\u{1F1EC}\u{1F1F9}', '\u{1F1EC}\u{1F1FE}', '\u{1F1ED}\u{1F1F9}',
      '\u{1F1ED}\u{1F1F3}', '\u{1F1EF}\u{1F1F2}', '\u{1F1F2}\u{1F1FD}', '\u{1F1F3}\u{1F1EE}',
      '\u{1F1F5}\u{1F1E6}', '\u{1F1F5}\u{1F1FE}', '\u{1F1F5}\u{1F1EA}', '\u{1F1F0}\u{1F1F3}',
      '\u{1F1F1}\u{1F1E8}', '\u{1F1FB}\u{1F1E8}', '\u{1F1F8}\u{1F1F7}', '\u{1F1F9}\u{1F1F9}',
      '\u{1F1FA}\u{1F1F8}', '\u{1F1FA}\u{1F1FE}', '\u{1F1FB}\u{1F1EA}'
    ] },
    // Asia
    { id: 'as', icon: '\u{1F30F}',
      lead: [
      '\u{1F1EF}\u{1F1F5}', '\u{1F1F0}\u{1F1F7}', '\u{1F1E8}\u{1F1F3}', '\u{1F1EE}\u{1F1F3}', '\u{1F1F9}\u{1F1ED}',
      '\u{1F1FB}\u{1F1F3}', '\u{1F1EE}\u{1F1E9}', '\u{1F1F5}\u{1F1ED}', '\u{1F1F8}\u{1F1E6}', '\u{1F1F6}\u{1F1E6}'
      ], alpha: [
      '\u{1F1E6}\u{1F1EB}', '\u{1F1E7}\u{1F1ED}', '\u{1F1E7}\u{1F1E9}', '\u{1F1E7}\u{1F1F9}',
      '\u{1F1E7}\u{1F1F3}', '\u{1F1F0}\u{1F1ED}', '\u{1F1E8}\u{1F1F3}', '\u{1F1EE}\u{1F1F3}',
      '\u{1F1EE}\u{1F1E9}', '\u{1F1EE}\u{1F1F7}', '\u{1F1EE}\u{1F1F6}', '\u{1F1EE}\u{1F1F1}',
      '\u{1F1EF}\u{1F1F5}', '\u{1F1EF}\u{1F1F4}', '\u{1F1F0}\u{1F1FF}', '\u{1F1F0}\u{1F1F7}',
      '\u{1F1F0}\u{1F1FC}', '\u{1F1F0}\u{1F1EC}', '\u{1F1F1}\u{1F1E6}', '\u{1F1F1}\u{1F1E7}',
      '\u{1F1F2}\u{1F1FE}', '\u{1F1F2}\u{1F1FB}', '\u{1F1F2}\u{1F1F3}', '\u{1F1F2}\u{1F1F2}',
      '\u{1F1F3}\u{1F1F5}', '\u{1F1F0}\u{1F1F5}', '\u{1F1F4}\u{1F1F2}', '\u{1F1F5}\u{1F1F0}',
      '\u{1F1F5}\u{1F1F8}', '\u{1F1F5}\u{1F1ED}', '\u{1F1F6}\u{1F1E6}', '\u{1F1F8}\u{1F1E6}',
      '\u{1F1F8}\u{1F1EC}', '\u{1F1F1}\u{1F1F0}', '\u{1F1F8}\u{1F1FE}', '\u{1F1F9}\u{1F1FC}',
      '\u{1F1F9}\u{1F1EF}', '\u{1F1F9}\u{1F1ED}', '\u{1F1F9}\u{1F1F1}', '\u{1F1F9}\u{1F1F2}',
      '\u{1F1E6}\u{1F1EA}', '\u{1F1FA}\u{1F1FF}', '\u{1F1FB}\u{1F1F3}', '\u{1F1FE}\u{1F1EA}'
    ] },
    // Oceania
    { id: 'oc', icon: '\u{1F998}',
      lead: [
      '\u{1F1E6}\u{1F1FA}', '\u{1F1F3}\u{1F1FF}', '\u{1F1EB}\u{1F1EF}', '\u{1F1F5}\u{1F1EC}'
      ], alpha: [
      '\u{1F1E6}\u{1F1FA}', '\u{1F1EB}\u{1F1EF}', '\u{1F1F0}\u{1F1EE}', '\u{1F1F2}\u{1F1ED}',
      '\u{1F1EB}\u{1F1F2}', '\u{1F1F3}\u{1F1F7}', '\u{1F1F3}\u{1F1FF}', '\u{1F1F5}\u{1F1FC}',
      '\u{1F1F5}\u{1F1EC}', '\u{1F1FC}\u{1F1F8}', '\u{1F1F8}\u{1F1E7}', '\u{1F1F9}\u{1F1F4}',
      '\u{1F1F9}\u{1F1FB}', '\u{1F1FB}\u{1F1FA}'
    ] }
  ];

  // Lead first, then whatever the alphabet still has left. Done once, here,
  // rather than at paint time: the picker should not be deciding what order the
  // world is in every time a tab is tapped.
  function order(region) {
    var out = [], i;
    for (i = 0; i < region.lead.length; i++) {
      if (region.alpha.indexOf(region.lead[i]) !== -1) { out.push(region.lead[i]); }
    }
    for (i = 0; i < region.alpha.length; i++) {
      if (out.indexOf(region.alpha[i]) === -1) { out.push(region.alpha[i]); }
    }
    return out;
  }
  (function () {
    for (var i = 0; i < REGIONS.length; i++) { REGIONS[i].flags = order(REGIONS[i]); }
  })();

  // The countries a child actually asks for, in the order they are likely to
  // want them, and short enough to sit on one screen without scrolling.
  //
  // Three things decide the list. The cup's own sixteen opponents are the big
  // football nations and every one of them is here, because a child who has
  // just been knocked out by Brazil wants to BE Brazil. The eleven flags the
  // team card already carried are here too, since that was the last judgement
  // anyone made about what counts as top. And the family playing this is
  // Slovak, so Central Europe leads rather than being buried under the usual
  // Brazil-Germany-Argentina roll-call: Slovakia first, then its neighbours.
  // Spain sits in the opening row because Spain is the country that could not
  // be chosen at all, which is why this screen exists.
  //
  // Every flag here also lives on its continent. That is not duplication to be
  // cleaned up: it is the point. This tab is a shortcut, and a shortcut that
  // removed the country from where it belongs would be a trap.
  var TOP = [
    '\u{1F1F8}\u{1F1F0}', '\u{1F1E8}\u{1F1FF}', '\u{1F1EA}\u{1F1F8}', '\u{1F1F5}\u{1F1F1}', '\u{1F1FA}\u{1F1E6}',
    '\u{1F1E9}\u{1F1EA}', '\u{1F1E6}\u{1F1F9}', '\u{1F1ED}\u{1F1FA}', '\u{1F1EE}\u{1F1F9}', '\u{1F1EB}\u{1F1F7}',
    '\u{1F1EC}\u{1F1E7}', '\u{1F1F5}\u{1F1F9}', '\u{1F1F3}\u{1F1F1}', '\u{1F1E7}\u{1F1EA}', '\u{1F1ED}\u{1F1F7}',
    '\u{1F1E7}\u{1F1F7}', '\u{1F1E6}\u{1F1F7}', '\u{1F1FA}\u{1F1F8}', '\u{1F1F2}\u{1F1FD}', '\u{1F1E8}\u{1F1E6}',
    '\u{1F1EF}\u{1F1F5}', '\u{1F1F0}\u{1F1F7}', '\u{1F1E8}\u{1F1F3}', '\u{1F1EE}\u{1F1F3}', '\u{1F1E6}\u{1F1FA}',
    '\u{1F1F2}\u{1F1E6}', '\u{1F1EA}\u{1F1EC}', '\u{1F1F3}\u{1F1EC}', '\u{1F1FF}\u{1F1E6}', '\u{1F1E8}\u{1F1ED}'
  ];

  // What the picker paints: the star first, then the world. The star is not a
  // place, so it does not get a place's glyph — a child can see at a glance
  // that the first tab is a different kind of thing from the five after it.
  // `star`, not `lead`: the continents already carry a `lead` list, and a flag
  // named the same as a list is exactly the sort of thing that quietly marks
  // every tab as the star.
  var TABS = [{ id: 'top', icon: '⭐', star: true, flags: TOP }]
             .concat(REGIONS);

  // The countries kept on the team card itself, so the common case never needs
  // the picker at all. Eleven, not twelve: the twelfth tile in that row is the
  // door into this screen, and the card must not grow by a single row.
  //
  // Which eleven is not a matter of taste. The cup's draw already says who the
  // great sides are in this game's own fiction — they are the ones waiting for
  // you on the way to the final — so the card carries the best-seeded of them,
  // in seed order, and a child can choose to BE any team they would otherwise
  // have to beat. Eleven of them, which is also a team.
  //
  // These must stay a subset of Tournament.BY_SEED; the tests hold that line.
  // Everything not on the card, Slovakia and its neighbours included, is one
  // tap away behind the globe — and they open the star tab of the picker.
  var QUICK = [
    '\u{1F1E7}\u{1F1F7}', '\u{1F1E6}\u{1F1F7}', '\u{1F1EA}\u{1F1F8}', '\u{1F1E9}\u{1F1EA}',
    '\u{1F1EC}\u{1F1E7}', '\u{1F1F3}\u{1F1F1}', '\u{1F1F5}\u{1F1F9}', '\u{1F1E7}\u{1F1EA}',
    '\u{1F1ED}\u{1F1F7}', '\u{1F1EE}\u{1F1F9}', '\u{1F1F2}\u{1F1E6}'
  ];

  // Which continent a flag belongs to. The world is partitioned by REGIONS, so
  // this is the one true answer; the star tab is a view over it, not a place.
  function regionOf(flag) {
    for (var i = 0; i < REGIONS.length; i++) {
      if (REGIONS[i].flags.indexOf(flag) !== -1) { return i; }
    }
    return -1;
  }

  // Which tab the picker should open on. The star, always, unless the child is
  // already wearing something it does not hold — then the continent that does,
  // so their own flag is under their thumb rather than somewhere behind a tab.
  function tabOf(flag) {
    if (TOP.indexOf(flag) !== -1) { return 0; }
    var at = regionOf(flag);
    return at === -1 ? 0 : at + 1;
  }

  function isFlag(badge) { return regionOf(badge) !== -1; }

  function all() {
    var out = [], i;
    for (i = 0; i < REGIONS.length; i++) {
      out = out.concat(REGIONS[i].flags);
    }
    return out;
  }

  return { REGIONS: REGIONS, TABS: TABS, TOP: TOP, QUICK: QUICK,
           regionOf: regionOf, tabOf: tabOf, isFlag: isFlag, all: all };
})();

if (typeof module !== 'undefined') { module.exports = Flags; }
