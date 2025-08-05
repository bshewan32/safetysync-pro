const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const fs = require("fs");
const chokidar = require("chokidar");
const { v4: uuidv4 } = require("uuid");

const app = express();
const port = 3000;

// ========================================
// CONFIGURATION AND SETUP
// ========================================

const APPLICATION_DIR = process.cwd();
const VIEWS_DIR = path.join(APPLICATION_DIR, "views");
const DOCUMENTS_DIR = process.env.DOCUMENTS_DIR || "I:/IMS";

console.log("Application directory:", APPLICATION_DIR);
console.log("Views directory:", VIEWS_DIR);
console.log("Documents directory:", DOCUMENTS_DIR);

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
    fs.mkdirSync(uploadPath, { recursive: true });
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
    if (fs.existsSync(INDEX_FILE)) {
      const data = await fs.readFile(INDEX_FILE, "utf8");
      documentIndex = JSON.parse(data);
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
    await fs.writeFile(INDEX_FILE, JSON.stringify(documentIndex, null, 2));
    console.log(`Document index saved. ${documentIndex.length} documents.`);
  } catch (error) {
    console.error("Error saving document index:", error);
  }
}

async function loadFolderStructure() {
  try {
    if (fs.existsSync(FOLDERS_FILE)) {
      const data = await fs.readFile(FOLDERS_FILE, "utf8");
      folderStructure = JSON.parse(data);
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
    await fs.writeFile(FOLDERS_FILE, JSON.stringify(folderStructure, null, 2));
    console.log("Folder structure saved.");
  } catch (error) {
    console.error("Error saving folder structure:", error);
  }
}

const LEARNING_DATA_PATH = path.join(__dirname, "learning-patterns.json");
const REVISION_LOG_PATH = path.join(__dirname, "data", "revision-log.json");

// ========================================
// LEARNING SYSTEM FUNCTIONS
// ========================================

function loadLearningPatterns() {
  try {
    if (fs.existsSync(LEARNING_DATA_PATH)) {
      return JSON.parse(fs.readFileSync(LEARNING_DATA_PATH, "utf8"));
    }
  } catch (err) {
    console.error("Error loading learning patterns:", err);
  }

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
    fs.writeFileSync(LEARNING_DATA_PATH, JSON.stringify(patterns, null, 2));
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
  const patterns = loadLearningPatterns();
  const searchTerms = originalSearch.toLowerCase().split(/[\s\-_]+/);
  const actualName = actualDocument.name.toLowerCase();
  const actualPath = actualDocument.path.toLowerCase();

  console.log(
    `Learning from correction: "${originalSearch}" -> "${actualDocument.name}"`
  );

  // Document name patterns
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
  });

  // Extract successful keywords
  const successfulKeywords = [];
  searchTerms.forEach((term) => {
    if (
      term.length > 2 &&
      (actualName.includes(term) || actualPath.includes(term))
    ) {
      successfulKeywords.push(term);
    }
  });

  // Update keyword weights
  successfulKeywords.forEach((keyword) => {
    if (!patterns.keywordWeights[keyword]) {
      patterns.keywordWeights[keyword] = { score: 0, uses: 0 };
    }
    patterns.keywordWeights[keyword].score += 1;
    patterns.keywordWeights[keyword].uses += 1;
  });

  // Store manual correction
  patterns.manualCorrections.push({
    searchTerm: originalSearch,
    foundDocument: actualDocument.name,
    category: category,
    recordType: recordType,
    successfulKeywords: successfulKeywords,
    timestamp: new Date().toISOString(),
  });

  if (patterns.manualCorrections.length > 1000) {
    patterns.manualCorrections = patterns.manualCorrections.slice(-1000);
  }

  saveLearningPatterns(patterns);
}

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
    };

    patterns.negativePatterns.push(negativePattern);

    if (patterns.negativePatterns.length > 500) {
      patterns.negativePatterns = patterns.negativePatterns.slice(-500);
    }

    saveLearningPatterns(patterns);
  } catch (error) {
    console.error("Error recording negative learning pattern:", error);
  }
}
// ========================================
// DOCUMENT DETECTION FUNCTIONS
// ========================================

