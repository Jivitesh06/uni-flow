import { calculateAttendanceStats } from './attendanceCalculations';

export function runAttendanceTests() {
  const tests: { name: string; pass: boolean; details?: string }[] = [];

  // Test 1: Zero conducted classes
  const t1 = calculateAttendanceStats(0, 0, 0.75);
  tests.push({
    name: 'Zero conducted classes handles gracefully',
    pass: t1.conducted === 0 && t1.percentage === 0 && t1.classesNeeded === 0 && t1.maxAbsences === 0,
    details: JSON.stringify(t1),
  });

  // Test 2: Exactly at target (15/20 = 75%)
  const t2 = calculateAttendanceStats(15, 20, 0.75);
  tests.push({
    name: 'Exactly at target: classesNeeded=0, maxAbsences=0',
    pass: t2.percentage === 75 && t2.classesNeeded === 0 && t2.maxAbsences === 0 && t2.isOnTrack === true,
    details: JSON.stringify(t2),
  });

  // Test 3: Above target (18/20 = 90%)
  // Max absences: floor(18 / 0.75 - 20) = floor(24 - 20) = 4
  const t3 = calculateAttendanceStats(18, 20, 0.75);
  tests.push({
    name: 'Above target (18/20): maxAbsences=4',
    pass: t3.percentage === 90 && t3.classesNeeded === 0 && t3.maxAbsences === 4 && t3.isOnTrack === true,
    details: JSON.stringify(t3),
  });

  // Test 4: Below target (10/20 = 50%)
  // Classes needed: ceil((0.75*20 - 10)/(1 - 0.75)) = ceil(5 / 0.25) = 20
  // Verification: (10 + 20) / (20 + 20) = 30/40 = 75%
  const t4 = calculateAttendanceStats(10, 20, 0.75);
  tests.push({
    name: 'Below target (10/20): classesNeeded=20, maxAbsences=0',
    pass: t4.percentage === 50 && t4.classesNeeded === 20 && t4.maxAbsences === 0 && t4.isOnTrack === false,
    details: JSON.stringify(t4),
  });

  // Test 5: Fractional edge case (7/10 = 70%)
  // Classes needed: ceil((7.5 - 7)/0.25) = ceil(0.5 / 0.25) = 2
  // Verification: (7 + 2) / (10 + 2) = 9/12 = 75%
  const t5 = calculateAttendanceStats(7, 10, 0.75);
  tests.push({
    name: 'Fractional edge case (7/10): classesNeeded=2',
    pass: t5.percentage === 70 && t5.classesNeeded === 2 && t5.isOnTrack === false,
    details: JSON.stringify(t5),
  });

  return tests;
}
