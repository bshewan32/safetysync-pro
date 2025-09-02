// routes/document-routes.js - Document access and management routes
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

// ========================================
// DOCUMENT ACCESS ROUTES
// ========================================

// Open document directly
router.get("/open/:id", (req, res) => {
  try {
    const document = req.app.locals.documentIndex.find(
      (doc) => doc.id === req.params.id
    );

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check if file exists
    if (!fs.existsSync(document.path)) {
      return res.status(404).json({
        success: false,
        message: "File not found on disk",
      });
    }

    // Cross-platform file opening
    const platform = process.platform;
    let command;

    switch (platform) {
      case "win32":
        command = `start "" "${document.path}"`;
        break;
      case "darwin":
        command = `open "${document.path}"`;
        break;
      case "linux":
        command = `xdg-open "${document.path}"`;
        break;
      default:
        return res.status(500).json({
          success: false,
          message: "Unsupported platform",
        });
    }

    exec(command, (error) => {
      if (error) {
        console.error("Error opening document:", error);
        return res.status(500).json({
          success: false,
          message: "Error opening document: " + error.message,
        });
      }

      console.log(`Document accessed: ${document.name}`);

      // Log access if function is available
      if (req.app.locals.logDocumentAccess) {
        req.app.locals.logDocumentAccess(document, req.ip);
      }

      res.json({
        success: true,
        message: "Document opened successfully",
      });
    });
  } catch (err) {
    console.error("Error in open route:", err);
    res.status(500).json({
      success: false,
      message: "Server error: " + err.message,
    });
  }
});

// Show document location in file explorer
router.get("/api/document/show-location/:id", (req, res) => {
  try {
    const document = req.app.locals.documentIndex.find(
      (doc) => doc.id === req.params.id
    );

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    if (!fs.existsSync(document.path)) {
      return res.status(404).json({
        success: false,
        message: "File not found on disk",
      });
    }

    const platform = process.platform;
    let command;

    switch (platform) {
      case "win32":
        const windowsPath = document.path.replace(/\//g, "\\");
        command = `explorer /select,"${windowsPath}"`;
        break;
      case "darwin":
        command = `open -R "${document.path}"`;
        break;
      case "linux":
        const folderPath = path.dirname(document.path);
        command = `xdg-open "${folderPath}"`;
        break;
      default:
        return res.status(500).json({
          success: false,
          message: "Unsupported platform",
        });
    }

    console.log(`Executing command: ${command}`);

    exec(command, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        console.error("Primary command failed:", error.message);

        // For Windows, try alternative methods
        if (platform === "win32") {
          const folderPath = path.dirname(document.path);
          const altCommand = `explorer "${folderPath}"`;

          exec(altCommand, { windowsHide: true }, (altError) => {
            if (altError) {
              return res.json({
                success: false,
                message: "Could not open file location: " + altError.message,
              });
            }

            console.log(`Folder opened successfully: ${document.name}`);
            res.json({
              success: true,
              message: "Folder opened successfully",
            });
          });
        } else {
          return res.status(500).json({
            success: false,
            message: "Error showing document location: " + error.message,
          });
        }
      } else {
        console.log(`Document location shown successfully: ${document.name}`);
        res.json({
          success: true,
          message: "Document location opened successfully",
        });
      }
    });
  } catch (error) {
    console.error("Error in show-location route:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
});

// Get document metadata
// In routes/document-routes.js, replace the existing debug with:
router.get("/api/document/metadata/:id", (req, res) => {
  try {
    console.log("=== DOCUMENT METADATA DEBUG ===");
    console.log("Looking for document ID:", req.params.id);
    console.log(
      "app.locals.documentIndex length:",
      req.app.locals.documentIndex.length
    );

    // Check if any documents have similar IDs (maybe UUID format changed)
    const searchId = req.params.id;
    const similarIds = req.app.locals.documentIndex
      .filter(
        (doc) =>
          doc.id.includes(searchId.substr(0, 8)) ||
          searchId.includes(doc.id.substr(0, 8))
      )
      .map((doc) => ({ id: doc.id, name: doc.name }));

    console.log("Similar IDs found:", similarIds.length);
    if (similarIds.length > 0) {
      console.log("Similar IDs:", similarIds);
    }

    // Also check for documents with similar names to what might be in IMS
    console.log(
      "Sample document names:",
      req.app.locals.documentIndex
        .slice(0, 5)
        .map((d) => ({ id: d.id, name: d.name }))
    );

    const document = req.app.locals.documentIndex.find(
      (doc) => doc.id === req.params.id
    );

    if (!document) {
      console.log("=== DOCUMENT NOT FOUND ===");
      return res.status(404).json({
        success: false,
        message:
          "Document not found - ID mismatch between IMS and document index",
      });
    }

    // ... rest of existing code

    // ... rest of your existing code
    // // Check if file exists before getting stats
    // if (!fs.existsSync(document.path)) {
    //   return res.json({
    //     success: true,
    //     metadata: {
    //       id: document.id,
    //       name: document.name,
    //       path: document.path,
    //       folder: document.folder,
    //       extension: document.extension,
    //       fileExists: false,
    //       isArchived: document.isArchived || (req.app.locals.isArchivedDocument ? req.app.locals.isArchivedDocument(document.path) : false),
    //       canPreview: false,
    //       error: "File not found on disk"
    //     }
    //   });
    // }

    const stats = fs.statSync(document.path);

    // Helper functions - use from app.locals if available
    const formatFileSize =
      req.app.locals.formatFileSize ||
      ((bytes) => {
        if (bytes < 1024) return bytes + " B";
        else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + " KB";
        else if (bytes < 1073741824)
          return (bytes / 1048576).toFixed(2) + " MB";
        else return (bytes / 1073741824).toFixed(2) + " GB";
      });

    const canPreviewFile =
      req.app.locals.canPreviewFile ||
      ((filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const previewableExtensions = [".txt", ".md", ".json", ".csv", ".xml"];
        return previewableExtensions.includes(ext);
      });

    const getRevisionHistory = req.app.locals.getRevisionHistory || (() => []);
    const isArchivedDocument =
      req.app.locals.isArchivedDocument || (() => false);

    const metadata = {
      id: document.id,
      name: document.name,
      path: document.path,
      folder: document.folder,
      extension: document.extension,
      size: formatFileSize(stats.size),
      sizeBytes: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      isArchived: document.isArchived || isArchivedDocument(document.path),
      canPreview: canPreviewFile(document.path),
      fileExists: true,
      revisions: getRevisionHistory(document.id),
    };

    res.json({
      success: true,
      metadata,
    });
  } catch (error) {
    console.error("Error getting document metadata:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving document metadata: " + error.message,
    });
  }
});

