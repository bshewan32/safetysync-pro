// routes/config-routes.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const { loadConfig, saveConfig } = require('../config');

const router = express.Router();

router.get('/api/config', (req, res) => {
  res.json(loadConfig());
});

router.post('/api/config/scan-roots', async (req, res) => {
  const { documentsDirs } = req.body || {};
  if (!Array.isArray(documentsDirs) || !documentsDirs.length) {
    return res.status(400).json({ success:false, error: 'documentsDirs must be a non-empty array' });
  }
  for (const p of documentsDirs) {
    if (!fs.existsSync(p)) return res.status(400).json({ success:false, error:`Path does not exist: ${p}` });
  }
  const cfg = loadConfig();
  cfg.documentsDirs = documentsDirs;
  saveConfig(cfg);

  // optional: trigger your existing rebuild if you have a handler:
  try {
    // If you already expose POST /api/rebuild-index from your document routes, ping it internally:
    // await fetch('http://localhost:3000/api/rebuild-index', { method: 'POST' })
  } catch(e) { /* ignore */ }

  res.json({ success:true, message:'Scan roots updated' });
});

module.exports = router;
