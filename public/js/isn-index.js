// ISN Index JavaScript - Enhanced for modern functionality
// File: public/js/isn-index.js

document.addEventListener('DOMContentLoaded', function() {
    console.log('ISN Index loaded');
    initializeISNIndex();
});

function initializeISNIndex() {
    // Load initial data and setup event listeners
    setupEventListeners();
    updateISNStatistics();
}

function setupEventListeners() {
    // Add event listeners for ISN-specific functionality
    
    // Refresh button if it exists
    const refreshBtn = document.getElementById('refresh-isn-index');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshISNIndex);
    }
    
    // Category expand/collapse functionality
    document.querySelectorAll('.category-header').forEach(header => {
        header.addEventListener('click', function() {
            const content = this.nextElementSibling;
            const icon = this.querySelector('.fa-chevron-down, .fa-chevron-up');
            
            if (content.style.display === 'none') {
                content.style.display = 'block';
                if (icon) icon.className = icon.className.replace('fa-chevron-down', 'fa-chevron-up');
            } else {
                content.style.display = 'none';
                if (icon) icon.className = icon.className.replace('fa-chevron-up', 'fa-chevron-down');
            }
        });
    });
}

function updateISNStatistics() {
    // Update live statistics if needed
    fetch('/api/isn-statistics')
        .then(response => {
            if (response.ok) {
                return response.json();
            }
            throw new Error('Statistics not available');
        })
        .then(data => {
            updateStatisticsDisplay(data);
        })
        .catch(error => {
            console.log('ISN statistics not available:', error.message);
        });
}

function updateStatisticsDisplay(stats) {
    // Update statistics cards with live data
    const elements = {
        totalCategories: document.querySelector('[data-stat="total-categories"]'),
        totalDocuments: document.querySelector('[data-stat="total-documents"]'),
        linkedDocuments: document.querySelector('[data-stat="linked-documents"]'),
        completionRate: document.querySelector('[data-stat="completion-rate"]')
    };
    
    if (elements.totalCategories) elements.totalCategories.textContent = stats.totalCategories || 0;
    if (elements.totalDocuments) elements.totalDocuments.textContent = stats.totalDocuments || 0;
    if (elements.linkedDocuments) elements.linkedDocuments.textContent = stats.linkedDocuments || 0;
    if (elements.completionRate) elements.completionRate.textContent = (stats.completionRate || 0) + '%';
}

function refreshISNIndex() {
    showLoadingState('Refreshing ISN index...');
    
    fetch('/api/refresh-isn-index', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showSuccessMessage('ISN index refreshed successfully');
                setTimeout(() => location.reload(), 1500);
            } else {
                throw new Error(data.error || 'Refresh failed');
            }
        })
        .catch(error => {
            showErrorMessage('Error refreshing ISN index: ' + error.message);
        })
        .finally(() => {
            hideLoadingState();
        });
}

// ISN-specific document linking functions
function linkISNDocument(categoryName, documentName, documentId) {
    showLoadingState('Linking document...');
    
    fetch('/api/link-isn-document', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            category: categoryName,
            document: documentName,
            id: documentId
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showSuccessMessage('Document linked successfully');
            updateDocumentStatus(categoryName, documentName, 'linked');
        } else {
            throw new Error(data.error || 'Linking failed');
        }
    })
    .catch(error => {
        showErrorMessage('Error linking document: ' + error.message);
    })
    .finally(() => {
        hideLoadingState();
    });
}

function unlinkISNDocument(categoryName, documentName) {
    if (!confirm('Are you sure you want to unlink this document?')) {
        return;
    }
    
    showLoadingState('Unlinking document...');
    
    fetch('/api/unlink-isn-document', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            category: categoryName,
            document: documentName
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showSuccessMessage('Document unlinked successfully');
            updateDocumentStatus(categoryName, documentName, 'unlinked');
        } else {
            throw new Error(data.error || 'Unlinking failed');
        }
    })
    .catch(error => {
        showErrorMessage('Error unlinking document: ' + error.message);
    })
    .finally(() => {
        hideLoadingState();
    });
}

function updateDocumentStatus(categoryName, documentName, status) {
    // Update the document status in the UI
    const documentItems = document.querySelectorAll('.document-item');
    documentItems.forEach(item => {
        const documentText = item.querySelector('span').textContent.trim();
        if (documentText.includes(documentName)) {
            const badge = item.querySelector('.badge');
            const icon = item.querySelector('i');
            
            if (status === 'linked') {
                badge.className = 'badge bg-success badge-status';
                badge.textContent = 'Linked';
                icon.className = 'fas fa-file-check text-success me-2';
            } else {
                badge.className = 'badge bg-warning badge-status';
                badge.textContent = 'Unlinked';
                icon.className = 'fas fa-file text-muted me-2';
            }
        }
    });
    
    // Update statistics
    updateISNStatistics();
}

