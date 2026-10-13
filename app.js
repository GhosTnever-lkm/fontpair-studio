import { buildThemeCss, detectFontFormat, sanitizeFamilyName } from './font-core.js';

const $ = (id) => document.getElementById(id);
const input = $('font-files');
const shelf = $('font-shelf');
const empty = $('empty-shelf');
const fonts = new Map();
const objectUrls = new Map();
let pendingFontLoads = 0;
let nextId = 1;
let toastTimer;

const presets = [
  { id: 'preset-serif', name: 'Editorial Serif', css: 'Georgia, "Times New Roman", serif', role: 'heading', weight: 400 },
  { id: 'preset-sans', name: 'Quiet Sans', css: 'Arial, Helvetica, sans-serif', role: 'body', weight: 400 },
  { id: 'preset-mono', name: 'Studio Mono', css: 'ui-monospace, SFMono-Regular, Consolas, monospace', role: '', weight: 400 },
];

function allFonts() { return [...presets, ...fonts.values()]; }
function familyValue(font) { return font.css || `"${font.name.replaceAll('"', '\\"')}"`; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }

function announce(message) {
  $('toast').textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 2800);
}

function updateSelects() {
  const entries = allFonts();
  for (const [select, role, fallback] of [[$('heading-font'), 'heading', 'preset-serif'], [$('body-font'), 'body', 'preset-sans']]) {
    const previous = select.value;
    select.replaceChildren(...entries.map(font => {
      const option = document.createElement('option');
      option.value = font.id;
      option.textContent = `${font.name}${font.preset ? ' · системный' : ''}`;
      return option;
    }));
    select.value = entries.some(font => font.id === previous) ? previous : entries.find(font => font.role === role)?.id || fallback;
  }
}

function fontFor(id) { return allFonts().find(font => font.id === id) || presets[0]; }

function renderShelf() {
  shelf.replaceChildren();
  for (const font of fonts.values()) {
    const tile = document.createElement('article');
    tile.className = 'font-tile';
    tile.innerHTML = `<button class="remove-font" type="button" aria-label="Удалить ${escapeHtml(font.name)}">×</button><h3>${escapeHtml(font.name)}</h3><p>The five boxing wizards jump quickly. Съешь же ещё этих мягких булок.</p><div class="tile-meta"><span>${font.format.toUpperCase()} · ${font.sizeLabel}</span><span>LOCAL FILE</span></div>`;
    tile.style.setProperty('--font-family', `"${font.cssName}"`);
    tile.querySelector('button').addEventListener('click', () => removeFont(font.id));
    shelf.append(tile);
  }
  $('font-count').textContent = String(fonts.size);
  empty.hidden = fonts.size > 0;
  updateSelects();
  updatePreview();
}

function removeFont(id) {
  const font = fonts.get(id);
  if (!font) return;
  document.fonts.delete(font.face);
  URL.revokeObjectURL(objectUrls.get(id));
  objectUrls.delete(id);
  fonts.delete(id);
  renderShelf();
  announce('Шрифт удалён с полки.');
}

