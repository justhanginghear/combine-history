"use strict";
/** The GUI's single HTML page: a form, a repo-path autocomplete, a live theme preview, and a log panel. */

function renderPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>combine-history</title>
<style>
  :root {
    --bg: #f4f6fb;
    --surface: #ffffff;
    --text: #1c2333;
    --muted: #6b7386;
    --accent: #4f5dff;
    --accent-soft: #eef0ff;
    --border: #e4e7f0;
    --shadow: 0 1px 3px rgba(28, 35, 51, 0.06), 0 8px 24px rgba(28, 35, 51, 0.04);
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Segoe UI', sans-serif;
    max-width: 720px;
    margin: 0 auto;
    padding: 40px 20px 80px;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
  }
  h1 { font-size: 1.6em; letter-spacing: -0.02em; margin-bottom: 2px; }
  p.tagline { color: var(--muted); margin-top: 0; }
  form {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 24px 28px 28px;
  }
  label {
    display: block;
    font-size: 0.85em;
    font-weight: 600;
    margin: 16px 0 6px;
    color: var(--muted);
  }
  label:first-of-type { margin-top: 0; }
  input[type="text"] {
    width: 100%;
    padding: 9px 11px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.95em;
    font-family: inherit;
  }
  input[type="text"]:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .field { position: relative; }
  .row { display: flex; gap: 16px; }
  .row > div { flex: 1; }
  .colorRow { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
  .colorRow label { margin: 0; }
  input[type="color"] {
    width: 40px; height: 32px; padding: 0; border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
  }
  .checkRow { display: flex; align-items: center; gap: 8px; margin-top: 16px; }
  .checkRow label { margin: 0; font-weight: 500; color: var(--text); }
  button {
    margin-top: 22px;
    width: 100%;
    padding: 11px;
    border: none;
    border-radius: 8px;
    background: var(--accent);
    color: white;
    font-size: 1em;
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: default; }
  button:not(:disabled):hover { filter: brightness(1.08); }

  /* Repo-path autocomplete dropdown */
  .suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--shadow);
    max-height: 220px;
    overflow-y: auto;
    z-index: 10;
    display: none;
  }
  .suggestions.visible { display: block; }
  .suggestion-item {
    padding: 8px 12px;
    cursor: pointer;
    font-size: 0.88em;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .suggestion-item span.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .suggestion-item:hover, .suggestion-item.active { background: var(--accent-soft); }
  .suggestion-item .badge {
    flex-shrink: 0;
    font-size: 0.72em;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-soft);
    padding: 1px 6px;
    border-radius: 5px;
  }

  /* Live theme preview */
  .previewLabel { margin: 16px 0 6px; }
  #previewCanvas { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  #previewPage {
    --p-bg: #f4f6fb; --p-surface: #ffffff; --p-text: #1c2333; --p-muted: #6b7386;
    --p-accent: #4f5dff; --p-accent-soft: #eef0ff; --p-border: #e4e7f0;
    background: var(--p-bg);
    color: var(--p-text);
    padding: 18px 20px;
    font-family: -apple-system, 'Segoe UI', sans-serif;
    transition: background 0.15s;
  }
  #previewPage h1 { font-size: 1.15em; margin: 0 0 2px; letter-spacing: -0.02em; }
  .previewSub { color: var(--p-muted); margin: 0 0 14px; font-size: 0.78em; }
  .previewCard {
    background: var(--p-surface);
    border: 1px solid var(--p-border);
    border-radius: 10px;
    padding: 14px 16px 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }
  .previewCard h2 { margin: 0 0 4px; font-size: 0.98em; color: var(--p-text); }
  .previewMeta { color: var(--p-muted); margin: 0; font-size: 0.76em; }
  .previewMeta code {
    background: var(--p-accent-soft);
    color: var(--p-accent);
    padding: 2px 6px;
    border-radius: 5px;
    font-size: 0.95em;
  }

  #log {
    margin-top: 20px;
    background: #14161f;
    color: #d7dae6;
    border-radius: 10px;
    padding: 16px 18px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 0.85em;
    white-space: pre-wrap;
    max-height: 320px;
    overflow-y: auto;
    display: none;
  }
  #log.visible { display: block; }
  #status { margin-top: 10px; font-size: 0.9em; color: var(--muted); }
