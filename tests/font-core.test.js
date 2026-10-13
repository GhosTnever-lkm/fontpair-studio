import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFontFaceCss, buildThemeCss, detectFontFormat, escapeCssString, sanitizeFamilyName, slugifyToken } from '../font-core.js';

test('detects formats by extension and falls back to known MIME types', () => {
  assert.equal(detectFontFormat('Новый шрифт.WOFF2'), 'woff2');
  assert.equal(detectFontFormat('font.bin', 'font/otf; charset=binary'), 'opentype');
  assert.equal(detectFontFormat('font.unknown', 'application/font-sfnt'), null);
  assert.equal(detectFontFormat('font.unknown', 'application/octet-stream'), null);
});

test('keeps Unicode family names and normalizes unsafe punctuation', () => {
  assert.equal(sanitizeFamilyName('  Классная «Ракета» '), 'Классная «Ракета»');
  assert.equal(sanitizeFamilyName('A"; color:red/*'), 'A color red');
  assert.equal(slugifyToken('Crème Brûlée'), 'creme-brulee');
});

test('escapes quoted CSS strings, backslashes, and line breaks', () => {
  assert.equal(escapeCssString('"\\\n'), '\\"\\\\\\a ');
});

test('emits only quoted local font paths and rejects traversal', () => {
  const css = buildFontFaceCss({ family: 'Ретро Display', fileName: 'retro.woff2' });
  assert.match(css, /font-family: "Ретро Display"/);
  assert.match(css, /url\("\.\/retro\.woff2"\) format\("woff2"\)/);
  assert.throws(() => buildFontFaceCss({ family: 'Good', fileName: '../evil.ttf' }), TypeError);
  assert.throws(() => buildFontFaceCss({ family: 'Good', fileName: 'evil.ttf\n);body{color:red' }), TypeError);
  assert.throws(() => buildFontFaceCss({ family: 'Good', fileName: 'safe.ttf', weight: '400; color:red' }), TypeError);
});

test('builds deterministic theme CSS without mutating inputs and clamps settings', () => {
  const fonts = [
    { family: 'Книжный Serif', role: 'heading', fileName: 'book.otf', format: 'opentype', weight: 500 },
    { family: 'Чистый Sans', role: 'body', fileName: 'sans.woff2', format: 'woff2' },
  ];
  const original = structuredClone(fonts);
  const settings = { bodySize: 900, headingSize: 40, bodyLineHeight: 1.55, prefix: 'my-theme' };
  const result = buildThemeCss(fonts, settings);
  assert.equal(buildThemeCss(fonts, settings), result);
  assert.deepEqual(fonts, original);
  assert.match(result, /--my-theme-body-size: 32px;/);
  assert.match(result, /--my-theme-heading-size: 40px;/);
  assert.match(result, /--my-theme-heading-family/);
  assert.match(result, /\.my-theme-body \{/);
  assert.ok(result.endsWith('\n'));
});

test('rejects malformed required values instead of producing ambiguous CSS', () => {
  assert.throws(() => buildThemeCss(null), TypeError);
  assert.throws(() => buildThemeCss([{ family: '' }]), TypeError);
  assert.throws(() => escapeCssString(42), TypeError);
});

test('keeps one font face and exports both roles when a font is selected twice', () => {
  const css = buildThemeCss([{ family: 'Same Font', roles: ['heading', 'body'], fileName: 'same.ttf', format: 'truetype' }]);
  assert.equal((css.match(/@font-face/g) || []).length, 1);
  assert.match(css, /--font-pair-heading-family/);
  assert.match(css, /--font-pair-body-family/);
});

test('keeps distinct font families separate when their CSS tokens collide', () => {
  const css = buildThemeCss([
    { family: 'Open Sans', token: 'open sans', role: 'heading' },
    { family: 'Open-Sans', token: 'open-sans', role: 'body' },
  ]);
  assert.match(css, /--font-pair-family-open-sans: "Open Sans", sans-serif;/);
  assert.match(css, /--font-pair-family-open-sans-2: "Open-Sans", sans-serif;/);
  assert.match(css, /--font-pair-heading-family: var\(--font-pair-family-open-sans\);/);
  assert.match(css, /--font-pair-body-family: var\(--font-pair-family-open-sans-2\);/);
});
