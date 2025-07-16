// IMS Index JavaScript - Fixed Version
// Archive toggle state
let showArchivedDocuments = false;

// REPLACE your current DOMContentLoaded section with this fixed version:

document.addEventListener("DOMContentLoaded", function () {
  console.log("IMS Index JavaScript loading...");

  // Calculate and display statistics
  updateStatistics();

  // Search functionality - these elements exist on page load
  const searchInput = document.getElementById("imsSearch");
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      filterIMSIndex();
    });
  }

  // Filter functionality - these elements exist on page load
  const filterSelect = document.getElementById("imsFilter");
  if (filterSelect) {
    filterSelect.addEventListener("change", function () {
      filterIMSIndex();
    });
  }

  // Hide archived checkbox - these elements exist on page load
  const hideArchivedCheck = document.getElementById("hideArchivedCheck");
  if (hideArchivedCheck) {
    hideArchivedCheck.addEventListener("change", function () {
      toggleArchivedDocuments();
    });
  }

  // Add new category button - these elements exist on page load
  const addCategoryBtn = document.getElementById("addCategoryBtn");
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener("click", function () {
      const categoryName = document
        .getElementById("newCategoryName")
        .value.trim();
      const level = document.getElementById("newCategoryLevel").value;

      if (!categoryName) {
        alert("Please enter a category name");
        return;
      }

      addNewCategory(categoryName, level);
    });
  }

  // Auto-link button - these elements exist on page load
  const autoLinkBtn = document.getElementById("autoLinkBtn");
  if (autoLinkBtn) {
    autoLinkBtn.addEventListener("click", function () {
      autoLinkDocuments();
    });
  }

  // Auto-detect mandatory records button - these elements exist on page load
  const autoDetectBtn = document.getElementById("autoDetectMandatoryBtn");
  if (autoDetectBtn) {
    autoDetectBtn.addEventListener("click", function () {
      autoDetectMandatoryRecords();
    });
  }

  // Manage mandatory modal handlers - these elements exist on page load
  const manageMandatoryModal = document.getElementById("manageMandatoryModal");
  if (manageMandatoryModal) {
    manageMandatoryModal.addEventListener("show.bs.modal", function () {
      loadMandatoryRecordTypes();
    });
  }

  const mandatoryRecordSelect = document.getElementById(
    "mandatoryRecordSelect"
  );
  if (mandatoryRecordSelect) {
    mandatoryRecordSelect.addEventListener("change", function () {
      loadMandatoryRecordSettings();
    });
  }

  const updateMandatoryBtn = document.getElementById("updateMandatoryBtn");
  if (updateMandatoryBtn) {
    updateMandatoryBtn.addEventListener("click", function () {
      updateMandatoryRecordSettings();
    });
  }

  const runAutoDetectBtn = document.getElementById("runAutoDetectBtn");
  if (runAutoDetectBtn) {
    runAutoDetectBtn.addEventListener("click", function () {
      autoDetectMandatoryRecords();
    });
  }

  // *** FIX: Use EVENT DELEGATION for dynamically generated buttons ***
  // This is the key fix - listen on document and check what was clicked
  document.addEventListener("click", function (e) {
    // Prevent event bubbling issues
    e.stopPropagation();

    // Category management buttons
    if (e.target.closest(".manage-category-btn")) {
      e.preventDefault();
      const btn = e.target.closest(".manage-category-btn");
      const categoryName = btn.getAttribute("data-category");
      console.log("Opening category editor for:", categoryName);
      openCategoryEditor(categoryName);
      return;
    }

    // Document management buttons
    if (e.target.closest(".manage-document-btn")) {
      e.preventDefault();
      const btn = e.target.closest(".manage-document-btn");
      const categoryName = btn.getAttribute("data-category");
      const documentName = btn.getAttribute("data-document");
      console.log(
        "Opening document linker for:",
        documentName,
        "in category:",
        categoryName
      );
      openDocumentLinker(categoryName, documentName);
      return;
    }

    // AI Generate buttons
    if (e.target.closest(".ai-generate-btn")) {
      e.preventDefault();
      const btn = e.target.closest(".ai-generate-btn");
      const categoryName = btn.getAttribute("data-category");
      const documentName = btn.getAttribute("data-document");
      console.log(
        "AI Generate clicked for:",
        documentName,
        "in category:",
        categoryName
      );
      openAIGenerationModal(categoryName, documentName);
      return;
    }

    // Revision buttons
    if (e.target.closest(".revision-btn")) {
      e.preventDefault();
      const btn = e.target.closest(".revision-btn");
      const documentId = btn.getAttribute("data-document-id");
      const documentName = btn.getAttribute("data-document-name");
      console.log("Revision clicked for:", documentId, documentName);
      openRevisionModal(documentId, documentName);
      return;
    }

    // Category revision buttons
    if (e.target.closest(".category-revision-btn")) {
      e.preventDefault();
      const btn = e.target.closest(".category-revision-btn");
      const documentId = btn.getAttribute("data-document-id");
      const documentName = btn.getAttribute("data-document-name");
      console.log("Category revision clicked for:", documentId, documentName);
      openRevisionModal(documentId, documentName);
      return;
    }

    // Category link buttons
    if (e.target.closest(".category-link-btn")) {
      e.preventDefault();
      const btn = e.target.closest(".category-link-btn");
      const categoryName = btn.getAttribute("data-category");
      const documentName = btn.getAttribute("data-document-name");
      console.log("Category link clicked for:", categoryName, documentName);
      openCategoryDocumentLinker(categoryName, documentName);
      return;
    }
  });

  // Load mandatory records on page load
  loadMandatoryRecords();

  // Initialize revision features - delay to ensure DOM is ready
  setTimeout(() => {
    if (typeof addRevisionButtons === "function") {
      addRevisionButtons();
    } else {
      console.log("addRevisionButtons function not found - skipping");
    }
  }, 1500);

  // Update statistics on page load using stored values
  if (window.imsStats) {
    const linkedCountEl = document.getElementById("linkedCount");
    const missingCountEl = document.getElementById("missingCount");
    const coveragePercentEl = document.getElementById("coveragePercent");

    if (linkedCountEl)
      linkedCountEl.textContent = window.imsStats.linkedDocuments;
    if (missingCountEl)
      missingCountEl.textContent = window.imsStats.missingDocuments;

    if (coveragePercentEl && window.imsStats.totalDocuments > 0) {
      const coverage = Math.round(
        (window.imsStats.linkedDocuments / window.imsStats.totalDocuments) * 100
      );
      coveragePercentEl.textContent = coverage + "%";
    }
  }

  console.log("IMS Index JavaScript loaded successfully");
});

