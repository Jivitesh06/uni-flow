/**
 * Unit Test Suite for Attendance Formula Calculations & Edge Cases
 *
 * Verifies mathematical rigor across all 8 critical operational scenarios:
 *  1. Zero conducted classes (C=0, A=0) -> clean neutral state
 *  2. Exactly 75% threshold (A=15, C=20) -> borderline, 0 safe to miss
 *  3. Safe attendance cushion (A=18, C=20, 90%) -> maxAbsences = 4
 *  4. Attendance shortage recovery (A=10, C=20, 50%) -> classesNeeded = 20
 *  5. Small exact boundary (A=3, C=4, 75%) -> borderline, 0 safe to miss
 *  6. Single class deficit recovery (A=14, C=20, 70%) -> classesNeeded = 4 (18/24 = 75%)
 *  7. Multi-period lab weighted accounting (A=8, C=10 with 2x weights)
 *  8. Floating point precision epsilon guards (0.7500000000000001 vs 0.75)
 */

import { calculateAttendanceStats } from '../src/lib/attendanceCalculations.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('--- RUNNING ATTENDANCE FORMULA EDGE CASE TESTS ---');

// 1. Zero conducted classes
console.log('\n[Case 1] Zero Conducted Classes (Fresh Semester / New Subject)');
{
  const stats = calculateAttendanceStats(0, 0, 0.75);
  assert(stats.percentage === 0, 'Percentage is 0%');
  assert(stats.isOnTrack === true, 'isOnTrack is true for 0 conducted');
  assert(stats.status === 'no_data', 'Status is no_data');
  assert(stats.classesNeeded === 0, 'Classes needed to recover is 0');
  assert(stats.maxAbsences === 0, 'Max absences allowed is 0');
  assert(stats.nextActionText.includes('No classes conducted'), 'Correct empty state advice');
}

// 2. Exactly 75.0% threshold (Borderline edge)
console.log('\n[Case 2] Exactly 75% Threshold (A=15, C=20)');
{
  const stats = calculateAttendanceStats(15, 20, 0.75);
  assert(Math.abs(stats.percentage - 75.0) < 1e-9, 'Percentage is exactly 75.0%');
  assert(stats.isOnTrack === true, 'isOnTrack is true at threshold');
  assert(stats.status === 'borderline', 'Status is borderline at exact 75%');
  assert(stats.classesNeeded === 0, '0 classes needed to reach target');
  assert(stats.maxAbsences === 0, '0 absences safe to miss (any absence drops below 75%)');
  assert(stats.nextActionText.includes('On 75% threshold'), 'Appropriate borderline advice');
}

// 3. Safe attendance with buffer (A=18, C=20, 90%)
console.log('\n[Case 3] Safe Attendance with Bunk Cushion (A=18, C=20, 90%)');
{
  const stats = calculateAttendanceStats(18, 20, 0.75);
  // Formula: floor(18 / 0.75 - 20) = floor(24 - 20) = 4
  assert(Math.abs(stats.percentage - 90.0) < 1e-9, 'Percentage is 90.0%');
  assert(stats.isOnTrack === true, 'isOnTrack is true');
  assert(stats.status === 'safe', 'Status is safe');
  assert(stats.maxAbsences === 4, 'Can miss exactly 4 classes without dropping below 75%');
  assert(stats.classesNeeded === 0, '0 classes needed');
  assert(stats.nextActionText.includes('Can miss up to 4 classes'), 'Advises exact cushion count');
}

