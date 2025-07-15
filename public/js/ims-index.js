// Archive toggle state
let showArchivedDocuments = false;

document.addEventListener('DOMContentLoaded', function() {
  console.log('IMS Index JavaScript loading...');
  
  // Calculate and display statistics
  updateStatistics();
  
  // Search functionality
  document.getElementById('imsSearch').addEventListener('input', function() {
    filterIMSIndex();
  });
  
  // Filter functionality
  document.getElementById('imsFilter').addEventListener('change', function() {
    filterIMSIndex();
  });
  
  // Hide archived checkbox
  document.getElementById('hideArchivedCheck').addEventListener('change', function() {
    toggleArchivedDocuments();
  });
  
  // Category management buttons
  document.querySelectorAll('.manage-category-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      const categoryName = this.getAttribute('data-category');
      console.log('Opening category editor for:', categoryName);
      openCategoryEditor(categoryName);
    });
  });
  
  // Document management buttons
  document.querySelectorAll('.manage-document-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      const categoryName = this.getAttribute('data-category');
      const documentName = this.getAttribute('data-document');
      console.log('Opening document linker for:', documentName, 'in category:', categoryName);
      openDocumentLinker(categoryName, documentName);
    });
  });
  
  // Add new category button
  document.getElementById('addCategoryBtn').addEventListener('click', function() {
    const categoryName = document.getElementById('newCategoryName').value.trim();
    const level = document.getElementById('newCategoryLevel').value;
    
    if (!categoryName) {
      alert('Please enter a category name');
      return;
    }
    
    addNewCategory(categoryName, level);
  });
  
  // Auto-link button
  document.getElementById('autoLinkBtn').addEventListener('click', function() {
    autoLinkDocuments();
  });
  
  // Handle revision button clicks
  document.addEventListener('click', function(e) {
    if (e.target.closest('.revision-btn')) {
      const btn = e.target.closest('.revision-btn');
      const documentId = btn.getAttribute('data-document-id');
      const documentName = btn.getAttribute('data-document-name');
      
      openRevisionModal(documentId, documentName);
    }
    
    // Handle category revision button clicks
    if (e.target.closest('.category-revision-btn')) {
      const btn = e.target.closest('.category-revision-btn');
      const documentId = btn.getAttribute('data-document-id');
      const documentName = btn.getAttribute('data-document-name');
      
      openRevisionModal(documentId, documentName);
    }
    
    // Handle category link button clicks
    if (e.target.closest('.category-link-btn')) {
      const btn = e.target.closest('.category-link-btn');
      const categoryName = btn.getAttribute('data-category');
      const documentName = btn.getAttribute('data-document-name');
      
      openCategoryDocumentLinker(categoryName, documentName);
    }
  });
  
  // Load mandatory records on page load
  loadMandatoryRecords();
  
  // Auto-detect mandatory records button
  document.getElementById('autoDetectMandatoryBtn').addEventListener('click', function() {
    autoDetectMandatoryRecords();
  });
  
  // Manage mandatory modal handlers
  const manageMandatoryModal = document.getElementById('manageMandatoryModal');
  if (manageMandatoryModal) {
    manageMandatoryModal.addEventListener('show.bs.modal', function() {
      loadMandatoryRecordTypes();
    });
  }
  
  document.getElementById('mandatoryRecordSelect').addEventListener('change', function() {
    loadMandatoryRecordSettings();
  });
  
  document.getElementById('updateMandatoryBtn').addEventListener('click', function() {
    updateMandatoryRecordSettings();
  });
  
  document.getElementById('runAutoDetectBtn').addEventListener('click', function() {
    autoDetectMandatoryRecords();
  });
  
  // Initialize revision features
  setTimeout(() => {
    addRevisionButtons();
  }, 1500);
  
  // Update statistics on page load using stored values
  if (window.imsStats) {
    document.getElementById('linkedCount').textContent = window.imsStats.linkedDocuments;
    document.getElementById('missingCount').textContent = window.imsStats.missingDocuments;
    const coverage = window.imsStats.totalDocuments > 0 ? 
      Math.round((window.imsStats.linkedDocuments / window.imsStats.totalDocuments) * 100) : 0;
    document.getElementById('coveragePercent').textContent = coverage + '%';
  }
  
  console.log('IMS Index JavaScript loaded successfully');
});

function updateStatistics() {
  const totalElements = document.querySelectorAll('.ims-document-item, .ims-category').length;
  const linkedElements = document.querySelectorAll('.fa-check-circle').length;
  const missingElements = document.querySelectorAll('.fa-times-circle').length;
  const coverage = totalElements > 0 ? Math.round((linkedElements / totalElements) * 100) : 0;
  
  document.getElementById('linkedCount').textContent = linkedElements;
  document.getElementById('missingCount').textContent = missingElements;
  document.getElementById('coveragePercent').textContent = coverage + '%';
}

function filterIMSIndex() {
  const searchTerm = document.getElementById('imsSearch').value.toLowerCase();
  const filterType = document.getElementById('imsFilter').value;
  const hideArchived = document.getElementById('hideArchivedCheck').checked;
  
  document.querySelectorAll('.ims-category').forEach(category => {
    const categoryText = category.textContent.toLowerCase();
    const categoryType = category.getAttribute('data-type');
    const hasLinked = category.querySelector('.fa-check-circle');
    const hasMissing = category.querySelector('.fa-times-circle');
    const hasArchived = category.querySelector('.ims-document-archived');
    
    let showCategory = true;
    
    if (searchTerm && !categoryText.includes(searchTerm)) {
      showCategory = false;
    }
    
    if (filterType !== 'all') {
      if (filterType === 'linked' && !hasLinked) showCategory = false;
      if (filterType === 'missing' && !hasMissing) showCategory = false;
      if (filterType === 'policies' && categoryType !== 'policy') showCategory = false;
      if (filterType === 'procedures' && categoryType !== 'category') showCategory = false;
      if (filterType === 'archived' && !hasArchived) showCategory = false;
    }
    
    // Handle hide archived
    if (hideArchived && filterType !== 'archived') {
      const archivedItems = category.querySelectorAll('.ims-document-archived');
      archivedItems.forEach(item => {
        item.style.display = 'none';
      });
    } else {
      const archivedItems = category.querySelectorAll('.ims-document-archived');
      archivedItems.forEach(item => {
        item.style.display = '';
      });
    }
    
    category.style.display = showCategory ? 'block' : 'none';
  });
}

function toggleArchivedDocuments() {
  const hideArchived = document.getElementById('hideArchivedCheck').checked;
  const archivedItems = document.querySelectorAll('.ims-document-archived');
  
  archivedItems.forEach(item => {
    item.style.display = hideArchived ? 'none' : '';
  });
}

