function calculateAttendanceStats(attended, conducted, target = 0.75) {
  if (conducted === 0) {
    return {
      attended: 0,
      conducted: 0,
      percentage: 0,
      target,
      classesNeeded: 0,
      maxAbsences: 0,
      isOnTrack: true,
    };
  }

  const percentage = (attended / conducted) * 100;
  const isOnTrack = percentage >= target * 100;

  // Classes to attend to reach target:
  // max(0, ceil((r*T - A) / (1 - r)))
  const classesNeeded = isOnTrack
    ? 0
    : Math.max(0, Math.ceil((target * conducted - attended) / (1 - target)));

  // Max absences: floor(A/r - T)
  const maxAbsences = isOnTrack
    ? Math.floor(attended / target - conducted)
    : 0;

  return {
    attended,
    conducted,
    percentage,
    target,
    classesNeeded,
    maxAbsences: Math.max(0, maxAbsences),
    isOnTrack,
  };
}

console.log('--- Running Attendance Formula & Edge Case Tests ---');

// Test 1: Zero conducted classes
const t1 = calculateAttendanceStats(0, 0, 0.75);
if (t1.conducted !== 0 || t1.percentage !== 0 || t1.classesNeeded !== 0 || t1.maxAbsences !== 0) throw new Error('Test 1 failed');
console.log('✓ Test 1: Zero conducted classes handled (no divide-by-zero, returns 0%, needed=0, absences=0)');

// Test 2: Exactly at target (15/20 = 75%)
const t2 = calculateAttendanceStats(15, 20, 0.75);
if (t2.percentage !== 75 || t2.classesNeeded !== 0 || t2.maxAbsences !== 0 || t2.isOnTrack !== true) throw new Error('Test 2 failed');
console.log('✓ Test 2: Exactly at target: classesNeeded=0, maxAbsences=0 (must attend upcoming classes)');

// Test 3: Above target (18/20 = 90%)
const t3 = calculateAttendanceStats(18, 20, 0.75);
if (t3.percentage !== 90 || t3.classesNeeded !== 0 || t3.maxAbsences !== 4 || t3.isOnTrack !== true) throw new Error('Test 3 failed');
console.log('✓ Test 3: Above target (18/20 = 90%): maxAbsences=4 permitted without falling below 75%');

// Test 4: Below target (10/20 = 50%)
const t4 = calculateAttendanceStats(10, 20, 0.75);
if (t4.percentage !== 50 || t4.classesNeeded !== 20 || t4.maxAbsences !== 0 || t4.isOnTrack !== false) throw new Error('Test 4 failed');
console.log('✓ Test 4: Below target (10/20 = 50%): classesNeeded=20 consecutive classes to reach 75% target');

// Test 5: Fractional edge case (7/10 = 70%)
const t5 = calculateAttendanceStats(7, 10, 0.75);
if (t5.percentage !== 70 || t5.classesNeeded !== 2 || t5.isOnTrack !== false) throw new Error('Test 5 failed');
console.log('✓ Test 5: Fractional ceil rounding (7/10 = 70%): classesNeeded=2 to reach 75% target');

console.log('All attendance test assertions passed successfully! 🎯');
