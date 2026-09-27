#!/usr/bin/env python3
"""Cuts Classic's announcer from a recording of the Tetris Worlds announcer into Game/js/voice-data.js.

The phrases were found by speech recognition (Whisper, via sherpa-onnx) and checked by ear-shaped means (energy
envelope, spectrogram). Each window below is trimmed to the words, de-clicked, lightly high-passed, faded,
loudness-normalised (BS.1770 loudness, leaning a little toward the loudest moment, so every clip sounds as loud as the
next), peak-limited, and encoded as a small MP3, embedded as base64: no files, no network.

Phrases the recording does not have are built from ones it does (a T-spin triple is "T-spin" + "triple"), or
stand in with the nearest line (Tetris Worlds says "rank up" and "top out", not "level up" and "game over").

    python3 Lull/scripts/splice-voice.py path/to/Tetris_Worlds_Announcer_Voice_Clips.wav
"""
import base64, os, sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfiltfilt, resample_poly, lfilter
from scipy.ndimage import minimum_filter1d
import lameenc

# key: (start, end) in seconds in the source recording, and what is said there.
CLIPS = {
    'single':       (93.90, 95.05, 'single'),
    'double':       (95.20, 95.95, 'double'),
    'triple':       (96.00, 96.80, 'triple'),
    'tetris':       (83.05, 83.95, 'tetris'),
    'tspin':        (113.95, 114.90, 'T-spin'),
    'tspin_single': (105.30, 106.95, 'T-spin single'),
    'tspin_double': (106.95, 108.45, 'T-spin double'),
    'b2b':          (10.80, 11.95, 'back to back'),
    'perfect':      (9.30, 10.25, 'amazing'),
    'levelup':      (101.85, 102.80, 'rank up'),
    'gameover':     (124.05, 124.95, 'top out'),
}
OUT_SR = 24000
TARGET_LUFS = -20.0   # every clip's perceived loudness (see perceived()), so they all sound equally loud
PEAK_WEIGHT = 0.35   # how far perceived() leans toward the loudest moment
CEILING = 10 ** (-2.0 / 20)   # peaks limited to -2 dBFS (room for the MP3 encoder's overshoot)


def loudness(y, sr, both=False):
    """Integrated loudness in LUFS as ITU-R BS.1770 measures it (K-weighting, 400 ms blocks, absolute and relative
    gates), with blocks every 50 ms since the clips are about a second long; with both, also the loudest block (the
    momentary maximum)."""
    if sr != 48000:
        y = resample_poly(y, 48000, sr)
    # K-weighting at 48 kHz: a high shelf (the head) and a high-pass (RLB).
    y = lfilter([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585], y)
    y = lfilter([1, -2, 1], [1, -1.99004745483398, 0.99007225036621], y)
    blk, hop = int(0.4 * 48000), int(0.05 * 48000)
    ms = np.array([np.mean(y[i:i + blk] ** 2) for i in range(0, max(1, len(y) - blk + 1), hop)])
    lk = -0.691 + 10 * np.log10(ms + 1e-20)
    gated = ms[lk > -70]
    rel = -0.691 + 10 * np.log10(gated.mean()) - 10
    integrated = -0.691 + 10 * np.log10(ms[(lk > -70) & (lk > rel)].mean())
    return (integrated, lk.max()) if both else integrated


def limit(y, sr):
    """A look-ahead peak limiter: the gain each sample needs to stay under the ceiling, held over 3 ms either side and
    smoothed, so the few loud consonants are tucked in without dulling the rest."""
    need = np.minimum(1.0, CEILING / (np.abs(y) + 1e-12))
    hold = int(0.003 * sr)
    g = minimum_filter1d(need, 2 * hold + 1)
    k = np.hanning(2 * hold + 1); k /= k.sum()
    g = np.minimum(np.convolve(g, k, 'same'), need)
    return y * g


def perceived(y, sr):
    """How loud a short call sounds: its integrated loudness, pulled a little toward its loudest moment (a one-word
    call is heard by its stressed syllable as much as by its average), offset so it reads in LUFS."""
    i, m = loudness(y, sr, True)
    return i + PEAK_WEIGHT * (m - i - 1.5)


def level(y, sr):
    """Loudness-normalises a clip to TARGET_LUFS, then limits its peaks; limiting takes a little loudness off, so it
    goes round again until the clip is within 0.1 dB of the target."""
    for _ in range(6):
        y = y * 10 ** ((TARGET_LUFS - perceived(y, sr)) / 20)
        y = limit(y, sr)
        if abs(perceived(y, sr) - TARGET_LUFS) < 0.1:
            break
    return y


def load(path):
    sr, raw = wavfile.read(path)
    x = raw.astype(np.float64)
    if raw.dtype.kind in 'iu':
        x /= float(np.iinfo(raw.dtype).max) + 1
    if x.ndim > 1:
        # The recording is mono in two channels; where they disagree (single-sample clicks where the source clips
        # were joined) the sample is dropped and filled in.
        side = np.abs(x[:, 0] - x[:, 1])
        m = x.mean(1)
        bad = np.where(side > 0.02)[0]
        for i in bad:
            m[i] = 0.5 * (m[max(0, i - 3)] + m[min(len(m) - 1, i + 3)])
        x = m
    return x, sr


def cut(x, sr, a, b):
    y = x[int(a * sr):int(b * sr)].copy()
    y = sosfiltfilt(butter(2, 90, 'high', fs=sr, output='sos'), y)
    # Trim to the words: 10 ms envelope above 4% of its peak, with a little air either side.
    w = int(0.01 * sr)
    e = np.convolve(np.abs(y), np.ones(w) / w, 'same')
    idx = np.where(e > e.max() * 0.04)[0]
    y = y[max(0, idx[0] - int(0.03 * sr)):min(len(y), idx[-1] + int(0.08 * sr))]
    fi, fo = int(0.008 * sr), int(0.04 * sr)
    y[:fi] *= np.linspace(0, 1, fi)
    y[-fo:] *= np.linspace(1, 0, fo) ** 2
    y = level(y, sr)
    return resample_poly(y, OUT_SR, sr) if sr != OUT_SR else y


def mp3(x, sr):
    enc = lameenc.Encoder()
    enc.set_bit_rate(48); enc.set_in_sample_rate(sr); enc.set_channels(1); enc.set_quality(2)
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes()
    return enc.encode(pcm) + enc.flush()


def main():
    x, sr = load(sys.argv[1])
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, '..', 'Game', 'js', 'voice-data.js')
    with open(path, 'w') as f:
        f.write('// Generated by scripts/splice-voice.py: the Classic announcer, cut from the Tetris Worlds announcer.\n')
        f.write('(function (root) {\n  const L = (root.Lull = root.Lull || {});\n  L.VOICE_CLIPS = {\n')
        for key, (a, b, said) in CLIPS.items():
            y = cut(x, sr, a, b)
            b64 = base64.b64encode(mp3(y, OUT_SR)).decode('ascii')
            print('%-13s %6.2f-%6.2f  %-14s %.2fs %5d bytes  %5.1f LUFS  peak %5.1f dBFS' % (key, a, b, said, len(y) / OUT_SR, len(b64) * 3 // 4, perceived(y, OUT_SR), 20 * np.log10(np.abs(y).max())))
            f.write('    %s: \'%s\', // "%s"\n' % (key, b64, said))
        f.write('  };\n})(typeof globalThis !== \'undefined\' ? globalThis : this);\n')
    print('wrote', os.path.normpath(path))


if __name__ == '__main__':
    main()
