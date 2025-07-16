// IMS Document Management System - Enhanced with Archive Detection and Revision System
const express = require("express");
const path = require("path");
const fs = require("fs-extra");
const multer = require("multer");
const moment = require("moment");
const lunr = require("lunr");
const chokidar = require("chokidar");
const { exec } = require("child_process");

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Set views directory explicitly
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  next();
});

// Configuration - CHANGE THIS TO YOUR SHARED DRIVE PATH
const DOCUMENTS_ROOT = "I:/IMS"; // Your actual path
const DB_PATH = path.join(__dirname, "data", "document_index.json");
const TEMP_PATH = path.join(__dirname, "temp");
const HIDDEN_FOLDERS_PATH = path.join(__dirname, "hidden-folders.json");
const IMS_INDEX_PATH = path.join(__dirname, "ims-document-index.json");

// Create necessary directories
fs.ensureDirSync(path.join(__dirname, "data"));
fs.ensureDirSync(TEMP_PATH);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_PATH);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// Document index and search engine
let documentIndex = [];
let searchIndex;

// ========================================
// HELPER FUNCTIONS
// ========================================

// Archive detection function
function isArchivedDocument(filePath) {
  const pathParts = filePath.toLowerCase().split(/[\\\/]/);
  return pathParts.some((part) => part.includes("archive"));
}

// Revision helper functions
function saveRevisionLog(documentId, revisionData) {
  try {
    const logPath = path.join(__dirname, "data", "revision-log.json");
    let revisionLog = {};

    if (fs.existsSync(logPath)) {
      revisionLog = fs.readJsonSync(logPath);
    }

    if (!revisionLog[documentId]) {
      revisionLog[documentId] = [];
    }

    revisionLog[documentId].push(revisionData);

    fs.writeJsonSync(logPath, revisionLog, { spaces: 2 });
    console.log("Revision log saved for document:", documentId);
  } catch (error) {
    console.error("Error saving revision log:", error);
  }
}

function getRevisionHistory(documentId) {
  try {
    const logPath = path.join(__dirname, "data", "revision-log.json");

    if (fs.existsSync(logPath)) {
      const revisionLog = fs.readJsonSync(logPath);
      return revisionLog[documentId] || [];
    }

    return [];
  } catch (error) {
    console.error("Error loading revision history:", error);
    return [];
  }
}

// HIDDEN FOLDERS FUNCTIONS
function loadHiddenFolders() {
  try {
    if (fs.existsSync(HIDDEN_FOLDERS_PATH)) {
      const hiddenFoldersConfig = fs.readJsonSync(HIDDEN_FOLDERS_PATH);
      return {
        hiddenFolders: hiddenFoldersConfig.hiddenFolders || [],
        hiddenPaths: hiddenFoldersConfig.hiddenPaths || [],
      };
    }
  } catch (err) {
    console.error("Error loading hidden folders config:", err);
  }
  return { hiddenFolders: [], hiddenPaths: [] };
}

function saveHiddenFolders(hiddenConfig) {
  try {
    fs.writeJsonSync(HIDDEN_FOLDERS_PATH, hiddenConfig);
    console.log("Hidden folders configuration saved");
    return true;
  } catch (err) {
    console.error("Error saving hidden folders config:", err);
    return false;
  }
}

function shouldHideFolder(folderPath) {
  const hiddenConfig = loadHiddenFolders();
  const folderName = path.basename(folderPath);

  if (hiddenConfig.hiddenFolders.includes(folderName)) {
    return true;
  }

  return hiddenConfig.hiddenPaths.some((hiddenPath) => {
    const normalizedFolderPath = folderPath.replace(/\\/g, "/");
    const normalizedHiddenPath = hiddenPath.replace(/\\/g, "/");
    return (
      normalizedFolderPath === normalizedHiddenPath ||
      normalizedFolderPath.startsWith(normalizedHiddenPath + "/")
    );
  });
}

// IMS INDEX FUNCTIONS
function loadIMSIndex() {
  try {
    if (fs.existsSync(IMS_INDEX_PATH)) {
      return fs.readJsonSync(IMS_INDEX_PATH);
    }
  } catch (err) {
    console.error("Error loading IMS index config:", err);
  }

  // Default IMS document structure
  return {
    "OHS Policy": {
      type: "policy",
      level: 1,
      documentId: null,
      children: [],
    },
    "Environmental Policy": {
      type: "policy",
      level: 1,
      documentId: null,
      children: [
        "Drug and Alcohol Policy",
        "Plant & Equipment Policy",
        "Fatigue Management Policy",
        "Rehabilitation Policy",
        "Discrimination, Harassment and Bullying Policy",
      ],
    },
    "Incident and Injury Management": {
      type: "category",
      level: 2,
      documentId: null,
      children: [
        "SP24 HS&E Response",
        "SP25 HS&E Incident Reporting",
        "P28 Health surveillance",
        "SP10 Hazardous Manual Handling",
        "SP23 Managing PPE",
        "SP41 Drug and Alcohol Impairment Testing",
      ],
    },
    "Consultation and Communication": {
      type: "category",
      level: 2,
      documentId: null,
      children: [
        "SP38 OHS Committee Meetings",
        "SP32 Internal-external Consultation Meeting",
        "SP33 Issue resolution",
      ],
    },
    "Risk Management": {
      type: "category",
      level: 2,
      documentId: null,
      children: [
        "SP07 Purchasing",
        "SP22 Risk Assessment Procedure",
        "SP29 Preparing Procedure & Work method statements",
        "SP31 Working at Height",
        "SP36 Managing Haz Sub and DG",
        "SP37 Managing Plant and Equipment",
      ],
    },
    "Work Instructions": {
      type: "category",
      level: 2,
      documentId: null,
      children: [
        "Air pollution -WI 028",
        "Asbestos Containing Material -WI 013",
        "Calibration -Certification Documentation via Seaward -WI 048",
        "Calibration of Meggers -WI 024",
        "Checking of substation transformer -WI 033",
        "Confirming Electrical Isolation -WI 020",
        "Control Panel Manufacture -WI 038",
        "Elevated Work Platforms -WI 023",
        "Energisation of new or modified electrical circuits and equipment WI 047",
        "Erosion -WI 026",
        "Event Set Up -WI 040",
        "Excavated Soil -WI 025",
        "Fault Finding and Maintenance -WI 036",
        "Hazardous Substances & Dangerous Goods -WI 015",
        "Hot Works -WI 007",
        "Installation General Light and Power -WI 034",
        "Installation General Public Lighting WI 041",
        "Installation Industrial Light and Power -WI 035",
        "Installation Traffic Lights -WI 042",
        "Job Set Up -WI 012",
        "Lone and Isolated Workers -WI 006",
        "Mobile Plant and Equipment -WI 008",
        "Noise -WI 027",
        "PCBs (Polychlorinated biphenyls) -WI 017",
        "Portable Electrical Equipment -WI 005",
        "PPE -WI 001",
        "Rescue for EWP -WI 022A",
        "Solar Installations WI 045",
        "Spill Management -WI 049",
        "Tag and Lock Out -WI 003",
        "Test &Tag with Seaward Prime Test 300 -WI 046",
        "Truck Mounted Boom Lift -WI 022",
        "Visual Impact -WI 029",
        "Waste Minimisation -WI 030",
        "Work in hot environments -WI 009",
      ],
    },
    "Safe Work Method Statements": {
      type: "category",
      level: 2,
      documentId: null,
      children: [
        "Cable Installation Using Mechanical Aid and Manual Installation -SWMS 018",
        "Checking of the low voltage system -SWMS 039",
        "Confined spaces -SWMS 011",
        "Demolition -SWMS 037",
        "Hot Works -SWMS 007",
        "Isolation and Earthing of Plant and Equipment -SWMS 004",
        "Live Low Voltage-SWMS 002",
        "Loading from mezzanine floor -SWMS 032",
        "Manual Handling -SWMS 010",
        "Operating Truck mounted Crane Fassi 25A -SWMS 019",
        "Removal of Light Poles -SWMS 031",
        "Repairs to Switch boards containing Asbestos -SWMS 043",
        "Trenching -SWMS 014",
        "Working at Height -SWMS 016",
        "Working within Close Proximity of a Rail Line -SWMS 044",
      ],
    },
  };
}

function saveIMSIndex(imsIndex) {
  try {
    fs.writeJsonSync(IMS_INDEX_PATH, imsIndex, { spaces: 2 });
    return true;
  } catch (err) {
    console.error("Error saving IMS index:", err);
    return false;
  }
}

function findDocumentByName(docName, includeArchived = false) {
  return documentIndex.find((doc) => {
    // Skip archived documents unless specifically requested
    if (!includeArchived && doc.isArchived) {
      return false;
    }

    if (doc.name.toLowerCase() === docName.toLowerCase()) return true;

    const cleanDocName = docName.replace(/[-\s]/g, "").toLowerCase();
    const cleanFileName = doc.name.replace(/[-\s]/g, "").toLowerCase();

    return (
      cleanFileName.includes(cleanDocName) ||
      cleanDocName.includes(cleanFileName)
    );
  });
}

// MANDATORY RECORDS FUNCTIONS
const MANDATORY_RECORDS_PATH = path.join(
  __dirname,
  "mandatory-records-index.json"
);

function loadMandatoryRecords() {
  try {
    if (fs.existsSync(MANDATORY_RECORDS_PATH)) {
      return fs.readJsonSync(MANDATORY_RECORDS_PATH);
    }
  } catch (err) {
    console.error("Error loading mandatory records config:", err);
  }

  // Default mandatory records structure
  return {
    "Internal Audit Records": {
      type: "mandatory",
      description: "Internal Audit schedule and audit report records",
      priority: "high",
      lastUpdated: null,
      documents: [],
      autoDetectKeywords: [
        "internal audit",
        "audit schedule",
        "audit report",
        "audit plan",
        "internal audit checklist",
      ],
      enrichedDocuments: [],
    },
    "Management Review Records": {
      type: "mandatory",
      description: "Management Review Meeting Minutes",
      priority: "high",
      lastUpdated: null,
      documents: [],
      autoDetectKeywords: [
        "management review",
        "management meeting",
        "review minutes",
        "mgmt review",
        "management review minutes",
      ],
      enrichedDocuments: [],
    },
    "NCR/Corrective Action Records": {
      type: "mandatory",
      description: "NCR/Corrective Action register/records",
      priority: "high",
      lastUpdated: null,
      documents: [],
      autoDetectKeywords: [
        "ncr",
        "non-conformance",
        "corrective action",
        "non conformance",
        "corrective action register",
        "ncr register",
      ],
      enrichedDocuments: [],
    },
    "Training/Skills Register": {
      type: "mandatory",
      description: "Current Training/Skills Register",
      priority: "high",
      lastUpdated: null,
      documents: [],
      autoDetectKeywords: [
        "training register",
        "skills register",
        "training matrix",
        "competency",
        "training records",
        "skills matrix",
      ],
      enrichedDocuments: [],
    },
    "Risk Management Records": {
      type: "mandatory",
      description:
        "Company Risk Management/SWOT Analysis or Management Review Improvement plans",
      priority: "high",
      lastUpdated: null,
      documents: [],
      autoDetectKeywords: [
        "risk management",
        "swot analysis",
        "risk register",
        "improvement plan",
        "risk assessment",
        "swot",
      ],
      enrichedDocuments: [],
    },
    "Maintenance Contract Projects": {
      type: "mandatory",
      description:
        "Project records for 2 Maintenance Contracts within the last twelve months",
      priority: "high",
      lastUpdated: null,
      documents: [],
      autoDetectKeywords: [
        "maintenance contract",
        "maintenance project",
        "preventive maintenance",
        "corrective maintenance",
        "maintenance schedule",
      ],
      enrichedDocuments: [],
      requiredCount: 2,
      timeframe: "12 months",
    },
    "Construction Projects": {
      type: "mandatory",
      description:
        "Project records for 2 Construction projects within the last twelve months",
      priority: "high",
      lastUpdated: null,
      documents: [],
      autoDetectKeywords: [
        "construction project",
        "building project",
        "construction contract",
        "project plan",
        "construction records",
      ],
      enrichedDocuments: [],
      requiredCount: 2,
      timeframe: "12 months",
    },
  };
}

function saveMandatoryRecords(mandatoryRecords) {
  try {
    fs.writeJsonSync(MANDATORY_RECORDS_PATH, mandatoryRecords, { spaces: 2 });
    return true;
  } catch (err) {
    console.error("Error saving mandatory records:", err);
    return false;
  }
}

function autoDetectMandatoryRecords() {
  const mandatoryRecords = loadMandatoryRecords();
  let detectionCount = 0;

  Object.keys(mandatoryRecords).forEach((recordType) => {
    const record = mandatoryRecords[recordType];
    const keywords = record.autoDetectKeywords || [];

    // Find documents that match the keywords
    const matchingDocs = documentIndex.filter((doc) => {
      if (doc.isArchived) return false; // Skip archived documents

      const searchText = (
        doc.name +
        " " +
        doc.folder +
        " " +
        doc.relativePath
      ).toLowerCase();

      return keywords.some((keyword) =>
        searchText.includes(keyword.toLowerCase())
      );
    });

    // Update enriched documents
    record.enrichedDocuments = matchingDocs.map((doc) => ({
      id: doc.id,
      name: doc.name,
      path: doc.path,
      folder: doc.folder,
      modified: doc.modified,
      created: doc.created,
      isArchived: doc.isArchived || false,
      autoDetected: true,
      matchedKeywords: keywords.filter((keyword) =>
        (doc.name + " " + doc.folder)
          .toLowerCase()
          .includes(keyword.toLowerCase())
      ),
    }));

    detectionCount += matchingDocs.length;
  });

  saveMandatoryRecords(mandatoryRecords);
  return detectionCount;
}

// DOCUMENT INDEX FUNCTIONS
function buildFileIndex() {
  console.log("Starting document indexing...");
  documentIndex = [];
  let processedCount = 0;
  const MAX_FILES = 10000; // Prevent memory issues

  try {
    const walkDir = (dir, relativePath = "") => {
      if (!fs.existsSync(dir)) {
        console.log(`Directory does not exist: ${dir}`);
        return;
      }

      if (processedCount >= MAX_FILES) {
        console.log(
          `Reached maximum file limit (${MAX_FILES}), stopping indexing`
        );
        return;
      }

      const files = fs.readdirSync(dir);

      files.forEach((file) => {
        try {
          if (processedCount >= MAX_FILES) return;

          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          const relativeFilePath = path.join(relativePath, file);

          processedCount++;

          if (stat.isDirectory()) {
            walkDir(filePath, relativeFilePath);
          } else {
            const ext = path.extname(file).toLowerCase();
            const validExtensions = [
              ".doc",
              ".docx",
              ".pdf",
              ".xls",
              ".xlsx",
              ".ppt",
              ".pptx",
              ".txt",
              ".rtf",
            ];

            if (validExtensions.includes(ext)) {
              const fileInfo = {
                id: documentIndex.length.toString(),
                name: file,
                path: filePath,
                relativePath: relativeFilePath,
                folder: relativePath,
                extension: ext,
                size: formatFileSize(stat.size),
                created: stat.birthtime,
                modified: stat.mtime,
                lastAccessed: stat.atime,
                isArchived: isArchivedDocument(filePath),
              };

              documentIndex.push(fileInfo);
            }
          }
        } catch (fileErr) {
          console.log(`Error processing file ${file}:`, fileErr.message);
        }
      });
    };

    if (fs.existsSync(DOCUMENTS_ROOT)) {
      walkDir(DOCUMENTS_ROOT);
      buildSearchIndex();
      saveIndexToFile();
      console.log(
        `Indexing complete. ${documentIndex.length} documents indexed (${processedCount} files processed).`
      );
    } else {
      console.error(`Document root directory not found: ${DOCUMENTS_ROOT}`);
    }
  } catch (err) {
    console.error("Error building file index:", err);
  }
}

function buildSearchIndex() {
  try {
    searchIndex = lunr(function () {
      this.field("name", { boost: 10 });
      this.field("folder", { boost: 5 });
      this.field("relativePath");
      this.ref("id");

      documentIndex.forEach((doc) => {
        this.add(doc);
      });
    });
  } catch (err) {
    console.error("Error building search index:", err);
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + " KB";
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + " MB";
  else return (bytes / 1073741824).toFixed(2) + " GB";
}

function saveIndexToFile() {
  try {
    const indexData = {
      documents: documentIndex,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeJsonSync(DB_PATH, indexData);
    console.log("Index saved to file");
  } catch (err) {
    console.error("Error saving index:", err);
  }
}

function loadIndexFromFile() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readJsonSync(DB_PATH);
      documentIndex = data.documents || [];
      buildSearchIndex();
      console.log(
        `Index loaded from file. ${documentIndex.length} documents in index.`
      );
      return true;
    }
  } catch (err) {
    console.error("Error loading index from file:", err);
  }
  return false;
}