// ========================================
// INITIALIZATION FUNCTIONS
// ========================================

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
  // Main event delegation for all button clicks
  document.addEventListener("click", function (e) {
    e.stopPropagation();

    // AI Generate buttons
    if (e.target.closest(".ai-generate-btn")) {
      e.preventDefault();
      const btn = e.target.closest(".ai-generate-btn");
      const categoryName = btn.getAttribute("data-category");
      const documentName = btn.getAttribute("data-document");
      console.log("AI Generate clicked:", categoryName, documentName);
      openAIGenerationModal(categoryName, documentName);
      return;
    }

    // Category link buttons
    if (e.target.closest(".category-link-btn")) {
      e.preventDefault();
      const btn = e.target.closest(".category-link-btn");
      const categoryName = btn.getAttribute("data-category");
      const documentName = btn.getAttribute("data-document-name");
      console.log("Category link clicked:", categoryName, documentName);
      openCategoryDocumentLinker(categoryName, documentName);
      return;
    }

    // Category revision buttons
    if (e.target.closest(".category-revision-btn")) {
      e.preventDefault();
      const btn = e.target.closest(".category-revision-btn");
      const documentId = btn.getAttribute("data-document-id");
      const documentName = btn.getAttribute("data-document-name");
      console.log("Category revision clicked:", documentId, documentName);
      openRevisionModal(documentId, documentName);
      return;
    }

    // Manage category buttons
    if (e.target.closest(".manage-category-btn")) {
      e.preventDefault();
      const btn = e.target.closest(".manage-category-btn");
      const categoryName = btn.getAttribute("data-category");
      console.log("Manage category clicked:", categoryName);
      openCategoryEditor(categoryName);
      return;
    }

    // Manage document buttons
    if (e.target.closest(".manage-document-btn")) {
      e.preventDefault();
      const btn = e.target.closest(".manage-document-btn");
      const categoryName = btn.getAttribute("data-category");
      const documentName = btn.getAttribute("data-document");
      console.log("Manage document clicked:", categoryName, documentName);
      openDocumentLinker(categoryName, documentName);
      return;
    }

    // Revision buttons
    if (e.target.closest(".revision-btn")) {
      e.preventDefault();
      const btn = e.target.closest(".revision-btn");
      const documentId = btn.getAttribute("data-document-id");
      const documentName = btn.getAttribute("data-document-name");
      console.log("Revision clicked:", documentId, documentName);
      openRevisionModal(documentId, documentName);
      return;
    }
  });

  // Modal-specific event handlers
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

function updateStatistics() {
  // Use server-provided stats if available
  if (window.imsStats) {
    const linkedCount = document.getElementById("linkedCount");
    const missingCount = document.getElementById("missingCount");
    const coveragePercent = document.getElementById("coveragePercent");

    if (linkedCount) linkedCount.textContent = window.imsStats.linkedDocuments;
    if (missingCount)
      missingCount.textContent = window.imsStats.missingDocuments;

    if (coveragePercent && window.imsStats.totalDocuments > 0) {
      const coverage = Math.round(
        (window.imsStats.linkedDocuments / window.imsStats.totalDocuments) * 100
      );
      coveragePercent.textContent = coverage + "%";
    }
  }
}

function filterIMSIndex() {
  const searchTerm =
    document.getElementById("imsSearch")?.value.toLowerCase() || "";
  const filterType = document.getElementById("imsFilter")?.value || "all";
  const hideArchived =
    document.getElementById("hideArchivedCheck")?.checked || false;

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
      if (filterType === "policies" && categoryType !== "policy")
        showCategory = false;
      if (filterType === "procedures" && categoryType !== "category")
        showCategory = false;
      if (filterType === "archived" && !hasArchived) showCategory = false;
    }

    // Handle archived items
    if (hideArchived && filterType !== "archived") {
      const archivedItems = category.querySelectorAll(".ims-document-archived");
      archivedItems.forEach((item) => {
        item.style.display = "none";
      });
    } else {
      const archivedItems = category.querySelectorAll(".ims-document-archived");
      archivedItems.forEach((item) => {
        item.style.display = "";
      });
    }

    category.style.display = showCategory ? "block" : "none";
  });
}

function toggleArchivedDocuments() {
  const hideArchived =
    document.getElementById("hideArchivedCheck")?.checked || false;
  const archivedItems = document.querySelectorAll(".ims-document-archived");

  archivedItems.forEach((item) => {
    item.style.display = hideArchived ? "none" : "";
  });
}

// ========================================
// MODAL FUNCTIONS - SIMPLIFIED
// ========================================

// Add this function to your existing ims-index.js file
// Replace the existing openAIGenerationModal function with this updated version

