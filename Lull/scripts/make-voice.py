#!/usr/bin/env python3
"""Renders Classic's whispering announcer into Game/js/voice-data.js.

The phrases are spoken by one soft, low-pitched female speaker of Piper's LibriTTS voice (LibriTTS, CC BY 4.0:
Zen et al., http://www.openslr.org/60/) and turned into a close, gentle whisper:

  - the spectral envelope (the shape of the mouth, without the pitch) is taken from each frame by cepstral
    smoothing, smoothed again across neighbouring frames so nothing flickers, and laid over soft noise — breath
    shaped like the words;
  - low rumble is cut and the top is rolled off, so the breath is warm rather than hissy;
  - a little of the real voice is kept underneath, low-passed, the way a soft whisper still carries a trace of
    tone; that is what keeps it human and calm rather than hollow;
  - gentle onsets, a light compressor, and no reverb.

The clips are encoded as small MP3s and embedded as base64: no files, no network, the same on every machine.

Needs: pip install piper-tts numpy scipy lameenc, and the voice from
https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-en-us-libritts-high.tar.gz

    python3 Lull/scripts/make-voice.py path/to/en-us-libritts-high.onnx [speaker] [breath]
"""
import base64, io, os, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt, sosfiltfilt
from piper import PiperVoice
from piper.config import SynthesisConfig
import lameenc

PHRASES = {
    'single': 'single.', 'double': 'double.', 'triple': 'triple.', 'tetris': 'tetris.',
    'tspin': 'tee spin.', 'mini': 'mini.', 'b2b': 'back to back.', 'perfect': 'perfect clear.',
    'levelup': 'next level.', 'gameover': 'game over.',
}
SPEAKER = 6        # soft, warm, unhurried (around 230 Hz)
BREATH = 0.18      # how much of the real voice stays under the whisper


def speak(voice, text, speaker):
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        voice.synthesize_wav(text, w, syn_config=SynthesisConfig(speaker_id=speaker, length_scale=1.25, noise_scale=0.4, noise_w_scale=0.5))
    buf.seek(0)
    with wave.open(buf, 'rb') as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768.0
    return x, sr


def whisper(x, sr, seed, breath=BREATH):
    rng = np.random.default_rng(seed)
    n, hop = 1024, 128
    win = np.hanning(n)
    pad = np.concatenate([np.zeros(n), x, np.zeros(n)])
    frames = [pad[s:s + n] * win for s in range(0, len(pad) - n, hop)]
    spec = np.array([np.fft.rfft(f) for f in frames])
    # Spectral envelope by cepstral smoothing: keep the formants, lose the harmonics (the pitch).
    logmag = np.log(np.abs(spec) + 1e-7)
    ceps = np.fft.irfft(logmag, axis=1)
    lift = 34
    ceps[:, lift:-lift] = 0
    env = np.fft.rfft(ceps, axis=1).real
    # Smooth over time (about 30 ms) so the breath does not flutter.
    k = np.array([1, 2, 3, 2, 1], dtype=float); k /= k.sum()
    env = np.apply_along_axis(lambda c: np.convolve(c, k, mode='same'), 0, env)
    mag = np.exp(env)
    # Whisper colour: little below 250 Hz, warm through the middle, rolled off above ~5 kHz.
    f = np.fft.rfftfreq(n, 1 / sr)
    shape = (f / 250) ** 2 / (1 + (f / 250) ** 2) / np.sqrt(1 + (f / 5000) ** 4)
    noise = (rng.standard_normal(spec.shape) + 1j * rng.standard_normal(spec.shape)) / np.sqrt(2)
    y = np.zeros(len(pad))
    norm = np.zeros(len(pad))
    for i, s in enumerate(range(0, len(pad) - n, hop)):
        fr = np.fft.irfft(mag[i] * shape * noise[i], n) * win
        y[s:s + n] += fr
        norm[s:s + n] += win ** 2
    y = (y / np.maximum(norm, 1e-6))[n:n + len(x)]
    # A trace of the real voice, soft and low, underneath.
    lp = butter(4, 1400, 'low', fs=sr, output='sos')
    voice = sosfiltfilt(lp, x)
    y = y / (np.abs(y).max() + 1e-9) + breath * voice / (np.abs(voice).max() + 1e-9)
    y = sosfilt(butter(2, 140, 'high', fs=sr, output='sos'), y)
    # Soft onsets and a light compressor (evens the words out, as a close whisper is).
    env_a = np.convolve(np.abs(y), np.ones(int(0.015 * sr)) / int(0.015 * sr), 'same')
    gain = 1 / np.maximum(env_a / (env_a.max() + 1e-9), 0.25) ** 0.35
    y = y * gain
    # Trim, fade, normalise.
    e = np.convolve(np.abs(y), np.ones(int(0.02 * sr)) / int(0.02 * sr), 'same')
    idx = np.where(e > e.max() * 0.03)[0]
    if len(idx):
        y = y[max(0, idx[0] - int(0.04 * sr)):min(len(y), idx[-1] + int(0.12 * sr))]
    fade = int(0.03 * sr)
    y[:fade] *= np.linspace(0, 1, fade) ** 2
    y[-fade:] *= np.linspace(1, 0, fade) ** 2
    return y / (np.abs(y).max() + 1e-9) * 0.6


def mp3(x, sr):
    enc = lameenc.Encoder()
    enc.set_bit_rate(48); enc.set_in_sample_rate(sr); enc.set_channels(1); enc.set_quality(2)
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes()
    return enc.encode(pcm) + enc.flush()


def main():
    onnx = sys.argv[1]
    speaker = int(sys.argv[2]) if len(sys.argv) > 2 else SPEAKER
    breath = float(sys.argv[3]) if len(sys.argv) > 3 else BREATH
    voice = PiperVoice.load(onnx, config_path=onnx + '.json')
    clips = {}
    for i, (key, text) in enumerate(PHRASES.items()):
        x, sr = speak(voice, text, speaker)
        clips[key] = base64.b64encode(mp3(whisper(x, sr, 7 + i, breath), sr)).decode('ascii')
        print(key, len(clips[key]) * 3 // 4, 'bytes')
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, '..', 'Game', 'js', 'voice-data.js')
    with open(path, 'w') as f:
        f.write('// Generated by scripts/make-voice.py: the Classic announcer, whispered.\n')
        f.write('// Voice: Piper LibriTTS (high), speaker %d. Data: LibriTTS, CC BY 4.0 (Zen et al., openslr.org/60).\n' % speaker)
        f.write('(function (root) {\n  const L = (root.Lull = root.Lull || {});\n  L.VOICE_CLIPS = {\n')
        for key, b64 in clips.items():
            f.write('    %s: \'%s\',\n' % (key, b64))
        f.write('  };\n})(typeof globalThis !== \'undefined\' ? globalThis : this);\n')
    print('wrote', os.path.normpath(path))


if __name__ == '__main__':
    main()
