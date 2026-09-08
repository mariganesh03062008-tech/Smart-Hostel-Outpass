/**
 * ============================================================================
 * MOCK FINGERPRINT ADAPTER (DEVELOPMENT / TEST BENCH)
 * ============================================================================
 * Simulates biometric hardware operations while the exact physical Mantra
 * scanner model is pending identification and driver installation.
 * 
 * Directives:
 * - Marked explicitly as DEVELOPMENT ONLY.
 * - Produces cryptographically structured biometric references without raw scans.
 * - Allows deterministic simulation of both MATCH and NO-MATCH verification paths.
 */

const crypto = require('crypto');
const FingerprintAdapter = require('./fingerprintAdapter');

class MockFingerprintAdapter extends FingerprintAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'MockFingerprintAdapter';
    this.mode = 'mock';
    this.isInitialized = true;
    this.deviceStatus = 'READY';
  }

  async initializeScanner(options = {}) {
    this.isInitialized = true;
    this.deviceStatus = 'READY';
    return {
      success: true,
      mode: 'DEVELOPMENT_MOCK_MODE',
      message: 'Mock biometric scanner initialized successfully for development.',
      deviceInfo: await this.getDeviceInfo()
    };
  }

  async isScannerConnected() {
    return {
      connected: true,
      status: this.deviceStatus,
      mode: 'DEVELOPMENT_MOCK_MODE',
      message: 'Simulated biometric scanner is online and ready for scanning.'
    };
  }

  async getDeviceInfo() {
    return {
      vendor: 'Mantra Sophisticated Biometrics (Simulated/Mock)',
      model: 'MANTRA-GENERIC-DEV-MOCK',
      firmwareVersion: '1.0.0-mock',
      driverStatus: 'DEV_SIMULATION_ACTIVE',
      supportedModes: ['REGISTRATION', 'VERIFICATION', 'MATCH_SIMULATION', 'NO_MATCH_SIMULATION']
    };
  }

  /**
   * Simulates enrolling a new parent fingerprint.
   * Generates a non-reversible cryptographic reference token.
   */
  async registerFingerprint(params = {}) {
    const parentId = params.parentId || 'GUEST';
    const timestamp = Date.now();
    const entropy = crypto.randomBytes(16).toString('hex');
    
    // Non-reversible reference hash representing enrolled template in local secure store
    const biometricReference = `MOCK_BIO_REF_${parentId}_${crypto.createHash('sha256').update(`${parentId}_${timestamp}_${entropy}`).digest('hex').slice(0, 24).toUpperCase()}`;

    return {
      success: true,
      mode: 'DEVELOPMENT_MOCK_MODE',
      biometricReference,
      quality: 96,
      registeredAt: new Date().toISOString(),
      message: 'Fingerprint enrolled successfully in development mock mode.'
    };
  }

  /**
   * Simulates fingerprint verification.
   * Allows testing MATCH (default) and NO-MATCH scenarios.
   */
  async verifyFingerprint(storedReference, params = {}) {
    if (!storedReference) {
      return {
        success: false,
        match: false,
        confidenceScore: 0,
        mode: 'DEVELOPMENT_MOCK_MODE',
        message: 'No registered biometric reference found for this parent.'
      };
    }

    // Check if simulation explicitly requested a mismatch / failure
    const simulateMatch = params.simulateMatch !== false && params.simulation !== 'no_match';

    if (simulateMatch) {
      return {
        success: true,
        match: true,
        confidenceScore: 98.4,
        mode: 'DEVELOPMENT_MOCK_MODE',
        verifiedAt: new Date().toISOString(),
        message: 'Fingerprint biometric match verified successfully.'
      };
    } else {
      return {
        success: true,
        match: false,
        confidenceScore: 18.2,
        mode: 'DEVELOPMENT_MOCK_MODE',
        verifiedAt: new Date().toISOString(),
        message: 'Biometric verification failed: Fingerprint does not match registered parent template.'
      };
    }
  }

  async disconnectScanner() {
    this.deviceStatus = 'DISCONNECTED';
    return { success: true, message: 'Mock scanner disconnected.' };
  }
}

module.exports = MockFingerprintAdapter;
