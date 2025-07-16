// Fixed IMS Index JavaScript - Clean Version
document.addEventListener("DOMContentLoaded", function () {
  console.log("🚀 IMS Index JavaScript loading...");

  // Initialize all components
  initializeStatistics();
  initializeSearch();
  initializeFilters();
  initializeEventHandlers();
  loadMandatoryRecords();

  console.log("✅ IMS Index JavaScript loaded successfully");
});

// ========================================
// INITIALIZATION FUNCTIONS
// ========================================

function initializeStatistics() {
  if (window.imsStats) {
    const linkedCountEl = document.getElementById("linkedCount");
    const missingCountEl = document.getElementById("missingCount");
    const coveragePercentEl = document.getElementById("coveragePercent");

    if (linkedCountEl) linkedCountEl.textContent = window.imsStats.linkedDocuments;
    if (missingCountEl) missingCountEl.textContent = window.imsStats.missingDocuments;

    if (coveragePercentEl && window.imsStats.totalDocuments > 0) {
      const coverage = Math.round((window.imsStats.linkedDocuments / window.imsStats.totalDocuments) * 100);
      coveragePercentEl.textContent = coverage + "%";
    }
  }
}

function initializeSearch() {
  const searchInput = document.getElementById("imsSearch");
  if (searchInput) {
    searchInput.addEventListener("input", debounce(filterIMSIndex, 300));
  }
}

function initializeFilters() {
  const filterSelect = document.getElementById("imsFilter");
  const hideArchivedCheck = document.getElementById("hideArchivedCheck");

  if (filterSelect) {
    filterSelect.addEventListener("change", filterIMSIndex);
  }

  if (hideArchivedCheck) {
    hideArchivedCheck.addEventListener("change", toggleArchivedDocuments);
  }
}

function initializeEventHandlers() {
  // Single event delegation for all button clicks
  document.addEventListener("click", handleButtonClicks);
  
  // Modal-specific handlers
  setupModalHandlers();
}

function setupModalHandlers() {
  // Auto-link button
  const autoLinkBtn = document.getElementById("autoLinkBtn");
  if (autoLinkBtn) {
    autoLinkBtn.addEventListener("click", autoLinkDocuments);
  }

  // Add category button
  const addCategoryBtn = document.getElementById("addCategoryBtn");
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener("click", handleAddCategory);
  }

  // Auto-detect mandatory records button
  const autoDetectBtn = document.getElementById("autoDetectMandatoryBtn");
  if (autoDetectBtn) {
    autoDetectBtn.addEventListener("click", autoDetectMandatoryRecords);
  }

  // Mandatory modal handlers
  const mandatoryRecordSelect = document.getElementById("mandatoryRecordSelect");
  if (mandatoryRecordSelect) {
    mandatoryRecordSelect.addEventListener("change", loadMandatoryRecordSettings);
  }

  const updateMandatoryBtn = document.getElementById("updateMandatoryBtn");
  if (updateMandatoryBtn) {
    updateMandatoryBtn.addEventListener("click", updateMandatoryRecordSettings);
  }
}

// ========================================
// MAIN EVENT HANDLER - SINGLE DELEGATION
// ========================================

