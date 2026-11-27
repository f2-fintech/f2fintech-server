/**
 * Cross-platform syntax verification for chatbot, middleware, model, and card controller files.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "../../..");

const dirsToScan = [
  "modules/chatbot",
  "model/chatbot",
  "middleware",
  "controller/credit_cards",
];

function collectJsFiles(relDir) {
  const full = path.join(rootDir, relDir);
  if (!fs.existsSync(full)) return [];
  const entries = fs.readdirSync(full, { withFileTypes: true });
  let files = [];
  for (const ent of entries) {
    const p = path.join(full, ent.name);
    if (ent.isDirectory()) {
      files = files.concat(collectJsFiles(path.join(relDir, ent.name)));
    } else if (ent.isFile() && ent.name.endsWith(".js")) {
      files.push(p);
    }
  }
  return files;
}

const files = [
  path.join(rootDir, "index.js"),
  path.join(rootDir, "model/customer/index.js"),
  ...dirsToScan.flatMap(collectJsFiles),
];

for (const file of files) {
  execFileSync(process.execPath, ["-c", file], { stdio: "inherit" });
}

console.log(`[SyntaxCheck] Verified ${files.length} server files cleanly.`);

