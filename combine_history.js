#!/usr/bin/env node
/**
 * combine_history.js
 * Builds ONE html file covering the whole git history: every commit's
 * diff, each preceded by its date/author/message.
 *
 * See README.md for full usage, or run `combine-history --help`.
 */

const { execFileSync, execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const MAX_BUFFER = 1024 * 1024 * 200; // 200MB, some diffs render large HTML

const HELP = `combine-history — render a git repo's full history as one browsable HTML changelog

Usage:
  combine-history [repo] [outFile]

Arguments:
  repo      Path to the git repository (default: current directory)
  outFile   Path to write the HTML report to (default: combined_history.html)

Options:
  -h, --help     Show this help message
  -v, --version  Show the installed version

Requires diff2html-cli, which is auto-installed on demand via npx if it
isn't already on your PATH.`;

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(HELP);
  process.exit(0);
}

if (process.argv.includes("-v") || process.argv.includes("--version")) {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
  console.log(pkg.version);
  process.exit(0);
}

const repo = path.resolve(process.argv[2] || ".");
const outFile = path.resolve(process.argv[3] || "combined_history.html");

// If a previous run's output is sitting there, don't silently clobber it —
// move it aside with a timestamp suffix first.
if (fs.existsSync(outFile)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = outFile.replace(/\.html$/i, `.${stamp}.html`);
  fs.renameSync(outFile, backup);
  console.log(`Existing ${path.basename(outFile)} found — moved to ${path.basename(backup)}`);
}

function usageAndExit(msg) {
  if (msg) console.error(msg + "\n");
  console.error("Usage: combine-history [repo] [outFile]  (--help for details)");
  process.exit(1);
}

// Launch the finished file in the default browser so there's nothing to
// hunt down manually once the script exits.
function openInBrowser(file) {
  const platform = os.platform();
  const cmd = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", file] : [file];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    console.log(`(Could not auto-open the file — open it manually: ${file})`);
  }
}

function git(args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
}

function assertGitRepo() {
  if (!fs.existsSync(repo)) usageAndExit(`Path does not exist: ${repo}`);
  try {
    git(["rev-parse", "--is-inside-work-tree"]);
  } catch {
    usageAndExit(`Not a git repository: ${repo}`);
  }
}

// npx/diff2html-cli are npm-shimmed commands (.cmd files on Windows), which
// only a shell can launch. execSync always goes through a shell, so we use
// it here instead of execFileSync — safe because every token in the command
// is a fixed flag or a hex commit hash that git itself produced, never the
// user-supplied repo path (that only ever goes in as `cwd`, never in the
// command string).
function resolveDiff2html() {
  try {
    execSync("diff2html-cli --version", { stdio: "ignore" });
    return "diff2html-cli";
  } catch {
    return "npx --yes diff2html-cli";
  }
}

function renderDiffHtml(d2hCmd, range) {
  const cmd = [d2hCmd, "-i", "command", "-f", "html", "-o", "stdout", "-s", "side", "--su", "open", "--", "-M", ...range].join(" ");
  return execSync(cmd, { encoding: "utf8", maxBuffer: MAX_BUFFER, cwd: repo });
}

function extract(tag, html) {
  const openMatch = html.match(new RegExp(`<${tag}[^>]*>`));
  if (!openMatch) return "";
  const start = openMatch.index + openMatch[0].length;
  const end = html.lastIndexOf(`</${tag}>`);
  if (end < start) return "";
  return html.slice(start, end);
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

assertGitRepo();

const d2hCmd = resolveDiff2html();

// %H = hash, %P = parent hashes (space separated), %an, %ad, %s
const log = git([
  "log",
  "--reverse",
  "--format=%H%x1f%P%x1f%an%x1f%ad%x1f%s",
  "--date=format:%Y-%m-%d %H:%M",
]);

const commits = log
  .split("\n")
  .filter((l) => l.trim())
  .map((line) => {
    const [hash, parents, author, date, subject] = line.split("\x1f");
    // For merges, diff against the first parent only (standard "what did
    // this merge bring in" view) rather than git's `^!` combined-diff
    // shorthand — that shorthand relies on `^`, which cmd.exe treats as an
    // escape character and mangles once the command passes through a shell.
    const firstParent = parents.trim().split(/\s+/)[0] || null;
    return { hash, firstParent, author, date, subject };
  });

if (commits.length === 0) {
  console.error("No commits found.");
  process.exit(1);
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

function rangeFor(c) {
  return c.firstParent ? [c.firstParent, c.hash] : [EMPTY_TREE, c.hash];
}

// Stream output incrementally instead of buffering everything in memory,
// so very long histories don't blow up on huge repos. To do that without a
// second full-file pass, render commits up front until we get the first
// successful diff (for its shared <style> block), THEN write the header,
// then stream that section plus everything after it.
let rendered = 0;
let skipped = 0;
let cursor = 0;
let sharedStyle = "";
let firstSection = "";

for (; cursor < commits.length; cursor++) {
  const c = commits[cursor];
  console.log(`Rendering ${cursor + 1}/${commits.length}: ${c.subject}`);
  const range = rangeFor(c);
  try {
    const html = renderDiffHtml(d2hCmd, range);
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

out.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Project Change Log</title>
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
  <h1>Project Change Log</h1>
  <p>${commits.length} commits, generated ${new Date().toISOString().slice(0, 10)}</p>
${firstSection}`);

for (; cursor < commits.length; cursor++) {
  const c = commits[cursor];
  console.log(`Rendering ${cursor + 1}/${commits.length}: ${c.subject}`);
  const range = rangeFor(c);
  try {
    const html = renderDiffHtml(d2hCmd, range);
    out.write(renderSection(c, html));
    rendered++;
  } catch {
    skipped++;
  }
}

out.write(`</body>\n</html>\n`);
out.end();

out.on("finish", () => {
  console.log(`\nDone -> ${outFile} (${rendered} rendered, ${skipped} skipped)`);
  if (rendered > 0) openInBrowser(outFile);
});

if (rendered === 0) {
  console.error("\nNo commits could be rendered (all skipped).");
  process.exitCode = 1;
}