function handleButtonClicks(e) {
  // Stop multiple event firing
  e.stopPropagation();

  // AI Generate buttons
  if (e.target.closest(".ai-generate-btn")) {
    e.preventDefault();
    const btn = e.target.closest(".ai-generate-btn");
    const categoryName = btn.getAttribute("data-category");
    const documentName = btn.getAttribute("data-document");
    openAIGenerationModal(categoryName, documentName);
    return;
  }

  // Category link buttons
  if (e.target.closest(".category-link-btn")) {
    e.preventDefault();
    const btn = e.target.closest(".category-link-btn");
    const categoryName = btn.getAttribute("data-category");
    const documentName = btn.getAttribute("data-document-name");
    openCategoryDocumentLinker(categoryName, documentName);
    return;
  }

  // Category revision buttons
  if (e.target.closest(".category-revision-btn")) {
    e.preventDefault();
    const btn = e.target.closest(".category-revision-btn");
    const documentId = btn.getAttribute("data-document-id");
    const documentName = btn.getAttribute("data-document-name");
    openRevisionModal(documentId, documentName);
    return;
  }

  // Manage category buttons
  if (e.target.closest(".manage-category-btn")) {
    e.preventDefault();
    const btn = e.target.closest(".manage-category-btn");
    const categoryName = btn.getAttribute("data-category");
    openCategoryEditor(categoryName);
    return;
  }

  // Manage document buttons
  if (e.target.closest(".manage-document-btn")) {
    e.preventDefault();
    const btn = e.target.closest(".manage-document-btn");
    const categoryName = btn.getAttribute("data-category");
    const documentName = btn.getAttribute("data-document");
    openDocumentLinker(categoryName, documentName);
    return;
  }

  // Auto-detected item clicks
  if (e.target.closest(".auto-detected-item")) {
    e.preventDefault();
    const item = e.target.closest(".auto-detected-item");
    const docId = item.getAttribute("data-doc-id");
    const docName = item.getAttribute("data-doc-name");
    const recordType = item.getAttribute("data-record-type");
    const isArchived = item.getAttribute("data-is-archived") === "true";

    let confirmMessage = `Link "${docName}" to mandatory record "${recordType}"?`;
    if (isArchived) {
      confirmMessage += "\n\n⚠️ WARNING: This document is archived and may be outdated.";
    }

    if (confirm(confirmMessage)) {
      linkMandatoryDocument(recordType, docId, docName);
    }
    return;
  }

  // Unlink mandatory record buttons
  if (e.target.closest(".unlink-mandatory-btn")) {
    e.preventDefault();
    const btn = e.target.closest(".unlink-mandatory-btn");
    const recordType = btn.getAttribute("data-record-type");
    const documentId = btn.getAttribute("data-document-id");
    unlinkMandatoryDocument(recordType, documentId);
    return;
  }

  // Link mandatory record buttons
  if (e.target.closest(".link-mandatory-btn")) {
    e.preventDefault();
    const btn = e.target.closest(".link-mandatory-btn");
    const recordType = btn.getAttribute("data-record-type");
    openMandatoryDocumentLinker(recordType);
    return;
  }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function filterIMSIndex() {
  const searchTerm = document.getElementById("imsSearch")?.value.toLowerCase() || "";
  const filterType = document.getElementById("imsFilter")?.value || "all";
  const hideArchived = document.getElementById("hideArchivedCheck")?.checked || false;

  document.querySelectorAll(".ims-category").forEach((category) => {
    const categoryText = category.textContent.toLowerCase();
    const categoryType = category.getAttribute("data-type");
    const hasLinked = category.querySelector(".fa-check-circle");
    const hasMissing = category.querySelector(".fa-times-circle");
    const hasArchived = category.querySelector(".ims-document-archived");

    let showCategory = true;

    // Search filter
    if (searchTerm && !categoryText.includes(searchTerm)) {
      showCategory = false;
    }

    // Type filter
    if (filterType !== "all") {
      if (filterType === "linked" && !hasLinked) showCategory = false;
      if (filterType === "missing" && !hasMissing) showCategory = false;
      if (filterType === "policies" && categoryType !== "policy") showCategory = false;
      if (filterType === "procedures" && categoryType !== "category") showCategory = false;
      if (filterType === "archived" && !hasArchived) showCategory = false;
    }

    category.style.display = showCategory ? "block" : "none";
  });

  toggleArchivedDocuments();
}

function toggleArchivedDocuments() {
  const hideArchived = document.getElementById("hideArchivedCheck")?.checked || false;
  const archivedItems = document.querySelectorAll(".ims-document-archived");

  archivedItems.forEach((item) => {
    item.style.display = hideArchived ? "none" : "";
  });
}

// ========================================
// MODAL FUNCTIONS - CLEAN IMPLEMENTATIONS
// ========================================

function openAIGenerationModal(categoryName, documentName) {
  console.log("Opening AI generation modal for:", documentName);

  const modalHtml = `
    <div class="modal fade" id="aiGenerateModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fas fa-robot text-success"></i> 
              AI Generate: ${documentName}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info">
              <i class="fas fa-lightbulb"></i>
              <strong>AI Document Generation</strong><br>
              This will create a professional safety document tailored to your requirements.
            </div>
            
            <div id="ai-error-message" class="alert alert-danger" style="display: none;"></div>
            
            <form id="aiGenerateForm">
              <div class="mb-3">
                <label class="form-label">Document Type</label>
                <select class="form-select" id="documentType" required>
                  <option value="Risk Assessment">Risk Assessment</option>
                  <option value="Safety Policy">Safety Policy</option>
                  <option value="Training Manual">Training Manual</option>
                  <option value="Emergency Procedure">Emergency Procedure</option>
                  <option value="SWMS">Safe Work Method Statement</option>
                  <option value="Work Procedure">Work Procedure</option>
                </select>
              </div>
              
              <div class="mb-3">
                <label class="form-label">Document Title</label>
                <input type="text" class="form-control" id="documentTitle" value="${documentName}" required>
              </div>
              
              <div class="mb-3">
                <label class="form-label">Document Requirements</label>
                <textarea class="form-control" id="aiPrompt" rows="4" 
                          placeholder="Describe what you need in this document..." required></textarea>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-success" id="generateDocumentBtn">
              <i class="fas fa-robot"></i> Generate Document
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal
  const existingModal = document.getElementById("aiGenerateModal");
  if (existingModal) {
    existingModal.remove();
  }

  // Add new modal
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById("aiGenerateModal"));
  modal.show();

  // Add generate button handler
  document.getElementById("generateDocumentBtn").addEventListener("click", function() {
    generateAIDocument(categoryName, documentName);
  });
}

function openCategoryDocumentLinker(categoryName, documentName) {
  console.log("Opening category document linker for:", categoryName, documentName);

  const modalHtml = `
    <div class="modal fade" id="linkCategoryDocumentModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fas fa-link"></i> Link Document to: ${categoryName}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">Search for documents:</label>
              <div class="input-group">
                <input type="text" class="form-control" id="linkCategoryDocumentSearch" 
                       placeholder="Type document name..." value="${documentName}">
                <button type="button" class="btn btn-outline-primary" id="searchCategoryDocumentBtn">
                  <i class="fas fa-search"></i> Search
                </button>
              </div>
            </div>
            
            <div id="linkCategoryDocumentResults">
              <div class="text-center text-muted">
                <i class="fas fa-search fa-2x mb-2"></i><br>
                Click search to find documents
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal
  const existingModal = document.getElementById("linkCategoryDocumentModal");
  if (existingModal) {
    existingModal.remove();
  }

  // Add new modal
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById("linkCategoryDocumentModal"));
  modal.show();

  // Add search functionality
  document.getElementById("searchCategoryDocumentBtn").addEventListener("click", function() {
    const searchTerm = document.getElementById("linkCategoryDocumentSearch").value.trim();
    if (searchTerm) {
      searchForCategoryDocuments(searchTerm, categoryName);
    }
  });
}

