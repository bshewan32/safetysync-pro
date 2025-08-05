// routes/isn-routes.js - ISNetwork specific routes (FIXED PATHS)
const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

// ISNetwork specific paths - FIXED to use root directory like IMS
const ISN_INDEX_PATH = path.join(__dirname, '../isn-document-index.json');
const ISN_MANDATORY_RECORDS_PATH = path.join(__dirname, '../isn-mandatory-records-index.json');
const ISN_REVISION_LOG_PATH = path.join(__dirname, '../data/isn-revision-log.json'); // Keep revision logs in data

// ISNetwork utility functions
function loadISNIndex() {
  try {
    if (fs.existsSync(ISN_INDEX_PATH)) {
      return JSON.parse(fs.readFileSync(ISN_INDEX_PATH, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading ISN index:', error);
  }
  
  // Return default ISNetwork structure
  return {
    "Network Security Policy": {
      "level": 1,
      "type": "policy",
      "description": "Core network security policy and governance framework",
      "documentId": null,
      "children": [
        "Information Security Policy",
        "Network Access Control Policy",
        "Data Classification Policy",
        "Incident Response Policy"
      ]
    },
    "Network Infrastructure": {
      "level": 2,
      "type": "category", 
      "description": "Network infrastructure documentation and procedures",
      "documentId": null,
      "children": [
        "Network Architecture Diagram",
        "Network Configuration Standards",
        "Firewall Configuration Guide",
        "Network Monitoring Procedures",
        "Network Backup and Recovery Plan"
      ]
    },
    "Access Control & Authentication": {
      "level": 2,
      "type": "category",
      "description": "User access management and authentication procedures",
      "documentId": null,
      "children": [
        "User Access Management Procedure",
        "Password Policy",
        "Multi-Factor Authentication Setup",
        "Privileged Account Management",
        "Access Review Procedures"
      ]
    },
    "Security Monitoring & Incident Response": {
      "level": 2,
      "type": "category",
      "description": "Security monitoring, logging, and incident management",
      "documentId": null,
      "children": [
        "Security Monitoring Plan",
        "Log Management Procedure",
        "Incident Response Playbook",
        "Vulnerability Assessment Procedure", 
        "Security Event Analysis Guide"
      ]
    },
    "Compliance & Audit": {
      "level": 2,
      "type": "category",
      "description": "Compliance documentation and audit requirements",
      "documentId": null,
      "children": [
        "Compliance Checklist",
        "Audit Documentation Template",
        "Risk Assessment Procedure",
        "Security Control Matrix",
        "Compliance Reporting Template"
      ]
    },
    "Data Protection & Privacy": {
      "level": 2,
      "type": "category",
      "description": "Data protection, encryption, and privacy controls",
      "documentId": null,
      "children": [
        "Data Encryption Standards",
        "Data Retention Policy",
        "Privacy Impact Assessment",
        "Data Breach Response Plan",
        "Data Transfer Procedures"
      ]
    },
    "Network Operations": {
      "level": 2,
      "type": "category",
      "description": "Day-to-day network operations and maintenance",
      "documentId": null,
      "children": [
        "Network Maintenance Schedule",
        "Change Management Procedure",
        "Network Performance Monitoring",
        "Capacity Planning Guide",
        "Service Level Agreements"
      ]
    },
    "Training & Awareness": {
      "level": 2,
      "type": "category",
      "description": "Security training and awareness programs",
      "documentId": null,
      "children": [
        "Security Awareness Training Plan",
        "Phishing Simulation Program",
        "New Employee Security Orientation",
        "Ongoing Training Requirements",
        "Security Awareness Metrics"
      ]
    }
  };
}

function saveISNIndex(isnIndex) {
  try {
    fs.writeFileSync(ISN_INDEX_PATH, JSON.stringify(isnIndex, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving ISN index:', error);
    return false;
  }
}

function loadISNMandatoryRecords() {
  try {
    if (fs.existsSync(ISN_MANDATORY_RECORDS_PATH)) {
      return JSON.parse(fs.readFileSync(ISN_MANDATORY_RECORDS_PATH, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading ISN mandatory records:', error);
  }
  
  // Return default ISNetwork mandatory records
  return {
    "Network Security Audit": {
      "description": "Network security assessment and audit documentation",
      "autoDetectKeywords": ["network audit", "security audit", "network assessment", "security assessment", "network review"],
      "enrichedDocuments": [],
      "category": "audit"
    },
    "Vulnerability Assessment Report": {
      "description": "Network vulnerability scanning and assessment reports",
      "autoDetectKeywords": ["vulnerability", "vuln scan", "security scan", "penetration test", "pen test"],
      "enrichedDocuments": [],
      "category": "assessment"
    },
    "Network Architecture Documentation": {
      "description": "Current network topology and architecture diagrams",
      "autoDetectKeywords": ["network diagram", "topology", "architecture", "network map", "infrastructure map"],
      "enrichedDocuments": [],
      "category": "documentation"
    },
    "Firewall Configuration": {
      "description": "Current firewall rules and configuration documentation",
      "autoDetectKeywords": ["firewall", "firewall config", "firewall rules", "network security config"],
      "enrichedDocuments": [],
      "category": "configuration"
    },
    "Access Control Review": {
      "description": "User access review and management documentation",
      "autoDetectKeywords": ["access review", "user review", "access audit", "permission review", "user access"],
      "enrichedDocuments": [],
      "category": "access"
    },
    "Incident Response Log": {
      "description": "Security incident tracking and response documentation",
      "autoDetectKeywords": ["incident", "security incident", "incident response", "security event", "breach"],
      "enrichedDocuments": [],
      "category": "incident"
    },
    "Network Monitoring Logs": {
      "description": "Network monitoring and logging evidence",
      "autoDetectKeywords": ["network log", "monitoring", "network monitoring", "security log", "system log"],
      "enrichedDocuments": [],
      "category": "monitoring"
    },
    "Backup and Recovery Plan": {
      "description": "Network backup and disaster recovery documentation",
      "autoDetectKeywords": ["backup", "recovery", "disaster recovery", "business continuity", "backup plan"],
      "enrichedDocuments": [],
      "category": "continuity"
    },
    "Security Training Records": {
      "description": "Security awareness training completion records",
      "autoDetectKeywords": ["security training", "awareness training", "training record", "security education"],
      "enrichedDocuments": [],
      "category": "training"
    },
    "Compliance Checklist": {
      "description": "ISNetwork compliance verification checklist",
      "autoDetectKeywords": ["compliance", "checklist", "compliance check", "audit checklist", "verification"],
      "enrichedDocuments": [],
      "category": "compliance"
    }
  };
}

function saveISNMandatoryRecords(records) {
  try {
    fs.writeFileSync(ISN_MANDATORY_RECORDS_PATH, JSON.stringify(records, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving ISN mandatory records:', error);
    return false;
  }
}

function saveISNRevisionLog(documentId, revisionLog) {
  try {
    let logs = {};
    if (fs.existsSync(ISN_REVISION_LOG_PATH)) {
      logs = JSON.parse(fs.readFileSync(ISN_REVISION_LOG_PATH, 'utf8'));
    }
    
    if (!logs[documentId]) {
      logs[documentId] = [];
    }
    
    logs[documentId].push(revisionLog);
    
    fs.ensureDirSync(path.dirname(ISN_REVISION_LOG_PATH));
    fs.writeFileSync(ISN_REVISION_LOG_PATH, JSON.stringify(logs, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving ISN revision log:', error);
    return false;
  }
}

// ISNetwork Routes

// Main ISNetwork page
router.get('/isn-index', (req, res) => {
  try {
    const isnIndex = loadISNIndex();
    
    // Enrich ISN structure with actual documents (similar to IMS enrichment)
    Object.keys(isnIndex).forEach(categoryName => {
      const category = isnIndex[categoryName];
      
      // Get actual document if documentId is set
      if (category.documentId) {
        const actualDoc = req.app.locals.documentIndex.find(doc => doc.id === category.documentId);
        if (actualDoc) {
          category.document = {
            id: actualDoc.id,
            name: actualDoc.name,
            path: actualDoc.path,
            isArchived: actualDoc.isArchived || false
          };
        }
      }
      
      // Enrich children with actual documents
      if (category.children && category.children.length > 0) {
        if (!category.enrichedChildren) {
          category.enrichedChildren = [];
        }
        
        category.children.forEach(childName => {
          let existingChild = category.enrichedChildren.find(child => child.name === childName);
          if (!existingChild) {
            // Try to find document using learning
            const foundDoc = req.app.locals.findDocumentByNameWithLearning ? 
              req.app.locals.findDocumentByNameWithLearning(childName, false) : 
              req.app.locals.findDocumentByName(childName, false);
            
            existingChild = {
              name: childName,
              document: foundDoc ? {
                id: foundDoc.id,
                name: foundDoc.name,
                path: foundDoc.path,
                isArchived: foundDoc.isArchived || false
              } : null,
              found: !!foundDoc
            };
            category.enrichedChildren.push(existingChild);
          }
        });
      }
    });
    
    res.render('isn-index', {
      title: 'ISNetwork Document Management',
      isnIndex: isnIndex,
      moment: moment
    });
  } catch (error) {
    console.error('Error loading ISN index page:', error);
    res.status(500).send('Error loading ISNetwork page');
  }
});

// Get ISN structure API
router.get('/api/isn-structure', (req, res) => {
  try {
    const isnIndex = loadISNIndex();
    res.json(isnIndex);
  } catch (error) {
    console.error('Error getting ISN structure:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update ISN category
router.post('/api/update-isn-category', (req, res) => {
  try {
    const { action, categoryName, newName, level, type, documentId, children } = req.body;
    const isnIndex = loadISNIndex();

    console.log('Update ISN category request:', { action, categoryName, newName, level, type, children });

    if (action === 'create') {
      if (isnIndex[categoryName]) {
        return res.json({ success: false, message: `Category "${categoryName}" already exists` });
      }

      isnIndex[categoryName] = {
        type: type || 'category',
        level: level || 2,
        documentId: null,
        children: children || []
      };
    } else if (action === 'update') {
      if (!isnIndex[categoryName]) {
        return res.json({ success: false, message: `Category "${categoryName}" not found` });
      }

      let targetCategoryName = categoryName;

      if (newName && newName !== categoryName) {
        if (isnIndex[newName]) {
          return res.json({ success: false, message: `Category "${newName}" already exists` });
        }

        isnIndex[newName] = { ...isnIndex[categoryName] };
        delete isnIndex[categoryName];
        targetCategoryName = newName;
      }

      if (level) isnIndex[targetCategoryName].level = parseInt(level);
      if (type) isnIndex[targetCategoryName].type = type;
      if (documentId !== undefined) {
        isnIndex[targetCategoryName].documentId = documentId || null;
      }
      if (children !== undefined) {
        isnIndex[targetCategoryName].children = children;
      }
    }

    if (saveISNIndex(isnIndex)) {
      res.json({ success: true, message: 'ISN Category updated successfully' });
    } else {
      res.json({ success: false, message: 'Failed to save changes' });
    }
  } catch (error) {
    console.error('Error updating ISN category:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

// Delete ISN category
router.delete('/api/delete-isn-category/:categoryName', (req, res) => {
  try {
    const { categoryName } = req.params;
    const isnIndex = loadISNIndex();

    if (!isnIndex[categoryName]) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    delete isnIndex[categoryName];
    saveISNIndex(isnIndex);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting ISN category:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Auto-link ISN documents
router.post('/api/auto-link-isn-documents', (req, res) => {
  try {
    const isnIndex = loadISNIndex();
    let linkedCount = 0;

    Object.keys(isnIndex).forEach(categoryName => {
      const category = isnIndex[categoryName];
      
      // Auto-link category document if not already linked
      if (!category.document && !category.documentId) {
        const foundDoc = req.app.locals.findDocumentByNameWithLearning ? 
          req.app.locals.findDocumentByNameWithLearning(categoryName, false) :
          req.app.locals.findDocumentByName(categoryName, false);
        
        if (foundDoc && !foundDoc.isArchived) {
          category.documentId = foundDoc.id;
          linkedCount++;
        }
      }
      
      // Auto-link child documents
      if (category.children && category.children.length > 0) {
        if (!category.enrichedChildren) {
          category.enrichedChildren = [];
        }

        category.children.forEach(childName => {
          const existingChild = category.enrichedChildren.find(child => child.name === childName);
          
          if (!existingChild || !existingChild.document) {
            const foundDoc = req.app.locals.findDocumentByNameWithLearning ? 
              req.app.locals.findDocumentByNameWithLearning(childName, false) :
              req.app.locals.findDocumentByName(childName, false);
            
            if (foundDoc && !foundDoc.isArchived) {
              const childData = {
                name: childName,
                document: {
                  id: foundDoc.id,
                  name: foundDoc.name,
                  path: foundDoc.path,
                  isArchived: foundDoc.isArchived || false
                },
                found: true,
                autoLinked: true,
                linkedAt: new Date().toISOString()
              };

              const childIndex = category.enrichedChildren.findIndex(child => child.name === childName);
              if (childIndex >= 0) {
                category.enrichedChildren[childIndex] = childData;
              } else {
                category.enrichedChildren.push(childData);
              }
              
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
        message: `Successfully linked ${linkedCount} ISN documents`
      });
    } else {
      res.json({ success: false, message: 'Error saving ISN structure' });
    }
  } catch (error) {
    console.error('Error in ISN auto-linking:', error);
    res.json({ success: false, message: 'Error in auto-linking: ' + error.message });
  }
});

// ISN Mandatory Records
router.get('/api/isn-mandatory-records', (req, res) => {
  try {
    const mandatoryRecords = loadISNMandatoryRecords();
    
    // Auto-detect documents for each record type (similar to IMS)
    Object.keys(mandatoryRecords).forEach(recordType => {
      const record = mandatoryRecords[recordType];
      const keywords = record.autoDetectKeywords || [];
      
      const autoDetectedDocs = req.app.locals.documentIndex
        .filter(doc => {
          if (doc.isArchived) return false;
          
          const searchText = (doc.name + ' ' + doc.folder + ' ' + doc.relativePath).toLowerCase();
          return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
        })
        .map(doc => ({
          id: doc.id,
          name: doc.name,
          path: doc.path,
          folder: doc.folder,
          modified: doc.modified,
          created: doc.created,
          isArchived: doc.isArchived || false,
          autoDetected: true,
          matchedKeywords: keywords.filter(keyword => 
            (doc.name + ' ' + doc.folder).toLowerCase().includes(keyword.toLowerCase())
          )
        }));
      
      record.enrichedDocuments = autoDetectedDocs;
    });
    
    res.json({
      success: true,
      mandatoryRecords: mandatoryRecords
    });
  } catch (error) {
    console.error('Error getting ISN mandatory records:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Link ISN mandatory record
router.post('/api/link-isn-mandatory-record', (req, res) => {
  try {
    const { recordType, documentId, actualDocumentName } = req.body;
    
    if (!recordType || !documentId) {
      return res.json({
        success: false,
        message: 'Missing required parameters: recordType or documentId'
      });
    }

    const mandatoryRecords = loadISNMandatoryRecords();
    
    if (!mandatoryRecords[recordType]) {
      return res.json({
        success: false,
        message: `Record type "${recordType}" not found`
      });
    }

    const actualDocument = req.app.locals.documentIndex.find(doc => doc.id === documentId);
    if (!actualDocument) {
      return res.json({
        success: false,
        message: `Document with ID "${documentId}" not found`
      });
    }

    if (!mandatoryRecords[recordType].enrichedDocuments) {
      mandatoryRecords[recordType].enrichedDocuments = [];
    }

    // Check if document already exists
    const existingDocIndex = mandatoryRecords[recordType].enrichedDocuments.findIndex(
      doc => doc.id === documentId
    );

    if (existingDocIndex !== -1) {
      mandatoryRecords[recordType].enrichedDocuments[existingDocIndex].manuallyLinked = true;
      mandatoryRecords[recordType].enrichedDocuments[existingDocIndex].autoDetected = false;
    } else {
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
        linkedAt: new Date().toISOString()
      });
    }

    mandatoryRecords[recordType].lastUpdated = new Date().toISOString();

    if (saveISNMandatoryRecords(mandatoryRecords)) {
      res.json({
        success: true,
        message: `Successfully linked "${actualDocumentName}" to "${recordType}"`
      });
    } else {
      res.json({ success: false, message: 'Failed to save mandatory records' });
    }
  } catch (error) {
    console.error('Error linking ISN mandatory record:', error);
    res.json({ success: false, message: 'Internal server error: ' + error.message });
  }
});

// Auto-detect ISN mandatory records
router.post('/api/auto-detect-isn-mandatory-records', (req, res) => {
  try {
    const mandatoryRecords = loadISNMandatoryRecords();
    let detectionCount = 0;
    
    Object.keys(mandatoryRecords).forEach(recordType => {
      const record = mandatoryRecords[recordType];
      const keywords = record.autoDetectKeywords || [];
      
      const matchingDocs = req.app.locals.documentIndex.filter(doc => {
        if (doc.isArchived) return false;
        
        const searchText = (doc.name + ' ' + doc.folder + ' ' + doc.relativePath).toLowerCase();
        return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
      });
      
      record.enrichedDocuments = matchingDocs.map(doc => ({
        id: doc.id,
        name: doc.name,
        path: doc.path,
        folder: doc.folder,
        modified: doc.modified,
        created: doc.created,
        isArchived: doc.isArchived || false,
        autoDetected: true,
        matchedKeywords: keywords.filter(keyword => 
          (doc.name + ' ' + doc.folder).toLowerCase().includes(keyword.toLowerCase())
        )
      }));
      
      detectionCount += matchingDocs.length;
    });
    
    saveISNMandatoryRecords(mandatoryRecords);
    
    res.json({
      success: true,
      message: `Auto-detection completed. Found ${detectionCount} potential ISN matches.`,
      detectedCount: detectionCount
    });
  } catch (error) {
    console.error('Error in ISN auto-detection:', error);
    res.json({ success: false, message: 'Error in auto-detection: ' + error.message });
  }
});

module.exports = router;