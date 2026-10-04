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
// The countries themselves come from names.js, which is why a flag can never
// be here without a country name to fill the team name field with.
//
// Pure: no DOM, no game state.
// names.js loads first, on every page and in the tests: the country list is
// this file's source of truth for which flags exist and in what order.
var Names = (typeof Names !== 'undefined') ? Names : require('./names.js');
// tournament.js owns the seeding, which is what decides the shortcut row.
var Tournament = (typeof Tournament !== 'undefined') ? Tournament : require('./tournament.js');

var Flags = (function () {

  // The tab glyphs are the only navigation, since the game has no words. Three
  // of them are the globe emoji actually turned to that part of the world;
  // Europe and Oceania have no globe of their own, so they get the thing a
  // small child already reads as that place. A child who guesses wrong taps
  // the next tab, which costs nothing.
  //
  // Each continent's countries are not listed here. names.js already holds all
  // 197 of them, grouped by continent and alphabetical within each — the order
  // that is easy to keep correct — and a second copy of that list is a second
  // thing to keep in step. So a region names only `from`, the first country of
  // its stretch, and takes the rest of the stretch from names.js.
  //
  // `lead` is the handful pulled to the front of that stretch, which is the
  // order that is easy to USE. The two are merged below, so a country added to
  // names.js still appears even if nobody thinks to rank it, and a country in
  // `lead` cannot be lost from its continent.
  var REGIONS = [
    // Europe
    { id: 'eu', icon: '\u{1F3F0}', from: '\u{1F1E6}\u{1F1F1}',   // Albania
      lead: [
      '\u{1F1EA}\u{1F1F8}', '\u{1F1E9}\u{1F1EA}', '\u{1F1EB}\u{1F1F7}', '\u{1F1EE}\u{1F1F9}', '\u{1F1EC}\u{1F1E7}',
      '\u{1F1F5}\u{1F1F9}', '\u{1F1F3}\u{1F1F1}', '\u{1F1F8}\u{1F1F0}', '\u{1F1E8}\u{1F1FF}', '\u{1F1F5}\u{1F1F1}',
      '\u{1F1FA}\u{1F1E6}', '\u{1F1E6}\u{1F1F9}', '\u{1F1ED}\u{1F1FA}', '\u{1F1ED}\u{1F1F7}', '\u{1F1E7}\u{1F1EA}',
      '\u{1F1E8}\u{1F1ED}', '\u{1F1F8}\u{1F1EA}', '\u{1F1F3}\u{1F1F4}', '\u{1F1E9}\u{1F1F0}', '\u{1F1EC}\u{1F1F7}'
      ] },
    // Africa
    { id: 'af', icon: '\u{1F30D}', from: '\u{1F1E9}\u{1F1FF}',   // Algeria
      lead: [
      '\u{1F1F2}\u{1F1E6}', '\u{1F1EA}\u{1F1EC}', '\u{1F1F3}\u{1F1EC}', '\u{1F1FF}\u{1F1E6}', '\u{1F1EC}\u{1F1ED}',
      '\u{1F1F8}\u{1F1F3}', '\u{1F1E8}\u{1F1F2}', '\u{1F1E9}\u{1F1FF}', '\u{1F1F9}\u{1F1F3}', '\u{1F1F0}\u{1F1EA}',
      '\u{1F1EA}\u{1F1F9}', '\u{1F1E8}\u{1F1EE}'
      ] },
    // The Americas
    { id: 'am', icon: '\u{1F30E}', from: '\u{1F1E6}\u{1F1EC}',   // Antigua
      lead: [
      '\u{1F1E7}\u{1F1F7}', '\u{1F1E6}\u{1F1F7}', '\u{1F1FA}\u{1F1F8}', '\u{1F1F2}\u{1F1FD}', '\u{1F1E8}\u{1F1E6}',
      '\u{1F1E8}\u{1F1F4}', '\u{1F1E8}\u{1F1F1}', '\u{1F1FA}\u{1F1FE}', '\u{1F1F5}\u{1F1EA}', '\u{1F1EF}\u{1F1F2}'
      ] },
    // Asia
    { id: 'as', icon: '\u{1F30F}', from: '\u{1F1E6}\u{1F1EB}',   // Afghanistan
      lead: [
      '\u{1F1EF}\u{1F1F5}', '\u{1F1F0}\u{1F1F7}', '\u{1F1E8}\u{1F1F3}', '\u{1F1EE}\u{1F1F3}', '\u{1F1F9}\u{1F1ED}',
      '\u{1F1FB}\u{1F1F3}', '\u{1F1EE}\u{1F1E9}', '\u{1F1F5}\u{1F1ED}', '\u{1F1F8}\u{1F1E6}', '\u{1F1F6}\u{1F1E6}'
      ] },
    // Oceania
    { id: 'oc', icon: '\u{1F998}', from: '\u{1F1E6}\u{1F1FA}',   // Australia
      lead: [
      '\u{1F1E6}\u{1F1FA}', '\u{1F1F3}\u{1F1FF}', '\u{1F1EB}\u{1F1EF}', '\u{1F1F5}\u{1F1EC}'
      ] }
  ];

  // Each region's stretch of names.js, then its flags: lead first, then
  // whatever the alphabet still has left. Done once, here, rather than at paint
  // time: the picker should not be deciding what order the world is in every
  // time a tab is tapped.
  (function () {
    var world = Object.keys(Names.COUNTRIES), i, j, r, start, end, out;
    for (i = 0; i < REGIONS.length; i++) {
      r = REGIONS[i];
      start = world.indexOf(r.from);
      end = (i + 1 < REGIONS.length) ? world.indexOf(REGIONS[i + 1].from) : world.length;
      r.alpha = world.slice(start, end);
      out = r.lead.slice();
      for (j = 0; j < r.alpha.length; j++) {
        if (out.indexOf(r.alpha[j]) === -1) { out.push(r.alpha[j]); }
      }
      r.flags = out;
    }
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
  // Read out of the draw rather than listed beside it, so "the best-seeded
  // sides" cannot quietly stop being true. Everything not on the card,
  // Slovakia and its neighbours included, is one tap away behind the globe —
  // and they open the star tab of the picker.
  var QUICK = Object.keys(Tournament.BY_SEED)
    .map(Number).sort(function (a, b) { return a - b; })
    .slice(0, 11)
    .map(function (seed) { return Tournament.BY_SEED[seed]; });

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
