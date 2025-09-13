// routes/ai-routes.js
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { loadConfig, saveConfig } = require('../config');



function getAIConfig() {
  const cfg = loadConfig();
  const ai = cfg.ai || {};
  const provider = ai.provider || process.env.AI_PROVIDER || 'deepseek';
  const baseURL  = ai.baseURL  || process.env.AI_BASE_URL || 'https://api.deepseek.com';
  const model    = ai.model    || process.env.AI_MODEL    || 'deepseek-chat';
  const apiKey   = ai.apiKey   || process.env.AI_API_KEY  || '';
  return { provider, baseURL, model, apiKey, hasKey: !!apiKey };
}

router.get('/api/ai/providers', (req, res) => {
  res.json({
    providers: [
      { id: 'deepseek',  name: 'DeepSeek', fields: ['baseURL','model','apiKey'] },
      { id: 'openai',    name: 'OpenAI', fields: ['baseURL','model','apiKey'] },
      { id: 'azure',     name: 'Azure OpenAI', fields: ['baseURL','deployment','apiKey'] },
      { id: 'anthropic', name: 'Anthropic', fields: ['baseURL','model','apiKey'] }
    ],
    current: getAIConfig()
  });
});

router.post('/api/ai/config', (req, res) => {
  const { provider, baseURL, model, apiKey } = req.body || {};
  const cfg = loadConfig();
  cfg.ai = { ...(cfg.ai||{}), provider, baseURL, model, apiKey };
  saveConfig(cfg);
  res.json({ success: true, current: getAIConfig() })
});

// same /api/ai/test, just uses cfg.baseURL/cfg.model
router.post('/api/ai/test', async (req, res) => {
  const cfg = getAIConfig();
  if (!cfg.apiKey) return res.status(400).json({ success:false, message:'No API key set' });
  try {
    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method:'POST',
      //headers:{ 'Authorization':`Bearer ${process.env.AI_API_KEY}`, 'Content-Type':'application/json' },
      headers:{ 'Authorization':`Bearer ${cfg.apiKey}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages:[{ role:'user', content:'ping' }],
        max_tokens: 16
      })
    });
    const j = await r.json();
    res.json({ success:true, provider:cfg.provider, model:cfg.model, sample:j.choices?.[0]?.message?.content || 'ok' });
  } catch (e) {
    res.status(500).json({ success:false, message:e.message });
  }
});

module.exports = router;
