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
  // rather than inventing a word next to it. Every flag the game can show
  // belongs here — the badge grid, the flag picker and the cup draw all draw
  // on it, and a flag missing from this table would fall through to `make`
  // and hand the child a nonsense word instead of their own country.
  //
  // Short forms throughout: the name field stops at 12 characters, so anything
  // longer is cut to the form a child would still recognise (Liechtenst.,
  // N. Macedonia, Dominican R.). Same order and grouping as flags.js.
  var COUNTRIES = {
    // Europe
    '\u{1F1E6}\u{1F1F1}': 'Albania', '\u{1F1E6}\u{1F1E9}': 'Andorra',
    '\u{1F1E6}\u{1F1F2}': 'Armenia', '\u{1F1E6}\u{1F1F9}': 'Austria',
    '\u{1F1E6}\u{1F1FF}': 'Azerbaijan', '\u{1F1E7}\u{1F1FE}': 'Belarus',
    '\u{1F1E7}\u{1F1EA}': 'Belgium', '\u{1F1E7}\u{1F1E6}': 'Bosnia',
    '\u{1F1E7}\u{1F1EC}': 'Bulgaria', '\u{1F1ED}\u{1F1F7}': 'Croatia',
    '\u{1F1E8}\u{1F1FE}': 'Cyprus', '\u{1F1E8}\u{1F1FF}': 'Czechia',
    '\u{1F1E9}\u{1F1F0}': 'Denmark', '\u{1F1EA}\u{1F1EA}': 'Estonia',
    '\u{1F1EB}\u{1F1EE}': 'Finland', '\u{1F1EB}\u{1F1F7}': 'France',
    '\u{1F1EC}\u{1F1EA}': 'Georgia', '\u{1F1E9}\u{1F1EA}': 'Germany',
    '\u{1F1EC}\u{1F1F7}': 'Greece', '\u{1F1ED}\u{1F1FA}': 'Hungary',
    '\u{1F1EE}\u{1F1F8}': 'Iceland', '\u{1F1EE}\u{1F1EA}': 'Ireland',
    '\u{1F1EE}\u{1F1F9}': 'Italy', '\u{1F1FD}\u{1F1F0}': 'Kosovo',
    '\u{1F1F1}\u{1F1FB}': 'Latvia', '\u{1F1F1}\u{1F1EE}': 'Liechtenst.',
    '\u{1F1F1}\u{1F1F9}': 'Lithuania', '\u{1F1F1}\u{1F1FA}': 'Luxembourg',
    '\u{1F1F2}\u{1F1F9}': 'Malta', '\u{1F1F2}\u{1F1E9}': 'Moldova',
    '\u{1F1F2}\u{1F1E8}': 'Monaco', '\u{1F1F2}\u{1F1EA}': 'Montenegro',
    '\u{1F1F3}\u{1F1F1}': 'Netherlands', '\u{1F1F2}\u{1F1F0}': 'N. Macedonia',
    '\u{1F1F3}\u{1F1F4}': 'Norway', '\u{1F1F5}\u{1F1F1}': 'Poland',
    '\u{1F1F5}\u{1F1F9}': 'Portugal', '\u{1F1F7}\u{1F1F4}': 'Romania',
    '\u{1F1F7}\u{1F1FA}': 'Russia', '\u{1F1F8}\u{1F1F2}': 'San Marino',
    '\u{1F1F7}\u{1F1F8}': 'Serbia', '\u{1F1F8}\u{1F1F0}': 'Slovakia',
    '\u{1F1F8}\u{1F1EE}': 'Slovenia', '\u{1F1EA}\u{1F1F8}': 'Spain',
    '\u{1F1F8}\u{1F1EA}': 'Sweden', '\u{1F1E8}\u{1F1ED}': 'Switzerland',
    '\u{1F1F9}\u{1F1F7}': 'Turkey', '\u{1F1FA}\u{1F1E6}': 'Ukraine',
    '\u{1F1EC}\u{1F1E7}': 'England', '\u{1F1FB}\u{1F1E6}': 'Vatican',
    // Africa
    '\u{1F1E9}\u{1F1FF}': 'Algeria', '\u{1F1E6}\u{1F1F4}': 'Angola',
    '\u{1F1E7}\u{1F1EF}': 'Benin', '\u{1F1E7}\u{1F1FC}': 'Botswana',
    '\u{1F1E7}\u{1F1EB}': 'Burkina Faso', '\u{1F1E7}\u{1F1EE}': 'Burundi',
    '\u{1F1E8}\u{1F1F2}': 'Cameroon', '\u{1F1E8}\u{1F1FB}': 'Cape Verde',
    '\u{1F1E8}\u{1F1EB}': 'C. Africa', '\u{1F1F9}\u{1F1E9}': 'Chad',
    '\u{1F1F0}\u{1F1F2}': 'Comoros', '\u{1F1E8}\u{1F1EC}': 'Congo',
    '\u{1F1E8}\u{1F1E9}': 'DR Congo', '\u{1F1E9}\u{1F1EF}': 'Djibouti',
    '\u{1F1EA}\u{1F1EC}': 'Egypt', '\u{1F1EC}\u{1F1F6}': 'Eq. Guinea',
    '\u{1F1EA}\u{1F1F7}': 'Eritrea', '\u{1F1F8}\u{1F1FF}': 'Eswatini',
    '\u{1F1EA}\u{1F1F9}': 'Ethiopia', '\u{1F1EC}\u{1F1E6}': 'Gabon',
    '\u{1F1EC}\u{1F1F2}': 'Gambia', '\u{1F1EC}\u{1F1ED}': 'Ghana',
    '\u{1F1EC}\u{1F1F3}': 'Guinea', '\u{1F1EC}\u{1F1FC}': 'Guinea-Bis.',
    '\u{1F1E8}\u{1F1EE}': 'Ivory Coast', '\u{1F1F0}\u{1F1EA}': 'Kenya',
    '\u{1F1F1}\u{1F1F8}': 'Lesotho', '\u{1F1F1}\u{1F1F7}': 'Liberia',
    '\u{1F1F1}\u{1F1FE}': 'Libya', '\u{1F1F2}\u{1F1EC}': 'Madagascar',
    '\u{1F1F2}\u{1F1FC}': 'Malawi', '\u{1F1F2}\u{1F1F1}': 'Mali',
    '\u{1F1F2}\u{1F1F7}': 'Mauritania', '\u{1F1F2}\u{1F1FA}': 'Mauritius',
    '\u{1F1F2}\u{1F1E6}': 'Morocco', '\u{1F1F2}\u{1F1FF}': 'Mozambique',
    '\u{1F1F3}\u{1F1E6}': 'Namibia', '\u{1F1F3}\u{1F1EA}': 'Niger',
    '\u{1F1F3}\u{1F1EC}': 'Nigeria', '\u{1F1F7}\u{1F1FC}': 'Rwanda',
    '\u{1F1F8}\u{1F1F9}': 'Sao Tome', '\u{1F1F8}\u{1F1F3}': 'Senegal',
    '\u{1F1F8}\u{1F1E8}': 'Seychelles', '\u{1F1F8}\u{1F1F1}': 'Sierra Leone',
    '\u{1F1F8}\u{1F1F4}': 'Somalia', '\u{1F1FF}\u{1F1E6}': 'South Africa',
    '\u{1F1F8}\u{1F1F8}': 'South Sudan', '\u{1F1F8}\u{1F1E9}': 'Sudan',
    '\u{1F1F9}\u{1F1FF}': 'Tanzania', '\u{1F1F9}\u{1F1EC}': 'Togo',
    '\u{1F1F9}\u{1F1F3}': 'Tunisia', '\u{1F1FA}\u{1F1EC}': 'Uganda',
    '\u{1F1FF}\u{1F1F2}': 'Zambia', '\u{1F1FF}\u{1F1FC}': 'Zimbabwe',
    // The Americas
    '\u{1F1E6}\u{1F1EC}': 'Antigua', '\u{1F1E6}\u{1F1F7}': 'Argentina',
    '\u{1F1E7}\u{1F1F8}': 'Bahamas', '\u{1F1E7}\u{1F1E7}': 'Barbados',
    '\u{1F1E7}\u{1F1FF}': 'Belize', '\u{1F1E7}\u{1F1F4}': 'Bolivia',
    '\u{1F1E7}\u{1F1F7}': 'Brazil', '\u{1F1E8}\u{1F1E6}': 'Canada',
    '\u{1F1E8}\u{1F1F1}': 'Chile', '\u{1F1E8}\u{1F1F4}': 'Colombia',
    '\u{1F1E8}\u{1F1F7}': 'Costa Rica', '\u{1F1E8}\u{1F1FA}': 'Cuba',
    '\u{1F1E9}\u{1F1F2}': 'Dominica', '\u{1F1E9}\u{1F1F4}': 'Dominican R.',
    '\u{1F1EA}\u{1F1E8}': 'Ecuador', '\u{1F1F8}\u{1F1FB}': 'El Salvador',
    '\u{1F1EC}\u{1F1E9}': 'Grenada', '\u{1F1EC}\u{1F1F9}': 'Guatemala',
    '\u{1F1EC}\u{1F1FE}': 'Guyana', '\u{1F1ED}\u{1F1F9}': 'Haiti',
    '\u{1F1ED}\u{1F1F3}': 'Honduras', '\u{1F1EF}\u{1F1F2}': 'Jamaica',
    '\u{1F1F2}\u{1F1FD}': 'Mexico', '\u{1F1F3}\u{1F1EE}': 'Nicaragua',
    '\u{1F1F5}\u{1F1E6}': 'Panama', '\u{1F1F5}\u{1F1FE}': 'Paraguay',
    '\u{1F1F5}\u{1F1EA}': 'Peru', '\u{1F1F0}\u{1F1F3}': 'St Kitts',
    '\u{1F1F1}\u{1F1E8}': 'St Lucia', '\u{1F1FB}\u{1F1E8}': 'St Vincent',
    '\u{1F1F8}\u{1F1F7}': 'Suriname', '\u{1F1F9}\u{1F1F9}': 'Trinidad',
    '\u{1F1FA}\u{1F1F8}': 'USA', '\u{1F1FA}\u{1F1FE}': 'Uruguay',
    '\u{1F1FB}\u{1F1EA}': 'Venezuela',
    // Asia
    '\u{1F1E6}\u{1F1EB}': 'Afghanistan', '\u{1F1E7}\u{1F1ED}': 'Bahrain',
    '\u{1F1E7}\u{1F1E9}': 'Bangladesh', '\u{1F1E7}\u{1F1F9}': 'Bhutan',
    '\u{1F1E7}\u{1F1F3}': 'Brunei', '\u{1F1F0}\u{1F1ED}': 'Cambodia',
    '\u{1F1E8}\u{1F1F3}': 'China', '\u{1F1EE}\u{1F1F3}': 'India',
    '\u{1F1EE}\u{1F1E9}': 'Indonesia', '\u{1F1EE}\u{1F1F7}': 'Iran',
    '\u{1F1EE}\u{1F1F6}': 'Iraq', '\u{1F1EE}\u{1F1F1}': 'Israel',
    '\u{1F1EF}\u{1F1F5}': 'Japan', '\u{1F1EF}\u{1F1F4}': 'Jordan',
    '\u{1F1F0}\u{1F1FF}': 'Kazakhstan', '\u{1F1F0}\u{1F1F7}': 'Korea',
    '\u{1F1F0}\u{1F1FC}': 'Kuwait', '\u{1F1F0}\u{1F1EC}': 'Kyrgyzstan',
    '\u{1F1F1}\u{1F1E6}': 'Laos', '\u{1F1F1}\u{1F1E7}': 'Lebanon',
    '\u{1F1F2}\u{1F1FE}': 'Malaysia', '\u{1F1F2}\u{1F1FB}': 'Maldives',
    '\u{1F1F2}\u{1F1F3}': 'Mongolia', '\u{1F1F2}\u{1F1F2}': 'Myanmar',
    '\u{1F1F3}\u{1F1F5}': 'Nepal', '\u{1F1F0}\u{1F1F5}': 'N. Korea',
    '\u{1F1F4}\u{1F1F2}': 'Oman', '\u{1F1F5}\u{1F1F0}': 'Pakistan',
    '\u{1F1F5}\u{1F1F8}': 'Palestine', '\u{1F1F5}\u{1F1ED}': 'Philippines',
    '\u{1F1F6}\u{1F1E6}': 'Qatar', '\u{1F1F8}\u{1F1E6}': 'Saudi Arabia',
    '\u{1F1F8}\u{1F1EC}': 'Singapore', '\u{1F1F1}\u{1F1F0}': 'Sri Lanka',
    '\u{1F1F8}\u{1F1FE}': 'Syria', '\u{1F1F9}\u{1F1FC}': 'Taiwan',
    '\u{1F1F9}\u{1F1EF}': 'Tajikistan', '\u{1F1F9}\u{1F1ED}': 'Thailand',
    '\u{1F1F9}\u{1F1F1}': 'Timor-Leste', '\u{1F1F9}\u{1F1F2}': 'Turkmenistan',
    '\u{1F1E6}\u{1F1EA}': 'UAE', '\u{1F1FA}\u{1F1FF}': 'Uzbekistan',
    '\u{1F1FB}\u{1F1F3}': 'Vietnam', '\u{1F1FE}\u{1F1EA}': 'Yemen',
    // Oceania
    '\u{1F1E6}\u{1F1FA}': 'Australia', '\u{1F1EB}\u{1F1EF}': 'Fiji',
    '\u{1F1F0}\u{1F1EE}': 'Kiribati', '\u{1F1F2}\u{1F1ED}': 'Marshall Is.',
    '\u{1F1EB}\u{1F1F2}': 'Micronesia', '\u{1F1F3}\u{1F1F7}': 'Nauru',
    '\u{1F1F3}\u{1F1FF}': 'New Zealand', '\u{1F1F5}\u{1F1FC}': 'Palau',
    '\u{1F1F5}\u{1F1EC}': 'Papua N.G.', '\u{1F1FC}\u{1F1F8}': 'Samoa',
    '\u{1F1F8}\u{1F1E7}': 'Solomon Is.', '\u{1F1F9}\u{1F1F4}': 'Tonga',
    '\u{1F1F9}\u{1F1FB}': 'Tuvalu', '\u{1F1FB}\u{1F1FA}': 'Vanuatu'
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
