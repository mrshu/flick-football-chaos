'use strict';
// Every flag in the world, grouped so a child can find their own.
//
// The badge grid on the team card has room for a handful of countries and no
// more — it is one screen among several on a card that already runs past the
// bottom of a short phone. So the full set lives here and gets its own screen,
// the way the cup draw and the locker do. This file is only the data and the
// lookups over it; game.js paints the picker.
//
// Grouping is by continent, and within a continent the order is by the English
// name. The child cannot read either, which is the point of the grouping: five
// tabs of thirty-odd flags each is a small enough haystack that recognising
// your own flag by its colours works, where one wall of two hundred does not.
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
  var REGIONS = [
    // Europe
    { id: 'eu', icon: '\u{1F3F0}', flags: [
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
    { id: 'af', icon: '\u{1F30D}', flags: [
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
    { id: 'am', icon: '\u{1F30E}', flags: [
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
    { id: 'as', icon: '\u{1F30F}', flags: [
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
    { id: 'oc', icon: '\u{1F998}', flags: [
      '\u{1F1E6}\u{1F1FA}', '\u{1F1EB}\u{1F1EF}', '\u{1F1F0}\u{1F1EE}', '\u{1F1F2}\u{1F1ED}',
      '\u{1F1EB}\u{1F1F2}', '\u{1F1F3}\u{1F1F7}', '\u{1F1F3}\u{1F1FF}', '\u{1F1F5}\u{1F1FC}',
      '\u{1F1F5}\u{1F1EC}', '\u{1F1FC}\u{1F1F8}', '\u{1F1F8}\u{1F1E7}', '\u{1F1F9}\u{1F1F4}',
      '\u{1F1F9}\u{1F1FB}', '\u{1F1FB}\u{1F1FA}'
    ] }
  ];

  // The countries kept on the team card itself, so the common case never needs
  // the picker at all. Eleven, not twelve: the twelfth tile in that row is the
  // door into this screen, and the card must not grow by a single row.
  var QUICK = [
    '\u{1F1EC}\u{1F1E7}', '\u{1F1FA}\u{1F1F8}', '\u{1F1E9}\u{1F1EA}', '\u{1F1EE}\u{1F1F9}',
    '\u{1F1F5}\u{1F1F9}', '\u{1F1E6}\u{1F1F7}', '\u{1F1F2}\u{1F1FD}', '\u{1F1F5}\u{1F1F1}',
    '\u{1F1E8}\u{1F1FF}', '\u{1F1F8}\u{1F1F0}', '\u{1F1FA}\u{1F1E6}'
  ];

  // Which tab a flag lives on, so the picker can open where the child's own
  // country already is rather than always on Europe.
  function regionOf(flag) {
    for (var i = 0; i < REGIONS.length; i++) {
      if (REGIONS[i].flags.indexOf(flag) !== -1) { return i; }
    }
    return -1;
  }

  function isFlag(badge) { return regionOf(badge) !== -1; }

  function all() {
    var out = [], i;
    for (i = 0; i < REGIONS.length; i++) {
      out = out.concat(REGIONS[i].flags);
    }
    return out;
  }

  return { REGIONS: REGIONS, QUICK: QUICK,
           regionOf: regionOf, isFlag: isFlag, all: all };
})();

if (typeof module !== 'undefined') { module.exports = Flags; }