async function addFiles(fileList) {
  const accepted = [...fileList].filter(file => detectFontFormat(file.name, file.type));
  if (!accepted.length) { announce('Выбери файл TTF, OTF, WOFF или WOFF2.'); return; }
  for (const file of accepted) {
    if (fonts.size + pendingFontLoads >= 6) { announce('На полке помещается до 6 локальных файлов.'); break; }
    const format = detectFontFormat(file.name, file.type);
    const id = `font-${nextId++}`;
    const url = URL.createObjectURL(file);
    const family = `FontPair_${id.replaceAll('-', '_')}`;
    const face = new FontFace(family, `url("${url}")`, { style: 'normal', weight: '100 900' });
    try {
      pendingFontLoads += 1;
      await face.load();
      document.fonts.add(face);
      const raw = file.name.replace(/\.(ttf|otf|woff2?)$/i, '');
      const name = sanitizeFamilyName(raw);
      fonts.set(id, { id, name, cssName: family, format, role: '', weight: 400, face, fileName: file.name, size: file.size, sizeLabel: file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB` });
      objectUrls.set(id, url);
    } catch {
      URL.revokeObjectURL(url);
      announce(`Не удалось прочитать ${file.name}.`);
    } finally {
      pendingFontLoads -= 1;
    }
  }
  renderShelf();
  if (fonts.size) announce('Файлы обработаны локально в этой вкладке.');
}

function updatePreview() {
  const heading = fontFor($('heading-font').value || 'preset-serif');
  const body = fontFor($('body-font').value || 'preset-sans');
  const headingCSS = familyValue(heading), bodyCSS = familyValue(body);
  $('specimen-preview').style.setProperty('--heading-font', headingCSS);
  $('specimen-preview').style.setProperty('--body-font', bodyCSS);
  $('pair-heading').style.setProperty('--pair-heading', headingCSS);
  $('pair-body').style.setProperty('--pair-body', bodyCSS);
  $('heading-name').textContent = heading.name;
  $('body-name').textContent = body.name;
  $('preview-heading').textContent = $('sample-text').value.split('\n')[0] || 'Find your type of beautiful.';
  $('preview-body').textContent = $('sample-text').value.split('\n').slice(1).join(' ') || 'Хорошая типографика помогает содержанию звучать ясно. Сравнивай характер, ритм и читаемость рядом.';
  $('specimen-preview').style.setProperty('--heading-size', `${$('size-control').value}px`);
  $('specimen-preview').style.setProperty('--leading', String(Number($('leading-control').value) / 100));
  $('size-value').value = `${$('size-control').value} px`;
  $('leading-value').value = (Number($('leading-control').value) / 100).toFixed(2);
}

function exportCss() {
  const heading = fontFor($('heading-font').value || 'preset-serif');
  const body = fontFor($('body-font').value || 'preset-sans');
  const byId = new Map();
  const selectedFonts = heading.id === body.id ? [heading] : [heading, body];
  for (const font of [...selectedFonts, ...fonts.values()]) {
    byId.set(font.id, { family: font.name, roles: [], fileName: font.fileName, format: font.format, weight: font.weight });
  }
  byId.get(heading.id).roles.push('heading');
  byId.get(body.id).roles.push('body');
  const exportFonts = [...byId.values()];
  const css = buildThemeCss(exportFonts, { bodySize: 16, headingSize: Number($('size-control').value), bodyLineHeight: 1.6, headingLineHeight: Number($('leading-control').value) / 100 });
  $('css-output').value = css;
  $('export-panel').hidden = false;
}

input.addEventListener('change', event => { addFiles(event.target.files); input.value = ''; });
$('drop-zone').addEventListener('click', () => input.click());
$('drop-zone').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); } });
for (const eventName of ['dragenter', 'dragover']) $('drop-zone').addEventListener(eventName, event => { event.preventDefault(); $('drop-zone').classList.add('is-over'); });
for (const eventName of ['dragleave', 'drop']) $('drop-zone').addEventListener(eventName, event => { event.preventDefault(); $('drop-zone').classList.remove('is-over'); });
$('drop-zone').addEventListener('drop', event => addFiles(event.dataTransfer.files));
$('load-presets').addEventListener('click', () => { $('heading-font').value = 'preset-serif'; $('body-font').value = 'preset-sans'; updatePreview(); announce('Системные примеры готовы к сравнению.'); });
for (const id of ['heading-font','body-font','sample-text','size-control','leading-control']) $(id).addEventListener('input', updatePreview);
$('export-button').addEventListener('click', exportCss);
$('export-top').addEventListener('click', () => { exportCss(); $('export-panel').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
$('copy-css').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('css-output').value); announce('CSS скопирован в буфер обмена.'); } catch { $('css-output').select(); announce('Выделил CSS — скопируй его сочетанием клавиш.'); } });
$('download-css').addEventListener('click', () => { const blob = new Blob([$('css-output').value], { type: 'text/css;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'font-theme.css'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); });
window.addEventListener('pagehide', () => { for (const url of objectUrls.values()) URL.revokeObjectURL(url); });
renderShelf();
