// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2025 e-editiones.org

// Mime-type to file type mapping
export const MIME_TYPE_MAP = {
  // Images
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/svg+xml': 'image',
  'image/webp': 'image',
  'image/bmp': 'image',
  'image/x-icon': 'image',
  'image/vnd.microsoft.icon': 'image',
  'image/tiff': 'image',
  'image/tif': 'image',
  // XML
  'application/xml': 'xml',
  'text/xml': 'xml',
  'application/xml-external-parsed-entity': 'xml',
  'application/xml-dtd': 'xml',
  // XQuery
  'application/xquery': 'xquery',
  // JSON
  'application/json': 'json',
  'text/json': 'json',
  'application/json-patch+json': 'json',
  'application/vnd.api+json': 'json',
  // Javascript
  'application/javascript': 'javascript',
  'text/javascript': 'javascript',
  'application/ecmascript': 'javascript',
  'text/ecmascript': 'javascript',
  // CSS
  'text/css': 'css',
  // HTML
  'text/html': 'html',
  'application/xhtml+xml': 'html',
  'application/xml+xhtml': 'html',
  'application/xml-xhtml': 'html',
  'application/xml-xhtml+xml': 'html',
  'application/xml-xhtml+xml': 'html'
};

// File extension to file type mapping (fallback)
export const EXTENSION_MAP = {
  // Images
  'jpg': 'image',
  'jpeg': 'image',
  'png': 'image',
  'gif': 'image',
  'svg': 'image',
  'webp': 'image',
  'bmp': 'image',
  'ico': 'image',
  'tiff': 'image',
  'tif': 'image',
  // XML
  'xml': 'xml',
  // JSON
  'json': 'json',
  // CSS
  'css': 'css',
  'sass': 'css',
  'html': 'html',
  'xquery': 'xquery',
  'xql': 'xquery',
  'xqm': 'xquery',
  'xq': 'xquery',
  'js': 'javascript',
  'ts': 'javascript'
};

/**
 * Get the file type for an item based on mime-type or file extension
 * @param {Object} item - The item object
 * @returns {string|null} - The file type ('image', 'xml', etc.) or null if not recognized
 */
export function getFileType(item) {
  if (item.type === 'collection') return null;
  
  // Check mime-type first (from API)
  // API may return it as 'mime', 'mime-type', or 'mimeType'
  const mimeType = item.mime || item['mime-type'] || item.mimeType;
  if (mimeType) {
    const normalizedMimeType = mimeType.toLowerCase().split(';')[0].trim(); // Remove parameters like charset
    if (MIME_TYPE_MAP[normalizedMimeType]) {
      return MIME_TYPE_MAP[normalizedMimeType];
    }
    // Also check if mime-type contains keywords (for partial matches)
    if (normalizedMimeType.includes('xml')) {
      return 'xml';
    }
    if (normalizedMimeType.includes('json')) {
      return 'json';
    }
    if (normalizedMimeType.includes('css')) {
      return 'css';
    }
    if (normalizedMimeType.startsWith('image/')) {
      return 'image';
    }
  }
  
  // Fall back to file extension
  const name = item.name || item.path?.split('/').pop() || '';
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext && EXTENSION_MAP[ext]) {
    return EXTENSION_MAP[ext];
  }
  
  return null;
}

/**
 * Check if an item is an image file
 * @param {Object} item - The item object
 * @returns {boolean} - True if the item is an image file
 */
export function isImageFile(item) {
  return getFileType(item) === 'image';
}