function addRevisionButtons() {
  document.querySelectorAll('.ims-child-item').forEach(item => {
    const documentName = item.getAttribute('data-document');
    const categoryName = item.closest('.ims-category').getAttribute('data-category');
    const documentLink = item.querySelector('.ims-document-link');
    
    if (documentLink && !item.querySelector('.revision-btn')) {
      // Extract document ID from the link
      const documentId = documentLink.href.split('/document/')[1];
      
      // Add revision button
      const revisionBtn = document.createElement('button');
      revisionBtn.className = 'btn btn-sm btn-outline-warning ms-1 revision-btn';
      revisionBtn.style.fontSize = '0.6rem';
      revisionBtn.innerHTML = '<i class="fas fa-edit"></i>';
      revisionBtn.title = 'Upload new revision';
      revisionBtn.setAttribute('data-document-id', documentId);
      revisionBtn.setAttribute('data-document-name', documentName);
      
      // Insert before the existing manage button
      const manageBtn = item.querySelector('.manage-document-btn');
      if (manageBtn) {
        manageBtn.parentNode.insertBefore(revisionBtn, manageBtn);
      }
    }
  });
}

function openRevisionModal(documentId, documentName) {
  const modalHtml = `
    <div class="modal fade" id="revisionModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Upload New Revision: ${documentName}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <form id="quickRevisionForm" enctype="multipart/form-data">
              <div class="mb-3">
                <label for="quickRevisionFile" class="form-label">Select New Document</label>
                <input type="file" class="form-control" id="quickRevisionFile" name="newDocument" required>
                <div class="form-text">
                  Replacing: <strong>${documentName}</strong>
                </div>
              </div>
              
              <div class="mb-3">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="quickKeepOriginal" name="keepOriginal" value="true" checked>
                  <label class="form-check-label" for="quickKeepOriginal">
                    Keep backup copy of original document
                  </label>
                </div>
              </div>
              
              <div class="mb-3">
                <label for="quickRevisionNote" class="form-label">Revision Note</label>
                <textarea class="form-control" id="quickRevisionNote" name="revisionNote" rows="3" 
                          placeholder="Describe what changed in this revision..."></textarea>
              </div>
              
              <div class="mb-3">
                <label for="quickReplacedBy" class="form-label">Replaced By</label>
                <input type="text" class="form-control" id="quickReplacedBy" name="replacedBy" 
                       placeholder="Your name or ID">
              </div>
            </form>
            
            <div class="mt-4">
              <h6>Recent Revisions</h6>
              <div id="quickRevisionHistory">
                <div class="text-center text-muted">
                  <i class="fas fa-spinner fa-spin"></i> Loading...
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="submitQuickRevision('${documentId}')">
              <i class="fas fa-upload"></i> Upload Revision
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Remove existing modal if present
  const existingModal = document.getElementById('revisionModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  const modal = new bootstrap.Modal(document.getElementById('revisionModal'));
  modal.show();
  
  // Load revision history
  loadQuickRevisionHistory(documentId);
}

function loadQuickRevisionHistory(documentId) {
  const historyDiv = document.getElementById('quickRevisionHistory');
  
  fetch(`/api/document-revisions/${documentId}`)
    .then(response => response.json())
    .then(data => {
      if (data.success && data.revisions.length > 0) {
        let historyHtml = '';
        data.revisions.slice(-3).forEach(revision => { // Show last 3 revisions
          const date = new Date(revision.timestamp).toLocaleString();
          historyHtml += `
            <div class="border rounded p-2 mb-1 bg-light">
              <small class="text-muted">${date}</small>
              <div><small><strong>${revision.originalFile}</strong> → <strong>${revision.newFile}</strong></small></div>
              <div><small>By: ${revision.replacedBy}</small></div>
              ${revision.note ? `<div><small><em>${revision.note}</em></small></div>` : ''}
            </div>
          `;
        });
        historyDiv.innerHTML = historyHtml;
      } else {
        historyDiv.innerHTML = '<div class="text-muted"><small>No revision history found</small></div>';
      }
    })
    .catch(error => {
      console.error('Error loading revision history:', error);
      historyDiv.innerHTML = '<div class="text-danger"><small>Error loading revision history</small></div>';
    });
}

function submitQuickRevision(documentId) {
  const form = document.getElementById('quickRevisionForm');
  const formData = new FormData(form);
  
  const submitButton = document.querySelector('#revisionModal .btn-primary');
  submitButton.disabled = true;
  submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  
  fetch(`/api/replace-document/${documentId}`, {
    method: 'POST',
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      alert('Document replaced successfully!');
      
      const modal = bootstrap.Modal.getInstance(document.getElementById('revisionModal'));
      modal.hide();
      
      // Reload the page to show updated document
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      alert('Error replacing document: ' + data.message);
    }
  })
  .catch(error => {
    console.error('Error:', error);
    alert('Error replacing document');
  })
  .finally(() => {
    submitButton.disabled = false;
    submitButton.innerHTML = '<i class="fas fa-upload"></i> Upload Revision';
  });
}

function openCategoryEditor(categoryName) {
  console.log('Creating category editor modal for:', categoryName);
  
  const modalHtml = 
    '<div class="modal fade" id="editCategoryModal" tabindex="-1" aria-hidden="true">' +
      '<div class="modal-dialog">' +
        '<div class="modal-content">' +
          '<div class="modal-header">' +
            '<h5 class="modal-title">Edit Category: ' + categoryName + '</h5>' +
            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<form id="editCategoryForm">' +
              '<div class="mb-3">' +
                '<label class="form-label">Category Name</label>' +
                '<input type="text" class="form-control" id="editCategoryName" value="' + categoryName + '">' +
              '</div>' +
              '<div class="mb-3">' +
                '<label class="form-label">Level</label>' +
                '<select class="form-select" id="editCategoryLevel">' +
                  '<option value="1">Level 1 (Policy)</option>' +
                  '<option value="2">Level 2 (Category)</option>' +
                '</select>' +
              '</div>' +
              '<div class="mb-3">' +
                '<label class="form-label">Type</label>' +
                '<select class="form-select" id="editCategoryType">' +
                  '<option value="policy">Policy</option>' +
                  '<option value="category">Category</option>' +
                  '<option value="procedure">Procedure</option>' +
                '</select>' +
              '</div>' +
              '<div class="mb-3">' +
                '<h6>Child Documents</h6>' +
                '<div id="childDocumentsList"></div>' +
                '<div class="input-group mt-2">' +
                  '<input type="text" class="form-control" id="newChildDocumentName" placeholder="Add new child document...">' +
                  '<button type="button" class="btn btn-outline-primary" id="addChildBtn">Add</button>' +
                '</div>' +
              '</div>' +
            '</form>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn btn-danger" id="deleteCategoryBtn">Delete Category</button>' +
            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
            '<button type="button" class="btn btn-primary" id="saveCategoryBtn">Save Changes</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  
  const existingModal = document.getElementById('editCategoryModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  const modal = new bootstrap.Modal(document.getElementById('editCategoryModal'));
  modal.show();
  
  loadCategoryData(categoryName);
  setupCategoryModalHandlers(categoryName, modal);
}

function openDocumentLinker(categoryName, documentName) {
  console.log('Opening document linker for:', documentName);
  
  const modalHtml = 
    '<div class="modal fade" id="linkDocumentModal" tabindex="-1" aria-hidden="true">' +
      '<div class="modal-dialog modal-lg">' +
        '<div class="modal-content">' +
          '<div class="modal-header">' +
            '<h5 class="modal-title">Link Document: ' + documentName + '</h5>' +
            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<div class="ims-archive-controls">' +
              '<div class="form-check">' +
                '<input class="form-check-input" type="checkbox" id="includeArchivedCheck" ' + 
                (showArchivedDocuments ? 'checked' : '') + '>' +
                '<label class="form-check-label" for="includeArchivedCheck">' +
                  '<i class="fas fa-archive me-1"></i> Include archived documents' +
                '</label>' +
                '<small class="d-block text-muted">Documents in folders containing "archive" in the name</small>' +
              '</div>' +
            '</div>' +
            '<div class="mb-3">' +
              '<label class="form-label">Search for the actual document file:</label>' +
              '<div class="input-group">' +
                '<input type="text" class="form-control" id="linkDocumentSearch" placeholder="Type to search..." value="' + documentName + '">' +
                '<button type="button" class="btn btn-outline-primary" id="searchForDocumentBtn">' +
                  '<i class="fas fa-search"></i> Search' +
                '</button>' +
              '</div>' +
            '</div>' +
            '<div id="linkDocumentResults" class="mt-3">' +
              '<div class="text-center text-muted">' +
                '<i class="fas fa-search fa-2x mb-2"></i><br>' +
                'Searching for documents...' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  
  const existingModal = document.getElementById('linkDocumentModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  const modal = new bootstrap.Modal(document.getElementById('linkDocumentModal'));
  modal.show();
  
  setupDocumentLinkHandlers(categoryName, documentName);
  
  // Add archive checkbox handler
  document.getElementById('includeArchivedCheck').addEventListener('change', function() {
    showArchivedDocuments = this.checked;
    const searchTerm = document.getElementById('linkDocumentSearch').value.trim();
    if (searchTerm) {
      performDocumentSearch(searchTerm, categoryName, documentName);
    }
  });
  
  setTimeout(function() {
    performDocumentSearch(documentName, categoryName, documentName);
  }, 500);
}

function openCategoryDocumentLinker(categoryName, documentName) {
  console.log('Opening category document linker for:', documentName, 'in category:', categoryName);
  
  const modalHtml = 
    '<div class="modal fade" id="linkCategoryDocumentModal" tabindex="-1" aria-hidden="true">' +
      '<div class="modal-dialog modal-lg">' +
        '<div class="modal-content">' +
          '<div class="modal-header">' +
            '<h5 class="modal-title">Link Document to Category: ' + categoryName + '</h5>' +
            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<div class="alert alert-info">' +
              '<i class="fas fa-info-circle"></i> ' +
              'This will link a document directly to the category header, not to a child document.' +
            '</div>' +
            '<div class="ims-archive-controls">' +
              '<div class="form-check">' +
                '<input class="form-check-input" type="checkbox" id="includeCategoryArchivedCheck" ' + 
                (showArchivedDocuments ? 'checked' : '') + '>' +
                '<label class="form-check-label" for="includeCategoryArchivedCheck">' +
                  '<i class="fas fa-archive me-1"></i> Include archived documents' +
                '</label>' +
                '<small class="d-block text-muted">Documents in folders containing "archive" in the name</small>' +
              '</div>' +
            '</div>' +
            '<div class="mb-3">' +
              '<label class="form-label">Search for the document to link to this category:</label>' +
              '<div class="input-group">' +
                '<input type="text" class="form-control" id="linkCategoryDocumentSearch" placeholder="Type to search..." value="' + documentName + '">' +
                '<button type="button" class="btn btn-outline-primary" id="searchForCategoryDocumentBtn">' +
                  '<i class="fas fa-search"></i> Search' +
                '</button>' +
              '</div>' +
            '</div>' +
            '<div id="linkCategoryDocumentResults" class="mt-3">' +
              '<div class="text-center text-muted">' +
                '<i class="fas fa-search fa-2x mb-2"></i><br>' +
                'Searching for documents...' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  
  const existingModal = document.getElementById('linkCategoryDocumentModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  const modal = new bootstrap.Modal(document.getElementById('linkCategoryDocumentModal'));
  modal.show();
  
  setupCategoryDocumentLinkHandlers(categoryName, documentName);
  
  // Add archive checkbox handler
  document.getElementById('includeCategoryArchivedCheck').addEventListener('change', function() {
    showArchivedDocuments = this.checked;
    const searchTerm = document.getElementById('linkCategoryDocumentSearch').value.trim();
    if (searchTerm) {
      performCategoryDocumentSearch(searchTerm, categoryName, documentName);
    }
  });
  
  setTimeout(function() {
    performCategoryDocumentSearch(documentName, categoryName, documentName);
  }, 500);
}

function setupDocumentLinkHandlers(categoryName, documentName) {
  document.getElementById('searchForDocumentBtn').addEventListener('click', function() {
    const searchTerm = document.getElementById('linkDocumentSearch').value.trim();
    if (searchTerm) {
      performDocumentSearch(searchTerm, categoryName, documentName);
    }
  });
  
  document.getElementById('linkDocumentSearch').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      const searchTerm = this.value.trim();
      if (searchTerm) {
        performDocumentSearch(searchTerm, categoryName, documentName);
      }
    }
  });
}

function setupCategoryDocumentLinkHandlers(categoryName, documentName) {
  document.getElementById('searchForCategoryDocumentBtn').addEventListener('click', function() {
    const searchTerm = document.getElementById('linkCategoryDocumentSearch').value.trim();
    if (searchTerm) {
      performCategoryDocumentSearch(searchTerm, categoryName, documentName);
    }
  });
  
  document.getElementById('linkCategoryDocumentSearch').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      const searchTerm = this.value.trim();
      if (searchTerm) {
        performCategoryDocumentSearch(searchTerm, categoryName, documentName);
      }
    }
  });
}

function performDocumentSearch(searchTerm, categoryName, documentName) {
  console.log('Searching for:', searchTerm);
  
  const resultsDiv = document.getElementById('linkDocumentResults');
  resultsDiv.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
  
  const searchUrl = '/api/available-documents?search=' + encodeURIComponent(searchTerm) + 
                   '&includeArchived=' + showArchivedDocuments;
  
  fetch(searchUrl)
    .then(response => response.json())
    .then(documents => {
      console.log('Found', documents.length, 'documents for category');
      
      if (documents.length === 0) {
        resultsDiv.innerHTML = 
          '<div class="alert alert-info">' +
            '<i class="fas fa-info-circle"></i> No documents found matching "' + searchTerm + '"' +
            (!showArchivedDocuments ? '<br><small>Try enabling "Include Archived" to see archived documents</small>' : '') +
          '</div>';
        return;
      }
      
      let resultsHtml = '<div class="list-group">';
      
      documents.slice(0, 10).forEach(function(doc) {
        const archivedClass = doc.isArchived ? ' archived' : '';
        const archivedBadge = doc.isArchived ? '<span class="ims-archived-badge">ARCHIVED</span>' : '';
        
        resultsHtml += 
          '<div class="list-group-item list-group-item-action category-document-link-result' + archivedClass + '" ' +
               'data-doc-id="' + doc.id + '" ' +
               'data-doc-name="' + doc.name + '" ' +
               'data-is-archived="' + doc.isArchived + '" ' +
               'style="cursor: pointer;">' +
            '<div class="d-flex w-100 justify-content-between">' +
              '<h6 class="mb-1">' +
                '<i class="fas fa-file-alt me-2"></i>' + doc.name + archivedBadge +
              '</h6>' +
              '<small class="text-success">Click to link</small>' +
            '</div>' +
            '<p class="mb-1"><small class="text-muted">' + (doc.folder || 'Root folder') + '</small></p>' +
          '</div>';
      });
      
      resultsHtml += '</div>';
      resultsDiv.innerHTML = resultsHtml;
      
      document.querySelectorAll('.category-document-link-result').forEach(function(result) {
        result.addEventListener('click', function() {
          const docId = this.getAttribute('data-doc-id');
          const docName = this.getAttribute('data-doc-name');
          const isArchived = this.getAttribute('data-is-archived') === 'true';
          
          document.querySelectorAll('.category-document-link-result').forEach(function(r) {
            r.classList.remove('active');
          });
          this.classList.add('active');
          
          let confirmMessage = 'Link "' + docName + '" to category "' + categoryName + '"?';
          if (isArchived) {
            confirmMessage += '\n\n⚠️ WARNING: This document is in an archived folder and may be outdated.';
          }
          
          if (confirm(confirmMessage)) {
            linkDocumentToCategory(categoryName, null, docId, docName, true); // true indicates category-level link
          }
        });
      });
    })
    .catch(error => {
      console.error('Category search error:', error);
      resultsDiv.innerHTML = 
        '<div class="alert alert-danger">' +
          '<i class="fas fa-exclamation-triangle"></i> Error searching documents' +
        '</div>';
    });
}

function linkDocumentToCategory(categoryName, documentName, docId, actualDocName, isCategoryLevel = false) {
  console.log('Linking:', actualDocName, 'to', isCategoryLevel ? 'category' : 'document:', documentName || categoryName, 'in category:', categoryName);
  
  const endpoint = isCategoryLevel ? '/api/link-category-document' : '/api/link-ims-document';
  const requestBody = isCategoryLevel ? {
    categoryName: categoryName,
    documentId: docId,
    actualDocumentName: actualDocName
  } : {
    categoryName: categoryName,
    documentName: documentName,
    documentId: docId,
    actualDocumentName: actualDocName
  };

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      const successMessage = isCategoryLevel ? 
        'Successfully linked "' + actualDocName + '" to category "' + categoryName + '"!' :
        'Successfully linked "' + actualDocName + '" to "' + documentName + '"!';
      
      alert(successMessage);
      
      const modalId = isCategoryLevel ? 'linkCategoryDocumentModal' : 'linkDocumentModal';
      const modal = bootstrap.Modal.getInstance(document.getElementById(modalId));
      if (modal) {
        modal.hide();
      }
      
      setTimeout(function() {
        window.location.reload();
      }, 1000);
    } else {
      alert('Error linking document: ' + (data.message || 'Unknown error'));
    }
  })
  .catch(error => {
    console.error('Linking error:', error);
    alert('Error linking document: ' + error.message);
  });
}

function loadCategoryData(categoryName) {
  fetch('/api/ims-structure')
    .then(response => response.json())
    .then(data => {
      const category = data[categoryName];
      if (category) {
        document.getElementById('editCategoryName').value = categoryName;
        document.getElementById('editCategoryLevel').value = category.level || 2;
        document.getElementById('editCategoryType').value = category.type || 'category';
        
        // Load child documents
        const childList = document.getElementById('childDocumentsList');
        childList.innerHTML = '';
        
        if (category.children && category.children.length > 0) {
          category.children.forEach(child => {
            const childElement = document.createElement('div');
            childElement.className = 'child-item d-flex justify-content-between align-items-center mb-2';
            childElement.innerHTML = `
              <span>${child}</span>
              <button type="button" class="btn btn-sm btn-outline-danger remove-child-btn" 
                      data-child="${child}">
                <i class="fas fa-times"></i>
              </button>
            `;
            childList.appendChild(childElement);
          });
        }
      }
    })
    .catch(error => {
      console.error('Error loading category data:', error);
      alert('Error loading category data');
    });
}

function setupCategoryModalHandlers(categoryName, modal) {
  // Add child document handler
  document.getElementById('addChildBtn').addEventListener('click', function() {
    const newChildName = document.getElementById('newChildDocumentName').value.trim();
    if (newChildName) {
      // Add to UI immediately
      addChildDocument(newChildName);
      document.getElementById('newChildDocumentName').value = '';
      
      // Optional: Save immediately to backend
      fetch('/api/manage-child-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryName: categoryName,
          action: 'add',
          newDocumentName: newChildName
        })
      })
      .then(response => response.json())
      .then(data => {
        if (!data.success) {
          console.error('Failed to add child to backend:', data.message);
          // Optionally remove from UI if backend fails
        }
      })
      .catch(error => {
        console.error('Error adding child to backend:', error);
      });
    }
  });
  
  // Remove child document handlers (use event delegation to handle dynamically added elements)
  document.getElementById('childDocumentsList').addEventListener('click', function(e) {
    if (e.target.closest('.remove-child-btn')) {
      const btn = e.target.closest('.remove-child-btn');
      const childName = btn.getAttribute('data-child');
      
      // Remove from UI
      removeChildDocument(childName);
      
      // Optional: Remove from backend immediately
      fetch('/api/manage-child-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryName: categoryName,
          action: 'remove',
          documentName: childName
        })
      })
      .then(response => response.json())
      .then(data => {
        if (!data.success) {
          console.error('Failed to remove child from backend:', data.message);
        }
      })
      .catch(error => {
        console.error('Error removing child from backend:', error);
      });
    }
  });
  
  // Save category handler
  document.getElementById('saveCategoryBtn').addEventListener('click', function() {
    saveCategoryChanges(categoryName, modal);
  });
  
  // Delete category handler
  document.getElementById('deleteCategoryBtn').addEventListener('click', function() {
    if (confirm('Are you sure you want to delete this category? This cannot be undone.')) {
      deleteCategory(categoryName, modal);
    }
  });
}

function addChildDocument(childName) {
  const childList = document.getElementById('childDocumentsList');
  const childElement = document.createElement('div');
  childElement.className = 'child-item d-flex justify-content-between align-items-center mb-2';
  childElement.innerHTML = `
    <span>${childName}</span>
    <button type="button" class="btn btn-sm btn-outline-danger remove-child-btn" 
            data-child="${childName}">
      <i class="fas fa-times"></i>
    </button>
  `;
  childList.appendChild(childElement);
}

function removeChildDocument(childName) {
  const childElements = document.querySelectorAll('.remove-child-btn');
  childElements.forEach(btn => {
    if (btn.getAttribute('data-child') === childName) {
      btn.closest('.child-item').remove();
    }
  });
}

function saveCategoryChanges(originalCategoryName, modal) {
  const newCategoryName = document.getElementById('editCategoryName').value.trim();
  const level = document.getElementById('editCategoryLevel').value;
  const type = document.getElementById('editCategoryType').value;
  
  // *** CRITICAL FIX: Collect children properly ***
  const children = [];
  document.querySelectorAll('.child-item span').forEach(span => {
    const childName = span.textContent.trim();
    if (childName) {
      children.push(childName);
    }
  });
  
  console.log('Saving category with children:', children); // Debug log
  
  if (!newCategoryName) {
    alert('Please enter a category name');
    return;
  }
  
  const categoryData = {
    action: 'update',
    categoryName: originalCategoryName,
    newName: newCategoryName !== originalCategoryName ? newCategoryName : undefined,
    level: parseInt(level),
    type: type,
    children: children  // *** CRITICAL: Include children in the request ***
  };
  
  console.log('Sending category data:', categoryData); // Debug log
  
  fetch('/api/update-ims-category', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(categoryData)
  })
  .then(response => response.json())
  .then(data => {
    console.log('Server response:', data); // Debug log
    
    if (data.success) {
      alert('Category updated successfully!');
      modal.hide();
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      alert('Error updating category: ' + data.message);
    }
  })
  .catch(error => {
    console.error('Error updating category:', error);
    alert('Error updating category');
  });
}
function deleteCategory(categoryName, modal) {
  fetch(`/api/delete-ims-category/${encodeURIComponent(categoryName)}`, {  // Use path parameter
    method: 'DELETE',  // Correct method
    headers: { 'Content-Type': 'application/json' }
    // Remove body since we're using path parameter
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      alert('Category deleted successfully!');
      modal.hide();
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      alert('Error deleting category: ' + data.message);
    }
  })
  .catch(error => {
    console.error('Error deleting category:', error);
    alert('Error deleting category');
  });
}

function addNewCategory(categoryName, level) {
  const categoryData = {
    action: 'create',  // Add this
    categoryName: categoryName,  // Use categoryName not name
    level: parseInt(level),
    type: level === '1' ? 'policy' : 'category'
  };
  
  fetch('/api/update-ims-category', {  // Changed endpoint
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(categoryData)
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      alert('Category added successfully!');
      document.getElementById('newCategoryName').value = '';
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      alert('Error adding category: ' + data.message);
    }
  })
  .catch(error => {
    console.error('Error adding category:', error);
    alert('Error adding category');
  });
}

function autoLinkDocuments() {
  if (!confirm('This will automatically link documents based on name matching. Continue?')) {
    return;
  }
  
  const button = document.getElementById('autoLinkBtn');
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Auto-linking...';
  
  fetch('/api/auto-link-documents', {  // Corrected endpoint
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      checkRevisions: true
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      alert(`Auto-linking completed! Linked ${data.linked} documents.`);  // Changed from linkedCount
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      alert('Error during auto-linking: ' + data.message);
    }
  })
  .catch(error => {
    console.error('Error auto-linking:', error);
    alert('Error during auto-linking');
  })
  .finally(() => {
    button.disabled = false;
    button.innerHTML = 'Auto-Link Documents';
  });
}
function loadMandatoryRecords() {
  const listDiv = document.getElementById('mandatoryRecordsList');
  listDiv.innerHTML = '<div class="text-center text-muted"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  
  fetch('/api/mandatory-records')
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        displayMandatoryRecords(data.records);
        updateMandatoryStatistics(data.records);
      } else {
        listDiv.innerHTML = '<div class="alert alert-danger">Error loading mandatory records</div>';
      }
    })
    .catch(error => {
      console.error('Error loading mandatory records:', error);
      listDiv.innerHTML = '<div class="alert alert-danger">Error loading mandatory records</div>';
    });
}

function displayMandatoryRecords(records) {
  const listDiv = document.getElementById('mandatoryRecordsList');
  
  if (!records || records.length === 0) {
    listDiv.innerHTML = '<div class="alert alert-info">No mandatory records configured</div>';
    return;
  }
  
  let html = '';
  records.forEach(record => {
    const isLinked = record.linkedDocuments && record.linkedDocuments.length > 0;
    const hasAutoDetected = record.autoDetectedDocuments && record.autoDetectedDocuments.length > 0;
    
    // Status icon based on linked documents
    const statusIcon = isLinked ? 
      '<i class="fas fa-check-circle text-success"></i>' : 
      '<i class="fas fa-exclamation-triangle text-warning"></i>';
    
    html += `
      <div class="ims-category mb-3" data-record-type="${record.type}">
        <div class="ims-category-level-2">
          ${statusIcon}
          <span class="mandatory-record-title">${record.type}</span>
          <small class="text-muted ms-2">${record.description || ''}</small>
          <button class="btn btn-sm btn-outline-info ms-2 link-mandatory-btn" 
                  data-record-type="${record.type}"
                  style="font-size: 0.7rem;">
            <i class="fas fa-link"></i> Link Documents
          </button>
          ${hasAutoDetected ? `
            <span class="badge bg-info ms-1">${record.autoDetectedDocuments.length} auto-detected</span>
          ` : ''}
        </div>
        
        <!-- Linked Documents Section -->
        ${isLinked ? `
          <div class="mt-2 mb-3">
            <h6 class="text-success"><i class="fas fa-check-circle"></i> Linked Documents</h6>
            <ul class="ims-child-list">
              ${record.linkedDocuments.map(doc => `
                <li class="ims-child-item ims-document-item ${doc.isArchived ? 'ims-document-archived' : ''}" 
                    data-document="${doc.name}" 
                    data-is-archived="${doc.isArchived}">
                  <i class="fas fa-check-circle text-success ims-status-icon"></i>
                  <a href="/document/${doc.id}" class="ims-document-link">${doc.name}</a>
                  ${doc.isArchived ? '<span class="ims-archived-badge">ARCHIVED</span>' : ''}
                  <button class="btn btn-sm btn-outline-danger ms-auto unlink-mandatory-btn" 
                          data-record-type="${record.type}" 
                          data-document-id="${doc.id}"
                          style="font-size: 0.6rem;">
                    <i class="fas fa-unlink"></i>
                  </button>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
        
        <!-- Auto-Detected Documents Section -->
        ${hasAutoDetected ? `
          <div class="mt-2">
            <h6 class="text-info">
              <i class="fas fa-search"></i> Auto-Detected Documents 
              <small class="text-muted">(Click to link)</small>
            </h6>
            <div class="alert alert-light p-2">
              <small class="text-muted mb-2 d-block">
                <strong>Keywords:</strong> ${record.autoDetectKeywords ? record.autoDetectKeywords.join(', ') : 'None'}
              </small>
              <div class="auto-detected-documents">
                ${record.autoDetectedDocuments.slice(0, 10).map(doc => `
                  <div class="list-group-item list-group-item-action auto-detected-item mb-1 ${doc.isArchived ? 'archived' : ''}" 
                       data-doc-id="${doc.id}" 
                       data-doc-name="${doc.name}" 
                       data-record-type="${record.type}"
                       data-is-archived="${doc.isArchived}"
                       style="cursor: pointer; font-size: 0.9rem; padding: 0.5rem;">
                    <div class="d-flex justify-content-between align-items-center">
                      <div>
                        <i class="fas fa-file-alt text-info me-2"></i>
                        <strong>${doc.name}</strong>
                        ${doc.isArchived ? '<span class="ims-archived-badge">ARCHIVED</span>' : ''}
                      </div>
                      <div>
                        <small class="text-success me-2">Click to link</small>
                        <i class="fas fa-plus-circle text-success"></i>
                      </div>
                    </div>
                    <div class="mt-1">
                      <small class="text-muted">
                        📁 ${doc.folder || 'Root folder'}
                        ${doc.matchedKeywords ? ` • Matched: ${doc.matchedKeywords.join(', ')}` : ''}
                      </small>
                    </div>
                  </div>
                `).join('')}
                ${record.autoDetectedDocuments.length > 10 ? `
                  <div class="text-center mt-2">
                    <small class="text-muted">... and ${record.autoDetectedDocuments.length - 10} more</small>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  });
  
  listDiv.innerHTML = html;
  
  // Add event listeners for mandatory record buttons
  document.querySelectorAll('.link-mandatory-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const recordType = this.getAttribute('data-record-type');
      openMandatoryDocumentLinker(recordType);
    });
  });
  
  document.querySelectorAll('.unlink-mandatory-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const recordType = this.getAttribute('data-record-type');
      const documentId = this.getAttribute('data-document-id');
      unlinkMandatoryDocument(recordType, documentId);
    });
  });
  
  // Add event listeners for auto-detected documents
  document.querySelectorAll('.auto-detected-item').forEach(item => {
    item.addEventListener('click', function() {
      const docId = this.getAttribute('data-doc-id');
      const docName = this.getAttribute('data-doc-name');
      const recordType = this.getAttribute('data-record-type');
      const isArchived = this.getAttribute('data-is-archived') === 'true';
      
      // Highlight selection
      document.querySelectorAll('.auto-detected-item').forEach(i => i.classList.remove('active'));
      this.classList.add('active');
      
      let confirmMessage = `Link "${docName}" to mandatory record "${recordType}"?`;
      if (isArchived) {
        confirmMessage += '\n\n⚠️ WARNING: This document is in an archived folder and may be outdated.';
      }
      
      if (confirm(confirmMessage)) {
        linkMandatoryDocument(recordType, docId, docName); // Pass docName as third parameter
      }
    });
  });
}

