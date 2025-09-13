const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const chokidar = require("chokidar");
const { v4: uuidv4 } = require("uuid");

const app = express();
const port = 3000;

// ========================================
// CONFIGURATION AND SETUP
// ========================================

const APPLICATION_DIR = process.cwd();
//const VIEWS_DIR = path.join(APPLICATION_DIR, "views");
//const DOCUMENTS_DIR = process.env.DOCUMENTS_DIR || "I:/IMS";
const { loadConfig } = require("./config");
const cfg = loadConfig();

const VIEWS_DIR = path.join(APPLICATION_DIR, "views");
const ENV_DOCUMENTS_DIR = process.env.DOCUMENTS_DIR || "I:/IMS";

// NEW: prefer config.json list; if empty, use env var as the only root
const DOCUMENTS_DIRS =
  cfg.documentsDirs && cfg.documentsDirs.length
    ? cfg.documentsDirs
    : [ENV_DOCUMENTS_DIR];

console.log("Application directory:", APPLICATION_DIR);
console.log("Views directory:", VIEWS_DIR);
console.log("Documents directories:", DOCUMENTS_DIRS);

// Legacy alias so existing functions keep working:
const DOCUMENTS_DIR = DOCUMENTS_DIRS[0];
app.locals.DOCUMENTS_DIR = DOCUMENTS_DIR; // if any routes read from app.locals

// File paths for JSON data storage (all in root directory)
const INDEX_FILE = path.join(APPLICATION_DIR, "document-index.json");
const IMS_INDEX_FILE = path.join(APPLICATION_DIR, "ims-document-index.json");
const ISN_INDEX_FILE = path.join(APPLICATION_DIR, "isn-index.json");
const FOLDERS_FILE = path.join(APPLICATION_DIR, "folders.json");
const MANDATORY_RECORDS_FILE = path.join(
  APPLICATION_DIR,
  "mandatory-records-index.json"
);
const ISN_MANDATORY_RECORDS_FILE = path.join(
  APPLICATION_DIR,
  "isn-mandatory-records.json"
);

// ========================================
// MIDDLEWARE SETUP
// ========================================

app.set("view engine", "ejs");
app.set("views", VIEWS_DIR);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static("public"));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = req.body.folder
      ? path.join(DOCUMENTS_DIR, req.body.folder)
      : DOCUMENTS_DIR;

    // Ensure directory exists
    fsSync.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

// ========================================
// GLOBAL VARIABLES
// ========================================

let documentIndex = [];
let folderStructure = [];
let fileWatcher = null;

// ========================================
// UTILITY FUNCTIONS
// ========================================

async function loadDocumentIndex() {
  try {
    if (fsSync.existsSync(INDEX_FILE)) {
      const data = fsSync.readFileSync(INDEX_FILE, "utf8");
      documentIndex = JSON.parse(data);

      // ADD THIS LINE:
      if (typeof app !== "undefined" && app.locals) {
        app.locals.documentIndex = documentIndex;
        console.log(
          `✅ Loaded app.locals.documentIndex with ${documentIndex.length} documents`
        );
      }

      console.log(
        `Index loaded from file. ${documentIndex.length} documents in index.`
      );
    } else {
      console.log("No existing index found. Starting fresh.");
      documentIndex = [];
    }
  } catch (error) {
    console.error("Error loading document index:", error);
    documentIndex = [];
  }
}

async function saveDocumentIndex() {
  try {
    fsSync.writeFileSync(INDEX_FILE, JSON.stringify(documentIndex, null, 2));
    console.log(`Document index saved. ${documentIndex.length} documents.`);
  } catch (error) {
    console.error("Error saving document index:", error);
  }
}

async function loadFolderStructure() {
  try {
    if (fsSync.existsSync(FOLDERS_FILE)) {
      const data = fsSync.readFileSync(FOLDERS_FILE, "utf8");
      console.log("Folder structure loaded from file.");
    } else {
      console.log("No existing folder structure found. Building from scratch.");
      await buildFolderStructure();
    }
  } catch (error) {
    console.error("Error loading folder structure:", error);
    folderStructure = [];
  }
}

async function saveFolderStructure() {
  try {
    fsSync.writeFileSync(
      FOLDERS_FILE,
      JSON.stringify(folderStructure, null, 2)
    );
    console.log("Folder structure saved.");
  } catch (error) {
    console.error("Error saving folder structure:", error);
  }
}

const LEARNING_DATA_PATH = path.join(__dirname, "learning-patterns.json");
const REVISION_LOG_PATH = path.join(__dirname, "data", "revision-log.json");

// ========================================
// MISSING HELPER FUNCTIONS - Add these to your app.js
// ========================================

// Add this function near your other helper functions (before learning functions)
function isOldDocument(filePath) {
  const pathLower = filePath.toLowerCase();
  const fileName = path.basename(pathLower);

  // Check for old years in the path or filename
  const oldYearPattern = /(2019|2020|2021|2022|2023)/;
  const currentYear = new Date().getFullYear();

  // If the path or filename contains years older than 2024, consider it old
  const yearMatches = pathLower.match(/\b(20\d{2})\b/g);
  if (yearMatches) {
    return yearMatches.some((year) => parseInt(year) < currentYear - 1);
  }

  // Check for date patterns that indicate old documents
  const oldDatePatterns = [
    /\b\d{1,2}[-\.]\d{1,2}[-\.](19|20)\d{2}\b/, // DD-MM-YYYY or DD.MM.YYYY
    /\b(19|20)\d{2}[-\.]\d{1,2}[-\.]\d{1,2}\b/, // YYYY-MM-DD
    /\b\d{1,2}[-\.](0[1-9]|1[0-2])[-\.](20)\d{2}\b/, // DD-MM-YYYY
  ];

  return oldDatePatterns.some((pattern) => pathLower.match(pattern));
}

// Also add these helper functions for the enhanced matching
function findFuzzyMatch(searchTerm, text) {
  // Simple fuzzy matching algorithm
  const words = text.split(/[\s\-_]+/);
  let bestScore = 0;
  let bestMatch = "";

  words.forEach((word) => {
    const score = calculateLevenshteinSimilarity(searchTerm, word);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = word;
    }
  });

  return { score: bestScore, match: bestMatch };
}

function calculateLevenshteinSimilarity(str1, str2) {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1;

  const distance = calculateLevenshteinDistance(str1, str2);
  return (maxLength - distance) / maxLength;
}

function calculateLevenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

function calculateMatchScore(searchTerms, document) {
  let score = 0;
  const docName = document.name.toLowerCase();
  const docPath = document.path.toLowerCase();

  searchTerms.forEach((term) => {
    if (docName.includes(term)) score += 3;
    else if (docPath.includes(term)) score += 1;
  });

  return score;
}

function calculateFolderBonus(folder, categoryPatterns) {
  let bonus = 0;
  const folderLower = folder.toLowerCase();

  Object.values(categoryPatterns).forEach((category) => {
    if (category.folders && category.folders[folderLower]) {
      bonus += category.folders[folderLower] * 2; // 2 points per historical match
    }
  });

  return Math.min(bonus, 15); // Cap at 15 points
}

function calculateExtensionBonus(filename, categoryPatterns) {
  let bonus = 0;
  const extension = path.extname(filename).toLowerCase();

  Object.values(categoryPatterns).forEach((category) => {
    if (category.extensions && category.extensions[extension]) {
      bonus += category.extensions[extension]; // 1 point per historical match
    }
  });

  return Math.min(bonus, 5); // Cap at 5 points
}

// ========================================
// DOCUMENT ACCESS HELPER FUNCTIONS
// ========================================

