import { calculateAttendanceStats } from './attendanceCalculations.js';

console.log('--- Running Attendance Formula & Edge Case Tests ---');

// Test 1: Zero conducted classes
const t1 = calculateAttendanceStats(0, 0, 0.75);
console.assert(t1.conducted === 0, 'Test 1.1 failed');
console.assert(t1.percentage === 0, 'Test 1.2 failed');
console.assert(t1.classesNeeded === 0, 'Test 1.3 failed');
console.assert(t1.maxAbsences === 0, 'Test 1.4 failed');
console.log('✓ Test 1: Zero conducted classes handled (no divide-by-zero, returns 0%, needed=0, absences=0)');

// Test 2: Exactly at target (15/20 = 75%)
const t2 = calculateAttendanceStats(15, 20, 0.75);
console.assert(t2.percentage === 75, 'Test 2.1 failed');
console.assert(t2.classesNeeded === 0, 'Test 2.2 failed');
console.assert(t2.maxAbsences === 0, 'Test 2.3 failed');
console.assert(t2.isOnTrack === true, 'Test 2.4 failed');
console.log('✓ Test 2: Exactly at target: classesNeeded=0, maxAbsences=0 (must attend upcoming classes)');

// Test 3: Above target (18/20 = 90%)
// Max absences: floor(18 / 0.75 - 20) = floor(24 - 20) = 4
const t3 = calculateAttendanceStats(18, 20, 0.75);
console.assert(t3.percentage === 90, 'Test 3.1 failed');
console.assert(t3.classesNeeded === 0, 'Test 3.2 failed');
console.assert(t3.maxAbsences === 4, 'Test 3.3 failed');
console.assert(t3.isOnTrack === true, 'Test 3.4 failed');
console.log('✓ Test 3: Above target (18/20 = 90%): maxAbsences=4 permitted without falling below 75%');

// Test 4: Below target (10/20 = 50%)
// Classes needed: ceil((0.75*20 - 10)/(1 - 0.75)) = ceil(5 / 0.25) = 20
// Verification: (10 + 20) / (20 + 20) = 30/40 = 75%
const t4 = calculateAttendanceStats(10, 20, 0.75);
console.assert(t4.percentage === 50, 'Test 4.1 failed');
console.assert(t4.classesNeeded === 20, 'Test 4.2 failed');
console.assert(t4.maxAbsences === 0, 'Test 4.3 failed');
console.assert(t4.isOnTrack === false, 'Test 4.4 failed');
console.log('✓ Test 4: Below target (10/20 = 50%): classesNeeded=20 consecutive classes to reach 75% target');

// Test 5: Fractional edge case (7/10 = 70%)
// Classes needed: ceil((7.5 - 7)/0.25) = ceil(0.5 / 0.25) = 2
// Verification: (7 + 2) / (10 + 2) = 9/12 = 75%
const t5 = calculateAttendanceStats(7, 10, 0.75);
console.assert(t5.percentage === 70, 'Test 5.1 failed');
console.assert(t5.classesNeeded === 2, 'Test 5.2 failed');
console.assert(t5.isOnTrack === false, 'Test 5.3 failed');
console.log('✓ Test 5: Fractional ceil rounding (7/10 = 70%): classesNeeded=2 to reach 75% target');

console.log('All attendance test assertions passed successfully! 🎯');
