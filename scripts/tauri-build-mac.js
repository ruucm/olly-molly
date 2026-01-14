const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!key) continue;
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const envPath = path.resolve(__dirname, "..", ".env.local");
loadEnvFile(envPath);

const installedTargets = execSync("rustup target list --installed", {
  stdio: ["ignore", "pipe", "inherit"],
}).toString("utf8");

const targets = [];
if (installedTargets.includes("aarch64-apple-darwin")) {
  targets.push("aarch64-apple-darwin");
}
if (installedTargets.includes("x86_64-apple-darwin")) {
  targets.push("x86_64-apple-darwin");
} else {
  console.warn(
    "x86_64-apple-darwin target not installed; skipping Intel build. Run `rustup target add x86_64-apple-darwin` to enable."
  );
}

for (const target of targets) {
  execSync(`cargo tauri build --target ${target}`, {
    stdio: "inherit",
    env: process.env,
  });
}