</style>
</head>
<body>
  <h1>combine-history</h1>
  <p class="tagline">Render a git repo's full history as one browsable HTML changelog.</p>

  <form id="genForm">
    <label for="repo">Repository path</label>
    <div class="field">
      <input type="text" id="repo" name="repo" value="." placeholder="C:\\path\\to\\repo or ." autocomplete="off"
             role="combobox" aria-expanded="false" aria-controls="repoSuggestions" aria-autocomplete="list" required />
      <div id="repoSuggestions" class="suggestions" role="listbox"></div>
    </div>

    <label for="outFile">Output file</label>
    <input type="text" id="outFile" name="outFile" value="combined_history.html" required />

    <label for="title">Page title</label>
    <input type="text" id="title" name="title" placeholder="Project Change Log" />

    <div class="colorRow">
      <label for="accent">Accent</label>
      <input type="color" id="accent" name="accent" value="#4f5dff" />
      <label for="background" style="margin-left: 18px;">Background</label>
      <input type="color" id="background" name="background" value="#f4f6fb" />
    </div>

    <div class="checkRow">
      <input type="checkbox" id="dark" name="dark" />
      <label for="dark">Dark mode</label>
    </div>
    <div class="checkRow">
      <input type="checkbox" id="open" name="open" checked />
      <label for="open">Open report when done</label>
    </div>

    <label class="previewLabel">Preview</label>
    <div id="previewCanvas">
      <div id="previewPage">
        <h1 id="previewTitle">Project Change Log</h1>
        <p class="previewSub">3 commits, generated 2026-08-16</p>
        <div class="previewCard">
          <h2>Example commit message</h2>
          <p class="previewMeta">2026-08-16 12:00 &nbsp;&middot;&nbsp; Author Name &nbsp;&middot;&nbsp; <code>abc1234</code></p>
        </div>
      </div>
    </div>

    <button id="submitBtn" type="submit">Generate</button>
    <div id="status"></div>
  </form>

  <pre id="log"></pre>

<script>
const form = document.getElementById('genForm');
const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submitBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  logEl.textContent = '';
  logEl.classList.add('visible');
  statusEl.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Generating…';

  const data = new URLSearchParams(new FormData(form));
  // Checkboxes only appear in FormData when checked; normalize explicitly.
  data.set('dark', document.getElementById('dark').checked ? 'on' : 'off');
  data.set('open', document.getElementById('open').checked ? 'on' : 'off');

  try {
    const res = await fetch('/generate', { method: 'POST', body: data });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      logEl.textContent += decoder.decode(value, { stream: true });
      logEl.scrollTop = logEl.scrollHeight;
    }
    statusEl.textContent = res.ok ? 'Done.' : 'Finished with errors — see log above.';
  } catch (err) {
    logEl.textContent += '\\nRequest failed: ' + err.message;
    statusEl.textContent = 'Request failed.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Generate';
  }
});

// --- Repository path autocomplete ---------------------------------------
const repoInput = document.getElementById('repo');
const suggestBox = document.getElementById('repoSuggestions');
let suggestTimer = null;
let activeIndex = -1;

async function fetchSuggestions(value) {
  try {
    const res = await fetch('/browse?path=' + encodeURIComponent(value));
    if (!res.ok) return [];
    const data = await res.json();
    return data.entries || [];
  } catch {
    return [];
  }
}

function renderSuggestions(entries) {
  suggestBox.innerHTML = '';
  activeIndex = -1;
  if (!entries.length) {
    suggestBox.classList.remove('visible');
    repoInput.setAttribute('aria-expanded', 'false');
    return;
  }
  entries.forEach((entry, i) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.id = 'repoSuggestion-' + i;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.name;
    item.appendChild(name);
    if (entry.isRepo) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'git repo';
      item.appendChild(badge);
    }
    item.addEventListener('mousedown', (evt) => {
      evt.preventDefault();
      repoInput.value = entry.path;
      scheduleSuggest(entry.path);
      repoInput.focus();
    });
    suggestBox.appendChild(item);
  });
  suggestBox.classList.add('visible');
  repoInput.setAttribute('aria-expanded', 'true');
}