// ========================================
// API FUNCTIONS
// ========================================

async function generateAIDocument(categoryName, documentName) {
  const generateBtn = document.getElementById("generateDocumentBtn");
  const originalText = generateBtn.innerHTML;
  const errorDiv = document.getElementById("ai-error-message");

  errorDiv.style.display = "none";

  const documentType = document.getElementById("documentType").value;
  const documentTitle = document.getElementById("documentTitle").value;
  const aiPrompt = document.getElementById("aiPrompt").value;

  if (!documentType || !documentTitle.trim() || !aiPrompt.trim()) {
    showAIError("Please fill in all required fields");
    return;
  }

  generateBtn.disabled = true;
  generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

  try {
    const response = await fetch("/api/generate-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentType: documentType,
        documentName: documentTitle.trim(),
        customInputs: {
          prompt: aiPrompt.trim(),
          category: categoryName,
        },
      }),
    });

    const result = await response.json();

    if (result.success) {
      alert(`✅ Document generated successfully!\n\nFile: ${result.filename || "Document saved"}`);

      const modal = bootstrap.Modal.getInstance(document.getElementById("aiGenerateModal"));
      modal.hide();

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      showAIError(`Generation failed: ${result.message || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Generation error:", error);
    showAIError(`Network error: ${error.message}`);
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = originalText;
  }
}

function showAIError(message) {
  const errorDiv = document.getElementById("ai-error-message");
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = "block";
    errorDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else {
    alert("Error: " + message);
  }
}

// ========================================
// MISSING MODAL FUNCTIONS - IMPLEMENTED
// ========================================

function openCategoryEditor(categoryName) {
  console.log("Opening category editor for:", categoryName);

  const modalHtml = `
    <div class="modal fade" id="editCategoryModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fas fa-edit"></i> Edit Category: ${categoryName}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <form id="editCategoryForm">
              <div class="mb-3">
                <label class="form-label">Category Name</label>
                <input type="text" class="form-control" id="editCategoryName" value="${categoryName}">
              </div>
              <div class="mb-3">
                <label class="form-label">Level</label>
                <select class="form-select" id="editCategoryLevel">
                  <option value="1">Level 1 (Policy)</option>
                  <option value="2" selected>Level 2 (Category)</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Type</label>
                <select class="form-select" id="editCategoryType">
                  <option value="policy">Policy</option>
                  <option value="category" selected>Category</option>
                  <option value="procedure">Procedure</option>
                </select>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-danger" id="deleteCategoryBtn">Delete</button>
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary" id="saveCategoryBtn">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  `;

  removeExistingModal("editCategoryModal");
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  const modal = new bootstrap.Modal(document.getElementById("editCategoryModal"));
  modal.show();

  // Add event listeners
  document.getElementById("saveCategoryBtn").addEventListener("click", function() {
    saveCategoryChanges(categoryName);
  });

  document.getElementById("deleteCategoryBtn").addEventListener("click", function() {
    if (confirm("Are you sure you want to delete this category?")) {
      deleteCategory(categoryName);
    }
  });
}

function openDocumentLinker(categoryName, documentName) {
  console.log("Opening document linker for:", categoryName, documentName);

  const modalHtml = `
    <div class="modal fade" id="linkDocumentModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fas fa-link"></i> Link Document: ${documentName}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info">
              <i class="fas fa-info-circle"></i>
              Search for the actual document file to link to "${documentName}" in category "${categoryName}".
            </div>
            
            <div class="mb-3">
              <label class="form-label">Search for documents:</label>
              <div class="input-group">
                <input type="text" class="form-control" id="linkDocumentSearch" 
                       placeholder="Type document name..." value="${documentName}">
                <button type="button" class="btn btn-outline-primary" id="searchDocumentBtn">
                  <i class="fas fa-search"></i> Search
                </button>
              </div>
            </div>
            
            <div id="linkDocumentResults">
              <div class="text-center text-muted">
                <i class="fas fa-search fa-2x mb-2"></i><br>
                Click search to find documents
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `;

  removeExistingModal("linkDocumentModal");
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  const modal = new bootstrap.Modal(document.getElementById("linkDocumentModal"));
  modal.show();

  // Add search functionality
  document.getElementById("searchDocumentBtn").addEventListener("click", function() {
    const searchTerm = document.getElementById("linkDocumentSearch").value.trim();
    if (searchTerm) {
      searchForDocuments(searchTerm, categoryName, documentName);
    }
  });
}

function openRevisionModal(documentId, documentName) {
  console.log("Opening revision modal for:", documentId, documentName);

  const modalHtml = `
    <div class="modal fade" id="revisionModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fas fa-edit"></i> Upload Revision: ${documentName}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <form id="revisionForm" enctype="multipart/form-data">
              <div class="mb-3">
                <label class="form-label">Select New Document</label>
                <input type="file" class="form-control" id="revisionFile" name="newDocument" required>
                <div class="form-text">Replacing: <strong>${documentName}</strong></div>
              </div>
              
              <div class="mb-3">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="keepOriginal" checked>
                  <label class="form-check-label" for="keepOriginal">
                    Keep backup copy of original
                  </label>
                </div>
              </div>
              
              <div class="mb-3">
                <label class="form-label">Revision Note</label>
                <textarea class="form-control" id="revisionNote" rows="2" 
                          placeholder="Describe what changed..."></textarea>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary" id="uploadRevisionBtn">
              <i class="fas fa-upload"></i> Upload
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  removeExistingModal("revisionModal");
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  const modal = new bootstrap.Modal(document.getElementById("revisionModal"));
  modal.show();

  // Add upload functionality
  document.getElementById("uploadRevisionBtn").addEventListener("click", function() {
    uploadRevision(documentId);
  });
}

function openMandatoryDocumentLinker(recordType) {
  console.log("Opening mandatory document linker for:", recordType);

  const modalHtml = `
    <div class="modal fade" id="linkMandatoryModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fas fa-clipboard-check"></i> Link Documents to ${recordType}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info">
              <i class="fas fa-info-circle"></i>
              Search for any document to link to this mandatory record type.
            </div>
            
            <div class="mb-3">
              <label class="form-label">Search for documents:</label>
              <div class="input-group">
                <input type="text" class="form-control" id="linkMandatorySearch" 
                       placeholder="Enter document name or keywords...">
                <button type="button" class="btn btn-outline-primary" id="searchMandatoryBtn">
                  <i class="fas fa-search"></i> Search
                </button>
              </div>
            </div>
            
            <div id="linkMandatoryResults">
              <div class="text-center text-muted">
                <i class="fas fa-search fa-2x mb-2"></i><br>
                Enter a search term to find documents
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `;

  removeExistingModal("linkMandatoryModal");
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  const modal = new bootstrap.Modal(document.getElementById("linkMandatoryModal"));
  modal.show();

  // Add search functionality
  document.getElementById("searchMandatoryBtn").addEventListener("click", function() {
    const searchTerm = document.getElementById("linkMandatorySearch").value.trim();
    if (searchTerm) {
      searchMandatoryDocuments(searchTerm, recordType);
    }
  });

  document.getElementById("linkMandatorySearch").addEventListener("keypress", function(e) {
    if (e.key === "Enter") {
      const searchTerm = this.value.trim();
      if (searchTerm) {
        searchMandatoryDocuments(searchTerm, recordType);
      }
    }
  });
}

// ========================================
// UTILITY FUNCTIONS FOR MODALS
// ========================================

function removeExistingModal(modalId) {
  const existingModal = document.getElementById(modalId);
  if (existingModal) {
    const modalInstance = bootstrap.Modal.getInstance(existingModal);
    if (modalInstance) {
      modalInstance.dispose();
    }
    existingModal.remove();
  }
}

// ========================================
// MANDATORY RECORDS FUNCTIONS
// ========================================

async function loadMandatoryRecords() {
  const listDiv = document.getElementById("mandatoryRecordsList");
  if (!listDiv) return;

  listDiv.innerHTML = '<div class="text-center text-muted"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

  try {
    const response = await fetch("/api/mandatory-records");
    const data = await response.json();

    if (data.success && data.mandatoryRecords) {
      displayMandatoryRecords(data.mandatoryRecords);
      updateMandatoryStatistics(data.mandatoryRecords);
    } else {
      listDiv.innerHTML = '<div class="alert alert-warning">No mandatory records found</div>';
    }
  } catch (error) {
    console.error("Error loading mandatory records:", error);
    listDiv.innerHTML = '<div class="alert alert-danger">Error loading mandatory records</div>';
  }
}

function displayMandatoryRecords(records) {
  const listDiv = document.getElementById("mandatoryRecordsList");
  if (!listDiv || !records) return;

  let html = "";

  Object.keys(records).forEach((recordType) => {
    const record = records[recordType];
    const linkedDocuments = record.enrichedDocuments?.filter(doc => doc.manuallyLinked) || [];
    const isLinked = linkedDocuments.length > 0;

    html += `
      <div class="ims-category-level-2">
        <div class="d-flex align-items-center">
          <div class="flex-grow-1">
            ${isLinked ? 
              '<i class="fas fa-check-circle text-success ims-status-icon"></i>' : 
              '<i class="fas fa-exclamation-triangle text-warning ims-status-icon"></i>'
            }
            <span class="mandatory-record-title">${recordType}</span>
            <small class="text-muted ms-2">${record.description || ""}</small>
          </div>
          <button class="btn btn-sm btn-outline-info link-mandatory-btn" 
                  data-record-type="${recordType}"
                  style="font-size: 0.7rem;">
            <i class="fas fa-link"></i> Link
          </button>
        </div>
      </div>
    `;
  });

  listDiv.innerHTML = html || '<div class="text-center text-muted py-4">No mandatory records configured</div>';
}

// ========================================
// SEARCH AND LINK FUNCTIONS
// ========================================

async function searchForDocuments(searchTerm, categoryName, documentName) {
  const resultsDiv = document.getElementById("linkDocumentResults");
  resultsDiv.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

  try {
    const response = await fetch(`/api/available-documents?search=${encodeURIComponent(searchTerm)}`);
    const documents = await response.json();

    if (documents.length === 0) {
      resultsDiv.innerHTML = '<div class="alert alert-info">No documents found</div>';
      return;
    }

    let html = '<div class="list-group">';
    documents.slice(0, 10).forEach((doc) => {
      html += `
        <div class="list-group-item list-group-item-action" style="cursor: pointer;" 
             onclick="linkDocument('${categoryName}', '${documentName}', '${doc.id}', '${doc.name}')">
          <h6 class="mb-1">${doc.name}</h6>
          <small class="text-muted">${doc.folder || "Root folder"}</small>
        </div>
      `;
    });
    html += "</div>";

    resultsDiv.innerHTML = html;
  } catch (error) {
    resultsDiv.innerHTML = '<div class="alert alert-danger">Search error</div>';
  }
}

async function searchForCategoryDocuments(searchTerm, categoryName) {
  const resultsDiv = document.getElementById("linkCategoryDocumentResults");
  resultsDiv.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

  try {
    const response = await fetch(`/api/available-documents?search=${encodeURIComponent(searchTerm)}`);
    const documents = await response.json();

    if (documents.length === 0) {
      resultsDiv.innerHTML = '<div class="alert alert-info">No documents found</div>';
      return;
    }

    let html = '<div class="list-group">';
    documents.slice(0, 10).forEach((doc) => {
      html += `
        <div class="list-group-item list-group-item-action" style="cursor: pointer;" 
             onclick="linkCategoryDocument('${categoryName}', '${doc.id}', '${doc.name}')">
          <h6 class="mb-1">${doc.name}</h6>
          <small class="text-muted">${doc.folder || "Root folder"}</small>
        </div>
      `;
    });
    html += "</div>";

    resultsDiv.innerHTML = html;
  } catch (error) {
    resultsDiv.innerHTML = '<div class="alert alert-danger">Search error</div>';
  }
}

async function searchMandatoryDocuments(searchTerm, recordType) {
  const resultsDiv = document.getElementById("linkMandatoryResults");
  resultsDiv.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

  try {
    const response = await fetch(`/api/available-documents?search=${encodeURIComponent(searchTerm)}`);
    const documents = await response.json();

    if (documents.length === 0) {
      resultsDiv.innerHTML = '<div class="alert alert-info">No documents found matching your search</div>';
      return;
    }

    let html = '<div class="list-group">';
    documents.slice(0, 15).forEach((doc) => {
      const archivedBadge = doc.isArchived ? '<span class="ims-archived-badge">ARCHIVED</span>' : "";

      html += `
        <div class="list-group-item list-group-item-action mandatory-link-result ${doc.isArchived ? "archived" : ""}" 
             data-doc-id="${doc.id}" 
             data-doc-name="${doc.name}" 
             data-is-archived="${doc.isArchived}" 
             style="cursor: pointer;">
          <div class="d-flex w-100 justify-content-between">
            <div>
              <h6 class="mb-1">
                <i class="fas fa-file-alt me-2"></i>${doc.name}${archivedBadge}
              </h6>
              <p class="mb-1"><small class="text-muted">📁 ${doc.folder || "Root folder"}</small></p>
            </div>
            <div class="text-end">
              <small class="text-success">Click to link</small>
              <i class="fas fa-plus-circle text-success"></i>
            </div>
          </div>
        </div>
      `;
    });
    html += "</div>";

    resultsDiv.innerHTML = html;

    // Add click handlers
    document.querySelectorAll(".mandatory-link-result").forEach((result) => {
      result.addEventListener("click", function() {
        const docId = this.getAttribute("data-doc-id");
        const docName = this.getAttribute("data-doc-name");
        const isArchived = this.getAttribute("data-is-archived") === "true";

        let confirmMessage = `Link "${docName}" to mandatory record "${recordType}"?`;
        if (isArchived) {
          confirmMessage += "\n\n⚠️ WARNING: This document is archived and may be outdated.";
        }

        if (confirm(confirmMessage)) {
          linkMandatoryDocument(recordType, docId, docName);
        }
      });
    });
  } catch (error) {
    console.error("Search error:", error);
    resultsDiv.innerHTML = '<div class="alert alert-danger">Error searching documents</div>';
  }
}

// Link functions
function linkDocument(categoryName, documentName, docId, actualDocName) {
  if (confirm(`Link "${actualDocName}" to "${documentName}"?`)) {
    fetch("/api/link-ims-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryName,
        documentName,
        documentId: docId,
        actualDocumentName: actualDocName,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          alert("Document linked successfully!");
          const modal = bootstrap.Modal.getInstance(document.getElementById("linkDocumentModal"));
          modal.hide();
          setTimeout(() => window.location.reload(), 1000);
        } else {
          alert("Error linking document: " + data.message);
        }
      });
  }
}

function linkCategoryDocument(categoryName, docId, actualDocName) {
  if (confirm(`Link "${actualDocName}" to category "${categoryName}"?`)) {
    fetch("/api/link-category-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryName,
        documentId: docId,
        actualDocumentName: actualDocName,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          alert("Category document linked successfully!");
          const modal = bootstrap.Modal.getInstance(document.getElementById("linkCategoryDocumentModal"));
          modal.hide();
          setTimeout(() => window.location.reload(), 1000);
        } else {
          alert("Error linking category document: " + data.message);
        }
      });
  }
}

async function linkMandatoryDocument(recordType, documentId, documentName) {
  try {
    const response = await fetch("/api/link-mandatory-record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordType: recordType,
        documentId: documentId,
        actualDocumentName: documentName,
      }),
    });

    const data = await response.json();

    if (data.success) {
      alert(`Successfully linked "${documentName}" to "${recordType}"!`);

      const modal = bootstrap.Modal.getInstance(document.getElementById("linkMandatoryModal"));
      if (modal) {
        modal.hide();
      }

      setTimeout(() => {
        loadMandatoryRecords();
      }, 1000);
    } else {
      alert("Error linking document: " + (data.message || "Unknown error"));
    }
  } catch (error) {
    console.error("Linking error:", error);
    alert("Error linking document: " + error.message);
  }
}

async function unlinkMandatoryDocument(recordType, documentId) {
  if (!confirm("Are you sure you want to unlink this document?")) {
    return;
  }

  try {
    const response = await fetch(`/api/mandatory-record/${encodeURIComponent(recordType)}/${documentId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();

    if (data.success) {
      alert("Document unlinked successfully!");
      loadMandatoryRecords();
    } else {
      alert("Error unlinking document: " + (data.message || "Unknown error"));
    }
  } catch (error) {
    console.error("Error unlinking document:", error);
    alert("Error unlinking document: " + error.message);
  }
}

// Category management functions
async function saveCategoryChanges(originalCategoryName) {
  const newName = document.getElementById("editCategoryName").value.trim();
  const level = document.getElementById("editCategoryLevel").value;
  const type = document.getElementById("editCategoryType").value;

  try {
    const response = await fetch("/api/update-ims-category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        categoryName: originalCategoryName,
        newName: newName !== originalCategoryName ? newName : undefined,
        level: parseInt(level),
        type: type,
      }),
    });

    const data = await response.json();

    if (data.success) {
      alert("Category updated successfully!");
      const modal = bootstrap.Modal.getInstance(document.getElementById("editCategoryModal"));
      modal.hide();
      setTimeout(() => window.location.reload(), 1000);
    } else {
      alert("Error updating category: " + data.message);
    }
  } catch (error) {
    console.error("Error updating category:", error);
    alert("Error updating category");
  }
}

