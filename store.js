'use strict';
// Persistence for everything the child earns: their teams, cup progress,
// adaptive maths state and unlocked cosmetics.
//
// Three rules shape this file:
//   - Every read is wrapped. A corrupt or half-written value yields a fresh
//     slot rather than an exception, because a bad save must never brick the
//     game for a child who cannot debug it.
//   - `localStorage` itself can throw (private browsing), so the whole thing
//     falls back to an in-memory object. The game is fully playable unsaved.
//   - Progress lives per slot, not globally. Siblings sharing a tablet would
//     otherwise drag each other's adaptive difficulty around, and the engine
//     would tune to an average describing neither child.
var Store = (function () {

  var KEY = 'ffc.v1';
  var SLOTS = 3;
  var DEFAULT_BAND = 3;          // age 7: the middle of the range, so a slot
                                 // made without touching the age row still asks
                                 // maths rather than silently switching it off

  var memory = null;             // used when localStorage is unavailable
  var available = null;          // cached probe result

  function canPersist() {
    if (available !== null) { return available; }
    try {
      window.localStorage.setItem(KEY + '.probe', '1');
      window.localStorage.removeItem(KEY + '.probe');
      available = true;
    } catch (e) {
      available = false;
    }
    return available;
  }

  function emptySlot() {
    return {
      emoji: '', name: '',
      band: DEFAULT_BAND,        // age band 1-8, or 0 for "no maths"
      maths: null,               // {difficulty, mastery} once they have played
      cup: { season: 0, index: 0 },
      // Everything a child might want to look back on. Counters only: no
      // history, so the record cannot grow without bound.
      stats: {
        correct: 0, answered: 0,
        matches: 0, wins: 0,
        goalsFor: 0, goalsAgainst: 0,
        ms: 0                        // time actually spent on a pitch
      },
      unlocked: [],
      equipped: { ball: 'classic', pitch: 'day', hat: 'none' },
      trophies: 0
    };
  }

  function emptyState() {
    return { v: 1, active: 0, slots: [emptySlot(), emptySlot(), emptySlot()] };
  }

  // A slot from disk may be older, partial, or hand-edited nonsense. Fill in
  // anything missing rather than trusting the shape.
  function repairSlot(raw) {
    var base = emptySlot(), k;
    if (!raw || typeof raw !== 'object') { return base; }
    if (typeof raw.emoji === 'string') { base.emoji = raw.emoji.slice(0, 4); }
    if (typeof raw.name === 'string') { base.name = raw.name.slice(0, 12); }
    // A save written before ages moved into the team editor has no band; it
    // keeps the default rather than being read as "no maths".
    if (typeof raw.band === 'number' && isFinite(raw.band)) {
      base.band = Math.max(0, Math.min(8, raw.band | 0));
    }
    if (raw.maths && typeof raw.maths.difficulty === 'number' &&
        isFinite(raw.maths.difficulty)) {
      base.maths = {
        difficulty: Math.min(8, Math.max(1, raw.maths.difficulty)),
        // The band an adult chose. It bounds how far a hot streak may carry a
        // child, so losing it on reload would quietly let the reach drift up
        // with them, one session at a time. A save from before this existed
        // falls back to the band it is sitting at.
        home: Math.min(8, Math.max(1,
          (typeof raw.maths.home === 'number' && isFinite(raw.maths.home))
            ? raw.maths.home : raw.maths.difficulty)),
        mastery: (raw.maths.mastery && typeof raw.maths.mastery === 'object') ? raw.maths.mastery : {}
      };
    }
    if (raw.cup && typeof raw.cup.index === 'number') {
      base.cup.season = Math.max(0, raw.cup.season | 0);
      base.cup.index = Math.max(0, raw.cup.index | 0);
    }
    // Every counter is repaired the same way, so adding one here is the only
    // change a new stat needs. A save written before a counter existed simply
    // starts it at zero.
    if (raw.stats) {
      for (k in base.stats) {
        if (typeof raw.stats[k] === 'number' && isFinite(raw.stats[k])) {
          base.stats[k] = Math.max(0, Math.floor(raw.stats[k]));
        }
      }
    }
    if (Object.prototype.toString.call(raw.unlocked) === '[object Array]') {
      base.unlocked = raw.unlocked.filter(function (u) { return typeof u === 'string'; });
    }
    if (raw.equipped) {
      for (k in base.equipped) {
        if (typeof raw.equipped[k] === 'string') { base.equipped[k] = raw.equipped[k]; }
      }
    }
    base.trophies = Math.max(0, raw.trophies | 0);
    return base;
  }

  function repair(raw) {
    var state = emptyState(), i;
    if (!raw || typeof raw !== 'object') { return state; }
    state.active = (raw.active === 1 || raw.active === 2) ? raw.active : 0;
    if (Object.prototype.toString.call(raw.slots) === '[object Array]') {
      for (i = 0; i < SLOTS; i++) { state.slots[i] = repairSlot(raw.slots[i]); }
    }
    return state;
  }

  function load() {
    if (!canPersist()) {
      if (!memory) { memory = emptyState(); }
      return memory;
    }
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) { return emptyState(); }
      return repair(JSON.parse(raw));
    } catch (e) {
      // Corrupt, truncated, or not JSON at all. Start clean rather than throw.
      return emptyState();
    }
  }

  function save(state) {
    if (!canPersist()) { memory = state; return false; }
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;   // quota or a mid-session permission change
    }
  }

  function activeSlot(state) { return state.slots[state.active]; }

  function clearSlot(state, i) {
    if (i >= 0 && i < SLOTS) { state.slots[i] = emptySlot(); }
    return state;
  }

  return {
    KEY: KEY, SLOTS: SLOTS, DEFAULT_BAND: DEFAULT_BAND,
    emptySlot: emptySlot, emptyState: emptyState,
    repair: repair, repairSlot: repairSlot,
    load: load, save: save,
    activeSlot: activeSlot, clearSlot: clearSlot
  };
})();

if (typeof module !== 'undefined') { module.exports = Store; }
