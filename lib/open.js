"use strict";
/** Open a file path or URL with whatever the OS considers its default handler. */

const { spawn } = require("child_process");
const os = require("os");

function openTarget(target) {
  const platform = os.platform();
  const cmd = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", target] : [target];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
    return true;
  } catch {
    return false;
  }
}

module.exports = { openTarget };
