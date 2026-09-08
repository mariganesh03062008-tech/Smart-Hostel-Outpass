/**
 * Smart Hostel Outpass Management System
 * Advance Request Time Validation Utility
 *
 * Rules:
 * 1. Normal Outpass: Submitted at least 18 hours before departure.
 * 2. One-Day Outpass / Duty: Submitted at least 12 hours before departure.
 *
 * Evaluation:
 *   required_submit_time = departure_time - required_hours
 *   Allowed ONLY when: current_time <= required_submit_time
 *   If current_time > required_submit_time -> Blocked (ADVANCE_TIME_LIMIT)
 */

function parseDateTime(input) {
  if (!input) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === 'string') {
    // Clean spaces
    const trimmed = input.trim();
    // If format is 'YYYY-MM-DD HH:mm' or 'YYYY-MM-DD HH:mm:ss'
    const dt = new Date(trimmed);
    if (!isNaN(dt.getTime())) return dt;
    // Try replacing space with 'T'
    if (trimmed.includes(' ') && !trimmed.includes('T')) {
      const dtIso = new Date(trimmed.replace(' ', 'T'));
      if (!isNaN(dtIso.getTime())) return dtIso;
    }
  }
  if (typeof input === 'number') {
    const dt = new Date(input);
    if (!isNaN(dt.getTime())) return dt;
  }
  return null;
}

function formatReadableDateTime(d) {
  if (!d || isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

/**
 * Validates whether an outpass submission meets the required advance notice window.
 *
 * @param {string} requestType - 'normal' | 'one_day_duty' | 'duty'
 * @param {Date|string|number} departureTime - Selected departure date & time
 * @param {Date|string|number} [currentTime=new Date()] - Evaluation time (defaults to server time)
 * @returns {object} Validation result
 */
function validateAdvanceSubmissionTime(requestType, departureTime, currentTime = new Date()) {
  const isDuty = requestType === 'duty' || requestType === 'one_day_duty';
  const requiredHours = isDuty ? 12 : 18;
  const typeLabel = isDuty ? 'One-Day' : 'Normal';

  const depDate = parseDateTime(departureTime);
  const curDate = parseDateTime(currentTime);

  if (!depDate) {
    return {
      allowed: false,
      code: 'INVALID_DEPARTURE_TIME',
      message: 'Invalid departure date or time provided.',
      required_hours: requiredHours,
      departure_time: String(departureTime),
      latest_submission_time: null
    };
  }

  const departureMs = depDate.getTime();
  const currentMs = curDate ? curDate.getTime() : Date.now();
  const requiredMs = requiredHours * 60 * 60 * 1000;
  const latestSubmitMs = departureMs - requiredMs;
  const latestSubmitDate = new Date(latestSubmitMs);

  // Allowed ONLY when current_time <= required_submit_time
  const allowed = currentMs <= latestSubmitMs;

  const depIso = depDate.toISOString();
  const latestSubmitIso = latestSubmitDate.toISOString();

  if (!allowed) {
    return {
      allowed: false,
      code: 'ADVANCE_TIME_LIMIT',
      message: `${typeLabel} outpass requests must be submitted at least ${requiredHours} hours before the departure time.`,
      required_hours: requiredHours,
      departure_time: depIso,
      departure_time_formatted: formatReadableDateTime(depDate),
      latest_submission_time: latestSubmitIso,
      latest_submission_time_formatted: formatReadableDateTime(latestSubmitDate)
    };
  }

  return {
    allowed: true,
    required_hours: requiredHours,
    departure_time: depIso,
    latest_submission_time: latestSubmitIso,
    latest_submission_time_formatted: formatReadableDateTime(latestSubmitDate)
  };
}

module.exports = {
  validateAdvanceSubmissionTime,
  parseDateTime,
  formatReadableDateTime
};