function openAIGenerationModal(categoryName, documentName) {
  console.log("Opening AI generation modal for:", documentName);

  // Remove existing modal
  const existingModal = document.getElementById("aiGenerateModal");
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal HTML with AI provider selection
  const modalDiv = document.createElement("div");
  modalDiv.innerHTML = `
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
            
            <!-- Error message area -->
            <div id="ai-error-message" class="alert alert-danger" style="display: none;"></div>
            
            <form id="aiGenerateForm">
              <div class="mb-3">
                <label class="form-label">AI Provider</label>
                <select class="form-select" id="aiProvider" required>
                  <option value="">Select AI Provider</option>
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                </select>
              </div>
              
              <div class="mb-3">
                <label class="form-label">Document Type</label>
                <select class="form-select" id="documentType" required>
                  <option value="Risk Assessment">Risk Assessment</option>
                  <option value="Safety Policy">Safety Policy</option>
                  <option value="Training Manual">Training Manual</option>
                  <option value="Incident Report">Incident Report</option>
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
                          placeholder="Describe what you need in this document...

For example:
- Create a risk assessment for office workers focusing on ergonomics
- Develop a safety policy for warehouse operations including forklift safety
- Generate training materials for new employee orientation
- Create incident reporting procedures for manufacturing environment" required></textarea>
              </div>
              
              <div class="mb-3">
                <label class="form-label">Specific Details (Optional)</label>
                <textarea class="form-control" id="specificDetails" rows="2" 
                          placeholder="Any specific hazards, equipment, industry requirements, or company details to include..."></textarea>
              </div>
            </form>
            
            <div class="alert alert-success">
              <i class="fas fa-info-circle"></i>
              <strong>Note:</strong> Generated documents will be saved to your documents folder and can be linked to this category.
            </div>
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

  // Add to DOM
  document.body.appendChild(modalDiv.firstElementChild);

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById("aiGenerateModal"));
  modal.show();

  // Add event listener for generate button
  document
    .getElementById("generateDocumentBtn")
    .addEventListener("click", function () {
      generateAIDocumentNew(categoryName, documentName);
    });
}

// Updated AI document generation function
async function generateAIDocumentNew(categoryName, documentName) {
  const generateBtn = document.getElementById("generateDocumentBtn");
  const originalText = generateBtn.innerHTML;
  const errorDiv = document.getElementById("ai-error-message");

  // Hide any previous errors
  errorDiv.style.display = "none";

  // Get form values
  const aiProvider = document.getElementById("aiProvider").value;
  const documentType = document.getElementById("documentType").value;
  const documentTitle = document.getElementById("documentTitle").value;
  const aiPrompt = document.getElementById("aiPrompt").value;
  const specificDetails = document.getElementById("specificDetails").value;

  // Validate inputs
  if (!aiProvider) {
    showAIError("Please select an AI provider");
    return;
  }

  if (!documentType) {
    showAIError("Please select a document type");
    return;
  }

  if (!documentTitle.trim()) {
    showAIError("Please enter a document title");
    return;
  }

  if (!aiPrompt.trim()) {
    showAIError("Please enter document requirements");
    return;
  }

  // Show loading state
  generateBtn.disabled = true;
  generateBtn.innerHTML =
    '<i class="fas fa-spinner fa-spin"></i> Generating...';

  const requestData = {
    documentType: documentType,
    documentId: `${categoryName}-${documentName}`,
    prompt: aiPrompt.trim(),
    provider: aiProvider,
    customInputs: {
      documentTitle: documentTitle.trim(),
      specificDetails: specificDetails.trim(),
      category: categoryName,
      documentName: documentName,
    },
  };

  try {
    console.log("Sending AI generation request:", requestData);

    const response = await fetch("/api/generate-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestData),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      // Success
      alert(
        `✅ Document generated successfully!\n\nFile: ${
          result.filename || "Document saved"
        }\nWords: ${result.wordCount || "N/A"}`
      );

      const modal = bootstrap.Modal.getInstance(
        document.getElementById("aiGenerateModal")
      );
      modal.hide();

      // Reload page to show updated status
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      // Handle API error
      const errorMessage =
        result.error || result.message || "Unknown error occurred";
      showAIError(`Generation failed: ${errorMessage}`);
    }
  } catch (error) {
    console.error("Generation error:", error);
    showAIError(`Network error: ${error.message}`);
  } finally {
    // Reset button state
    generateBtn.disabled = false;
    generateBtn.innerHTML = originalText;
  }
}

// Helper function to show errors in the modal
function showAIError(message) {
  const errorDiv = document.getElementById("ai-error-message");
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = "block";
    // Scroll to error message
    errorDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else {
    alert("Error: " + message);
  }
}

function openDocumentLinker(categoryName, documentName) {
  console.log("Opening document linker for:", categoryName, documentName);

  // Remove existing modal
  const existingModal = document.getElementById("linkDocumentModal");
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal
  const modalDiv = document.createElement("div");
  modalDiv.innerHTML = `
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

  document.body.appendChild(modalDiv.firstElementChild);

  const modal = new bootstrap.Modal(
    document.getElementById("linkDocumentModal")
  );
  modal.show();

  // Add search functionality
  document
    .getElementById("searchDocumentBtn")
    .addEventListener("click", function () {
      const searchTerm = document
        .getElementById("linkDocumentSearch")
        .value.trim();
      if (searchTerm) {
        searchForDocuments(searchTerm, categoryName, documentName);
      }
    });
}

function openCategoryEditor(categoryName) {
  console.log("Opening category editor for:", categoryName);

  // Remove existing modal
  const existingModal = document.getElementById("editCategoryModal");
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal
  const modalDiv = document.createElement("div");
  modalDiv.innerHTML = `
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

  document.body.appendChild(modalDiv.firstElementChild);

  const modal = new bootstrap.Modal(
    document.getElementById("editCategoryModal")
  );
  modal.show();

  // Add event listeners
  document
    .getElementById("saveCategoryBtn")
    .addEventListener("click", function () {
      saveCategoryChanges(categoryName);
    });

  document
    .getElementById("deleteCategoryBtn")
    .addEventListener("click", function () {
      if (confirm("Are you sure you want to delete this category?")) {
        deleteCategory(categoryName);
      }
    });
}

function openCategoryDocumentLinker(categoryName, documentName) {
  console.log(
    "Opening category document linker for:",
    categoryName,
    documentName
  );

  // Remove existing modal
  const existingModal = document.getElementById("linkCategoryDocumentModal");
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal
  const modalDiv = document.createElement("div");
  modalDiv.innerHTML = `
    <div class="modal fade" id="linkCategoryDocumentModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fas fa-link"></i> Link Document to Category: ${categoryName}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info">
              <i class="fas fa-info-circle"></i>
              Link a document directly to the category "${categoryName}".
            </div>
            
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

  document.body.appendChild(modalDiv.firstElementChild);

  const modal = new bootstrap.Modal(
    document.getElementById("linkCategoryDocumentModal")
  );
  modal.show();

  // Add search functionality
  document
    .getElementById("searchCategoryDocumentBtn")
    .addEventListener("click", function () {
      const searchTerm = document
        .getElementById("linkCategoryDocumentSearch")
        .value.trim();
      if (searchTerm) {
        searchForCategoryDocuments(searchTerm, categoryName);
      }
    });
}

