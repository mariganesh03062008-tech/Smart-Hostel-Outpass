/**
 * Canonical Outpass Type Normalization Utility
 * Standardizes outpass types across backend controllers and database representations
 */

/**
 * Normalizes any raw outpass type string to one of the 4 canonical types:
 * - 'normal'
 * - 'one_day_duty'
 * - 'emergency'
 * - 'special'
 *
 * @param {string} rawType
 * @returns {'normal' | 'one_day_duty' | 'emergency' | 'special'}
 */
function normalizeOutpassType(rawType) {
  if (!rawType || typeof rawType !== 'string') return 'normal';
  const t = rawType.toLowerCase().trim();

  if (t === 'emergency') {
    return 'emergency';
  }

  if (t === 'special') {
    return 'special';
  }

  if (t === 'one_day_duty' || t === 'duty' || t === 'one_day' || t === 'one-day') {
    return 'one_day_duty';
  }

  return 'normal';
}

/**
 * Returns human-readable label for the canonical outpass type
 * @param {string} rawType
 * @returns {string}
 */
function getOutpassTypeDisplayLabel(rawType) {
  const canonical = normalizeOutpassType(rawType);
  switch (canonical) {
    case 'emergency':
      return 'Emergency Outpass';
    case 'special':
      return 'Special Outpass';
    case 'one_day_duty':
      return 'One-Day Duty';
    case 'normal':
    default:
      return 'Normal Outpass';
  }
}

module.exports = {
  normalizeOutpassType,
  getOutpassTypeDisplayLabel
};
