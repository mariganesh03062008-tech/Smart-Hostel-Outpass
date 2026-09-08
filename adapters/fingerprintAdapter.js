/**
 * ============================================================================
 * FINGERPRINT ADAPTER INTERFACE
 * ============================================================================
 * Abstract Base Adapter Interface for Biometric Fingerprint Hardware.
 * 
 * Hardware-independent design:
 * When a specific Mantra scanner model (e.g. MFS100, MFS110, MFS500, etc.)
 * or official Mantra Web/RD Service is connected in the future,
 * a concrete adapter extending this class implements the physical device calls.
 * 
 * Security Directives:
 * - NEVER store raw biometric scan images.
 * - NEVER return raw biometric templates or images to frontend clients.
 * - All biometric references must be non-reversible, cryptographically secure tokens.
 */

class FingerprintAdapter {
  constructor(config = {}) {
    this.config = config;
    this.name = 'BaseFingerprintAdapter';
    this.mode = 'abstract';
  }

  /**
   * Initializes the fingerprint scanner hardware / driver service.
   * @param {Object} [options]
   * @returns {Promise<{ success: boolean, message: string, deviceInfo?: Object }>}
   */
  async initializeScanner(options = {}) {
    throw new Error('initializeScanner() must be implemented by concrete FingerprintAdapter subclass.');
  }

  /**
   * Checks whether the physical/simulated biometric sensor is connected and ready.
   * @returns {Promise<{ connected: boolean, status: string, message: string }>}
   */
  async isScannerConnected() {
    throw new Error('isScannerConnected() must be implemented by concrete FingerprintAdapter subclass.');
  }

  /**
   * Retrieves scanner device metadata (Vendor, Model, Driver version).
   * @returns {Promise<Object>}
   */
  async getDeviceInfo() {
    throw new Error('getDeviceInfo() must be implemented by concrete FingerprintAdapter subclass.');
  }

  /**
   * Captures a fingerprint and enrolls a secure non-reversible biometric reference.
   * @param {Object} params - { parentId, qualityThreshold, timeoutMs, simulation }
   * @returns {Promise<{ success: boolean, biometricReference: string, quality: number, message: string }>}
   */
  async registerFingerprint(params = {}) {
    throw new Error('registerFingerprint() must be implemented by concrete FingerprintAdapter subclass.');
  }

  /**
   * Captures a live fingerprint and verifies against the stored parent reference.
   * @param {string} storedReference - Previously enrolled reference token
   * @param {Object} params - { parentId, timeoutMs, simulation }
   * @returns {Promise<{ success: boolean, match: boolean, confidenceScore: number, message: string }>}
   */
  async verifyFingerprint(storedReference, params = {}) {
    throw new Error('verifyFingerprint() must be implemented by concrete FingerprintAdapter subclass.');
  }

  /**
   * Safely releases device handles / disconnects local scanner service.
   * @returns {Promise<void>}
   */
  async disconnectScanner() {
    throw new Error('disconnectScanner() must be implemented by concrete FingerprintAdapter subclass.');
  }
}

module.exports = FingerprintAdapter;
