// routes/ims-routes.js - Complete IMS routes moved from app.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");
const moment = require("moment");
const fsSync = require("fs");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../temp"));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// IMS API ROUTES (moved from app.js)

// API endpoint to record manual corrections
router.post("/api/learn-from-correction", (req, res) => {
  try {
    const { originalSearch, actualDocumentId, category, recordType } = req.body;

    if (!originalSearch || !actualDocumentId) {
      return res.json({
        success: false,
        message: "Missing required parameters",
      });
    }

    const actualDocument = req.app.locals.documentIndex.find(
      (doc) => doc.id === actualDocumentId
    );
    if (!actualDocument) {
      return res.json({
        success: false,
        message: "Document not found",
      });
    }

    req.app.locals.learnFromManualLink(
      originalSearch,
      actualDocument,
      category,
      recordType
    );

    res.json({
      success: true,
      message: "Learning pattern recorded successfully",
    });
  } catch (error) {
    console.error("Error recording learning pattern:", error);
    res.json({
      success: false,
      message: "Error recording learning pattern",
    });
  }
});

// Add this to routes/ims-routes.js
router.post("/api/fix-stale-links", (req, res) => {
  try {
    console.log("Fixing stale document links...");

    const imsIndex = req.app.locals.loadIMSIndex();
    let clearedCount = 0;
    let relinkedCount = 0;

    Object.keys(imsIndex).forEach((categoryName) => {
      const category = imsIndex[categoryName];

      if (category.enrichedChildren) {
        category.enrichedChildren.forEach((child) => {
          if (child.document && child.document.id) {
            // Check if the document ID still exists in current index
            const stillExists = req.app.locals.documentIndex.find(
              (doc) => doc.id === child.document.id
            );

            if (!stillExists) {
              console.log(`Clearing stale link: ${child.document.name}`);

              // Try to find the document by name in current index
              const foundByName = req.app.locals.documentIndex.find(
                (doc) =>
                  doc.name.toLowerCase() === child.document.name.toLowerCase()
              );

              if (foundByName) {
                // Relink with new ID
                console.log(`  Relinking with new ID: ${foundByName.id}`);
                child.document.id = foundByName.id;
                child.document.path = foundByName.path;
                child.document.isArchived = foundByName.isArchived || false;
                relinkedCount++;
              } else {
                // Clear the stale link completely
                console.log(`  Could not find replacement, clearing link`);
                child.document = null;
                child.found = false;
                clearedCount++;
              }
            }
          }
        });
      }
    });

    if (req.app.locals.saveIMSIndex(imsIndex)) {
      res.json({
        success: true,
        message: `Fixed stale links: ${relinkedCount} relinked, ${clearedCount} cleared`,
        relinkedCount,
        clearedCount,
      });
    } else {
      res.json({
        success: false,
        message: "Failed to save fixes",
      });
    }
  } catch (error) {
    console.error("Error fixing stale links:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// API endpoint to get learning statistics
router.get("/api/learning-stats", (req, res) => {
  try {
    const patterns = req.app.locals.loadLearningPatterns();

    const stats = {
      totalPatterns: Object.keys(patterns.documentPatterns).length,
      totalCorrections: patterns.manualCorrections.length,
      topKeywords: Object.entries(patterns.keywordWeights)
        .sort(([, a], [, b]) => b.score - a.score)
        .slice(0, 10)
        .map(([keyword, data]) => ({
          keyword,
          score: data.score,
          uses: data.uses,
        })),
      recentCorrections: patterns.manualCorrections.slice(-5),
      lastUpdated: patterns.lastUpdated,
    };

    res.json(stats);
  } catch (error) {
    console.error("Error getting learning stats:", error);
    res.json({ error: "Failed to get learning statistics" });
  }
});

// API endpoint to search for document alternatives with UI
router.post("/api/search-document-alternatives", (req, res) => {
  try {
    const { searchTerm, excludeDocumentId, categoryName } = req.body;

    if (!searchTerm) {
      return res.json({
        success: false,
        message: "Search term is required",
      });
    }

    console.log(`Searching alternatives for: "${searchTerm}"`);

    // Use enhanced search first
    let primaryMatch = null;
    try {
      primaryMatch = req.app.locals.findDocumentByNameWithLearning
        ? req.app.locals.findDocumentByNameWithLearning(searchTerm, false)
        : null;
    } catch (error) {
      console.log("Enhanced search failed, using basic search");
    }

    // Get all possible matches with scoring
    const allMatches = req.app.locals.documentIndex
      .filter((doc) => {
        // Exclude the problematic document
        if (excludeDocumentId && doc.id === excludeDocumentId) return false;

        // Exclude archived and contractor documents
        if (doc.isArchived) return false;
        if (
          req.app.locals.isArchivedDocument &&
          req.app.locals.isArchivedDocument(doc.path)
        )
          return false;
        if (
          req.app.locals.isContractorDocument &&
          req.app.locals.isContractorDocument(doc.path)
        )
          return false;

        return true;
      })
      .map((doc) => {
        const score = calculateDocumentMatchScore(searchTerm, doc);
        return {
          id: doc.id,
          name: doc.name,
          path: doc.path,
          folder: doc.folder || "Root",
          size: doc.size,
          modified: doc.modified,
          created: doc.created,
          extension: doc.extension || "",
          score: score,
          isArchived: doc.isArchived || false,
        };
      })
      .filter((doc) => doc.score > 0) // Only include docs with some relevance
      .sort((a, b) => b.score - a.score)
      .slice(0, 20); // Limit to top 20 results

    res.json({
      success: true,
      searchTerm: searchTerm,
      primaryMatch: primaryMatch
        ? {
            id: primaryMatch.id,
            name: primaryMatch.name,
            path: primaryMatch.path,
            folder: primaryMatch.folder || "Root",
            score: 100, // Primary match gets highest score
          }
        : null,
      alternatives: allMatches,
      totalFound: allMatches.length,
    });
  } catch (error) {
    console.error("Error searching for alternatives:", error);
    res.status(500).json({
      success: false,
      message: "Search failed: " + error.message,
    });
  }
});

// Enhanced scoring function
// Enhanced scoring function
function calculateDocumentMatchScore(searchTerm, document) {
  let score = 0;
  const searchLower = searchTerm.toLowerCase();
  const docNameLower = document.name.toLowerCase();
  const docPathLower = document.path.toLowerCase();
  const docFolderLower = (document.folder || "").toLowerCase();

  // Remove file extension for better matching
  const docNameNoExt = docNameLower.replace(/\.[^/.]+$/, "");
  const searchNoSpaces = searchLower.replace(/\s+/g, "");
  const docNameNoSpaces = docNameNoExt.replace(/\s+/g, "");

  // Exact matches (highest scores)
  if (docNameLower === searchLower) score += 100;
  if (docNameNoExt === searchLower) score += 95;
  if (docNameNoSpaces === searchNoSpaces) score += 90;

  // Contains matches
  if (docNameLower.includes(searchLower)) score += 50;
  if (docNameNoExt.includes(searchLower)) score += 45;
  if (searchLower.includes(docNameNoExt) && docNameNoExt.length > 3)
    score += 40;

  // Word boundary matches
  const searchWords = searchLower.split(/[\s\-_]+/).filter((w) => w.length > 2);
  const docWords = docNameNoExt.split(/[\s\-_]+/).filter((w) => w.length > 2);

  searchWords.forEach((searchWord) => {
    docWords.forEach((docWord) => {
      if (searchWord === docWord) score += 20;
      else if (docWord.includes(searchWord)) score += 10;
      else if (searchWord.includes(docWord)) score += 8;
    });
  });

  // Path and folder matches (lower scores)
  if (docPathLower.includes(searchLower)) score += 15;
  if (docFolderLower.includes(searchLower)) score += 10;

  // Partial matches with different approaches
  const searchPhonetic = searchLower.replace(/[^a-z0-9]/g, "");
  const docPhonetic = docNameNoExt.replace(/[^a-z0-9]/g, "");

  if (searchPhonetic.length > 3 && docPhonetic.includes(searchPhonetic)) {
    score += 25;
  }

  // Acronym matching (e.g., "Safety Policy" matches "SP")
  const searchAcronym = searchWords.map((w) => w[0]).join("");
  const docAcronym = docWords.map((w) => w[0]).join("");
  if (
    searchAcronym.length > 1 &&
    (searchAcronym === docAcronym || docNameLower.includes(searchAcronym))
  ) {
    score += 15;
  }

  return Math.round(score);
}

// Replace the placeholder findAlternative function in your ims-corrections.ejs:
function findAlternative(index) {
  const issue = suspiciousLinks[index];

  // Show loading state
  const button = event.target;
  const originalText = button.innerHTML;
  button.innerHTML =
    '<span class="spinner-border spinner-border-sm me-1"></span>Searching...';
  button.disabled = true;

  // Search for alternatives
  fetch("/api/search-document-alternatives", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      searchTerm: issue.searchTerm,
      excludeDocumentId: issue.currentDocument.id,
      categoryName: issue.category,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        showAlternativeSelectionModal(index, issue, data);
      } else {
        throw new Error(data.message);
      }
    })
    .catch((error) => {
      console.error("Search error:", error);
      showNotification(
        "Error searching for alternatives: " + error.message,
        "error"
      );
    })
    .finally(() => {
      button.innerHTML = originalText;
      button.disabled = false;
    });
}

// Modal for selecting alternatives
function showAlternativeSelectionModal(issueIndex, issue, searchData) {
  const modalHtml = `
    <div class="modal fade" id="alternativeModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fas fa-search me-2"></i>
              Find Alternative for "${issue.searchTerm}"
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <!-- Search Input -->
            <div class="mb-3">
              <label class="form-label">Search for different document:</label>
              <div class="input-group">
                <input type="text" class="form-control" id="alternativeSearch" 
                       value="${
                         issue.searchTerm
                       }" placeholder="Enter search term...">
                <button class="btn btn-outline-secondary" onclick="searchAlternatives()">
                  <i class="fas fa-search"></i> Search
                </button>
              </div>
            </div>
            
            <!-- Current Problem -->
            <div class="alert alert-warning mb-3">
              <strong>Current problematic link:</strong><br>
              <i class="fas fa-file me-1"></i> ${issue.currentDocument.name}<br>
              <small class="text-muted">${issue.currentDocument.path}</small>
            </div>
            
            <!-- Search Results -->
            <div id="alternativeResults">
              ${generateAlternativeResultsHtml(searchData)}
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if any
  const existingModal = document.getElementById("alternativeModal");
  if (existingModal) existingModal.remove();

  // Add new modal to page
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  // Store current issue data for later use
  window.currentAlternativeIssue = { issueIndex, issue, searchData };

  // Show modal
  const modal = new bootstrap.Modal(
    document.getElementById("alternativeModal")
  );
  modal.show();

  // Focus search input
  document.getElementById("alternativeSearch").focus();

  // Add enter key handler
  document
    .getElementById("alternativeSearch")
    .addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        searchAlternatives();
      }
    });
}

function generateAlternativeResultsHtml(data) {
  let html = "";

  if (data.primaryMatch) {
    html += `
      <div class="mb-3">
        <h6 class="text-success">
          <i class="fas fa-star me-1"></i> Best Match (Enhanced AI):
        </h6>
        <div class="card border-success">
          <div class="card-body py-2">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <strong>${data.primaryMatch.name}</strong><br>
                <small class="text-muted">${data.primaryMatch.path}</small>
              </div>
              <button class="btn btn-success btn-sm" 
                      onclick="selectAlternative('${data.primaryMatch.id}', '${data.primaryMatch.name}')">
                <i class="fas fa-check me-1"></i> Select This
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (data.alternatives && data.alternatives.length > 0) {
    html += `
      <h6><i class="fas fa-list me-1"></i> Other Matches (${data.alternatives.length}):</h6>
      <div class="alternative-list" style="max-height: 300px; overflow-y: auto;">
    `;

    data.alternatives.forEach((alt) => {
      const scoreColor =
        alt.score > 50 ? "success" : alt.score > 20 ? "warning" : "secondary";
      html += `
        <div class="card mb-2 border-light">
          <div class="card-body py-2">
            <div class="d-flex justify-content-between align-items-center">
              <div class="flex-grow-1">
                <div class="d-flex align-items-center">
                  <strong>${alt.name}</strong>
                  <span class="badge bg-${scoreColor} ms-2">${alt.score}%</span>
                </div>
                <div class="text-muted small mt-1">
                  <i class="fas fa-folder me-1"></i> ${alt.folder}
                  <span class="ms-2">
                    <i class="fas fa-calendar me-1"></i> ${new Date(
                      alt.modified
                    ).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <button class="btn btn-outline-primary btn-sm" 
                      onclick="selectAlternative('${alt.id}', '${alt.name}')">
                <i class="fas fa-link me-1"></i> Select
              </button>
            </div>
          </div>
        </div>
      `;
    });

    html += "</div>";
  } else {
    html += `
      <div class="text-center text-muted py-4">
        <i class="fas fa-search fa-2x mb-2"></i><br>
        No suitable alternatives found.<br>
        <small>Try a different search term or check your document library.</small>
      </div>
    `;
  }

  return html;
}

// Function to search for new alternatives
function searchAlternatives() {
  const searchTerm = document.getElementById("alternativeSearch").value.trim();
  if (!searchTerm) return;

  const resultsDiv = document.getElementById("alternativeResults");
  resultsDiv.innerHTML =
    '<div class="text-center py-4"><span class="spinner-border"></span> Searching...</div>';

  const currentIssue = window.currentAlternativeIssue.issue;

  fetch("/api/search-document-alternatives", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      searchTerm: searchTerm,
      excludeDocumentId: currentIssue.currentDocument.id,
      categoryName: currentIssue.category,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        resultsDiv.innerHTML = generateAlternativeResultsHtml(data);
      } else {
        throw new Error(data.message);
      }
    })
    .catch((error) => {
      console.error("Search error:", error);
      resultsDiv.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-triangle me-1"></i>
        Search failed: ${error.message}
      </div>
    `;
    });
}

// Function to select an alternative
function selectAlternative(documentId, documentName) {
  const modalElement = document.getElementById("alternativeModal");
  const modal = bootstrap.Modal.getInstance(modalElement);
  const { issueIndex, issue } = window.currentAlternativeIssue;

  // Close modal
  modal.hide();

  // Apply the selection (same as acceptSuggestion but with selected document)
  const originalIssue = suspiciousLinks[issueIndex];

  // Show loading
  showNotification("Applying alternative selection...", "info");

  // First unlink current document
  unlinkCurrentDocument(originalIssue)
    .then(() => {
      // Then link the selected alternative
      return linkDocument(
        originalIssue.searchTerm,
        documentId,
        originalIssue.category
      );
    })
    .then(() => {
      // Remove from suspicious links array
      suspiciousLinks.splice(issueIndex, 1);
      correctedCount++;
      updateStatistics();

      // Remove the card from display
      const card = document.querySelector(`[data-index="${issueIndex}"]`);
      if (card) {
        card.style.animation = "slideOut 0.3s ease";
        setTimeout(() => card.remove(), 300);
      }

      showNotification(
        `Successfully linked "${documentName}" to "${originalIssue.searchTerm}"!`,
        "success"
      );
    })
    .catch((error) => {
      console.error("Error applying alternative:", error);
      showNotification("Error applying alternative: " + error.message, "error");
    });
}

// API endpoint to scan for suspicious links
router.get("/api/scan-suspicious-links", (req, res) => {
  try {
    console.log("Scanning for suspicious auto-links...");

    const imsIndex = req.app.locals.loadIMSIndex();
    const suspiciousLinks = [];
    const learningPatterns = req.app.locals.loadLearningPatterns();

    // Analyze each category for suspicious links
    Object.keys(imsIndex).forEach((categoryName) => {
      const category = imsIndex[categoryName];

      if (
        category.enrichedChildren &&
        Array.isArray(category.enrichedChildren)
      ) {
        category.enrichedChildren.forEach((child) => {
          if (child.found && child.document) {
            const document = child.document;
            let suspicious = false;
            let reasons = [];
            let suggestedAlternative = null;

            // Check if it's a contractor document
            const isContractor = req.app.locals.isContractorDocument(
              document.path
            );
            if (isContractor) {
              suspicious = true;
              reasons.push("Document is in contractor/vendor folder");
            }

            // Check if it's an archived document
            const isArchived =
              req.app.locals.isArchivedDocument(document.path) ||
              document.isArchived;
            if (isArchived) {
              suspicious = true;
              reasons.push("Document appears to be archived or outdated");
            }

            // Check against negative patterns
            const negativePatterns = learningPatterns.negativePatterns || [];
            const hasNegativePattern = negativePatterns.some(
              (pattern) =>
                pattern.searchTerm === child.name.toLowerCase() &&
                pattern.avoidDocumentId === document.id
            );

            if (hasNegativePattern) {
              suspicious = true;
              reasons.push("Previously marked as incorrect by user");
            }

            // Try to find a better alternative if this link is suspicious
            if (suspicious) {
              try {
                const betterMatch =
                  req.app.locals.findDocumentByNameWithLearning(
                    child.name,
                    false // Don't include archived
                  );

                // Only suggest if it's different and better
                if (
                  betterMatch &&
                  betterMatch.id !== document.id &&
                  !req.app.locals.isContractorDocument(betterMatch.path) &&
                  !req.app.locals.isArchivedDocument(betterMatch.path)
                ) {
                  suggestedAlternative = {
                    id: betterMatch.id,
                    name: betterMatch.name,
                    path: betterMatch.path,
                    isArchived: betterMatch.isArchived || false,
                  };
                }
              } catch (error) {
                console.log(
                  `Could not find alternative for ${child.name}:`,
                  error.message
                );
              }
            }

            // Add to suspicious links if any issues found
            if (suspicious) {
              suspiciousLinks.push({
                searchTerm: child.name,
                category: categoryName,
                currentDocument: {
                  id: document.id,
                  name: document.name,
                  path: document.path,
                  isArchived: document.isArchived || false,
                },
                isContractor: isContractor,
                isArchived: isArchived,
                suspicious: true,
                reasons: reasons,
                suggestedAlternative: suggestedAlternative,
                autoLinked: child.autoLinked || false,
                linkedAt: child.linkedAt,
              });
            }
          }
        });
      }
    });

    console.log(`Found ${suspiciousLinks.length} suspicious links`);

    res.json({
      success: true,
      suspiciousLinks: suspiciousLinks,
      totalScanned: Object.keys(imsIndex).reduce(
        (sum, cat) =>
          sum +
          (imsIndex[cat].enrichedChildren
            ? imsIndex[cat].enrichedChildren.length
            : 0),
        0
      ),
      suspiciousCount: suspiciousLinks.length,
    });
  } catch (error) {
    console.error("Error scanning for suspicious links:", error);
    res.status(500).json({
      success: false,
      message: "Error scanning for suspicious links: " + error.message,
    });
  }
});

// API endpoint for bulk correction of suspicious links
router.post("/api/bulk-correct-links", (req, res) => {
  try {
    const { unlinkContractors, unlinkArchived, applyAlternatives } = req.body;
    console.log("Starting bulk correction with options:", {
      unlinkContractors,
      unlinkArchived,
      applyAlternatives,
    });

    const imsIndex = req.app.locals.loadIMSIndex();
    let correctedCount = 0;
    let unlinkedCount = 0;
    let alternativesApplied = 0;

    // Process each category
    Object.keys(imsIndex).forEach((categoryName) => {
      const category = imsIndex[categoryName];

      if (
        category.enrichedChildren &&
        Array.isArray(category.enrichedChildren)
      ) {
        // Process each child document
        category.enrichedChildren.forEach((child, childIndex) => {
          if (child.found && child.document) {
            const document = child.document;
            let shouldUnlink = false;
            let shouldReplace = false;
            let replacement = null;

            // Check if should unlink contractor documents
            if (
              unlinkContractors &&
              req.app.locals.isContractorDocument(document.path)
            ) {
              shouldUnlink = true;
              console.log(`Unlinking contractor document: ${document.name}`);

              // Record negative learning pattern
              req.app.locals.recordNegativeLearningPattern(
                child.name,
                document,
                "bulk_contractor_correction",
                categoryName
              );
            }

            // Check if should unlink archived documents
            if (
              unlinkArchived &&
              (req.app.locals.isArchivedDocument(document.path) ||
                document.isArchived)
            ) {
              shouldUnlink = true;
              console.log(`Unlinking archived document: ${document.name}`);

              // Record negative learning pattern
              req.app.locals.recordNegativeLearningPattern(
                child.name,
                document,
                "bulk_archive_correction",
                categoryName
              );
            }

            // Try to find alternatives if requested
            if (applyAlternatives && shouldUnlink) {
              try {
                const betterMatch =
                  req.app.locals.findDocumentByNameWithLearning(
                    child.name,
                    false // Don't include archived
                  );

                if (
                  betterMatch &&
                  betterMatch.id !== document.id &&
                  !req.app.locals.isContractorDocument(betterMatch.path) &&
                  !req.app.locals.isArchivedDocument(betterMatch.path)
                ) {
                  replacement = betterMatch;
                  shouldReplace = true;
                  shouldUnlink = false; // We're replacing, not just unlinking
                  console.log(
                    `Found replacement for ${child.name}: ${betterMatch.name}`
                  );
                }
              } catch (error) {
                console.log(`No suitable replacement found for ${child.name}`);
              }
            }

            // Apply the correction
            if (shouldReplace && replacement) {
              // Replace with better alternative
              category.enrichedChildren[childIndex].document = {
                id: replacement.id,
                name: replacement.name,
                path: replacement.path,
                isArchived: replacement.isArchived || false,
              };
              category.enrichedChildren[childIndex].found = true;
              category.enrichedChildren[childIndex].correctedAt =
                new Date().toISOString();
              category.enrichedChildren[childIndex].correctionType =
                "bulk_replacement";

              // Record positive learning pattern
              req.app.locals.learnFromManualLink(
                child.name,
                replacement,
                categoryName,
                "bulk_correction"
              );

              alternativesApplied++;
              correctedCount++;
            } else if (shouldUnlink) {
              // Just unlink the problematic document
              category.enrichedChildren[childIndex].document = null;
              category.enrichedChildren[childIndex].found = false;
              category.enrichedChildren[childIndex].unlinkedAt =
                new Date().toISOString();
              category.enrichedChildren[childIndex].unlinkReason =
                "bulk_correction";

              unlinkedCount++;
              correctedCount++;
            }
          }
        });
      }
    });

    // Save the updated IMS index
    if (req.app.locals.saveIMSIndex(imsIndex)) {
      console.log(
        `Bulk correction completed: ${correctedCount} total corrections`
      );
      console.log(`  - ${unlinkedCount} documents unlinked`);
      console.log(`  - ${alternativesApplied} alternatives applied`);

      res.json({
        success: true,
        message: `Bulk correction completed successfully`,
        correctedCount: correctedCount,
        unlinkedCount: unlinkedCount,
        alternativesApplied: alternativesApplied,
      });
    } else {
      throw new Error("Failed to save IMS index after corrections");
    }
  } catch (error) {
    console.error("Error in bulk correction:", error);
    res.status(500).json({
      success: false,
      message: "Bulk correction failed: " + error.message,
    });
  }
});

// API endpoint to search for alternative documents
router.post("/api/search-alternative-document", (req, res) => {
  try {
    const { searchTerm, excludeDocumentId } = req.body;

    if (!searchTerm) {
      return res.json({
        success: false,
        message: "Search term is required",
      });
    }

    console.log(`Searching for alternatives to: ${searchTerm}`);

    // Use the enhanced search function
    const foundDocument = req.app.locals.findDocumentByNameWithLearning
      ? req.app.locals.findDocumentByNameWithLearning(searchTerm, false)
      : req.app.locals.findDocumentByName(searchTerm, false);

    // Also search for partial matches in the document index
    const partialMatches = req.app.locals.documentIndex
      .filter((doc) => {
        // Exclude the current document
        if (excludeDocumentId && doc.id === excludeDocumentId) return false;

        // Exclude archived and contractor documents
        if (
          doc.isArchived ||
          req.app.locals.isArchivedDocument(doc.path) ||
          req.app.locals.isContractorDocument(doc.path)
        )
          return false;

        // Check for name matches
        const searchLower = searchTerm.toLowerCase();
        const docNameLower = doc.name.toLowerCase();
        const docPathLower = doc.path.toLowerCase();

        return (
          docNameLower.includes(searchLower) ||
          docPathLower.includes(searchLower) ||
          searchLower.includes(docNameLower.replace(/\.[^/.]+$/, ""))
        );
      })
      .slice(0, 10) // Limit to 10 results
      .map((doc) => ({
        id: doc.id,
        name: doc.name,
        path: doc.path,
        folder: doc.folder,
        modified: doc.modified,
        isArchived: doc.isArchived || false,
        score: calculateMatchScore(searchTerm, doc),
      }))
      .sort((a, b) => b.score - a.score);

    res.json({
      success: true,
      primaryMatch: foundDocument
        ? {
            id: foundDocument.id,
            name: foundDocument.name,
            path: foundDocument.path,
            folder: foundDocument.folder,
            modified: foundDocument.modified,
            isArchived: foundDocument.isArchived || false,
          }
        : null,
      alternatives: partialMatches,
      searchTerm: searchTerm,
    });
  } catch (error) {
    console.error("Error searching for alternatives:", error);
    res.status(500).json({
      success: false,
      message: "Search failed: " + error.message,
    });
  }
});

// Helper function to calculate match score
function calculateMatchScore(searchTerm, document) {
  let score = 0;
  const searchLower = searchTerm.toLowerCase();
  const docNameLower = document.name.toLowerCase();
  const docPathLower = document.path.toLowerCase();

  // Exact name match (highest score)
  if (docNameLower === searchLower) score += 100;
  else if (docNameLower.includes(searchLower)) score += 50;
  else if (searchLower.includes(docNameLower.replace(/\.[^/.]+$/, "")))
    score += 30;

  // Path matches
  if (docPathLower.includes(searchLower)) score += 10;

  // Word boundary matches
  const searchWords = searchLower.split(/\s+/);
  const docWords = docNameLower.split(/\s+/);

  searchWords.forEach((searchWord) => {
    docWords.forEach((docWord) => {
      if (searchWord === docWord) score += 20;
      else if (docWord.includes(searchWord)) score += 10;
    });
  });

  return score;
}

router.get("/api/scan-missing-items", (req, res) => {
  try {
    const imsIndex = req.app.locals.loadIMSIndex();
    const missingItems = [];

    Object.keys(imsIndex).forEach((categoryName) => {
      const category = imsIndex[categoryName];

      if (category.children && Array.isArray(category.children)) {
        category.children.forEach((childName) => {
          // Check if this child exists in enrichedChildren at all
          let enrichedChild = null;
          if (category.enrichedChildren) {
            enrichedChild = category.enrichedChildren.find(
              (ec) => ec.name === childName
            );
          }

          // Item is missing if:
          // 1. No enrichedChild exists at all, OR
          // 2. enrichedChild exists but has no document and found = false
          const isMissing =
            !enrichedChild || (!enrichedChild.found && !enrichedChild.document);

          if (isMissing) {
            missingItems.push({
              category: categoryName,
              documentName: childName,
              description: `Required document: ${childName}`,
              lastScanned: category.lastScanned || null,
              path: `${categoryName} > ${childName}`,
              reason: !enrichedChild
                ? "Never processed during scan"
                : "No document found",
            });
          }
        });
      }
    });

    console.log(`Found ${missingItems.length} missing items`);

    res.json({
      success: true,
      missingItems: missingItems,
      missingCount: missingItems.length,
      totalScanned: Object.keys(imsIndex).reduce(
        (sum, cat) =>
          sum + (imsIndex[cat].children ? imsIndex[cat].children.length : 0),
        0
      ),
    });
  } catch (error) {
    console.error("Error scanning for missing items:", error);
    res.status(500).json({
      success: false,
      message: "Error scanning for missing items: " + error.message,
    });
  }
});

// Enhanced corrections endpoint that includes both suspicious and missing
router.get("/api/corrections-data-enhanced", (req, res) => {
  try {
    const imsIndex = req.app.locals.loadIMSIndex();
    const suspiciousLinks = [];
    const missingItems = [];
    const learningPatterns = req.app.locals.loadLearningPatterns();

    Object.keys(imsIndex).forEach((categoryName) => {
      const category = imsIndex[categoryName];

      if (category.children && Array.isArray(category.children)) {
        category.children.forEach((childName) => {
          let enrichedChild = null;
          if (category.enrichedChildren) {
            enrichedChild = category.enrichedChildren.find(
              (ec) => ec.name === childName
            );
          }

          if (enrichedChild && enrichedChild.found && enrichedChild.document) {
            // Check if this is suspicious
            const document = enrichedChild.document;
            let suspicious = false;
            let reasons = [];

            // Your existing suspicious link detection logic
            const isContractor =
              req.app.locals.isContractorDocument &&
              req.app.locals.isContractorDocument(document.path);
            if (isContractor) {
              suspicious = true;
              reasons.push("Document is in contractor/vendor folder");
            }

            const isArchived =
              req.app.locals.isArchivedDocument &&
              (req.app.locals.isArchivedDocument(document.path) ||
                document.isArchived);
            if (isArchived) {
              suspicious = true;
              reasons.push("Document appears to be archived or outdated");
            }

            if (suspicious) {
              suspiciousLinks.push({
                searchTerm: childName,
                category: categoryName,
                currentDocument: document,
                reasons: reasons,
                suspicious: true,
              });
            }
          } else {
            // This is a missing item
            missingItems.push({
              category: categoryName,
              documentName: childName,
              description: `Required document: ${childName}`,
              path: `${categoryName} > ${childName}`,
              lastScanned: category.lastScanned || null,
            });
          }
        });
      }
    });

    res.json({
      success: true,
      suspiciousLinks: suspiciousLinks,
      missingItems: missingItems,
      stats: {
        totalSuspicious: suspiciousLinks.length,
        totalMissing: missingItems.length,
      },
    });
  } catch (error) {
    console.error("Error loading enhanced corrections data:", error);
    res.status(500).json({
      success: false,
      error: "Failed to load corrections data",
    });
  }
});

// Search endpoint for missing items (similar to your existing search)
router.post("/api/search-missing-document", (req, res) => {
  try {
    const { searchTerm, category } = req.body;

    if (!searchTerm) {
      return res.json({
        success: false,
        message: "Search term is required",
      });
    }

    console.log(`Searching for missing document: "${searchTerm}"`);

    // Use your existing enhanced search if available
    const foundDocument = req.app.locals.findDocumentByNameWithLearning
      ? req.app.locals.findDocumentByNameWithLearning(searchTerm, false)
      : null;

    // Get alternative matches using scoring
    const alternatives = req.app.locals.documentIndex
      .filter((doc) => {
        if (doc.isArchived) return false;
        if (
          req.app.locals.isArchivedDocument &&
          req.app.locals.isArchivedDocument(doc.path)
        )
          return false;
        if (
          req.app.locals.isContractorDocument &&
          req.app.locals.isContractorDocument(doc.path)
        )
          return false;
        return true;
      })
      .map((doc) => {
        const score = calculateDocumentMatchScore(searchTerm, doc);
        return { ...doc, score };
      })
      .filter((doc) => doc.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    res.json({
      success: true,
      searchTerm: searchTerm,
      category: category,
      primaryMatch: foundDocument,
      alternatives: alternatives,
      totalFound: alternatives.length,
    });
  } catch (error) {
    console.error("Error searching for missing document:", error);
    res.status(500).json({
      success: false,
      message: "Search failed: " + error.message,
    });
  }
});

// Link missing document endpoint
// Add this to ims-routes.js
router.post("/api/link-missing-document", (req, res) => {
  try {
    const { categoryName, documentName, documentId } = req.body;

    if (!categoryName || !documentName || !documentId) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters",
      });
    }

    const imsIndex = req.app.locals.loadIMSIndex();
    const actualDocument = req.app.locals.documentIndex.find(
      (doc) => doc.id === documentId
    );

    if (!actualDocument) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    if (!imsIndex[categoryName]) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Initialize enrichedChildren if needed
    if (!imsIndex[categoryName].enrichedChildren) {
      imsIndex[categoryName].enrichedChildren = [];
    }

    // Find existing enriched child or create new one
    let enrichedChildIndex = imsIndex[categoryName].enrichedChildren.findIndex(
      (ec) => ec.name === documentName
    );

    const enrichedChild = {
      name: documentName,
      document: {
        id: documentId,
        name: actualDocument.name,
        path: actualDocument.path,
        isArchived: actualDocument.isArchived || false,
      },
      found: true,
      linkedAt: new Date().toISOString(),
      linkedBy: "manual_missing_search",
    };

    if (enrichedChildIndex >= 0) {
      imsIndex[categoryName].enrichedChildren[enrichedChildIndex] =
        enrichedChild;
    } else {
      imsIndex[categoryName].enrichedChildren.push(enrichedChild);
    }

    // Save changes
    if (req.app.locals.saveIMSIndex(imsIndex)) {
      // Record learning pattern
      if (req.app.locals.learnFromManualLink) {
        req.app.locals.learnFromManualLink(
          documentName,
          actualDocument,
          categoryName,
          "missing_document_search"
        );
      }

      res.json({
        success: true,
        message: `Successfully linked "${actualDocument.name}" to "${documentName}"`,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to save changes",
      });
    }
  } catch (error) {
    console.error("Error linking missing document:", error);
    res.status(500).json({
      success: false,
      message: "Failed to link document: " + error.message,
    });
  }
});

// API endpoint to get correction statistics
router.get("/api/correction-statistics", (req, res) => {
  try {
    const imsIndex = req.app.locals.loadIMSIndex();
    const learningPatterns = req.app.locals.loadLearningPatterns();

    let totalLinked = 0;
    let contractorLinked = 0;
    let archivedLinked = 0;
    let correctedLinks = 0;
    let negativePatterns = (learningPatterns.negativePatterns || []).length;

    Object.values(imsIndex).forEach((category) => {
      if (category.enrichedChildren) {
        category.enrichedChildren.forEach((child) => {
          if (child.found && child.document) {
            totalLinked++;

            if (req.app.locals.isContractorDocument(child.document.path)) {
              contractorLinked++;
            }

            if (
              req.app.locals.isArchivedDocument(child.document.path) ||
              child.document.isArchived
            ) {
              archivedLinked++;
            }

            if (child.correctedAt || child.correctionType) {
              correctedLinks++;
            }
          }
        });
      }
    });

    res.json({
      success: true,
      statistics: {
        totalLinked,
        contractorLinked,
        archivedLinked,
        correctedLinks,
        negativePatterns,
        suspiciousPercentage:
          totalLinked > 0
            ? Math.round(
                ((contractorLinked + archivedLinked) / totalLinked) * 100
              )
            : 0,
      },
    });
  } catch (error) {
    console.error("Error getting correction statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get statistics: " + error.message,
    });
  }
});

router.get("/ims-corrections", (req, res) => {
  try {
    res.render("ims-corrections", {
      title: "IMS Auto-Link Corrections",
    });
  } catch (error) {
    console.error("Error loading corrections page:", error);
    res.status(500).send("Error loading corrections page");
  }
});
// Unlink category document
router.post("/api/unlink-category-document", (req, res) => {
  try {
    const { categoryName } = req.body;

    if (!categoryName) {
      return res.json({
        success: false,
        message: "Missing required parameter: categoryName",
      });
    }

    const imsIndex = req.app.locals.loadIMSIndex();

    if (!imsIndex[categoryName]) {
      return res.json({
        success: false,
        message: `Category "${categoryName}" not found`,
      });
    }

    // Store the old document info for learning (negative pattern)
    const oldDocument = imsIndex[categoryName].document;
    if (oldDocument) {
      // Record this as a negative learning pattern
      req.app.locals.recordNegativeLearningPattern(
        categoryName,
        oldDocument,
        "category_unlink"
      );
    }

    // Remove the document link
    imsIndex[categoryName].documentId = null;
    delete imsIndex[categoryName].document;

    if (req.app.locals.saveIMSIndex(imsIndex)) {
      console.log(
        `Successfully unlinked document from category: ${categoryName}`
      );
      res.json({
        success: true,
        message: `Successfully unlinked document from "${categoryName}"`,
      });
    } else {
      res.json({
        success: false,
        message: "Failed to save IMS structure",
      });
    }
  } catch (error) {
    console.error("Error unlinking category document:", error);
    res.json({
      success: false,
      message: "Internal server error: " + error.message,
    });
  }
});

// Unlink child document
router.post("/api/unlink-child-document", (req, res) => {
  try {
    const { categoryName, documentName } = req.body;

    if (!categoryName || !documentName) {
      return res.json({
        success: false,
        message: "Missing required parameters: categoryName or documentName",
      });
    }

    const imsIndex = req.app.locals.loadIMSIndex();

    if (!imsIndex[categoryName]) {
      return res.json({
        success: false,
        message: `Category "${categoryName}" not found`,
      });
    }

    if (!imsIndex[categoryName].enrichedChildren) {
      return res.json({
        success: false,
        message: "No child documents found for this category",
      });
    }

    // Find and unlink the specific child document
    const childIndex = imsIndex[categoryName].enrichedChildren.findIndex(
      (child) => child.name === documentName
    );

    if (childIndex === -1) {
      return res.json({
        success: false,
        message: `Child document "${documentName}" not found`,
      });
    }

    // Store the old document info for learning (negative pattern)
    const oldDocument =
      imsIndex[categoryName].enrichedChildren[childIndex].document;
    if (oldDocument) {
      req.app.locals.recordNegativeLearningPattern(
        documentName,
        oldDocument,
        "child_unlink",
        categoryName
      );
    }

    // Remove the document link but keep the child in the list
    imsIndex[categoryName].enrichedChildren[childIndex].document = null;
    imsIndex[categoryName].enrichedChildren[childIndex].found = false;
    imsIndex[categoryName].enrichedChildren[childIndex].unlinkedAt =
      new Date().toISOString();

    if (req.app.locals.saveIMSIndex(imsIndex)) {
      console.log(
        `Successfully unlinked child document: ${documentName} from ${categoryName}`
      );
      res.json({
        success: true,
        message: `Successfully unlinked "${documentName}"`,
      });
    } else {
      res.json({
        success: false,
        message: "Failed to save IMS structure",
      });
    }
  } catch (error) {
    console.error("Error unlinking child document:", error);
    res.json({
      success: false,
      message: "Internal server error: " + error.message,
    });
  }
});

// Document linking API
router.post("/api/link-ims-document", (req, res) => {
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
    const imsIndex = req.app.locals.loadIMSIndex();

    // Find the category
    if (!imsIndex[categoryName]) {
      return res.json({
        success: false,
        message: `Category "${categoryName}" not found`,
      });
    }

    // Get the actual document from the document index
    const actualDocument = req.app.locals.documentIndex.find(
      (doc) => doc.id === documentId
    );

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
    if (req.app.locals.saveIMSIndex(imsIndex)) {
      console.log("Successfully linked document");

      req.app.locals.learnFromManualLink(
        documentName,
        actualDocument,
        categoryName,
        "IMS"
      );

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
router.post("/api/link-category-document", (req, res) => {
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
    const imsIndex = req.app.locals.loadIMSIndex();

    // Find the category
    if (!imsIndex[categoryName]) {
      return res.json({
        success: false,
        message: `Category "${categoryName}" not found`,
      });
    }

    // Get the actual document from the document index
    const actualDocument = req.app.locals.documentIndex.find(
      (doc) => doc.id === documentId
    );

    if (!actualDocument) {
      return res.json({
        success: false,
        message: `Document with ID "${documentId}" not found`,
      });
    }

    // Link the document to the category itself (not to a child)
    imsIndex[categoryName].documentId = documentId;

    // Save the updated structure
    if (req.app.locals.saveIMSIndex(imsIndex)) {
      console.log("Successfully linked document to category");

      req.app.locals.learnFromManualLink(
        categoryName,
        actualDocument,
        categoryName,
        "IMS_Category"
      );

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
// Add these routes to your existing routes/ims-routes.js file

// Standard IMS auto-link documents
router.post("/api/auto-link-documents", (req, res) => {
  try {
    console.log("Starting IMS auto-link process...");

    // Load current IMS index
    const imsIndexPath = path.join(process.cwd(), "ims-document-index.json");
    const documentIndexPath = path.join(process.cwd(), "document-index.json");

    if (!fsSync.existsSync(imsIndexPath)) {
      return res.status(404).json({ error: "IMS document index not found" });
    }

    if (!fsSync.existsSync(documentIndexPath)) {
      return res.status(404).json({ error: "Document index not found" });
    }

    const imsIndex = JSON.parse(fsSync.readFileSync(imsIndexPath, "utf8"));
    const documentIndex = JSON.parse(
      fsSync.readFileSync(documentIndexPath, "utf8")
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
                autoLinked: true,
                usedLearning: false,
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
              existingEnriched.autoLinked = true;
              existingEnriched.usedLearning = false;
              linkedCount++;
            }
          }
        });
      }
    });

    // Save updated index
    fsSync.writeFileSync(imsIndexPath, JSON.stringify(imsIndex, null, 2));

    console.log(
      `IMS Auto-link completed: ${linkedCount} documents linked out of ${totalProcessed} processed`
    );

    res.json({
      success: true,
      message: `Auto-linked ${linkedCount} documents`,
      linkedCount: linkedCount,
      totalProcessed: totalProcessed,
      enhancedMatching: false,
    });
  } catch (error) {
    console.error("Error in IMS auto-link:", error);
    res.status(500).json({
      error: "Auto-link failed: " + error.message,
      success: false,
    });
  }
});

// IMS Statistics API
router.get("/api/ims-statistics", (req, res) => {
  try {
    const imsIndexPath = path.join(process.cwd(), "ims-document-index.json");

    if (!fsSync.existsSync(imsIndexPath)) {
      return res.json({
        totalCategories: 0,
        totalDocuments: 0,
        linkedDocuments: 0,
        completionRate: 0,
      });
    }

    const imsIndex = JSON.parse(fsSync.readFileSync(imsIndexPath, "utf8"));

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

// Enhanced auto-link API using learning patterns (the fancy one!)
router.post("/api/auto-link-documents-with-learning", async (req, res) => {
  try {
    const { checkRevisions } = req.body;
    console.log("Starting enhanced auto-link with learning...");

    // Load current IMS structure
    const imsIndexPath = path.join(process.cwd(), "ims-document-index.json");
    const documentIndexPath = path.join(process.cwd(), "document-index.json");

    if (!fsSync.existsSync(imsIndexPath)) {
      return res.status(404).json({
        success: false,
        error: "IMS document index not found",
      });
    }

    if (!fsSync.existsSync(documentIndexPath)) {
      return res.status(404).json({
        success: false,
        error: "Document index not found",
      });
    }

    const imsIndex = JSON.parse(fsSync.readFileSync(imsIndexPath, "utf8"));

    // Use the document index from app.locals if available, otherwise load from file
    const documentIndex =
      req.app.locals.documentIndex ||
      JSON.parse(fsSync.readFileSync(documentIndexPath, "utf8"));

    let linkedCount = 0;
    let learnedMatches = 0;
    let skippedArchived = 0;

    // Process each category
    Object.keys(imsIndex).forEach((categoryName) => {
      const category = imsIndex[categoryName];

      // Auto-link category document with learning
      if (!category.document && !category.documentId) {
        console.log(`Searching for category document: ${categoryName}`);
        const foundDoc = req.app.locals.findDocumentByNameWithLearning
          ? req.app.locals.findDocumentByNameWithLearning(categoryName, false)
          : null;
        if (foundDoc) {
          if (foundDoc.isArchived) {
            skippedArchived++;
            console.log(
              `Skipped archived document for category: ${categoryName}`
            );
          } else {
            category.documentId = foundDoc.id;
            linkedCount++;
            learnedMatches++;
            console.log(
              `✅ Linked category: ${categoryName} -> ${foundDoc.name}`
            );
          }
        } else {
          console.log(`❌ No match found for category: ${categoryName}`);
        }
      }

      // Auto-link child documents with learning
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
            console.log(`Searching for child document: ${childName}`);
            const foundDoc = req.app.locals.findDocumentByNameWithLearning
              ? req.app.locals.findDocumentByNameWithLearning(childName, false)
              : null;

            if (foundDoc) {
              if (foundDoc.isArchived) {
                skippedArchived++;
                console.log(
                  `Skipped archived document for child: ${childName}`
                );
              } else {
                // Check for revisions if requested
                let revisionInfo = null;
                if (checkRevisions) {
                  try {
                    const revisions = req.app.locals.getRevisionHistory
                      ? req.app.locals.getRevisionHistory(foundDoc.id)
                      : [];
                    if (revisions && revisions.length > 0) {
                      revisionInfo = {
                        revisionCount: revisions.length,
                        lastRevision: revisions[revisions.length - 1],
                      };
                      console.log(
                        `Found ${revisions.length} revisions for: ${childName}`
                      );
                    }
                  } catch (revError) {
                    console.log(
                      `Note: Could not check revisions for ${childName}`
                    );
                  }
                }

                // Create enriched child data
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
                  usedLearning: true,
                  linkedAt: new Date().toISOString(),
                };

                // Add revision info if available
                if (revisionInfo) {
                  childData.revisionInfo = revisionInfo;
                }

                // Update or add to enrichedChildren
                const childIndex = category.enrichedChildren.findIndex(
                  (child) => child.name === childName
                );

                if (childIndex >= 0) {
                  category.enrichedChildren[childIndex] = childData;
                } else {
                  category.enrichedChildren.push(childData);
                }

                linkedCount++;
                learnedMatches++;
                console.log(
                  `✅ Linked child: ${childName} -> ${foundDoc.name} (enhanced matching)`
                );
              }
            } else {
              console.log(`❌ No enhanced match found for: ${childName}`);
            }
          } else {
            console.log(`⭐ Already linked: ${childName}`);
          }
        });
      }
    });

    // Save updated IMS structure
    fsSync.writeFileSync(imsIndexPath, JSON.stringify(imsIndex, null, 2));
    console.log(
      `Enhanced auto-link completed: ${linkedCount} total, ${learnedMatches} using learning`
    );

    res.json({
      success: true,
      linked: linkedCount,
      learnedMatches: learnedMatches,
      skippedArchived: skippedArchived,
      message: `Successfully linked ${linkedCount} documents (${learnedMatches} using learned patterns)`,
      details: {
        totalProcessed: Object.keys(imsIndex).length,
        enhancedMatching: true,
        learningSystemActive: true,
      },
    });
  } catch (error) {
    console.error("Error in enhanced auto-linking:", error);
    res.status(500).json({
      success: false,
      error: "Enhanced auto-linking failed: " + error.message,
      message: "Error in enhanced auto-linking: " + error.message,
    });
  }
});

// Export IMS index
router.get("/api/export-ims-index", (req, res) => {
  try {
    const imsIndexPath = path.join(process.cwd(), "ims-document-index.json");

    if (!fsSync.existsSync(imsIndexPath)) {
      return res.status(404).json({ error: "IMS index not found" });
    }

    const imsIndex = JSON.parse(fsSync.readFileSync(imsIndexPath, "utf8"));

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

// Link/Unlink IMS documents
router.post("/api/link-ims-document", (req, res) => {
  try {
    const { category, document, id } = req.body;

    const imsIndexPath = path.join(process.cwd(), "ims-document-index.json");
    const documentIndexPath = path.join(process.cwd(), "document-index.json");

    const imsIndex = JSON.parse(fsSync.readFileSync(imsIndexPath, "utf8"));
    const documentIndex = JSON.parse(
      fsSync.readFileSync(documentIndexPath, "utf8")
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

    fsSync.writeFileSync(imsIndexPath, JSON.stringify(imsIndex, null, 2));

    res.json({ success: true, message: "Document linked successfully" });
  } catch (error) {
    console.error("Error linking IMS document:", error);
    res.status(500).json({ error: "Link failed: " + error.message });
  }
});

// Unlink IMS document
router.post("/api/unlink-ims-document", (req, res) => {
  try {
    const { category, document } = req.body;

    const imsIndexPath = path.join(process.cwd(), "ims-document-index.json");
    const imsIndex = JSON.parse(fsSync.readFileSync(imsIndexPath, "utf8"));

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

    fsSync.writeFileSync(imsIndexPath, JSON.stringify(imsIndex, null, 2));

    res.json({ success: true, message: "Document unlinked successfully" });
  } catch (error) {
    console.error("Error unlinking IMS document:", error);
    res.status(500).json({ error: "Unlink failed: " + error.message });
  }
});
// Document revision API
router.post(
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
      const originalDoc = req.app.locals.documentIndex.find(
        (doc) => doc.id === documentId
      );
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
      req.app.locals.saveRevisionLog(documentId, revisionLog);

      // Rebuild index to reflect changes
      setTimeout(() => {
        req.app.locals.buildFileIndex();
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
router.get("/api/mandatory-records", (req, res) => {
  try {
    const mandatoryRecords = req.app.locals.loadMandatoryRecords();

    // Auto-detect documents for each record type
    Object.keys(mandatoryRecords).forEach((recordType) => {
      const record = mandatoryRecords[recordType];

      // Preserve manually linked documents
      const manualDocs = (record.enrichedDocuments || []).filter(
        (doc) => !doc.autoDetected
      );

      // Auto-detect documents
      const keywords = record.autoDetectKeywords || [];
      const autoDetectedDocs = req.app.locals.documentIndex
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

// Add all your other existing IMS routes here...
// (I'll continue with a few more key ones, but you'll need to move all of them)

router.get("/api/ims-structure", (req, res) => {
  try {
    const imsIndex = req.app.locals.loadIMSIndex();
    res.json(imsIndex);
  } catch (err) {
    console.error("Error getting IMS structure:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/api/update-ims-category", (req, res) => {
  try {
    const { action, categoryName, newName, level, type, documentId, children } =
      req.body;
    const imsIndex = req.app.locals.loadIMSIndex();

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

      // Handle children array
      if (children !== undefined) {
        imsIndex[targetCategoryName].children = children;
        console.log(`Updated children for ${targetCategoryName}:`, children);
      }
    }

    if (req.app.locals.saveIMSIndex(imsIndex)) {
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

// Continue adding all your other IMS routes...
// You'll need to move ALL the routes that start with /api/ from your app.js to here

module.exports = router;
