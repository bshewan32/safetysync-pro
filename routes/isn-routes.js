// routes/isn-routes.js - ISNetwork specific routes (FIXED PATHS)
const express = require("express");
const router = express.Router();
const fs = require("fs-extra");
const path = require("path");
const moment = require("moment");

// ISNetwork specific paths - FIXED to use root directory like IMS
const ISN_INDEX_PATH = path.join(__dirname, "../isn-document-index.json");
const ISN_MANDATORY_RECORDS_PATH = path.join(
  __dirname,
  "../isn-mandatory-records-index.json"
);
const ISN_REVISION_LOG_PATH = path.join(
  __dirname,
  "../data/isn-revision-log.json"
); // Keep revision logs in data

// ---------- Helpers ----------
function safeDocIndex(req) {
  // Always return an array even if not initialized yet
  return Array.isArray(req?.app?.locals?.documentIndex)
    ? req.app.locals.documentIndex
    : [];
}
function findDocByName(req, name, includeArchived = false) {
  const byLearning = req?.app?.locals?.findDocumentByNameWithLearning;
  const byName = req?.app?.locals?.findDocumentByName;
  const fn = byLearning || byName;
  if (!fn) return null;
  const doc = fn(name, false);
  if (!doc) return null;
  if (!includeArchived && doc.isArchived) return null;
  return doc;
}

function computeISNStats(isnIndex) {
  const names = Object.keys(isnIndex || {});
  const totalCategories = names.length;

  let totalDocuments = 0;
  let linkedDocuments = 0;

  names.forEach((n) => {
    const cat = isnIndex[n] || {};
    const kids = Array.isArray(cat.children) ? cat.children.length : 0;
    totalDocuments += kids;

    const enriched = Array.isArray(cat.enrichedChildren)
      ? cat.enrichedChildren
      : [];
    linkedDocuments += enriched.filter(
      (c) => c && c.found && c.document
    ).length;
  });

  const completionRate = totalDocuments
    ? Math.round((linkedDocuments / totalDocuments) * 100)
    : 0;
  return { totalCategories, totalDocuments, linkedDocuments, completionRate };
}

// ISNetwork utility functions
function loadISNIndex() {
  try {
    if (fs.existsSync(ISN_INDEX_PATH)) {
      return JSON.parse(fs.readFileSync(ISN_INDEX_PATH, "utf8"));
    }
  } catch (error) {
    console.error("Error loading ISN index:", error);
  }

  // Default seed (will be replaced by your farming pack JSON)
  return {
    "Network Security Policy": {
      level: 1,
      type: "policy",
      description: "Core network security policy and governance framework",
      documentId: null,
      children: [
        "Information Security Policy",
        "Network Access Control Policy",
        "Data Classification Policy",
        "Incident Response Policy",
      ],
    },
  };
}

function saveISNIndex(isnIndex) {
  try {
    fs.writeFileSync(ISN_INDEX_PATH, JSON.stringify(isnIndex, null, 2));
    return true;
  } catch (error) {
    console.error("Error saving ISN index:", error);
    return false;
  }
}

function loadISNMandatoryRecords() {
  try {
    if (fs.existsSync(ISN_MANDATORY_RECORDS_PATH)) {
      return JSON.parse(fs.readFileSync(ISN_MANDATORY_RECORDS_PATH, "utf8"));
    }
  } catch (error) {
    console.error("Error loading ISN mandatory records:", error);
  }
  // Return default (will be overridden by your farming seed)
  return {
    "Compliance Checklist": {
      description: "ISNetwork compliance verification checklist",
      autoDetectKeywords: ["compliance", "checklist", "verification"],
      enrichedDocuments: [],
      category: "compliance",
    },
  };
}

function saveISNMandatoryRecords(records) {
  try {
    fs.writeFileSync(
      ISN_MANDATORY_RECORDS_PATH,
      JSON.stringify(records, null, 2)
    );
    return true;
  } catch (error) {
    console.error("Error saving ISN mandatory records:", error);
    return false;
  }
}