function openRevisionModal(documentId, documentName) {
  console.log("Opening revision modal for:", documentId, documentName);

  // Remove existing modal
  const existingModal = document.getElementById("revisionModal");
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal
  const modalDiv = document.createElement("div");
  modalDiv.innerHTML = `
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

  document.body.appendChild(modalDiv.firstElementChild);

  const modal = new bootstrap.Modal(document.getElementById("revisionModal"));
  modal.show();

  // Add upload functionality
  document
    .getElementById("uploadRevisionBtn")
    .addEventListener("click", function () {
      uploadRevision(documentId);
    });
}

// ========================================
// API FUNCTIONS
// ========================================

async function generateAIDocument(categoryName, documentName) {
  const generateBtn = document.getElementById("generateDocumentBtn");
  const originalText = generateBtn.innerHTML;

  generateBtn.disabled = true;
  generateBtn.innerHTML =
    '<i class="fas fa-spinner fa-spin"></i> Generating...';

  const requestData = {
    documentType: document.getElementById("documentType").value,
    documentName: document.getElementById("documentTitle").value,
    customInputs: {
      specificDetails: document.getElementById("specificDetails").value,
      category: categoryName,
    },
  };

  try {
    const response = await fetch("/api/generate-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestData),
    });

    const result = await response.json();

    if (result.success) {
      alert(`✅ Document generated successfully!\n\nFile: ${result.filename}`);

      const modal = bootstrap.Modal.getInstance(
        document.getElementById("aiGenerateModal")
      );
      modal.hide();

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      alert("❌ Error: " + (result.message || "Unknown error"));
    }
  } catch (error) {
    console.error("Generation error:", error);
    alert("❌ Network error: " + error.message);
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = originalText;
  }
}

async function searchForDocuments(searchTerm, categoryName, documentName) {
  const resultsDiv = document.getElementById("linkDocumentResults");
  resultsDiv.innerHTML =
    '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

  try {
    const response = await fetch(
      `/api/available-documents?search=${encodeURIComponent(searchTerm)}`
    );
    const documents = await response.json();

    if (documents.length === 0) {
      resultsDiv.innerHTML =
        '<div class="alert alert-info">No documents found</div>';
      return;
    }

    let html = '<div class="list-group">';
    documents.slice(0, 10).forEach((doc) => {
      html += `
        <div class="list-group-item list-group-item-action" style="cursor: pointer;" 
             onclick="linkDocument('${categoryName}', '${documentName}', '${
        doc.id
      }', '${doc.name}')">
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
  resultsDiv.innerHTML =
    '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

  try {
    const response = await fetch(
      `/api/available-documents?search=${encodeURIComponent(searchTerm)}`
    );
    const documents = await response.json();

    if (documents.length === 0) {
      resultsDiv.innerHTML =
        '<div class="alert alert-info">No documents found</div>';
      return;
    }

    let html = '<div class="list-group">';
    documents.slice(0, 10).forEach((doc) => {
      html += `
        <div class="list-group-item list-group-item-action" style="cursor: pointer;" 
             onclick="linkCategoryDocument('${categoryName}', '${doc.id}', '${
        doc.name
      }')">
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
          const modal = bootstrap.Modal.getInstance(
            document.getElementById("linkDocumentModal")
          );
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
          const modal = bootstrap.Modal.getInstance(
            document.getElementById("linkCategoryDocumentModal")
          );
          modal.hide();
          setTimeout(() => window.location.reload(), 1000);
        } else {
          alert("Error linking category document: " + data.message);
        }
      });
  }
}

// Category management functions
function saveCategoryChanges(originalCategoryName) {
  const newName = document.getElementById("editCategoryName").value.trim();
  const level = document.getElementById("editCategoryLevel").value;
  const type = document.getElementById("editCategoryType").value;

  fetch("/api/update-ims-category", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "update",
      categoryName: originalCategoryName,
      newName: newName !== originalCategoryName ? newName : undefined,
      level: parseInt(level),
      type: type,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        alert("Category updated successfully!");
        const modal = bootstrap.Modal.getInstance(
          document.getElementById("editCategoryModal")
        );
        modal.hide();
        setTimeout(() => window.location.reload(), 1000);
      } else {
        alert("Error updating category: " + data.message);
      }
    });
}

function deleteCategory(categoryName) {
  fetch(`/api/delete-ims-category/${encodeURIComponent(categoryName)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        alert("Category deleted successfully!");
        const modal = bootstrap.Modal.getInstance(
          document.getElementById("editCategoryModal")
        );
        modal.hide();
        setTimeout(() => window.location.reload(), 1000);
      } else {
        alert("Error deleting category: " + data.message);
      }
    });
}

function uploadRevision(documentId) {
  const form = document.getElementById("revisionForm");
  const formData = new FormData(form);

  const uploadBtn = document.getElementById("uploadRevisionBtn");
  uploadBtn.disabled = true;
  uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

  fetch(`/api/replace-document/${documentId}`, {
    method: "POST",
    body: formData,
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        alert("Document revision uploaded successfully!");
        const modal = bootstrap.Modal.getInstance(
          document.getElementById("revisionModal")
        );
        modal.hide();
        setTimeout(() => window.location.reload(), 1000);
      } else {
        alert("Error uploading revision: " + data.message);
      }
    })
    .finally(() => {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload';
    });
}

// Other functions
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

function autoLinkDocuments() {
  if (
    !confirm(
      "This will automatically link documents based on name matching. Continue?"
    )
  ) {
    return;
  }

  const button = document.getElementById("autoLinkBtn");
  const originalText = button.innerHTML;

  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Auto-linking...';

  fetch("/api/auto-link-documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checkRevisions: true }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        alert(`Auto-linking completed! Linked ${data.linked} documents.`);
        setTimeout(() => window.location.reload(), 1000);
      } else {
        alert("Error during auto-linking: " + data.message);
      }
    })
    .catch((error) => {
      console.error("Error auto-linking:", error);
      alert("Error during auto-linking");
    })
    .finally(() => {
      button.disabled = false;
      button.innerHTML = originalText;
    });
}

