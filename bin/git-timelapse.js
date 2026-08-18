#!/usr/bin/env node
/**
 * git-timelapse CLI
 * Builds ONE html file covering the whole git history: every commit's
 * diff, each preceded by its date/author/message.
 *
 * See README.md for full usage, or run `git-timelapse --help`.
 */

const { renderHistory } = require("../lib/render");
const { openTarget } = require("../lib/open");

const HELP = `git-timelapse — render a git repo's full history as one browsable HTML changelog

Usage:
  git-timelapse [repo] [outFile] [options]

Arguments:
  repo      Path to the git repository (default: current directory)
  outFile   Path to write the HTML report to (default: combined_history.html)

Options:
  --title <text>       Page title / heading (default: "Project Change Log")
  --accent <#hex>       Accent color, e.g. #4f5dff (default: #4f5dff)
  --background <#hex>   Page background color (default: #f4f6fb, or a dark
                         slate when --dark is set)
  --dark                 Use a dark color scheme
  --no-open              Don't auto-open the report when done
  -h, --help              Show this help message
  -v, --version           Show the installed version

Requires diff2html-cli, which is auto-installed on demand via npx if it
isn't already on your PATH.`;

function parseArgs(argv) {
  const positional = [];
  const opts = { open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "-v":
      case "--version":
        opts.version = true;
        break;
      case "--dark":
        opts.dark = true;
        break;
      case "--no-open":
        opts.open = false;
        break;
      case "--title":
        opts.title = argv[++i];
        break;
      case "--accent":
        opts.accent = argv[++i];
        break;
      case "--background":
      case "--bg":
        opts.background = argv[++i];
        break;
      default:
        if (a.startsWith("--")) {
          console.error(`Unknown option: ${a}\n`);
          console.error(HELP);
          process.exit(1);
        }
        positional.push(a);
    }
  }
  return { positional, opts };
}

function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(HELP);
    return;
  }
  if (opts.version) {
    const pkg = require("../package.json");
    console.log(pkg.version);
    return;
  }

  const [repo = ".", outFile = "combined_history.html"] = positional;

  renderHistory({
    repo,
    outFile,
    title: opts.title,
    accent: opts.accent,
    background: opts.background,
    dark: opts.dark,
    onLog: (line) => console.log(line),
    onProgress: (i, total, subject) => console.log(`Rendering ${i}/${total}: ${subject}`),
  })
    .then((result) => {
      console.log(`\nDone -> ${result.outFile} (${result.rendered} rendered, ${result.skipped} skipped)`);
      if (opts.open && !openTarget(result.outFile)) {
        console.log(`(Could not auto-open the file — open it manually: ${result.outFile})`);
      }
    })
    .catch((err) => {
      console.error(`\n${err.message}`);
      process.exitCode = 1;
    });
}

main();