function updateMandatoryStatistics(records) {
  // Add defensive programming to handle undefined/null records
  if (!records || !Array.isArray(records)) {
    console.error('Invalid records data received:', records);
    // Set default values when records is undefined
    document.getElementById('mandatoryTotal').textContent = '0';
    document.getElementById('mandatoryCoverage').textContent = '0%';
    return;
  }
  
  const totalRecords = records.length;
  const linkedRecords = records.filter(r => r.linkedDocuments && r.linkedDocuments.length > 0).length;
  const coverage = totalRecords > 0 ? Math.round((linkedRecords / totalRecords) * 100) : 0;
  
  document.getElementById('mandatoryTotal').textContent = totalRecords;
  document.getElementById('mandatoryCoverage').textContent = coverage + '%';
}

function loadMandatoryRecords() {
  const listDiv = document.getElementById('mandatoryRecordsList');
  listDiv.innerHTML = '<div class="text-center text-muted"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  
  fetch('/api/mandatory-records')
    .then(response => response.json())
    .then(data => {
      console.log('Mandatory records API response:', data); // Add debugging
      console.log('Response keys:', Object.keys(data)); // Show all properties
      console.log('data.success:', data.success);
      console.log('data.records:', data.records);
      console.log('Type of data.records:', typeof data.records);
      
      if (data.success) {
        // Handle the actual API response structure where mandatoryRecords is an object
        if (data.mandatoryRecords && typeof data.mandatoryRecords === 'object') {
          // Convert the object structure to array format expected by the display functions
          const recordsArray = Object.keys(data.mandatoryRecords).map(recordType => {
            const record = data.mandatoryRecords[recordType];
            
            // Debug: Log the enriched documents to see their structure
            console.log(`${recordType} enrichedDocuments:`, record.enrichedDocuments);
            
            // Split enrichedDocuments into linked and auto-detected
            const allDocs = record.enrichedDocuments || [];
            
            // Log each document's properties to understand the structure
            allDocs.forEach((doc, index) => {
              console.log(`Document ${index}:`, {
                name: doc.name,
                autoDetected: doc.autoDetected,
                manuallyLinked: doc.manuallyLinked,
                linkedAt: doc.linkedAt
              });
            });
            
            const linkedDocuments = allDocs.filter(doc => doc.manuallyLinked === true);
            const autoDetectedDocuments = allDocs.filter(doc => doc.autoDetected === true && doc.manuallyLinked !== true);
            
            console.log(`${recordType} - Linked: ${linkedDocuments.length}, Auto-detected: ${autoDetectedDocuments.length}`);
            
            return {
              type: recordType,
              description: record.description || '',
              priority: record.priority || 'medium',
              lastUpdated: record.lastUpdated,
              linkedDocuments: linkedDocuments, // Actually linked docs
              autoDetectedDocuments: autoDetectedDocuments, // Just suggestions
              autoDetectKeywords: record.autoDetectKeywords || []
            };
          });
          
          console.log('Converted records array:', recordsArray);
          displayMandatoryRecords(recordsArray);
          updateMandatoryStatistics(recordsArray);
        } else if (data.records && Array.isArray(data.records)) {
          // Fallback for array format (if API structure changes back)
          displayMandatoryRecords(data.records);
          updateMandatoryStatistics(data.records);
        } else {
          console.error('No valid mandatory records found. Full data object:', JSON.stringify(data, null, 2));
          listDiv.innerHTML = '<div class="alert alert-warning">No mandatory records found or invalid data format<br><small>Check console for details</small></div>';
          updateMandatoryStatistics([]);
        }
      } else {
        console.error('API returned error:', data.message);
        listDiv.innerHTML = '<div class="alert alert-danger">Error loading mandatory records: ' + (data.message || 'Unknown error') + '</div>';
        updateMandatoryStatistics([]); // Pass empty array instead of undefined
      }
    })
    .catch(error => {
      console.error('Error loading mandatory records:', error);
      listDiv.innerHTML = '<div class="alert alert-danger">Error loading mandatory records: Network error</div>';
      updateMandatoryStatistics([]); // Pass empty array instead of undefined
    });
}
function updateMandatoryRecordSettings() {
  const recordType = document.getElementById('mandatoryRecordSelect').value;
  const description = document.getElementById('mandatoryDescription').value.trim();
  const keywords = document.getElementById('mandatoryKeywords').value
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);
  
  if (!recordType) {
    alert('Please select a record type');
    return;
  }
  
  const settings = {
    type: recordType,
    description: description,
    keywords: keywords
  };
  
  fetch('/api/update-mandatory-record-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      alert('Settings updated successfully!');
    } else {
      alert('Error updating settings: ' + data.message);
    }
  })
  .catch(error => {
    console.error('Error updating settings:', error);
    alert('Error updating settings');
  });
}

