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
