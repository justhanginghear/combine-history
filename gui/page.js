"use strict";
/** The GUI's single HTML page: a form plus a live-updating log panel. */

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
    <input type="text" id="repo" name="repo" value="." placeholder="C:\\path\\to\\repo or ." required />

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
</script>
</body>
</html>`;
}

module.exports = { renderPage };