// ========================================
// MANDATORY RECORDS FUNCTIONS
// ========================================

function loadMandatoryRecords() {
  const listDiv = document.getElementById("mandatoryRecordsList");
  if (!listDiv) return;

  listDiv.innerHTML =
    '<div class="text-center text-muted"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

  fetch("/api/mandatory-records")
    .then((response) => response.json())
    .then((data) => {
      console.log("Mandatory records response:", data);

      if (data.success && data.mandatoryRecords) {
        displayMandatoryRecords(data.mandatoryRecords);
        updateMandatoryStatistics(data.mandatoryRecords);
      } else {
        listDiv.innerHTML =
          '<div class="alert alert-warning">No mandatory records found</div>';
        updateMandatoryStatistics({});
      }
    })
    .catch((error) => {
      console.error("Error loading mandatory records:", error);
      listDiv.innerHTML =
        '<div class="alert alert-danger">Error loading mandatory records</div>';
      updateMandatoryStatistics({});
    });
}

function displayMandatoryRecords(records) {
  const listDiv = document.getElementById("mandatoryRecordsList");
  if (!listDiv || !records) return;

  let html = "";

  Object.keys(records).forEach((recordType) => {
    const record = records[recordType];
    const allDocs = record.enrichedDocuments || [];

    const linkedDocuments = allDocs.filter(
      (doc) => doc.manuallyLinked === true
    );
    const autoDetectedDocuments = allDocs.filter(
      (doc) => doc.autoDetected === true && doc.manuallyLinked !== true
    );

    const isLinked = linkedDocuments.length > 0;
    const hasAutoDetected = autoDetectedDocuments.length > 0;

    const statusIcon = isLinked
      ? '<i class="fas fa-check-circle text-success"></i>'
      : '<i class="fas fa-exclamation-triangle text-warning"></i>';

    html += `
      <div class="ims-category mb-3" data-record-type="${recordType}">
        <div class="ims-category-level-2">
          <div class="d-flex align-items-center">
            <div class="flex-grow-1">
              ${statusIcon}
              <span class="mandatory-record-title">${recordType}</span>
              <small class="text-muted ms-2">${record.description || ""}</small>
              ${
                hasAutoDetected
                  ? `<span class="badge bg-info ms-1">${autoDetectedDocuments.length} detected</span>`
                  : ""
              }
            </div>
            <button class="btn btn-sm btn-outline-info link-mandatory-btn" 
                    data-record-type="${recordType}"
                    style="font-size: 0.7rem;">
              <i class="fas fa-link"></i> Link
            </button>
          </div>
        </div>
        
        ${
          isLinked
            ? `
          <div class="mt-2 mb-3">
            <h6 class="text-success"><i class="fas fa-check-circle"></i> Linked Documents</h6>
            <ul class="ims-child-list">
              ${linkedDocuments
                .map(
                  (doc) => `
                <li class="ims-child-item ims-document-item ${
                  doc.isArchived ? "ims-document-archived" : ""
                }" 
                    data-document="${doc.name}" 
                    data-is-archived="${doc.isArchived}">
                  <div class="flex-grow-1">
                    <i class="fas fa-check-circle text-success ims-status-icon"></i>
                    <a href="/document/${doc.id}" class="ims-document-link">${
                    doc.name
                  }</a>
                    ${
                      doc.isArchived
                        ? '<span class="ims-archived-badge">ARCHIVED</span>'
                        : ""
                    }
                  </div>
                  <button class="btn btn-sm btn-outline-danger unlink-mandatory-btn" 
                          data-record-type="${recordType}" 
                          data-document-id="${doc.id}"
                          style="font-size: 0.6rem;">
                    <i class="fas fa-unlink"></i>
                  </button>
                </li>
              `
                )
                .join("")}
            </ul>
          </div>
        `
            : ""
        }
        
        ${
          hasAutoDetected
            ? `
          <div class="mt-2">
            <h6 class="text-info">
              <i class="fas fa-search"></i> Auto-Detected Documents 
              <small class="text-muted">(Click to link)</small>
            </h6>
            <div class="alert alert-light p-2">
              <small class="text-muted mb-2 d-block">
                <strong>Keywords:</strong> ${
                  record.autoDetectKeywords
                    ? record.autoDetectKeywords.join(", ")
                    : "None"
                }
              </small>
              <div class="auto-detected-documents">
                ${autoDetectedDocuments
                  .slice(0, 5)
                  .map(
                    (doc) => `
                  <div class="list-group-item list-group-item-action auto-detected-item mb-1 ${
                    doc.isArchived ? "archived" : ""
                  }" 
                       data-doc-id="${doc.id}" 
                       data-doc-name="${doc.name}" 
                       data-record-type="${recordType}"
                       data-is-archived="${doc.isArchived}"
                       style="cursor: pointer; font-size: 0.9rem; padding: 0.5rem;">
                    <div class="d-flex justify-content-between align-items-center">
                      <div>
                        <i class="fas fa-file-alt text-info me-2"></i>
                        <strong>${doc.name}</strong>
                        ${
                          doc.isArchived
                            ? '<span class="ims-archived-badge">ARCHIVED</span>'
                            : ""
                        }
                      </div>
                      <div>
                        <small class="text-success me-2">Click to link</small>
                        <i class="fas fa-plus-circle text-success"></i>
                      </div>
                    </div>
                    <div class="mt-1">
                      <small class="text-muted">📁 ${
                        doc.folder || "Root folder"
                      }</small>
                    </div>
                  </div>
                `
                  )
                  .join("")}
                ${
                  autoDetectedDocuments.length > 5
                    ? `
                  <div class="text-center mt-2">
                    <small class="text-muted">... and ${
                      autoDetectedDocuments.length - 5
                    } more</small>
                  </div>
                `
                    : ""
                }
              </div>
            </div>
          </div>
        `
            : ""
        }
      </div>
    `;
  });

  listDiv.innerHTML =
    html ||
    '<div class="text-center text-muted py-4">No mandatory records configured</div>';

  // Add event listeners
  addMandatoryRecordEventListeners();
}

