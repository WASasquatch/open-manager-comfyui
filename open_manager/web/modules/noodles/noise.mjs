const TABLE = new Uint8Array(512);

(() => {
  const order = Array.from({ length: 256 }, (_, i) => i);
  let seed = 1337;
  for (let i = 255; i > 0; i -= 1) {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let i = 0; i < 512; i += 1) TABLE[i] = order[i & 255];
})();

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(t, a, b) {
  return a + t * (b - a);
}

function grad(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

export function perlin(x, y, z) {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  const X = fx & 255;
  const Y = fy & 255;
  const Z = fz & 255;
  x -= fx;
  y -= fy;
  z -= fz;
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const A = TABLE[X] + Y;
  const AA = TABLE[A] + Z;
  const AB = TABLE[A + 1] + Z;
  const B = TABLE[X + 1] + Y;
  const BA = TABLE[B] + Z;
  const BB = TABLE[B + 1] + Z;
  return lerp(w,
    lerp(v, lerp(u, grad(TABLE[AA], x, y, z), grad(TABLE[BA], x - 1, y, z)),
      lerp(u, grad(TABLE[AB], x, y - 1, z), grad(TABLE[BB], x - 1, y - 1, z))),
    lerp(v, lerp(u, grad(TABLE[AA + 1], x, y, z - 1), grad(TABLE[BA + 1], x - 1, y, z - 1)),
      lerp(u, grad(TABLE[AB + 1], x, y - 1, z - 1), grad(TABLE[BB + 1], x - 1, y - 1, z - 1))));
}
