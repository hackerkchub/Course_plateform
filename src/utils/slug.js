/**
 * Slug generation and validation utility
 * Aligns with Section 19.3 of Course Platform Backend Plan:
 * "slug lowercase, hyphen, sirf a-z 0-9"
 */

function generateSlug(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')    // Remove non-alphanumeric except space and hyphen
    .replace(/[\s_-]+/g, '-')    // Replace spaces and underscores with single hyphen
    .replace(/^-+|-+$/g, '');    // Trim leading/trailing hyphens
}

function isValidSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  // lower case, alphanumeric and hyphens, no double hyphens, no leading/trailing hyphens
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export {
  generateSlug,
  isValidSlug,
};