// ISN-specific search and filter functions
function searchISNDocuments(query) {
    const searchResults = [];
    const categories = document.querySelectorAll('.category-card');
    
    categories.forEach(category => {
        const categoryName = category.querySelector('h5').textContent.trim();
        const documents = category.querySelectorAll('.document-item');
        
        documents.forEach(doc => {
            const docName = doc.querySelector('span').textContent.trim();
            if (docName.toLowerCase().includes(query.toLowerCase()) ||
                categoryName.toLowerCase().includes(query.toLowerCase())) {
                searchResults.push({
                    category: categoryName,
                    document: docName,
                    element: doc
                });
            }
        });
    });
    
    return searchResults;
}

function filterISNByStatus(status) {
    const categories = document.querySelectorAll('.category-card');
    
    categories.forEach(category => {
        const documents = category.querySelectorAll('.document-item');
        let visibleCount = 0;
        
        documents.forEach(doc => {
            const badge = doc.querySelector('.badge');
            const badgeText = badge.textContent.toLowerCase();
            
            if (status === 'all' || badgeText.includes(status.toLowerCase())) {
                doc.style.display = 'block';
                visibleCount++;
            } else {
                doc.style.display = 'none';
            }
        });
        
        // Hide category if no visible documents
        if (visibleCount === 0 && status !== 'all') {
            category.style.display = 'none';
        } else {
            category.style.display = 'block';
        }
    });
}

// Bulk operations for ISN
function bulkLinkISNDocuments(categoryName) {
    if (!confirm(`Link all unlinked documents in ${categoryName}?`)) {
        return;
    }
    
    showLoadingState('Bulk linking documents...');
    
    fetch('/api/bulk-link-isn-documents', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            category: categoryName
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showSuccessMessage(`Linked ${data.count} documents successfully`);
            setTimeout(() => location.reload(), 1500);
        } else {
            throw new Error(data.error || 'Bulk linking failed');
        }
    })
    .catch(error => {
        showErrorMessage('Error in bulk linking: ' + error.message);
    })
    .finally(() => {
        hideLoadingState();
    });
}

// Export ISN data
function exportISNData(format = 'json') {
    showLoadingState('Preparing export...');
    
    const url = `/api/export-isn-data?format=${format}`;
    
    fetch(url)
        .then(response => {
            if (response.ok) {
                return response.blob();
            }
            throw new Error('Export failed');
        })
        .then(blob => {
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `isn-index-${new Date().toISOString().split('T')[0]}.${format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);
            
            showSuccessMessage('ISN data exported successfully');
        })
        .catch(error => {
            showErrorMessage('Error exporting data: ' + error.message);
        })
        .finally(() => {
            hideLoadingState();
        });
}

// Utility functions for UI feedback
function showLoadingState(message = 'Loading...') {
    // Create or update loading overlay
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            color: white;
            font-size: 1.2rem;
        `;
        document.body.appendChild(overlay);
    }
    
    overlay.innerHTML = `
        <div class="text-center">
            <div class="spinner-border mb-3" role="status"></div>
            <div>${message}</div>
        </div>
    `;
    overlay.style.display = 'flex';
}

function hideLoadingState() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function showSuccessMessage(message) {
    showToast(message, 'success');
}

function showErrorMessage(message) {
    showToast(message, 'error');
}

function showToast(message, type = 'info') {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = `alert alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'} position-fixed`;
    toast.style.cssText = `
        top: 20px;
        right: 20px;
        z-index: 10000;
        min-width: 300px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    toast.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <span>${message}</span>
            <button type="button" class="btn-close" onclick="this.parentElement.parentElement.remove()"></button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);
}

// Initialize ISN-specific keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl+R: Refresh ISN index
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        refreshISNIndex();
    }
    
    // Ctrl+F: Focus search (if search exists)
    if (e.ctrlKey && e.key === 'f') {
        const searchInput = document.querySelector('#isn-search');
        if (searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
    }
});

// Export functions for global access
window.ISNIndex = {
    refresh: refreshISNIndex,
    link: linkISNDocument,
    unlink: unlinkISNDocument,
    bulkLink: bulkLinkISNDocuments,
    search: searchISNDocuments,
    filter: filterISNByStatus,
    export: exportISNData
};