function autoDetectMandatoryRecords() {
  const button = document.getElementById('autoDetectMandatoryBtn');
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting...';
  
  fetch('/api/auto-detect-mandatory-records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      alert(`Auto-detection completed! Found ${data.detectedCount} mandatory records.`);
      loadMandatoryRecords(); // Refresh the display
    } else {
      alert('Error during auto-detection: ' + data.message);
    }
  })
  .catch(error => {
    console.error('Error auto-detecting:', error);
    alert('Error during auto-detection');
  })
  .finally(() => {
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-search"></i> Auto-Detect Records';
  });
}

function openMandatoryDocumentLinker(recordType) {
  const modalHtml = `
    <div class="modal fade" id="linkMandatoryModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Link Documents to ${recordType}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info">
              <i class="fas fa-info-circle"></i>
              Search for any document in your system to link to this mandatory record type.
            </div>
            
            <div class="ims-archive-controls">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="includeMandatoryArchivedCheck" 
                       ${showArchivedDocuments ? 'checked' : ''}>
                <label class="form-check-label" for="includeMandatoryArchivedCheck">
                  <i class="fas fa-archive me-1"></i> Include archived documents
                </label>
              </div>
            </div>
            
            <div class="mb-3">
              <label class="form-label">Search for documents:</label>
              <div class="input-group">
                <input type="text" class="form-control" id="linkMandatorySearch" 
                       placeholder="Enter document name, folder, or keywords..." value="">
                <button type="button" class="btn btn-outline-primary" id="searchMandatoryBtn">
                  <i class="fas fa-search"></i> Search
                </button>
              </div>
              <small class="text-muted">
                Try searching for document names, folder names, or file types (e.g., "audit", "policy", ".pdf")
              </small>
            </div>
            
            <div id="linkMandatoryResults" class="mt-3">
              <div class="text-center text-muted">
                <i class="fas fa-search fa-2x mb-2"></i><br>
                Enter a search term above to find documents
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
  
  const existingModal = document.getElementById('linkMandatoryModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  const modal = new bootstrap.Modal(document.getElementById('linkMandatoryModal'));
  modal.show();
  
  setupMandatoryLinkHandlers(recordType);
}

function setupMandatoryLinkHandlers(recordType) {
  document.getElementById('searchMandatoryBtn').addEventListener('click', function() {
    const searchTerm = document.getElementById('linkMandatorySearch').value.trim();
    if (searchTerm) {
      performMandatoryDocumentSearch(searchTerm, recordType);
    } else {
      alert('Please enter a search term');
    }
  });
  
  document.getElementById('linkMandatorySearch').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      const searchTerm = this.value.trim();
      if (searchTerm) {
        performMandatoryDocumentSearch(searchTerm, recordType);
      } else {
        alert('Please enter a search term');
      }
    }
  });
  
  document.getElementById('includeMandatoryArchivedCheck').addEventListener('change', function() {
    showArchivedDocuments = this.checked;
    const searchTerm = document.getElementById('linkMandatorySearch').value.trim();
    if (searchTerm) {
      performMandatoryDocumentSearch(searchTerm, recordType);
    }
  });
}

function unlinkMandatoryDocument(recordType, documentId) {
  if (!confirm('Are you sure you want to unlink this document?')) {
    return;
  }
  
  console.log('=== UNLINK MANDATORY DOCUMENT ===');
  console.log('recordType:', recordType);
  console.log('documentId:', documentId);
  
  fetch(`/api/mandatory-record/${encodeURIComponent(recordType)}/${documentId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(response => {
    console.log('Unlink response status:', response.status);
    return response.json();
  })
  .then(data => {
    console.log('Unlink response data:', data);
    
    if (data.success) {
      alert('Document unlinked successfully!');
      // Refresh the mandatory records display
      loadMandatoryRecords();
    } else {
      alert('Error unlinking document: ' + (data.message || 'Unknown error'));
    }
  })
  .catch(error => {
    console.error('Error unlinking document:', error);
    alert('Error unlinking document: ' + error.message);
  });
}

function performMandatoryDocumentSearch(searchTerm, recordType) {
  console.log('Manual search for:', searchTerm, 'in record type:', recordType);
  
  const resultsDiv = document.getElementById('linkMandatoryResults');
  resultsDiv.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
  
  const searchUrl = `/api/available-documents?search=${encodeURIComponent(searchTerm)}&includeArchived=${showArchivedDocuments}`;
  
  fetch(searchUrl)
    .then(response => response.json())
    .then(documents => {
      console.log('Manual search found', documents.length, 'documents');
      
      if (documents.length === 0) {
        resultsDiv.innerHTML = `
          <div class="alert alert-info">
            <i class="fas fa-info-circle"></i> No documents found matching "${searchTerm}"
            ${!showArchivedDocuments ? '<br><small>Try enabling "Include Archived" to see archived documents</small>' : ''}
          </div>
        `;
        return;
      }
      
      let resultsHtml = '<div class="list-group">';
      
      // Show more results for manual search (up to 20)
      documents.slice(0, 20).forEach(doc => {
        const archivedClass = doc.isArchived ? ' archived' : '';
        const archivedBadge = doc.isArchived ? '<span class="ims-archived-badge">ARCHIVED</span>' : '';
        
        resultsHtml += `
          <div class="list-group-item list-group-item-action manual-link-result${archivedClass}" 
               data-doc-id="${doc.id}" 
               data-doc-name="${doc.name}" 
               data-is-archived="${doc.isArchived}" 
               style="cursor: pointer;">
            <div class="d-flex w-100 justify-content-between">
              <div>
                <h6 class="mb-1">
                  <i class="fas fa-file-alt me-2"></i>${doc.name}${archivedBadge}
                </h6>
                <p class="mb-1"><small class="text-muted">📁 ${doc.folder || 'Root folder'}</small></p>
              </div>
              <div class="text-end">
                <small class="text-success">Click to link</small>
                <i class="fas fa-plus-circle text-success"></i>
              </div>
            </div>
          </div>
        `;
      });
      
      if (documents.length > 20) {
        resultsHtml += `
          <div class="list-group-item">
            <div class="text-center text-muted">
              <small>... and ${documents.length - 20} more results. Try a more specific search term.</small>
            </div>
          </div>
        `;
      }
      
      resultsHtml += '</div>';
      resultsDiv.innerHTML = resultsHtml;
      
      // Add click handlers for manual search results
      document.querySelectorAll('.manual-link-result').forEach(result => {
        result.addEventListener('click', function() {
          const docId = this.getAttribute('data-doc-id');
          const docName = this.getAttribute('data-doc-name');
          const isArchived = this.getAttribute('data-is-archived') === 'true';
          
          document.querySelectorAll('.manual-link-result').forEach(r => {
            r.classList.remove('active');
          });
          this.classList.add('active');
          
          let confirmMessage = `Link "${docName}" to mandatory record "${recordType}"?`;
          if (isArchived) {
            confirmMessage += '\n\n⚠️ WARNING: This document is in an archived folder and may be outdated.';
          }
          
          if (confirm(confirmMessage)) {
            linkMandatoryDocument(recordType, docId, docName);
          }
        });
      });
    })
    .catch(error => {
      console.error('Manual search error:', error);
      resultsDiv.innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i> Error searching documents
        </div>
      `;
    });
}

function linkMandatoryDocument(recordType, documentId, documentName) {
  fetch('/api/link-mandatory-record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recordType: recordType,
      documentId: documentId,
      actualDocumentName: documentName
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      alert(`Successfully linked "${documentName}" to "${recordType}"!`);
      
      const modal = bootstrap.Modal.getInstance(document.getElementById('linkMandatoryModal'));
      if (modal) {
        modal.hide();
      }
      
      // Refresh mandatory records display
      setTimeout(() => {
        loadMandatoryRecords();
      }, 1000);
    } else {
      alert('Error linking document: ' + (data.message || 'Unknown error'));
    }
  })
  .catch(error => {
    console.error('Linking error:', error);
    alert('Error linking document: ' + error.message);
  });
}



function performCategoryDocumentSearch(searchTerm, categoryName, documentName) {
  console.log('Searching for category document:', searchTerm);
  
  const resultsDiv = document.getElementById('linkCategoryDocumentResults');
  resultsDiv.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
  
  const searchUrl = '/api/available-documents?search=' + encodeURIComponent(searchTerm) + 
                   '&includeArchived=' + showArchivedDocuments;
  
  fetch(searchUrl)
    .then(response => response.json())
    .then(documents => {
      console.log('Found', documents.length, 'documents');
      
      if (documents.length === 0) {
        resultsDiv.innerHTML = 
          '<div class="alert alert-info">' +
            '<i class="fas fa-info-circle"></i> No documents found matching "' + searchTerm + '"' +
            (!showArchivedDocuments ? '<br><small>Try enabling "Include Archived" to see archived documents</small>' : '') +
          '</div>';
        return;
      }
      
      let resultsHtml = '<div class="list-group">';
      
      documents.slice(0, 10).forEach(function(doc) {
        const archivedClass = doc.isArchived ? ' archived' : '';
        const archivedBadge = doc.isArchived ? '<span class="ims-archived-badge">ARCHIVED</span>' : '';
        
        resultsHtml += 
          '<div class="list-group-item list-group-item-action document-link-result' + archivedClass + '" ' +
               'data-doc-id="' + doc.id + '" ' +
               'data-doc-name="' + doc.name + '" ' +
               'data-is-archived="' + doc.isArchived + '" ' +
               'style="cursor: pointer;">' +
            '<div class="d-flex w-100 justify-content-between">' +
              '<h6 class="mb-1">' +
                '<i class="fas fa-file-alt me-2"></i>' + doc.name + archivedBadge +
              '</h6>' +
              '<small class="text-success">Click to link</small>' +
            '</div>' +
            '<p class="mb-1"><small class="text-muted">' + (doc.folder || 'Root folder') + '</small></p>' +
          '</div>';
      });
      
      resultsHtml += '</div>';
      resultsDiv.innerHTML = resultsHtml;
      
      document.querySelectorAll('.document-link-result').forEach(function(result) {
        result.addEventListener('click', function() {
          const docId = this.getAttribute('data-doc-id');
          const docName = this.getAttribute('data-doc-name');
          const isArchived = this.getAttribute('data-is-archived') === 'true';
          
          document.querySelectorAll('.document-link-result').forEach(function(r) {
            r.classList.remove('active');
          });
          this.classList.add('active');
          
          let confirmMessage = 'Link "' + docName + '" to "' + documentName + '"?';
          if (isArchived) {
            confirmMessage += '\n\n⚠️ WARNING: This document is in an archived folder and may be outdated.';
          }
          
          if (confirm(confirmMessage)) {
            linkDocumentToCategory(categoryName, documentName, docId, docName);
          }
        });
      });
    })
    .catch(error => {
      console.error('Search error:', error);
      resultsDiv.innerHTML = 
        '<div class="alert alert-danger">' +
          '<i class="fas fa-exclamation-triangle"></i> Error searching documents' +
        '</div>';
    });
}

function performMandatoryDocumentSearch(searchTerm, recordType) {
  console.log('Manual search for:', searchTerm, 'in record type:', recordType);
  
  const resultsDiv = document.getElementById('linkMandatoryResults');
  resultsDiv.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
  
  const searchUrl = `/api/available-documents?search=${encodeURIComponent(searchTerm)}&includeArchived=${showArchivedDocuments}`;
  
  fetch(searchUrl)
    .then(response => response.json())
    .then(documents => {
      console.log('Manual search found', documents.length, 'documents');
      
      if (documents.length === 0) {
        resultsDiv.innerHTML = `
          <div class="alert alert-info">
            <i class="fas fa-info-circle"></i> No documents found matching "${searchTerm}"
            ${!showArchivedDocuments ? '<br><small>Try enabling "Include Archived" to see archived documents</small>' : ''}
          </div>
        `;
        return;
      }
      
      let resultsHtml = '<div class="list-group">';
      
      // Show more results for manual search (up to 20)
      documents.slice(0, 20).forEach(doc => {
        const archivedClass = doc.isArchived ? ' archived' : '';
        const archivedBadge = doc.isArchived ? '<span class="ims-archived-badge">ARCHIVED</span>' : '';
        
        resultsHtml += `
          <div class="list-group-item list-group-item-action manual-link-result${archivedClass}" 
               data-doc-id="${doc.id}" 
               data-doc-name="${doc.name}" 
               data-is-archived="${doc.isArchived}" 
               style="cursor: pointer;">
            <div class="d-flex w-100 justify-content-between">
              <div>
                <h6 class="mb-1">
                  <i class="fas fa-file-alt me-2"></i>${doc.name}${archivedBadge}
                </h6>
                <p class="mb-1"><small class="text-muted">📁 ${doc.folder || 'Root folder'}</small></p>
              </div>
              <div class="text-end">
                <small class="text-success">Click to link</small>
                <i class="fas fa-plus-circle text-success"></i>
              </div>
            </div>
          </div>
        `;
      });
      
      if (documents.length > 20) {
        resultsHtml += `
          <div class="list-group-item">
            <div class="text-center text-muted">
              <small>... and ${documents.length - 20} more results. Try a more specific search term.</small>
            </div>
          </div>
        `;
      }
      
      resultsHtml += '</div>';
      resultsDiv.innerHTML = resultsHtml;
      
      // Add click handlers for manual search results
      document.querySelectorAll('.manual-link-result').forEach(result => {
        result.addEventListener('click', function() {
          const docId = this.getAttribute('data-doc-id');
          const docName = this.getAttribute('data-doc-name');
          const isArchived = this.getAttribute('data-is-archived') === 'true';
          
          document.querySelectorAll('.manual-link-result').forEach(r => {
            r.classList.remove('active');
          });
          this.classList.add('active');
          
          let confirmMessage = `Link "${docName}" to mandatory record "${recordType}"?`;
          if (isArchived) {
            confirmMessage += '\n\n⚠️ WARNING: This document is in an archived folder and may be outdated.';
          }
          
          if (confirm(confirmMessage)) {
            linkMandatoryDocument(recordType, docId, docName);
          }
        });
      });
    })
    .catch(error => {
      console.error('Manual search error:', error);
      resultsDiv.innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i> Error searching documents
        </div>
      `;
    });
}