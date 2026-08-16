# combine-history

Render a git repository's **entire commit history** as one browsable, syntax-highlighted HTML changelog — every commit's diff, preceded by its date, author, and message.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js >=16](https://img.shields.io/badge/node-%3E%3D16-brightgreen.svg)

## Features

- Walks the full history of a repo, oldest commit first, and renders each commit's diff with [diff2html](https://github.com/rtfpessoa/diff2html)
- Streams output to disk as it renders, so it scales to long-running repos without loading everything into memory
- Merge commits are diffed against their first parent (the conventional "what did this merge bring in" view)
- Won't clobber a previous run — an existing output file is automatically renamed aside with a timestamp
- Opens the finished report in your default browser when done

## Requirements

- [Node.js](https://nodejs.org/) 16 or later
- [Git](https://git-scm.com/), available on your `PATH`
- [diff2html-cli](https://www.npmjs.com/package/diff2html-cli) — if it isn't installed globally, it's fetched automatically on first use via `npx` (requires network access the first time)

## Installation

Clone this repo and run it directly:

```bash
git clone https://github.com/justhanginghear/combine-history.git
cd combine-history
node combine_history.js /path/to/some/repo
```

Or install it globally so `combine-history` is available anywhere:

```bash
npm install -g .
combine-history /path/to/some/repo
```

## Usage

```bash
combine-history [repo] [outFile]
```

| Argument  | Description                                  | Default                  |
|-----------|-----------------------------------------------|---------------------------|
| `repo`    | Path to the git repository to render          | current directory (`.`)   |
| `outFile` | Path to write the HTML report to               | `combined_history.html`   |

```bash
# Render the current directory's history to ./combined_history.html
combine-history

# Render a specific repo to a specific file
combine-history ~/projects/my-app changelog.html

# See all options
combine-history --help
```

## How it works

1. Reads the repo's full commit log (oldest → newest) via `git log`.
2. For each commit, renders a diff against its parent — or against git's empty-tree object for the very first (root) commit — using `diff2html-cli`.
3. Concatenates every commit's date, author, subject, and rendered diff into a single self-contained HTML page.

## Notes

- Binary-only or diff-less commits are skipped; the run summary at the end reports how many commits were rendered vs. skipped.
- The generated HTML is not tracked in this repo (see `.gitignore`) — it's the tool's output, not its source.

## License

[MIT](LICENSE)
