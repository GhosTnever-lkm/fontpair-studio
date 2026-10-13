const EXTENSIONS = Object.freeze({ woff2: 'woff2', woff: 'woff', otf: 'opentype', ttf: 'truetype' });
const MIMES = Object.freeze({
  'font/woff2': 'woff2', 'application/font-woff2': 'woff2', 'font/woff': 'woff',
  'application/font-woff': 'woff', 'font/otf': 'opentype', 'application/x-font-otf': 'opentype',
  'font/ttf': 'truetype', 'application/x-font-ttf': 'truetype',
});
const WEIGHTS = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900]);
const STYLES = new Set(['normal', 'italic', 'oblique']);
const DISPLAYS = new Set(['auto', 'block', 'swap', 'fallback', 'optional']);
const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function bounded(value, min, max, fallback, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const number = integer ? Math.trunc(value) : value;
  return Math.min(max, Math.max(min, number));
}

function isSafeLocalFileName(name) {
  return typeof name === 'string' && name.trim() !== '' && !/[\\/\0]/.test(name) &&
    !name.includes('..') && !/[\u0000-\u001f\u007f]/.test(name) && !/^[a-z][\w+.-]*:/i.test(name);
}

export function detectFontFormat(fileName, mimeType = '') {
  if (typeof fileName === 'string') {
    const extension = /\.([a-z0-9]+)$/i.exec(fileName.trim())?.[1]?.toLowerCase();
    if (extension && Object.hasOwn(EXTENSIONS, extension)) return EXTENSIONS[extension];
  }
  if (typeof mimeType === 'string') return MIMES[mimeType.split(';')[0].trim().toLowerCase()] ?? null;
  return null;
}

export function sanitizeFamilyName(name) {
  if (typeof name !== 'string') throw new TypeError('name must be a string');
  const clean = name.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f"'\\/<>{};:!@#$%^&*()[\]=+|~`?]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 128).trim();
  return clean || 'Unnamed Font';
}

export function escapeCssString(value) {
  if (typeof value !== 'string') throw new TypeError('value must be a string');
  return [...value].map(char => {
    const code = char.codePointAt(0);
    if (char === '"') return '\\"';
    if (char === '\\') return '\\\\';
    if (code < 32 || code === 127) return `\\${code.toString(16)} `;
    return char;
  }).join('');
}

export function slugifyToken(name) {
  if (typeof name !== 'string') throw new TypeError('name must be a string');
  const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/g, '');
  return slug || 'font';
}

export function buildFontFaceCss(options) {
  if (!isPlain(options)) throw new TypeError('options must be an object');
  const { family, fileName } = options;
  if (typeof family !== 'string' || !family.trim() || !isSafeLocalFileName(fileName)) {
    throw new TypeError('family and safe fileName are required');
  }
  const format = options.format ?? detectFontFormat(fileName);
  const weight = options.weight ?? 400;
  const style = options.style ?? 'normal';
  const display = options.display ?? 'swap';
  if (!['woff2', 'woff', 'opentype', 'truetype'].includes(format)) throw new TypeError('unsupported font format');
  if (!WEIGHTS.has(weight) || !STYLES.has(style) || !DISPLAYS.has(display)) throw new TypeError('invalid font descriptor');
  return `@font-face {\n  font-family: "${escapeCssString(sanitizeFamilyName(family))}";\n  src: url("./${escapeCssString(fileName)}") format("${format}");\n  font-weight: ${weight};\n  font-style: ${style};\n  font-display: ${display};\n}\n`;
}