function saveISNRevisionLog(documentId, revisionLog) {
  try {
    let logs = {};
    if (fs.existsSync(ISN_REVISION_LOG_PATH)) {
      logs = JSON.parse(fs.readFileSync(ISN_REVISION_LOG_PATH, "utf8"));
    }
    if (!logs[documentId]) logs[documentId] = [];
    logs[documentId].push(revisionLog);

    fs.ensureDirSync(path.dirname(ISN_REVISION_LOG_PATH));
    fs.writeFileSync(ISN_REVISION_LOG_PATH, JSON.stringify(logs, null, 2));
    return true;
  } catch (error) {
    console.error("Error saving ISN revision log:", error);
    return false;
  }
}

// ---------- Routes ----------

// Main ISNetwork page
router.get("/isn-index", (req, res) => {
  try {
    const isnIndex = loadISNIndex();
    const docs = safeDocIndex(req);

    // Enrich ISN structure with actual documents
    Object.keys(isnIndex).forEach((categoryName) => {
      const category = isnIndex[categoryName];

      // Category document by documentId
      if (category.documentId && !category.document) {
        const actualDoc = docs.find((doc) => doc.id === category.documentId);
        if (actualDoc) {
          category.document = {
            id: actualDoc.id,
            name: actualDoc.name,
            path: actualDoc.path,
            isArchived: !!actualDoc.isArchived,
          };
        }
      }

      // Enrich children with actual documents
      if (Array.isArray(category.children) && category.children.length > 0) {
        if (!Array.isArray(category.enrichedChildren))
          category.enrichedChildren = [];
        category.children.forEach((childName) => {
          let enrichedChild = category.enrichedChildren.find(
            (c) => c.name === childName
          );
          if (!enrichedChild) {
            const foundDoc = findDocByName(req, childName, false);
            enrichedChild = {
              name: childName,
              document: foundDoc
                ? {
                    id: foundDoc.id,
                    name: foundDoc.name,
                    path: foundDoc.path,
                    isArchived: !!foundDoc.isArchived,
                  }
                : null,
              found: !!foundDoc,
            };
            category.enrichedChildren.push(enrichedChild);
          }
        });
      }
    });

    // Build categories array for template
    const categories = Object.keys(isnIndex).map((name) => {
      const cat = isnIndex[name] || {};
      const totalDocuments = Array.isArray(cat.children)
        ? cat.children.length
        : 0;
      const linkedDocuments = Array.isArray(cat.enrichedChildren)
        ? cat.enrichedChildren.filter((c) => c && c.found && c.document).length
        : 0;
      return { name, ...cat, totalDocuments, linkedDocuments };
    });

    const stats = computeISNStats(isnIndex);

    res.render("isn-index", {
      title: "ISNetwork Document Management",
      categories, // array for EJS
      stats, // totals for header cards
      moment,
    });
  } catch (error) {
    console.error("Error loading ISN index page:", error);
    res.status(500).send("Error loading ISNetwork page");
  }
});

