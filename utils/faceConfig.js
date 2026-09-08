/**
 * Centralized Parent Face Biometric Verification Configuration & Mathematics
 * Configurable via environment variables without hardcoding.
 */

const FACE_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD) || 0.45;
const FACE_VECTOR_DIMENSIONS = 128;
const FACE_LIVENESS_FRAMES = Number(process.env.FACE_LIVENESS_FRAMES) || 3;

/**
 * Validates whether a descriptor is a valid 128-dimensional floating point array.
 * @param {Array|Float32Array} desc 
 * @returns {boolean}
 */
function validateDescriptorFormat(desc) {
  if (!Array.isArray(desc) && !(desc instanceof Float32Array)) {
    return false;
  }
  if (desc.length !== FACE_VECTOR_DIMENSIONS) {
    return false;
  }
  for (let i = 0; i < desc.length; i++) {
    if (desc[i] === null || desc[i] === undefined || typeof desc[i] === 'boolean') {
      return false;
    }
    const val = Number(desc[i]);
    if (isNaN(val) || !isFinite(val)) {
      return false;
    }
  }
  return true;
}

/**
 * Calculates the Euclidean distance between two 128D face descriptor vectors.
 * D = sqrt( sum( (A_i - B_i)^2 ) )
 * Standard face recognition metric:
 * - D <= 0.45 -> Strong Match (Same Person)
 * - D > 0.45  -> Mismatch (Different Person)
 * @param {Array<number>} vecA 
 * @param {Array<number>} vecB 
 * @returns {number} Distance rounded to 4 decimals
 */
function calculateEuclideanDistance(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    throw new Error('Face descriptor vectors must be non-null and equal length (128 dimensions).');
  }

  let sum = 0;
  for (let i = 0; i < vecA.length; i++) {
    const diff = Number(vecA[i]) - Number(vecB[i]);
    sum += diff * diff;
  }
  return Number(Math.sqrt(sum).toFixed(4));
}

/**
 * Calculates Cosine Similarity between two normalized face vectors.
 * S = (A · B) / (||A|| * ||B||)
 * @param {Array<number>} vecA 
 * @param {Array<number>} vecB 
 * @returns {number} Similarity score between -1.0 and 1.0
 */
function calculateCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    throw new Error('Face descriptor vectors must be non-null and equal length.');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    const a = Number(vecA[i]);
    const b = Number(vecB[i]);
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return Number((dotProduct / denominator).toFixed(4));
}

/**
 * Authoritatively verifies whether a live face descriptor matches the registered template.
 * @param {Array<number>} registeredDescriptor 
 * @param {Array<number>} liveDescriptor 
 * @param {number} [customThreshold] 
 * @returns {{ match: boolean, distance: number, similarity: number, threshold: number }}
 */
function verifyFaceMatch(registeredDescriptor, liveDescriptor, customThreshold = FACE_MATCH_THRESHOLD) {
  if (!validateDescriptorFormat(registeredDescriptor)) {
    throw new Error('Invalid registered face descriptor format. Expected 128 finite floats.');
  }
  if (!validateDescriptorFormat(liveDescriptor)) {
    throw new Error('Invalid live face descriptor format. Expected 128 finite floats.');
  }

  const distance = calculateEuclideanDistance(registeredDescriptor, liveDescriptor);
  const similarity = calculateCosineSimilarity(registeredDescriptor, liveDescriptor);
  const threshold = Number(customThreshold) || FACE_MATCH_THRESHOLD;
  const match = distance <= threshold;

  return {
    match,
    distance,
    similarity,
    threshold
  };
}

module.exports = {
  FACE_MATCH_THRESHOLD,
  FACE_VECTOR_DIMENSIONS,
  FACE_LIVENESS_FRAMES,
  validateDescriptorFormat,
  calculateEuclideanDistance,
  calculateCosineSimilarity,
  verifyFaceMatch
};
