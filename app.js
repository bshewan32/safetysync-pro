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

async function generateDocument(documentType, documentName, customInputs) {
  const aiConfig = loadAIConfig();

  if (!aiConfig.apiKeys[aiConfig.selectedProvider]) {
    return {
      success: false,
      message: "AI API key not configured",
    };
  }

  // Simple document generation placeholder
  const content = `# ${documentName}

## Document Type: ${documentType}

This document was generated by SafetySync Pro AI Assistant.

**Generated on:** ${new Date().toLocaleDateString()}
**Company:** ${aiConfig.companyInfo.name || "Your Company"}
**Industry:** ${aiConfig.companyInfo.industry}

## Content

${
  documentType === "policy"
    ? "This policy outlines the requirements and procedures for..."
    : "This procedure describes the step-by-step process for..."
}

### Key Requirements
- Compliance with relevant standards
- Regular review and updates
- Training and communication
- Monitoring and measurement

### Implementation
1. Review existing practices
2. Develop implementation plan
3. Provide training
4. Monitor compliance
5. Regular review and improvement

---
*This document is AI-generated and should be reviewed by qualified personnel before implementation.*`;

  return {
    success: true,
    content: content,
    metadata: {
      documentType: documentType,
      generatedBy: "AI",
      timestamp: new Date().toISOString(),
    },
  };
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
async function generateReportHTML(reportData, reportType) {
  const { metadata, metrics, gaps, risks, actionPlan, recommendations } =
    reportData;

  return `
    <div class="executive-report">
      <div class="report-header">
        <h1>${metadata.companyName} - ${REPORT_TEMPLATES[reportType].name}</h1>
        <div class="report-meta">
          <p><strong>Generated:</strong> ${new Date(
            metadata.generatedDate
          ).toLocaleDateString()}</p>
          <p><strong>Industry:</strong> ${
            metadata.industry
          } | <strong>Jurisdiction:</strong> ${metadata.jurisdiction}</p>
        </div>
      </div>
      
      <div class="executive-summary">
        <h2>Executive Summary</h2>
        <div class="score-card">
          <div class="metric-box ${metrics.overall.rating.toLowerCase()}">
            <h3>${metrics.overall.score}%</h3>
            <p>Overall Compliance</p>
            <span class="rating">${metrics.overall.rating}</span>
          </div>
          <div class="metric-box">
            <h3>${gaps.critical.length}</h3>
            <p>Critical Gaps</p>
          </div>
          <div class="metric-box">
            <h3>${actionPlan.totalActions}</h3>
            <p>Action Items</p>
          </div>
        </div>
        
        <div class="key-findings">
          <h3>Key Findings</h3>
          <ul>
            <li><strong>Document Compliance:</strong> ${
              metrics.documents.score
            }% (${metrics.documents.linked}/${
    metrics.documents.total
  } documents)</li>
            <li><strong>Mandatory Records:</strong> ${
              metrics.mandatory.score
            }% (${metrics.mandatory.compliant}/${
    metrics.mandatory.total
  } records)</li>
            <li><strong>Immediate Priorities:</strong> ${
              actionPlan.immediate.length
            } critical actions required</li>
          </ul>
        </div>
      </div>
      
      <div class="gap-analysis">
        <h2>Compliance Gap Analysis</h2>
        ${
          gaps.critical.length > 0
            ? `
          <div class="gap-section critical">
            <h3>🚨 Critical Gaps (${gaps.critical.length})</h3>
            <ul>
              ${gaps.critical
                .map((gap) => `<li>${gap.description}</li>`)
                .join("")}
            </ul>
          </div>
        `
            : ""
        }
        
        ${
          gaps.high.length > 0
            ? `
          <div class="gap-section high">
            <h3>⚠️ High Priority Gaps (${gaps.high.length})</h3>
            <ul>
              ${gaps.high
                .slice(0, 10)
                .map((gap) => `<li>${gap.description}</li>`)
                .join("")}
              ${
                gaps.high.length > 10
                  ? `<li><em>... and ${gaps.high.length - 10} more</em></li>`
                  : ""
              }
            </ul>
          </div>
        `
            : ""
        }
      </div>
      
      <div class="action-plan">
        <h2>Recommended Action Plan</h2>
        
        <div class="action-section">
          <h3>Immediate Actions (1-2 weeks)</h3>
          <table class="action-table">
            <thead>
              <tr><th>Action</th><th>Timeline</th><th>Responsibility</th><th>AI Assist</th></tr>
            </thead>
            <tbody>
              ${actionPlan.immediate
                .map(
                  (action) => `
                <tr>
                  <td>${action.description}</td>
                  <td>${action.timeline}</td>
                  <td>${action.responsibility}</td>
                  <td>${action.aiAssisted ? "✅ Yes" : "❌ No"}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
        
        <div class="action-section">
          <h3>Short-term Actions (2-4 weeks)</h3>
          <table class="action-table">
            <thead>
              <tr><th>Action</th><th>Timeline</th><th>Responsibility</th><th>AI Assist</th></tr>
            </thead>
            <tbody>
              ${actionPlan.shortTerm
                .map(
                  (action) => `
                <tr>
                  <td>${action.description}</td>
                  <td>${action.timeline}</td>
                  <td>${action.responsibility}</td>
                  <td>${action.aiAssisted ? "✅ Yes" : "❌ No"}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
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
      
      <div class="report-footer">
        <p><small>Generated by SafetySync Pro on ${new Date().toLocaleDateString()}</small></p>
      </div>
    </div>
    
    <style>
      .executive-report { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; }
      .report-header { border-bottom: 3px solid #667eea; padding-bottom: 20px; margin-bottom: 30px; }
      .score-card { display: flex; gap: 20px; margin: 20px 0; }
      .metric-box { background: #f8f9ff; padding: 20px; border-radius: 8px; text-align: center; flex: 1; }
      .metric-box.excellent { background: #d4edda; }
      .metric-box.good { background: #d1ecf1; }
      .metric-box.satisfactory { background: #fff3cd; }
      .metric-box h3 { font-size: 2rem; margin: 0; color: #667eea; }
      .gap-section.critical { background: #f8d7da; padding: 15px; border-radius: 8px; margin: 10px 0; }
      .gap-section.high { background: #fff3cd; padding: 15px; border-radius: 8px; margin: 10px 0; }
      .action-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
      .action-table th, .action-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
      .action-table th { background: #667eea; color: white; }
      .ai-recommendations { background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; }
      @media print { .executive-report { max-width: none; } }
    </style>
  `;
}

// Add to your app.js
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require("docx");

function createWordDocument(content, metadata) {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: metadata.documentType,
            heading: HeadingLevel.TITLE,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated by SafetySync Pro`,
                italics: true,
              }),
            ],
          }),
          new Paragraph({
            text: "", // Empty line
          }),
          ...content.split("\n\n").map(
            (paragraph) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: paragraph.replace(/\*\*(.*?)\*\*/g, "$1"), // Remove markdown bold
                  }),
                ],
              })
          ),
          new Paragraph({
            text: "", // Empty line
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Document generated on ${new Date().toLocaleDateString()}`,
                size: 16,
                color: "666666",
              }),
            ],
          }),
        ],
      },
    ],
  });

  return {
    writeFile: async (filepath) => {
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(filepath, buffer);
    },
  };
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

    console.log("Generating document:", documentType, documentName, "for category:", category);

    const result = await generateDocument(documentType, documentName, customInputs);

    if (result.success) {
      const timestamp = moment().format("YYYY-MM-DD_HH-mm-ss");
      const cleanDocName = documentName.replace(/[<>:"/\\|?*]/g, '_'); // Clean filename
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
          "Risk Management": "Section 02 System Procedures"
        };
        
        destinationFolder = categoryFolderMap[category] || "AI Generated";
      } else if (documentType) {
        // Map document types to folders if no category
        const typeFolderMap = {
          "SWMS": "Section 04 SWMS",
          "Safe Work Method Statement": "Section 04 SWMS",
          "Risk Assessment": "Section 02 System Procedures",
          "Safety Policy": "Section 01B IMS Policies",
          "Training Manual": "Section 03 Proforma Docs",
          "Emergency Procedure": "Section 02 System Procedures",
          "Work Procedure": "Section 04B Work Instructions"
        };
        
        destinationFolder = typeFolderMap[documentType] || "AI Generated";
      }

      const fullDestinationPath = path.join(DOCUMENTS_ROOT, "Intergrated Management System", destinationFolder);
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
        wordCount: result.content.split(' ').length
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
