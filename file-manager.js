// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2025 e-editiones.org

import iconsSvg from './icons.svg?raw';
import stylesCss from './styles.css?inline';
import { getFileType, isImageFile } from './mime-types.js';

class FileManager extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    // Configuration properties
    this.apiBase = '/exist/apps/jinks'; // Use relative path for Vite proxy
    this.root = '/db/apps/test';
    
    // State management
    this.currentPath = this.root;
    this.items = [];
    this.selectedItems = new Set();
    this.clipboard = null;
    this.clipboardMode = 'copy'; // 'copy' or 'cut'
    this.loadedRanges = [];
    this.pageSize = 100;
    this.loading = false;
    this.cache = new Map();
    this.messageTimeout = null;
    
    // Bind methods
    this.handleClick = this.handleClick.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handlePaste = this.handlePaste.bind(this);
    this.handleDragEnter = this.handleDragEnter.bind(this);
    this.handleDragOver = this.handleDragOver.bind(this);
    this.handleDragLeave = this.handleDragLeave.bind(this);
    this.handleDrop = this.handleDrop.bind(this);
  }
  
  static get observedAttributes() {
    return ['api-base', 'root'];
  }
  
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    
    switch (name) {
      case 'api-base':
        this.apiBase = newValue || '/exist/apps/eXide';
        // Refresh collection if already connected
        if (this.isConnected && this.shadowRoot && this.shadowRoot.querySelector('.grid-container')) {
          setTimeout(() => {
            this.loadCollection(this.currentPath);
          }, 0);
        }
        break;
      case 'root':
        this.root = newValue;
        this.currentPath = this.root;
        // Clear cache and refresh collection when root changes
        this.cache.clear();
        this.loadedRanges = [];
        this.items = [];
        this.selectedItems.clear();
        // Only load collection if root is set and component is connected
        if (this.root && this.root.trim() && this.isConnected && this.shadowRoot && this.shadowRoot.querySelector('.grid-container')) {
          setTimeout(() => {
            this.loadCollection(this.currentPath);
          }, 0);
        }
        break;
    }
  }
  
  connectedCallback() {
    this.render();
    // Wait for next tick to ensure shadow DOM is fully rendered
    // Only load collection if root is set
    if (this.root && this.root.trim()) {
      setTimeout(() => {
        this.loadCollection(this.currentPath);
      }, 0);
    }
    this.setupEventListeners();
  }
  
  disconnectedCallback() {
    this.removeEventListeners();
  }
  
  setupEventListeners() {
    this.shadowRoot.addEventListener('click', this.handleClick);
    this.shadowRoot.addEventListener('contextmenu', this.handleContextMenu);
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('paste', this.handlePaste);
    
    // Drag and drop for file upload
    const content = this.shadowRoot.querySelector('.content');
    if (content) {
      content.addEventListener('dragenter', this.handleDragEnter);
      content.addEventListener('dragover', this.handleDragOver);
      content.addEventListener('dragleave', this.handleDragLeave);
      content.addEventListener('drop', this.handleDrop);
    }
  }
  
  removeEventListeners() {
    this.shadowRoot.removeEventListener('click', this.handleClick);
    this.shadowRoot.removeEventListener('contextmenu', this.handleContextMenu);
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('paste', this.handlePaste);
    
    // Remove drag and drop listeners
    const content = this.shadowRoot.querySelector('.content');
    if (content) {
      content.removeEventListener('dragenter', this.handleDragEnter);
      content.removeEventListener('dragover', this.handleDragOver);
      content.removeEventListener('dragleave', this.handleDragLeave);
      content.removeEventListener('drop', this.handleDrop);
    }
  }
  
  render() {
    this.shadowRoot.innerHTML = `
      <style>${stylesCss}</style>
      ${iconsSvg}
      <div class="file-manager">
        <div class="toolbar">
          <button class="btn-upload" title="Upload files">
            <svg width="16" height="16" fill="currentColor"><use href="#icon-upload"></use></svg>
            Upload
          </button>
          <button class="btn-paste" disabled title="Paste (Ctrl+V)">
            <svg width="16" height="16" fill="currentColor"><use href="#icon-clipboard"></use></svg>
            Paste
          </button>
          <div class="spacer"></div>
          <div class="clipboard-indicator" style="display: none;">
            <svg width="16" height="16" fill="currentColor"><use href="#icon-clipboard"></use></svg>
            <span class="clipboard-text"></span>
          </div>
        </div>
        <div class="breadcrumb"></div>
        <div class="content">
          <div class="grid-container"></div>
          <div class="loading" style="display: none;">
            <div class="spinner"></div>
            <span>Loading...</span>
          </div>
          <div class="load-more-container" style="display: none;">
            <button class="btn-load-more">Load More</button>
          </div>
          <div class="empty-state" style="display: none;">
            <p>This collection is empty</p>
          </div>
        </div>
        <div class="message-footer" style="display: none;">
          <span class="message-text"></span>
          <input type="text" class="message-input" style="display: none;" placeholder="Enter value...">
          <div class="message-actions">
            <button class="message-confirm-btn" style="display: none;">Confirm</button>
            <button class="message-cancel-btn" style="display: none;">Cancel</button>
            <button class="message-close" title="Close">×</button>
          </div>
        </div>
        <div class="context-menu" style="display: none;"></div>
        <input type="file" class="file-input" multiple style="display: none;">
      </div>
    `;
    
    // Setup upload button
    const uploadBtn = this.shadowRoot.querySelector('.btn-upload');
    const fileInput = this.shadowRoot.querySelector('.file-input');
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    
    // Setup paste button
    const pasteBtn = this.shadowRoot.querySelector('.btn-paste');
    pasteBtn.addEventListener('click', () => this.performPaste());
    
    // Update paste button state
    this.updatePasteButton();
    
    // Setup message footer close button
    const messageClose = this.shadowRoot.querySelector('.message-close');
    if (messageClose) {
      messageClose.addEventListener('click', () => this.hideMessage());
    }
  }
  
  // API Service Methods
  async login(user, password) {
    // eXide login endpoint: /exist/apps/jinks/login
    const url = `${this.apiBase}/api/login/`;
    
    // Create form data
    const formData = new URLSearchParams();
    formData.append('user', user);
    formData.append('password', password);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Login HTTP error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText.substring(0, 100)}`);
      }
      
      // Try to parse as JSON, but handle non-JSON responses
      const contentType = response.headers.get('content-type') || '';
      let result;
      
      if (contentType.includes('application/json') || contentType.includes('text/javascript')) {
        const text = await response.text();
        try {
          result = JSON.parse(text);
        } catch (e) {
          result = { success: true, message: text };
        }
      } else {
        const text = await response.text();
        result = { success: true, message: text };
      }
      
      return result;
    } catch (error) {
      console.error('Error logging in:', error);
      this.showError(`Failed to login: ${error.message}`);
      throw error;
    }
  }
  
  async fetchCollections(path, start = 0, end = this.pageSize) {
    const url = `${this.apiBase}/api/collections/${encodeURIComponent(path)}?start=${start}&end=${end}`;
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('HTTP error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText.substring(0, 100)}`);
      }
      
      // Try to parse as JSON regardless of content-type
      // Some APIs return JSON with text/javascript or text/plain content-type
      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      
      // Check if it looks like JSON (starts with { or [)
      if (!text.trim().match(/^[\s]*[{\[]/)) {
        console.warn('Response does not appear to be JSON, content-type:', contentType);
        console.warn('Response text:', text.substring(0, 500));
        throw new Error(`Response is not valid JSON. Content-type: ${contentType}`);
      }
      
      // Parse the JSON text
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('Failed to parse JSON:', parseError);
        console.error('Response text:', text.substring(0, 500));
        throw new Error(`Failed to parse JSON response: ${parseError.message}`);
      }
      
      return data;
    } catch (error) {
      console.error('Error fetching collections:', error);
      this.showError(`Failed to load collection: ${error.message}`);
      throw error;
    }
  }
  
  async uploadFile(collectionPath, file) {
    const formData = new FormData();
    
    // New API: /api/upload
    // - collection: query parameter (collection path)
    // - path: query parameter (optional, filename if not provided)
    // - deploy: query parameter (optional, boolean)
    // - file[]: form data (binary file)
    formData.append('file[]', file);
    
    // Build URL with query parameters
    const url = new URL(`${this.apiBase}/api/upload`, window.location.origin);
    url.searchParams.append('collection', collectionPath);
    // path parameter is optional - if not provided, filename from upload will be used
    // deploy parameter is optional - default is false
    
    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload HTTP error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText.substring(0, 100)}`);
      }
      
      // API returns JSON with files array
      const contentType = response.headers.get('content-type') || '';
      let result;
      
      if (contentType.includes('application/json')) {
        result = await response.json();
      } else {
        // Fallback for non-JSON responses
        const text = await response.text();
        try {
          result = JSON.parse(text);
        } catch (e) {
          result = { success: true, message: text };
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error uploading file:', error);
      this.showError(`Failed to upload file: ${error.message}`);
      throw error;
    }
  }
  
  async deleteItem(path) {
    // This method is kept for single item deletion
    // For multiple items, use deleteItems() instead
    return this.deleteItems([path]);
  }
  
  async deleteItems(paths) {
    // New API: DELETE /api/collections/{collection}?remove=path1&remove=path2
    // The remove parameter is an array (exploded form style), so multiple remove= parameters
    // Paths can be relative to the collection or absolute
    const collectionPath = this.currentPath;
    
    // Ensure paths is an array and filter out any undefined/null values
    if (!Array.isArray(paths)) {
      console.error('deleteItems: paths is not an array:', paths);
      paths = [paths];
    }
    
    const validPaths = paths.filter(p => p != null && p !== '');
    if (validPaths.length === 0) {
      throw new Error('No valid paths to delete');
    }
    
    // Build URL with multiple remove parameters (exploded form style)
    const removeParams = validPaths.map(path => `remove=${encodeURIComponent(path)}`).join('&');
    const url = `${this.apiBase}/api/collections/${encodeURIComponent(collectionPath)}?${removeParams}`;
    
    try {
      const response = await fetch(url, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Delete HTTP error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText.substring(0, 100)}`);
      }
      
      // Try to parse as JSON, but handle non-JSON responses
      const contentType = response.headers.get('content-type') || '';
      let result;
      
      if (contentType.includes('application/json') || contentType.includes('text/javascript')) {
        const text = await response.text();
        try {
          result = JSON.parse(text);
        } catch (e) {
          result = { success: true, message: text };
        }
      } else {
        const text = await response.text();
        result = { success: true, message: text };
      }
      
      // Check for failure response
      if (result.status === 'fail' && result.message) {
        console.error('Delete failed, response:', result);
        throw new Error(result.message);
      }
      
      return result;
    } catch (error) {
      console.error('Error deleting items:', error);
      this.showError(`Failed to delete item(s): ${error.message}`);
      throw error;
    }
  }
  
  async renameItem(oldPath, newName) {
    // New API: PATCH /api/collections/{collection}/resources/{resource}
    // - collection: collection path containing the resource (path parameter)
    // - resource: current name of the resource/collection (path parameter)
    // - Request body: JSON with "name" (new name)
    
    // Get the collection path (parent of the item being renamed)
    const collectionPath = this.currentPath;
    
    // Extract the resource name from the old path
    // oldPath could be a full path or just a name
    let resourceName;
    if (oldPath.includes('/')) {
      // Full path provided, extract the name
      resourceName = oldPath.split('/').filter(p => p).pop();
    } else {
      // Just the name provided
      resourceName = oldPath;
    }
    
    const url = `${this.apiBase}/api/collections/${encodeURIComponent(collectionPath)}/resources/${encodeURIComponent(resourceName)}`;
    
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newName
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Rename HTTP error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText.substring(0, 100)}`);
      }
      
      // API returns JSON
      const result = await response.json();
      
      return result;
    } catch (error) {
      console.error('Error renaming item:', error);
      this.showError(`Failed to rename item: ${error.message}`);
      throw error;
    }
  }
  
  async copyItem(sourcePath, targetCollection) {
    // This method is kept for single item copying
    // For multiple items, use copyItems() instead
    return this.copyItems([sourcePath], targetCollection);
  }
  
  async copyItems(sourcePaths, targetCollection) {
    // New API: POST /api/collections/{collection}/copy
    // - collection: source collection path (path parameter)
    // - Request body: JSON with "target" (target collection path) and "sources" (array of resource/collection names relative to source collection or absolute paths)
    
    // Ensure paths is an array
    if (!Array.isArray(sourcePaths)) {
      sourcePaths = [sourcePaths];
    }
    
    const validPaths = sourcePaths.filter(p => p != null && p !== '');
    if (validPaths.length === 0) {
      throw new Error('No valid paths to copy');
    }
    
    // Determine source collection from the first path
    // If paths are absolute, extract the collection; otherwise use currentPath
    let sourceCollection = this.currentPath;
    const firstPath = validPaths[0];
    if (firstPath.startsWith('/')) {
      // Absolute path - extract collection path (parent directory)
      const parts = firstPath.split('/').filter(p => p);
      parts.pop(); // Remove the resource name
      if (parts.length > 0) {
        sourceCollection = '/' + parts.join('/');
      }
    }
    
    const url = `${this.apiBase}/api/collections/${encodeURIComponent(sourceCollection)}/copy`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target: targetCollection,
          sources: validPaths
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Copy HTTP error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText.substring(0, 100)}`);
      }
      
      // API returns JSON
      const result = await response.json();
      
      return result;
    } catch (error) {
      console.error('Error copying items:', error);
      this.showError(`Failed to copy item(s): ${error.message}`);
      throw error;
    }
  }
  
  async moveItems(sourcePaths, targetCollection) {
    // New API: POST /api/collections/{collection}/move
    // - collection: source collection path (path parameter)
    // - Request body: JSON with "target" (target collection path) and "sources" (array of resource/collection names relative to source collection or absolute paths)
    
    // Ensure paths is an array
    if (!Array.isArray(sourcePaths)) {
      sourcePaths = [sourcePaths];
    }
    
    const validPaths = sourcePaths.filter(p => p != null && p !== '');
    if (validPaths.length === 0) {
      throw new Error('No valid paths to move');
    }
    
    // Determine source collection from the first path
    // If paths are absolute, extract the collection; otherwise use currentPath
    let sourceCollection = this.currentPath;
    const firstPath = validPaths[0];
    if (firstPath.startsWith('/')) {
      // Absolute path - extract collection path (parent directory)
      const parts = firstPath.split('/').filter(p => p);
      parts.pop(); // Remove the resource name
      if (parts.length > 0) {
        sourceCollection = '/' + parts.join('/');
      }
    }
    
    const url = `${this.apiBase}/api/collections/${encodeURIComponent(sourceCollection)}/move`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target: targetCollection,
          sources: validPaths
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Move HTTP error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText.substring(0, 100)}`);
      }
      
      // API returns JSON
      const result = await response.json();
      
      return result;
    } catch (error) {
      console.error('Error moving items:', error);
      this.showError(`Failed to move item(s): ${error.message}`);
      throw error;
    }
  }
  
  // State Management
  async loadCollection(path, append = false) {
    if (this.loading) return;
    
    // Ensure shadow root is ready
    if (!this.shadowRoot || !this.shadowRoot.querySelector('.grid-container')) {
      console.warn('Shadow root not ready, deferring loadCollection');
      return;
    }
    
    this.loading = true;
    this.currentPath = path;
    
    const loadingEl = this.shadowRoot.querySelector('.loading');
    const gridContainer = this.shadowRoot.querySelector('.grid-container');
    const emptyState = this.shadowRoot.querySelector('.empty-state');
    const loadMoreContainer = this.shadowRoot.querySelector('.load-more-container');
    
    // Safety check
    if (!gridContainer || !loadingEl || !emptyState || !loadMoreContainer) {
      console.error('Required DOM elements not found in shadow root');
      this.loading = false;
      return;
    }
    
    if (!append) {
      this.items = [];
      this.loadedRanges = [];
      this.selectedItems.clear();
      gridContainer.innerHTML = '';
      emptyState.style.display = 'none';
      loadMoreContainer.style.display = 'none';
      // Clear cache for this path to force fresh load
      this.cache.delete(path);
    }
    
    loadingEl.style.display = 'flex';
    
    try {
      const start = append ? this.items.length : 0;
      const end = start + this.pageSize;
      const rangeKey = `${start}-${end}`;
      
      // Check if we've already loaded this range (only if appending)
      if (append && this.loadedRanges.includes(rangeKey)) {
        this.loading = false;
        loadingEl.style.display = 'none';
        return;
      }
      
      const data = await this.fetchCollections(path, start, end);
      
      let newItems = [];
      
      // Handle different response formats
      if (data && data.items) {
        // Format: { items: [...] } - eXide format
        newItems = Array.isArray(data.items) ? data.items : [data.items];
      } else if (data && data.collection) {
        // Format: { collection: [...] }
        newItems = Array.isArray(data.collection) ? data.collection : [data.collection];
      } else if (data && (data.resources || data.collections)) {
        // Format: { collections: [...], resources: [...] }
        const resources = data.resources ? (Array.isArray(data.resources) ? data.resources : [data.resources]) : [];
        const collections = data.collections ? (Array.isArray(data.collections) ? data.collections : [data.collections]) : [];
        
        newItems = [
          ...collections.map(c => ({ ...c, type: 'collection' })),
          ...resources.map(r => ({ ...r, type: 'resource' }))
        ];
      } else if (Array.isArray(data)) {
        // Format: [...] (direct array)
        newItems = data;
      } else if (data && typeof data === 'object') {
        // Try to find any array property
        const arrayKeys = Object.keys(data).filter(key => Array.isArray(data[key]));
        if (arrayKeys.length > 0) {
          // Use the first array found
          newItems = data[arrayKeys[0]];
        } else {
          // Try to extract items from object properties
          const items = [];
          Object.keys(data).forEach(key => {
            if (data[key] && typeof data[key] === 'object') {
              items.push({ ...data[key], name: data[key].name || key });
            }
          });
          newItems = items;
        }
      }
      
      // Normalize items - ensure they have required properties
      newItems = newItems.map((item, index) => {
        // Ensure item has a name property - check various possible fields
        if (!item.name) {
          if (item.key) {
            // Extract name from key (full path)
            const keyParts = item.key.split('/').filter(p => p);
            item.name = keyParts.length > 0 ? keyParts[keyParts.length - 1] : item.key;
          } else if (item.path) {
            // Extract name from path
            const pathParts = item.path.split('/').filter(p => p);
            item.name = pathParts.length > 0 ? pathParts[pathParts.length - 1] : item.path;
          }
        }
        
        // Handle parent directory ".." path calculation FIRST, before other path logic
        if (item.name === '..') {
          // Use key as parent path if available, otherwise calculate it
          let parentPath;
          if (item.key && item.key !== path) {
            // The key might already be the parent path
            parentPath = item.key;
          } else {
            // Calculate parent path
            const parts = path.split('/').filter(p => p);
            parts.pop();
            parentPath = parts.length > 0 ? '/' + parts.join('/') : '/';
          }
          
          // Only allow parent navigation if it's still within root
          if (parentPath.startsWith(this.root)) {
            item.path = parentPath;
            // Ensure name is preserved as ".."
            item.name = '..';
          } else {
            // Parent would be outside root, don't set path (will be filtered out)
            return null;
          }
        } else {
          // For non-parent items, set path from key or construct from name
          if (!item.path) {
            if (item.key) {
              item.path = item.key;
            } else if (item.name) {
              item.path = path.endsWith('/') ? path + item.name : path + '/' + item.name;
            }
          }
        }
        
        // Map isCollection to type
        if (item.isCollection !== undefined) {
          item.type = item.isCollection ? 'collection' : 'resource';
        }
        
        // Infer type if not set
        if (!item.type) {
          // Try to infer type from path or name
          if (item.name === '..') {
            item.type = 'collection'; // Parent directory
          } else {
            item.type = item.name && !item.name.includes('.') ? 'collection' : 'resource';
          }
        }
        
        // Ensure item has both name and path, otherwise filter it out
        // But log items that are being filtered for debugging
        if (!item.name || !item.path) {
          return null;
        }
        
        return item;
      }).filter(item => item != null); // Filter out null items (parent dirs outside root)
      
      // Additional filter to ensure no items have paths outside root
      newItems = newItems.filter(item => {
        if (item.path && !item.path.startsWith(this.root)) {
          return false;
        }
        return true;
      });
      
      if (append) {
        this.items = [...this.items, ...newItems];
      } else {
        this.items = newItems;
      }
      
      // Only add to loadedRanges if we successfully got items
      if (newItems.length > 0 || !append) {
        this.loadedRanges.push(rangeKey);
      }
      
      this.renderGrid();
      this.updateBreadcrumb();
      this.updateLoadMoreButton();
      
      if (this.items.length === 0) {
        emptyState.style.display = 'block';
      } else {
        emptyState.style.display = 'none';
      }
      
      
      // Cache the result
      this.cache.set(path, { items: this.items, timestamp: Date.now() });
      
    } catch (error) {
      console.error('Error loading collection:', error);
      this.showError(`Failed to load collection: ${error.message}`);
      emptyState.style.display = 'block';
      const emptyStateEl = this.shadowRoot.querySelector('.empty-state');
      if (emptyStateEl) {
        emptyStateEl.innerHTML = `<p style="color: #d32f2f;">Error: ${error.message}</p><p style="font-size: 12px; color: #666; margin-top: 8px;">Check the browser console for details.</p>`;
      }
    } finally {
      this.loading = false;
      loadingEl.style.display = 'none';
    }
  }
  
  
  // Helper method to get REST API URL for an image
  getImageUrl(itemPath) {
    // Convert eXide API base to REST API base
    // e.g., /exist/apps/eXide/modules -> /exist/rest
    const restBase = this.apiBase.replace('/apps/jinks', '/rest');
    return `${restBase}${itemPath}`;
  }
  
  // UI Rendering
  renderGrid() {
    const gridContainer = this.shadowRoot.querySelector('.grid-container');
    gridContainer.innerHTML = '';
    
    this.items.forEach((item, index) => {
      const gridItem = document.createElement('div');
      gridItem.className = `grid-item ${item.type === 'collection' ? 'folder' : 'file'}`;
      gridItem.dataset.path = item.path || item.name;
      gridItem.dataset.index = index;
      
      if (this.selectedItems.has(item.path || item.name)) {
        gridItem.classList.add('selected');
      }
      
      // Handle parent directory ".." specially
      let name;
      if (item.name === '..') {
        name = '..';
      } else {
        name = item.name || item.path?.split('/').pop() || 'Unknown';
      }
      const itemPath = item.path || item.name;
      const isImage = isImageFile(item);
      
      let icon;
      if (item.type === 'collection') {
        icon = `<svg width="48" height="48" fill="currentColor"><use href="#icon-folder"></use></svg>`;
      } else if (isImage) {
        // Show thumbnail for images
        const imageUrl = this.getImageUrl(itemPath);
        icon = `<img src="${imageUrl}" alt="${name}" class="thumbnail-image" data-path="${itemPath}">
                <svg width="48" height="48" fill="currentColor" class="thumbnail-fallback" style="display: none;"><use href="#icon-file"></use></svg>`;
      } else {
        const fileType = getFileType(item);
        switch (fileType) {
          case 'xml':
          case 'json':
          case 'css':
            icon = `<svg width="48" height="48" fill="currentColor"><use href="#icon-filetype-${fileType}"></use></svg>`;
            break;
          default:
            icon = `<svg width="48" height="48" fill="currentColor"><use href="#icon-file"></use></svg>`;
        }
      }
      
      gridItem.innerHTML = `
        <div class="item-icon">${icon}</div>
        <div class="item-name" title="${name}">${name}</div>
      `;
      
      // Add error handler for image thumbnails
      if (isImage) {
        const img = gridItem.querySelector('.thumbnail-image');
        const fallback = gridItem.querySelector('.thumbnail-fallback');
        if (img && fallback) {
          img.addEventListener('error', () => {
            img.style.display = 'none';
            fallback.style.display = 'block';
          });
        }
      }
      
      gridContainer.appendChild(gridItem);
    });
  }
  
  updateBreadcrumb() {
    const breadcrumb = this.shadowRoot.querySelector('.breadcrumb');
    if (!breadcrumb) return;
    
    const currentParts = this.currentPath.split('/').filter(p => p);
    const rootParts = this.root.split('/').filter(p => p);
    
    breadcrumb.innerHTML = '';
    
    // Root/home button - navigate to configured root
    const homeBtn = document.createElement('button');
    homeBtn.className = 'breadcrumb-item home';
    homeBtn.innerHTML = '<svg width="16" height="16" fill="currentColor"><use href="#icon-home"></use></svg>';
    homeBtn.title = 'Root: ' + this.root;
    
    // Only make home button clickable if not already at root
    if (this.currentPath !== this.root) {
      homeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.navigateTo(this.root);
      });
    } else {
      homeBtn.classList.add('current');
      homeBtn.disabled = true;
    }
    
    breadcrumb.appendChild(homeBtn);
    
    // Only show path segments that are below the root
    // Start from rootParts.length to skip root segments
    let currentPath = this.root;
    currentParts.slice(rootParts.length).forEach((part, index) => {
      currentPath += '/' + part;
      
      // Capture the path for this specific segment
      const segmentPath = currentPath;
      
      const separator = document.createElement('span');
      separator.className = 'breadcrumb-separator';
      separator.textContent = '/';
      breadcrumb.appendChild(separator);
      
      const segment = document.createElement('button');
      segment.className = 'breadcrumb-item';
      segment.textContent = part;
      segment.title = segmentPath;
      
      const relativeIndex = rootParts.length + index;
      if (relativeIndex === currentParts.length - 1) {
        segment.classList.add('current');
        segment.disabled = true;
      } else {
        segment.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.navigateTo(segmentPath);
        });
      }
      
      breadcrumb.appendChild(segment);
    });
  }
  
  updateLoadMoreButton() {
    const loadMoreContainer = this.shadowRoot.querySelector('.load-more-container');
    const loadMoreBtn = loadMoreContainer.querySelector('.btn-load-more');
    
    // Show load more if we have items and might have more
    if (this.items.length > 0 && this.items.length % this.pageSize === 0) {
      loadMoreContainer.style.display = 'block';
      loadMoreBtn.onclick = () => this.loadCollection(this.currentPath, true);
    } else {
      loadMoreContainer.style.display = 'none';
    }
  }
  
  updatePasteButton() {
    const pasteBtn = this.shadowRoot.querySelector('.btn-paste');
    const clipboardIndicator = this.shadowRoot.querySelector('.clipboard-indicator');
    const clipboardText = this.shadowRoot.querySelector('.clipboard-text');
    
    // Handle both single item (backwards compatibility) and array of items
    const clipboardItems = this.clipboard 
      ? (Array.isArray(this.clipboard) ? this.clipboard : [this.clipboard])
      : [];
    
    if (clipboardItems.length > 0) {
      pasteBtn.disabled = false;
      clipboardIndicator.style.display = 'flex';
      const count = clipboardItems.length;
      const action = this.clipboardMode === 'cut' ? 'Cut' : 'Copied';
      if (count === 1) {
        const name = clipboardItems[0].name || clipboardItems[0].path.split('/').pop();
        clipboardText.textContent = `${action}: ${name}`;
      } else {
        clipboardText.textContent = `${action}: ${count} items`;
      }
    } else {
      pasteBtn.disabled = true;
      clipboardIndicator.style.display = 'none';
    }
  }
  
  // Event Handlers
  handleClick(e) {
    const gridItem = e.target.closest('.grid-item');
    if (!gridItem) {
      // Click outside - only clear if not holding modifier keys
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        this.selectedItems.clear();
        this.renderGrid();
      }
      this.hideContextMenu();
      return;
    }
    
    const path = gridItem.dataset.path;
    const item = this.items.find(i => (i.path || i.name) === path);
    
    if (!item) return;
    
    // Handle folder navigation
    if (item.type === 'collection' || gridItem.classList.contains('folder')) {
      if (e.detail === 2 || (e.detail === 1 && e.target.closest('.item-icon'))) {
        // Double click or click on icon - navigate
        this.navigateTo(path);
      } else {
        // Single click - select (unless double-click)
        if (e.detail === 1) {
          this.toggleSelection(path, e);
        }
      }
    } else {
      // File - just select
      this.toggleSelection(path, e);
    }
  }
  
  handleContextMenu(e) {
    e.preventDefault();
    const gridItem = e.target.closest('.grid-item');
    
    if (!gridItem) {
      this.hideContextMenu();
      return;
    }
    
    const path = gridItem.dataset.path;
    const item = this.items.find(i => (i.path || i.name) === path);
    if (!item) return;
    
    // If the right-clicked item is not selected, select it (but don't clear other selections if modifier is held)
    if (!this.selectedItems.has(path) && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      this.selectedItems.clear();
      this.selectedItems.add(path);
      this.renderGrid();
    }
    
    this.showContextMenu(e.clientX, e.clientY, item);
  }
  
  handleKeyDown(e) {
    // Only handle if file manager is focused or has selection
    if (this.selectedItems.size === 0 && !this.shadowRoot.contains(document.activeElement)) {
      return;
    }
    
    // Ctrl+C - Copy
    if (e.ctrlKey && e.key === 'c' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      this.performCopy();
      return;
    }
    
    // Ctrl+X - Cut
    if (e.ctrlKey && e.key === 'x' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      this.performCut();
      return;
    }
    
    // Ctrl+V - Paste
    if (e.ctrlKey && e.key === 'v' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      this.performPaste();
      return;
    }
    
    // Delete key
    if (e.key === 'Delete' && this.selectedItems.size > 0) {
      e.preventDefault();
      this.performDelete();
      return;
    }
    
    // F2 - Rename
    if (e.key === 'F2' && this.selectedItems.size === 1) {
      e.preventDefault();
      const path = Array.from(this.selectedItems)[0];
      this.performRename(path);
      return;
    }
  }
  
  handlePaste(e) {
    // Only handle if file manager is focused
    if (!this.shadowRoot.contains(document.activeElement) && this.selectedItems.size === 0) {
      return;
    }
    
    // Check if we have internal clipboard
    if (this.clipboard) {
      e.preventDefault();
      this.performPaste();
    }
  }
  
  handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    this.uploadFiles(files);
    e.target.value = ''; // Reset input
  }
  
  // Drag and drop handlers
  handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    
    // Only handle if dragging files
    if (e.dataTransfer.types.includes('Files')) {
      const content = this.shadowRoot.querySelector('.content');
      if (content) {
        content.classList.add('drag-over');
      }
    }
  }
  
  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    
    // Only handle if dragging files
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }
  
  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    
    // Only remove class if we're leaving the content area
    const content = this.shadowRoot.querySelector('.content');
    if (content && !content.contains(e.relatedTarget)) {
      content.classList.remove('drag-over');
    }
  }
  
  handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const content = this.shadowRoot.querySelector('.content');
    if (content) {
      content.classList.remove('drag-over');
    }
    
    // Get files from the drop event
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    
    this.uploadFiles(files);
  }
  
  // Operations
  toggleSelection(path, e = null) {
    if (this.selectedItems.has(path)) {
      if (e && (e.ctrlKey || e.metaKey)) {
        // Allow deselecting with Ctrl/Cmd
        this.selectedItems.delete(path);
      } else {
        // Keep selected if clicking again without modifier
        return;
      }
    } else {
      // Adding new selection
      if (!e || (!e.shiftKey && !e.ctrlKey && !e.metaKey)) {
        // No modifier keys - clear existing selection
        this.selectedItems.clear();
      }
      this.selectedItems.add(path);
    }
    this.renderGrid();
  }
  
  navigateTo(path) {
    // Normalize paths for comparison (remove trailing slashes, ensure leading slash)
    const normalizePath = (p) => {
      if (!p) return '';
      p = p.trim();
      if (!p.startsWith('/')) p = '/' + p;
      // Don't remove trailing slash for root paths like '/db'
      if (p.length > 1 && p.endsWith('/')) {
        p = p.slice(0, -1);
      }
      return p;
    };
    
    const normalizedPath = normalizePath(path);
    const normalizedCurrent = normalizePath(this.currentPath);
    const normalizedRoot = normalizePath(this.root);
    
    // Ensure the path is within the configured root
    if (normalizedPath && !normalizedPath.startsWith(normalizedRoot)) {
      console.warn('Navigation blocked: path is outside configured root', {
        path: normalizedPath,
        root: normalizedRoot
      });
      this.showError('Cannot navigate outside the configured root collection');
      return;
    }
    
    if (!path || normalizedPath === normalizedCurrent) {
      return;
    }
    
    this.loadCollection(normalizedPath);
  }
  
  async uploadFiles(files) {
    const loadingEl = this.shadowRoot.querySelector('.loading');
    if (!loadingEl) {
      console.error('Loading element not found');
      return;
    }
    
    loadingEl.style.display = 'flex';
    
    try {
      const uploadPath = this.currentPath;
      for (const file of files) {
        await this.uploadFile(uploadPath, file);
      }
      
      // Clear cache and loaded ranges for this path to force fresh load
      this.cache.delete(uploadPath);
      this.loadedRanges = [];
      this.items = []; // Clear items array
      
      // Small delay to ensure server has processed the upload
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Refresh collection - force reload by passing false for append
      await this.loadCollection(uploadPath, false);
      this.showMessage(`Successfully uploaded ${files.length} file(s)`);
    } catch (error) {
      console.error('Upload error:', error);
      this.showError(`Failed to upload file(s): ${error.message}`);
    } finally {
      loadingEl.style.display = 'none';
    }
  }
  
  performCopy() {
    if (this.selectedItems.size === 0) return;
    
    const selectedPaths = Array.from(this.selectedItems);
    const selectedItems = selectedPaths
      .map(path => this.items.find(i => (i.path || i.name) === path))
      .filter(item => item != null);
    
    if (selectedItems.length === 0) return;
    
    // Store all selected items in clipboard
    this.clipboard = selectedItems.map(item => ({
      path: item.path || item.name,
      type: item.type || (item.name?.endsWith('/') ? 'collection' : 'resource'),
      name: item.name || (item.path || item.name).split('/').pop()
    }));
    this.clipboardMode = 'copy';
    
    this.updatePasteButton();
    const count = this.clipboard.length;
    const names = this.clipboard.map(c => c.name).join(', ');
    this.showMessage(`Copied ${count} item(s): ${names.substring(0, 50)}${names.length > 50 ? '...' : ''}`);
  }
  
  performCut() {
    if (this.selectedItems.size === 0) return;
    
    const selectedPaths = Array.from(this.selectedItems);
    const selectedItems = selectedPaths
      .map(path => this.items.find(i => (i.path || i.name) === path))
      .filter(item => item != null);
    
    if (selectedItems.length === 0) return;
    
    // Store all selected items in clipboard
    this.clipboard = selectedItems.map(item => ({
      path: item.path || item.name,
      type: item.type || (item.name?.endsWith('/') ? 'collection' : 'resource'),
      name: item.name || (item.path || item.name).split('/').pop()
    }));
    this.clipboardMode = 'cut';
    
    this.updatePasteButton();
    const count = this.clipboard.length;
    const names = this.clipboard.map(c => c.name).join(', ');
    this.showMessage(`Cut ${count} item(s): ${names.substring(0, 50)}${names.length > 50 ? '...' : ''}`);
  }
  
  async copyPathToClipboard(fullPath) {
    // Calculate relative path from root
    let relativePath = fullPath;
    
    if (this.root && this.root.trim()) {
      const normalizedRoot = this.root.trim();
      const normalizedPath = fullPath.trim();
      
      // If the path starts with the root, remove it to get relative path
      if (normalizedPath.startsWith(normalizedRoot)) {
        relativePath = normalizedPath.substring(normalizedRoot.length);
        // Remove leading slash if present
        if (relativePath.startsWith('/')) {
          relativePath = relativePath.substring(1);
        }
      }
    }
    
    try {
      await navigator.clipboard.writeText(relativePath);
      this.showMessage(`Copied path to clipboard: ${relativePath}`);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = relativePath;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        this.showMessage(`Copied path to clipboard: ${relativePath}`);
      } catch (err) {
        this.showError(`Failed to copy path: ${err.message}`);
      } finally {
        document.body.removeChild(textArea);
      }
    }
  }
  
  async performPaste() {
    if (!this.clipboard || this.clipboard.length === 0) return;
    
    try {
      // The copy/move endpoint expects the target collection, not a full path
      // Files will be copied/moved with their original names to the target collection
      const targetCollection = this.currentPath;
      
      // Handle both single item (backwards compatibility) and array of items
      const itemsToPaste = Array.isArray(this.clipboard) ? this.clipboard : [this.clipboard];
      const pathsToPaste = itemsToPaste.map(item => item.path);
      
      // Use move if clipboard mode is 'cut', otherwise copy
      if (this.clipboardMode === 'cut') {
        await this.moveItems(pathsToPaste, targetCollection);
      } else {
        await this.copyItems(pathsToPaste, targetCollection);
      }
      
      // Clear cache and loaded ranges to force fresh load
      this.cache.delete(targetCollection);
      this.loadedRanges = [];
      this.items = [];
      
      await this.loadCollection(targetCollection, false);
      
      const count = itemsToPaste.length;
      const names = itemsToPaste.map(item => item.name).join(', ');
      const action = this.clipboardMode === 'cut' ? 'Moved' : 'Pasted';
      this.showMessage(`${action} ${count} item(s): ${names.substring(0, 50)}${names.length > 50 ? '...' : ''}`);
      
      // Clear clipboard after paste (especially for cut operations)
      this.clipboard = null;
      this.clipboardMode = 'copy';
      this.updatePasteButton();
    } catch (error) {
      console.error('Paste error:', error);
      this.showError(`Failed to paste item(s): ${error.message}`);
    }
  }
  
  async performDelete() {
    if (this.selectedItems.size === 0) return;
    
    // Create a copy of selected items immediately to prevent any clearing
    const itemsToDelete = Array.from(this.selectedItems);
    
    const confirmMessage = `Are you sure you want to delete ${itemsToDelete.length} item(s)?`;
    
    const confirmed = await this.showConfirmation(confirmMessage, 'error');
    if (!confirmed) return;
    
    const loadingEl = this.shadowRoot.querySelector('.loading');
    loadingEl.style.display = 'flex';
    
    try {
      const deletePath = this.currentPath;
      
      // Delete all items in a single request
      await this.deleteItems(itemsToDelete);
      
      // Clear cache and loaded ranges to force fresh load
      this.cache.delete(deletePath);
      this.loadedRanges = [];
      this.items = [];
      
      // Refresh collection
      await this.loadCollection(deletePath, false);
      this.selectedItems.clear();
      this.showMessage(`Deleted ${itemsToDelete.length} item(s)`);
    } catch (error) {
      console.error('Delete error:', error);
      this.showError(`Failed to delete item(s): ${error.message}`);
    } finally {
      loadingEl.style.display = 'none';
    }
  }
  
  async performRename(path) {
    const item = this.items.find(i => (i.path || i.name) === path);
    if (!item) return;
    
    const currentName = item.name || path.split('/').pop();
    const newName = await this.showPrompt('Enter new name:', currentName, 'info');
    
    if (!newName || newName === currentName) return;
    
    try {
      await this.renameItem(path, newName);
      await this.loadCollection(this.currentPath);
      this.showMessage(`Renamed to: ${newName}`);
    } catch (error) {
      console.error('Rename error:', error);
    }
  }
  
  // Context Menu
  showContextMenu(x, y, item) {
    const contextMenu = this.shadowRoot.querySelector('.context-menu');
    contextMenu.style.display = 'block';
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    
    const path = item.path || item.name;
    const isSelected = this.selectedItems.has(path);
    
    contextMenu.innerHTML = `
      <div class="context-menu-item" data-action="open" ${item.type === 'collection' ? '' : 'style="display: none;"'}>
        <svg width="16" height="16" fill="currentColor"><use href="#icon-folder"></use></svg>
        Open
      </div>
      <div class="context-menu-item" data-action="copy">
        <svg width="16" height="16" fill="currentColor"><use href="#icon-copy"></use></svg>
        Copy
      </div>
      <div class="context-menu-item" data-action="cut">
        <svg width="16" height="16" fill="currentColor"><use href="#icon-copy"></use></svg>
        Cut
      </div>
      <div class="context-menu-item" data-action="copy-path">
        <svg width="16" height="16" fill="currentColor"><use href="#icon-copy-path"></use></svg>
        Copy Relative Path
      </div>
      <div class="context-menu-item" data-action="paste" ${this.clipboard ? '' : 'style="display: none;"'}>
        <svg width="16" height="16" fill="currentColor"><use href="#icon-clipboard"></use></svg>
        Paste
      </div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item" data-action="rename">
        <svg width="16" height="16" fill="currentColor"><use href="#icon-rename"></use></svg>
        Rename
      </div>
      <div class="context-menu-item" data-action="delete">
        <svg width="16" height="16" fill="currentColor"><use href="#icon-delete"></use></svg>
        Delete
      </div>
    `;
    
    // Attach event listeners
    contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = item.dataset.action;
        this.handleContextMenuAction(action, path, item);
        this.hideContextMenu();
      });
    });
    
    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', () => this.hideContextMenu(), { once: true });
    }, 0);
  }
  
  hideContextMenu() {
    const contextMenu = this.shadowRoot.querySelector('.context-menu');
    contextMenu.style.display = 'none';
  }
  
  handleContextMenuAction(action, path, item) {
    switch (action) {
      case 'open':
        this.navigateTo(path);
        break;
      case 'copy':
        // If the right-clicked item is not selected, select only it
        if (!this.selectedItems.has(path)) {
          this.selectedItems.clear();
          this.selectedItems.add(path);
          this.renderGrid();
        }
        this.performCopy();
        break;
      case 'cut':
        // If the right-clicked item is not selected, select only it
        if (!this.selectedItems.has(path)) {
          this.selectedItems.clear();
          this.selectedItems.add(path);
          this.renderGrid();
        }
        this.performCut();
        break;
      case 'copy-path':
        this.copyPathToClipboard(path);
        break;
      case 'paste':
        this.performPaste();
        break;
      case 'rename':
        // If the right-clicked item is not selected, select only it
        if (!this.selectedItems.has(path)) {
          this.selectedItems.clear();
          this.selectedItems.add(path);
          this.renderGrid();
        }
        this.performRename(path);
        break;
      case 'delete':
        // If the right-clicked item is not selected, select only it
        // Otherwise, keep all selected items for bulk delete
        if (!this.selectedItems.has(path)) {
          this.selectedItems.clear();
          this.selectedItems.add(path);
          this.renderGrid();
        }
        // performDelete will use all selected items
        this.performDelete();
        break;
    }
  }
  
  // Utility Methods
  showError(message) {
    this.showMessage(message, 'error');
  }
  
  showMessage(message, type = 'info') {
    
    const messageFooter = this.shadowRoot.querySelector('.message-footer');
    const messageText = this.shadowRoot.querySelector('.message-text');
    const messageInput = this.shadowRoot.querySelector('.message-input');
    const confirmBtn = this.shadowRoot.querySelector('.message-confirm-btn');
    const cancelBtn = this.shadowRoot.querySelector('.message-cancel-btn');
    const closeBtn = this.shadowRoot.querySelector('.message-close');
    
    if (!messageFooter || !messageText) {
      // Fallback to alert if elements don't exist
      alert(message);
      return;
    }
    
    // Hide confirmation buttons and input for regular messages
    if (confirmBtn) confirmBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (messageInput) messageInput.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'block';
    
    // Set message text
    messageText.textContent = message;
    
    // Set message type class
    messageFooter.className = `message-footer message-${type}`;
    
    // Show the footer
    messageFooter.style.display = 'flex';
    
    // Auto-hide after 5 seconds (10 seconds for errors)
    const hideDelay = type === 'error' ? 10000 : 5000;
    
    // Clear any existing timeout
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }
    
    this.messageTimeout = setTimeout(() => {
      this.hideMessage();
    }, hideDelay);
  }
  
  showConfirmation(message, type = 'info') {
    return new Promise((resolve) => {
      const messageFooter = this.shadowRoot.querySelector('.message-footer');
      const messageText = this.shadowRoot.querySelector('.message-text');
      const messageInput = this.shadowRoot.querySelector('.message-input');
      const confirmBtn = this.shadowRoot.querySelector('.message-confirm-btn');
      const cancelBtn = this.shadowRoot.querySelector('.message-cancel-btn');
      const closeBtn = this.shadowRoot.querySelector('.message-close');
      
      if (!messageFooter || !messageText || !confirmBtn || !cancelBtn) {
        // Fallback to browser confirm if elements don't exist
        const result = confirm(message);
        resolve(result);
        return;
      }
      
      // Hide input field for confirmation
      if (messageInput) messageInput.style.display = 'none';
      
      // Show confirmation buttons, hide close button
      confirmBtn.style.display = 'block';
      cancelBtn.style.display = 'block';
      closeBtn.style.display = 'none';
      
      // Set message text
      messageText.textContent = message;
      
      // Update classes based on type
      messageFooter.className = `message-footer message-${type}`;
      
      // Show the footer
      messageFooter.style.display = 'flex';
      
      // Clear any existing timeout
      if (this.messageTimeout) {
        clearTimeout(this.messageTimeout);
        this.messageTimeout = null;
      }
      
      // Clean up function
      const cleanup = () => {
        messageFooter.style.display = 'none';
        confirmBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        closeBtn.style.display = 'block';
        // Remove event listeners
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
      };
      
      // Set up event handlers
      confirmBtn.onclick = () => {
        cleanup();
        resolve(true);
      };
      
      cancelBtn.onclick = () => {
        cleanup();
        resolve(false);
      };
    });
  }
  
  showPrompt(message, defaultValue = '', type = 'info') {
    return new Promise((resolve) => {
      const messageFooter = this.shadowRoot.querySelector('.message-footer');
      const messageText = this.shadowRoot.querySelector('.message-text');
      const messageInput = this.shadowRoot.querySelector('.message-input');
      const confirmBtn = this.shadowRoot.querySelector('.message-confirm-btn');
      const cancelBtn = this.shadowRoot.querySelector('.message-cancel-btn');
      const closeBtn = this.shadowRoot.querySelector('.message-close');
      
      if (!messageFooter || !messageText || !messageInput || !confirmBtn || !cancelBtn) {
        // Fallback to browser prompt if elements don't exist
        const result = prompt(message, defaultValue);
        resolve(result);
        return;
      }
      
      // Show input field and buttons, hide close button
      messageInput.style.display = 'block';
      confirmBtn.style.display = 'block';
      cancelBtn.style.display = 'block';
      closeBtn.style.display = 'none';
      
      // Set message text and input value
      messageText.textContent = message;
      messageInput.value = defaultValue;
      
      // Update classes based on type
      messageFooter.className = `message-footer message-${type}`;
      
      // Show the footer
      messageFooter.style.display = 'flex';
      
      // Focus and select input text
      setTimeout(() => {
        messageInput.focus();
        messageInput.select();
      }, 0);
      
      // Clear any existing timeout
      if (this.messageTimeout) {
        clearTimeout(this.messageTimeout);
        this.messageTimeout = null;
      }
      
      // Clean up function
      const cleanup = () => {
        messageFooter.style.display = 'none';
        messageInput.style.display = 'none';
        confirmBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        closeBtn.style.display = 'block';
        // Remove event listeners
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        messageInput.onkeydown = null;
      };
      
      // Handle Enter key in input
      messageInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const value = messageInput.value.trim();
          cleanup();
          resolve(value || null);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cleanup();
          resolve(null);
        }
      };
      
      // Set up event handlers
      confirmBtn.onclick = () => {
        const value = messageInput.value.trim();
        cleanup();
        resolve(value || null);
      };
      
      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };
    });
  }
  
  hideMessage() {
    const messageFooter = this.shadowRoot.querySelector('.message-footer');
    if (messageFooter) {
      messageFooter.style.display = 'none';
    }
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
      this.messageTimeout = null;
    }
  }
}

customElements.define('jinks-file-manager', FileManager);

