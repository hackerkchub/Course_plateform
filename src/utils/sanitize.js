/**
 * HTML Sanitizer Utility
 * Aligns with Section 9.3 of Course Platform Backend Plan:
 * "description: string (HTML) - Sanitize karo (script tags hatao)"
 */

export function sanitizeHtml(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') {
    return '';
  }

  let sanitized = htmlString;

  // 1. Remove script tags and their content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // 2. Remove iframe, object, embed, applet tags and their content
  sanitized = sanitized.replace(/<(?:iframe|object|embed|applet)\b[^<]*(?:(?!<\/(?:iframe|object|embed|applet)>)<[^<]*)*<\/(?:iframe|object|embed|applet)>/gi, '');
  sanitized = sanitized.replace(/<(?:iframe|object|embed|applet)[^>]*\/?>/gi, '');

  // 3. Remove inline javascript: and vbscript: URIs in attributes
  sanitized = sanitized.replace(/(href|src|action|data)\s*=\s*['"]\s*(?:javascript|vbscript):[^'"]*['"]/gi, '$1="#"');

  // 4. Remove inline event handlers (onclick, onerror, onload, onmouseover, etc.)
  sanitized = sanitized.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

  return sanitized.trim();
}

export default {
  sanitizeHtml,
};
