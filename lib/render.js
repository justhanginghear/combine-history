"use strict";
/**
 * Core render logic, shared by the CLI (bin/combine_history.js) and the
 * GUI (gui/server.js). Pure Node, no HTTP/console concerns in here —
 * progress and log lines go out through the onProgress/onLog callbacks
 * so each front-end can present them however it wants.
 */

const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const MAX_BUFFER = 1024 * 1024 * 200; // 200MB, some diffs render large HTML

const DEFAULT_THEME = {
  title: "Project Change Log",
  accent: "#4f5dff",
  background: "#f4f6fb",
  dark: false,
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isValidHexColor(c) {
  return HEX_RE.test(c);
}

function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

// t=0 -> pure a, t=1 -> pure b
function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * t));
}

function resolveTheme(opts = {}) {
  for (const [key, val] of Object.entries({ accent: opts.accent, background: opts.background })) {
    if (val !== undefined && val !== null && val !== "" && !isValidHexColor(val)) {
      throw new Error(`Invalid ${key} color: "${val}" (expected a hex color like #4f5dff)`);
    }
  }

  const dark = !!opts.dark;
  const accent = opts.accent || DEFAULT_THEME.accent;
  const background = opts.background || (dark ? "#12131a" : DEFAULT_THEME.background);
  const surface = dark ? mix(background, "#ffffff", 0.09) : "#ffffff";
  const text = dark ? "#e8e9f3" : "#1c2333";
  const muted = dark ? "#9198b0" : "#6b7386";
  const border = dark ? mix(background, "#ffffff", 0.16) : "#e4e7f0";
  const accentSoft = mix(surface, accent, dark ? 0.3 : 0.12);
  const shadow = dark
    ? "0 1px 3px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.3)"
    : "0 1px 3px rgba(28, 35, 51, 0.06), 0 8px 24px rgba(28, 35, 51, 0.04)";

  return {
    title: opts.title && String(opts.title).trim() ? String(opts.title).trim() : DEFAULT_THEME.title,
    dark,
    accent,
    background,
    surface,
    text,
    muted,
    border,
    accentSoft,
    shadow,
  };
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extract(tag, html) {
  const openMatch = html.match(new RegExp(`<${tag}[^>]*>`));
  if (!openMatch) return "";
  const start = openMatch.index + openMatch[0].length;
  const end = html.lastIndexOf(`</${tag}>`);
  if (end < start) return "";
  return html.slice(start, end);
}

// npx/diff2html-cli are npm-shimmed commands (.cmd files on Windows), which
// only a shell can launch. execSync always goes through a shell, so we use
// it here instead of execFileSync — safe because every token in the command
// is a fixed flag or a hex commit hash that git itself produced, never the
// caller-supplied repo path (that only ever goes in as `cwd`, never in the
// command string).
function resolveDiff2html() {
  try {
    execSync("diff2html-cli --version", { stdio: "ignore" });
    return "diff2html-cli";
  } catch {
    return "npx --yes diff2html-cli";
  }
}

function buildHead(theme, commitCount, sharedStyle) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(theme.title)}</title>
  <style>
    :root {
      --bg: ${theme.background};
      --surface: ${theme.surface};
      --text: ${theme.text};
      --muted: ${theme.muted};
      --accent: ${theme.accent};
      --accent-soft: ${theme.accentSoft};
      --border: ${theme.border};
      --shadow: ${theme.shadow};
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, 'Segoe UI', 'Source Sans Pro', sans-serif;
      max-width: 1100px;
      margin: 0 auto;
      padding: 40px 20px 80px;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    h1 {
      font-size: 1.9em;
      letter-spacing: -0.02em;
    }
    body > p {
      color: var(--muted);
      margin-top: 0;
    }
    .commit-block {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      box-shadow: var(--shadow);
      margin-bottom: 28px;
      padding: 24px 28px 28px;
    }
    .commit-block h2 {
      margin: 0 0 6px;
      font-size: 1.15em;
      color: var(--text);
    }
    .commit-meta {
      color: var(--muted);
      margin: 0 0 18px;
      font-size: 0.88em;
    }
    .commit-meta code {
      background: var(--accent-soft);
      color: var(--accent);
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 0.95em;
    }
    ${sharedStyle}
  </style>
</head>
<body>
  <h1>${escapeHtml(theme.title)}</h1>
  <p>${commitCount} commits, generated ${new Date().toISOString().slice(0, 10)}</p>
`;
}

/**
 * Render `opts.repo`'s full git history to `opts.outFile` as one HTML page.
 *
 * opts: { repo, outFile, title, accent, background, dark, onProgress, onLog }
 * onProgress(current, total, subject) and onLog(line) are optional and
 * called synchronously as rendering proceeds.
 *
 * Resolves with { outFile, rendered, skipped, backupFile }; rejects if the
 * path isn't a repo, has no commits, or every commit failed to render.
 */
function renderHistory(opts = {}) {
  // Everything below is synchronous up until the final write-stream, but
  // callers (CLI and GUI alike) always want a promise to attach .catch to —
  // so route any synchronous throw (e.g. an invalid theme color) through
  // the same rejection path as the async failures further down.
  try {
    return renderHistoryImpl(opts);
  } catch (err) {
    return Promise.reject(err);
  }
}

function renderHistoryImpl(opts) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};
  const onLog = typeof opts.onLog === "function" ? opts.onLog : () => {};

  const repo = path.resolve(opts.repo || ".");
  const outFile = path.resolve(opts.outFile || "combined_history.html");
  const theme = resolveTheme(opts);

  if (!fs.existsSync(repo)) {
    return Promise.reject(new Error(`Path does not exist: ${repo}`));
  }

  function git(args) {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: MAX_BUFFER });
  }

  try {
    git(["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return Promise.reject(new Error(`Not a git repository: ${repo}`));
  }

  let backupFile = null;
  if (fs.existsSync(outFile)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupFile = outFile.replace(/\.html$/i, `.${stamp}.html`);
    fs.renameSync(outFile, backupFile);
    onLog(`Existing ${path.basename(outFile)} found — moved to ${path.basename(backupFile)}`);
  }

  const d2hCmd = resolveDiff2html();

  const log = git(["log", "--reverse", "--format=%H%x1f%P%x1f%an%x1f%ad%x1f%s", "--date=format:%Y-%m-%d %H:%M"]);

  const commits = log
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const [hash, parents, author, date, subject] = line.split("\x1f");
      // For merges, diff against the first parent only (standard "what did
      // this merge bring in" view) rather than git's `^!` combined-diff
      // shorthand — that shorthand relies on `^`, which cmd.exe treats as
      // an escape character and mangles once it passes through a shell.
      const firstParent = parents.trim().split(/\s+/)[0] || null;
      return { hash, firstParent, author, date, subject };
    });

  if (commits.length === 0) {
    return Promise.reject(new Error("No commits found."));
  }

  function renderDiffHtml(range) {
    const cmd = [d2hCmd, "-i", "command", "-f", "html", "-o", "stdout", "-s", "side", "--su", "open", "--", "-M", ...range].join(" ");
    return execSync(cmd, { encoding: "utf8", maxBuffer: MAX_BUFFER, cwd: repo });
  }

  function rangeFor(c) {
    return c.firstParent ? [c.firstParent, c.hash] : [EMPTY_TREE, c.hash];
  }

  function renderSection(c, html) {
    const bodyInner = extract("body", html).replace(/<h1>[\s\S]*?<\/h1>/, "");
    return `
    <section class="commit-block">
      <h2>${escapeHtml(c.subject)}</h2>
      <p class="commit-meta">${c.date} &nbsp;·&nbsp; ${escapeHtml(c.author)} &nbsp;·&nbsp; <code>${c.hash.slice(0, 7)}</code></p>
      ${bodyInner}
    </section>
  `;
  }

  let rendered = 0;
  let skipped = 0;
  let cursor = 0;
  let sharedStyle = "";
  let firstSection = "";

  for (; cursor < commits.length; cursor++) {
    const c = commits[cursor];
    onProgress(cursor + 1, commits.length, c.subject);
    try {
      const html = renderDiffHtml(rangeFor(c));
      sharedStyle = extract("style", html);
      firstSection = renderSection(c, html);
      rendered++;
      cursor++;
      break;
    } catch {
      skipped++;
    }
  }

  const out = fs.createWriteStream(outFile, { encoding: "utf8" });

  out.write(buildHead(theme, commits.length, sharedStyle));
  out.write(firstSection);

  for (; cursor < commits.length; cursor++) {
    const c = commits[cursor];
    onProgress(cursor + 1, commits.length, c.subject);
    try {
      const html = renderDiffHtml(rangeFor(c));
      out.write(renderSection(c, html));
      rendered++;
    } catch {
      skipped++;
    }
  }

  out.write(`</body>\n</html>\n`);
  out.end();

  return new Promise((resolve, reject) => {
    out.on("error", reject);
    out.on("finish", () => {
      if (rendered === 0) {
        reject(Object.assign(new Error("No commits could be rendered (all skipped)."), { outFile, rendered, skipped, backupFile }));
      } else {
        resolve({ outFile, rendered, skipped, backupFile, total: commits.length });
      }
    });
  });
}

module.exports = { renderHistory, resolveTheme, isValidHexColor, DEFAULT_THEME };