// Log document access for audit trail
function logDocumentAccess(document, userIP) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      documentId: document.id,
      documentName: document.name,
      documentPath: document.path,
      userIP: userIP,
      action: "opened",
    };

    const logPath = path.join(__dirname, "data", "access-log.json");
    let accessLog = [];

    if (fsSync.existsSync(logPath)) {
      try {
        accessLog = JSON.parse(fsSync.readFileSync(logPath, "utf8"));
      } catch (e) {
        accessLog = [];
      }
    }

    accessLog.push(logEntry);

    // Keep only last 1000 entries
    if (accessLog.length > 1000) {
      accessLog = accessLog.slice(-1000);
    }

    fsSync.writeFileSync(logPath, JSON.stringify(accessLog, null, 2));
  } catch (error) {
    console.error("Error logging document access:", error);
  }
}

// Check if file can be previewed
function canPreviewFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const previewableExtensions = [".txt", ".md", ".json", ".csv", ".xml"];
  return previewableExtensions.includes(ext);
}

// Format file size (enhance existing if needed)
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + " KB";
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + " MB";
  else return (bytes / 1073741824).toFixed(2) + " GB";
}

// Get revision history (you already have saveRevisionLog)
function getRevisionHistory(documentId) {
  try {
    const logPath = path.join(__dirname, "data", "revision-log.json");
    if (fsSync.existsSync(logPath)) {
      const revisionLog = JSON.parse(fsSync.readFileSync(logPath, "utf8"));
      return revisionLog[documentId] || [];
    }
    return [];
  } catch (error) {
    console.error("Error loading revision history:", error);
    return [];
  }
}
// ========================================
// LEARNING SYSTEM FUNCTIONS
// ========================================

function loadLearningPatterns() {
  try {
    if (fsSync.existsSync(LEARNING_DATA_PATH)) {
      const data = JSON.parse(fsSync.readFileSync(LEARNING_DATA_PATH, "utf8"));

      // Ensure all required properties exist with proper structure
      if (!data.documentPatterns) data.documentPatterns = {};
      if (!data.categoryPatterns) data.categoryPatterns = {};
      if (!data.keywordWeights) data.keywordWeights = {};
      if (!data.manualCorrections) data.manualCorrections = [];
      if (!data.negativePatterns) data.negativePatterns = [];

      return data;
    }
  } catch (err) {
    console.error("Error loading learning patterns:", err);
  }

  // Return default structure
  return {
    documentPatterns: {},
    categoryPatterns: {},
    keywordWeights: {},
    manualCorrections: [],
    negativePatterns: [],
    lastUpdated: null,
  };
}

function saveLearningPatterns(patterns) {
  try {
    patterns.lastUpdated = new Date().toISOString();
    fsSync.writeFileSync(LEARNING_DATA_PATH, JSON.stringify(patterns, null, 2));
    return true;
  } catch (err) {
    console.error("Error saving learning patterns:", err);
    return false;
  }
}

function learnFromManualLink(
  originalSearch,
  actualDocument,
  category,
  recordType = null
) {
  try {
    const patterns = loadLearningPatterns();

    // Ensure patterns object has all required properties
    if (!patterns.documentPatterns) patterns.documentPatterns = {};
    if (!patterns.categoryPatterns) patterns.categoryPatterns = {};
    if (!patterns.keywordWeights) patterns.keywordWeights = {};
    if (!patterns.manualCorrections) patterns.manualCorrections = [];
    if (!patterns.negativePatterns) patterns.negativePatterns = [];

    const searchTerms = originalSearch.toLowerCase().split(/[\s\-_]+/);
    const actualName = actualDocument.name.toLowerCase();
    const actualPath = actualDocument.path.toLowerCase();

    console.log(
      `Learning from correction: "${originalSearch}" -> "${actualDocument.name}"`
    );

    // 1. Document name patterns
    if (!patterns.documentPatterns[originalSearch.toLowerCase()]) {
      patterns.documentPatterns[originalSearch.toLowerCase()] = [];
    }

    patterns.documentPatterns[originalSearch.toLowerCase()].push({
      documentId: actualDocument.id,
      documentName: actualDocument.name,
      path: actualDocument.path,
      category: category,
      recordType: recordType,
      confidence: 1.0,
      learnedAt: new Date().toISOString(),
      searchPattern: searchTerms,
      pathPattern: actualDocument.folder
        ? actualDocument.folder.toLowerCase()
        : "",
    });

    // 2. Extract successful keywords
    const successfulKeywords = [];
    searchTerms.forEach((term) => {
      if (term.length > 2) {
        if (actualName.includes(term) || actualPath.includes(term)) {
          successfulKeywords.push({
            keyword: term,
            matchType: actualName.includes(term) ? "name" : "path",
            position: actualName.indexOf(term),
            context: category,
          });
        }

        if (term.length > 3) {
          try {
            const fuzzyMatch = findFuzzyMatch(term, actualName);
            if (fuzzyMatch && fuzzyMatch.score > 0.8) {
              successfulKeywords.push({
                keyword: term,
                matchType: "fuzzy",
                fuzzyScore: fuzzyMatch.score,
                actualMatch: fuzzyMatch.match,
                context: category,
              });
            }
          } catch (fuzzyError) {
            // Skip fuzzy matching if it fails
          }
        }
      }
    });

    // 3. Update keyword weights
    successfulKeywords.forEach((keywordData) => {
      const keyword = keywordData.keyword;
      if (!patterns.keywordWeights[keyword]) {
        patterns.keywordWeights[keyword] = {
          score: 0,
          uses: 0,
          contexts: {},
          matchTypes: {},
        };
      }

      let weight = 1;
      switch (keywordData.matchType) {
        case "name":
          weight = 3;
          break;
        case "path":
          weight = 2;
          break;
        case "fuzzy":
          weight = keywordData.fuzzyScore * 2;
          break;
      }

      patterns.keywordWeights[keyword].score += weight;
      patterns.keywordWeights[keyword].uses += 1;

      if (!patterns.keywordWeights[keyword].contexts[category]) {
        patterns.keywordWeights[keyword].contexts[category] = 0;
      }
      patterns.keywordWeights[keyword].contexts[category] += 1;

      if (!patterns.keywordWeights[keyword].matchTypes[keywordData.matchType]) {
        patterns.keywordWeights[keyword].matchTypes[keywordData.matchType] = 0;
      }
      patterns.keywordWeights[keyword].matchTypes[keywordData.matchType] += 1;
    });

    // 4. Category patterns - ROBUST initialization
    if (category && typeof category === "string") {
      // Initialize the specific category completely
      if (!patterns.categoryPatterns[category]) {
        patterns.categoryPatterns[category] = {
          documents: {},
          folders: {},
          extensions: {},
          commonWords: {},
        };
        console.log(`Initialized new category pattern: ${category}`);
      }

      // Verify all sub-objects exist
      if (!patterns.categoryPatterns[category].documents)
        patterns.categoryPatterns[category].documents = {};
      if (!patterns.categoryPatterns[category].folders)
        patterns.categoryPatterns[category].folders = {};
      if (!patterns.categoryPatterns[category].extensions)
        patterns.categoryPatterns[category].extensions = {};
      if (!patterns.categoryPatterns[category].commonWords)
        patterns.categoryPatterns[category].commonWords = {};

      const fileExtension = path.extname(actualDocument.name).toLowerCase();
      const folderPattern = actualDocument.folder
        ? actualDocument.folder.toLowerCase()
        : "";

      // Track folder patterns
      if (folderPattern) {
        if (!patterns.categoryPatterns[category].folders[folderPattern]) {
          patterns.categoryPatterns[category].folders[folderPattern] = 0;
        }
        patterns.categoryPatterns[category].folders[folderPattern] += 1;
      }

      // Track file extensions
      if (fileExtension) {
        if (!patterns.categoryPatterns[category].extensions[fileExtension]) {
          patterns.categoryPatterns[category].extensions[fileExtension] = 0;
        }
        patterns.categoryPatterns[category].extensions[fileExtension] += 1;
      }

      // Track common words - THIS IS WHERE THE ERROR OCCURS
      const words = actualDocument.name.toLowerCase().split(/[\s\-_]+/);
      words.forEach((word) => {
        if (word && word.length > 3) {
          // Double-check the category still exists (defensive programming)
          if (
            patterns.categoryPatterns[category] &&
            patterns.categoryPatterns[category].commonWords
          ) {
            if (!patterns.categoryPatterns[category].commonWords[word]) {
              patterns.categoryPatterns[category].commonWords[word] = 0;
            }
            patterns.categoryPatterns[category].commonWords[word] += 1;
          } else {
            console.error(
              `Category pattern lost during processing: ${category}`
            );
            // Re-initialize if somehow lost
            patterns.categoryPatterns[category] = {
              documents: {},
              folders: {},
              extensions: {},
              commonWords: { [word]: 1 },
            };
          }
        }
      });
    }

    // 5. Store manual correction
    patterns.manualCorrections.push({
      searchTerm: originalSearch,
      foundDocument: actualDocument.name,
      category: category,
      recordType: recordType,
      successfulKeywords: successfulKeywords,
      timestamp: new Date().toISOString(),
      documentPath: actualDocument.path,
      folderPattern: actualDocument.folder || "",
      searchComplexity: searchTerms.length,
      documentComplexity: actualDocument.name.split(/[\s\-_]+/).length,
      matchScore: calculateMatchScore
        ? calculateMatchScore(searchTerms, actualDocument)
        : 0,
    });

    // Keep only last 1000 corrections
    if (patterns.manualCorrections.length > 1000) {
      patterns.manualCorrections = patterns.manualCorrections.slice(-1000);
    }

    // Save patterns
    if (saveLearningPatterns(patterns)) {
      console.log(
        `Successfully learned from correction: ${successfulKeywords.length} keywords recorded`
      );
    } else {
      console.error("Failed to save learning patterns");
    }
  } catch (error) {
    console.error("Error in learnFromManualLink:", error);
    console.error("Error details:", {
      originalSearch,
      actualDocument: actualDocument ? actualDocument.name : "undefined",
      category,
      recordType,
      line: error.stack ? error.stack.split("\n")[1] : "unknown",
    });
  }
}

