'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var Bonuses = require('./bonuses.js');
var Store = require('./store.js');
var checks = 0;
function ok(condition, message) { checks++; assert.ok(condition, message); }
function eq(actual, expected, message) { checks++; assert.strictEqual(actual, expected, message); }
function deep(actual, expected, message) {
  checks++;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)),
    JSON.parse(JSON.stringify(expected)), message);
}
var empty = { coach: 0, big: 0, small: 0 };
var rewards = [
  { at: 3, id: 'coach', flicks: 3 },
  { at: 5, id: 'big', flicks: 3 },
  { at: 8, id: 'small', flicks: 3 }
];
deep(Bonuses.STREAK_REWARDS, rewards, 'three repeated streak milestones award three flicks');
[
  [3, [rewards[0]]], [5, [rewards[1]]], [6, [rewards[0]]],
  [8, [rewards[2]]], [10, [rewards[1]]], [15, [rewards[0], rewards[1]]],
  [24, [rewards[0], rewards[2]]], [40, [rewards[1], rewards[2]]],
  [120, rewards]
].forEach(function (test) {
  deep(Bonuses.streakRewards(test[0]), test[1], 'streak ' + test[0] + ' awards every matching perk');
});
[0, 1, 2, 4, 7, 11, 13, 14].forEach(function (streak) {
  deep(Bonuses.streakRewards(streak), [], 'streak ' + streak + ' earns no premature refresh');
});
var malformed = [undefined, null, false, true, '', '3', {}, [], NaN,
  Infinity, -Infinity, -3, 2.9, 3.1, Number.MAX_SAFE_INTEGER + 1];
malformed.forEach(function (streak, i) {
  deep(Bonuses.streakRewards(streak), [], 'malformed streak ' + i + ' grants nothing');
  deep(Bonuses.nextStreakReward(streak), rewards[0],
    'malformed streak ' + i + ' starts progress at the first reward');
});
[
  [0, 3, 'coach'], [2, 3, 'coach'], [3, 5, 'big'], [4, 5, 'big'],
  [5, 6, 'coach'], [6, 8, 'small'], [7, 8, 'small'], [8, 9, 'coach'],
  [9, 10, 'big'], [10, 12, 'coach'], [14, 15, 'coach'], [15, 16, 'small'],
  [23, 24, 'coach'], [39, 40, 'big'], [120, 123, 'coach'],
  [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, 'small']
].forEach(function (test) {
  deep(Bonuses.nextStreakReward(test[0]), { at: test[1], id: test[2], flicks: 3 },
    'progress after streak ' + test[0] + ' points to a strictly upcoming milestone');
});
var awarded = Bonuses.streakRewards(120);
awarded[0].at = 1;
awarded[1].flicks = 99;
awarded.push({ id: 'feint', at: 1, flicks: 99 });
deep(Bonuses.streakRewards(120), rewards, 'editing an award result cannot alter future rewards');
var next = Bonuses.nextStreakReward(0);
next.id = 'feint';
deep(Bonuses.nextStreakReward(0), rewards[0], 'progress results do not share reward metadata');

var first = Store.emptySlot(), second = Store.emptySlot();
deep(first.streakPowers, empty, 'fresh teams have no unearned assists');
ok(first.streakPowers !== second.streakPowers, 'fresh teams have independent charge objects');
first.streakPowers.coach = 3;
deep(second.streakPowers, empty, 'one sibling earning coaching does not affect another');
deep(Store.repairSlot({ emoji: '\u26BD', stats: { curStreak: 15 } }).streakPowers, empty,
  'old saves gain empty assists without retroactively awarding a saved streak');
deep(Store.repairSlot({ streakPowers: { coach: 3, big: 2, small: 1 } }).streakPowers,
  { coach: 3, big: 2, small: 1 }, 'valid remaining charges survive repair');
var raw = { streakPowers: { coach: 7.9, big: -4, small: 1.9, feint: 3, second: 3 } };
deep(Store.repairSlot(raw).streakPowers, { coach: 3, big: 0, small: 1 },
  'repair floors and caps charges and discards unknown powerups');
deep(raw.streakPowers, { coach: 7.9, big: -4, small: 1.9, feint: 3, second: 3 },
  'repair does not alter its input');
