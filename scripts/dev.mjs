import { spawn } from "node:child_process";
import path from "node:path";

const API_PORT = process.env.API_PORT || "3301";
const WEB_PORT = process.env.PORT || "3000";

const api = spawn(process.execPath, ["server/index.mjs"], {
  stdio: "inherit",
  env: { ...process.env, API_PORT },
});

const viteBin = path.resolve(process.cwd(), "node_modules/vite/bin/vite.js");
const web = spawn(
  process.execPath,
  [viteBin, "--port", WEB_PORT, "--host", "0.0.0.0"],
  {
    stdio: "inherit",
    env: { ...process.env, API_PORT },
  },
);

const children = [api, web];
let shuttingDown = false;
let exitCode = 0;

function terminateChildren(signal) {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null && !child.killed) {
      child.kill(signal);
    }
  }
}

function shutdown(signal, code) {
  if (shuttingDown) return;
  shuttingDown = true;
  exitCode = code;
  terminateChildren(signal);

  const forceTimer = setTimeout(() => {
    terminateChildren("SIGKILL");
    process.exit(exitCode);
  }, 1500);
  forceTimer.unref();
}

function checkAllExited() {
  const allExited = children.every(
    (child) => child.exitCode !== null || child.signalCode !== null,
  );
  if (allExited) {
    process.exit(exitCode);
  }
}

process.on("SIGINT", () => shutdown("SIGINT", 0));
process.on("SIGTERM", () => shutdown("SIGTERM", 0));

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      shutdown("SIGTERM", signal ? 1 : (code ?? 0));
    }
    checkAllExited();
  });
}
