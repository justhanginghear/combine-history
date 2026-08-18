"use strict";
/**
 * Local GUI for git-timelapse: a single-page form served over HTTP,
 * backed by the same lib/render.js the CLI uses. No framework, no
 * external deps — keeps this trivial to bundle into a standalone .exe.
 */

const http = require("http");
const { renderHistory } = require("../lib/render");
const { openTarget } = require("../lib/open");
const { suggestPaths } = require("../lib/browse");
const { renderPage } = require("./page");

const DEFAULT_PORT = 4173;
const MAX_BODY_BYTES = 1024 * 1024; // form bodies are tiny; guards against a runaway client

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function handleGenerate(req, res) {
  let params;
  try {
    params = new URLSearchParams(await readBody(req));
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Bad request: ${err.message}`);
    return;
  }

  const repo = params.get("repo") || ".";
  const outFile = params.get("outFile") || "combined_history.html";
  const title = params.get("title") || undefined;
  const accent = params.get("accent") || undefined;
  const background = params.get("background") || undefined;
  const dark = params.get("dark") === "on";
  const openWhenDone = params.get("open") !== "off";

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });

  try {
    const result = await renderHistory({
      repo,
      outFile,
      title,
      accent,
      background,
      dark,
      onLog: (line) => res.write(line + "\n"),
      onProgress: (i, total, subject) => res.write(`Rendering ${i}/${total}: ${subject}\n`),
    });
    res.write(`\nDone -> ${result.outFile} (${result.rendered} rendered, ${result.skipped} skipped)\n`);
    if (openWhenDone && !openTarget(result.outFile)) {
      res.write(`(Could not auto-open the file — open it manually: ${result.outFile})\n`);
    }
  } catch (err) {
    res.write(`\nError: ${err.message}\n`);
  }

  res.end();
}

function handleBrowse(req, res) {
  const url = new URL(req.url, "http://localhost");
  const result = suggestPaths(url.searchParams.get("path") || "");
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(result));
}

function createServer() {
  return http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderPage());
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/browse")) {
      try {
        handleBrowse(req, res);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Internal error: ${err.message}`);
      }
      return;
    }
    if (req.method === "POST" && req.url === "/generate") {
      handleGenerate(req, res).catch((err) => {
        if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Internal error: ${err.message}`);
      });
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });
}

const MAX_PORT_ATTEMPTS = 20;

// If the port's taken — most likely by a previous instance of this same
// GUI still running in the background — try the next few ports instead of
// just crashing. Whoever's on the far end of a double-click has no way to
// pass a different --port, so failing outright would strand them.
function start(port = DEFAULT_PORT, attemptsLeft = MAX_PORT_ATTEMPTS) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE" && attemptsLeft > 1) {
        server.close();
        resolve(start(port + 1, attemptsLeft - 1));
      } else {
        reject(err);
      }
    });
    server.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${port}/`;
      console.log(`git-timelapse GUI running at ${url}`);
      openTarget(url);
      resolve(server);
    });
  });
}

if (require.main === module) {
  const port = process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT;
  start(port).catch((err) => {
    console.error(`Failed to start GUI server: ${err.message}`);
    process.exitCode = 1;
    // Launched by double-clicking the packaged .exe, this is the only
    // console window there is — without a pause it flashes and closes
    // before anyone can read the error.
    if (process.stdin.isTTY) {
      process.stdout.write("\nPress Enter to exit...");
      process.stdin.once("data", () => process.exit(1));
    }
  });
}

module.exports = { start, createServer };