deep(Store.repairSlot({ streakPowers: { coach: Math.pow(2, 40), big: -0.1, small: 0.99 } }).streakPowers,
  { coach: 3, big: 0, small: 0 }, 'large and fractional charges cannot wrap or stack');
[null, false, 3, 'bad', [], {},
  { coach: '3', big: NaN, small: Infinity },
  { coach: -Infinity, big: true, small: null }
].forEach(function (powers, i) {
  deep(Store.repairSlot({ streakPowers: powers }).streakPowers, empty,
    'malformed power data ' + i + ' repairs to empty charges');
});
var sharedRaw = { streakPowers: { coach: 3, big: 2, small: 1 } };
var repaired = Store.repair({ active: 1, slots: [sharedRaw, sharedRaw, sharedRaw] });
repaired.slots[1].streakPowers.coach = 0;
eq(repaired.slots[0].streakPowers.coach, 3, 'repaired slots isolate charges even with shared input');
eq(repaired.slots[2].streakPowers.coach, 3, 'repair also keeps the third sibling independent');
Store.clearSlot(repaired, 1);
deep(repaired.slots[1].streakPowers, empty, 'clearing a team also clears its paid assists');
eq(repaired.slots[0].streakPowers.big, 2, 'clearing one team preserves a sibling\'s assists');

// Fresh module instances exercise browser save/reload without changing the
// global window or sharing Store's cached localStorage probe with other tests.
var source = fs.readFileSync(path.join(__dirname, 'store.js'), 'utf8');
function browserStore(window) {
  var context = vm.createContext({ window: window, Maths: require('./maths.js') });
  vm.runInContext(source, context, { filename: 'store.js' });
  return context.Store;
}
var disk = {};
var storage = {
  setItem: function (key, value) { disk[key] = String(value); },
  getItem: function (key) { return Object.prototype.hasOwnProperty.call(disk, key) ? disk[key] : null; },
  removeItem: function (key) { delete disk[key]; }
};
var persistedStore = browserStore({ localStorage: storage });
var state = persistedStore.emptyState();
state.active = 1;
state.slots[1].stats.curStreak = 8;
state.slots[1].streakPowers = { coach: 2, big: 1, small: 3 };
eq(persistedStore.save(state), true, 'earned and partly spent assists save successfully');
var reloadedStore = browserStore({ localStorage: storage });
var loaded = reloadedStore.load();
eq(loaded.active, 1, 'reload keeps the team earning the assists selected');
deep(loaded.slots[1].streakPowers, { coach: 2, big: 1, small: 3 },
  'reload restores each perk\'s remaining paid flicks');
eq(loaded.slots[1].stats.curStreak, 8, 'reload retains the existing answer streak');
deep(loaded.slots[0].streakPowers, empty, 'saved assists do not leak to the first sibling');
deep(loaded.slots[2].streakPowers, empty, 'saved assists do not leak to the third sibling');
loaded.slots[1].streakPowers.small--;
eq(reloadedStore.save(loaded), true, 'spent charges can be written back');
eq(browserStore({ localStorage: storage }).load().slots[1].streakPowers.small, 2,
  'a second reload keeps the spent charge spent');
storage.setItem('ffc.v1', JSON.stringify({ active: 0, slots: [{ stats: { curStreak: 9 } }] }));
deep(browserStore({ localStorage: storage }).load().slots[0].streakPowers, empty,
  'loading a legacy browser save grants no unearned charges');
storage.setItem('ffc.v1', '{broken');
deep(browserStore({ localStorage: storage }).load().slots[0].streakPowers, empty,
  'corrupt JSON resets powerups safely');

var privateWindow = {};
Object.defineProperty(privateWindow, 'localStorage', {
  get: function () { throw new Error('storage unavailable'); }
});
var memoryStore = browserStore(privateWindow);
state = memoryStore.emptyState();
state.slots[2].streakPowers.coach = 3;
eq(memoryStore.save(state), false, 'unavailable storage falls back without claiming persistence');
eq(memoryStore.load().slots[2].streakPowers.coach, 3,
  'in-memory fallback retains earned assists while the page stays open');
deep(memoryStore.load().slots[0].streakPowers, empty,
  'in-memory fallback keeps sibling assists isolated');

if (require.main === module) console.log(checks + ' streak reward checks, 0 failures');
module.exports = { checks: checks };
