'use strict';
// Invented team names, built from syllables rather than drawn from a word list.
//
// A word list would have to be a language, and the game deliberately is not in
// one. These are nonsense in every language equally: pronounceable, short
// enough for the field's 12-character limit, and never a real word that could
// mean something unfortunate somewhere.
//
// Pure: the caller supplies the randomness, so the tests can pin it.
var Names = (function () {

  var ONSET = ['B', 'D', 'F', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'Z'];
  var VOWEL = ['a', 'e', 'i', 'o', 'u'];
  var CODA  = ['n', 'r', 'l', 's', 'k', 'm'];

  function pick(list, rand) { return list[Math.floor(rand() * list.length)]; }

  function make(rand) {
    var name = pick(ONSET, rand) + pick(VOWEL, rand) +
               pick(ONSET, rand).toLowerCase() + pick(VOWEL, rand);
    // A closing consonant about half the time, so the names are not all the
    // same shape.
    if (rand() < 0.5) { name += pick(CODA, rand); }
    return name;
  }

  // A flag badge already names itself, so picking one fills the country in
  // rather than inventing a word next to it. Every flag used anywhere in the
  // game belongs here — the badge grid and the cup draw both draw on it.
  var COUNTRIES = {
    '\u{1F1EC}\u{1F1E7}': 'England',   '\u{1F1FA}\u{1F1F8}': 'USA',
    '\u{1F1E9}\u{1F1EA}': 'Germany',   '\u{1F1EE}\u{1F1F9}': 'Italy',
    '\u{1F1F5}\u{1F1F9}': 'Portugal',  '\u{1F1E6}\u{1F1F7}': 'Argentina',
    '\u{1F1F2}\u{1F1FD}': 'Mexico',    '\u{1F1F0}\u{1F1F7}': 'Korea',
    '\u{1F1F5}\u{1F1F1}': 'Poland',    '\u{1F1E8}\u{1F1FF}': 'Czechia',
    '\u{1F1F8}\u{1F1F0}': 'Slovakia',  '\u{1F1FA}\u{1F1E6}': 'Ukraine',
    '\u{1F1E7}\u{1F1F7}': 'Brazil',    '\u{1F1EB}\u{1F1F7}': 'France',
    '\u{1F1EA}\u{1F1F8}': 'Spain',     '\u{1F1F3}\u{1F1F1}': 'Netherlands',
    '\u{1F1EF}\u{1F1F5}': 'Japan',     '\u{1F1E7}\u{1F1EA}': 'Belgium',
    '\u{1F1ED}\u{1F1F7}': 'Croatia',   '\u{1F1F2}\u{1F1E6}': 'Morocco'
  };

  function country(badge) { return COUNTRIES[badge] || ''; }

  // What a freshly picked badge should be called: its country if it is a flag,
  // otherwise something invented.
  function forBadge(badge, rand) { return country(badge) || make(rand); }

  return {
    make: make, country: country, forBadge: forBadge,
    COUNTRIES: COUNTRIES, ONSET: ONSET, VOWEL: VOWEL, CODA: CODA
  };
})();

if (typeof module !== 'undefined') { module.exports = Names; }
