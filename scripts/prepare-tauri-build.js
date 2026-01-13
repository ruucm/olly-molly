#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const serverDir = path.join(rootDir, "src-tauri", "server");

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: rootDir });
}

function rmrf(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function removeMatchingFiles(dir, regex) {
  if (!fs.existsSync(dir)) {
    return;
  }

  for (const entry of fs.readdirSync(dir)) {
    if (regex.test(entry)) {
      rmrf(path.join(dir, entry));
    }
  }
}

function prepare() {
  console.log("Building Next.js...");
  run("npm run build");

  console.log("Preparing server files...");
  rmrf(serverDir);
  fs.mkdirSync(serverDir, { recursive: true });

  copyDir(path.join(rootDir, ".next", "standalone"), serverDir);
  copyDir(
    path.join(rootDir, ".next", "static"),
    path.join(serverDir, ".next", "static")
  );
  copyDir(path.join(rootDir, "public"), path.join(serverDir, "public"));

  const dbDir = path.join(rootDir, "db");
  if (fs.existsSync(dbDir)) {
    const serverDbDir = path.join(serverDir, "db");
    fs.mkdirSync(serverDbDir, { recursive: true });
    for (const entry of fs.readdirSync(dbDir)) {
      if (entry.endsWith(".sql")) {
        copyFile(path.join(dbDir, entry), path.join(serverDbDir, entry));
      }
    }
  }

  rmrf(path.join(serverDir, "src-tauri"));
  rmrf(path.join(serverDir, "scripts"));
  rmrf(path.join(serverDir, "components"));
  rmrf(path.join(serverDir, "app"));
  rmrf(path.join(serverDir, "app-icon.png"));
  rmrf(path.join(serverDir, "package-lock.json"));

  removeMatchingFiles(serverDir, /\.md$/i);
  removeMatchingFiles(serverDir, /\.mjs$/i);
  removeMatchingFiles(serverDir, /\.ts$/i);

  rmrf(path.join(serverDir, "node"));
  rmrf(path.join(serverDir, "node.exe"));

  console.log("Server files prepared!");
}

prepare();
