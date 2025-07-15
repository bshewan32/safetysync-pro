// public/js/main.js
document.addEventListener('DOMContentLoaded', function() {
  // Initialize tooltips
  var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
  var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl)
  });
  
  // Document sorting functionality
  const sortLinks = document.querySelectorAll('[data-sort]');
  const table = document.getElementById('documents-table');
  
  if (table && sortLinks.length > 0) {
    sortLinks.forEach(link => {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        const sortBy = this.getAttribute('data-sort');
        sortTable(table, sortBy);
      });
    });
  }
  
  function sortTable(table, sortBy) {
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Determine column index based on sort criterion
    let columnIndex;
    switch(sortBy) {
      case 'name':
        columnIndex = 0;
        break;
      case 'folder':
        columnIndex = 1;
        break;
      case 'type':
        columnIndex = 2;
        break;
      case 'size':
        columnIndex = 3;
        break;
      case 'modified':
        columnIndex = 4;
        break;
      default:
        columnIndex = 0;
    }
    
    // Sort rows
    rows.sort((a, b) => {
      const aValue = a.cells[columnIndex].textContent.trim();
      const bValue = b.cells[columnIndex].textContent.trim();
      
      // Special handling for size (convert to bytes for comparison)
      if (sortBy === 'size') {
        return convertSizeToBytes(aValue) - convertSizeToBytes(bValue);
      }
      
      // Special handling for dates
      if (sortBy === 'modified') {
        return new Date(aValue) - new Date(bValue);
      }
      
      // Default string comparison
      return aValue.localeCompare(bValue);
    });
    
    // Reappend rows in sorted order
    rows.forEach(row => tbody.appendChild(row));
  }
  
  function convertSizeToBytes(sizeStr) {
    const units = {
      'B': 1, 
      'KB': 1024, 
      'MB': 1024 * 1024, 
      'GB': 1024 * 1024 * 1024
    };
    
    const matches = sizeStr.match(/^([\d.]+)\s*([A-Z]+)$/);
    if (!matches) return 0;
    
    const size = parseFloat(matches[1]);
    const unit = matches[2];
    
    return size * (units[unit] || 0);
  }
  
  // Open document in new window
  const openLinks = document.querySelectorAll('a[href^="/open/"]');
  openLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      
      // Show loading indicator
      const originalText = this.innerHTML;
      this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opening...';
      
      fetch(this.getAttribute('href'))
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            // Reset button text
            this.innerHTML = originalText;
          } else {
            this.innerHTML = originalText;
            alert('Error opening document: ' + data.message);
          }
        })
        .catch(error => {
          console.error('Error:', error);
          this.innerHTML = originalText;
          alert('An error occurred while trying to open the document.');
        });
    });
  });
  
  // Add animation when documents are loaded
  const documentItems = document.querySelectorAll('.list-group-item, #documents-table tbody tr');
  if (documentItems.length > 0) {
    documentItems.forEach((item, index) => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(20px)';
      item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      
      setTimeout(() => {
        item.style.opacity = '1';
        item.style.transform = 'translateY(0)';
      }, 50 * index);
    });
  }
});