// config.js
const fs = require("fs");
const path = require("path");
const CONFIG_FILE = path.join(process.cwd(), "config.json");

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {
      documentsDirs: [], // empty = fall back to env
      exclusions: ["**/node_modules/**", "**/.git/**", "**/~$*"],
    };
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

module.exports = { loadConfig, saveConfig, CONFIG_FILE };
