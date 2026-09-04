/* Unit tests for the shared settings schema (no browser needed). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../extension/shared/defaults.js');
const { DEFAULTS, LIMITS, normalizeSettings, normalizeHost, hostMatches, normalizeSites } = globalThis.ScrollToScrub;

test('normalizeSettings fills in defaults and drops garbage', () => {
  assert.deepEqual(normalizeSettings(undefined), { ...DEFAULTS });
  assert.deepEqual(normalizeSettings(null), { ...DEFAULTS });
  assert.deepEqual(normalizeSettings('nonsense'), { ...DEFAULTS });
  const s = normalizeSettings({
    enabled: 0,
    secondsPer100px: 'fast',
    requireModifier: 'hyper',
    showHud: true, // pre-1.1 name
    disabledSites: 'Example.com',
    unknownKey: true,
  });
  assert.equal(s.enabled, false);
  assert.equal(s.secondsPer100px, DEFAULTS.secondsPer100px);
  assert.equal(s.requireModifier, 'none');
  assert.equal(s.showTimeline, true);
  assert.deepEqual(s.disabledSites, ['example.com']);
  assert.equal('unknownKey' in s, false);
  assert.equal('axis' in s, false);
  assert.equal(s.trackball, false);
});

test('speed is clamped to its limits and accepts numeric strings', () => {
  assert.equal(normalizeSettings({ secondsPer100px: 1000 }).secondsPer100px, LIMITS.secondsPer100px.max);
  assert.equal(normalizeSettings({ secondsPer100px: 0 }).secondsPer100px, LIMITS.secondsPer100px.min);
  assert.equal(normalizeSettings({ secondsPer100px: '2.5' }).secondsPer100px, 2.5);
  assert.equal(normalizeSettings({ secondsPer100px: NaN }).secondsPer100px, DEFAULTS.secondsPer100px);
});

test('normalizeHost accepts URLs, hosts with ports, paths and www prefixes', () => {
  assert.equal(normalizeHost('https://www.YouTube.com/watch?v=x'), 'youtube.com');
  assert.equal(normalizeHost('www.youtube.com/'), 'youtube.com');
  assert.equal(normalizeHost('  Vimeo.COM:8080/path  '), 'vimeo.com');
  assert.equal(normalizeHost('user:pass@example.org'), 'example.org');
  assert.equal(normalizeHost('*.example.org'), 'example.org');
  assert.equal(normalizeHost('.example.org.'), 'example.org');
  assert.equal(normalizeHost('[::1]:3000'), '[::1]');
  assert.equal(normalizeHost(''), '');
  assert.equal(normalizeHost('   '), '');
  assert.equal(normalizeHost('http://'), '');
  assert.equal(normalizeHost('not a host'), '');
  assert.equal(normalizeHost(null), '');
});

test('hostMatches covers the host itself and its subdomains only', () => {
  assert.equal(hostMatches('youtube.com', 'youtube.com'), true);
  assert.equal(hostMatches('www.youtube.com', 'youtube.com'), true);
  assert.equal(hostMatches('m.youtube.com', 'https://www.youtube.com/'), true);
  assert.equal(hostMatches('notyoutube.com', 'youtube.com'), false);
  assert.equal(hostMatches('youtube.com.evil.example', 'youtube.com'), false);
  assert.equal(hostMatches('', 'youtube.com'), false);
  assert.equal(hostMatches('youtube.com', ''), false);
});

test('normalizeSites splits on newlines and commas, dedupes and normalizes', () => {
  assert.deepEqual(normalizeSites('a.com\nB.com, https://www.a.com/x\n\n'), ['a.com', 'b.com']);
  assert.deepEqual(DEFAULTS.disabledSites, ['netflix.com']);
  assert.deepEqual(normalizeSites(['x.org', 'x.org', '']), ['x.org']);
  assert.deepEqual(normalizeSites(42), []);
});