function setupWatcher() {
  try {
    if (
      DOCUMENTS_ROOT.startsWith("\\\\") ||
      DOCUMENTS_ROOT.match(/^[a-zA-Z]:/)
    ) {
      console.log(
        "File watching disabled for network drives or drives with many files."
      );
      console.log(
        'You will need to use the "Rebuild Index" button when files change.'
      );
      return;
    }

    const watcher = chokidar.watch(DOCUMENTS_ROOT, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: true,
      ignored: /(^|[\/\\])\../,
      usePolling: true,
      interval: 5000,
      binaryInterval: 10000,
    });

    watcher
      .on("add", () => buildFileIndex())
      .on("change", () => buildFileIndex())
      .on("unlink", () => buildFileIndex())
      .on("error", (error) => {
        console.error("File watcher error:", error);
        console.log(
          'File watching has been disabled. Use the "Rebuild Index" button when files change.'
        );
      });

    console.log("File watcher set up for document directory");
  } catch (err) {
    console.error("Error setting up file watcher:", err);
    console.log(
      'File watching has been disabled. Use the "Rebuild Index" button when files change.'
    );
  }
}

// Executive Reporting Module
// Add to your app.js

const REPORT_TEMPLATES = {
  "compliance-audit": {
    name: "Compliance Audit Report",
    description: "Comprehensive compliance assessment with gap analysis",
    sections: [
      "executive-summary",
      "compliance-score",
      "gap-analysis",
      "risk-assessment",
      "action-plan",
      "appendix",
    ],
  },
  "regulatory-readiness": {
    name: "Regulatory Readiness Assessment",
    description: "Readiness for external audits and inspections",
    sections: [
      "executive-summary",
      "regulatory-compliance",
      "audit-readiness",
      "recommendations",
      "timeline",
    ],
  },
  "management-dashboard": {
    name: "Management Dashboard",
    description: "High-level metrics and KPIs for executives",
    sections: [
      "key-metrics",
      "trend-analysis",
      "risk-indicators",
      "performance-summary",
    ],
  },
};

// Generate comprehensive compliance report
async function generateComplianceReport(
  reportType = "compliance-audit",
  options = {}
) {
  console.log("Generating compliance report:", reportType);

  const aiConfig = loadAIConfig();
  const imsIndex = loadIMSIndex();
  const mandatoryRecords = loadMandatoryRecords();

  // Calculate compliance metrics
  const metrics = calculateComplianceMetrics(imsIndex, mandatoryRecords);
  const gaps = identifyComplianceGaps(imsIndex, mandatoryRecords);
  const risks = assessComplianceRisks(gaps, aiConfig.companyInfo);

  const reportData = {
    metadata: {
      companyName: aiConfig.companyInfo.name || "Client Company",
      industry: aiConfig.companyInfo.industry || "electrical",
      jurisdiction: aiConfig.companyInfo.jurisdiction || "victoria",
      standards: aiConfig.companyInfo.standards || ["ISO45001"],
      generatedDate: new Date().toISOString(),
      reportType: reportType,
      generatedBy: "SafetySync Pro",
    },
    metrics: metrics,
    gaps: gaps,
    risks: risks,
    actionPlan: generateActionPlan(gaps, risks),
    recommendations: await generateAIRecommendations(gaps, risks, aiConfig),
  };

  return reportData;
}

function calculateComplianceMetrics(imsIndex, mandatoryRecords) {
  let totalDocuments = 0;
  let linkedDocuments = 0;
  let missingCritical = 0;
  let archivedDocuments = 0;

  // Calculate IMS compliance
  Object.keys(imsIndex).forEach((categoryName) => {
    const category = imsIndex[categoryName];
    totalDocuments++;

    if (category.document) {
      linkedDocuments++;
      if (category.document.isArchived) archivedDocuments++;
    }

    if (category.enrichedChildren) {
      category.enrichedChildren.forEach((child) => {
        totalDocuments++;
        if (child.document) {
          linkedDocuments++;
          if (child.document.isArchived) archivedDocuments++;
        }
      });
    }
  });

  // Calculate mandatory records compliance
  const mandatoryTotal = Object.keys(mandatoryRecords).length;
  const mandatoryLinked = Object.keys(mandatoryRecords).filter((key) => {
    const record = mandatoryRecords[key];
    return (
      record.enrichedDocuments &&
      record.enrichedDocuments.some((doc) => doc.manuallyLinked)
    );
  }).length;

  const complianceScore =
    totalDocuments > 0
      ? Math.round((linkedDocuments / totalDocuments) * 100)
      : 0;
  const mandatoryScore =
    mandatoryTotal > 0
      ? Math.round((mandatoryLinked / mandatoryTotal) * 100)
      : 0;
  const overallScore = Math.round((complianceScore + mandatoryScore) / 2);

  return {
    overall: {
      score: overallScore,
      rating: getComplianceRating(overallScore),
      status: getComplianceStatus(overallScore),
    },
    documents: {
      total: totalDocuments,
      linked: linkedDocuments,
      missing: totalDocuments - linkedDocuments,
      archived: archivedDocuments,
      score: complianceScore,
    },
    mandatory: {
      total: mandatoryTotal,
      compliant: mandatoryLinked,
      missing: mandatoryTotal - mandatoryLinked,
      score: mandatoryScore,
    },
  };
}

function identifyComplianceGaps(imsIndex, mandatoryRecords) {
  const gaps = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };

  // Identify missing IMS documents
  Object.keys(imsIndex).forEach((categoryName) => {
    const category = imsIndex[categoryName];

    if (!category.document) {
      gaps.high.push({
        type: "missing_document",
        category: categoryName,
        description: `Missing category document: ${categoryName}`,
        impact: "High",
        effort: "Medium",
        aiGenerable: true,
      });
    }

    if (category.enrichedChildren) {
      category.enrichedChildren.forEach((child) => {
        if (!child.document) {
          const priority = getCriticalityLevel(child.name, categoryName);
          gaps[priority].push({
            type: "missing_document",
            category: categoryName,
            document: child.name,
            description: `Missing document: ${child.name}`,
            impact: capitalizeFirst(priority),
            effort: "Medium",
            aiGenerable: isAIGenerable(child.name),
          });
        } else if (child.document.isArchived) {
          gaps.medium.push({
            type: "archived_document",
            category: categoryName,
            document: child.name,
            description: `Archived document may be outdated: ${child.name}`,
            impact: "Medium",
            effort: "Low",
            action: "Review and update if necessary",
          });
        }
      });
    }
  });

  // Identify missing mandatory records
  Object.keys(mandatoryRecords).forEach((recordType) => {
    const record = mandatoryRecords[recordType];
    const hasLinkedDocs =
      record.enrichedDocuments &&
      record.enrichedDocuments.some((doc) => doc.manuallyLinked);

    if (!hasLinkedDocs) {
      gaps.critical.push({
        type: "missing_mandatory",
        recordType: recordType,
        description: `Missing mandatory record: ${recordType}`,
        impact: "Critical",
        effort: "High",
        regulatory: true,
        aiGenerable: false,
      });
    }
  });

  return gaps;
}

function assessComplianceRisks(gaps, companyInfo) {
  const risks = [];

  // Calculate regulatory risk
  const criticalGaps = gaps.critical.length;
  const highGaps = gaps.high.length;

  if (criticalGaps > 0) {
    risks.push({
      type: "regulatory",
      level: "Critical",
      description: `${criticalGaps} critical compliance gaps may result in regulatory penalties`,
      likelihood: "High",
      consequence: "Severe",
      mitigation: "Immediate action required to address mandatory record gaps",
    });
  }

  if (highGaps > 3) {
    risks.push({
      type: "operational",
      level: "High",
      description: `${highGaps} missing procedures may impact safe work practices`,
      likelihood: "Medium",
      consequence: "Major",
      mitigation: "Develop missing procedures within 30 days",
    });
  }

  // Industry-specific risks
  if (companyInfo.industry === "electrical") {
    const electricalGaps = gaps.high.filter(
      (gap) => gap.document && gap.document.toLowerCase().includes("electrical")
    ).length;

    if (electricalGaps > 0) {
      risks.push({
        type: "safety",
        level: "High",
        description:
          "Missing electrical safety procedures increase risk of serious injury",
        likelihood: "Medium",
        consequence: "Catastrophic",
        mitigation: "Priority development of electrical safety documentation",
      });
    }
  }

  return risks;
}

function generateActionPlan(gaps, risks) {
  const actions = [];

  // Group gaps by priority and effort
  const criticalActions = gaps.critical.map((gap) => ({
    priority: 1,
    description: gap.description,
    timeline: "1-2 weeks",
    responsibility: "EHS Manager",
    resources: gap.regulatory
      ? "External consultant recommended"
      : "Internal team",
    aiAssisted: gap.aiGenerable || false,
  }));

  const highActions = gaps.high.slice(0, 5).map((gap) => ({
    priority: 2,
    description: gap.description,
    timeline: "2-4 weeks",
    responsibility: "Department Manager",
    resources: "Internal team + AI assistance",
    aiAssisted: gap.aiGenerable || false,
  }));

  const quickWins = gaps.medium
    .filter((gap) => gap.effort === "Low")
    .slice(0, 3)
    .map((gap) => ({
      priority: 3,
      description: gap.description,
      timeline: "1 week",
      responsibility: "Team Lead",
      resources: "Minimal resources required",
      aiAssisted: false,
    }));

  return {
    immediate: criticalActions,
    shortTerm: highActions,
    quickWins: quickWins,
    totalActions:
      criticalActions.length + highActions.length + quickWins.length,
  };
}

async function generateAIRecommendations(gaps, risks, aiConfig) {
  if (!aiConfig.apiKeys[aiConfig.selectedProvider]) {
    return {
      available: false,
      message: "AI recommendations require API configuration",
    };
  }

  const prompt = `As an expert EHS consultant, provide strategic recommendations for this compliance situation:

Company: ${aiConfig.companyInfo.name}
Industry: ${aiConfig.companyInfo.industry}
Jurisdiction: ${aiConfig.companyInfo.jurisdiction}

Critical Gaps: ${gaps.critical.length}
High Priority Gaps: ${gaps.high.length}
Key Risks: ${risks.map((r) => r.description).join("; ")}

Provide:
1. Top 3 strategic priorities
2. Resource allocation recommendations
3. Timeline for compliance achievement
4. ROI considerations for compliance investment

Keep recommendations practical and specific to ${
    aiConfig.companyInfo.industry
  } industry in ${aiConfig.companyInfo.jurisdiction}.`;

  try {
    const result = await callAIProvider(
      AI_PROVIDERS[aiConfig.selectedProvider],
      aiConfig.apiKeys[aiConfig.selectedProvider],
      prompt
    );

    return {
      available: true,
      content: result.content,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error generating AI recommendations:", error);
    return {
      available: false,
      error: error.message,
    };
  }
}

// Helper functions
function getComplianceRating(score) {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 70) return "Satisfactory";
  if (score >= 60) return "Needs Improvement";
  return "Critical";
}

function getComplianceStatus(score) {
  if (score >= 85) return "Compliant";
  if (score >= 70) return "Mostly Compliant";
  if (score >= 50) return "Partially Compliant";
  return "Non-Compliant";
}

function getCriticalityLevel(documentName, categoryName) {
  const criticalKeywords = [
    "emergency",
    "evacuation",
    "lockout",
    "confined space",
    "electrical",
  ];
  const highKeywords = ["safety", "hazard", "risk", "procedure"];

  const searchText = (documentName + " " + categoryName).toLowerCase();

  if (criticalKeywords.some((keyword) => searchText.includes(keyword))) {
    return "critical";
  }
  if (highKeywords.some((keyword) => searchText.includes(keyword))) {
    return "high";
  }
  return "medium";
}