// SOPHISTICATED document finding using learned patterns - RESTORED COMPLEXITY
function findDocumentByNameWithLearning(docName, includeArchived = false) {
  const patterns = loadLearningPatterns();

  console.log(`Enhanced search for: "${docName}"`);

  // 1. Check negative patterns first (documents to avoid)
  const negativeMatches = (patterns.negativePatterns || []).filter(
    (negative) => negative.searchTerm === docName.toLowerCase()
  );

  const avoidDocumentIds = negativeMatches.map(
    (negative) => negative.avoidDocumentId
  );

  if (avoidDocumentIds.length > 0) {
    console.log(
      `Found ${avoidDocumentIds.length} documents to avoid for "${docName}"`
    );
  }

  // 2. First try exact pattern match from learning - ENHANCED CONFIDENCE
  const exactMatch = patterns.documentPatterns[docName.toLowerCase()];
  if (exactMatch && exactMatch.length > 0) {
    // Sort by confidence and recency
    const bestMatch = exactMatch.sort((a, b) => {
      const confidenceDiff = b.confidence - a.confidence;
      if (confidenceDiff !== 0) return confidenceDiff;
      return new Date(b.learnedAt) - new Date(a.learnedAt);
    })[0];

    const foundDoc = documentIndex.find(
      (doc) => doc.id === bestMatch.documentId
    );

    if (
      foundDoc &&
      (includeArchived || !foundDoc.isArchived) &&
      !avoidDocumentIds.includes(foundDoc.id)
    ) {
      console.log(
        `Found document using learned pattern: ${foundDoc.name} (confidence: ${bestMatch.confidence})`
      );
      return foundDoc;
    }
  }

  // 3. SOPHISTICATED keyword matching using learned weights and context
  const searchTerms = docName.toLowerCase().split(/[\s\-_]+/);
  const candidates = documentIndex.filter((doc) => {
    // Skip archived if not requested
    if (!includeArchived && doc.isArchived) return false;

    // Skip archived/old documents
    if (isArchivedDocument(doc.path) || isOldDocument(doc.path)) {
      return false;
    }

    // Skip documents in avoid list
    if (avoidDocumentIds.includes(doc.id)) return false;

    // Skip contractor documents if learned to avoid
    if (isContractorDocument(doc.path)) {
      const hasContractorAvoidance = negativeMatches.some(
        (negative) => negative.reason === "contractor_document"
      );
      if (hasContractorAvoidance) {
        return false;
      }
    }

    return true;
  });

  // ENHANCED SCORING ALGORITHM
  const scoredCandidates = candidates.map((doc) => {
    let score = 0;
    const docText = (
      doc.name +
      " " +
      doc.folder +
      " " +
      doc.relativePath
    ).toLowerCase();

    // 1. Basic term matching with learned weights
    searchTerms.forEach((term) => {
      if (term.length > 2 && docText.includes(term)) {
        const weight = patterns.keywordWeights[term];
        let termScore = weight ? weight.score : 1;

        // Boost score based on match type history
        if (weight && weight.matchTypes) {
          if (weight.matchTypes.name && doc.name.toLowerCase().includes(term)) {
            termScore *= 2; // Name matches are more valuable
          }
          if (weight.matchTypes.fuzzy) {
            termScore *= 1.5; // Fuzzy matches add flexibility
          }
        }

        score += termScore;
      }
    });

    // 2. Exact name match bonus - MAJOR BOOST
    if (doc.name.toLowerCase() === docName.toLowerCase()) {
      score += 100;
    }

    // 3. Partial name match bonus - ENHANCED
    if (doc.name.toLowerCase().includes(docName.toLowerCase())) {
      score += 50;
    }

    // 4. Reverse partial match (document name in search)
    if (
      docName
        .toLowerCase()
        .includes(doc.name.toLowerCase().replace(/\.[^/.]+$/, ""))
    ) {
      score += 30;
    }

    // 5. Folder pattern bonus - NEW ENHANCEMENT
    const folderBonus = calculateFolderBonus(
      doc.folder,
      patterns.categoryPatterns
    );
    score += folderBonus;

    // 6. Extension pattern bonus
    const extensionBonus = calculateExtensionBonus(
      doc.name,
      patterns.categoryPatterns
    );
    score += extensionBonus;

    // 7. PENALTIES for problematic documents
    if (isContractorDocument(doc.path)) {
      score -= 25;
    }

    if (isArchivedDocument(doc.path) || doc.isArchived) {
      score -= 100;
    }

    // 8. Age penalty - newer files preferred
    const ageInDays =
      (Date.now() - new Date(doc.modified)) / (1000 * 60 * 60 * 24);
    if (ageInDays > 365) {
      score -= Math.min((ageInDays / 365) * 5, 20); // Max 20 point penalty
    }

    return {
      doc,
      score,
      breakdown: { termScore: score, folderBonus, extensionBonus },
    };
  });

  // Return best match if score is good enough
  const bestCandidate = scoredCandidates.sort((a, b) => b.score - a.score)[0];

  if (bestCandidate && bestCandidate.score > 3) {
    // lowered threshold
    console.log(
      `Found document with enhanced score ${bestCandidate.score}: ${bestCandidate.doc.name}`
    );
    console.log(`Score breakdown:`, bestCandidate.breakdown);
    return bestCandidate.doc;
  }

  // 4. Fallback to original method with enhanced filtering
  console.log(`No high-confidence match found, trying fallback search`);
  const fallbackDoc = findDocumentByName(docName, includeArchived);
  if (
    fallbackDoc &&
    !avoidDocumentIds.includes(fallbackDoc.id) &&
    !isContractorDocument(fallbackDoc.path) &&
    !isArchivedDocument(fallbackDoc.path) &&
    !fallbackDoc.isArchived
  ) {
    console.log(`Fallback found: ${fallbackDoc.name}`);
    return fallbackDoc;
  }

  console.log(`No match found for: "${docName}"`);
  return null;
}

