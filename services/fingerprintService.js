/**
 * ============================================================================
 * FINGERPRINT BUSINESS SERVICE
 * ============================================================================
 * Hardware-independent service orchestrating parent biometric enrollment,
 * device connectivity, and verification workflows.
 * 
 * Directives & Security:
 * - Decouples the application layer and Parent Module from physical hardware models.
 * - Manages adapter switching via environment configuration (FINGERPRINT_MODE=mock|mantra).
 * - Enforces zero raw image/scan storage.
 * - Isolates parent authorization tokens so Parent A cannot approve Parent B's requests.
 */

const { pool } = require('../utils/db');
const MockFingerprintAdapter = require('../adapters/mockFingerprintAdapter');
const MantraFingerprintAdapter = require('../adapters/mantraFingerprintAdapter');

class FingerprintService {
  constructor() {
    this.initAdapter();
    // Cache for active biometric authorization sessions: parentId -> { verified, verifiedAt, parentId, authToken }
    this.activeVerificationSessions = new Map();
    // Maximum validity for a single verification session (15 minutes)
    this.sessionTtlMs = 15 * 60 * 1000;
  }

  /**
   * Initializes or hot-reloads the active adapter based on FINGERPRINT_MODE env variable.
   */
  initAdapter() {
    const rawMode = (process.env.FINGERPRINT_MODE || 'mock').toLowerCase().trim();
    if (rawMode === 'mantra') {
      this.adapter = new MantraFingerprintAdapter();
      this.mode = 'mantra';
    } else {
      this.adapter = new MockFingerprintAdapter();
      this.mode = 'mock';
    }
  }

  /**
   * Returns current scanner connectivity and operational mode.
   */
  async getScannerStatus() {
    try {
      const status = await this.adapter.isScannerConnected();
      const devInfo = await this.adapter.getDeviceInfo();
      return {
        success: true,
        mode: this.mode,
        isDevelopmentMock: this.mode === 'mock',
        connected: status.connected,
        status: status.status,
        message: status.message,
        deviceInfo: {
          vendor: devInfo.vendor,
          model: devInfo.model,
          driverStatus: devInfo.driverStatus
        }
      };
    } catch (err) {
      return {
        success: false,
        mode: this.mode,
        isDevelopmentMock: this.mode === 'mock',
        connected: false,
        status: 'ERROR',
        message: err.message
      };
    }
  }

  /**
   * Enrolls a parent's fingerprint securely in the database.
   * @param {number|string} parentId
   * @param {Object} [options]
   */
  async registerParentFingerprint(parentId, options = {}) {
    if (!parentId) {
      throw new Error('Parent ID is required for biometric registration.');
    }

    // 1. Verify parent exists in database
    const [parents] = await pool.query('SELECT id, primary_phone FROM parents WHERE id = ?', [parentId]);
    if (parents.length === 0) {
      throw new Error('Parent record not found in database.');
    }

    // 2. Delegate capture & token generation to active hardware adapter
    const enrollment = await this.adapter.registerFingerprint({
      parentId,
      qualityThreshold: options.qualityThreshold || 80,
      ...options
    });

    if (!enrollment.success || !enrollment.biometricReference) {
      throw new Error(enrollment.message || 'Fingerprint registration failed at hardware level.');
    }

    const now = new Date();

    // 3. Store secure reference in MySQL parents table
    await pool.query(`
      UPDATE parents
      SET 
        fingerprint_registered = 1,
        fingerprint_reference = ?,
        fingerprint_registered_at = ?,
        fingerprint_template_id = ?
      WHERE id = ?
    `, [enrollment.biometricReference, now, enrollment.biometricReference, parentId]);

    return {
      success: true,
      mode: this.mode,
      isDevelopmentMock: this.mode === 'mock',
      fingerprintRegistered: true,
      registeredAt: now.toISOString(),
      qualityScore: enrollment.quality || 95,
      message: 'Fingerprint registered successfully and enrolled for biometric consent.'
    };
  }

  /**
   * Verifies live biometric scan against the registered parent reference.
   * @param {number|string} parentId
   * @param {Object} [options] - { simulation_match, simulateMatch, simulation }
   */
  async verifyParentFingerprint(parentId, options = {}) {
    if (!parentId) {
      throw new Error('Parent ID is required for biometric verification.');
    }

    // 1. Retrieve enrolled reference for this parent from MySQL
    const [parents] = await pool.query(
      'SELECT id, fingerprint_registered, fingerprint_reference, fingerprint_template_id FROM parents WHERE id = ?',
      [parentId]
    );

    if (parents.length === 0) {
      throw new Error('Parent record not found in database.');
    }

    const parent = parents[0];
    const registeredReference = parent.fingerprint_reference || parent.fingerprint_template_id;

    if (!parent.fingerprint_registered && !registeredReference) {
      return {
        success: false,
        match: false,
        mode: this.mode,
        isDevelopmentMock: this.mode === 'mock',
        message: 'No fingerprint registered for this account. Please complete fingerprint registration first.'
      };
    }

    // 2. Delegate match to active hardware adapter
    const verifyResult = await this.adapter.verifyFingerprint(registeredReference, {
      parentId,
      simulateMatch: options.simulation_match !== false && options.simulateMatch !== false && options.simulation !== 'no_match',
      ...options
    });

    const now = new Date();

    if (verifyResult.success && verifyResult.match) {
      const authToken = `BIO-AUTH-${parentId}-${Date.now()}`;
      this.activeVerificationSessions.set(Number(parentId), {
        verified: true,
        verifiedAt: now,
        parentId: Number(parentId),
        authToken
      });

      return {
        success: true,
        match: true,
        mode: this.mode,
        isDevelopmentMock: this.mode === 'mock',
        confidenceScore: verifyResult.confidenceScore || 98.4,
        verifiedAt: now.toISOString(),
        authToken,
        message: 'Fingerprint Verified Successfully'
      };
    } else {
      // Invalidate existing session on failure
      this.activeVerificationSessions.delete(Number(parentId));

      return {
        success: true,
        match: false,
        mode: this.mode,
        isDevelopmentMock: this.mode === 'mock',
        confidenceScore: verifyResult.confidenceScore || 15.0,
        message: 'Fingerprint Verification Failed'
      };
    }
  }

  /**
   * Checks if parent has an active valid biometric verification session.
   * @param {number|string} parentId
   * @returns {boolean}
   */
  hasValidBiometricSession(parentId) {
    if (!parentId) return false;
    const session = this.activeVerificationSessions.get(Number(parentId));
    if (!session || !session.verified) return false;

    // Check TTL
    const elapsed = Date.now() - new Date(session.verifiedAt).getTime();
    if (elapsed > this.sessionTtlMs) {
      this.activeVerificationSessions.delete(Number(parentId));
      return false;
    }

    return true;
  }

  /**
   * Consumes/clears biometric session upon approval submission.
   * @param {number|string} parentId
   */
  consumeBiometricSession(parentId) {
    if (parentId) {
      this.activeVerificationSessions.delete(Number(parentId));
    }
  }
}

// Export singleton instance
const fingerprintService = new FingerprintService();
module.exports = fingerprintService;
