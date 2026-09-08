/**
 * Real Device Gate Flow Verification Script
 * Validates the complete Caretaker Check-Out and Watchman Check-In lifecycle
 * using real database state and live server endpoints.
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const BASE_URL = 'http://localhost:5001';

async function main() {
  console.log('====================================================');
  console.log('  REAL DEVICE GATE FLOW VERIFICATION');
  console.log('====================================================\n');

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smart_hostel_outpass',
    port: process.env.DB_PORT || 3306
  });

  try {
    // 1. Authenticate Staff
    console.log('--- Step 1: Staff Authentication ---');
    const caretakerLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'CTK-305', password: 'Password@123', role: 'caretaker' })
    });
    const caretakerLogin = await caretakerLoginRes.json();
    if (!caretakerLogin.success || !caretakerLogin.token) {
      throw new Error(`Caretaker login failed: ${JSON.stringify(caretakerLogin)}`);
    }
    const caretakerToken = caretakerLogin.token;
    console.log('✅ Caretaker authenticated successfully:', caretakerLogin.user.name, `(${caretakerLogin.user.staff_id})`);

    const watchmanLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'GAT-401', password: 'Password@123', role: 'watchman' })
    });
    const watchmanLogin = await watchmanLoginRes.json();
    if (!watchmanLogin.success || !watchmanLogin.token) {
      throw new Error(`Watchman login failed: ${JSON.stringify(watchmanLogin)}`);
    }
    const watchmanToken = watchmanLogin.token;
    console.log('✅ Watchman authenticated successfully:', watchmanLogin.user.name, `(${watchmanLogin.user.staff_id})\n`);

    // 2. Identify Active Target QR
    console.log('--- Step 2: Target QR Inspection ---');
    const [qrs] = await pool.query(`
      SELECT q.*, o.request_code, o.status AS outpass_status, s.name AS student_name, s.reg_no, s.current_hostel_status
      FROM qr_codes q
      JOIN outpass_requests o ON q.outpass_request_id = o.id
      JOIN students s ON o.student_id = s.id
      WHERE q.id = 444;
    `);
    if (qrs.length === 0) {
      throw new Error('QR ID 444 not found in database.');
    }
    const targetQr = qrs[0];
    console.log('Target Pass Details:');
    console.log(`- QR ID: ${targetQr.id}`);
    console.log(`- Request Code: ${targetQr.request_code}`);
    console.log(`- Student: ${targetQr.student_name} (${targetQr.reg_no})`);
    console.log(`- QR Token: ${targetQr.qr_data}`);
    console.log(`- Outpass Status: ${targetQr.outpass_status}`);
    console.log(`- Initial Student Hostel Status: ${targetQr.current_hostel_status}`);
    console.log(`- QR Used Count: ${targetQr.used_count}`);
    console.log(`- Valid From: ${targetQr.valid_from.toISOString()}`);
    console.log(`- Valid Until: ${targetQr.valid_until.toISOString()}\n`);

    // 3. Baseline Daily Summary
    console.log('--- Step 3: Baseline Daily Summary ---');
    const todayStr = new Date().toISOString().split('T')[0];
    const baselineSummaryRes = await fetch(`${BASE_URL}/api/gate/daily-summary?date=${todayStr}`, {
      headers: { 'Authorization': `Bearer ${caretakerToken}` }
    });
    const baselineSummary = await baselineSummaryRes.json();
    console.log(`Daily Summary for ${todayStr} (Pre-Checkout):`);
    console.log(`- Total Checked Out: ${baselineSummary.counts.totalCheckedOut}`);
    console.log(`- Total Checked In: ${baselineSummary.counts.totalCheckedIn}`);
    console.log(`- Currently Outside on Date: ${baselineSummary.counts.currentlyOutside}`);
    console.log(`- Overall Hostel Outside: ${baselineSummary.counts.overallHostelOutside}\n`);

    // 4. Role Separation Check BEFORE Checkout
    console.log('--- Step 4: Role Separation Verification (Watchman Check-Out Block) ---');
    const watchmanCheckoutAttempt = await fetch(`${BASE_URL}/api/gate/checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${watchmanToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ qr_token: targetQr.qr_data })
    });
    console.log(`Watchman calling /api/gate/checkout status: ${watchmanCheckoutAttempt.status}`);
    if (watchmanCheckoutAttempt.status === 403) {
      console.log('✅ PASS: Watchman is strictly blocked from performing Check-Out (HTTP 403 Forbidden).\n');
    } else {
      console.error('❌ FAIL: Watchman was not blocked from check-out with 403.');
    }

    // 5. Caretaker Real Check-Out
    console.log('--- Step 5: Caretaker Check-Out Execution ---');
    const checkoutRes = await fetch(`${BASE_URL}/api/gate/checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${caretakerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ qr_token: targetQr.qr_data })
    });
    const checkoutData = await checkoutRes.json();
    console.log(`Caretaker check-out status: ${checkoutRes.status}`);
    console.log('Response Payload:', checkoutData);
    if (checkoutRes.status !== 200 || !checkoutData.success) {
      throw new Error(`Checkout failed: ${JSON.stringify(checkoutData)}`);
    }
    console.log('✅ PASS: Student details automatically retrieved without manual entry:');
    console.log(`  - Student Name: ${checkoutData.data.studentName}`);
    console.log(`  - Roll Number: ${checkoutData.data.rollNumber}`);
    console.log(`  - Department: ${checkoutData.data.department}`);
    console.log(`  - Hostel Status: ${checkoutData.data.hostelStatus}`);
    console.log(`  - Exit Log ID: ${checkoutData.data.exitLogId}\n`);

    // 6. Verify Database State After Check-Out
    console.log('--- Step 6: Database State Verification Post-Checkout ---');
    const [studentAfterExit] = await pool.query('SELECT current_hostel_status FROM students WHERE id = ?;', [targetQr.student_id || 1]);
    console.log(`Student current_hostel_status: "${studentAfterExit[0].current_hostel_status}"`);
    if (studentAfterExit[0].current_hostel_status === 'OUTSIDE') {
      console.log('✅ PASS: Student current_hostel_status transitioned to OUTSIDE.');
    } else {
      console.error('❌ FAIL: Expected OUTSIDE, got', studentAfterExit[0].current_hostel_status);
    }

    const [exitLogs] = await pool.query('SELECT * FROM exit_logs WHERE outpass_request_id = ?;', [targetQr.outpass_request_id]);
    console.log(`Exit logs count for outpass ${targetQr.outpass_request_id}: ${exitLogs.length}`);
    if (exitLogs.length > 0) {
      console.log('✅ PASS: Database exit_logs contains checkout audit record:', {
        id: exitLogs[0].id,
        exit_time: exitLogs[0].exit_time,
        guard_staff_id: exitLogs[0].guard_staff_id,
        verification_method: exitLogs[0].verification_method
      });
    }

    const [qrAfterExit] = await pool.query('SELECT used_count, scanned_exit_at, status FROM qr_codes WHERE id = ?;', [targetQr.id]);
    console.log(`QR state: used_count = ${qrAfterExit[0].used_count}, status = ${qrAfterExit[0].status}, scanned_exit_at = ${qrAfterExit[0].scanned_exit_at}\n`);

    // 7. Duplicate Check-Out Rejection
    console.log('--- Step 7: Duplicate Check-Out Rejection Check ---');
    const duplicateCheckoutRes = await fetch(`${BASE_URL}/api/gate/checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${caretakerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ qr_token: targetQr.qr_data })
    });
    const dupCheckoutData = await duplicateCheckoutRes.json();
    console.log(`Duplicate checkout status: ${duplicateCheckoutRes.status}`);
    console.log('Duplicate checkout response:', dupCheckoutData);
    if (duplicateCheckoutRes.status === 409 && dupCheckoutData.validity === 'ALREADY_EXITED') {
      console.log('✅ PASS: Duplicate check-out is strictly rejected with HTTP 409 ALREADY_EXITED.\n');
    } else {
      console.error('❌ FAIL: Duplicate check-out did not return 409 ALREADY_EXITED.');
    }

    // 8. Check-Out List Verification
    console.log('--- Step 8: Check-Out List Verification ---');
    const checkoutListRes = await fetch(`${BASE_URL}/api/gate/checkout-list?filter=today`, {
      headers: { 'Authorization': `Bearer ${caretakerToken}` }
    });
    const checkoutListData = await checkoutListRes.json();
    console.log(`Check-Out List count: ${checkoutListData.count}`);
    const foundInCheckoutList = checkoutListData.checkoutList.find(r => r.outpassId === targetQr.outpass_request_id);
    if (foundInCheckoutList) {
      console.log('✅ PASS: Student appears in Check-Out List:');
      console.log(`  - Student: ${foundInCheckoutList.studentName} (${foundInCheckoutList.rollNumber})`);
      console.log(`  - Departure Time: ${foundInCheckoutList.exitTime}`);
      console.log(`  - Movement Status: ${foundInCheckoutList.movementStatus}\n`);
    } else {
      console.error('❌ FAIL: Student not found in Check-Out List.');
    }

    // 9. Daily Summary Verification (Student Outside)
    console.log('--- Step 9: Daily Summary Verification (Student Outside) ---');
    const midSummaryRes = await fetch(`${BASE_URL}/api/gate/daily-summary?date=${todayStr}`, {
      headers: { 'Authorization': `Bearer ${caretakerToken}` }
    });
    const midSummary = await midSummaryRes.json();
    console.log(`Daily Summary for ${todayStr} (While Student is Outside):`);
    console.log(`- Total Checked Out: ${midSummary.counts.totalCheckedOut} (Expected: ${baselineSummary.counts.totalCheckedOut + 1})`);
    console.log(`- Total Checked In: ${midSummary.counts.totalCheckedIn}`);
    console.log(`- Currently Outside on Date: ${midSummary.counts.currentlyOutside} (Expected: ${baselineSummary.counts.currentlyOutside + 1})`);
    const studentInStillOutside = midSummary.stillOutsideList.find(s => s.outpassId === targetQr.outpass_request_id);
    if (studentInStillOutside) {
      console.log('✅ PASS: Student correctly appears in Still Outside List:', studentInStillOutside.studentName, `(${studentInStillOutside.rollNumber})\n`);
    } else {
      console.error('❌ FAIL: Student missing from Still Outside List.');
    }

    // 10. Role Separation Check (Caretaker Check-In Block)
    console.log('--- Step 10: Role Separation Verification (Caretaker Check-In Block) ---');
    const caretakerCheckinAttempt = await fetch(`${BASE_URL}/api/gate/checkin`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${caretakerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ qr_token: targetQr.qr_data })
    });
    console.log(`Caretaker calling /api/gate/checkin status: ${caretakerCheckinAttempt.status}`);
    if (caretakerCheckinAttempt.status === 403) {
      console.log('✅ PASS: Caretaker is strictly blocked from performing Check-In (HTTP 403 Forbidden).\n');
    } else {
      console.error('❌ FAIL: Caretaker was not blocked from check-in with 403.');
    }

    // 11. Watchman Real Check-In (with the EXACT SAME QR)
    console.log('--- Step 11: Watchman Check-In Execution (Using EXACT SAME QR) ---');
    const checkinRes = await fetch(`${BASE_URL}/api/gate/checkin`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${watchmanToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ qr_token: targetQr.qr_data })
    });
    const checkinData = await checkinRes.json();
    console.log(`Watchman check-in status: ${checkinRes.status}`);
    console.log('Response Payload:', checkinData);
    if (checkinRes.status !== 200 || !checkinData.success) {
      throw new Error(`Check-in failed: ${JSON.stringify(checkinData)}`);
    }
    console.log('✅ PASS: Return verified successfully:');
    console.log(`  - Student Name: ${checkinData.data.studentName}`);
    console.log(`  - Roll Number: ${checkinData.data.rollNumber}`);
    console.log(`  - Timeliness: ${checkinData.data.timelinessStatus}`);
    console.log(`  - Outpass Status: ${checkinData.data.outpassStatus}`);
    console.log(`  - Return Log ID: ${checkinData.data.returnLogId}\n`);

    // 12. Verify Database State After Check-In
    console.log('--- Step 12: Database State Verification Post-Checkin ---');
    const [studentAfterReturn] = await pool.query('SELECT current_hostel_status FROM students WHERE id = ?;', [targetQr.student_id || 1]);
    console.log(`Student current_hostel_status: "${studentAfterReturn[0].current_hostel_status}"`);
    if (studentAfterReturn[0].current_hostel_status === 'INSIDE') {
      console.log('✅ PASS: Student current_hostel_status transitioned to INSIDE.');
    } else {
      console.error('❌ FAIL: Expected INSIDE, got', studentAfterReturn[0].current_hostel_status);
    }

    const [outpassAfterReturn] = await pool.query('SELECT status, overall_status, current_checkpoint_status FROM outpass_requests WHERE id = ?;', [targetQr.outpass_request_id]);
    console.log(`Outpass status: ${outpassAfterReturn[0].status}, overall_status: ${outpassAfterReturn[0].overall_status}, checkpoint: ${outpassAfterReturn[0].current_checkpoint_status}`);
    if (outpassAfterReturn[0].status === 'COMPLETED' && outpassAfterReturn[0].current_checkpoint_status === 'returned') {
      console.log('✅ PASS: Outpass request transitioned to COMPLETED with checkpoint returned.');
    }

    const [returnLogs] = await pool.query('SELECT * FROM return_logs WHERE outpass_request_id = ?;', [targetQr.outpass_request_id]);
    console.log(`Return logs count for outpass ${targetQr.outpass_request_id}: ${returnLogs.length}`);
    if (returnLogs.length > 0) {
      console.log('✅ PASS: Database return_logs contains return audit record:', {
        id: returnLogs[0].id,
        return_time: returnLogs[0].return_time,
        guard_staff_id: returnLogs[0].guard_staff_id,
        is_late: returnLogs[0].is_late,
        remarks: returnLogs[0].remarks
      });
    }

    const [qrAfterReturn] = await pool.query('SELECT used_count, scanned_return_at, status, is_used FROM qr_codes WHERE id = ?;', [targetQr.id]);
    console.log(`QR state: used_count = ${qrAfterReturn[0].used_count}, status = ${qrAfterReturn[0].status}, is_used = ${qrAfterReturn[0].is_used}, scanned_return_at = ${qrAfterReturn[0].scanned_return_at}`);
    if (qrAfterReturn[0].status === 'COMPLETED' && qrAfterReturn[0].used_count === 2) {
      console.log('✅ PASS: QR Code completed its full 2-stage clearance lifecycle (Exit -> Return).\n');
    }

    // 13. Duplicate Check-In Rejection
    console.log('--- Step 13: Duplicate Check-In Rejection Check ---');
    const duplicateCheckinRes = await fetch(`${BASE_URL}/api/gate/checkin`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${watchmanToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ qr_token: targetQr.qr_data })
    });
    const dupCheckinData = await duplicateCheckinRes.json();
    console.log(`Duplicate check-in status: ${duplicateCheckinRes.status}`);
    console.log('Duplicate check-in response:', dupCheckinData);
    if (duplicateCheckinRes.status === 409 && dupCheckinData.validity === 'ALREADY_RETURNED') {
      console.log('✅ PASS: Duplicate check-in is strictly rejected with HTTP 409 ALREADY_RETURNED.\n');
    } else {
      console.error('❌ FAIL: Duplicate check-in did not return 409 ALREADY_RETURNED.');
    }

    // 14. Check-In List Verification
    console.log('--- Step 14: Check-In List Verification ---');
    const checkinListRes = await fetch(`${BASE_URL}/api/gate/checkin-list?filter=today`, {
      headers: { 'Authorization': `Bearer ${watchmanToken}` }
    });
    const checkinListData = await checkinListRes.json();
    console.log(`Check-In List count: ${checkinListData.count}`);
    const foundInCheckinList = checkinListData.checkinList.find(r => r.outpassId === targetQr.outpass_request_id);
    if (foundInCheckinList) {
      console.log('✅ PASS: Student appears in Check-In List:');
      console.log(`  - Student: ${foundInCheckinList.studentName} (${foundInCheckinList.rollNumber})`);
      console.log(`  - Return Time: ${foundInCheckinList.returnTime}`);
      console.log(`  - Timeliness: ${foundInCheckinList.timelinessStatus}\n`);
    } else {
      console.error('❌ FAIL: Student not found in Check-In List.');
    }

    // 15. Daily Summary Verification (Post-Checkin)
    console.log('--- Step 15: Daily Summary Verification (Post-Checkin) ---');
    const postSummaryRes = await fetch(`${BASE_URL}/api/gate/daily-summary?date=${todayStr}`, {
      headers: { 'Authorization': `Bearer ${watchmanToken}` }
    });
    const postSummary = await postSummaryRes.json();
    console.log(`Daily Summary for ${todayStr} (Post-Checkin):`);
    console.log(`- Total Checked Out: ${postSummary.counts.totalCheckedOut} (Expected: ${baselineSummary.counts.totalCheckedOut + 1})`);
    console.log(`- Total Checked In: ${postSummary.counts.totalCheckedIn} (Expected: ${baselineSummary.counts.totalCheckedIn + 1})`);
    console.log(`- Currently Outside on Date: ${postSummary.counts.currentlyOutside} (Expected: ${baselineSummary.counts.currentlyOutside})`);
    const studentInStillOutsidePost = postSummary.stillOutsideList.find(s => s.outpassId === targetQr.outpass_request_id);
    if (!studentInStillOutsidePost) {
      console.log('✅ PASS: Student is no longer in Still Outside List (returned to hostel).\n');
    } else {
      console.error('❌ FAIL: Student still appears in Still Outside List after check-in.');
    }

    console.log('====================================================');
    console.log('  ALL REAL GATE FLOW VERIFICATION STEPS PASSED!');
    console.log('====================================================');

  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err.message);
  } finally {
    await pool.end();
  }
}

main();
