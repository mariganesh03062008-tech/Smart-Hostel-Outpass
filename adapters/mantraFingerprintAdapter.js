/**
 * ============================================================================
 * MANTRA FINGERPRINT HARDWARE ADAPTER (PLUG-AND-PLAY STUB)
 * ============================================================================
 * Hardware-independent adapter stub prepared for physical Mantra biometric devices.
 * 
 * Future Integration Guide:
 * When the physical Mantra scanner model is identified (e.g. MFS100 / MFS110 / MFS500 / etc.):
 * 1. Install the official Mantra driver & Mantra RD/Client Service on the host.
 * 2. Set FINGERPRINT_MODE=mantra in .env.
 * 3. Point this adapter to the Mantra local service endpoint (default: http://localhost:11100 or native SDK).
 * 4. This adapter handles capturing the encrypted PID/template and matching without modifying any Parent Module UI.
 */

const FingerprintAdapter = require('./fingerprintAdapter');

class MantraFingerprintAdapter extends FingerprintAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'MantraFingerprintAdapter';
    this.mode = 'mantra';
    this.serviceUrl = config.serviceUrl || process.env.MANTRA_SERVICE_URL || 'http://localhost:11100';
    this.modelName = config.modelName || process.env.MANTRA_MODEL || 'MANTRA_AUTO_DETECT';
    this.isInitialized = false;
  }

  async initializeScanner(options = {}) {
    // Integration point: Connect to local Mantra service or load Native SDK
    return {
      success: true,
      mode: 'MANTRA_PRODUCTION_STUB',
      message: 'Mantra hardware adapter ready for physical device connection.',
      serviceUrl: this.serviceUrl,
      targetModel: this.modelName
    };
  }

  async isScannerConnected() {
    // Integration point: Call Mantra device detection API (e.g., /rd/info or SDK.IsDeviceConnected())
    return {
      connected: false,
      status: 'AWAITING_PHYSICAL_DEVICE',
      mode: 'MANTRA_PRODUCTION_STUB',
      message: 'Physical Mantra scanner awaiting hardware identification and driver connection.'
    };
  }

  async getDeviceInfo() {
    return {
      vendor: 'Mantra Softech India Pvt Ltd',
      model: this.modelName,
      driverStatus: 'AWAITING_MODEL_SDK',
      serviceUrl: this.serviceUrl,
      integrationType: 'HTTP_RD_SERVICE / NATIVE_SDK'
    };
  }

  async registerFingerprint(params = {}) {
    // Integration point: Invoke Mantra Capture / Enroll API
    throw new Error(
      'Physical Mantra scanner model is not yet connected. Please run in mock mode (FINGERPRINT_MODE=mock) or connect physical Mantra device and driver.'
    );
  }

  async verifyFingerprint(storedReference, params = {}) {
    // Integration point: Invoke Mantra Match API / SDK.MatchTemplate()
    throw new Error(
      'Physical Mantra scanner model is not yet connected. Please run in mock mode (FINGERPRINT_MODE=mock) or connect physical Mantra device and driver.'
    );
  }

  async disconnectScanner() {
    this.isInitialized = false;
    return { success: true, message: 'Mantra scanner disconnected.' };
  }
}

module.exports = MantraFingerprintAdapter;
