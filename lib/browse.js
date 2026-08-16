"use strict";
/** Directory-listing helper backing the GUI's repo-path autocomplete. */

const fs = require("fs");
const path = require("path");

const MAX_RESULTS = 25;
const SKIP_NAMES = new Set(["node_modules", "$RECYCLE.BIN", "System Volume Information"]);

/**
 * Given whatever the user has typed so far, list matching subdirectories.
 * - If the input ends in a path separator (or is empty), list *that*
 *   directory's children.
 * - Otherwise, list the parent directory's children filtered to those
 *   starting with the last path segment — classic path-autocomplete.
 *
 * Returns { dir, entries: [{ name, path, isRepo }] }. Never throws — an
 * unreadable/nonexistent directory just yields an empty entries list.
 */
function suggestPaths(input) {
  const raw = (input || "").trim();
  const endsWithSep = raw.endsWith("\\") || raw.endsWith("/");

  let dir;
  let prefix;
  if (raw === "") {
    dir = process.cwd();
    prefix = "";
  } else {
    const resolved = path.resolve(raw);
    if (endsWithSep) {
      dir = resolved;
      prefix = "";
    } else {
      dir = path.dirname(resolved);
      prefix = path.basename(resolved);
    }
  }

  let dirents;
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { dir, entries: [] };
  }

  const lowerPrefix = prefix.toLowerCase();
  const entries = dirents
    .filter((d) => d.isDirectory())
    .filter((d) => !SKIP_NAMES.has(d.name))
    .filter((d) => d.name.toLowerCase().startsWith(lowerPrefix))
    .map((d) => {
      const full = path.join(dir, d.name);
      let isRepo = false;
      try {
        isRepo = fs.existsSync(path.join(full, ".git"));
      } catch {
        // inaccessible — leave isRepo false
      }
      return { name: d.name, path: full, isRepo };
    })
    .sort((a, b) => Number(b.isRepo) - Number(a.isRepo) || a.name.localeCompare(b.name))
    .slice(0, MAX_RESULTS);

  return { dir, entries };
}

module.exports = { suggestPaths };
