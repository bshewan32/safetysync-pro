const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const fs = require("fs-extra");
const path = require("path");
const { loadConfig } = require("../config");

//const OUT_DIR = path.join(__dirname, "../docs/ai");
const cfgAll = loadConfig();
const primaryRoot = (cfgAll.documentsDirs && cfgAll.documentsDirs.length)
   ? cfgAll.documentsDirs[0]
   : (process.env.DOCUMENTS_DIR || path.join(process.cwd(), "docs"));
const OUT_DIR = path.join(primaryRoot, "docs", "ai"); // stays within a scanned root


function getAIConfig() {
  const cfg = loadConfig();
  const ai = cfg.ai || {};
  return {
    baseURL: ai.baseURL || process.env.AI_BASE_URL || "https://api.deepseek.com",
    model:   ai.model   || process.env.AI_MODEL    || "deepseek-chat",
    key:     ai.apiKey  || process.env.AI_API_KEY,
  };
}

function sysPrompt(type) {
  if (type === "biosecurity")
    return "Generate a practical SA sheep farm biosecurity plan. Markdown, checklist style.";
  if (type === "spray-diary")
    return "Generate a CSV spray diary header + one sample line compliant with APVMA record-keeping.";
  if (type === "welfare-check")
    return "Generate a sheep welfare checklist in Markdown incl. fit-to-transport checks.";
  return "You create farm compliance documents. Output in requested format only.";
}

router.post("/api/ai/generate", async (req, res) => {
  const {
    type,
    state = "SA",
    enterprise = "sheep",
    format = "md",
    customContext = "",
  } = req.body || {};
  const cfg = getAIConfig();
  if (!cfg.key)
    return res.status(400).json({ success: false, message: "No AI key set" });

  const r = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.3,
      messages: [
        { role: "system", content: sysPrompt(type) },
        {
          role: "user",
          content: `Enterprise: ${enterprise}; State: ${state}. ${customContext}\nReturn ${format.toUpperCase()} only.`,
        },
      ],
    }),
  });
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content?.trim() || "";
  const fname = `${type}-${state}-${enterprise}-${Date.now()}.${
    format === "csv" ? "csv" : "md"
  }`;
  const outPath = path.join(OUT_DIR, fname);
  await fs.ensureDir(OUT_DIR);
  await fs.writeFile(outPath, content, "utf8");
  res.json({ success: true, name: fname, path: outPath });
});

router.post("/api/ai/improve", async (req, res) => {
  const {
    documentId,
    instructions = "Tighten, ensure compliance cues, keep headings.",
  } = req.body || {};
  const docs = Array.isArray(req?.app?.locals?.documentIndex)
    ? req.app.locals.documentIndex
    : [];
  const src = docs.find((d) => d.id === documentId);
  if (!src)
    return res
      .status(404)
      .json({ success: false, message: "Document not found" });

  const raw = await fs.readFile(src.path, "utf8");
  const cfg = getAIConfig();
  if (!cfg.key)
    return res.status(400).json({ success: false, message: "No AI key set" });

  const r = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Improve farm compliance docs; preserve structure; add TODOs for missing required fields.",
        },
        {
          role: "user",
          content: `INSTRUCTIONS:\n${instructions}\n\n---\nORIGINAL:\n${raw}`,
        },
      ],
    }),
  });
  const j = await r.json();
  const improved = j.choices?.[0]?.message?.content?.trim() || raw;

  const ext = path.extname(src.path) || ".md";
  const newPath = path.join(
    path.dirname(src.path),
    src.name.replace(ext, "") + `.improved.${Date.now()}${ext}`
  );
  await fs.writeFile(newPath, improved, "utf8");
  res.json({
    success: true,
    improvedPath: newPath,
    improvedName: path.basename(newPath),
  });
});

module.exports = router;