// Export index for the "Export Index" button
router.get("/api/export-isn-index", (req, res) => {
  try {
    const isnIndex = loadISNIndex();
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="isn-document-index.json"'
    );
    res.json(isnIndex);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Get ISN structure API
router.get("/api/isn-structure", (req, res) => {
  try {
    const isnIndex = loadISNIndex();
    res.json(isnIndex);
  } catch (error) {
    console.error("Error getting ISN structure:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update ISN category
router.post("/api/update-isn-category", (req, res) => {
  try {
    const { action, categoryName, newName, level, type, documentId, children } =
      req.body;
    const isnIndex = loadISNIndex();

    if (action === "create") {
      if (isnIndex[categoryName]) {
        return res.json({
          success: false,
          message: `Category "${categoryName}" already exists`,
        });
      }
      isnIndex[categoryName] = {
        type: type || "category",
        level: level || 2,
        documentId: null,
        children: children || [],
      };
    } else if (action === "update") {
      if (!isnIndex[categoryName]) {
        return res.json({
          success: false,
          message: `Category "${categoryName}" not found`,
        });
      }
      let targetName = categoryName;
      if (newName && newName !== categoryName) {
        if (isnIndex[newName]) {
          return res.json({
            success: false,
            message: `Category "${newName}" already exists`,
          });
        }
        isnIndex[newName] = { ...isnIndex[categoryName] };
        delete isnIndex[categoryName];
        targetName = newName;
      }
      if (level) isnIndex[targetName].level = parseInt(level, 10);
      if (type) isnIndex[targetName].type = type;
      if (documentId !== undefined)
        isnIndex[targetName].documentId = documentId || null;
      if (children !== undefined) isnIndex[targetName].children = children;
    }

    if (saveISNIndex(isnIndex)) {
      res.json({ success: true, message: "ISN Category updated successfully" });
    } else {
      res.json({ success: false, message: "Failed to save changes" });
    }
  } catch (error) {
    console.error("Error updating ISN category:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// Delete ISN category
router.delete("/api/delete-isn-category/:categoryName", (req, res) => {
  try {
    const { categoryName } = req.params;
    const isnIndex = loadISNIndex();

    if (!isnIndex[categoryName]) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }
    delete isnIndex[categoryName];
    saveISNIndex(isnIndex);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting ISN category:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

function normalizeName(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/\.(pdf|docx?|xlsx?|csv|md|txt)$/g, "") // strip extensions
    .replace(/[_\-]/g, " ") // unify underscores/dashes
    .replace(/\b(template|sample|instructions?)\b/g, "") // drop filler words
    .replace(/\s+/g, " ")
    .trim();
}

const SYNONYMS = {
  "nvd consignments": [
    "nvd",
    "national vendor declaration",
    "vendor declaration",
  ],
  "nlis transfers": ["nlis", "nlis transfer"],
  "spray diary": ["spray diary", "application record", "chemical application"],
  "animal treatment records": [
    "treatment log",
    "animal treatment",
    "whp",
    "esi",
  ],
  "farm biosecurity plan": ["biosecurity plan", "farm biosecurity"],
  "sheep welfare checklist": ["welfare checklist", "fit to transport"],
  "pic record": ["pic", "property identification code"],
  "chemical register": [
    "chem register",
    "hazardous substances register",
    "sds register",
  ],
  induction: ["site induction", "worker induction", "contractor induction"],
  swms: ["safe work method statement", "jsa", "jha"],
};

function buildDocIndex(docs) {
  return docs.map((d) => ({ doc: d, key: normalizeName(d.name) }));
}

function findBestDoc(childName, docIndex) {
  const target = normalizeName(childName);

  // 1. exact normalized match
  let hit = docIndex.find((x) => x.key === target);
  if (hit) return hit.doc;

  // 2. substring match
  hit = docIndex.find((x) => x.key.includes(target) || target.includes(x.key));
  if (hit) return hit.doc;

  // 3. synonyms
  const syns = SYNONYMS[target] || [];
  hit = docIndex.find((x) => syns.some((s) => x.key.includes(s)));
  if (hit) return hit.doc;

  // 4. loose word match
  const words = target.split(" ").filter(Boolean);
  hit = docIndex.find((x) => words.every((w) => x.key.includes(w)));
  return hit ? hit.doc : null;
}

// e.g. set ISN_DOCS_FILTER=seed-farm-SA-sheep|/Farm/SA/Sheep|/docs/ai
const DOCS_FILTER_RE = (() => {
  const pat = process.env.ISN_DOCS_FILTER || "";
  return pat ? new RegExp(pat, "i") : null;
})();

function goodExt(p) {
  const ext = path.extname(p || "").toLowerCase();
  return [".md", ".csv", ".txt", ".pdf"].includes(ext); // prefer simple, auditable formats
}

// Scoring with boosts/penalties so tenders/quotes lose
function scoreDoc(query, doc) {
  const q = normalizeName(query);
  const name = normalizeName(doc.name || "");
  const p = normalizeName(doc.path || "");
  let score = 0;

  // strict/loose matches
  if (name === q) score += 100;
  if (name.includes(q)) score += 40;

  // word coverage
  const words = q.split(" ").filter(Boolean);
  const cover = words.filter((w) => name.includes(w) || p.includes(w)).length;
  score += cover * 8;

  // synonyms
  const syns = SYNONYMS[q] || [];
  syns.forEach((s) => {
    if (name.includes(s) || p.includes(s)) score += 12;
  });

  // folder/topic boosts (farm-ish)
  if (/(sheep|farm|lpa|nlis|biosecurity|sa|welfare|spray|treatment)/.test(p))
    score += 10;

  // extension preference
  if (goodExt(doc.path)) score += 6;
  if (/\bdocs[\/\\]ai\b/.test(doc.path || "")) score += 3;
  // hard penalties for unrelated office stuff
  if (/(tender|quote|proposal|invoice|resume|cv|brochure)/.test(p)) score -= 30;

  return score;
}

function pickBestDoc(query, docs) {
  // optional scoping
  const pool = DOCS_FILTER_RE
    ? docs.filter((d) => DOCS_FILTER_RE.test(d.path || d.relativePath || ""))
    : docs;

  let best = null;
  for (const d of pool) {
    const s = scoreDoc(query, d);
    if (!best || s > best.score) best = { doc: d, score: s };
  }
  // require a minimum score so junk doesn't link
  if (!best || best.score < 18) return null;
  return best.doc;
}

// Auto-link ISN documents
router.post("/api/auto-link-isn-documents", (req, res) => {
  try {
    const isnIndex = loadISNIndex();
    const docs = safeDocIndex(req);
    let linkedCount = 0;

    Object.keys(isnIndex).forEach((categoryName) => {
      const category = isnIndex[categoryName];

      // Category document (by smarter match) if not set
      if (!category.document && !category.documentId) {
        const foundDoc = pickBestDoc(categoryName, docs);
        if (foundDoc) {
          category.documentId = foundDoc.id;
          linkedCount++;
        }
      }

      // Children
      if (Array.isArray(category.children) && category.children.length > 0) {
        if (!Array.isArray(category.enrichedChildren))
          category.enrichedChildren = [];

        category.children.forEach((childName) => {
          const idx = category.enrichedChildren.findIndex(
            (c) => c.name === childName
          );
          const hasDoc = idx >= 0 && category.enrichedChildren[idx].document;
          if (!hasDoc) {
            const foundDoc = pickBestDoc(childName, docs);
            if (foundDoc) {
              const childData = {
                name: childName,
                document: {
                  id: foundDoc.id,
                  name: foundDoc.name,
                  path: foundDoc.path,
                  isArchived: !!foundDoc.isArchived,
                },
                found: true,
                autoLinked: true,
                linkedAt: new Date().toISOString(),
              };
              if (idx >= 0) category.enrichedChildren[idx] = childData;
              else category.enrichedChildren.push(childData);
              linkedCount++;
            }
          }
        });
      }
    });

    if (saveISNIndex(isnIndex)) {
      res.json({
        success: true,
        linked: linkedCount,
        message: `Successfully linked ${linkedCount} ISN documents`,
      });
    } else {
      res.json({ success: false, message: "Error saving ISN structure" });
    }
  } catch (error) {
    console.error("Error in ISN auto-linking:", error);
    res.json({
      success: false,
      message: "Error in auto-linking: " + error.message,
    });
  }
});

// ISN Mandatory Records
router.get("/api/isn-mandatory-records", (req, res) => {
  try {
    const mandatoryRecords = loadISNMandatoryRecords();
    const docs = safeDocIndex(req);

    Object.keys(mandatoryRecords).forEach((recordType) => {
      const record = mandatoryRecords[recordType];
      const keywords = record.autoDetectKeywords || [];
      const autoDetectedDocs = docs
        .filter((doc) => {
          if (doc.isArchived) return false;
          const hay = (
            (doc.name || "") +
            " " +
            (doc.folder || "") +
            " " +
            (doc.relativePath || "")
          ).toLowerCase();
          return keywords.some((kw) => hay.includes(String(kw).toLowerCase()));
        })
        .map((doc) => ({
          id: doc.id,
          name: doc.name,
          path: doc.path,
          folder: doc.folder,
          modified: doc.modified,
          created: doc.created,
          isArchived: !!doc.isArchived,
          autoDetected: true,
          matchedKeywords: keywords.filter((kw) =>
            ((doc.name || "") + " " + (doc.folder || ""))
              .toLowerCase()
              .includes(String(kw).toLowerCase())
          ),
        }));
      record.enrichedDocuments = autoDetectedDocs;
    });

    res.json({ success: true, mandatoryRecords });
  } catch (error) {
    console.error("Error getting ISN mandatory records:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Link ISN mandatory record
router.post("/api/link-isn-mandatory-record", (req, res) => {
  try {
    const { recordType, documentId, actualDocumentName } = req.body;
    if (!recordType || !documentId) {
      return res.json({
        success: false,
        message: "Missing required parameters: recordType or documentId",
      });
    }

    const mandatoryRecords = loadISNMandatoryRecords();
    if (!mandatoryRecords[recordType]) {
      return res.json({
        success: false,
        message: `Record type "${recordType}" not found`,
      });
    }

    const docs = safeDocIndex(req);
    const actualDocument = docs.find((doc) => doc.id === documentId);
    if (!actualDocument) {
      return res.json({
        success: false,
        message: `Document with ID "${documentId}" not found`,
      });
    }

    if (!Array.isArray(mandatoryRecords[recordType].enrichedDocuments)) {
      mandatoryRecords[recordType].enrichedDocuments = [];
    }

    const existingIdx = mandatoryRecords[
      recordType
    ].enrichedDocuments.findIndex((d) => d.id === documentId);
    if (existingIdx !== -1) {
      mandatoryRecords[recordType].enrichedDocuments[
        existingIdx
      ].manuallyLinked = true;
      mandatoryRecords[recordType].enrichedDocuments[
        existingIdx
      ].autoDetected = false;
    } else {
      mandatoryRecords[recordType].enrichedDocuments.push({
        id: documentId,
        name: actualDocument.name,
        path: actualDocument.path,
        folder: actualDocument.folder,
        modified: actualDocument.modified,
        created: actualDocument.created,
        isArchived: !!actualDocument.isArchived,
        autoDetected: false,
        manuallyLinked: true,
        linkedAt: new Date().toISOString(),
      });
    }

    mandatoryRecords[recordType].lastUpdated = new Date().toISOString();

    if (saveISNMandatoryRecords(mandatoryRecords)) {
      res.json({
        success: true,
        message: `Successfully linked "${
          actualDocumentName || actualDocument.name
        }" to "${recordType}"`,
      });
    } else {
      res.json({ success: false, message: "Failed to save mandatory records" });
    }
  } catch (error) {
    console.error("Error linking ISN mandatory record:", error);
    res.json({
      success: false,
      message: "Internal server error: " + error.message,
    });
  }
});

// Auto-detect ISN mandatory records
router.post("/api/auto-detect-isn-mandatory-records", (req, res) => {
  try {
    const mandatoryRecords = loadISNMandatoryRecords();
    const docs = safeDocIndex(req);

    let detectionCount = 0;
    Object.keys(mandatoryRecords).forEach((recordType) => {
      const record = mandatoryRecords[recordType];
      const keywords = record.autoDetectKeywords || [];
      const matchingDocs = docs.filter((doc) => {
        if (doc.isArchived) return false;
        const hay = (
          (doc.name || "") +
          " " +
          (doc.folder || "") +
          " " +
          (doc.relativePath || "")
        ).toLowerCase();
        return keywords.some((kw) => hay.includes(String(kw).toLowerCase()));
      });

      record.enrichedDocuments = matchingDocs.map((doc) => ({
        id: doc.id,
        name: doc.name,
        path: doc.path,
        folder: doc.folder,
        modified: doc.modified,
        created: doc.created,
        isArchived: !!doc.isArchived,
        autoDetected: true,
        matchedKeywords: keywords.filter((kw) =>
          ((doc.name || "") + " " + (doc.folder || ""))
            .toLowerCase()
            .includes(String(kw).toLowerCase())
        ),
      }));

      detectionCount += matchingDocs.length;
    });

    saveISNMandatoryRecords(mandatoryRecords);
    res.json({
      success: true,
      message: `Auto-detection completed. Found ${detectionCount} potential ISN matches.`,
      detectedCount: detectionCount,
    });
  } catch (error) {
    console.error("Error in ISN auto-detection:", error);
    res.json({
      success: false,
      message: "Error in auto-detection: " + error.message,
    });
  }
});

module.exports = router;