// 4. Attendance shortage recovery (A=10, C=20, 50%)
console.log('\n[Case 4] Attendance Shortage Recovery (A=10, C=20, 50%)');
{
  const stats = calculateAttendanceStats(10, 20, 0.75);
  // Formula: ceil((0.75 * 20 - 10) / (1 - 0.75)) = ceil(5 / 0.25) = 20
  // Verify: (10 + 20) / (20 + 20) = 30 / 40 = 75%
  assert(Math.abs(stats.percentage - 50.0) < 1e-9, 'Percentage is 50.0%');
  assert(stats.isOnTrack === false, 'isOnTrack is false');
  assert(stats.status === 'shortage', 'Status is shortage');
  assert(stats.classesNeeded === 20, 'Needs 20 consecutive classes to reach 75%');
  assert(stats.maxAbsences === 0, '0 absences allowed in shortage');
  assert(stats.nextActionText.includes('Attend the next 20 consecutive classes'), 'Clear recovery instruction');
}

// 5. Small exact boundary (A=3, C=4, 75%)
console.log('\n[Case 5] Small Integer Boundary (A=3, C=4, 75%)');
{
  const stats = calculateAttendanceStats(3, 4, 0.75);
  assert(Math.abs(stats.percentage - 75.0) < 1e-9, 'Percentage is 75.0%');
  assert(stats.status === 'borderline', 'Status is borderline');
  assert(stats.maxAbsences === 0, 'Cannot miss any class (3/5 = 60%)');
  assert(stats.classesNeeded === 0, '0 classes needed');
}

// 6. Single deficit recovery (A=14, C=20, 70%)
console.log('\n[Case 6] Single Deficit Recovery (A=14, C=20, 70%)');
{
  const stats = calculateAttendanceStats(14, 20, 0.75);
  // Formula: ceil((15 - 14) / 0.25) = ceil(1 / 0.25) = 4 classes
  // Check: (14 + 4) / (20 + 4) = 18 / 24 = 75.0%
  assert(Math.abs(stats.percentage - 70.0) < 1e-9, 'Percentage is 70.0%');
  assert(stats.classesNeeded === 4, 'Requires 4 classes to recover to 75%');
  assert(stats.status === 'shortage', 'Status is shortage');
}

// 7. Multi-Period Lab Weighted Session Simulation
console.log('\n[Case 7] Multi-Period Lab Weighted Accounting');
{
  // 3 lectures (1x weight) + 1 lab (2x weight)
  // Attended: 3 lectures + 1 lab = 3*1 + 1*2 = 5 attended
  // Conducted: 3 lectures + 1 lab = 5 conducted -> 100%
  const statsAllAttended = calculateAttendanceStats(5, 5, 0.75);
  assert(statsAllAttended.percentage === 100.0, '100% attendance with lab weight');

  // If student misses 1 lab (weight 2):
  // Attended: 3 lectures = 3. Conducted: 5. Percentage = 3/5 = 60%
  const statsMissedLab = calculateAttendanceStats(3, 5, 0.75);
  assert(statsMissedLab.percentage === 60.0, '60% after missing 2x lab');
  // Recovery: ceil((0.75 * 5 - 3) / 0.25) = ceil((3.75 - 3) / 0.25) = ceil(0.75 / 0.25) = 3 lectures
  assert(statsMissedLab.classesNeeded === 3, 'Needs 3 sessions to recover from missed lab');
}

// 8. Floating-point precision epsilon guards
console.log('\n[Case 8] Floating Point Precision Epsilon Guards');
{
  // 6 out of 8 = 75.0%
  const stats6of8 = calculateAttendanceStats(6, 8, 0.75);
  assert(stats6of8.isOnTrack === true, '6/8 is on track (75%)');
  assert(stats6of8.status === 'borderline', '6/8 is borderline');

  // 9 out of 12 = 75.0%
  const stats9of12 = calculateAttendanceStats(9, 12, 0.75);
  assert(stats9of12.isOnTrack === true, '9/12 is on track (75%)');
  assert(stats9of12.status === 'borderline', '9/12 is borderline');

  // Custom target (e.g. 80%)
  const statsCustomTarget = calculateAttendanceStats(16, 20, 0.80);
  assert(statsCustomTarget.isOnTrack === true, '16/20 is on track for 80%');
  assert(statsCustomTarget.status === 'borderline', '16/20 is borderline for 80%');
}

console.log(`\n========================================`);
console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
