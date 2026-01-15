// lowdb setup helper (single block)
// lowdb setup helper
const { Low, JSONFile } = require('lowdb');
const path = require('path');
const fs = require('fs');

function ensureFile(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    const seed = { users: [], locations: [], games: [] };
    fs.writeFileSync(file, JSON.stringify(seed, null, 2));
  }
}

function createLowdb(filePath) {
  ensureFile(filePath);
  const adapter = new JSONFile(filePath);
  const db = new Low(adapter);
  return db;
}

module.exports = { createLowdb };

