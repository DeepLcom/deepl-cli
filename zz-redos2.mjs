import picomatch from 'picomatch';
const decoy = 'a'.repeat(40);
for (const n of [1, 2, 3, 4, 5]) {
  const pattern = '+(a*)'.repeat(n) + 'b';
  const isMatch = picomatch(pattern);
  const t0 = process.hrtime.bigint();
  isMatch(decoy);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`N=${n} -> ${ms.toFixed(2)} ms`);
}
