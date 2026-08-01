// Validate the adaptive tuning in the spec: does it settle near 80% accuracy?
const UP = { fast: 0.100, mid: 0.075, slow: 0.040 };
const DOWN = 0.300;

// Learner: ability `a` on the 1-8 band scale. Chance of being correct falls off
// as difficulty exceeds ability.
function correctProb(ability, d) {
  return 1 / (1 + Math.exp(1.6 * (d - ability)));
}

function simulate(ability, n = 60000, seed = 12345) {
  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let d = 4.0, correct = 0, total = 0;
  const tail = [];
  for (let i = 0; i < n; i++) {
    // FLOOR SUPPORT: difficulty cannot go below band 1, so at the bottom we
    // reduce the number of answer choices instead. Fewer options = less
    // cognitive load and a better chance, keeping the weakest child near target.
    const choices = d <= 1.25 ? 2 : d <= 1.75 ? 3 : 4;
    const known = correctProb(ability, d);
    const p = known + (1 - known) / choices; // guess the rest
    const ok = rand() < p;
    if (ok) {
      // speed bucket: faster when the question is easy relative to ability
      const margin = ability - d;
      const bucket = margin > 1 ? 'fast' : margin > -0.5 ? 'mid' : 'slow';
      d += UP[bucket];
    } else {
      d -= DOWN;
    }
    d = Math.max(1, Math.min(8, d));
    if (i > n * 0.5) { total++; if (ok) correct++; tail.push(d); }
  }
  const mean = tail.reduce((x, y) => x + y, 0) / tail.length;
  const sd = Math.sqrt(tail.reduce((x, y) => x + (y - mean) ** 2, 0) / tail.length);
  return { accuracy: correct / total, band: mean, sd };
}

console.log('predicted equilibrium accuracy p* = d/(u+d) =',
  (DOWN / (UP.mid + DOWN)).toFixed(3), '\n');

let pass = true;
for (const ability of [1.5, 3, 4.5, 6, 7.5]) {
  const r = simulate(ability);
  const ok = r.accuracy > 0.72 && r.accuracy < 0.88;
  if (!ok) pass = false;
  console.log(
    `ability ${ability.toFixed(1)} -> settles at band ${r.band.toFixed(2)}` +
    ` (sd ${r.sd.toFixed(2)}), observed accuracy ${(r.accuracy * 100).toFixed(1)}%` +
    `  ${ok ? 'OK' : 'OUT OF RANGE'}`);
}

// clamping: an impossible learner must not drive difficulty out of bounds
const floor = simulate(-5, 5000), ceil = simulate(20, 5000);
console.log(`\nclamp low  -> band ${floor.band.toFixed(2)} (must be >= 1)`);
console.log(`clamp high -> band ${ceil.band.toFixed(2)} (must be <= 8)`);
if (floor.band < 1 || ceil.band > 8) pass = false;

console.log('\n' + (pass ? 'TUNING VALIDATED' : 'TUNING FAILED'));
process.exit(pass ? 0 : 1);
