// Finds the notes in a rendered sound, for checking that sound effects sit in the music's chords
// (scripts/audio-render.cjs --harmony and browser-test.cjs): renders in the page, an FFT, the spectrum's peaks, and of those the
// fundamentals — peaks that are not a side lobe of a stronger one, a harmonic of a lower one, or off the
// equal-tempered grid (an inharmonic partial of a bell or a glass, or an FM sideband, is timbre, not a note).
'use strict';

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar; im[i + k] += ai;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/**
 * The notes sounding in mono[from..to) (seconds): [{ f, midi (fractional), pc, power }], strongest first. Peaks
 * more than rangeDb under the strongest are ignored, as are those below 60 Hz or above 6 kHz.
 */
function notes(mono, rate, from, to, rangeDb) {
  const N = 16384, bin = rate / N, spec = new Float64Array(N / 2);
  const a = Math.max(0, Math.floor(from * rate)), b = Math.min(mono.length, Math.floor(to * rate));
  for (let s = a; s + N / 4 <= b; s += N / 4) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N && s + i < b; i++) re[i] = mono[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) spec[k] += re[k] * re[k] + im[k] * im[k];
  }
  const lo = Math.ceil(60 / bin), hi = Math.floor(6000 / bin);
  let top = 0;
  for (let k = lo; k <= hi; k++) top = Math.max(top, spec[k]);
  const floor = top * Math.pow(10, -(rangeDb || 24) / 10), peaks = [];
  for (let k = lo; k <= hi; k++) {
    const p = spec[k];
    if (p < floor || p < spec[k - 1] || p < spec[k + 1] || p < spec[k - 2] || p < spec[k + 2]) continue;
    // Parabolic interpolation on the log spectrum, for the true frequency between bins.
    const l = Math.log(spec[k - 1] + 1e-30), c = Math.log(p), r = Math.log(spec[k + 1] + 1e-30), den = l - 2 * c + r;
    const off = den ? 0.5 * (l - r) / den : 0;
    peaks.push({ f: (k + off) * bin, power: p });
  }
  peaks.sort((x, y) => x.f - y.f);
  const found = [];
  for (const p of peaks) {
    // A short note's spectrum has side lobes: a peak with one 8 dB stronger within a semitone and a half is one of them.
    if (peaks.some((q) => q.power > p.power * 6.3 && Math.abs(Math.log2(q.f / p.f)) < 1.5 / 12)) continue;
    const midi = 69 + 12 * Math.log2(p.f / 440);
    if (Math.abs(midi - Math.round(midi)) > 0.3) continue; // off the grid: a partial, not a note
    if (found.some((q) => { const h = p.f / q.f, n = Math.round(h); return n >= 2 && n <= 16 && Math.abs(h - n) < 0.04; })) continue;
    found.push({ f: p.f, midi, pc: ((Math.round(midi) % 12) + 12) % 12, power: p.power });
  }
  return found.sort((x, y) => y.power - x.power);
}

/** How much of the notes' power is on the pitch classes allowed (flags by pitch class), 0..1; and the ones that are not. */
function share(found, allowed) {
  let on = 0, all = 0;
  const off = [];
  for (const n of found) { all += n.power; if (allowed[n.pc]) on += n.power; else off.push(n); }
  return { share: all ? on / all : 1, off };
}

// ---- in the page (Playwright) ----------------------------------------------------------------------------------------

/**
 * Each sound of events ([name, arg]) of a pack, alone, played 0.4 s into a bar of the music, tuned to it and as the
 * pack made it (rendered side by side), with the notes found in its first 1.2 s. Only its pitched voices are played;
 * a sound that glides (a slide of more than a semitone) smears its pitch across the spectrum, so it is marked.
 */
async function overBar(page, pack, bar, events) {
  const T = 0.45;
  const outs = await page.evaluate(async ([pack, bar, T, events]) => {
    const S = Lull.Sound, H = Lull.Harmony, t = H.tones(Lull.SONG.bars[bar]);
    const one = async (name, arg, tuned) => {
      let blip = false, glide = false, count = 0;
      const buf = await S.offline(2.2, (ctx) => {
        Lull.Music.render(ctx, 4, bar, true); // the timeline only: this is the sound alone
        const { pack: pk, list } = S.voices(name, arg, pack);
        if (!list) return;
        const pitched = list.filter((v) => H.tonal(v));
        blip = pitched.length <= 2; count = pitched.length;
        glide = pitched.some((v) => v.to > 0 && Math.abs(12 * Math.log2(v.to / v.f)) > 1);
        const plan = tuned ? H.plan(name, list, T) : { list, delay: 0 };
        // Only its pitched voices: noise (a band-passed click rings at its band) and thuds are not notes.
        plan.list.forEach((v, i) => { if (H.tonal(list[i])) S.voice(v, T + plan.delay, pk); });
      });
      // Just the stretch to look at, as 32-bit floats in base64 (a plain array is slow to hand over).
      const l = buf.getChannelData(0), r = buf.getChannelData(1), a = Math.floor(T * buf.sampleRate), n = Math.floor(1.2 * buf.sampleRate);
      const mono = new Float32Array(n);
      for (let i = 0; i < n; i++) mono[i] = (l[a + i] + r[a + i]) / 2;
      const u8 = new Uint8Array(mono.buffer);
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return { name, arg, tuned, rate: buf.sampleRate, mono: btoa(s), allowed: blip ? t.scale : t.chord, glide, pitched: count };
    };
    return Promise.all([].concat(...events.map(([n, a]) => [one(n, a, true), one(n, a, false)])));
  }, [pack, bar, T, events]);
  return outs.map((o) => {
    const u8 = Buffer.from(o.mono, 'base64'), mono = new Float32Array(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.length));
    return Object.assign(o, { mono: null, found: notes(mono, o.rate, 0, 1.2, 24) });
  });
}

/** A bar of every chord in the suite (its first after the intro). */
async function chordBars(page) {
  return page.evaluate(() => {
    const S = Lull.SONG, seen = {};
    S.bars.forEach((b, i) => { if (i >= S.loopFrom && b.chord && !(b.name in seen)) seen[b.name] = i; });
    return seen;
  });
}

module.exports = { fft, notes, share, overBar, chordBars };