// HELPER FUNCTIONS FOR ENHANCED MATCHING

function findFuzzyMatch(searchTerm, text) {
  // Simple fuzzy matching algorithm
  const words = text.split(/[\s\-_]+/);
  let bestScore = 0;
  let bestMatch = "";

  words.forEach((word) => {
    const score = calculateLevenshteinSimilarity(searchTerm, word);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = word;
    }
  });

  return { score: bestScore, match: bestMatch };
}

function calculateLevenshteinSimilarity(str1, str2) {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1;

  const distance = calculateLevenshteinDistance(str1, str2);
  return (maxLength - distance) / maxLength;
}

function calculateLevenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

function calculateMatchScore(searchTerms, document) {
  let score = 0;
  const docName = document.name.toLowerCase();
  const docPath = document.path.toLowerCase();

  searchTerms.forEach((term) => {
    if (docName.includes(term)) score += 3;
    else if (docPath.includes(term)) score += 1;
  });

  return score;
}

function calculateFolderBonus(folder, categoryPatterns) {
  let bonus = 0;
  const folderLower = folder.toLowerCase();

  Object.values(categoryPatterns).forEach((category) => {
    if (category.folders && category.folders[folderLower]) {
      bonus += category.folders[folderLower] * 2; // 2 points per historical match
    }
  });

  return Math.min(bonus, 15); // Cap at 15 points
}

function calculateExtensionBonus(filename, categoryPatterns) {
  let bonus = 0;
  const extension = path.extname(filename).toLowerCase();

  Object.values(categoryPatterns).forEach((category) => {
    if (category.extensions && category.extensions[extension]) {
      bonus += category.extensions[extension]; // 1 point per historical match
    }
  });

  return Math.min(bonus, 5); // Cap at 5 points
}

// Enhanced negative pattern recording
function recordNegativeLearningPattern(
  searchTerm,
  avoidDocument,
  unlinkType,
  category = null
) {
  try {
    const patterns = loadLearningPatterns();

    if (!patterns.negativePatterns) {
      patterns.negativePatterns = [];
    }

    const isContractorDoc = isContractorDocument(avoidDocument.path);
    const isArchiveDoc = isArchivedDocument(avoidDocument.path);

    const negativePattern = {
      searchTerm: searchTerm.toLowerCase(),
      avoidDocumentId: avoidDocument.id,
      avoidDocumentName: avoidDocument.name,
      avoidDocumentPath: avoidDocument.path,
      isContractorDoc: isContractorDoc,
      isArchiveDoc: isArchiveDoc,
      unlinkType: unlinkType,
      category: category,
      reason: isArchiveDoc
        ? "archived_document"
        : isContractorDoc
        ? "contractor_document"
        : "manual_unlink",
      timestamp: new Date().toISOString(),
      confidence: 1.0, // Full confidence for manual unlinks
      folderPattern: avoidDocument.folder
        ? avoidDocument.folder.toLowerCase()
        : null,
    };

    patterns.negativePatterns.push(negativePattern);

    // Keep only last 500 negative patterns
    if (patterns.negativePatterns.length > 500) {
      patterns.negativePatterns = patterns.negativePatterns.slice(-500);
    }

    saveLearningPatterns(patterns);

    const reasonText = isArchiveDoc
      ? "archived"
      : isContractorDoc
      ? "contractor"
      : "manually unlinked";
    console.log(
      `Recorded negative pattern: avoid "${avoidDocument.name}" for "${searchTerm}" (${reasonText})`
    );
  } catch (error) {
    console.error("Error recording negative learning pattern:", error);
  }
}

// ========================================
// DOCUMENT DETECTION FUNCTIONS
// ========================================

function isArchivedDocument(filePath) {
  const pathLower = filePath.toLowerCase();
  const fileName = path.basename(pathLower);
  const currentYear = new Date().getFullYear();

  const archiveKeywords = [
    "archive",
    "archives",
    "archived",
    "old",
    "backup",
    "backups",
    "previous",
    "prev",
    "historical",
    "legacy",
    "superseded",
    "obsolete",
    "replaced",
    "outdated",
    "deprecated",
    "retired",
    "inactive",
    "expired",
    "cancelled",
    "withdrawn",
  ];

  // Check for archive keywords
  const pathSegments = pathLower.split(/[\\\/]/);
  const hasArchiveKeyword = archiveKeywords.some(
    (keyword) =>
      pathSegments.some((segment) => segment.includes(keyword)) ||
      fileName.includes(keyword)
  );

  if (hasArchiveKeyword) return true;

  // Check for old year patterns
  const yearPattern = /\b(20\d{2})\b/g;
  const years = pathLower.match(yearPattern);
  if (years) {
    const oldYears = years.filter((year) => parseInt(year) < currentYear - 1);
    if (oldYears.length > 0) return true;
  }

  // Check for date patterns in filename
  const datePatterns = [
    /\b\d{1,2}[-\.]\d{1,2}[-\.](20)\d{2}\b/, // DD-MM-YYYY
    /\b(20)\d{2}[-\.]\d{1,2}[-\.]\d{1,2}\b/, // YYYY-MM-DD
    /\bv?\d+[-\.]\d+[-\.](20)\d{2}\b/, // Version with date
    /\b(20)\d{2}[-_](0[1-9]|1[0-2])\b/, // YYYY-MM format
  ];

  return datePatterns.some((pattern) => pathLower.match(pattern));
}

function isContractorDocument(filePath) {
  const pathLower = filePath.toLowerCase();
  const contractorKeywords = [
    "contractor",
    "contractors",
    "subcontractor",
    "subcontractors",
    "vendor",
    "vendors",
    "supplier",
    "suppliers",
    "external",
    "third party",
    "thirdparty",
    "client",
    "customer",
    "AA-In-Active",
    "Bellarine Foods",
    "CSIRO",
    "contractor folder",
    "vendor folder",
    "external docs",
    "client docs",
    "supplier docs",
  ];

  // Check for keywords in path segments
  const pathSegments = pathLower.split(/[\\\/]/);
  return contractorKeywords.some(
    (keyword) =>
      pathSegments.some((segment) => segment.includes(keyword)) ||
      pathLower.includes(keyword)
  );
}

function findDocumentByName(docName, includeArchived = false) {
  return documentIndex.find((doc) => {
    if (!includeArchived && doc.isArchived) return false;

    if (doc.name.toLowerCase() === docName.toLowerCase()) return true;

    const cleanDocName = docName.replace(/[-\s]/g, "").toLowerCase();
    const cleanFileName = doc.name.replace(/[-\s]/g, "").toLowerCase();

    return (
      cleanFileName.includes(cleanDocName) ||
      cleanDocName.includes(cleanFileName)
    );
  });
}