function isArchivedDocument(filePath) {
  const pathParts = filePath.toLowerCase().split(/[\\\/]/);
  const archiveKeywords = [
    "archive",
    "archives",
    "archived",
    "old",
    "backup",
    "previous",
    "2020",
    "2021",
    "2022",
    "2023",
    "historical",
    "legacy",
    "superseded",
    "obsolete",
    "replaced",
  ];

  return pathParts.some((part) => {
    return (
      archiveKeywords.some((keyword) => part.includes(keyword)) ||
      (part.match(/^\d{4}$/) &&
        parseInt(part) < new Date().getFullYear() - 1) ||
      part.match(/\d{2}-\d{2}/) ||
      part.match(/\d{4}-\d{2}/)
    );
  });
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
  ];

  return contractorKeywords.some(
    (keyword) =>
      pathLower.includes(keyword) ||
      pathLower.includes(`\\${keyword}\\`) ||
      pathLower.includes(`/${keyword}/`)
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

function findDocumentByNameWithLearning(docName, includeArchived = false) {
  const patterns = loadLearningPatterns();

  // Check negative patterns first
  const negativeMatches = (patterns.negativePatterns || []).filter(
    (negative) => negative.searchTerm === docName.toLowerCase()
  );
  const avoidDocumentIds = negativeMatches.map(
    (negative) => negative.avoidDocumentId
  );

  // Try exact pattern match from learning
  const exactMatch = patterns.documentPatterns[docName.toLowerCase()];
  if (exactMatch && exactMatch.length > 0) {
    const bestMatch = exactMatch.sort((a, b) => b.confidence - a.confidence)[0];
    const foundDoc = documentIndex.find(
      (doc) => doc.id === bestMatch.documentId
    );

    if (foundDoc && (includeArchived || !foundDoc.isArchived)) {
      console.log(`Found document using learned pattern: ${foundDoc.name}`);
      return foundDoc;
    }
  }

  // Enhanced keyword matching using learned weights
  const searchTerms = docName.toLowerCase().split(/[\s\-_]+/);
  const candidates = documentIndex.filter((doc) => {
    if (!includeArchived && doc.isArchived) return false;
    if (isArchivedDocument(doc.path) || isContractorDocument(doc.path))
      return false;
    if (avoidDocumentIds.includes(doc.id)) return false;
    return true;
  });

  const scoredCandidates = candidates.map((doc) => {
    let score = 0;
    const docText = (
      doc.name +
      " " +
      doc.folder +
      " " +
      doc.relativePath
    ).toLowerCase();

    searchTerms.forEach((term) => {
      if (term.length > 2 && docText.includes(term)) {
        const weight = patterns.keywordWeights[term];
        score += weight ? weight.score : 1;
      }
    });

    if (doc.name.toLowerCase() === docName.toLowerCase()) score += 100;
    if (doc.name.toLowerCase().includes(docName.toLowerCase())) score += 50;
    if (isContractorDocument(doc.path)) score -= 25;
    if (isArchivedDocument(doc.path) || doc.isArchived) score -= 100;

    return { doc, score };
  });

  const bestCandidate = scoredCandidates.sort((a, b) => b.score - a.score)[0];
  if (bestCandidate && bestCandidate.score > 0) {
    return bestCandidate.doc;
  }

  return findDocumentByName(docName, includeArchived);
}

// ========================================
// IMS FUNCTIONS
// ========================================

function loadIMSIndex() {
  try {
    if (fs.existsSync(IMS_INDEX_FILE)) {
      return JSON.parse(fs.readFileSync(IMS_INDEX_FILE, "utf8"));
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
    fs.writeFileSync(IMS_INDEX_FILE, JSON.stringify(imsIndex, null, 2));
    return true;
  } catch (err) {
    console.error("Error saving IMS index:", err);
    return false;
  }
}

function loadMandatoryRecords() {
  try {
    if (fs.existsSync(MANDATORY_RECORDS_FILE)) {
      return JSON.parse(fs.readFileSync(MANDATORY_RECORDS_FILE, "utf8"));
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
    fs.ensureDirSync(path.dirname(REVISION_LOG_PATH));
    let revisionLog = {};

    if (fs.existsSync(REVISION_LOG_PATH)) {
      revisionLog = JSON.parse(fs.readFileSync(REVISION_LOG_PATH, "utf8"));
    }

    if (!revisionLog[documentId]) {
      revisionLog[documentId] = [];
    }

    revisionLog[documentId].push(revisionData);
    fs.writeFileSync(REVISION_LOG_PATH, JSON.stringify(revisionLog, null, 2));
    console.log("Revision log saved for document:", documentId);
  } catch (error) {
    console.error("Error saving revision log:", error);
  }
}

// ========================================
// IMPORT ROUTE MODULES
// ========================================

// Import route modules - check if they exist first
let imsRoutes, isnRoutes;

try {
  imsRoutes = require("./routes/ims-routes");
  app.use("/ims", imsRoutes);
  console.log("IMS routes loaded successfully");
} catch (error) {
  console.log("IMS routes not found, loading basic routes");
}

try {
  isnRoutes = require("./routes/isn-routes");
  app.use("/isn", isnRoutes);
  console.log("ISN routes loaded successfully");
} catch (error) {
  console.log("ISN routes not found, loading basic routes");
}

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
      if (fs.existsSync(IMS_INDEX_FILE)) {
        const imsData = JSON.parse(await fs.readFile(IMS_INDEX_FILE, "utf8"));
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
      if (fs.existsSync(ISN_INDEX_FILE)) {
        const isnData = JSON.parse(await fs.readFile(ISN_INDEX_FILE, "utf8"));
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

// IMS Index route - Fixed to match existing template expectations
app.get("/ims-index", (req, res) => {
  try {
    // Load the IMS document index
    const imsIndexPath = path.join(__dirname, "ims-document-index.json");
    const imsData = JSON.parse(fs.readFileSync(imsIndexPath, "utf8"));

    // Load mandatory records
    const mandatoryRecordsPath = path.join(
      __dirname,
      "mandatory-records-index.json"
    );
    let mandatoryRecords = [];
    try {
      mandatoryRecords = JSON.parse(
        fs.readFileSync(mandatoryRecordsPath, "utf8")
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

    res.render("ims-index", {
      categories: categories,
      mandatoryRecords: mandatoryRecords,
      stats: stats,
      title: "IMS Document Index",
    });
  } catch (error) {
    console.error("Error loading IMS index:", error);
    res.render("ims-index", {
      categories: [],
      mandatoryRecords: [],
      stats: {
        totalCategories: 0,
        totalDocuments: 0,
        linkedDocuments: 0,
        completionRate: 0,
      },
      title: "IMS Document Index",
      error: "Could not load IMS data",
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
      isnData = JSON.parse(fs.readFileSync(isnIndexPath, "utf8"));
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

// ========================================
// API ROUTES
// ========================================

// Get available documents for linking
app.get("/api/available-documents", async (req, res) => {
  try {
    const searchTerm = req.query.search || "";
    let filteredDocuments = documentIndex;

    if (searchTerm) {
      filteredDocuments = documentIndex.filter(
        (doc) =>
          doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (doc.folder &&
            doc.folder.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    res.json(filteredDocuments);
  } catch (error) {
    console.error("Error getting available documents:", error);
    res.status(500).json({ error: "Failed to get available documents" });
  }
});

// Mandatory records API - Fixed to use correct file
app.get("/api/mandatory-records", async (req, res) => {
  try {
    let mandatoryRecords = {};

    if (fs.existsSync(MANDATORY_RECORDS_FILE)) {
      const data = await fs.readFile(MANDATORY_RECORDS_FILE, "utf8");
      mandatoryRecords = JSON.parse(data);
    }

    res.json({
      success: true,
      mandatoryRecords: mandatoryRecords,
    });
  } catch (error) {
    console.error("Error loading mandatory records:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load mandatory records",
    });
  }
});

// ISN Mandatory records API
app.get("/api/isn-mandatory-records", async (req, res) => {
  try {
    let mandatoryRecords = {};

    if (fs.existsSync(ISN_MANDATORY_RECORDS_FILE)) {
      const data = await fs.readFile(ISN_MANDATORY_RECORDS_FILE, "utf8");
      mandatoryRecords = JSON.parse(data);
    }

    res.json({
      success: true,
      mandatoryRecords: mandatoryRecords,
    });
  } catch (error) {
    console.error("Error loading ISN mandatory records:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load ISN mandatory records",
    });
  }
});

// Auto-link documents API
app.post("/api/auto-link-documents", (req, res) => {
  try {
    console.log("Starting IMS auto-link process...");

    // Load current IMS index
    const imsIndexPath = path.join(__dirname, "ims-document-index.json");
    const documentIndexPath = path.join(__dirname, "document-index.json");

    if (!fs.existsSync(imsIndexPath)) {
      return res.status(404).json({ error: "IMS document index not found" });
    }

    if (!fs.existsSync(documentIndexPath)) {
      return res.status(404).json({ error: "Document index not found" });
    }

    const imsIndex = JSON.parse(fs.readFileSync(imsIndexPath, "utf8"));
    const documentIndex = JSON.parse(
      fs.readFileSync(documentIndexPath, "utf8")
    );

    let linkedCount = 0;
    let totalProcessed = 0;

    // Process each category
    Object.keys(imsIndex).forEach((categoryName) => {
      const category = imsIndex[categoryName];
      if (category.children && Array.isArray(category.children)) {
        category.children.forEach((childName) => {
          totalProcessed++;

          // Try to find matching document
          const matchingDoc = documentIndex.find((doc) => {
            const docName = doc.name.toLowerCase();
            const childNameLower = childName.toLowerCase();

            // Try various matching strategies
            return (
              docName.includes(childNameLower) ||
              childNameLower.includes(docName.replace(/\.[^/.]+$/, "")) ||
              docName.replace(/\.[^/.]+$/, "").includes(childNameLower)
            );
          });

          if (matchingDoc) {
            // Add to enriched children if not already there
            if (!category.enrichedChildren) {
              category.enrichedChildren = [];
            }

            const existingEnriched = category.enrichedChildren.find(
              (ec) => ec.name === childName
            );
            if (!existingEnriched) {
              category.enrichedChildren.push({
                name: childName,
                document: {
                  id: matchingDoc.id,
                  name: matchingDoc.name,
                  path: matchingDoc.path,
                  isArchived: matchingDoc.isArchived || false,
                },
                found: true,
                linkedAt: new Date().toISOString(),
              });
              linkedCount++;
            } else if (!existingEnriched.found) {
              existingEnriched.found = true;
              existingEnriched.document = {
                id: matchingDoc.id,
                name: matchingDoc.name,
                path: matchingDoc.path,
                isArchived: matchingDoc.isArchived || false,
              };
              existingEnriched.linkedAt = new Date().toISOString();
              linkedCount++;
            }
          }
        });
      }
    });

    // Save updated index
    fs.writeFileSync(imsIndexPath, JSON.stringify(imsIndex, null, 2));

    console.log(
      `IMS Auto-link completed: ${linkedCount} documents linked out of ${totalProcessed} processed`
    );

    res.json({
      success: true,
      message: `Auto-linked ${linkedCount} documents`,
      linkedCount: linkedCount,
      totalProcessed: totalProcessed,
    });
  } catch (error) {
    console.error("Error in IMS auto-link:", error);
    res.status(500).json({
      error: "Auto-link failed: " + error.message,
      success: false,
    });
  }
});
app.post("/api/auto-link-isn-documents", (req, res) => {
  try {
    console.log("Starting ISN auto-link process...");

    const isnIndexPath = path.join(__dirname, "isn-index.json");
    const documentIndexPath = path.join(__dirname, "document-index.json");

    if (!fs.existsSync(isnIndexPath)) {
      return res.status(404).json({ error: "ISN document index not found" });
    }

    if (!fs.existsSync(documentIndexPath)) {
      return res.status(404).json({ error: "Document index not found" });
    }

    const isnIndex = JSON.parse(fs.readFileSync(isnIndexPath, "utf8"));
    const documentIndex = JSON.parse(
      fs.readFileSync(documentIndexPath, "utf8")
    );

    let linkedCount = 0;
    let totalProcessed = 0;

    // Process each category (same logic as IMS)
    Object.keys(isnIndex).forEach((categoryName) => {
      const category = isnIndex[categoryName];
      if (category.children && Array.isArray(category.children)) {
        category.children.forEach((childName) => {
          totalProcessed++;

          const matchingDoc = documentIndex.find((doc) => {
            const docName = doc.name.toLowerCase();
            const childNameLower = childName.toLowerCase();

            return (
              docName.includes(childNameLower) ||
              childNameLower.includes(docName.replace(/\.[^/.]+$/, "")) ||
              docName.replace(/\.[^/.]+$/, "").includes(childNameLower)
            );
          });

          if (matchingDoc) {
            if (!category.enrichedChildren) {
              category.enrichedChildren = [];
            }

            const existingEnriched = category.enrichedChildren.find(
              (ec) => ec.name === childName
            );
            if (!existingEnriched) {
              category.enrichedChildren.push({
                name: childName,
                document: {
                  id: matchingDoc.id,
                  name: matchingDoc.name,
                  path: matchingDoc.path,
                  isArchived: matchingDoc.isArchived || false,
                },
                found: true,
                linkedAt: new Date().toISOString(),
              });
              linkedCount++;
            } else if (!existingEnriched.found) {
              existingEnriched.found = true;
              existingEnriched.document = {
                id: matchingDoc.id,
                name: matchingDoc.name,
                path: matchingDoc.path,
                isArchived: matchingDoc.isArchived || false,
              };
              existingEnriched.linkedAt = new Date().toISOString();
              linkedCount++;
            }
          }
        });
      }
    });

    // Save updated ISN index
    fs.writeFileSync(isnIndexPath, JSON.stringify(isnIndex, null, 2));

    console.log(
      `ISN Auto-link completed: ${linkedCount} documents linked out of ${totalProcessed} processed`
    );

    res.json({
      success: true,
      message: `Auto-linked ${linkedCount} ISN documents`,
      linkedCount: linkedCount,
      totalProcessed: totalProcessed,
    });
  } catch (error) {
    console.error("Error in ISN auto-link:", error);
    res.status(500).json({
      error: "ISN auto-link failed: " + error.message,
      success: false,
    });
  }
});

app.get("/api/ims-statistics", (req, res) => {
  try {
    const imsIndexPath = path.join(__dirname, "ims-document-index.json");

    if (!fs.existsSync(imsIndexPath)) {
      return res.json({
        totalCategories: 0,
        totalDocuments: 0,
        linkedDocuments: 0,
        completionRate: 0,
      });
    }

    const imsIndex = JSON.parse(fs.readFileSync(imsIndexPath, "utf8"));

    const stats = {
      totalCategories: Object.keys(imsIndex).length,
      totalDocuments: 0,
      linkedDocuments: 0,
      completionRate: 0,
    };

    Object.values(imsIndex).forEach((category) => {
      if (category.children) {
        stats.totalDocuments += category.children.length;
      }
      if (category.enrichedChildren) {
        stats.linkedDocuments += category.enrichedChildren.filter(
          (ec) => ec.found
        ).length;
      }
    });

    stats.completionRate =
      stats.totalDocuments > 0
        ? Math.round((stats.linkedDocuments / stats.totalDocuments) * 100)
        : 0;

    res.json(stats);
  } catch (error) {
    console.error("Error getting IMS statistics:", error);
    res.status(500).json({ error: "Could not get statistics" });
  }
});

app.get("/api/isn-statistics", (req, res) => {
  try {
    const isnIndexPath = path.join(__dirname, "isn-index.json");

    if (!fs.existsSync(isnIndexPath)) {
      return res.json({
        totalCategories: 0,
        totalDocuments: 0,
        linkedDocuments: 0,
        completionRate: 0,
      });
    }

    const isnIndex = JSON.parse(fs.readFileSync(isnIndexPath, "utf8"));

    const stats = {
      totalCategories: Object.keys(isnIndex).length,
      totalDocuments: 0,
      linkedDocuments: 0,
      completionRate: 0,
    };

    Object.values(isnIndex).forEach((category) => {
      if (category.children) {
        stats.totalDocuments += category.children.length;
      }
      if (category.enrichedChildren) {
        stats.linkedDocuments += category.enrichedChildren.filter(
          (ec) => ec.found
        ).length;
      }
    });

    stats.completionRate =
      stats.totalDocuments > 0
        ? Math.round((stats.linkedDocuments / stats.totalDocuments) * 100)
        : 0;

    res.json(stats);
  } catch (error) {
    console.error("Error getting ISN statistics:", error);
    res.status(500).json({ error: "Could not get statistics" });
  }
});

app.get("/api/export-ims-index", (req, res) => {
  try {
    const imsIndexPath = path.join(__dirname, "ims-document-index.json");

    if (!fs.existsSync(imsIndexPath)) {
      return res.status(404).json({ error: "IMS index not found" });
    }

    const imsIndex = JSON.parse(fs.readFileSync(imsIndexPath, "utf8"));

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ims-index-${
        new Date().toISOString().split("T")[0]
      }.json"`
    );
    res.send(JSON.stringify(imsIndex, null, 2));
  } catch (error) {
    console.error("Error exporting IMS index:", error);
    res.status(500).json({ error: "Export failed" });
  }
});

app.get("/api/export-isn-index", (req, res) => {
  try {
    const isnIndexPath = path.join(__dirname, "isn-index.json");

    if (!fs.existsSync(isnIndexPath)) {
      return res.status(404).json({ error: "ISN index not found" });
    }

    const isnIndex = JSON.parse(fs.readFileSync(isnIndexPath, "utf8"));

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="isn-index-${
        new Date().toISOString().split("T")[0]
      }.json"`
    );
    res.send(JSON.stringify(isnIndex, null, 2));
  } catch (error) {
    console.error("Error exporting ISN index:", error);
    res.status(500).json({ error: "Export failed" });
  }
});
// Rebuild index API
app.post("/api/rebuild-index", async (req, res) => {
  try {
    console.log("Rebuilding document index...");
    await buildDocumentIndex();
    await buildFolderStructure();

    res.json({
      success: true,
      documentCount: documentIndex.length,
      folderCount: folderStructure.length,
    });
  } catch (error) {
    console.error("Error rebuilding index:", error);
    res.status(500).json({
      success: false,
      message: "Failed to rebuild index",
    });
  }
});

app.post("/api/link-ims-document", (req, res) => {
  try {
    const { category, document, id } = req.body;

    const imsIndexPath = path.join(__dirname, "ims-document-index.json");
    const documentIndexPath = path.join(__dirname, "document-index.json");

    const imsIndex = JSON.parse(fs.readFileSync(imsIndexPath, "utf8"));
    const documentIndex = JSON.parse(
      fs.readFileSync(documentIndexPath, "utf8")
    );

    const targetCategory = imsIndex[category];
    const targetDoc = documentIndex.find((doc) => doc.id === id);

    if (!targetCategory || !targetDoc) {
      return res.status(404).json({ error: "Category or document not found" });
    }

    if (!targetCategory.enrichedChildren) {
      targetCategory.enrichedChildren = [];
    }

    const existingEnriched = targetCategory.enrichedChildren.find(
      (ec) => ec.name === document
    );
    if (existingEnriched) {
      existingEnriched.found = true;
      existingEnriched.document = {
        id: targetDoc.id,
        name: targetDoc.name,
        path: targetDoc.path,
        isArchived: targetDoc.isArchived || false,
      };
      existingEnriched.linkedAt = new Date().toISOString();
    } else {
      targetCategory.enrichedChildren.push({
        name: document,
        document: {
          id: targetDoc.id,
          name: targetDoc.name,
          path: targetDoc.path,
          isArchived: targetDoc.isArchived || false,
        },
        found: true,
        linkedAt: new Date().toISOString(),
      });
    }

    fs.writeFileSync(imsIndexPath, JSON.stringify(imsIndex, null, 2));

    res.json({ success: true, message: "Document linked successfully" });
  } catch (error) {
    console.error("Error linking IMS document:", error);
    res.status(500).json({ error: "Link failed: " + error.message });
  }
});

app.post("/api/link-isn-document", (req, res) => {
  try {
    const { category, document, id } = req.body;

    const isnIndexPath = path.join(__dirname, "isn-index.json");
    const documentIndexPath = path.join(__dirname, "document-index.json");

    const isnIndex = JSON.parse(fs.readFileSync(isnIndexPath, "utf8"));
    const documentIndex = JSON.parse(
      fs.readFileSync(documentIndexPath, "utf8")
    );

    const targetCategory = isnIndex[category];
    const targetDoc = documentIndex.find((doc) => doc.id === id);

    if (!targetCategory || !targetDoc) {
      return res.status(404).json({ error: "Category or document not found" });
    }

    if (!targetCategory.enrichedChildren) {
      targetCategory.enrichedChildren = [];
    }

    const existingEnriched = targetCategory.enrichedChildren.find(
      (ec) => ec.name === document
    );
    if (existingEnriched) {
      existingEnriched.found = true;
      existingEnriched.document = {
        id: targetDoc.id,
        name: targetDoc.name,
        path: targetDoc.path,
        isArchived: targetDoc.isArchived || false,
      };
      existingEnriched.linkedAt = new Date().toISOString();
    } else {
      targetCategory.enrichedChildren.push({
        name: document,
        document: {
          id: targetDoc.id,
          name: targetDoc.name,
          path: targetDoc.path,
          isArchived: targetDoc.isArchived || false,
        },
        found: true,
        linkedAt: new Date().toISOString(),
      });
    }

    fs.writeFileSync(isnIndexPath, JSON.stringify(isnIndex, null, 2));

    res.json({ success: true, message: "ISN document linked successfully" });
  } catch (error) {
    console.error("Error linking ISN document:", error);
    res.status(500).json({ error: "Link failed: " + error.message });
  }
});

// Unlink IMS document
app.post("/api/unlink-ims-document", (req, res) => {
  try {
    const { category, document } = req.body;

    const imsIndexPath = path.join(__dirname, "ims-document-index.json");
    const imsIndex = JSON.parse(fs.readFileSync(imsIndexPath, "utf8"));

    const targetCategory = imsIndex[category];
    if (!targetCategory || !targetCategory.enrichedChildren) {
      return res
        .status(404)
        .json({ error: "Category or enriched children not found" });
    }

    const enrichedChild = targetCategory.enrichedChildren.find(
      (ec) => ec.name === document
    );
    if (enrichedChild) {
      enrichedChild.found = false;
      enrichedChild.unlinkedAt = new Date().toISOString();
      delete enrichedChild.document;
    }

    fs.writeFileSync(imsIndexPath, JSON.stringify(imsIndex, null, 2));

    res.json({ success: true, message: "Document unlinked successfully" });
  } catch (error) {
    console.error("Error unlinking IMS document:", error);
    res.status(500).json({ error: "Unlink failed: " + error.message });
  }
});

// Unlink ISN document
app.post("/api/unlink-isn-document", (req, res) => {
  try {
    const { category, document } = req.body;

    const isnIndexPath = path.join(__dirname, "isn-index.json");
    const isnIndex = JSON.parse(fs.readFileSync(isnIndexPath, "utf8"));

    const targetCategory = isnIndex[category];
    if (!targetCategory || !targetCategory.enrichedChildren) {
      return res
        .status(404)
        .json({ error: "Category or enriched children not found" });
    }

    const enrichedChild = targetCategory.enrichedChildren.find(
      (ec) => ec.name === document
    );
    if (enrichedChild) {
      enrichedChild.found = false;
      enrichedChild.unlinkedAt = new Date().toISOString();
      delete enrichedChild.document;
    }

    fs.writeFileSync(isnIndexPath, JSON.stringify(isnIndex, null, 2));

    res.json({ success: true, message: "ISN document unlinked successfully" });
  } catch (error) {
    console.error("Error unlinking ISN document:", error);
    res.status(500).json({ error: "Unlink failed: " + error.message });
  }
});

// ========================================
// DOCUMENT INDEXING FUNCTIONS
// ========================================

async function buildDocumentIndex() {
  try {
    console.log("Building document index...");
    documentIndex = [];

    async function scanDirectory(dirPath, relativePath = "") {
      try {
        const items = await fs.readdir(dirPath);

        for (const item of items) {
          const fullPath = path.join(dirPath, item);
          const stats = await fs.stat(fullPath);

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
        const items = await fs.readdir(dirPath);
        const folders = [];
        const documents = [];

        for (const item of items) {
          const fullPath = path.join(dirPath, item);
          const stats = await fs.stat(fullPath);

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
    const stats = fs.statSync(DOCUMENTS_DIR);
    const sampleDir = fs.readdirSync(DOCUMENTS_DIR);

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
