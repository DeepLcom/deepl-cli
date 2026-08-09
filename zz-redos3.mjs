import picomatch from 'picomatch';
const decoy = 'a'.repeat(40);
const n = Number(process.argv[2]);
const pattern = '+(a*)'.repeat(n) + 'b';
const t0 = process.hrtime.bigint();
picomatch(pattern)(decoy);
console.log(`N=${n} -> ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2)} ms`);