export function buildThemeCss(fonts, settings = {}) {
  if (!Array.isArray(fonts)) throw new TypeError('fonts must be an array');
  if (!isPlain(settings)) settings = {};
  const usedTokens = new Set();
  const entries = fonts.map(font => {
    if (!isPlain(font) || typeof font.family !== 'string' || !font.family.trim()) {
      throw new TypeError('each font needs a family');
    }
    const family = sanitizeFamilyName(font.family);
    const roles = Array.isArray(font.roles) ? font.roles : [font.role];
    const baseToken = slugifyToken(font.token || family);
    let token = baseToken;
    let suffix = 2;
    while (usedTokens.has(token)) {
      const ending = `-${suffix++}`;
      token = `${baseToken.slice(0, 64 - ending.length).replace(/-+$/g, '')}${ending}`;
    }
    usedTokens.add(token);
    return {
      family,
      token,
      roles: new Set(roles.filter(role => role === 'heading' || role === 'body')),
      fileName: font.fileName,
      format: font.format,
      weight: WEIGHTS.has(font.weight) ? font.weight : 400,
      style: STYLES.has(font.style) ? font.style : 'normal',
    };
  });
  const prefix = /^[a-z][a-z0-9-]{0,31}$/.test(settings.prefix || 'font-pair') ? settings.prefix || 'font-pair' : 'font-pair';
  const lines = [];
  const faces = new Map();
  const sortedFiles = [...entries].filter(font => font.fileName)
    .sort((a, b) => a.token.localeCompare(b.token) || a.family.localeCompare(b.family));
  for (const font of sortedFiles) {
    try {
      const css = buildFontFaceCss({ ...font, display: 'swap' }).trimEnd();
      const key = [font.fileName, font.family, font.weight, font.style].join('\0');
      if (!faces.has(key)) faces.set(key, css);
    } catch { /* Invalid or ambiguous local paths are omitted. */ }
  }
  lines.push(...faces.values());
  if (lines.length) lines.push('');

  const aliasesByToken = new Map();
  for (const font of entries) if (!aliasesByToken.has(font.token)) aliasesByToken.set(font.token, font.family);
  const aliases = [...aliasesByToken].sort(([left], [right]) => left.localeCompare(right));
  const heading = entries.find(font => font.roles.has('heading'));
  const body = entries.find(font => font.roles.has('body'));
  const bodySize = bounded(settings.bodySize, 12, 32, 16, true);
  const headingSize = bounded(settings.headingSize, 16, 96, 36, true);
  const bodyLine = bounded(settings.bodyLineHeight, 1, 3, 1.5);
  const headingLine = bounded(settings.headingLineHeight, 1, 3, 1.2);
  const bodyTrack = bounded(settings.bodyLetterSpacing, -2, 10, 0);
  const headingTrack = bounded(settings.headingLetterSpacing, -2, 10, 0);

  lines.push(':root {');
  for (const [token, family] of aliases) lines.push(`  --${prefix}-family-${token}: "${escapeCssString(family)}", sans-serif;`);
  if (heading) lines.push(`  --${prefix}-heading-family: var(--${prefix}-family-${heading.token});`);
  if (body) lines.push(`  --${prefix}-body-family: var(--${prefix}-family-${body.token});`);
  lines.push(`  --${prefix}-body-size: ${bodySize}px;`, `  --${prefix}-heading-size: ${headingSize}px;`,
    `  --${prefix}-body-line-height: ${bodyLine};`, `  --${prefix}-heading-line-height: ${headingLine};`,
    `  --${prefix}-body-letter-spacing: ${bodyTrack}px;`, `  --${prefix}-heading-letter-spacing: ${headingTrack}px;`, '}');
  if (body) lines.push('', `.${prefix}-body {`, `  font-family: var(--${prefix}-body-family);`, `  font-size: var(--${prefix}-body-size);`, `  line-height: var(--${prefix}-body-line-height);`, `  letter-spacing: var(--${prefix}-body-letter-spacing);`, '}');
  if (heading) lines.push('', `.${prefix}-heading {`, `  font-family: var(--${prefix}-heading-family);`, `  font-size: var(--${prefix}-heading-size);`, `  line-height: var(--${prefix}-heading-line-height);`, `  letter-spacing: var(--${prefix}-heading-letter-spacing);`, '}');
  return lines.join('\n') + '\n';
}