// File download route
router.get("/file/:id/download", (req, res) => {
  try {
    const doc = req.app.locals.documentIndex.find(
      (d) => d.id === req.params.id
    );
    if (!doc) return res.status(404).send("Document not found");
    if (!fs.existsSync(doc.path)) return res.status(404).send("File missing");

    return res.download(doc.path, doc.name);
  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).send("Error downloading file");
  }
});

// File preview route
router.get("/file/:id/preview", (req, res) => {
  try {
    const doc = req.app.locals.documentIndex.find(
      (d) => d.id === req.params.id
    );
    if (!doc) return res.status(404).send("Document not found");
    if (!fs.existsSync(doc.path)) return res.status(404).send("File missing");

    const ext = path.extname(doc.path).toLowerCase();

    // Simple preview whitelist (text-ish files)
    const textTypes = {
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".json": "application/json",
      ".csv": "text/csv",
      ".xml": "application/xml",
    };

    if (textTypes[ext]) {
      res.setHeader("Content-Type", textTypes[ext]);
      return fs.createReadStream(doc.path).pipe(res);
    }

    // Common inline previews
    const inlineTypes = {
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
    };

    if (inlineTypes[ext]) {
      res.setHeader("Content-Type", inlineTypes[ext]);
      return fs.createReadStream(doc.path).pipe(res);
    }

    // Fallback: redirect to download
    return res.redirect(`/file/${doc.id}/download`);
  } catch (error) {
    console.error("Error previewing file:", error);
    res.status(500).send("Error previewing file");
  }
});

// Get document access log
router.get("/api/document-access-log/:id?", (req, res) => {
  try {
    const documentId = req.params.id;
    const logPath = path.join(process.cwd(), "data", "access-log.json");

    if (!fs.existsSync(logPath)) {
      return res.json({ success: true, accessLog: [] });
    }

    let accessLog = JSON.parse(fs.readFileSync(logPath, "utf8"));

    if (documentId) {
      accessLog = accessLog.filter((entry) => entry.documentId === documentId);
    }

    res.json({
      success: true,
      accessLog: accessLog.slice(-100), // Last 100 entries
    });
  } catch (error) {
    console.error("Error getting access log:", error);
    res.json({
      success: false,
      message: "Error retrieving access log",
    });
  }
});

// Get available documents for linking
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

// Rebuild index API
router.post("/api/rebuild-index", async (req, res) => {
  try {
    console.log("Rebuilding document index...");

    if (req.app.locals.buildFileIndex) {
      await req.app.locals.buildFileIndex();
    }

    res.json({
      success: true,
      documentCount: req.app.locals.documentIndex.length,
      message: "Index rebuilt successfully",
    });
  } catch (error) {
    console.error("Error rebuilding index:", error);
    res.status(500).json({
      success: false,
      message: "Failed to rebuild index: " + error.message,
    });
  }
});

module.exports = router;