function loadIMSIndex() {
  try {
    if (fsSync.existsSync(IMS_INDEX_FILE)) {
      return JSON.parse(fsSync.readFileSync(IMS_INDEX_FILE, "utf8"));
    }
  } catch (err) {
    console.error("Error loading IMS index:", err);
  }

  // Default IMS structure
  return {
    "OHS Policy": { type: "policy", level: 1, documentId: null, children: [] },
    "Core Policies": {
      type: "category",
      level: 2,
      documentId: null,
      children: [],
    },
    "Incident and Injury Management": {
      type: "category",
      level: 2,
      documentId: null,
      children: [],
    },
    "Consultation and Communication": {
      type: "category",
      level: 2,
      documentId: null,
      children: [],
    },
    "Risk Management": {
      type: "category",
      level: 2,
      documentId: null,
      children: [],
    },
    "Work Instructions": {
      type: "category",
      level: 2,
      documentId: null,
      children: [],
    },
    "Safe Work Method Statements": {
      type: "category",
      level: 2,
      documentId: null,
      children: [],
    },
  };
}

function saveIMSIndex(imsIndex) {
  try {
    fsSync.writeFileSync(IMS_INDEX_FILE, JSON.stringify(imsIndex, null, 2));
    return true;
  } catch (err) {
    console.error("Error saving IMS index:", err);
    return false;
  }
}

function loadMandatoryRecords() {
  try {
    if (fsSync.existsSync(MANDATORY_RECORDS_FILE)) {
      return JSON.parse(fsSync.readFileSync(MANDATORY_RECORDS_FILE, "utf8"));
    }
  } catch (err) {
    console.error("Error loading mandatory records:", err);
  }

  return {
    "Internal Audit Records": {
      type: "mandatory",
      description: "Internal Audit schedule and audit report records",
      priority: "high",
      autoDetectKeywords: ["internal audit", "audit schedule", "audit report"],
      enrichedDocuments: [],
    },
    "Management Review Records": {
      type: "mandatory",
      description: "Management Review Meeting Minutes",
      priority: "high",
      autoDetectKeywords: [
        "management review",
        "management meeting",
        "review minutes",
      ],
      enrichedDocuments: [],
    },
    "Training/Skills Register": {
      type: "mandatory",
      description: "Current Training/Skills Register",
      priority: "high",
      autoDetectKeywords: [
        "training register",
        "skills register",
        "training matrix",
      ],
      enrichedDocuments: [],
    },
  };
}

// ========================================
// REVISION FUNCTIONS
// ========================================

function saveRevisionLog(documentId, revisionData) {
  try {
    fsSync.ensureDirSync(path.dirname(REVISION_LOG_PATH));
    let revisionLog = {};

    if (fsSync.existsSync(REVISION_LOG_PATH)) {
      revisionLog = JSON.parse(fsSync.readFileSync(REVISION_LOG_PATH, "utf8"));
    }

    if (!revisionLog[documentId]) {
      revisionLog[documentId] = [];
    }

    revisionLog[documentId].push(revisionData);
    fsSync.writeFileSync(
      REVISION_LOG_PATH,
      JSON.stringify(revisionLog, null, 2)
    );
    console.log("Revision log saved for document:", documentId);
  } catch (error) {
    console.error("Error saving revision log:", error);
  }
}

// ========================================
// IMPORT ROUTE MODULES
// ========================================

let imsRoutes, isnRoutes, documentRoutes;

// Import and mount document access routes (at root level)
try {
  documentRoutes = require("./routes/document-routes");
  app.use("/", documentRoutes);
  console.log("✅ Document routes loaded successfully");

  // List the routes that were loaded
  if (documentRoutes.stack) {
    console.log("Document routes registered:");
    documentRoutes.stack.forEach((route) => {
      if (route.route) {
        console.log(
          `  ${Object.keys(route.route.methods)} ${route.route.path}`
        );
      }
    });
  }
} catch (error) {
  console.log("❌ Document routes failed to load:");
  console.log("Error:", error.message);
  console.log("Stack:", error.stack);
}

// Import and mount IMS-specific routes
try {
  imsRoutes = require("./routes/ims-routes");
  app.use("/", imsRoutes);
  console.log("✅ IMS routes loaded successfully");
} catch (error) {
  console.log("❌ IMS routes failed to load:");
  console.log("Error:", error.message);
  console.log("Stack:", error.stack);
}

// Import and mount ISN-specific routes (at root level for API compatibility)
try {
  isnRoutes = require("./routes/isn-routes");
  app.use("/", isnRoutes); // Mount at root level for /api/isn-* routes
  console.log("ISN routes loaded successfully");
} catch (error) {
  console.log("ISN routes not found, loading basic routes");
  console.log("Error:", error.message);
}

// AI specific routes
app.use(require("./routes/ai-routes"));
app.use(require("./routes/ai-docs-routes"));
app.use("/", require("./routes/config-routes"));

// ========================================
// MAIN ROUTES
// ========================================