function scheduleSuggest(value) {
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(async () => {
    renderSuggestions(await fetchSuggestions(value));
  }, 150);
}

function highlightActive() {
  const items = suggestBox.querySelectorAll('.suggestion-item');
  items.forEach((it, i) => {
    const isActive = i === activeIndex;
    it.classList.toggle('active', isActive);
    it.setAttribute('aria-selected', String(isActive));
  });
  if (activeIndex >= 0) {
    items[activeIndex].scrollIntoView({ block: 'nearest' });
    repoInput.setAttribute('aria-activedescendant', items[activeIndex].id);
  } else {
    repoInput.removeAttribute('aria-activedescendant');
  }
}

repoInput.addEventListener('input', () => scheduleSuggest(repoInput.value));
repoInput.addEventListener('focus', () => scheduleSuggest(repoInput.value));
repoInput.addEventListener('blur', () => {
  // Let a pending mousedown-on-suggestion fire before the list disappears.
  setTimeout(() => {
    suggestBox.classList.remove('visible');
    repoInput.setAttribute('aria-expanded', 'false');
  }, 150);
});
repoInput.addEventListener('keydown', (e) => {
  const items = suggestBox.querySelectorAll('.suggestion-item');
  if (!items.length || !suggestBox.classList.contains('visible')) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, items.length - 1);
    highlightActive();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    highlightActive();
  } else if (e.key === 'Enter' && activeIndex >= 0) {
    e.preventDefault();
    items[activeIndex].dispatchEvent(new Event('mousedown'));
  } else if (e.key === 'Escape') {
    suggestBox.classList.remove('visible');
  }
});

// --- Live theme preview --------------------------------------------------
// Mirrors lib/render.js's resolveTheme() color math so the preview matches
// the real report exactly, without a server round trip.
function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(rgb) {
  return '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function mixHex(a, b, t) {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  return rgbToHex(pa.map((v, i) => v + (pb[i] - v) * t));
}

const titleInput = document.getElementById('title');
const accentInput = document.getElementById('accent');
const bgInput = document.getElementById('background');
const darkInput = document.getElementById('dark');
const previewPage = document.getElementById('previewPage');
const previewTitle = document.getElementById('previewTitle');

let bgTouchedByUser = false;
bgInput.addEventListener('input', () => { bgTouchedByUser = true; });

// If the user hasn't manually picked a background, toggling dark mode
// should swap it to a sensible default instead of leaving a light
// background under dark-mode text/card colors.
darkInput.addEventListener('change', () => {
  if (!bgTouchedByUser) {
    bgInput.value = darkInput.checked ? '#12131a' : '#f4f6fb';
  }
  updatePreview();
});

function updatePreview() {
  const dark = darkInput.checked;
  const accent = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accentInput.value) ? accentInput.value : '#4f5dff';
  const bg = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(bgInput.value) ? bgInput.value : (dark ? '#12131a' : '#f4f6fb');
  const surface = dark ? mixHex(bg, '#ffffff', 0.09) : '#ffffff';
  const text = dark ? '#e8e9f3' : '#1c2333';
  const muted = dark ? '#9198b0' : '#6b7386';
  const border = dark ? mixHex(bg, '#ffffff', 0.16) : '#e4e7f0';
  const accentSoft = mixHex(surface, accent, dark ? 0.3 : 0.12);

  previewPage.style.setProperty('--p-bg', bg);
  previewPage.style.setProperty('--p-surface', surface);
  previewPage.style.setProperty('--p-text', text);
  previewPage.style.setProperty('--p-muted', muted);
  previewPage.style.setProperty('--p-accent', accent);
  previewPage.style.setProperty('--p-accent-soft', accentSoft);
  previewPage.style.setProperty('--p-border', border);

  previewTitle.textContent = titleInput.value.trim() || 'Project Change Log';
}

[titleInput, accentInput, bgInput].forEach((el) => el.addEventListener('input', updatePreview));
updatePreview();
</script>
</body>
</html>`;
}

module.exports = { renderPage };
