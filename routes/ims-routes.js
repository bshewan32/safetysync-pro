// routes/ims-routes.js - Complete IMS routes moved from app.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const moment = require('moment');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../temp'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// IMS API ROUTES (moved from app.js)

router.get("/api/available-documents", (req, res) => {
  try {
    const search = req.query.search || "";
    const includeArchived = req.query.includeArchived === "true";

    let availableDocs = req.app.locals.documentIndex.map((doc) => ({
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

    req.app.locals.learnFromManualLink(originalSearch, actualDocument, category, recordType);

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

// Modified auto-link function to use learning
router.post("/api/auto-link-documents-with-learning", (req, res) => {
  try {
    const { checkRevisions } = req.body;
    const imsIndex = req.app.locals.loadIMSIndex();

    let linkedCount = 0;
    let learnedMatches = 0;

    Object.keys(imsIndex).forEach((categoryName) => {
      const category = imsIndex[categoryName];

      // Auto-link category document with learning
      if (!category.document && !category.documentId) {
        const foundDoc = req.app.locals.findDocumentByNameWithLearning(categoryName, false);
        if (foundDoc && !foundDoc.isArchived) {
          category.documentId = foundDoc.id;
          linkedCount++;
          learnedMatches++;
        }
      }

      // Auto-link child documents with learning
      if (category.children && category.children.length > 0) {
        if (!category.enrichedChildren) {
          category.enrichedChildren = [];
        }

        category.children.forEach((childName) => {
          const existingChild = category.enrichedChildren.find(
            (child) => child.name === childName
          );

          if (!existingChild || !existingChild.document) {
            const foundDoc = req.app.locals.findDocumentByNameWithLearning(childName, false);

            if (foundDoc && !foundDoc.isArchived) {
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
                usedLearning: true,
              };

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
            }
          }
        });
      }
    });

    if (req.app.locals.saveIMSIndex(imsIndex)) {
      res.json({
        success: true,
        linked: linkedCount,
        learnedMatches: learnedMatches,
        message: `Successfully linked ${linkedCount} documents (${learnedMatches} using learned patterns)`,
      });
    } else {
      res.json({
        success: false,
        message: "Error saving IMS structure",
      });
    }
  } catch (error) {
    console.error("Error in learning-enhanced auto-linking:", error);
    res.json({
      success: false,
      message: "Error in auto-linking: " + error.message,
    });
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
    const actualDocument = req.app.locals.documentIndex.find((doc) => doc.id === documentId);

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

      req.app.locals.learnFromManualLink(documentName, actualDocument, categoryName, "IMS");

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
    const actualDocument = req.app.locals.documentIndex.find((doc) => doc.id === documentId);

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

// Document revision API
router.post("/api/replace-document/:id", upload.single("newDocument"), async (req, res) => {
  try {
    const documentId = req.params.id;
    const { keepOriginal, revisionNote } = req.body;

    if (!req.file) {
      return res.json({ success: false, message: "No file uploaded" });
    }

    // Find the original document
    const originalDoc = req.app.locals.documentIndex.find((doc) => doc.id === documentId);
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
});

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
    const { action, categoryName, newName, level, type, documentId, children } = req.body;
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
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
});

// Continue adding all your other IMS routes...
// You'll need to move ALL the routes that start with /api/ from your app.js to here

module.exports = router;