// Home route - Main dashboard
app.get("/", async (req, res) => {
  try {
    // Load basic statistics for dashboard
    const totalDocuments = documentIndex.length;
    const totalFolders = folderStructure.length;

    // Load IMS stats
    let imsStats = {
      linkedDocuments: 0,
      missingDocuments: 0,
      totalDocuments: 0,
    };
    try {
      if (fsSync.existsSync(IMS_INDEX_FILE)) {
        const imsData = JSON.parse(fsSync.readFileSync(IMS_INDEX_FILE, "utf8"));
        // Calculate IMS stats from data
        let linkedCount = 0;
        let totalImsCount = 0;

        function countDocuments(categories) {
          categories.forEach((category) => {
            if (category.linkedDocument) linkedCount++;
            if (category.children) {
              category.children.forEach((child) => {
                totalImsCount++;
                if (child.linkedDocument) linkedCount++;
              });
            } else {
              totalImsCount++;
            }
          });
        }

        if (imsData.categories) {
          countDocuments(imsData.categories);
        }

        imsStats = {
          linkedDocuments: linkedCount,
          missingDocuments: totalImsCount - linkedCount,
          totalDocuments: totalImsCount,
        };
      }
    } catch (error) {
      console.error("Error loading IMS stats:", error);
    }

    // Load ISN stats
    let isnStats = {
      linkedDocuments: 0,
      missingDocuments: 0,
      totalDocuments: 0,
    };
    try {
      if (fsSync.existsSync(ISN_INDEX_FILE)) {
        const isnData = JSON.parse(fsSync.readFileSync(ISN_INDEX_FILE, "utf8"));
        // Calculate ISN stats similar to IMS
        let linkedCount = 0;
        let totalIsnCount = 0;

        function countDocuments(categories) {
          categories.forEach((category) => {
            if (category.linkedDocument) linkedCount++;
            if (category.children) {
              category.children.forEach((child) => {
                totalIsnCount++;
                if (child.linkedDocument) linkedCount++;
              });
            } else {
              totalIsnCount++;
            }
          });
        }

        if (isnData.categories) {
          countDocuments(isnData.categories);
        }

        isnStats = {
          linkedDocuments: linkedCount,
          missingDocuments: totalIsnCount - linkedCount,
          totalDocuments: totalIsnCount,
        };
      }
    } catch (error) {
      console.error("Error loading ISN stats:", error);
    }

    res.render("dashboard", {
      totalDocuments,
      totalFolders,
      imsStats,
      isnStats,
      recentDocuments: documentIndex.slice(-10).reverse(), // Last 10 documents
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).send("Error loading dashboard");
  }
});

app.get("/ims-index", (req, res) => {
  try {
    // Load the IMS document index
    const imsIndexPath = path.join(__dirname, "ims-document-index.json");
    const imsData = JSON.parse(fsSync.readFileSync(imsIndexPath, "utf8"));

    // Load mandatory records
    const mandatoryRecordsPath = path.join(
      __dirname,
      "mandatory-records-index.json"
    );
    let mandatoryRecords = [];
    try {
      mandatoryRecords = JSON.parse(
        fsSync.readFileSync(mandatoryRecordsPath, "utf8")
      );
    } catch (err) {
      console.log("No mandatory records file found");
    }

    // Transform data for template
    const categories = Object.keys(imsData).map((categoryName) => {
      const category = imsData[categoryName];
      return {
        name: categoryName,
        type: category.type,
        level: category.level,
        documentId: category.documentId,
        children: category.children || [],
        enrichedChildren: category.enrichedChildren || [],
        totalDocuments: (category.enrichedChildren || []).length,
        linkedDocuments: (category.enrichedChildren || []).filter(
          (child) => child.found || child.document
        ).length,
      };
    });

    // Calculate statistics - FIXED CALCULATION
    const totalDocuments = categories.reduce(
      (sum, cat) => sum + (cat.children ? cat.children.length : 0),
      0
    );
    const linkedDocuments = categories.reduce(
      (sum, cat) => sum + cat.linkedDocuments,
      0
    );

    const stats = {
      totalCategories: categories.length,
      totalDocuments: totalDocuments,
      linkedDocuments: linkedDocuments,
      completionRate:
        totalDocuments > 0
          ? Math.round((linkedDocuments / totalDocuments) * 100)
          : 0,
    };

    console.log("IMS Stats calculated:", stats); // Debug log

    res.render("ims-index", {
      categories: categories,
      mandatoryRecords: mandatoryRecords,
      stats: stats, // Make sure this is passed
      title: "IMS Document Index",
    });
  } catch (error) {
    console.error("Error loading IMS index:", error);

    // Provide fallback stats to prevent template errors
    const fallbackStats = {
      totalCategories: 0,
      totalDocuments: 0,
      linkedDocuments: 0,
      completionRate: 0,
    };

    res.render("ims-index", {
      categories: [],
      mandatoryRecords: [],
      stats: fallbackStats, // Fallback stats
      title: "IMS Document Index",
      error: "Could not load IMS data: " + error.message,
    });
  }
});

// ISN Index Route - Similar structure for ISN
app.get("/isn-index", (req, res) => {
  try {
    // Load ISN data
    const isnIndexPath = path.join(__dirname, "isn-index.json");
    let isnData = {};
    try {
      isnData = JSON.parse(fsSync.readFileSync(isnIndexPath, "utf8"));
    } catch (err) {
      console.log("No ISN index file found, using empty data");
    }

    // Transform data for template (same structure as IMS)
    const categories = Object.keys(isnData).map((categoryName) => {
      const category = isnData[categoryName];
      return {
        name: categoryName,
        type: category.type || "category",
        level: category.level || 2,
        documentId: category.documentId,
        children: category.children || [],
        enrichedChildren: category.enrichedChildren || [],
        totalDocuments: (category.enrichedChildren || []).length,
        linkedDocuments: (category.enrichedChildren || []).filter(
          (child) => child.found
        ).length,
      };
    });

    // Calculate statistics
    const stats = {
      totalCategories: categories.length,
      totalDocuments: categories.reduce(
        (sum, cat) => sum + cat.totalDocuments,
        0
      ),
      linkedDocuments: categories.reduce(
        (sum, cat) => sum + cat.linkedDocuments,
        0
      ),
      completionRate: 0,
    };
    stats.completionRate =
      stats.totalDocuments > 0
        ? Math.round((stats.linkedDocuments / stats.totalDocuments) * 100)
        : 0;

    res.render("isn-index", {
      categories: categories,
      stats: stats,
      title: "ISN Document Index",
    });
  } catch (error) {
    console.error("Error loading ISN index:", error);
    res.render("isn-index", {
      categories: [],
      stats: {
        totalCategories: 0,
        totalDocuments: 0,
        linkedDocuments: 0,
        completionRate: 0,
      },
      title: "ISN Document Index",
      error: "Could not load ISN data",
    });
  }
});

// Documents route - Fixed to match template expectations
app.get("/documents", async (req, res) => {
  try {
    // Create results object that matches template expectations
    const results = {
      documents: documentIndex,
      totalCount: documentIndex.length,
      currentPage: 1,
      totalPages: 1,
    };

    res.render("documents", {
      documents: documentIndex,
      results: results, // Your template expects 'results'
      title: "Document Library",
    });
  } catch (error) {
    console.error("Error loading documents:", error);
    res.status(500).send("Error loading documents");
  }
});

// Folders route
app.get("/folders", async (req, res) => {
  try {
    res.render("folders", {
      folders: folderStructure,
      title: "Folder Structure",
    });
  } catch (error) {
    console.error("Error loading folders:", error);
    res.status(500).send("Error loading folders");
  }
});

// Reports route - Fixed to match template expectations
app.get("/reports", async (req, res) => {
  try {
    // Generate report data
    const totalDocuments = documentIndex.length;
    const totalFolders = folderStructure.length;

    // Document type analysis
    const documentTypes = {};
    documentIndex.forEach((doc) => {
      const ext = path.extname(doc.name).toLowerCase();
      documentTypes[ext] = (documentTypes[ext] || 0) + 1;
    });

    // Folder size analysis
    const folderSizes = folderStructure
      .map((folder) => ({
        name: folder.name,
        documentCount: folder.documents ? folder.documents.length : 0,
        path: folder.path,
      }))
      .sort((a, b) => b.documentCount - a.documentCount);

    // Add reportTemplates that your template expects
    const reportTemplates = {
      summary: {
        name: "System Summary",
        description: "Overview of all documents and folders",
      },
      compliance: {
        name: "Compliance Report",
        description: "IMS and ISN compliance status",
      },
      activity: {
        name: "Activity Report",
        description: "Recent document activity",
      },
    };

    res.render("reports", {
      title: "System Reports",
      totalDocuments,
      totalFolders,
      documentTypes,
      folderSizes,
      reportTemplates, // Your template expects this
      lastIndexed: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error loading reports:", error);
    res.status(500).send("Error loading reports");
  }
});

// Search route - Fixed to match template expectations
app.get("/search", async (req, res) => {
  try {
    const query = req.query.q || "";
    let results = [];

    if (query.trim()) {
      results = documentIndex.filter(
        (doc) =>
          doc.name.toLowerCase().includes(query.toLowerCase()) ||
          (doc.folder && doc.folder.toLowerCase().includes(query.toLowerCase()))
      );
    }

    res.render("search", {
      title: "Search Results",
      query,
      results,
      resultsCount: results.length, // Your template expects this
    });
  } catch (error) {
    console.error("Error performing search:", error);
    res.status(500).send("Error performing search");
  }
});

// Add this AFTER your route imports in app.js (around line 750)
app.use((req, res, next) => {
  if (
    req.path.includes("/api/document/metadata/") ||
    req.path.includes("/open/")
  ) {
    console.log(`🔍 Route hit: ${req.method} ${req.path}`);
    console.log(
      `📊 documentIndex available: ${
        req.app.locals.documentIndex
          ? req.app.locals.documentIndex.length
          : "undefined"
      } docs`
    );
    console.log(`🎯 Looking for document with ID: ${req.params.id}`);
  }
  next();
});
// ========================================
// API ROUTES
// ========================================

// ========================================
// DOCUMENT ACCESS ROUTES
// ========================================

// Open document directly
// Add these routes to your app.js API section:

// Add formatFileSize function if missing:
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + " KB";
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + " MB";
  else return (bytes / 1073741824).toFixed(2) + " GB";
}

// ========================================
// DOCUMENT INDEXING FUNCTIONS
// ========================================

async function buildDocumentIndex() {
  try {
    console.log("Building document index...");
    documentIndex = [];

    async function scanDirectory(dirPath, relativePath = "") {
      try {
        const items = fsSync.readdirSync(dirPath);

        for (const item of items) {
          const fullPath = path.join(dirPath, item);
          const stats = fsSync.statSync(fullPath);

          if (stats.isDirectory()) {
            const newRelativePath = relativePath
              ? path.join(relativePath, item)
              : item;
            await scanDirectory(fullPath, newRelativePath);
          } else if (stats.isFile()) {
            const ext = path.extname(item).toLowerCase();
            const allowedExtensions = [
              ".pdf",
              ".doc",
              ".docx",
              ".xls",
              ".xlsx",
              ".ppt",
              ".pptx",
              ".txt",
            ];

            if (allowedExtensions.includes(ext)) {
              documentIndex.push({
                id: uuidv4(),
                name: item,
                path: fullPath,
                folder: relativePath,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                extension: ext,
                isArchived:
                  item.toLowerCase().includes("archive") ||
                  relativePath.toLowerCase().includes("archive"),
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning directory ${dirPath}:`, error);
      }
    }

    await scanDirectory(DOCUMENTS_DIR);
    await saveDocumentIndex();

    if (typeof app !== "undefined" && app.locals) {
      app.locals.documentIndex = documentIndex;
      console.log(
        `✅ Updated app.locals.documentIndex with ${documentIndex.length} documents`
      );
    }

    console.log(
      `Document index built successfully. ${documentIndex.length} documents indexed.`
    );
  } catch (error) {
    console.error("Error building document index:", error);
  }
}

async function buildFolderStructure() {
  try {
    console.log("Building folder structure...");
    folderStructure = [];

    async function scanFolders(dirPath, relativePath = "", level = 0) {
      try {
        const items = fsSync.readdirSync(dirPath);
        const folders = [];
        const documents = [];

        for (const item of items) {
          const fullPath = path.join(dirPath, item);
          const stats = fsSync.statSync(fullPath);

          if (stats.isDirectory()) {
            const newRelativePath = relativePath
              ? path.join(relativePath, item)
              : item;
            folders.push({
              name: item,
              path: newRelativePath,
              level: level + 1,
            });
            await scanFolders(fullPath, newRelativePath, level + 1);
          } else if (stats.isFile()) {
            const ext = path.extname(item).toLowerCase();
            const allowedExtensions = [
              ".pdf",
              ".doc",
              ".docx",
              ".xls",
              ".xlsx",
              ".ppt",
              ".pptx",
              ".txt",
            ];

            if (allowedExtensions.includes(ext)) {
              documents.push({
                name: item,
                size: stats.size,
                modified: stats.mtime,
              });
            }
          }
        }

        if (relativePath) {
          folderStructure.push({
            name: path.basename(relativePath),
            path: relativePath,
            level: level,
            documentCount: documents.length,
            documents: documents,
            folders: folders.map((f) => f.name),
          });
        }
      } catch (error) {
        console.error(`Error scanning folder ${dirPath}:`, error);
      }
    }

    await scanFolders(DOCUMENTS_DIR);
    await saveFolderStructure();

    console.log(
      `Folder structure built successfully. ${folderStructure.length} folders indexed.`
    );
  } catch (error) {
    console.error("Error building folder structure:", error);
  }
}

// ========================================
// FILE WATCHING
// ========================================

function initializeFileWatcher() {
  try {
    // Check if it's a network drive or has too many files
    const stats = fsSync.statSync(DOCUMENTS_DIR);
    const sampleDir = fsSync.readdirSync(DOCUMENTS_DIR);

    if (
      sampleDir.length > 1000 ||
      DOCUMENTS_DIR.startsWith("\\\\") ||
      DOCUMENTS_DIR.includes(":")
    ) {
      console.log(
        "File watching disabled for network drives or drives with many files."
      );
      console.log(
        'You will need to use the "Rebuild Index" button when files change.'
      );
      return;
    }

    fileWatcher = chokidar.watch(DOCUMENTS_DIR, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      depth: 10,
    });

    fileWatcher
      .on("add", async (filePath) => {
        console.log(`File added: ${filePath}`);
        await buildDocumentIndex();
      })
      .on("unlink", async (filePath) => {
        console.log(`File removed: ${filePath}`);
        await buildDocumentIndex();
      })
      .on("addDir", async (dirPath) => {
        console.log(`Directory added: ${dirPath}`);
        await buildFolderStructure();
      })
      .on("unlinkDir", async (dirPath) => {
        console.log(`Directory removed: ${dirPath}`);
        await buildFolderStructure();
      });

    console.log("File watcher initialized successfully.");
  } catch (error) {
    console.error("Error initializing file watcher:", error);
    console.log(
      'File watching disabled. Use "Rebuild Index" button when files change.'
    );
  }
}

// ========================================
// INITIALIZATION
// ========================================

async function initializeApplication() {
  try {
    await loadDocumentIndex();
    await loadFolderStructure();

    if (documentIndex.length === 0) {
      console.log("No existing index found. Building initial index...");
      await buildDocumentIndex();
    }

    if (folderStructure.length === 0) {
      console.log(
        "No existing folder structure found. Building initial structure..."
      );
      await buildFolderStructure();
    }

    initializeFileWatcher();
  } catch (error) {
    console.error("Error during initialization:", error);
  }
}

// ========================================
// START SERVER
// ========================================
// Add this block right before app.listen() in your app.js:
// ========================================
// APP LOCALS SETUP - Replace the existing app.locals section in your app.js
// (Around line 1650, before app.listen())
// ========================================

// Set up app.locals for route modules to access shared functions and data
app.locals.documentIndex = documentIndex;
app.locals.loadLearningPatterns = loadLearningPatterns;
app.locals.saveLearningPatterns = saveLearningPatterns;
app.locals.learnFromManualLink = learnFromManualLink;
app.locals.recordNegativeLearningPattern = recordNegativeLearningPattern;
app.locals.findDocumentByName = findDocumentByName;
app.locals.findDocumentByNameWithLearning = findDocumentByNameWithLearning;
app.locals.loadIMSIndex = loadIMSIndex;
app.locals.saveIMSIndex = saveIMSIndex;
app.locals.loadMandatoryRecords = loadMandatoryRecords;
app.locals.saveRevisionLog = saveRevisionLog;
app.locals.buildFileIndex = buildDocumentIndex;

// ADD THESE MISSING HELPER FUNCTIONS:
app.locals.logDocumentAccess = logDocumentAccess;
app.locals.formatFileSize = formatFileSize;
app.locals.canPreviewFile = canPreviewFile;
app.locals.getRevisionHistory = getRevisionHistory;
app.locals.isArchivedDocument = isArchivedDocument;
app.locals.isContractorDocument = isContractorDocument;

console.log("App.locals configured with all helper functions");

app.listen(port, async () => {
  console.log(`IMS Document Management System running on port ${port}`);
  console.log(`Visit http://localhost:${port} to access the application`);

  await initializeApplication();
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  if (fileWatcher) {
    await fileWatcher.close();
  }
  process.exit(0);
});

// ========================================
// SAFETYSYNC PRO DIAGNOSTIC SCRIPT
// Add this to the END of your app.js to diagnose issues
// ========================================

// Diagnostic function to check app health
function runDiagnostics() {
  console.log("\n" + "=".repeat(50));
  console.log("🔍 SAFETYSYNC PRO DIAGNOSTICS");
  console.log("=".repeat(50));

  const diagnostics = {
    timestamp: new Date().toISOString(),
    documentIndexSize: documentIndex ? documentIndex.length : 0,
    folderStructureSize: folderStructure ? folderStructure.length : 0,
    issues: [],
    recommendations: [],
  };

  // 1. Check document index
  console.log("📊 Document Index Status:");
  console.log(`   - Total documents: ${diagnostics.documentIndexSize}`);
  if (diagnostics.documentIndexSize === 0) {
    diagnostics.issues.push("Document index is empty");
    diagnostics.recommendations.push("Run 'Rebuild Index' button");
  }

  // 2. Check learning patterns file
  console.log("🧠 Learning System Status:");
  try {
    const patterns = loadLearningPatterns();
    const patternsCount = Object.keys(patterns.documentPatterns || {}).length;
    const correctionsCount = patterns.manualCorrections
      ? patterns.manualCorrections.length
      : 0;
    const keywordsCount = Object.keys(patterns.keywordWeights || {}).length;

    console.log(`   - Learned patterns: ${patternsCount}`);
    console.log(`   - Manual corrections: ${correctionsCount}`);
    console.log(`   - Keyword weights: ${keywordsCount}`);

    if (patternsCount === 0) {
      diagnostics.issues.push("No learning patterns found");
      diagnostics.recommendations.push(
        "Manually link a few documents to train the system"
      );
    }

    diagnostics.learningStats = {
      patterns: patternsCount,
      corrections: correctionsCount,
      keywords: keywordsCount,
    };
  } catch (error) {
    console.log(`   - ERROR: ${error.message}`);
    diagnostics.issues.push("Learning system error: " + error.message);
  }

  // 3. Check for duplicate functions
  console.log("🔧 Function Definitions Check:");
  const functionNames = [
    "loadLearningPatterns",
    "saveLearningPatterns",
    "learnFromManualLink",
    "findDocumentByNameWithLearning",
    "recordNegativeLearningPattern",
  ];

  functionNames.forEach((funcName) => {
    if (typeof eval(funcName) === "function") {
      console.log(`   ✅ ${funcName}: defined`);
    } else {
      console.log(`   ❌ ${funcName}: missing`);
      diagnostics.issues.push(`Function ${funcName} is not defined`);
    }
  });

  // 4. Check file paths
  console.log("📁 File System Status:");
  console.log(`   - Learning data path: ${LEARNING_DATA_PATH}`);
  console.log(
    `   - Learning file exists: ${fsSync.existsSync(LEARNING_DATA_PATH)}`
  );
  console.log(`   - IMS index exists: ${fsSync.existsSync(IMS_INDEX_FILE)}`);
  console.log(`   - Document root: ${DOCUMENTS_DIR}`);
  console.log(`   - Document root exists: ${fsSync.existsSync(DOCUMENTS_DIR)}`);

  // 5. Check IMS data
  console.log("📋 IMS Index Status:");
  try {
    const imsIndex = loadIMSIndex();
    const categories = Object.keys(imsIndex).length;
    let totalChildren = 0;
    let linkedChildren = 0;

    Object.values(imsIndex).forEach((category) => {
      if (category.children) {
        totalChildren += category.children.length;
      }
      if (category.enrichedChildren) {
        linkedChildren += category.enrichedChildren.filter(
          (c) => c.found || c.document
        ).length;
      }
    });

    console.log(`   - Categories: ${categories}`);
    console.log(`   - Total child documents: ${totalChildren}`);
    console.log(`   - Linked documents: ${linkedChildren}`);
    console.log(
      `   - Link rate: ${
        totalChildren > 0
          ? Math.round((linkedChildren / totalChildren) * 100)
          : 0
      }%`
    );

    diagnostics.imsStats = {
      categories,
      totalChildren,
      linkedChildren,
      linkRate:
        totalChildren > 0
          ? Math.round((linkedChildren / totalChildren) * 100)
          : 0,
    };
  } catch (error) {
    console.log(`   - ERROR: ${error.message}`);
    diagnostics.issues.push("IMS index error: " + error.message);
  }

  // 6. Test enhanced learning function
  console.log("🎯 Enhanced Learning Test:");
  try {
    // Test with a common document name
    const testResult = findDocumentByNameWithLearning("safety policy", false);
    console.log(
      `   - Test search result: ${testResult ? testResult.name : "none found"}`
    );

    if (!testResult) {
      diagnostics.recommendations.push(
        "Try manual linking to improve auto-detection"
      );
    }
  } catch (error) {
    console.log(`   - ERROR: ${error.message}`);
    diagnostics.issues.push(
      "Enhanced learning function error: " + error.message
    );
    diagnostics.recommendations.push(
      "Check for duplicate function definitions in app.js"
    );
  }

  // 7. Summary
  console.log("\n📋 DIAGNOSTIC SUMMARY:");
  if (diagnostics.issues.length === 0) {
    console.log("✅ No critical issues found!");
  } else {
    console.log(`❌ Found ${diagnostics.issues.length} issue(s):`);
    diagnostics.issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
  }

  if (diagnostics.recommendations.length > 0) {
    console.log("\n💡 RECOMMENDATIONS:");
    diagnostics.recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec}`);
    });
  }

  console.log("\n" + "=".repeat(50));
  console.log("Diagnostics complete. Check the output above for issues.");
  console.log("=".repeat(50) + "\n");

  return diagnostics;
}

// Test a specific document search with detailed logging
function testEnhancedSearch(searchTerm = "safety policy") {
  console.log(`\n🔍 TESTING ENHANCED SEARCH FOR: "${searchTerm}"`);
  console.log("-".repeat(40));

  try {
    const result = findDocumentByNameWithLearning(searchTerm, false);

    if (result) {
      console.log(`✅ FOUND: ${result.name}`);
      console.log(`   Path: ${result.path}`);
      console.log(`   Archived: ${result.isArchived || false}`);
    } else {
      console.log(`❌ NO MATCH FOUND for "${searchTerm}"`);
      console.log("Try these troubleshooting steps:");
      console.log("1. Check if documents exist in the index");
      console.log("2. Try a manual link to teach the system");
      console.log("3. Check for duplicate function definitions");
    }
  } catch (error) {
    console.log(`❌ ERROR in enhanced search: ${error.message}`);
    console.log(
      "This suggests duplicate function definitions or syntax errors"
    );
  }

  console.log("-".repeat(40));
}

// Quick check for duplicate functions
function checkForDuplicates() {
  console.log("\n🔍 CHECKING FOR DUPLICATE FUNCTION DEFINITIONS");
  console.log("-".repeat(50));

  // This is a simple check - in reality, you need to manually inspect app.js
  const appjsContent = require("fs").readFileSync(__filename, "utf8");

  const criticalFunctions = [
    "function loadLearningPatterns",
    "function saveLearningPatterns",
    "function learnFromManualLink",
    "function findDocumentByNameWithLearning",
    "function recordNegativeLearningPattern",
  ];

  criticalFunctions.forEach((funcDef) => {
    const matches = (appjsContent.match(new RegExp(funcDef, "g")) || []).length;
    console.log(`${funcDef}: found ${matches} time(s)`);

    if (matches > 1) {
      console.log(
        `   ⚠️ DUPLICATE DETECTED! This function is defined ${matches} times`
      );
      console.log(
        `   ➡️ Search your app.js for "${funcDef}" and remove duplicates`
      );
    } else if (matches === 1) {
      console.log(`   ✅ OK - single definition`);
    } else {
      console.log(`   ❌ NOT FOUND - function may be missing`);
    }
  });

  console.log("-".repeat(50));
}

// Auto-run diagnostics on startup (with delay to ensure everything is loaded)
setTimeout(() => {
  console.log("🚀 SafetySync Pro starting diagnostics...");
  runDiagnostics();
  testEnhancedSearch("safety policy");
  checkForDuplicates();
}, 5000); // Wait 5 seconds after startup

// Make diagnostic functions available globally for manual testing
global.runDiagnostics = runDiagnostics;
global.testEnhancedSearch = testEnhancedSearch;
global.checkForDuplicates = checkForDuplicates;

console.log("🔧 Diagnostic functions loaded. You can run:");
console.log("   - runDiagnostics() - Full system check");
console.log("   - testEnhancedSearch('document name') - Test search");
console.log("   - checkForDuplicates() - Check for duplicate functions");
