const fs = require("fs");
const path = require("path");

fs.copyFileSync(
  path.join(__dirname, "electron", "main.js"),
  path.join(__dirname, "build", "electron.js")
);
fs.copyFileSync(
  path.join(__dirname, "electron", "preload.js"),
  path.join(__dirname, "build", "preload.js")
);

console.log("✓ Copied electron/main.js → build/electron.js");
console.log("✓ Copied electron/preload.js → build/preload.js");