function isAIGenerable(documentName) {
  const generableTypes = [
    "swms",
    "risk assessment",
    "procedure",
    "policy",
    "training",
  ];
  const searchText = documentName.toLowerCase();
  return generableTypes.some((type) => searchText.includes(type));
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const AI_CONFIG_PATH = path.join(__dirname, "ai-config.json");

const AI_PROVIDERS = {
  openai: {
    name: "OpenAI GPT-4",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4",
    costPerToken: 0.00003,
  },
  anthropic: {
    name: "Anthropic Claude",
    endpoint: "https://api.anthropic.com/v1/messages",
    model: "claude-3-sonnet-20240229",
    costPerToken: 0.000015,
  },
  deepseek: {
    name: "DeepSeek Chat",
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
    costPerToken: 0.000002,
  },
  gemini: {
    name: "Google Gemini Pro",
    endpoint:
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
    model: "gemini-pro",
    costPerToken: 0.0000005,
  },
};

function loadAIConfig() {
  try {
    if (fs.existsSync(AI_CONFIG_PATH)) {
      return fs.readJsonSync(AI_CONFIG_PATH);
    }
  } catch (err) {
    console.error("Error loading AI config:", err);
  }

  // Default AI configuration
  return {
    selectedProvider: "openai",
    apiKeys: {},
    companyInfo: {
      name: "",
      industry: "electrical",
      jurisdiction: "victoria",
      standards: ["ISO45001"],
    },
  };
}

function saveAIConfig(config) {
  try {
    fs.writeJsonSync(AI_CONFIG_PATH, config, { spaces: 2 });
    return true;
  } catch (err) {
    console.error("Error saving AI config:", err);
    return false;
  }
}

// Replace your current generateDocument function with this enhanced version
async function generateDocument(documentType, documentName, customInputs) {
  const aiConfig = loadAIConfig();

  if (!aiConfig.apiKeys[aiConfig.selectedProvider]) {
    return {
      success: false,
      message:
        "AI provider not configured. Please set up API keys in settings.",
    };
  }
  const documentTypeMap = {
    policy: "Safety Policy",
    procedure: "Work Procedure",
    swms: "SWMS",
    SWMS: "SWMS",
    "Risk Assessment": "Risk Assessment",
    "Emergency Procedure": "Emergency Procedure",
    "Training Manual": "Training Manual",
    "Work Procedure": "Work Procedure",
    "Safety Policy": "Safety Policy",
  };

  const mappedDocumentType = documentTypeMap[documentType] || documentType;

  // Enhanced prompts for each document type
  const ENHANCED_PROMPTS = {
    SWMS: `Create a comprehensive Safe Work Method Statement (SWMS) for "${documentName}" in accordance with Australian safety standards and ${
      aiConfig.companyInfo.jurisdiction
    } regulations.

Company: ${aiConfig.companyInfo.name || "Your Company"}
Industry: ${aiConfig.companyInfo.industry || "electrical"}
Jurisdiction: ${aiConfig.companyInfo.jurisdiction || "Victoria"}
Standards: ${aiConfig.companyInfo.standards?.join(", ") || "ISO 45001"}

The SWMS must include these comprehensive sections:

1. DOCUMENT CONTROL SECTION
   - Document title, number, version, effective date
   - Approval signatures and review dates
   - Distribution list and controlled copy information

2. ACTIVITY DESCRIPTION
   - Detailed scope of work and objectives
   - Work location and environmental conditions
   - Personnel involved and their roles
   - Equipment and materials required
   - Estimated duration and schedule

3. COMPREHENSIVE HAZARD IDENTIFICATION
   - Physical hazards (electrical, mechanical, falls, etc.)
   - Chemical hazards (substances, fumes, dust)
   - Biological hazards (if applicable)
   - Ergonomic hazards (manual handling, repetitive tasks)
   - Psychosocial hazards (stress, fatigue, isolation)
   - Environmental hazards (weather, terrain, wildlife)

4. DETAILED RISK ASSESSMENT
   - Risk matrix using likelihood × consequence = risk rating
   - Initial risk assessment (before controls)
   - Risk control measures following hierarchy of controls:
     * Elimination (remove the hazard completely)
     * Substitution (replace with something less hazardous)
     * Engineering controls (isolation, ventilation, guarding)
     * Administrative controls (procedures, training, signage)
     * Personal protective equipment (PPE)
   - Residual risk assessment (after controls)

5. STEP-BY-STEP SAFE WORK PROCEDURES
   - Pre-work safety briefing and planning
   - Detailed sequential work steps with safety controls
   - Quality checkpoints and hold points
   - Handover procedures between shifts/teams
   - Work completion and cleanup procedures

6. EMERGENCY RESPONSE PROCEDURES
   - Emergency contact numbers and escalation
   - Evacuation procedures and assembly points
   - First aid response and medical emergency procedures
   - Fire emergency response
   - Chemical spill response (if applicable)
   - Equipment failure response
   - Severe weather response

7. REQUIRED PPE AND SAFETY EQUIPMENT
   - Specific PPE for each work activity
   - PPE inspection and maintenance requirements
   - Safety equipment (harnesses, gas monitors, etc.)
   - Emergency equipment (eyewash, first aid, spill kits)

8. PERMITS AND AUTHORIZATIONS
   - Work permits required (hot work, confined space, etc.)
   - Electrical isolation and lockout/tagout procedures
   - Environmental permits if required
   - Authority approvals and notifications

9. TRAINING AND COMPETENCY REQUIREMENTS
   - Required qualifications and certifications
   - Site-specific training requirements
   - Competency assessment criteria
   - Refresher training schedules

10. MONITORING AND REVIEW
    - Safety monitoring during work
    - Environmental monitoring requirements
    - Regular SWMS review and update procedures
    - Lessons learned and improvement processes

11. REFERENCES AND APPENDICES
    - Relevant Australian Standards (AS/NZS series)
    - ${aiConfig.companyInfo.jurisdiction} WorkSafe guidelines
    - Company policies and procedures
    - Material safety data sheets
    - Site maps and drawings

Create a professional, comprehensive document that meets Australian regulatory requirements and could be used immediately for regulatory inspection.

Activity Details: ${
      customInputs.prompt || "Standard safety procedures required"
    }
Specific Requirements: ${
      customInputs.specificDetails || "Follow industry best practices"
    }`,

    "Risk Assessment": `Create a comprehensive Risk Assessment for "${documentName}" following AS/NZS ISO 31000 Risk Management principles and ${
      aiConfig.companyInfo.jurisdiction
    } regulatory requirements.

Company: ${aiConfig.companyInfo.name || "Your Company"}
Industry: ${aiConfig.companyInfo.industry || "electrical"}
Jurisdiction: ${aiConfig.companyInfo.jurisdiction || "Victoria"}
Standards: ${aiConfig.companyInfo.standards?.join(", ") || "ISO 45001"}

The Risk Assessment must include:

1. EXECUTIVE SUMMARY
   - Purpose and scope of assessment
   - Key findings and recommendations
   - Overall risk profile summary

2. ASSESSMENT METHODOLOGY
   - Risk management framework used (AS/NZS ISO 31000)
   - Risk criteria and acceptance levels
   - Assessment team and qualifications
   - Data sources and consultation process

3. ACTIVITY/PROCESS DESCRIPTION
   - Detailed description of activities assessed
   - Location and environmental factors
   - Personnel involved and their exposure
   - Equipment, materials, and substances used
   - Operational timeframes and frequencies

4. COMPREHENSIVE HAZARD IDENTIFICATION
   - Systematic hazard identification process
   - Physical hazards (noise, vibration, radiation, etc.)
   - Chemical hazards (toxic, corrosive, flammable substances)
   - Biological hazards (bacteria, viruses, allergens)
   - Ergonomic hazards (manual handling, awkward postures)
   - Psychosocial hazards (stress, bullying, fatigue)
   - Environmental hazards (weather extremes, natural disasters)

5. RISK ANALYSIS AND EVALUATION
   - Likelihood assessment criteria (1-5 scale)
   - Consequence assessment criteria (1-5 scale)
   - Risk matrix and rating system
   - Initial risk ratings (before controls)
   - Tolerability and acceptance criteria

6. RISK CONTROL MEASURES
   - Hierarchy of controls application:
     * Elimination strategies
     * Substitution options
     * Engineering controls design
     * Administrative controls implementation
     * PPE selection and use
   - Implementation timeline and responsibilities
   - Resource requirements and costs

7. RESIDUAL RISK ASSESSMENT
   - Risk ratings after control implementation
   - Comparison with acceptance criteria
   - Additional controls if required
   - Monitoring and review requirements

8. EMERGENCY PREPAREDNESS
   - Emergency scenarios identified
   - Response procedures and resources
   - Training and drill requirements
   - Communication and notification protocols

9. CONSULTATION AND COMMUNICATION
   - Stakeholder consultation process
   - Worker participation and feedback
   - Communication of results and controls
   - Training and awareness programs

10. MONITORING AND REVIEW
    - Performance indicators and metrics
    - Regular review schedules
    - Audit and inspection requirements
    - Continuous improvement processes

11. REGULATORY COMPLIANCE
    - Applicable legislation and standards
    - Compliance obligations and requirements
    - Reporting and notification requirements
    - Authority liaison and approvals

Reference: AS/NZS ISO 31000:2018 Risk Management, AS/NZS 4801 OHS Management, WorkSafe ${
      aiConfig.companyInfo.jurisdiction
    } guidelines.

Assessment Details: ${
      customInputs.prompt || "Comprehensive risk assessment required"
    }
Specific Requirements: ${
      customInputs.specificDetails || "Follow regulatory requirements"
    }`,

    "Safety Policy": `Create a comprehensive Safety Policy for ${
      aiConfig.companyInfo.name || "Your Company"
    } in accordance with ${
      aiConfig.companyInfo.standards?.join(" and ") || "ISO 45001"
    } and ${aiConfig.companyInfo.jurisdiction} regulatory requirements.

Company: ${aiConfig.companyInfo.name || "Your Company"}
Industry: ${aiConfig.companyInfo.industry || "electrical"}
Jurisdiction: ${aiConfig.companyInfo.jurisdiction || "Victoria"}
Standards: ${aiConfig.companyInfo.standards?.join(", ") || "ISO 45001"}

The Safety Policy must include:

1. POLICY STATEMENT AND COMMITMENT
   - CEO/Senior Leadership commitment statement
   - Safety vision and values
   - Zero harm philosophy and targets
   - Commitment to legal compliance and continuous improvement

2. SCOPE AND APPLICATION
   - All operations, facilities, and activities covered
   - All personnel including employees, contractors, visitors
   - Geographic scope and jurisdictional coverage
   - Integration with other management systems

3. LEGISLATIVE AND REGULATORY COMPLIANCE
   - ${aiConfig.companyInfo.jurisdiction} Occupational Health and Safety Act
   - ${aiConfig.companyInfo.jurisdiction} OHS Regulations
   - Industry-specific regulations for ${aiConfig.companyInfo.industry}
   - Australian Standards compliance (AS/NZS series)
   - WorkSafe ${aiConfig.companyInfo.jurisdiction} codes of practice

4. ROLES AND RESPONSIBILITIES
   - Board of Directors and Executive responsibilities
   - Senior Management safety accountabilities
   - Line Management duties and authorities
   - Supervisor responsibilities and expectations
   - Worker rights, duties, and participation
   - Safety committee roles and functions

5. SAFETY MANAGEMENT SYSTEM FRAMEWORK
   - Policy implementation and governance
   - Planning and objective setting processes
   - Operational controls and procedures
   - Performance monitoring and measurement
   - Internal audit and management review
   - Continual improvement methodology

6. HAZARD IDENTIFICATION AND RISK MANAGEMENT
   - Systematic hazard identification processes
   - Risk assessment methodologies and criteria
   - Risk control hierarchy implementation
   - Change management procedures
   - Contractor and supplier risk management

7. CONSULTATION AND COMMUNICATION
   - Worker consultation mechanisms
   - Safety committee structures and processes
   - Communication channels and methods
   - Safety suggestion and feedback systems
   - External stakeholder engagement

8. INCIDENT MANAGEMENT
   - Incident reporting requirements and procedures
   - Investigation methodologies and timelines
   - Corrective and preventive action processes
   - Lessons learned and knowledge sharing
   - Regulatory notification requirements

9. TRAINING AND COMPETENCY
   - Safety induction and orientation programs
   - Role-specific training requirements
   - Competency assessment and verification
   - Refresher and update training schedules
   - Training records and documentation

10. EMERGENCY PREPAREDNESS AND RESPONSE
    - Emergency response organization
    - Emergency procedures and protocols
    - Training and drill requirements
    - Equipment and resource management
    - Business continuity planning

11. PERFORMANCE MONITORING AND MEASUREMENT
    - Key performance indicators (KPIs)
    - Leading and lagging indicators
    - Data collection and analysis systems
    - Benchmarking and trend analysis
    - Target setting and performance review

12. CONTRACTOR AND VISITOR MANAGEMENT
    - Contractor prequalification and selection
    - Safety requirements and expectations
    - Monitoring and performance management
    - Visitor safety induction and controls
    - Third-party liability and insurance

13. IMPLEMENTATION AND RESOURCES
    - Implementation timeline and milestones
    - Resource allocation and budgeting
    - Organizational structure and reporting
    - Technology and system requirements
    - Communication and change management

14. POLICY REVIEW AND CONTINUOUS IMPROVEMENT
    - Regular policy review schedules
    - Performance evaluation and assessment
    - Stakeholder feedback incorporation
    - Update and revision procedures
    - Version control and distribution

Policy Requirements: ${
      customInputs.prompt || "Comprehensive safety management policy"
    }
Specific Focus Areas: ${
      customInputs.specificDetails ||
      "Industry best practices and regulatory compliance"
    }`,

    "Emergency Procedure": `Create a comprehensive Emergency Response Procedure for "${documentName}" at ${
      aiConfig.companyInfo.name || "Your Company"
    } in accordance with AS 3745-2010 and ${
      aiConfig.companyInfo.jurisdiction
    } emergency management requirements.

Company: ${aiConfig.companyInfo.name || "Your Company"}
Industry: ${aiConfig.companyInfo.industry || "electrical"}
Jurisdiction: ${aiConfig.companyInfo.jurisdiction || "Victoria"}

The Emergency Procedure must include:

1. PURPOSE AND SCOPE
   - Emergency types covered by this procedure
   - Facilities and locations included
   - Personnel and stakeholders affected
   - Integration with other emergency procedures

2. EMERGENCY RESPONSE ORGANIZATION
   - Emergency Control Organization (ECO) structure
   - Chief Warden roles and responsibilities
   - Area Warden duties and authorities
   - First Aid Officer responsibilities
   - Deputy roles and succession planning

3. EMERGENCY CONTACT INFORMATION
   - Emergency services (000 - Police, Fire, Ambulance)
   - ${aiConfig.companyInfo.jurisdiction} emergency services
   - Company emergency contacts and escalation
   - Key personnel 24/7 contact details
   - Utility companies and service providers

4. ALERT AND NOTIFICATION PROCEDURES
   - Emergency detection and assessment
   - Alert systems and communication methods
   - Notification protocols and escalation
   - External authority notification requirements
   - Media and stakeholder communication

5. EVACUATION PROCEDURES
   - Evacuation signals and announcements
   - Primary and secondary evacuation routes
   - Assembly areas and accountability procedures
   - Special needs personnel assistance
   - Visitor and contractor evacuation
   - Equipment shutdown and securing procedures

6. SPECIFIC EMERGENCY RESPONSE ACTIONS
   - ${documentName} specific response procedures
   - Immediate response priorities and actions
   - Resource deployment and coordination
   - Containment and mitigation strategies
   - Recovery and restoration procedures

7. FIRST AID AND MEDICAL RESPONSE
   - First aid assessment and treatment
   - Medical emergency response procedures
   - Ambulance coordination and hospital liaison
   - Serious injury and fatality protocols
   - Medical facility locations and capabilities

8. FIRE SAFETY AND RESPONSE
   - Fire detection and alarm systems
   - Fire suppression and extinguisher use
   - Fire brigade coordination and liaison
   - Smoke management and ventilation
   - Hot work and ignition source controls

9. CHEMICAL SPILL AND HAZMAT RESPONSE
   - Spill assessment and containment
   - Personal protection and evacuation zones
   - Cleanup procedures and waste disposal
   - Environmental protection measures
   - Regulatory notification requirements

10. UTILITIES AND INFRASTRUCTURE EMERGENCIES
    - Electrical power failure response
    - Gas leak detection and response
    - Water supply disruption procedures
    - Communication system failures
    - Building structural emergencies

11. SECURITY AND THREAT RESPONSE
    - Bomb threat procedures
    - Suspicious package protocols
    - Workplace violence response
    - Unauthorized access incidents
    - Cyber security emergencies

12. NATURAL DISASTER RESPONSE
    - Severe weather warning procedures
    - Earthquake response and shelter
    - Flood emergency procedures
    - Bush fire threat response
    - Storm damage assessment and recovery

13. POST-EMERGENCY PROCEDURES
    - All-clear and re-entry authorization
    - Damage assessment and documentation
    - Incident investigation requirements
    - Business continuity activation
    - Lessons learned and procedure updates

14. TRAINING AND DRILLS
    - Emergency response training requirements
    - Drill schedules and scenarios
    - Training records and competency assessment
    - External emergency service liaison training
    - Community emergency preparedness

15. EQUIPMENT AND RESOURCES
    - Emergency equipment inventory and maintenance
    - Communication equipment and backup systems
    - First aid supplies and medical equipment
    - Emergency lighting and power systems
    - Personal protective equipment for responders

Emergency Details: ${
      customInputs.prompt || "Comprehensive emergency response required"
    }
Facility Information: ${
      customInputs.specificDetails || "Standard facility emergency procedures"
    }`,

    "Training Manual": `Create a comprehensive Training Manual for "${documentName}" at ${
      aiConfig.companyInfo.name || "Your Company"
    } in accordance with Australian training standards and ${
      aiConfig.companyInfo.jurisdiction
    } requirements.

Company: ${aiConfig.companyInfo.name || "Your Company"}
Industry: ${aiConfig.companyInfo.industry || "electrical"}
Jurisdiction: ${aiConfig.companyInfo.jurisdiction || "Victoria"}

The Training Manual must include:

1. TRAINING PROGRAM OVERVIEW
   - Training objectives and learning outcomes
   - Target audience and prerequisites
   - Training duration and delivery methods
   - Assessment and certification requirements

2. REGULATORY AND COMPLIANCE REQUIREMENTS
   - Applicable legislation and standards
   - Industry-specific training requirements
   - Competency standards and qualifications
   - Continuing education and renewal requirements

3. TRAINER QUALIFICATIONS AND REQUIREMENTS
   - Minimum qualifications and experience
   - Training delivery competencies
   - Assessment and evaluation skills
   - Ongoing professional development

4. LEARNING CONTENT AND MODULES
   Module 1: Theoretical Foundation
   - Key concepts and principles
   - Legislative and regulatory framework
   - Industry standards and best practices
   - Risk management principles

   Module 2: Practical Application
   - Hands-on skill development
   - Real-world scenarios and case studies
   - Problem-solving and decision making
   - Tool and equipment familiarization

   Module 3: Safety and Risk Management
   - Hazard identification and risk assessment
   - Safe work procedures and practices
   - Emergency procedures and response
   - Personal protective equipment use

   Module 4: Quality and Performance
   - Quality standards and requirements
   - Performance monitoring and measurement
   - Continuous improvement processes
   - Documentation and record keeping

5. TRAINING DELIVERY METHODOLOGY
   - Face-to-face instruction methods
   - Online and e-learning components
   - Practical demonstration and practice
   - Group activities and discussions
   - Individual coaching and mentoring

6. ASSESSMENT AND EVALUATION
   - Assessment criteria and standards
   - Written examination requirements
   - Practical demonstration assessments
   - Portfolio and project-based assessment
   - Competency verification procedures

7. TRAINING RESOURCES AND MATERIALS
   - Required textbooks and references
   - Training aids and visual materials
   - Equipment and tools needed
   - Software and technology requirements
   - Safety equipment and PPE

8. TRAINING FACILITIES AND ENVIRONMENT
   - Classroom setup and requirements
   - Practical training area specifications
   - Safety considerations and controls
   - Technology and equipment needs
   - Accessibility and accommodation

9. PARTICIPANT REQUIREMENTS
   - Entry requirements and prerequisites
   - Physical and medical requirements
   - Language and literacy standards
   - Safety induction and orientation
   - Code of conduct and expectations

10. CERTIFICATION AND RECOGNITION
    - Certificate and qualification awarded
    - Competency standards achieved
    - Industry recognition and portability
    - Renewal and continuing education
    - Record keeping and verification

11. TRAINING EVALUATION AND FEEDBACK
    - Participant feedback collection
    - Training effectiveness evaluation
    - Trainer performance assessment
    - Program improvement processes
    - Stakeholder satisfaction measurement

12. QUALITY ASSURANCE AND CONTINUOUS IMPROVEMENT
    - Quality standards and benchmarks
    - Regular program review and update
    - Industry consultation and feedback
    - Regulatory compliance monitoring
    - Best practice research and implementation

13. RECORD KEEPING AND DOCUMENTATION
    - Participant records and transcripts
    - Assessment results and certificates
    - Training delivery documentation
    - Quality assurance records
    - Compliance and audit trails

Training Specifications: ${
      customInputs.prompt || "Comprehensive training program required"
    }
Target Audience Details: ${
      customInputs.specificDetails || "Industry professionals and workers"
    }`,

    "Work Procedure": `Create a comprehensive Work Procedure for "${documentName}" at ${
      aiConfig.companyInfo.name || "Your Company"
    } in accordance with ${
      aiConfig.companyInfo.standards?.join(" and ") || "ISO 45001"
    } and ${aiConfig.companyInfo.jurisdiction} requirements.

Company: ${aiConfig.companyInfo.name || "Your Company"}
Industry: ${aiConfig.companyInfo.industry || "electrical"}
Jurisdiction: ${aiConfig.companyInfo.jurisdiction || "Victoria"}

The Work Procedure must include:

1. PURPOSE AND SCOPE
   - Objective and purpose of the procedure
   - Activities and processes covered
   - Locations and facilities included
   - Personnel and roles involved

2. DEFINITIONS AND TERMINOLOGY
   - Technical terms and definitions
   - Industry-specific terminology
   - Acronyms and abbreviations
   - Reference standards and codes

3. ROLES AND RESPONSIBILITIES
   - Management responsibilities and authorities
   - Supervisor duties and accountabilities
   - Worker roles and expectations
   - Specialist roles and competencies
   - Contractor and visitor responsibilities

4. REGULATORY AND COMPLIANCE REQUIREMENTS
   - Applicable legislation and regulations
   - Industry standards and codes of practice
   - Company policies and procedures
   - Permit and authorization requirements
   - Documentation and record keeping

5. EQUIPMENT, TOOLS, AND MATERIALS
   - Required equipment and specifications
   - Tool inventory and maintenance
   - Material specifications and handling
   - Calibration and verification requirements
   - Storage and security arrangements

6. SAFETY REQUIREMENTS AND PRECAUTIONS
   - Hazard identification and risk assessment
   - Safety controls and protective measures
   - Personal protective equipment requirements
   - Environmental protection measures
   - Emergency equipment and procedures

7. PRE-WORK PREPARATION AND PLANNING
   - Work planning and scheduling
   - Resource allocation and availability
   - Permit applications and approvals
   - Safety briefings and communications
   - Equipment inspection and setup

8. DETAILED WORK PROCEDURES
   Step 1: Initial Setup and Preparation
   - Site establishment and security
   - Equipment positioning and connection
   - Safety zone establishment
   - Communication system setup

   Step 2: Work Execution Procedures
   - Sequential work instructions
   - Quality control checkpoints
   - Safety monitoring requirements
   - Progress reporting and documentation

   Step 3: Quality Assurance and Testing
   - Inspection and testing procedures
   - Acceptance criteria and standards
   - Non-conformance handling
   - Documentation and certification

   Step 4: Completion and Handover
   - Work completion verification
   - Cleanup and site restoration
   - Documentation and record finalization
   - Handover procedures and sign-off

9. QUALITY CONTROL AND ASSURANCE
   - Quality standards and specifications
   - Inspection and testing requirements
   - Non-conformance identification and correction
   - Quality documentation and records
   - Continuous improvement processes

10. ENVIRONMENTAL CONSIDERATIONS
    - Environmental impact assessment
    - Pollution prevention measures
    - Waste management and disposal
    - Resource conservation practices
    - Environmental monitoring requirements

11. EMERGENCY PROCEDURES
    - Emergency contact information
    - Emergency response procedures
    - Evacuation and assembly procedures
    - First aid and medical response
    - Incident reporting requirements

12. TRAINING AND COMPETENCY
    - Required qualifications and certifications
    - Training program requirements
    - Competency assessment criteria
    - Refresher training schedules
    - Training record maintenance

13. DOCUMENTATION AND RECORD KEEPING
    - Required documentation and forms
    - Record keeping requirements
    - Document control and distribution
    - Archive and retention periods
    - Access and confidentiality

14. MONITORING AND REVIEW
    - Performance monitoring indicators
    - Regular procedure review schedules
    - Stakeholder feedback collection
    - Continuous improvement implementation
    - Version control and updates

15. REFERENCES AND APPENDICES
    - Relevant standards and regulations
    - Supporting procedures and guidelines
    - Forms and checklists
    - Diagrams and technical drawings
    - Contact information and resources

Procedure Details: ${
      customInputs.prompt || "Comprehensive work procedure required"
    }
Specific Requirements: ${
      customInputs.specificDetails ||
      "Follow industry best practices and regulatory requirements"
    }`,
  };

  // Get the appropriate prompt
  const prompt = ENHANCED_PROMPTS[mappedDocumentType];
  if (!prompt) {
    console.log(
      `No prompt found for document type: ${documentType} (mapped to: ${mappedDocumentType})`
    );
    console.log("Available prompts:", Object.keys(ENHANCED_PROMPTS));
    return {
      success: false,
      message: `Document type "${documentType}" not supported. Available types: ${Object.keys(
        ENHANCED_PROMPTS
      ).join(", ")}`,
    };
  }

  console.log(
    "Generating enhanced document with AI provider:",
    aiConfig.selectedProvider
  );
  console.log("Estimated tokens:", estimateTokens(prompt));

  try {
    const response = await callAIProvider(
      AI_PROVIDERS[aiConfig.selectedProvider],
      aiConfig.apiKeys[aiConfig.selectedProvider],
      prompt
    );

    // Add professional document header and footer
    let processedContent = response.content;

    // Add document control header if not present
    if (
      !processedContent.includes("Document Control") &&
      !processedContent.includes("DOCUMENT CONTROL")
    ) {
      const documentHeader = `
DOCUMENT CONTROL
================
Document Title: ${documentName}
Document Type: ${documentType}
Company: ${aiConfig.companyInfo.name || "Your Company"}
Version: 1.0
Effective Date: ${new Date().toLocaleDateString("en-AU")}
Review Date: ${new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000
      ).toLocaleDateString("en-AU")}
Approved By: [Name] _________________ Date: _________
Position: [Title] _________________ Signature: _________

================================================================================

`;
      processedContent = documentHeader + processedContent;
    }

    // Add document footer
    const documentNumber = generateDocumentNumber(documentType);
    const documentFooter = `

================================================================================
Document Number: ${documentNumber}
Revision: 1.0
Date: ${new Date().toLocaleDateString("en-AU")}
Page: [Page] of [Total Pages]

CONFIDENTIAL - Property of ${aiConfig.companyInfo.name || "Your Company"}
This document is controlled and may not be copied or distributed without authorization.
================================================================================`;

    processedContent += documentFooter;

    return {
      success: true,
      content: processedContent,
      metadata: {
        provider: aiConfig.selectedProvider,
        model: AI_PROVIDERS[aiConfig.selectedProvider].model,
        tokensUsed:
          response.tokensUsed || estimateTokens(prompt + processedContent),
        estimatedCost:
          (response.tokensUsed || estimateTokens(prompt + processedContent)) *
          AI_PROVIDERS[aiConfig.selectedProvider].costPerToken,
        generatedAt: new Date().toISOString(),
        documentType: documentType,
        companyInfo: aiConfig.companyInfo,
        wordCount: processedContent.split(" ").length,
        enhancedVersion: true,
        documentNumber: documentNumber,
      },
    };
  } catch (error) {
    console.error("AI generation error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Helper function to generate document numbers
function generateDocumentNumber(documentType) {
  const typeMap = {
    SWMS: "SWMS",
    "Risk Assessment": "RA",
    "Safety Policy": "POL",
    "Emergency Procedure": "EP",
    "Training Manual": "TM",
    "Work Procedure": "WP",
  };

  const prefix = typeMap[documentType] || "DOC";
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");

  return `${prefix}-${timestamp}-${random}`;
}

// Helper function to estimate tokens
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

async function callAIProvider(provider, apiKey, prompt) {
  const fetch = require("node-fetch");

  let requestBody, headers, url;

  if (provider.name.includes("OpenAI") || provider.name.includes("DeepSeek")) {
    // OpenAI-compatible format
    url = provider.endpoint;
    headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    requestBody = {
      model: provider.model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert EHS (Environment, Health & Safety) consultant specializing in Australian workplace safety regulations and documentation. Create professional, compliant safety documents.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 4000,
      temperature: 0.3,
    };
  } else if (provider.name.includes("Claude")) {
    // Anthropic format
    url = provider.endpoint;
    headers = {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    };
    requestBody = {
      model: provider.model,
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `You are an expert EHS consultant. ${prompt}`,
        },
      ],
    };
  } else if (provider.name.includes("Gemini")) {
    // Google Gemini format
    url = `${provider.endpoint}?key=${apiKey}`;
    headers = {
      "Content-Type": "application/json",
    };
    requestBody = {
      contents: [
        {
          parts: [
            {
              text: `You are an expert EHS consultant specializing in Australian workplace safety. ${prompt}`,
            },
          ],
        },
      ],
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`AI API Error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();

    // Extract content based on provider
    let content;
    let tokensUsed;

    if (data.choices && data.choices[0]) {
      // OpenAI/DeepSeek format
      content = data.choices[0].message.content;
      tokensUsed = data.usage?.total_tokens;
    } else if (data.content && data.content[0]) {
      // Anthropic format
      content = data.content[0].text;
      tokensUsed = data.usage?.output_tokens + data.usage?.input_tokens;
    } else if (data.candidates && data.candidates[0]) {
      // Gemini format
      content = data.candidates[0].content.parts[0].text;
      tokensUsed = data.usageMetadata?.totalTokenCount;
    } else {
      throw new Error("Unexpected API response format");
    }

    return { content, tokensUsed };
  } catch (error) {
    console.error("AI Provider call failed:", error);
    throw error;
  }
}

// ========================================
// MAIN ROUTES
// ========================================

app.get("/", (req, res) => {
  try {
    res.render("index", {
      title: "IMS Document Management System",
      docsCount: documentIndex.length,
      lastUpdated: fs.existsSync(DB_PATH)
        ? moment(fs.readJsonSync(DB_PATH).lastUpdated).format(
            "YYYY-MM-DD HH:mm:ss"
          )
        : "Never",
    });
  } catch (err) {
    console.error("Error rendering index:", err);
    res.status(500).send("Error loading homepage");
  }
});

app.get("/documents", (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const visibleDocuments = documentIndex.filter(
      (doc) => !shouldHideFolder(doc.folder)
    );
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const results = {
      totalDocuments: visibleDocuments.length,
      totalPages: Math.ceil(visibleDocuments.length / limit),
      currentPage: page,
      documents: visibleDocuments.slice(startIndex, endIndex),
    };

    res.render("documents", {
      title: "All Documents",
      results,
      moment,
    });
  } catch (err) {
    console.error("Error rendering documents:", err);
    res.status(500).send("Error loading documents");
  }
});

// Add this to your app.js file
app.get("/api/mandatory-record-settings/:recordType", (req, res) => {
  try {
    const recordType = req.params.recordType;
    const mandatoryRecords = loadMandatoryRecords();

    if (mandatoryRecords[recordType]) {
      res.json({
        success: true,
        settings: {
          description: mandatoryRecords[recordType].description,
          keywords: mandatoryRecords[recordType].autoDetectKeywords || [],
        },
      });
    } else {
      res.json({
        success: false,
        message: "Record type not found",
      });
    }
  } catch (error) {
    console.error("Error loading mandatory record settings:", error);
    res.json({
      success: false,
      message: "Server error",
    });
  }
});

app.get("/search", (req, res) => {
  try {
    const query = req.query.q || "";
    let results = [];

    if (query.trim() !== "" && searchIndex) {
      try {
        const searchResults = searchIndex.search(query);
        results = searchResults
          .map((result) => {
            return documentIndex.find((doc) => doc.id === result.ref);
          })
          .filter((doc) => doc && !shouldHideFolder(doc.folder));
      } catch (err) {
        console.error("Search error:", err);
        results = [];
      }
    }

    res.render("search", {
      title: "Search Results",
      query,
      results,
      resultsCount: results.length,
      moment,
    });
  } catch (err) {
    console.error("Error rendering search:", err);
    res.status(500).send("Error performing search");
  }
});

app.get("/document/:id", (req, res) => {
  try {
    const document = documentIndex.find((doc) => doc.id === req.params.id);

    if (!document) {
      return res.status(404).render("error", {
        title: "Document Not Found",
        message: "The requested document could not be found",
      });
    }

    res.render("document-details", {
      title: document.name,
      document,
      moment,
    });
  } catch (err) {
    console.error("Error rendering document details:", err);
    res.status(500).send("Error loading document details");
  }
});

// Executive Reporting Route
app.get("/reports", (req, res) => {
  try {
    res.render("reports", {
      title: "Executive Reports",
      reportTemplates: REPORT_TEMPLATES,
    });
  } catch (err) {
    console.error("Error loading reports page:", err);
    res.status(500).send("Error loading reports");
  }
});

// Generate Report API
app.post("/api/generate-report", express.json(), async (req, res) => {
  try {
    const { reportType, options } = req.body;

    console.log("Generating report:", reportType);

    const reportData = await generateComplianceReport(reportType, options);

    // Generate HTML report
    const reportHtml = await generateReportHTML(reportData, reportType);

    res.json({
      success: true,
      reportData: reportData,
      reportHtml: reportHtml,
    });
  } catch (error) {
    console.error("Error generating report:", error);
    res.json({
      success: false,
      message: error.message,
    });
  }
});

// Helper function to generate HTML report
// Replace the generateReportHTML function in your app.js with this enhanced version

async function generateReportHTML(reportData, reportType) {
  const { metadata, metrics, gaps, risks, actionPlan, recommendations } =
    reportData;

  // Different report templates based on type
  switch (reportType) {
    case "compliance-audit":
      return generateComplianceAuditHTML(reportData);
    case "regulatory-readiness":
      return generateRegulatoryReadinessHTML(reportData);
    case "management-dashboard":
      return generateManagementDashboardHTML(reportData);
    default:
      return generateComplianceAuditHTML(reportData);
  }
}

function generateComplianceAuditHTML(reportData) {
  const { metadata, metrics, gaps, risks, actionPlan, recommendations } =
    reportData;

  return `
    <div class="executive-report">
      <div class="report-header">
        <h1>${metadata.companyName} - Compliance Audit Report</h1>
        <div class="report-meta">
          <p><strong>Audit Date:</strong> ${new Date(
            metadata.generatedDate
          ).toLocaleDateString()}</p>
          <p><strong>Industry:</strong> ${
            metadata.industry
          } | <strong>Jurisdiction:</strong> ${metadata.jurisdiction}</p>
          <p><strong>Standards:</strong> ${metadata.standards.join(", ")}</p>
        </div>
      </div>
      
      <div class="executive-summary">
        <h2>🎯 Executive Summary</h2>
        <div class="score-card">
          <div class="metric-box ${metrics.overall.rating.toLowerCase()}">
            <h3>${metrics.overall.score}%</h3>
            <p>Overall Compliance</p>
            <span class="rating">${metrics.overall.rating}</span>
          </div>
          <div class="metric-box">
            <h3>${gaps.critical.length}</h3>
            <p>Critical Gaps</p>
            <span class="risk-level high">High Priority</span>
          </div>
          <div class="metric-box">
            <h3>${actionPlan.totalActions}</h3>
            <p>Action Items</p>
            <span class="status">Ready to Address</span>
          </div>
          <div class="metric-box">
            <h3>${metrics.documents.linked}/${metrics.documents.total}</h3>
            <p>Documents Linked</p>
            <span class="progress">${Math.round(
              (metrics.documents.linked / metrics.documents.total) * 100
            )}% Complete</span>
          </div>
        </div>
        
        <div class="key-findings">
          <h3>🔍 Key Audit Findings</h3>
          <ul>
            <li><strong>Document Coverage:</strong> ${
              metrics.documents.score
            }% of required documents are present and current</li>
            <li><strong>Mandatory Records:</strong> ${
              metrics.mandatory.compliant
            }/${
    metrics.mandatory.total
  } mandatory record types have appropriate documentation</li>
            <li><strong>Critical Priorities:</strong> ${
              actionPlan.immediate.length
            } items require immediate attention (1-2 weeks)</li>
            <li><strong>Compliance Status:</strong> ${
              metrics.overall.status
            } - ${getComplianceRecommendation(metrics.overall.score)}</li>
          </ul>
        </div>
      </div>
      
      <div class="detailed-analysis">
        <h2>📊 Detailed Gap Analysis</h2>
        ${generateGapAnalysisHTML(gaps)}
      </div>
      
      <div class="action-plan">
        <h2>📋 Recommended Action Plan</h2>
        ${generateActionPlanHTML(actionPlan)}
      </div>
      
      <div class="risk-assessment">
        <h2>⚠️ Risk Assessment</h2>
        ${generateRiskAssessmentHTML(risks)}
      </div>
      
      ${
        recommendations.available
          ? `
        <div class="ai-recommendations">
          <h2>🤖 AI Strategic Recommendations</h2>
          <div class="recommendations-content">
            ${recommendations.content.replace(/\n/g, "<br>")}
          </div>
        </div>
      `
          : ""
      }
      
      <div class="appendix">
        <h2>📎 Appendix</h2>
        <h3>Methodology</h3>
        <p>This audit was conducted using SafetySync Pro's automated compliance analysis system, cross-referencing your documentation against ${metadata.standards.join(
          ", "
        )} requirements.</p>
        
        <h3>Document Categories Analyzed</h3>
        <ul>
          <li>Safety Management System documentation</li>
          <li>Mandatory regulatory records</li>
          <li>Work procedures and safe work method statements</li>
          <li>Training and competency records</li>
          <li>Risk assessments and controls</li>
        </ul>
      </div>
      
      <div class="report-footer">
        <hr>
        <p><small>Generated by SafetySync Pro on ${new Date().toLocaleDateString()} | Confidential Report for ${
    metadata.companyName
  }</small></p>
      </div>
    </div>
    ${getReportCSS()}
  `;
}

function generateRegulatoryReadinessHTML(reportData) {
  const { metadata, metrics, gaps, risks, actionPlan } = reportData;

  return `
    <div class="executive-report">
      <div class="report-header">
        <h1>${metadata.companyName} - Regulatory Readiness Assessment</h1>
        <div class="report-meta">
          <p><strong>Assessment Date:</strong> ${new Date(
            metadata.generatedDate
          ).toLocaleDateString()}</p>
          <p><strong>Jurisdiction:</strong> ${
            metadata.jurisdiction
          } | <strong>Industry:</strong> ${metadata.industry}</p>
          <p><strong>Next Audit:</strong> <span class="highlight">Preparation recommendations below</span></p>
        </div>
      </div>
      
      <div class="readiness-summary">
        <h2>🎯 Regulatory Readiness Status</h2>
        
        <div class="readiness-score">
          <div class="large-metric">
            <h1>${getReadinessScore(metrics)}%</h1>
            <p>Audit Readiness Score</p>
            <span class="readiness-level ${getReadinessLevel(
              metrics
            )}">${getReadinessLabel(metrics)}</span>
          </div>
        </div>
        
        <div class="readiness-breakdown">
          <div class="row">
            <div class="col-md-3">
              <div class="metric-card">
                <h4>${metrics.mandatory.score}%</h4>
                <p>Mandatory Records</p>
                <small>${metrics.mandatory.compliant}/${
    metrics.mandatory.total
  } complete</small>
              </div>
            </div>
            <div class="col-md-3">
              <div class="metric-card">
                <h4>${metrics.documents.score}%</h4>
                <p>Documentation</p>
                <small>${metrics.documents.linked} documents linked</small>
              </div>
            </div>
            <div class="col-md-3">
              <div class="metric-card">
                <h4>${gaps.critical.length}</h4>
                <p>Critical Gaps</p>
                <small>Must address before audit</small>
              </div>
            </div>
            <div class="col-md-3">
              <div class="metric-card">
                <h4>${calculateTimeToReady(gaps)}d</h4>
                <p>Est. Time to Ready</p>
                <small>Based on current gaps</small>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="audit-preparation">
        <h2>📋 Audit Preparation Checklist</h2>
        
        <div class="preparation-timeline">
          <h3>🚨 Before Next Audit (Critical - Complete First)</h3>
          <ul class="checklist">
            ${gaps.critical
              .map(
                (gap) => `
              <li class="critical-item">
                <i class="fas fa-exclamation-triangle text-danger"></i>
                <strong>${gap.description}</strong>
                <span class="timeline">Complete within 1-2 weeks</span>
              </li>
            `
              )
              .join("")}
          </ul>
          
          <h3>⚠️ High Priority Items</h3>
          <ul class="checklist">
            ${gaps.high
              .slice(0, 8)
              .map(
                (gap) => `
              <li class="high-item">
                <i class="fas fa-exclamation-circle text-warning"></i>
                ${gap.description}
                <span class="timeline">Complete within 2-4 weeks</span>
              </li>
            `
              )
              .join("")}
          </ul>
          
          <h3>✅ Strengths to Highlight During Audit</h3>
          <ul class="strengths">
            <li><i class="fas fa-check-circle text-success"></i> ${
              metrics.documents.linked
            } comprehensive safety documents in place</li>
            <li><i class="fas fa-check-circle text-success"></i> ${
              metrics.mandatory.compliant
            } mandatory record types properly maintained</li>
            <li><i class="fas fa-check-circle text-success"></i> Systematic approach to compliance management demonstrated</li>
          </ul>
        </div>
      </div>
      
      <div class="regulator-focus">
        <h2>🎯 Likely Auditor Focus Areas</h2>
        <div class="focus-areas">
          ${generateRegulatorFocusAreas(metadata.jurisdiction, gaps)}
        </div>
      </div>
      
      <div class="preparation-timeline">
        <h2>📅 30-Day Preparation Timeline</h2>
        ${generatePreparationTimeline(actionPlan)}
      </div>
      
      <div class="report-footer">
        <hr>
        <p><small>Generated by SafetySync Pro on ${new Date().toLocaleDateString()} | Regulatory Readiness Assessment for ${
    metadata.companyName
  }</small></p>
      </div>
    </div>
    ${getReportCSS()}
  `;
}

function generateManagementDashboardHTML(reportData) {
  const { metadata, metrics, gaps, risks } = reportData;

  return `
    <div class="executive-report">
      <div class="report-header">
        <h1>${metadata.companyName} - Management Dashboard</h1>
        <div class="report-meta">
          <p><strong>Report Date:</strong> ${new Date(
            metadata.generatedDate
          ).toLocaleDateString()}</p>
          <p><strong>Executive Summary</strong> | ${
            metadata.industry
          } Industry | ${metadata.jurisdiction}</p>
        </div>
      </div>
      
      <div class="kpi-dashboard">
        <h2>📊 Key Performance Indicators</h2>
        
        <div class="dashboard-metrics">
          <div class="kpi-row">
            <div class="kpi-card overall">
              <div class="kpi-value">${metrics.overall.score}%</div>
              <div class="kpi-label">Overall Compliance</div>
              <div class="kpi-trend ${getTrendDirection(
                metrics.overall.score
              )}">
                <i class="fas fa-arrow-${getTrendDirection(
                  metrics.overall.score
                )}"></i>
                ${metrics.overall.rating}
              </div>
            </div>
            
            <div class="kpi-card documents">
              <div class="kpi-value">${metrics.documents.linked}</div>
              <div class="kpi-label">Documents Managed</div>
              <div class="kpi-subtitle">${
                metrics.documents.total
              } total identified</div>
            </div>
            
            <div class="kpi-card risks">
              <div class="kpi-value">${risks.length}</div>
              <div class="kpi-label">Active Risk Areas</div>
              <div class="kpi-subtitle">${gaps.critical.length} critical</div>
            </div>
            
            <div class="kpi-card efficiency">
              <div class="kpi-value">${calculateEfficiencyScore(metrics)}%</div>
              <div class="kpi-label">System Efficiency</div>
              <div class="kpi-subtitle">Documentation completeness</div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="executive-insights">
        <h2>💡 Executive Insights</h2>
        
        <div class="insight-cards">
          <div class="insight-card positive">
            <h4><i class="fas fa-thumbs-up text-success"></i> Strengths</h4>
            <ul>
              <li>${
                metrics.documents.score
              }% of required documentation is current and accessible</li>
              <li>Systematic approach to safety management is evident</li>
              <li>Strong foundation for regulatory compliance established</li>
            </ul>
          </div>
          
          <div class="insight-card attention">
            <h4><i class="fas fa-exclamation-triangle text-warning"></i> Requires Attention</h4>
            <ul>
              ${gaps.critical
                .slice(0, 3)
                .map((gap) => `<li>${gap.description}</li>`)
                .join("")}
              ${
                gaps.critical.length > 3
                  ? `<li>Plus ${
                      gaps.critical.length - 3
                    } additional critical items</li>`
                  : ""
              }
            </ul>
          </div>
          
          <div class="insight-card strategic">
            <h4><i class="fas fa-rocket text-info"></i> Strategic Opportunities</h4>
            <ul>
              <li>Automation potential: ${calculateAutomationPotential(
                gaps
              )}% of gaps can be AI-generated</li>
              <li>Cost savings: Estimated $${calculateCostSavings(
                gaps
              )} in consultant fees avoided</li>
              <li>Time efficiency: ${calculateTimeSavings(
                gaps
              )} weeks faster than manual approach</li>
            </ul>
          </div>
        </div>
      </div>
      
      <div class="financial-impact">
        <h2>💰 Financial Impact Analysis</h2>
        
        <div class="financial-summary">
          <div class="cost-benefit">
            <h4>Cost Avoidance</h4>
            <div class="financial-metric">
              <span class="amount">$${calculateCostAvoidance(
                gaps,
                risks
              )}</span>
              <span class="description">Potential penalties avoided</span>
            </div>
          </div>
          
          <div class="investment-required">
            <h4>Investment Required</h4>
            <div class="financial-metric">
              <span class="amount">$${calculateInvestmentRequired(gaps)}</span>
              <span class="description">To achieve full compliance</span>
            </div>
          </div>
          
          <div class="roi-analysis">
            <h4>Return on Investment</h4>
            <div class="financial-metric">
              <span class="amount">${calculateROI(gaps, risks)}%</span>
              <span class="description">Expected ROI within 12 months</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="action-priorities">
        <h2>🎯 Top 5 Management Priorities</h2>
        <div class="priority-list">
          ${generateTopPriorities(gaps, risks)
            .map(
              (priority, index) => `
            <div class="priority-item">
              <div class="priority-number">${index + 1}</div>
              <div class="priority-content">
                <h4>${priority.title}</h4>
                <p>${priority.description}</p>
                <div class="priority-meta">
                  <span class="timeline">Timeline: ${priority.timeline}</span>
                  <span class="impact">Impact: ${priority.impact}</span>
                </div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
      
      <div class="trend-analysis">
        <h2>📈 Trend Analysis</h2>
        <div class="trends">
          <div class="trend-item">
            <h4>Documentation Trends</h4>
            <p>Current trajectory shows ${getTrendAnalysis(
              metrics
            )} compliance improvement over next quarter.</p>
          </div>
          <div class="trend-item">
            <h4>Risk Profile</h4>
            <p>Risk exposure is ${getRiskTrend(risks)} with ${
    gaps.critical.length
  } critical items requiring immediate attention.</p>
          </div>
        </div>
      </div>
      
      <div class="report-footer">
        <hr>
        <p><small>Generated by SafetySync Pro on ${new Date().toLocaleDateString()} | Management Dashboard for ${
    metadata.companyName
  }</small></p>
      </div>
    </div>
    ${getDashboardCSS()}
  `;
}

// Helper functions for report generation
function getComplianceRecommendation(score) {
  if (score >= 90) return "Excellent compliance posture maintained";
  if (score >= 80) return "Strong compliance with minor gaps to address";
  if (score >= 70)
    return "Satisfactory compliance requiring focused improvement";
  if (score >= 60) return "Compliance gaps requiring immediate attention";
  return "Critical compliance deficiencies requiring urgent action";
}

function getReadinessScore(metrics) {
  return Math.round((metrics.overall.score + metrics.mandatory.score) / 2);
}

function getReadinessLevel(metrics) {
  const score = getReadinessScore(metrics);
  if (score >= 85) return "ready";
  if (score >= 70) return "nearly-ready";
  return "needs-work";
}

function getReadinessLabel(metrics) {
  const score = getReadinessScore(metrics);
  if (score >= 85) return "Audit Ready";
  if (score >= 70) return "Nearly Ready";
  return "Needs Preparation";
}

function calculateTimeToReady(gaps) {
  const criticalDays = gaps.critical.length * 7; // 1 week per critical
  const highDays = gaps.high.length * 3; // 3 days per high
  return Math.min(criticalDays + highDays, 90); // Cap at 90 days
}

function generateRegulatorFocusAreas(jurisdiction, gaps) {
  const focusAreas = {
    victoria: [
      "WorkSafe Victoria compliance documentation",
      "Electrical safety procedures and certifications",
      "Training records and competency assessments",
      "Incident reporting and investigation procedures",
    ],
  };

  const areas = focusAreas[jurisdiction] || focusAreas.victoria;

  return areas
    .map(
      (area) => `
    <div class="focus-area">
      <h4><i class="fas fa-crosshairs"></i> ${area}</h4>
      <p>Ensure all documentation is current and accessible for auditor review.</p>
    </div>
  `
    )
    .join("");
}

function generatePreparationTimeline(actionPlan) {
  return `
    <div class="timeline">
      <div class="timeline-item week1">
        <h4>Week 1-2: Critical Items</h4>
        <ul>
          ${actionPlan.immediate
            .slice(0, 3)
            .map((action) => `<li>${action.description}</li>`)
            .join("")}
        </ul>
      </div>
      <div class="timeline-item week3">
        <h4>Week 3-4: High Priority</h4>
        <ul>
          ${actionPlan.shortTerm
            .slice(0, 3)
            .map((action) => `<li>${action.description}</li>`)
            .join("")}
        </ul>
      </div>
    </div>
  `;
}

function calculateEfficiencyScore(metrics) {
  return Math.round((metrics.documents.score + metrics.mandatory.score) / 2);
}

function getTrendDirection(score) {
  if (score >= 80) return "up";
  if (score >= 60) return "right";
  return "down";
}

function calculateAutomationPotential(gaps) {
  const automatable = [...gaps.critical, ...gaps.high, ...gaps.medium].filter(
    (gap) => gap.aiGenerable
  ).length;
  const total = gaps.critical.length + gaps.high.length + gaps.medium.length;
  return total > 0 ? Math.round((automatable / total) * 100) : 0;
}

function calculateCostSavings(gaps) {
  const aiGenerable = [...gaps.critical, ...gaps.high].filter(
    (gap) => gap.aiGenerable
  ).length;
  return (aiGenerable * 500).toLocaleString(); // $500 per document
}

function calculateTimeSavings(gaps) {
  const totalGaps = gaps.critical.length + gaps.high.length;
  return Math.round(totalGaps * 0.5); // 0.5 weeks per gap
}

function calculateCostAvoidance(gaps, risks) {
  const criticalRisk = gaps.critical.length * 10000; // $10k per critical gap
  const highRisk = gaps.high.length * 5000; // $5k per high gap
  return (criticalRisk + highRisk).toLocaleString();
}

function calculateInvestmentRequired(gaps) {
  const immediate = gaps.critical.length * 2000; // $2k per critical
  const shortTerm = gaps.high.length * 1000; // $1k per high
  return (immediate + shortTerm).toLocaleString();
}

function calculateROI(gaps, risks) {
  const investment = gaps.critical.length * 2000 + gaps.high.length * 1000;
  const savings = gaps.critical.length * 10000 + gaps.high.length * 5000;
  return investment > 0
    ? Math.round(((savings - investment) / investment) * 100)
    : 0;
}

function generateTopPriorities(gaps, risks) {
  const priorities = [];

  if (gaps.critical.length > 0) {
    priorities.push({
      title: "Address Critical Compliance Gaps",
      description: `${gaps.critical.length} critical gaps require immediate attention to avoid regulatory penalties`,
      timeline: "1-2 weeks",
      impact: "High",
    });
  }

  if (gaps.high.length > 5) {
    priorities.push({
      title: "Systematic Documentation Review",
      description:
        "Implement systematic approach to address multiple documentation gaps",
      timeline: "2-4 weeks",
      impact: "Medium",
    });
  }

  priorities.push({
    title: "Establish Ongoing Monitoring",
    description:
      "Set up systems to maintain compliance and track document updates",
    timeline: "4-6 weeks",
    impact: "Medium",
  });

  priorities.push({
    title: "Staff Training on New Procedures",
    description:
      "Ensure all personnel are trained on updated safety procedures",
    timeline: "6-8 weeks",
    impact: "Medium",
  });

  priorities.push({
    title: "Prepare for Next Audit Cycle",
    description:
      "Establish audit readiness protocols and documentation standards",
    timeline: "8-12 weeks",
    impact: "Low",
  });

  return priorities.slice(0, 5);
}

function getTrendAnalysis(metrics) {
  if (metrics.overall.score >= 80) return "steady";
  if (metrics.overall.score >= 60) return "moderate";
  return "significant";
}

function getRiskTrend(risks) {
  if (risks.length <= 2) return "manageable";
  if (risks.length <= 5) return "elevated";
  return "high";
}

function generateGapAnalysisHTML(gaps) {
  return `
    <div class="gap-analysis-section">
      ${
        gaps.critical.length > 0
          ? `
        <div class="gap-category critical">
          <h3>🚨 Critical Gaps (${gaps.critical.length})</h3>
          <div class="gap-items">
            ${gaps.critical
              .map(
                (gap) => `
              <div class="gap-item">
                <h4>${gap.description}</h4>
                <div class="gap-meta">
                  <span class="impact">Impact: ${gap.impact}</span>
                  <span class="effort">Effort: ${gap.effort}</span>
                  ${
                    gap.aiGenerable
                      ? '<span class="ai-badge">AI Generable</span>'
                      : ""
                  }
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `
          : ""
      }
      
      ${
        gaps.high.length > 0
          ? `
        <div class="gap-category high">
          <h3>⚠️ High Priority Gaps (${gaps.high.length})</h3>
          <div class="gap-items">
            ${gaps.high
              .slice(0, 8)
              .map(
                (gap) => `
              <div class="gap-item">
                <h4>${gap.description}</h4>
                <div class="gap-meta">
                  <span class="impact">Impact: ${gap.impact}</span>
                  <span class="effort">Effort: ${gap.effort}</span>
                  ${
                    gap.aiGenerable
                      ? '<span class="ai-badge">AI Generable</span>'
                      : ""
                  }
                </div>
              </div>
            `
              )
              .join("")}
            ${
              gaps.high.length > 8
                ? `<p class="more-items">... and ${
                    gaps.high.length - 8
                  } more high priority items</p>`
                : ""
            }
          </div>
        </div>
      `
          : ""
      }
    </div>
  `;
}

function generateActionPlanHTML(actionPlan) {
  return `
    <div class="action-sections">
      <div class="action-section immediate">
        <h3>⚡ Immediate Actions (1-2 weeks)</h3>
        <div class="action-table">
          <table>
            <thead>
              <tr><th>Action</th><th>Timeline</th><th>Owner</th><th>AI Assist</th></tr>
            </thead>
            <tbody>
              ${actionPlan.immediate
                .map(
                  (action) => `
                <tr>
                  <td>${action.description}</td>
                  <td>${action.timeline}</td>
                  <td>${action.responsibility}</td>
                  <td>${action.aiAssisted ? "✅" : "❌"}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
      
      <div class="action-section short-term">
        <h3>📅 Short-term Actions (2-4 weeks)</h3>
        <div class="action-table">
          <table>
            <thead>
              <tr><th>Action</th><th>Timeline</th><th>Owner</th><th>AI Assist</th></tr>
            </thead>
            <tbody>
              ${actionPlan.shortTerm
                .map(
                  (action) => `
                <tr>
                  <td>${action.description}</td>
                  <td>${action.timeline}</td>
                  <td>${action.responsibility}</td>
                  <td>${action.aiAssisted ? "✅" : "❌"}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function generateRiskAssessmentHTML(risks) {
  return `
    <div class="risk-assessment">
      ${risks
        .map(
          (risk) => `
        <div class="risk-item ${risk.level.toLowerCase()}">
          <h4><i class="fas fa-exclamation-triangle"></i> ${
            risk.description
          }</h4>
          <div class="risk-details">
            <span class="likelihood">Likelihood: ${risk.likelihood}</span>
            <span class="consequence">Consequence: ${risk.consequence}</span>
            <span class="level">Level: ${risk.level}</span>
          </div>
          <p class="mitigation"><strong>Mitigation:</strong> ${
            risk.mitigation
          }</p>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function getReportCSS() {
  return `
    <style>
      .executive-report { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; line-height: 1.6; }
      .report-header { border-bottom: 3px solid #667eea; padding-bottom: 20px; margin-bottom: 30px; }
      .report-header h1 { color: #2c3e50; margin-bottom: 10px; }
      .score-card { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
      .metric-box { background: #f8f9ff; padding: 20px; border-radius: 8px; text-align: center; flex: 1; min-width: 200px; }
      .metric-box.excellent { background: #d4edda; border-left: 4px solid #28a745; }
      .metric-box.good { background: #d1ecf1; border-left: 4px solid #17a2b8; }
      .metric-box.satisfactory { background: #fff3cd; border-left: 4px solid #ffc107; }
      .metric-box.critical { background: #f8d7da; border-left: 4px solid #dc3545; }
      .metric-box h3 { font-size: 2rem; margin: 0; color: #667eea; }
      .gap-category.critical { background: #f8d7da; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #dc3545; }
      .gap-category.high { background: #fff3cd; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ffc107; }
      .gap-item { margin: 15px 0; padding: 15px; background: white; border-radius: 6px; }
      .gap-meta { margin-top: 10px; }
      .gap-meta span { display: inline-block; margin-right: 15px; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
      .impact { background: #e9ecef; }
      .effort { background: #f8f9fa; }
      .ai-badge { background: #d4edda; color: #155724; }
      .action-table table { width: 100%; border-collapse: collapse; margin: 15px 0; }
      .action-table th, .action-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
      .action-table th { background: #667eea; color: white; }
      .risk-item { margin: 15px 0; padding: 15px; border-radius: 6px; }
      .risk-item.critical { background: #f8d7da; border-left: 4px solid #dc3545; }
      .risk-item.high { background: #fff3cd; border-left: 4px solid #ffc107; }
      .risk-details span { margin-right: 15px; font-weight: bold; }
      .readiness-score { text-align: center; margin: 30px 0; }
      .large-metric h1 { font-size: 4rem; margin: 0; color: #667eea; }
      .readiness-level.ready { color: #28a745; background: #d4edda; padding: 8px 16px; border-radius: 20px; }
      .readiness-level.nearly-ready { color: #ffc107; background: #fff3cd; padding: 8px 16px; border-radius: 20px; }
      .readiness-level.needs-work { color: #dc3545; background: #f8d7da; padding: 8px 16px; border-radius: 20px; }
      .checklist li { margin: 8px 0; padding: 8px; border-left: 3px solid #ddd; }
      .critical-item { border-left-color: #dc3545 !important; background: #f8d7da; }
      .high-item { border-left-color: #ffc107 !important; background: #fff3cd; }
      .strengths li { border-left-color: #28a745 !important; background: #d4edda; }
      .timeline { font-size: 0.8em; color: #6c757d; margin-left: 10px; }
      .focus-area { margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 6px; }
      @media print { 
        .executive-report { max-width: none; } 
        .score-card { display: block; }
        .metric-box { display: inline-block; width: 23%; margin: 1%; }
      }
    </style>
  `;
}

function getDashboardCSS() {
  return `
    <style>
      .executive-report { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; line-height: 1.6; }
      .kpi-row { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
      .kpi-card { background: white; border: 2px solid #e9ecef; border-radius: 12px; padding: 25px; text-align: center; flex: 1; min-width: 200px; position: relative; }
      .kpi-card.overall { border-color: #667eea; background: linear-gradient(135deg, #f8f9ff 0%, #e3f2fd 100%); }
      .kpi-value { font-size: 2.5rem; font-weight: bold; color: #2c3e50; margin-bottom: 8px; }
      .kpi-label { font-size: 1.1rem; color: #6c757d; margin-bottom: 5px; }
      .kpi-subtitle { font-size: 0.9rem; color: #adb5bd; }
      .kpi-trend { position: absolute; top: 15px; right: 15px; }
      .insight-cards { display: flex; gap: 20px; flex-wrap: wrap; }
      .insight-card { flex: 1; min-width: 300px; padding: 20px; border-radius: 8px; }
      .insight-card.positive { background: #d4edda; border-left: 4px solid #28a745; }
      .insight-card.attention { background: #fff3cd; border-left: 4px solid #ffc107; }
      .insight-card.strategic { background: #d1ecf1; border-left: 4px solid #17a2b8; }
      .financial-summary { display: flex; gap: 30px; justify-content: space-around; margin: 20px 0; }
      .financial-metric .amount { display: block; font-size: 2rem; font-weight: bold; color: #28a745; }
      .priority-list { margin: 20px 0; }
      .priority-item { display: flex; align-items: flex-start; margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px; }
      .priority-number { width: 40px; height: 40px; background: #667eea; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 20px; }
      .priority-content h4 { margin: 0 0 10px 0; color: #2c3e50; }
      .priority-meta { margin-top: 10px; }
      .priority-meta span { margin-right: 20px; padding: 4px 8px; background: white; border-radius: 4px; font-size: 0.9em; }
      .trends { display: flex; gap: 30px; }
      .trend-item { flex: 1; padding: 20px; background: #f8f9fa; border-radius: 8px; }
    </style>
  `;
}

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} = require("docx");

function generateDocumentNumber(documentType) {
  const typeMap = {
    SWMS: "SWMS",
    "Risk Assessment": "RA",
    "Safety Policy": "POL",
    "Emergency Procedure": "EP",
    "Training Manual": "TM",
    "Work Procedure": "WP",
  };

  const prefix = typeMap[documentType] || "DOC";
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");

  return `${prefix}-${timestamp}-${random}`;
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// Enhanced createWordDocument function with better formatting
function createWordDocument(content, metadata) {
  try {
    // Ensure content is a string
    if (typeof content !== "string") {
      content = String(content || "");
    }

    // Clean up the content first - remove the document control headers/footers that are already formatted
    content = content.replace(
      /DOCUMENT CONTROL[\s\S]*?================================================================================/,
      ""
    );
    content = content.replace(
      /================================================================================[\s\S]*?================================================================================/g,
      ""
    );

    // Convert content to paragraphs with better formatting
    const lines = content.split("\n");
    const paragraphs = [];

    // Add a professional title page
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: metadata?.documentType || "Work Procedure",
            bold: true,
            size: 36,
            color: "2F5597",
          }),
        ],
        heading: HeadingLevel.TITLE,
        spacing: { after: 300 },
        alignment: "center",
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: metadata?.companyInfo?.name || "Company Name",
            bold: true,
            size: 24,
            color: "666666",
          }),
        ],
        spacing: { after: 600 },
        alignment: "center",
      })
    );

    // Add document information table
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Document Information",
            bold: true,
            size: 20,
          }),
        ],
        spacing: { before: 400, after: 200 },
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Document Number: ${metadata?.documentNumber || "DOC-001"}`,
            size: 18,
          }),
        ],
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Generated: ${new Date().toLocaleDateString("en-AU")}`,
            size: 18,
          }),
        ],
      })
    );

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Version: 1.0`,
            size: 18,
          }),
        ],
        spacing: { after: 400 },
      })
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Skip empty lines at the start or lines that are just dashes
      if (trimmedLine === "" || trimmedLine === "---" || trimmedLine === "--") {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: "", size: 22 })],
            spacing: { after: 200 },
          })
        );
        continue;
      }

      // Handle markdown formatting
      if (trimmedLine.startsWith("# **") && trimmedLine.endsWith("**")) {
        // Main heading with bold markdown
        const text = trimmedLine.replace(/^# \*\*/, "").replace(/\*\*$/, "");
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: text,
                bold: true,
                size: 32,
                color: "2F5597",
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 300 },
          })
        );
      } else if (
        trimmedLine.startsWith("## **") &&
        trimmedLine.endsWith("**")
      ) {
        // Sub heading with bold markdown
        const text = trimmedLine.replace(/^## \*\*/, "").replace(/\*\*$/, "");
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: text,
                bold: true,
                size: 24,
                color: "2F5597",
              }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 200 },
          })
        );
      } else if (
        trimmedLine.startsWith("### **") &&
        trimmedLine.endsWith("**")
      ) {
        // Sub-sub heading with bold markdown
        const text = trimmedLine.replace(/^### \*\*/, "").replace(/\*\*$/, "");
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: text,
                bold: true,
                size: 20,
                color: "2F5597",
              }),
            ],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 150 },
          })
        );
      } else if (trimmedLine.startsWith("# ")) {
        // Regular markdown heading
        const text = trimmedLine.substring(2);
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: text,
                bold: true,
                size: 28,
                color: "2F5597",
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          })
        );
      } else if (trimmedLine.startsWith("## ")) {
        // Regular markdown sub heading
        const text = trimmedLine.substring(3);
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: text,
                bold: true,
                size: 22,
                color: "2F5597",
              }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
          })
        );
      } else if (trimmedLine.startsWith("### ")) {
        // Regular markdown sub-sub heading
        const text = trimmedLine.substring(4);
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: text,
                bold: true,
                size: 20,
                color: "2F5597",
              }),
            ],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          })
        );
      } else if (trimmedLine.startsWith("- ") || trimmedLine.startsWith("* ")) {
        // Bullet points - handle bold text within bullets
        let bulletText = trimmedLine.substring(2);
        const textRuns = parseInlineFormatting(bulletText);

        paragraphs.push(
          new Paragraph({
            children: textRuns,
            bullet: { level: 0 },
            spacing: { after: 100 },
          })
        );
      } else if (trimmedLine.match(/^\d+\. /)) {
        // Numbered lists
        let listText = trimmedLine.replace(/^\d+\. /, "");
        const textRuns = parseInlineFormatting(listText);

        paragraphs.push(
          new Paragraph({
            children: textRuns,
            numbering: { reference: "default", level: 0 },
            spacing: { after: 100 },
          })
        );
      } else if (trimmedLine.startsWith("|") && trimmedLine.endsWith("|")) {
        // Table rows - convert to formatted text
        const cells = trimmedLine
          .split("|")
          .filter((cell) => cell.trim() !== "");
        const tableText = cells.join(" | ");

        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: tableText,
                size: 18,
                font: "Courier New", // Monospace for table-like appearance
              }),
            ],
            spacing: { after: 50 },
          })
        );
      } else if (trimmedLine.includes("**") || trimmedLine.includes("*")) {
        // Regular paragraph with inline formatting
        const textRuns = parseInlineFormatting(trimmedLine);
        paragraphs.push(
          new Paragraph({
            children: textRuns,
            spacing: { after: 150 },
          })
        );
      } else if (trimmedLine.length > 0) {
        // Regular paragraph
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: trimmedLine,
                size: 20,
              }),
            ],
            spacing: { after: 150 },
          })
        );
      }
    }

    // Create document with clean structure
    const doc = new Document({
      creator: "SafetySync Pro",
      title: metadata?.documentType || "Generated Document",
      description: `Generated by SafetySync Pro AI on ${new Date().toLocaleDateString()}`,
      sections: [
        {
          properties: {},
          children: paragraphs,
        },
      ],
    });

    return {
      writeFile: async (filepath) => {
        try {
          const buffer = await Packer.toBuffer(doc);
          fs.writeFileSync(filepath, buffer);
          console.log(
            `Enhanced Word document successfully created at: ${filepath}`
          );
        } catch (writeError) {
          console.error("Error writing Word document:", writeError);
          throw writeError;
        }
      },
    };
  } catch (error) {
    console.error("Error creating enhanced Word document:", error);

    // Fallback: create a simple document
    const fallbackDoc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: metadata?.documentType || "Generated Document",
                  bold: true,
                  size: 28,
                }),
              ],
              spacing: { after: 400 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text:
                    typeof content === "string"
                      ? content.replace(/\*\*/g, "").replace(/##/g, "")
                      : String(content),
                  size: 20,
                }),
              ],
            }),
          ],
        },
      ],
    });

    return {
      writeFile: async (filepath) => {
        const buffer = await Packer.toBuffer(fallbackDoc);
        fs.writeFileSync(filepath, buffer);
      },
    };
  }
}

// Helper function to parse inline formatting (bold, italic)
function parseInlineFormatting(text) {
  const textRuns = [];
  let currentPos = 0;

  // Handle **bold** text
  const boldRegex = /\*\*(.*?)\*\*/g;
  let match;
  let lastIndex = 0;

  while ((match = boldRegex.exec(text)) !== null) {
    // Add text before the bold
    if (match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      if (beforeText) {
        textRuns.push(new TextRun({ text: beforeText, size: 20 }));
      }
    }

    // Add bold text
    textRuns.push(
      new TextRun({
        text: match[1],
        bold: true,
        size: 20,
      })
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      textRuns.push(new TextRun({ text: remainingText, size: 20 }));
    }
  }

  // If no formatting found, return the whole text
  if (textRuns.length === 0) {
    textRuns.push(new TextRun({ text: text, size: 20 }));
  }

  return textRuns;
}

app.get("/open/:id", (req, res) => {
  try {
    const document = documentIndex.find((doc) => doc.id === req.params.id);

    if (!document) {
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    }

    exec(`start "" "${document.path}"`, (error) => {
      if (error) {
        console.error("Error opening document:", error);
        return res
          .status(500)
          .json({ success: false, message: "Error opening document" });
      }

      console.log(`Document accessed: ${document.name}`);
      res.json({ success: true, message: "Document opened successfully" });
    });
  } catch (err) {
    console.error("Error in open route:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/folders", (req, res) => {
  try {
    const folders = new Set();
    documentIndex.forEach((doc) => {
      folders.add(doc.folder);
    });

    const foldersList = Array.from(folders).sort();
    const visibleFolders = foldersList.filter(
      (folder) => !shouldHideFolder(folder)
    );

    const folderStats = visibleFolders.map((folder) => {
      const count = documentIndex.filter((doc) => doc.folder === folder).length;
      return {
        path: folder,
        name: folder === "" ? "Root" : path.basename(folder),
        count,
      };
    });

    const hiddenConfig = loadHiddenFolders();

    res.render("folders", {
      title: "Document Folders",
      folders: folderStats,
      hiddenFolders: hiddenConfig.hiddenFolders,
      hiddenPaths: hiddenConfig.hiddenPaths,
    });
  } catch (err) {
    console.error("Error rendering folders:", err);
    res.status(500).send("Error loading folders");
  }
});

app.get("/folder/:folderPath", (req, res) => {
  try {
    const folderPath = req.params.folderPath;
    const documents = documentIndex.filter((doc) => doc.folder === folderPath);

    res.render("folder", {
      title: folderPath === "" ? "Root" : `Folder: ${folderPath}`,
      folderPath,
      documents,
      moment,
    });
  } catch (err) {
    console.error("Error rendering folder:", err);
    res.status(500).send("Error loading folder");
  }
});

app.get("/rebuild-index", (req, res) => {
  try {
    buildFileIndex();
    res.redirect("/");
  } catch (err) {
    console.error("Error rebuilding index:", err);
    res.status(500).send("Error rebuilding index");
  }
});

// IMS INDEX ROUTES
app.get("/ims-index", (req, res) => {
  try {
    const imsIndex = loadIMSIndex();
    const enrichedIndex = {};

    Object.keys(imsIndex).forEach((categoryName) => {
      const category = { ...imsIndex[categoryName] };

      // Handle category-level document linking
      if (category.documentId) {
        category.document = documentIndex.find(
          (doc) => doc.id === category.documentId
        );
      } else {
        category.document = findDocumentByName(categoryName);
      }

      // Handle child documents - PRESERVE EXISTING LINKS
      if (category.children && category.children.length > 0) {
        // Start with existing enrichedChildren if they exist
        const existingEnrichedChildren = category.enrichedChildren || [];

        category.enrichedChildren = category.children.map((childName) => {
          // First, check if this child already has a saved link
          const existingChild = existingEnrichedChildren.find(
            (child) => child.name === childName
          );

          if (existingChild && existingChild.document) {
            // Use the existing saved link
            return {
              name: childName,
              document: existingChild.document,
              found: true,
            };
          } else {
            // No saved link, try to auto-find the document
            const foundDoc = findDocumentByName(childName);
            return {
              name: childName,
              document: foundDoc,
              found: !!foundDoc,
            };
          }
        });
      } else if (category.enrichedChildren) {
        // If there are no children in the children array but enrichedChildren exists, keep it
        category.enrichedChildren = category.enrichedChildren;
      }

      enrichedIndex[categoryName] = category;
    });

    res.render("ims-index", {
      title: "IMS Document Index",
      imsIndex: enrichedIndex,
    });
  } catch (err) {
    console.error("Error rendering IMS index:", err);
    res.status(500).send("Error loading IMS index");
  }
});

// ========================================
// API ROUTES
// ========================================

// HIDDEN FOLDERS API
app.post("/manage-hidden-folders", express.json(), (req, res) => {
  try {
    const { action, folderName, folderPath } = req.body;
    const hiddenConfig = loadHiddenFolders();

    if (action === "hide-folder") {
      if (!hiddenConfig.hiddenFolders.includes(folderName)) {
        hiddenConfig.hiddenFolders.push(folderName);
        saveHiddenFolders(hiddenConfig);
      }
    } else if (action === "hide-path") {
      if (!hiddenConfig.hiddenPaths.includes(folderPath)) {
        hiddenConfig.hiddenPaths.push(folderPath);
        saveHiddenFolders(hiddenConfig);
      }
    } else if (action === "show-folder") {
      hiddenConfig.hiddenFolders = hiddenConfig.hiddenFolders.filter(
        (f) => f !== folderName
      );
      saveHiddenFolders(hiddenConfig);
    } else if (action === "show-path") {
      hiddenConfig.hiddenPaths = hiddenConfig.hiddenPaths.filter(
        (p) => p !== folderPath
      );
      saveHiddenFolders(hiddenConfig);
    }

    res.json({ success: true, hiddenConfig });
  } catch (err) {
    console.error("Error managing hidden folders:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// IMS API ROUTES
app.get("/api/available-documents", (req, res) => {
  try {
    const search = req.query.search || "";
    const includeArchived = req.query.includeArchived === "true";

    let availableDocs = documentIndex.map((doc) => ({
      id: doc.id,
      name: doc.name,
      path: doc.relativePath,
      folder: doc.folder,
      isArchived: doc.isArchived || false,
    }));

    // Filter out archived documents unless specifically requested
    if (!includeArchived) {
      availableDocs = availableDocs.filter((doc) => !doc.isArchived);
    }

    if (search) {
      availableDocs = availableDocs.filter((doc) =>
        doc.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    res.json(availableDocs);
  } catch (err) {
    console.error("Error getting available documents:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Document linking API
app.post("/api/link-ims-document", express.json(), (req, res) => {
  try {
    const { categoryName, documentName, documentId, actualDocumentName } =
      req.body;

    console.log("Linking document:", {
      categoryName,
      documentName,
      documentId,
      actualDocumentName,
    });

    if (!categoryName || !documentName || !documentId) {
      return res.json({
        success: false,
        message:
          "Missing required parameters: categoryName, documentName, or documentId",
      });
    }

    // Load current IMS structure
    const imsIndex = loadIMSIndex();

    // Find the category
    if (!imsIndex[categoryName]) {
      return res.json({
        success: false,
        message: `Category "${categoryName}" not found`,
      });
    }

    // Get the actual document from the document index
    const actualDocument = documentIndex.find((doc) => doc.id === documentId);

    if (!actualDocument) {
      return res.json({
        success: false,
        message: `Document with ID "${documentId}" not found`,
      });
    }

    // Initialize enrichedChildren if it doesn't exist
    if (!imsIndex[categoryName].enrichedChildren) {
      imsIndex[categoryName].enrichedChildren = [];
    }

    // Find the specific child document and update it
    let childFound = false;
    imsIndex[categoryName].enrichedChildren = imsIndex[
      categoryName
    ].enrichedChildren.map((child) => {
      if (child.name === documentName) {
        childFound = true;
        return {
          ...child,
          document: {
            id: documentId,
            name: actualDocument.name,
            path: actualDocument.path,
            isArchived: actualDocument.isArchived || false,
          },
          found: true,
        };
      }
      return child;
    });

    // If child wasn't found in enrichedChildren, check regular children array
    if (!childFound) {
      // Initialize children array if needed
      if (!imsIndex[categoryName].children) {
        imsIndex[categoryName].children = [];
      }

      // Check if documentName exists in children array
      const childExists =
        imsIndex[categoryName].children.includes(documentName);

      if (childExists) {
        // Add to enrichedChildren
        imsIndex[categoryName].enrichedChildren.push({
          name: documentName,
          document: {
            id: documentId,
            name: actualDocument.name,
            path: actualDocument.path,
            isArchived: actualDocument.isArchived || false,
          },
          found: true,
        });
        childFound = true;
      }
    }

    if (!childFound) {
      return res.json({
        success: false,
        message: `Child document "${documentName}" not found in category "${categoryName}"`,
      });
    }

    // Save the updated structure
    if (saveIMSIndex(imsIndex)) {
      console.log("Successfully linked document");

      res.json({
        success: true,
        message: `Successfully linked "${actualDocumentName}" to "${documentName}"`,
      });
    } else {
      res.json({
        success: false,
        message: "Failed to save IMS structure",
      });
    }
  } catch (error) {
    console.error("Error linking IMS document:", error);
    res.json({
      success: false,
      message: "Internal server error: " + error.message,
    });
  }
});

// Category-level document linking API
app.post("/api/link-category-document", express.json(), (req, res) => {
  try {
    const { categoryName, documentId, actualDocumentName } = req.body;

    console.log("Linking category document:", {
      categoryName,
      documentId,
      actualDocumentName,
    });

    if (!categoryName || !documentId) {
      return res.json({
        success: false,
        message: "Missing required parameters: categoryName or documentId",
      });
    }

    // Load current IMS structure
    const imsIndex = loadIMSIndex();

    // Find the category
    if (!imsIndex[categoryName]) {
      return res.json({
        success: false,
        message: `Category "${categoryName}" not found`,
      });
    }

    // Get the actual document from the document index
    const actualDocument = documentIndex.find((doc) => doc.id === documentId);

    if (!actualDocument) {
      return res.json({
        success: false,
        message: `Document with ID "${documentId}" not found`,
      });
    }

    // Link the document to the category itself (not to a child)
    imsIndex[categoryName].documentId = documentId;

    // Save the updated structure
    if (saveIMSIndex(imsIndex)) {
      console.log("Successfully linked document to category");

      res.json({
        success: true,
        message: `Successfully linked "${actualDocumentName}" to category "${categoryName}"`,
      });
    } else {
      res.json({
        success: false,
        message: "Failed to save IMS structure",
      });
    }
  } catch (error) {
    console.error("Error linking category document:", error);
    res.json({
      success: false,
      message: "Internal server error: " + error.message,
    });
  }
});

// Document revision API
app.post(
  "/api/replace-document/:id",
  upload.single("newDocument"),
  async (req, res) => {
    try {
      const documentId = req.params.id;
      const { keepOriginal, revisionNote } = req.body;

      if (!req.file) {
        return res.json({ success: false, message: "No file uploaded" });
      }

      // Find the original document
      const originalDoc = documentIndex.find((doc) => doc.id === documentId);
      if (!originalDoc) {
        return res.json({
          success: false,
          message: "Original document not found",
        });
      }

      console.log(
        "Replacing document:",
        originalDoc.name,
        "with:",
        req.file.originalname
      );

      const originalPath = originalDoc.path;
      const originalDir = path.dirname(originalPath);
      const originalName = path.basename(
        originalPath,
        path.extname(originalPath)
      );
      const originalExt = path.extname(originalPath);
      const newExt = path.extname(req.file.originalname);

      // Create backup/archive if requested
      if (keepOriginal === "true") {
        const timestamp = moment().format("YYYY-MM-DD_HH-mm-ss");
        const backupName = `${originalName}_backup_${timestamp}${originalExt}`;
        const backupPath = path.join(originalDir, "Archive", backupName);

        // Create Archive folder if it doesn't exist
        const archiveDir = path.join(originalDir, "Archive");
        fs.ensureDirSync(archiveDir);

        // Copy original to backup location
        try {
          fs.copyFileSync(originalPath, backupPath);
          console.log("Original backed up to:", backupPath);
        } catch (backupError) {
          console.error("Error creating backup:", backupError);
          // Continue anyway - backup failure shouldn't stop the replacement
        }
      }

      // Determine new file path
      let newPath;
      if (newExt === originalExt) {
        // Same extension, replace in place
        newPath = originalPath;
      } else {
        // Different extension, create new file name
        newPath = path.join(originalDir, `${originalName}${newExt}`);

        // If the new path already exists, add a number to make it unique
        let counter = 1;
        while (fs.existsSync(newPath) && newPath !== originalPath) {
          newPath = path.join(
            originalDir,
            `${originalName}_v${counter}${newExt}`
          );
          counter++;
        }
      }

      // If we're replacing with the same path, remove the original first
      if (newPath === originalPath && fs.existsSync(originalPath)) {
        try {
          fs.unlinkSync(originalPath);
          console.log("Removed original file before replacement");
        } catch (removeError) {
          console.error("Error removing original file:", removeError);
          return res.json({
            success: false,
            message: "Error removing original file: " + removeError.message,
          });
        }
      }

      // Move uploaded file to final location
      try {
        if (fs.existsSync(newPath) && newPath !== originalPath) {
          // If destination exists and it's not the same as original, we need to handle this
          fs.unlinkSync(newPath);
          console.log("Removed existing file at destination");
        }

        fs.moveSync(req.file.path, newPath);
        console.log("Moved new file to:", newPath);
      } catch (moveError) {
        console.error("Error moving file:", moveError);
        return res.json({
          success: false,
          message: "Error moving new file: " + moveError.message,
        });
      }

      // If extension changed and we didn't replace in place, remove old file
      if (
        newExt !== originalExt &&
        newPath !== originalPath &&
        fs.existsSync(originalPath)
      ) {
        try {
          fs.unlinkSync(originalPath);
          console.log("Removed old file with different extension");
        } catch (removeError) {
          console.warn(
            "Warning: Could not remove old file:",
            removeError.message
          );
          // Don't fail the operation for this
        }
      }

      // Log the revision
      const revisionLog = {
        timestamp: new Date().toISOString(),
        originalFile: originalDoc.name,
        newFile: req.file.originalname,
        originalPath: originalPath,
        newPath: newPath,
        replacedBy: req.body.replacedBy || "Unknown",
        note: revisionNote || "Document replaced",
        backupCreated: keepOriginal === "true",
        extensionChanged: newExt !== originalExt,
      };

      // Save revision log
      saveRevisionLog(documentId, revisionLog);

      // Rebuild index to reflect changes
      setTimeout(() => {
        buildFileIndex();
      }, 1000);

      res.json({
        success: true,
        message: "Document replaced successfully",
        newPath: newPath,
        backupCreated: keepOriginal === "true",
        extensionChanged: newExt !== originalExt,
      });
    } catch (error) {
      console.error("Error replacing document:", error);

      // Clean up uploaded file if error occurs
      if (req.file && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
          console.log("Cleaned up uploaded file after error");
        } catch (cleanupError) {
          console.error("Error cleaning up uploaded file:", cleanupError);
        }
      }

      res.json({
        success: false,
        message: "Error replacing document: " + error.message,
      });
    }
  }
);

// Get mandatory records structure
app.get("/api/mandatory-records", (req, res) => {
  try {
    const mandatoryRecords = loadMandatoryRecords();

    // Auto-detect documents for each record type
    Object.keys(mandatoryRecords).forEach((recordType) => {
      const record = mandatoryRecords[recordType];

      // Preserve manually linked documents
      const manualDocs = (record.enrichedDocuments || []).filter(
        (doc) => !doc.autoDetected
      );

      // Auto-detect documents
      const keywords = record.autoDetectKeywords || [];
      const autoDetectedDocs = documentIndex
        .filter((doc) => {
          if (doc.isArchived) return false;

          const searchText = (
            doc.name +
            " " +
            doc.folder +
            " " +
            doc.relativePath
          ).toLowerCase();
          return keywords.some((keyword) =>
            searchText.includes(keyword.toLowerCase())
          );
        })
        .map((doc) => ({
          id: doc.id,
          name: doc.name,
          path: doc.path,
          folder: doc.folder,
          modified: doc.modified,
          created: doc.created,
          isArchived: doc.isArchived || false,
          autoDetected: true,
          matchedKeywords: keywords.filter((keyword) =>
            (doc.name + " " + doc.folder)
              .toLowerCase()
              .includes(keyword.toLowerCase())
          ),
        }));

      // Combine manual and auto-detected documents
      record.enrichedDocuments = [...manualDocs, ...autoDetectedDocs];

      // Remove duplicates based on document ID
      const seen = new Set();
      record.enrichedDocuments = record.enrichedDocuments.filter((doc) => {
        if (seen.has(doc.id)) return false;
        seen.add(doc.id);
        return true;
      });
    });

    res.json({
      success: true,
      mandatoryRecords: mandatoryRecords,
    });
  } catch (err) {
    console.error("Error getting mandatory records:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Link document to mandatory record
app.post("/api/link-mandatory-record", express.json(), (req, res) => {
  try {
    const { recordType, documentId, actualDocumentName } = req.body;

    console.log("=== LINK MANDATORY RECORD REQUEST ===");
    console.log("recordType:", recordType);
    console.log("documentId:", documentId);
    console.log("actualDocumentName:", actualDocumentName);

    if (!recordType || !documentId) {
      console.log("ERROR: Missing required parameters");
      return res.json({
        success: false,
        message: "Missing required parameters: recordType or documentId",
      });
    }

    const mandatoryRecords = loadMandatoryRecords();
    console.log("Loaded mandatory records for type:", recordType);

    if (!mandatoryRecords[recordType]) {
      console.log("ERROR: Record type not found:", recordType);
      return res.json({
        success: false,
        message: `Record type "${recordType}" not found`,
      });
    }

    // Get the actual document
    const actualDocument = documentIndex.find((doc) => doc.id === documentId);
    if (!actualDocument) {
      console.log("ERROR: Document not found in index:", documentId);
      return res.json({
        success: false,
        message: `Document with ID "${documentId}" not found`,
      });
    }

    console.log("Found document:", actualDocument.name);

    // Initialize enrichedDocuments if needed
    if (!mandatoryRecords[recordType].enrichedDocuments) {
      mandatoryRecords[recordType].enrichedDocuments = [];
    }

    // Check if document is already in enrichedDocuments
    const existingDocIndex = mandatoryRecords[
      recordType
    ].enrichedDocuments.findIndex((doc) => doc.id === documentId);

    if (existingDocIndex !== -1) {
      // UPDATE existing document to mark as manually linked
      console.log("Document already exists, updating to manually linked");
      mandatoryRecords[recordType].enrichedDocuments[
        existingDocIndex
      ].manuallyLinked = true;
      mandatoryRecords[recordType].enrichedDocuments[
        existingDocIndex
      ].autoDetected = false;
      mandatoryRecords[recordType].enrichedDocuments[
        existingDocIndex
      ].linkedAt = new Date().toISOString();
    } else {
      // Add new document
      console.log("Adding new document");
      mandatoryRecords[recordType].enrichedDocuments.push({
        id: documentId,
        name: actualDocument.name,
        path: actualDocument.path,
        folder: actualDocument.folder,
        modified: actualDocument.modified,
        created: actualDocument.created,
        isArchived: actualDocument.isArchived || false,
        autoDetected: false,
        manuallyLinked: true,
        linkedAt: new Date().toISOString(),
      });
    }

    mandatoryRecords[recordType].lastUpdated = new Date().toISOString();

    console.log("Attempting to save mandatory records...");
    const saveResult = saveMandatoryRecords(mandatoryRecords);
    console.log("Save result:", saveResult);

    if (saveResult) {
      console.log("SUCCESS: Document linked successfully");
      res.json({
        success: true,
        message: `Successfully linked "${actualDocumentName}" to "${recordType}"`,
      });
    } else {
      console.log("ERROR: Failed to save mandatory records");
      res.json({
        success: false,
        message: "Failed to save mandatory records",
      });
    }
  } catch (error) {
    console.error("ERROR in link-mandatory-record:", error);
    res.json({
      success: false,
      message: "Internal server error: " + error.message,
    });
  }
});

// Remove document from mandatory record
app.delete("/api/mandatory-record/:recordType/:documentId", (req, res) => {
  try {
    const { recordType, documentId } = req.params;

    const mandatoryRecords = loadMandatoryRecords();

    if (!mandatoryRecords[recordType]) {
      return res
        .status(404)
        .json({ success: false, message: "Record type not found" });
    }

    // Remove the document
    mandatoryRecords[recordType].enrichedDocuments = (
      mandatoryRecords[recordType].enrichedDocuments || []
    ).filter((doc) => doc.id !== documentId);

    mandatoryRecords[recordType].lastUpdated = new Date().toISOString();

    if (saveMandatoryRecords(mandatoryRecords)) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: "Failed to save mandatory records" });
    }
  } catch (err) {
    console.error("Error removing mandatory record document:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Auto-detect mandatory records
app.post("/api/auto-detect-mandatory-records", (req, res) => {
  try {
    const detectionCount = autoDetectMandatoryRecords();

    res.json({
      success: true,
      message: `Auto-detection completed. Found ${detectionCount} potential matches.`,
      detectedCount: detectionCount,
    });
  } catch (error) {
    console.error("Error in auto-detection:", error);
    res.json({
      success: false,
      message: "Error in auto-detection: " + error.message,
    });
  }
});

// Update mandatory record configuration
app.post("/api/update-mandatory-record", express.json(), (req, res) => {
  try {
    const { recordType, description, keywords, requiredCount, timeframe } =
      req.body;

    const mandatoryRecords = loadMandatoryRecords();

    if (!mandatoryRecords[recordType]) {
      return res
        .status(404)
        .json({ success: false, message: "Record type not found" });
    }

    // Update configuration
    if (description) mandatoryRecords[recordType].description = description;
    if (keywords) mandatoryRecords[recordType].autoDetectKeywords = keywords;
    if (requiredCount !== undefined)
      mandatoryRecords[recordType].requiredCount = requiredCount;
    if (timeframe) mandatoryRecords[recordType].timeframe = timeframe;

    mandatoryRecords[recordType].lastUpdated = new Date().toISOString();

    if (saveMandatoryRecords(mandatoryRecords)) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: "Failed to save mandatory records" });
    }
  } catch (err) {
    console.error("Error updating mandatory record:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get document revision history
app.get("/api/document-revisions/:id", (req, res) => {
  try {
    const documentId = req.params.id;
    const revisions = getRevisionHistory(documentId);
    res.json({ success: true, revisions });
  } catch (error) {
    console.error("Error getting revision history:", error);
    res.json({ success: false, message: "Error getting revision history" });
  }
});

// Auto-link documents with revision awareness
app.post("/api/auto-link-documents", express.json(), (req, res) => {
  try {
    const { checkRevisions } = req.body;
    const imsIndex = loadIMSIndex();

    let linkedCount = 0;
    let revisionsFound = 0;
    let skippedArchived = 0;

    console.log("Starting auto-linking process...");

    Object.keys(imsIndex).forEach((categoryName) => {
      const category = imsIndex[categoryName];

      // Auto-link category document if not already linked
      if (!category.document && !category.documentId) {
        const foundDoc = findDocumentByName(categoryName, false); // Exclude archived
        if (foundDoc) {
          if (foundDoc.isArchived) {
            skippedArchived++;
            console.log(
              `Skipped archived document for category: ${categoryName}`
            );
          } else {
            category.documentId = foundDoc.id;
            linkedCount++;
            console.log(
              `Linked category document: ${categoryName} -> ${foundDoc.name}`
            );
          }
        }
      }

      // Auto-link child documents
      if (category.children && category.children.length > 0) {
        if (!category.enrichedChildren) {
          category.enrichedChildren = [];
        }

        category.children.forEach((childName) => {
          // Check if already linked
          const existingChild = category.enrichedChildren.find(
            (child) => child.name === childName
          );

          if (!existingChild || !existingChild.document) {
            const foundDoc = findDocumentByName(childName, false); // Exclude archived

            if (foundDoc) {
              if (foundDoc.isArchived) {
                skippedArchived++;
                console.log(
                  `Skipped archived document for child: ${childName}`
                );
              } else {
                // Check for revisions if requested
                if (checkRevisions) {
                  const revisions = getRevisionHistory(foundDoc.id);
                  if (revisions.length > 0) {
                    revisionsFound++;
                    console.log(
                      `Found ${revisions.length} revisions for: ${childName}`
                    );
                  }
                }

                // Update or add to enrichedChildren
                const childIndex = category.enrichedChildren.findIndex(
                  (child) => child.name === childName
                );
                const childData = {
                  name: childName,
                  document: {
                    id: foundDoc.id,
                    name: foundDoc.name,
                    path: foundDoc.path,
                    isArchived: foundDoc.isArchived || false,
                  },
                  found: true,
                  autoLinked: true,
                  linkedAt: new Date().toISOString(),
                };

                if (childIndex >= 0) {
                  category.enrichedChildren[childIndex] = childData;
                } else {
                  category.enrichedChildren.push(childData);
                }

                linkedCount++;
                console.log(
                  `Linked child document: ${childName} -> ${foundDoc.name}`
                );
              }
            }
          }
        });
      }
    });

    // Save updated IMS structure
    if (saveIMSIndex(imsIndex)) {
      console.log(
        `Auto-linking completed: ${linkedCount} linked, ${revisionsFound} revisions found, ${skippedArchived} archived skipped`
      );

      res.json({
        success: true,
        linked: linkedCount,
        revisionsFound: revisionsFound,
        skippedArchived: skippedArchived,
        message: `Successfully linked ${linkedCount} documents`,
      });
    } else {
      res.json({
        success: false,
        message: "Error saving IMS structure",
      });
    }
  } catch (error) {
    console.error("Error in auto-linking:", error);
    res.json({
      success: false,
      message: "Error in auto-linking: " + error.message,
    });
  }
});

// Existing IMS API routes
app.post("/api/update-ims-category", express.json(), (req, res) => {
  try {
    const { action, categoryName, newName, level, type, documentId, children } =
      req.body;
    const imsIndex = loadIMSIndex();

    console.log("Update category request:", {
      action,
      categoryName,
      newName,
      level,
      type,
      children,
    });

    // Handle different actions
    if (action === "create") {
      // Create new category
      if (imsIndex[categoryName]) {
        return res.json({
          success: false,
          message: `Category "${categoryName}" already exists`,
        });
      }

      imsIndex[categoryName] = {
        type: type || "category",
        level: level || 2,
        documentId: null,
        children: children || [],
      };
    } else if (action === "update") {
      // Update existing category
      if (!imsIndex[categoryName]) {
        return res.json({
          success: false,
          message: `Category "${categoryName}" not found`,
        });
      }

      let targetCategoryName = categoryName;

      // Handle renaming
      if (newName && newName !== categoryName) {
        if (imsIndex[newName]) {
          return res.json({
            success: false,
            message: `Category "${newName}" already exists`,
          });
        }

        imsIndex[newName] = { ...imsIndex[categoryName] };
        delete imsIndex[categoryName];
        targetCategoryName = newName;
      }

      // Update properties
      if (level) imsIndex[targetCategoryName].level = parseInt(level);
      if (type) imsIndex[targetCategoryName].type = type;
      if (documentId !== undefined) {
        imsIndex[targetCategoryName].documentId = documentId || null;
      }

      // *** CRITICAL FIX: Handle children array ***
      if (children !== undefined) {
        imsIndex[targetCategoryName].children = children;
        console.log(`Updated children for ${targetCategoryName}:`, children);
      }
    } else {
      // Legacy behavior - also handle children
      if (!imsIndex[categoryName] && !newName) {
        // Adding new category (legacy)
        imsIndex[categoryName] = {
          type: type || "category",
          level: level || 2,
          documentId: null,
          children: children || [],
        };
      } else if (imsIndex[categoryName]) {
        // Updating existing category (legacy)
        let targetCategoryName = categoryName;

        if (newName && newName !== categoryName) {
          if (imsIndex[newName]) {
            return res.json({
              success: false,
              message: `Category "${newName}" already exists`,
            });
          }

          imsIndex[newName] = { ...imsIndex[categoryName] };
          delete imsIndex[categoryName];
          targetCategoryName = newName;
        }

        if (level) imsIndex[targetCategoryName].level = parseInt(level);
        if (type) imsIndex[targetCategoryName].type = type;
        if (documentId !== undefined) {
          imsIndex[targetCategoryName].documentId = documentId || null;
        }

        // *** CRITICAL FIX: Handle children in legacy mode too ***
        if (children !== undefined) {
          imsIndex[targetCategoryName].children = children;
          console.log(
            `Updated children (legacy) for ${targetCategoryName}:`,
            children
          );
        }
      }
    }

    if (saveIMSIndex(imsIndex)) {
      console.log("Successfully saved IMS index with children");
      res.json({ success: true, message: "Category updated successfully" });
    } else {
      res.json({ success: false, message: "Failed to save changes" });
    }
  } catch (err) {
    console.error("Error updating IMS category:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + err.message });
  }
});

app.delete("/api/delete-ims-category/:categoryName", (req, res) => {
  try {
    const { categoryName } = req.params;
    const imsIndex = loadIMSIndex();

    if (!imsIndex[categoryName]) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }

    delete imsIndex[categoryName];
    saveIMSIndex(imsIndex);

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting IMS category:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/manage-child-document", express.json(), (req, res) => {
  try {
    const { categoryName, action, documentName, newDocumentName } = req.body;
    const imsIndex = loadIMSIndex();

    if (!imsIndex[categoryName]) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }

    if (!imsIndex[categoryName].children) {
      imsIndex[categoryName].children = [];
    }

    switch (action) {
      case "add":
        if (
          newDocumentName &&
          !imsIndex[categoryName].children.includes(newDocumentName)
        ) {
          imsIndex[categoryName].children.push(newDocumentName);
        }
        break;
      case "remove":
        imsIndex[categoryName].children = imsIndex[
          categoryName
        ].children.filter((child) => child !== documentName);
        break;
      case "rename":
        const index = imsIndex[categoryName].children.indexOf(documentName);
        if (index > -1 && newDocumentName) {
          imsIndex[categoryName].children[index] = newDocumentName;
        }
        break;
    }

    saveIMSIndex(imsIndex);
    res.json({ success: true });
  } catch (err) {
    console.error("Error managing child document:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/ims-structure", (req, res) => {
  try {
    const imsIndex = loadIMSIndex();
    res.json(imsIndex);
  } catch (err) {
    console.error("Error getting IMS structure:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// AI Configuration Routes
app.get("/ai-settings", (req, res) => {
  try {
    const aiConfig = loadAIConfig();
    res.render("ai-settings", {
      title: "AI Configuration",
      aiConfig,
      providers: AI_PROVIDERS,
    });
  } catch (err) {
    console.error("Error loading AI settings:", err);
    res.status(500).send("Error loading AI settings");
  }
});

app.post("/api/ai-config", express.json(), (req, res) => {
  try {
    const { provider, apiKey, companyInfo } = req.body;
    const aiConfig = loadAIConfig();

    if (provider) aiConfig.selectedProvider = provider;
    if (apiKey) aiConfig.apiKeys[provider] = apiKey;
    if (companyInfo)
      aiConfig.companyInfo = { ...aiConfig.companyInfo, ...companyInfo };

    if (saveAIConfig(aiConfig)) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: "Failed to save configuration" });
    }
  } catch (error) {
    console.error("Error saving AI config:", error);
    res.json({ success: false, message: error.message });
  }
});

// Document Generation Route
// Replace your existing /api/generate-document route with this:
app.post("/api/generate-document", express.json(), async (req, res) => {
  try {
    const { documentType, documentName, customInputs } = req.body;
    const { category } = customInputs || {};

    console.log(
      "Generating document:",
      documentType,
      documentName,
      "for category:",
      category
    );

    const result = await generateDocument(
      documentType,
      documentName,
      customInputs
    );

    if (result.success) {
      const timestamp = moment().format("YYYY-MM-DD_HH-mm-ss");
      const cleanDocName = documentName.replace(/[<>:"/\\|?*]/g, "_"); // Clean filename
      const filename = `${cleanDocName}_AI_Generated_${timestamp}.docx`;

      // Determine destination folder based on document type and category
      let destinationFolder = "AI Generated"; // Default fallback

      if (category) {
        // Map categories to appropriate folders
        const categoryFolderMap = {
          "Work Instructions": "Section 04B Work Instructions",
          "Safe Work Method Statements": "Section 04 SWMS",
          "Core Policies": "Section 01B IMS Policies",
          "Incident and Injury Management": "Section 02 System Procedures",
          "Consultation and Communication": "Section 02 System Procedures",
          "Risk Management": "Section 02 System Procedures",
        };

        destinationFolder = categoryFolderMap[category] || "AI Generated";
      } else if (documentType) {
        // Map document types to folders if no category
        const typeFolderMap = {
          SWMS: "Section 04 SWMS",
          "Safe Work Method Statement": "Section 04 SWMS",
          "Risk Assessment": "Section 02 System Procedures",
          "Safety Policy": "Section 01B IMS Policies",
          "Training Manual": "Section 03 Proforma Docs",
          "Emergency Procedure": "Section 02 System Procedures",
          "Work Procedure": "Section 04B Work Instructions",
        };

        destinationFolder = typeFolderMap[documentType] || "AI Generated";
      }

      const fullDestinationPath = path.join(
        DOCUMENTS_ROOT,
        "Intergrated Management System",
        destinationFolder
      );
      const filepath = path.join(fullDestinationPath, filename);

      // Create destination folder if it doesn't exist
      fs.ensureDirSync(fullDestinationPath);

      // Convert content to Word document
      const doc = createWordDocument(result.content, result.metadata);
      await doc.writeFile(filepath);

      console.log("AI document saved to:", filepath);

      // Rebuild index to include new document
      setTimeout(() => {
        buildFileIndex();
      }, 1000);

      res.json({
        success: true,
        filepath: filepath,
        filename: filename,
        destinationFolder: destinationFolder,
        metadata: result.metadata,
        wordCount: result.content.split(" ").length,
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error("Error generating document:", error);
    res.json({ success: false, message: error.message });
  }
});
// ========================================
// ERROR HANDLING
// ========================================

app.use((req, res) => {
  res.status(404).render("error", {
    title: "404: Page Not Found",
    message: "The requested page could not be found",
  });
});

app.use((err, req, res, next) => {
  console.error("Application error:", err.stack);

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== "production";

  res.status(err.status || 500).render("error", {
    title: "Server Error",
    message: isDevelopment ? err.message : "An internal server error occurred",
    error: isDevelopment ? err : {},
  });
});

// ========================================
// INITIALIZATION
// ========================================

async function init() {
  try {
    console.log(`Application directory: ${__dirname}`);
    console.log(`Views directory: ${path.join(__dirname, "views")}`);
    console.log(`Documents directory: ${DOCUMENTS_ROOT}`);

    // Create hidden folders config if it doesn't exist
    if (!fs.existsSync(HIDDEN_FOLDERS_PATH)) {
      saveHiddenFolders({ hiddenFolders: [], hiddenPaths: [] });
    }

    // Create IMS index if it doesn't exist
    if (!fs.existsSync(IMS_INDEX_PATH)) {
      saveIMSIndex(loadIMSIndex());
    }

    // Load existing index or build new one
    if (!loadIndexFromFile()) {
      buildFileIndex();
    }

    // Set up directory watcher
    setupWatcher();

    // Start server
    app.listen(PORT, () => {
      console.log(`IMS Document Management System running on port ${PORT}`);
      console.log(`Visit http://localhost:${PORT} to access the application`);
    });
  } catch (err) {
    console.error("Failed to initialize application:", err);
    process.exit(1);
  }
}

init();

// Export functions
module.exports = {
  generateComplianceReport,
  calculateComplianceMetrics,
  identifyComplianceGaps,
  assessComplianceRisks,
  REPORT_TEMPLATES,
};