async function deleteCategory(categoryName) {
  try {
    const response = await fetch(`/api/delete-ims-category/${encodeURIComponent(categoryName)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();

    if (data.success) {
      alert("Category deleted successfully!");
      const modal = bootstrap.Modal.getInstance(document.getElementById("editCategoryModal"));
      modal.hide();
      setTimeout(() => window.location.reload(), 1000);
    } else {
      alert("Error deleting category: " + data.message);
    }
  } catch (error) {
    console.error("Error deleting category:", error);
    alert("Error deleting category");
  }
}

async function uploadRevision(documentId) {
  const form = document.getElementById("revisionForm");
  const formData = new FormData(form);

  const uploadBtn = document.getElementById("uploadRevisionBtn");
  uploadBtn.disabled = true;
  uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

  try {
    const response = await fetch(`/api/replace-document/${documentId}`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (data.success) {
      alert("Document revision uploaded successfully!");
      const modal = bootstrap.Modal.getInstance(document.getElementById("revisionModal"));
      modal.hide();
      setTimeout(() => window.location.reload(), 1000);
    } else {
      alert("Error uploading revision: " + data.message);
    }
  } catch (error) {
    console.error("Error uploading revision:", error);
    alert("Error uploading revision");
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload';
  }
}

// ========================================
// AUTO-LINK AND CATEGORY MANAGEMENT
// ========================================

async function autoLinkDocuments() {
  if (!confirm("This will automatically link documents based on name matching. Continue?")) {
    return;
  }

  const button = document.getElementById("autoLinkBtn");
  const originalText = button.innerHTML;

  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Auto-linking...';

  try {
    const response = await fetch("/api/auto-link-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkRevisions: true }),
    });

    const data = await response.json();

    if (data.success) {
      alert(`Auto-linking completed! Linked ${data.linked} documents.`);
      setTimeout(() => window.location.reload(), 1000);
    } else {
      alert("Error during auto-linking: " + data.message);
    }
  } catch (error) {
    console.error("Error auto-linking:", error);
    alert("Error during auto-linking");
  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

function handleAddCategory() {
  const nameInput = document.getElementById("newCategoryName");
  const levelSelect = document.getElementById("newCategoryLevel");

  if (!nameInput || !levelSelect) return;

  const name = nameInput.value.trim();
  const level = levelSelect.value;

  if (!name) {
    alert("Please enter a category name");
    return;
  }

  fetch("/api/update-ims-category", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create",
      categoryName: name,
      level: parseInt(level),
      type: level === "1" ? "policy" : "category",
      children: [],
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        alert("Category added successfully!");
        nameInput.value = "";
        setTimeout(() => window.location.reload(), 1000);
      } else {
        alert("Error adding category: " + data.message);
      }
    })
    .catch((error) => {
      console.error("Error adding category:", error);
      alert("Error adding category");
    });
}

async function autoDetectMandatoryRecords() {
  const button = document.getElementById("autoDetectMandatoryBtn");
  const originalText = button.innerHTML;

  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting...';

  try {
    const response = await fetch("/api/auto-detect-mandatory-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();

    if (data.success) {
      alert(`Auto-detection completed! Found ${data.detectedCount} potential matches.`);
      loadMandatoryRecords();
    } else {
      alert("Error during auto-detection: " + data.message);
    }
  } catch (error) {
    console.error("Error auto-detecting:", error);
    alert("Error during auto-detection");
  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}