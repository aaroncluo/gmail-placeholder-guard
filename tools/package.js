// Builds dist/gmail-placeholder-guard-<version>.zip containing only the files
// Chrome needs (what you would upload to the Chrome Web Store).
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const files = ["manifest.json", "detector.js", "content.js", "styles.css", "icons"];
const dist = path.join(root, "dist");
const stage = path.join(dist, "stage");
const zip = path.join(dist, `gmail-placeholder-guard-${manifest.version}.zip`);

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const f of files) fs.cpSync(path.join(root, f), path.join(stage, f), { recursive: true });
fs.rmSync(zip, { force: true });

if (process.platform === "win32") {
  execFileSync("powershell", [
    "-NoProfile", "-Command",
    `Compress-Archive -Path '${stage}\\*' -DestinationPath '${zip}' -Force`
  ], { stdio: "inherit" });
} else {
  execFileSync("zip", ["-r", zip, "."], { cwd: stage, stdio: "inherit" });
}
fs.rmSync(stage, { recursive: true, force: true });
console.log("wrote", path.relative(process.cwd(), zip), fs.statSync(zip).size, "bytes");