function addMandatoryRecordEventListeners() {
  // Link mandatory record buttons
  document.querySelectorAll(".link-mandatory-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const recordType = this.getAttribute("data-record-type");
      openMandatoryDocumentLinker(recordType);
    });
  });

  // Unlink mandatory record buttons
  document.querySelectorAll(".unlink-mandatory-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const recordType = this.getAttribute("data-record-type");
      const documentId = this.getAttribute("data-document-id");
      unlinkMandatoryDocument(recordType, documentId);
    });
  });

  // Auto-detected documents click handlers
  document.querySelectorAll(".auto-detected-item").forEach((item) => {
    item.addEventListener("click", function () {
      const docId = this.getAttribute("data-doc-id");
      const docName = this.getAttribute("data-doc-name");
      const recordType = this.getAttribute("data-record-type");
      const isArchived = this.getAttribute("data-is-archived") === "true";

      document
        .querySelectorAll(".auto-detected-item")
        .forEach((i) => i.classList.remove("active"));
      this.classList.add("active");

      let confirmMessage = `Link "${docName}" to mandatory record "${recordType}"?`;
      if (isArchived) {
        confirmMessage +=
          "\n\n⚠️ WARNING: This document is archived and may be outdated.";
      }

      if (confirm(confirmMessage)) {
        linkMandatoryDocument(recordType, docId, docName);
      }
    });
  });
}

function updateMandatoryStatistics(records) {
  const totalElement = document.getElementById("mandatoryTotal");
  const coverageElement = document.getElementById("mandatoryCoverage");

  if (!totalElement || !coverageElement || !records) return;

  const total = Object.keys(records).length;
  const covered = Object.keys(records).filter((key) => {
    const record = records[key];
    return record.enrichedDocuments?.some((doc) => doc.manuallyLinked === true);
  }).length;

  const coverage = total > 0 ? Math.round((covered / total) * 100) : 0;

  totalElement.textContent = total;
  coverageElement.textContent = coverage + "%";
}

function openMandatoryDocumentLinker(recordType) {
  console.log("Opening mandatory document linker for:", recordType);

  // Remove existing modal
  const existingModal = document.getElementById("linkMandatoryModal");
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal
  const modalDiv = document.createElement("div");
  modalDiv.innerHTML = `
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

  document.body.appendChild(modalDiv.firstElementChild);

  const modal = new bootstrap.Modal(
    document.getElementById("linkMandatoryModal")
  );
  modal.show();

  // Add search functionality
  document
    .getElementById("searchMandatoryBtn")
    .addEventListener("click", function () {
      const searchTerm = document
        .getElementById("linkMandatorySearch")
        .value.trim();
      if (searchTerm) {
        searchMandatoryDocuments(searchTerm, recordType);
      } else {
        alert("Please enter a search term");
      }
    });

  document
    .getElementById("linkMandatorySearch")
    .addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        const searchTerm = this.value.trim();
        if (searchTerm) {
          searchMandatoryDocuments(searchTerm, recordType);
        }
      }
    });
}

async function searchMandatoryDocuments(searchTerm, recordType) {
  const resultsDiv = document.getElementById("linkMandatoryResults");
  resultsDiv.innerHTML =
    '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

  try {
    const response = await fetch(
      `/api/available-documents?search=${encodeURIComponent(searchTerm)}`
    );
    const documents = await response.json();

    if (documents.length === 0) {
      resultsDiv.innerHTML =
        '<div class="alert alert-info">No documents found matching your search</div>';
      return;
    }

    let html = '<div class="list-group">';
    documents.slice(0, 15).forEach((doc) => {
      const archivedBadge = doc.isArchived
        ? '<span class="ims-archived-badge">ARCHIVED</span>'
        : "";

      html += `
        <div class="list-group-item list-group-item-action mandatory-link-result ${
          doc.isArchived ? "archived" : ""
        }" 
             data-doc-id="${doc.id}" 
             data-doc-name="${doc.name}" 
             data-is-archived="${doc.isArchived}" 
             style="cursor: pointer;">
          <div class="d-flex w-100 justify-content-between">
            <div>
              <h6 class="mb-1">
                <i class="fas fa-file-alt me-2"></i>${doc.name}${archivedBadge}
              </h6>
              <p class="mb-1"><small class="text-muted">📁 ${
                doc.folder || "Root folder"
              }</small></p>
            </div>
            <div class="text-end">
              <small class="text-success">Click to link</small>
              <i class="fas fa-plus-circle text-success"></i>
            </div>
          </div>
        </div>
      `;
    });

    if (documents.length > 15) {
      html += `
        <div class="list-group-item">
          <div class="text-center text-muted">
            <small>... and ${
              documents.length - 15
            } more results. Try a more specific search.</small>
          </div>
        </div>
      `;
    }

    html += "</div>";
    resultsDiv.innerHTML = html;

    // Add click handlers
    document.querySelectorAll(".mandatory-link-result").forEach((result) => {
      result.addEventListener("click", function () {
        const docId = this.getAttribute("data-doc-id");
        const docName = this.getAttribute("data-doc-name");
        const isArchived = this.getAttribute("data-is-archived") === "true";

        document
          .querySelectorAll(".mandatory-link-result")
          .forEach((r) => r.classList.remove("active"));
        this.classList.add("active");

        let confirmMessage = `Link "${docName}" to mandatory record "${recordType}"?`;
        if (isArchived) {
          confirmMessage +=
            "\n\n⚠️ WARNING: This document is archived and may be outdated.";
        }

        if (confirm(confirmMessage)) {
          linkMandatoryDocument(recordType, docId, docName);
        }
      });
    });
  } catch (error) {
    console.error("Search error:", error);
    resultsDiv.innerHTML =
      '<div class="alert alert-danger">Error searching documents</div>';
  }
}

function linkMandatoryDocument(recordType, documentId, documentName) {
  fetch("/api/link-mandatory-record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recordType: recordType,
      documentId: documentId,
      actualDocumentName: documentName,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        alert(`Successfully linked "${documentName}" to "${recordType}"!`);

        const modal = bootstrap.Modal.getInstance(
          document.getElementById("linkMandatoryModal")
        );
        if (modal) {
          modal.hide();
        }

        setTimeout(() => {
          loadMandatoryRecords();
        }, 1000);
      } else {
        alert("Error linking document: " + (data.message || "Unknown error"));
      }
    })
    .catch((error) => {
      console.error("Linking error:", error);
      alert("Error linking document: " + error.message);
    });
}

function unlinkMandatoryDocument(recordType, documentId) {
  if (!confirm("Are you sure you want to unlink this document?")) {
    return;
  }

  fetch(
    `/api/mandatory-record/${encodeURIComponent(recordType)}/${documentId}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }
  )
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        alert("Document unlinked successfully!");
        loadMandatoryRecords();
      } else {
        alert("Error unlinking document: " + (data.message || "Unknown error"));
      }
    })
    .catch((error) => {
      console.error("Error unlinking document:", error);
      alert("Error unlinking document: " + error.message);
    });
}

function autoDetectMandatoryRecords() {
  const button = document.getElementById("autoDetectMandatoryBtn");
  const originalText = button.innerHTML;

  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting...';

  fetch("/api/auto-detect-mandatory-records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        alert(
          `Auto-detection completed! Found ${data.detectedCount} potential matches.`
        );
        loadMandatoryRecords();
      } else {
        alert("Error during auto-detection: " + data.message);
      }
    })
    .catch((error) => {
      console.error("Error auto-detecting:", error);
      alert("Error during auto-detection");
    })
    .finally(() => {
      button.disabled = false;
      button.innerHTML = originalText;
    });
}
// Add this debugging code to your ims-index.js to test the modal functions

// Test function to check if Bootstrap modals work
function testBootstrapModal() {
  console.log("Testing Bootstrap modal...");

  // Create a simple test modal
  const testModalHtml = `
    <div class="modal fade" id="testModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Test Modal</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p>This is a test modal. If you can see this, Bootstrap modals are working!</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing test modal
  const existingModal = document.getElementById("testModal");
  if (existingModal) {
    existingModal.remove();
  }

  // Add test modal to page
  document.body.insertAdjacentHTML("beforeend", testModalHtml);

  // Try to show it
  try {
    const modal = new bootstrap.Modal(document.getElementById("testModal"));
    modal.show();
    console.log("✅ Bootstrap modal created and shown successfully");
  } catch (error) {
    console.error("❌ Bootstrap modal error:", error);
  }
}

// Test function for checking available functions
function checkAvailableFunctions() {
  console.log("=== FUNCTION CHECK ===");
  console.log(
    "openCategoryEditor exists:",
    typeof openCategoryEditor !== "undefined"
  );
  console.log(
    "openDocumentLinker exists:",
    typeof openDocumentLinker !== "undefined"
  );
  console.log(
    "openRevisionModal exists:",
    typeof openRevisionModal !== "undefined"
  );
  console.log(
    "openAIGenerationModal exists:",
    typeof openAIGenerationModal !== "undefined"
  );
  console.log("bootstrap exists:", typeof bootstrap !== "undefined");
  console.log(
    "Bootstrap Modal exists:",
    typeof bootstrap?.Modal !== "undefined"
  );
}

// Enhanced event listener with better debugging
function setupEnhancedEventListeners() {
  console.log("=== SETTING UP ENHANCED EVENT LISTENERS ===");

  document.addEventListener("click", function (e) {
    console.log("Click detected on:", e.target);

    // Test for AI Generate buttons first
    if (e.target.closest(".ai-generate-btn")) {
      e.preventDefault();
      e.stopPropagation();
      console.log("🤖 AI Generate button clicked!");

      const btn = e.target.closest(".ai-generate-btn");
      const categoryName = btn.getAttribute("data-category");
      const documentName = btn.getAttribute("data-document");

      console.log("AI Generate data:", { categoryName, documentName });

      if (typeof openAIGenerationModal === "function") {
        console.log("Calling openAIGenerationModal...");
        openAIGenerationModal(categoryName, documentName);
      } else {
        console.error("❌ openAIGenerationModal function not found!");
        alert(
          "AI Generation function not available. Check console for details."
        );
      }
      return;
    }

    // Manage category buttons
    if (e.target.closest(".manage-category-btn")) {
      e.preventDefault();
      e.stopPropagation();
      console.log("⚙️ Manage category button clicked!");

      const btn = e.target.closest(".manage-category-btn");
      const categoryName = btn.getAttribute("data-category");
      console.log("Category data:", { categoryName });

      if (typeof openCategoryEditor === "function") {
        console.log("Calling openCategoryEditor...");
        try {
          openCategoryEditor(categoryName);
          console.log("✅ openCategoryEditor called successfully");
        } catch (error) {
          console.error("❌ Error in openCategoryEditor:", error);
          alert("Error opening category editor: " + error.message);
        }
      } else {
        console.error("❌ openCategoryEditor function not found!");
        alert(
          "Category editor function not available. Check console for details."
        );
      }
      return;
    }

    // Manage document buttons
    if (e.target.closest(".manage-document-btn")) {
      e.preventDefault();
      e.stopPropagation();
      console.log("📄 Manage document button clicked!");

      const btn = e.target.closest(".manage-document-btn");
      const categoryName = btn.getAttribute("data-category");
      const documentName = btn.getAttribute("data-document");
      console.log("Document data:", { categoryName, documentName });

      if (typeof openDocumentLinker === "function") {
        console.log("Calling openDocumentLinker...");
        try {
          openDocumentLinker(categoryName, documentName);
          console.log("✅ openDocumentLinker called successfully");
        } catch (error) {
          console.error("❌ Error in openDocumentLinker:", error);
          alert("Error opening document linker: " + error.message);
        }
      } else {
        console.error("❌ openDocumentLinker function not found!");
        alert(
          "Document linker function not available. Check console for details."
        );
      }
      return;
    }

    // Revision buttons
    if (
      e.target.closest(".revision-btn") ||
      e.target.closest(".category-revision-btn")
    ) {
      e.preventDefault();
      e.stopPropagation();
      console.log("📝 Revision button clicked!");

      const btn =
        e.target.closest(".revision-btn") ||
        e.target.closest(".category-revision-btn");
      const documentId = btn.getAttribute("data-document-id");
      const documentName = btn.getAttribute("data-document-name");
      console.log("Revision data:", { documentId, documentName });

      if (typeof openRevisionModal === "function") {
        console.log("Calling openRevisionModal...");
        try {
          openRevisionModal(documentId, documentName);
          console.log("✅ openRevisionModal called successfully");
        } catch (error) {
          console.error("❌ Error in openRevisionModal:", error);
          alert("Error opening revision modal: " + error.message);
        }
      } else {
        console.error("❌ openRevisionModal function not found!");
        alert(
          "Revision modal function not available. Check console for details."
        );
      }
      return;
    }

    // Category link buttons
    if (e.target.closest(".category-link-btn")) {
      e.preventDefault();
      e.stopPropagation();
      console.log("🔗 Category link button clicked!");

      const btn = e.target.closest(".category-link-btn");
      const categoryName = btn.getAttribute("data-category");
      const documentName = btn.getAttribute("data-document-name");
      console.log("Category link data:", { categoryName, documentName });

      if (typeof openCategoryDocumentLinker === "function") {
        console.log("Calling openCategoryDocumentLinker...");
        try {
          openCategoryDocumentLinker(categoryName, documentName);
          console.log("✅ openCategoryDocumentLinker called successfully");
        } catch (error) {
          console.error("❌ Error in openCategoryDocumentLinker:", error);
          alert("Error opening category document linker: " + error.message);
        }
      } else {
        console.error("❌ openCategoryDocumentLinker function not found!");
        alert(
          "Category document linker function not available. Check console for details."
        );
      }
      return;
    }
  });

  console.log("✅ Enhanced event listeners set up");
}

// Add to your DOMContentLoaded event:
document.addEventListener("DOMContentLoaded", function () {
  console.log("=== DEBUGGING IMS INDEX ===");

  // Run diagnostics
  checkAvailableFunctions();

  // Set up enhanced event listeners
  setupEnhancedEventListeners();

  // Test Bootstrap after a short delay
  setTimeout(() => {
    console.log("Testing Bootstrap modals...");
    // Uncomment this line to test if Bootstrap modals work at all:
    // testBootstrapModal();
  }, 2000);

  // ... rest of your existing DOMContentLoaded code
});

// Call this function from browser console to test Bootstrap
window.testModal = testBootstrapModal;
window.checkFunctions = checkAvailableFunctions;

// Add this to the VERY END of your ims-index.js file
// This makes all your modal functions globally accessible

// Make functions available globally for event handlers
window.openCategoryEditor = openCategoryEditor;
window.openDocumentLinker = openDocumentLinker;
window.openRevisionModal = openRevisionModal;
window.openCategoryDocumentLinker = openCategoryDocumentLinker;
window.openAIGenerationModal = openAIGenerationModal;
window.generateAIDocumentNew = generateAIDocumentNew;
window.showAIError = showAIError;

// Emergency event delegation setup
console.log("Setting up emergency event delegation...");

document.addEventListener("click", function (e) {
  console.log("Click detected on:", e.target.className);

  // AI Generate buttons
  if (e.target.closest(".ai-generate-btn")) {
    e.preventDefault();
    e.stopPropagation();
    console.log("🤖 AI Generate button clicked!");

    const btn = e.target.closest(".ai-generate-btn");
    const categoryName = btn.getAttribute("data-category");
    const documentName = btn.getAttribute("data-document");

    console.log("AI Data:", { categoryName, documentName });

    if (typeof window.openAIGenerationModal === "function") {
      window.openAIGenerationModal(categoryName, documentName);
    } else {
      alert("AI Generation function not found!");
    }
    return;
  }

  // Manage category buttons
  if (e.target.closest(".manage-category-btn")) {
    e.preventDefault();
    e.stopPropagation();
    console.log("⚙️ Manage category button clicked!");

    const btn = e.target.closest(".manage-category-btn");
    const categoryName = btn.getAttribute("data-category");

    console.log("Category Data:", { categoryName });

    if (typeof window.openCategoryEditor === "function") {
      window.openCategoryEditor(categoryName);
    } else {
      alert("Category editor function not found!");
    }
    return;
  }

  // Manage document buttons
  if (e.target.closest(".manage-document-btn")) {
    e.preventDefault();
    e.stopPropagation();
    console.log("📄 Manage document button clicked!");

    const btn = e.target.closest(".manage-document-btn");
    const categoryName = btn.getAttribute("data-category");
    const documentName = btn.getAttribute("data-document");

    console.log("Document Data:", { categoryName, documentName });

    if (typeof window.openDocumentLinker === "function") {
      window.openDocumentLinker(categoryName, documentName);
    } else {
      alert("Document linker function not found!");
    }
    return;
  }

  // Revision buttons
  if (
    e.target.closest(".revision-btn") ||
    e.target.closest(".category-revision-btn")
  ) {
    e.preventDefault();
    e.stopPropagation();
    console.log("📝 Revision button clicked!");

    const btn =
      e.target.closest(".revision-btn") ||
      e.target.closest(".category-revision-btn");
    const documentId = btn.getAttribute("data-document-id");
    const documentName = btn.getAttribute("data-document-name");

    console.log("Revision Data:", { documentId, documentName });

    if (typeof window.openRevisionModal === "function") {
      window.openRevisionModal(documentId, documentName);
    } else {
      alert("Revision modal function not found!");
    }
    return;
  }

  // Category link buttons
  if (e.target.closest(".category-link-btn")) {
    e.preventDefault();
    e.stopPropagation();
    console.log("🔗 Category link button clicked!");

    const btn = e.target.closest(".category-link-btn");
    const categoryName = btn.getAttribute("data-category");
    const documentName = btn.getAttribute("data-document-name");

    console.log("Category Link Data:", { categoryName, documentName });

    if (typeof window.openCategoryDocumentLinker === "function") {
      window.openCategoryDocumentLinker(categoryName, documentName);
    } else {
      alert("Category document linker function not found!");
    }
    return;
  }
});

console.log("✅ Emergency event delegation setup complete");

// Test if functions are now accessible
console.log("Function check after making global:");
console.log("openCategoryEditor:", typeof window.openCategoryEditor);
console.log("openAIGenerationModal:", typeof window.openAIGenerationModal);
