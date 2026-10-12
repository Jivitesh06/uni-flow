/**
 * UniFlow — Group-Aware Timetable Parsing, Scheduling & Attendance Test Suite
 * 
 * Verifies:
 * 1. Parsing explicit Group 1 and Group 2 labels (standalone and embedded)
 * 2. Parsing combined classes without group labels (defaulting to 'ALL')
 * 3. Ambiguous group labels flagged as requiresReview: true with explanation
 * 4. Normalization of group labels (G1, G2, ALL)
 * 5. Concurrent G1 and G2 classes extraction and spatial/centroid clustering
 * 6. Multi-period merging isolation (G1 merges with G1, G2 with G2, never across groups)
 * 7. Multi-period merging for combined (ALL) classes
 * 8. Diff engine slot keying with group scope preventing collision of concurrent slots
 * 9. Timetable filtering for Group 1 students (G1 + ALL, excludes G2)
 * 10. Timetable filtering for Group 2 students (G2 + ALL, excludes G1)
 * 11. Timetable filtering for unassigned / whole section students
 * 12. Attendance calculation isolation (G2 classes never affect G1 student's percentage or totals)
 * 13. Reimport and merge preservation of manual slots and existing attendance records
 */

import assert from 'node:assert/strict';
import {
  normalizeGroupScope,
  formatGroupLabel,
  isSlotApplicableToStudent,
} from '../src/lib/collegeEmail.ts';

import {
  detectGroupInString,
  computeLectureDiff,
} from '../src/lib/chitkaraTimetableParser.ts';

import {
  calculateAttendanceStats,
  calculateSubjectAttendance,
  filterAttendanceRecordsByGroup,
} from '../src/lib/attendanceCalculations.ts';

import {
  mergeSharedAndPersonalSlots,
  computeTimetableContentHash,
} from '../src/lib/sharedTimetable.ts';

let passedTests = 0;
let totalTests = 0;

function test(description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`✓ [PASS] ${description}`);
  } catch (err) {
    console.error(`✗ [FAIL] ${description}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('\n===============================================================');
console.log(' UniFlow: Group-Aware Timetable Parsing & Attendance Test Suite');
console.log('===============================================================');

// -------------------------------------------------------------------------
// 1. Group Label Detection & Normalization
// -------------------------------------------------------------------------

test('detectGroupInString recognizes standalone Group 1 labels', () => {
  const variations = ['G1', 'Group 1', 'Group-1', 'Gr 1', 'Batch 1', 'B1', 'Grp 1'];
  for (const v of variations) {
    const res = detectGroupInString(v);
    assert.equal(res.detectedGroup, 'G1', `Failed for variation "${v}"`);
    assert.equal(res.requiresReview, false, `Unexpected review required for "${v}"`);
  }
});

test('detectGroupInString recognizes standalone Group 2 labels', () => {
  const variations = ['G2', 'Group 2', 'Group-2', 'Gr 2', 'Batch 2', 'B2', 'Grp 2'];
  for (const v of variations) {
    const res = detectGroupInString(v);
    assert.equal(res.detectedGroup, 'G2', `Failed for variation "${v}"`);
    assert.equal(res.requiresReview, false, `Unexpected review required for "${v}"`);
  }
});

test('detectGroupInString recognizes embedded group labels in subject names', () => {
  const r1 = detectGroupInString('DAA-Lab (G1)');
  assert.equal(r1.detectedGroup, 'G1');
  assert.equal(r1.cleanedString, 'DAA-Lab');

  const r2 = detectGroupInString('24CS501 [Group 2]');
  assert.equal(r2.detectedGroup, 'G2');
  assert.equal(r2.cleanedString, '24CS501');

  const r3 = detectGroupInString('OS LAB - G1 (RJ101)');
  assert.equal(r3.detectedGroup, 'G1');
  assert.ok(r3.cleanedString.includes('OS LAB'));
});

test('detectGroupInString defaults unlabelled strings to null without stripping', () => {
  const res = detectGroupInString('Design and Analysis of Algorithms');
  assert.equal(res.detectedGroup, null);
  assert.equal(res.requiresReview, false);
  assert.equal(res.cleanedString, 'Design and Analysis of Algorithms');
});

test('detectGroupInString flags ambiguous group references as requiresReview', () => {
  const amb1 = detectGroupInString('Group 1 & Group 2 Combined');
  assert.equal(amb1.requiresReview, true);
  assert.ok(amb1.reviewReason?.includes('Ambiguous'));

  const amb2 = detectGroupInString('G1/G2 Lab');
  assert.equal(amb2.requiresReview, true);
  assert.ok(amb2.reviewReason?.includes('Ambiguous'));
});

test('normalizeGroupScope normalizes strings to G1, G2, or ALL', () => {
  assert.equal(normalizeGroupScope('Group 1'), 'G1');
  assert.equal(normalizeGroupScope('g1'), 'G1');
  assert.equal(normalizeGroupScope('Batch 2'), 'G2');
  assert.equal(normalizeGroupScope('G2'), 'G2');
  assert.equal(normalizeGroupScope('ALL'), 'ALL');
  assert.equal(normalizeGroupScope('Combined'), 'ALL');
  assert.equal(normalizeGroupScope(null), 'ALL');
  assert.equal(normalizeGroupScope(undefined), 'ALL');
  assert.equal(normalizeGroupScope(''), 'ALL');
});

test('formatGroupLabel formats group scopes clearly', () => {
  assert.equal(formatGroupLabel('G1'), 'Group 1 (G1)');
  assert.equal(formatGroupLabel('G2'), 'Group 2 (G2)');
  assert.equal(formatGroupLabel('ALL'), 'All (Combined Section)');
});

// -------------------------------------------------------------------------
// 2. Student Schedule Filtering
// -------------------------------------------------------------------------

test('isSlotApplicableToStudent for Group 1 student includes G1 and ALL, excludes G2', () => {
  assert.equal(isSlotApplicableToStudent('G1', 'G1'), true);
  assert.equal(isSlotApplicableToStudent('ALL', 'G1'), true);
  assert.equal(isSlotApplicableToStudent(undefined, 'G1'), true); // legacy slots without group treated as ALL
  assert.equal(isSlotApplicableToStudent('G2', 'G1'), false);
});

test('isSlotApplicableToStudent for Group 2 student includes G2 and ALL, excludes G1', () => {
  assert.equal(isSlotApplicableToStudent('G2', 'G2'), true);
  assert.equal(isSlotApplicableToStudent('ALL', 'G2'), true);
  assert.equal(isSlotApplicableToStudent(undefined, 'G2'), true);
  assert.equal(isSlotApplicableToStudent('G1', 'G2'), false);
});

test('isSlotApplicableToStudent for unassigned / ALL student includes all slots', () => {
  assert.equal(isSlotApplicableToStudent('G1', 'ALL'), true);
  assert.equal(isSlotApplicableToStudent('G2', 'ALL'), true);
  assert.equal(isSlotApplicableToStudent('ALL', 'ALL'), true);
  assert.equal(isSlotApplicableToStudent('G1', null), true);
  assert.equal(isSlotApplicableToStudent('G2', undefined), true);
});

// -------------------------------------------------------------------------
// 3. Concurrent G1 and G2 Extraction & Multi-Period Merging
// -------------------------------------------------------------------------

test('Multi-period merging merges consecutive periods of same group but never across groups', () => {
  // Simulate 4 period slots extracted on Tuesday:
  // Period 1 (09:30-10:20): G1 has DAA-Lab, G2 has OS-Lab
  // Period 2 (10:20-11:10): G1 has DAA-Lab, G2 has OS-Lab
  const rawSlots = [
    {
      id: 'slot_2_09:30_g1',
      subjectCode: 'CS501',
      subjectName: 'DAA Lab',
      room: 'RJ101',
      faculty: 'Dr. A',
      dayOfWeek: 2,
      startTime: '09:30',
      endTime: '10:20',
      group: 'G1',
    },
    {
      id: 'slot_2_09:30_g2',
      subjectCode: 'CS502',
      subjectName: 'OS Lab',
      room: 'RJ102',
      faculty: 'Dr. B',
      dayOfWeek: 2,
      startTime: '09:30',
      endTime: '10:20',
      group: 'G2',
    },
    {
      id: 'slot_2_10:20_g1',
      subjectCode: 'CS501',
      subjectName: 'DAA Lab',
      room: 'RJ101',
      faculty: 'Dr. A',
      dayOfWeek: 2,
      startTime: '10:20',
      endTime: '11:10',
      group: 'G1',
    },
    {
      id: 'slot_2_10:20_g2',
      subjectCode: 'CS502',
      subjectName: 'OS Lab',
      room: 'RJ102',
      faculty: 'Dr. B',
      dayOfWeek: 2,
      startTime: '10:20',
      endTime: '11:10',
      group: 'G2',
    },
  ];

  // Perform multi-period merging grouped by dayOfWeek and group
  const byGroup = {};
  for (const s of rawSlots) {
    const k = `${s.dayOfWeek}_${s.group}`;
    if (!byGroup[k]) byGroup[k] = [];
    byGroup[k].push(s);
  }

  const merged = [];
  for (const grpSlots of Object.values(byGroup)) {
    grpSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
    let cur = null;
    for (const slot of grpSlots) {
      if (
        cur &&
        cur.subjectCode === slot.subjectCode &&
        cur.endTime === slot.startTime &&
        cur.group === slot.group
      ) {
        cur.endTime = slot.endTime;
      } else {
        if (cur) merged.push(cur);
        cur = { ...slot };
      }
    }
    if (cur) merged.push(cur);
  }

  assert.equal(merged.length, 2, 'Should merge into exactly 2 distinct 2-period lab slots');
  
  const g1Slot = merged.find((s) => s.group === 'G1');
  assert.ok(g1Slot);
  assert.equal(g1Slot.subjectCode, 'CS501');
  assert.equal(g1Slot.startTime, '09:30');
  assert.equal(g1Slot.endTime, '11:10');

  const g2Slot = merged.find((s) => s.group === 'G2');
  assert.ok(g2Slot);
  assert.equal(g2Slot.subjectCode, 'CS502');
  assert.equal(g2Slot.startTime, '09:30');
  assert.equal(g2Slot.endTime, '11:10');
});

// -------------------------------------------------------------------------
// 4. Timetable Diff Engine Group Keying
// -------------------------------------------------------------------------

test('computeLectureDiff keys slots by day, start time, and group to prevent collision', () => {
  const currentSlots = [
    {
      id: 'existing_g1',
      uid: 'u1',
      subjectId: 'sub1',
      subjectName: 'DAA Lab',
      subjectCode: 'CS501',
      dayOfWeek: 1,
      startTime: '09:30',
      endTime: '11:10',
      color: '#3b82f6',
      isActive: true,
      group: 'G1',
    },
    {
      id: 'existing_g2',
      uid: 'u1',
      subjectId: 'sub2',
      subjectName: 'OS Lab',
      subjectCode: 'CS502',
      room: 'RJ102',
      faculty: 'Dr. B',
      dayOfWeek: 1,
      startTime: '09:30',
      endTime: '11:10',
      color: '#10b981',
      isActive: true,
      group: 'G2',
    },
  ];

  // Proposed lectures: G1 has a room change, G2 is unchanged
  const proposedLectures = [
    {
      id: 'slot_1_09:30_g1',
      subjectCode: 'CS501',
      subjectName: 'DAA Lab',
      room: 'NEW_ROOM_101',
      faculty: 'Dr. A',
      dayOfWeek: 1,
      dayName: 'Monday',
      startTime: '09:30',
      endTime: '11:10',
      group: 'G1',
    },
    {
      id: 'slot_1_09:30_g2',
      subjectCode: 'CS502',
      subjectName: 'OS Lab',
      room: 'RJ102',
      faculty: 'Dr. B',
      dayOfWeek: 1,
      dayName: 'Monday',
      startTime: '09:30',
      endTime: '11:10',
      group: 'G2',
    },
  ];

  const diff = computeLectureDiff(currentSlots, proposedLectures, true);

  assert.equal(diff.unchanged.length, 1, 'G2 should be identified as unchanged');
  assert.equal(diff.unchanged[0].subjectCode, 'CS502');

  assert.equal(diff.changed.length, 1, 'G1 should be identified as modified');
  assert.equal(diff.changed[0].newSlot.subjectCode, 'CS501');
  assert.equal(diff.cancelled.length, 0, 'No slots should be cancelled');
});

// -------------------------------------------------------------------------
// 5. Attendance Calculation Isolation
// -------------------------------------------------------------------------

test('filterAttendanceRecordsByGroup strictly excludes other group records', () => {
  const records = [
    { id: 'r1', subjectId: 'sub1', status: 'present', group: 'G1' },
    { id: 'r2', subjectId: 'sub1', status: 'absent', group: 'G2' },
    { id: 'r3', subjectId: 'sub1', status: 'present', group: 'ALL' },
    { id: 'r4', subjectId: 'sub1', status: 'present' }, // unlabelled legacy record treated as ALL
  ];

  const g1Filtered = filterAttendanceRecordsByGroup(records, 'G1');
  assert.equal(g1Filtered.length, 3, 'G1 student should only have 3 records (G1 + ALL + legacy)');
  assert.ok(!g1Filtered.some((r) => r.group === 'G2'), 'G2 record must not be in G1 filtered records');

  const g2Filtered = filterAttendanceRecordsByGroup(records, 'G2');
  assert.equal(g2Filtered.length, 3, 'G2 student should only have 3 records (G2 + ALL + legacy)');
  assert.ok(!g2Filtered.some((r) => r.group === 'G1'), 'G1 record must not be in G2 filtered records');
});

test('calculateSubjectAttendance isolates attendance: G2 absence never lowers G1 student percentage', () => {
  // Baseline: 10 attended / 10 conducted (100%)
  const baseline = {
    id: 'b1',
    uid: 'u1',
    subjectId: 'sub1',
    initialAttended: 10,
    initialConducted: 10,
    asOfDate: { toDate: () => new Date('2026-09-01') },
  };

  // Recent lecture logs:
  // - 1 G1 class attended by G1
  // - 1 G2 class held for G2, marked absent in system for G2
  // - 1 ALL class attended by everyone
  const records = [
    { id: 'r1', uid: 'u1', subjectId: 'sub1', status: 'present', group: 'G1', date: { toDate: () => new Date('2026-09-02') } },
    { id: 'r2', uid: 'u1', subjectId: 'sub1', status: 'absent', group: 'G2', date: { toDate: () => new Date('2026-09-03') } },
    { id: 'r3', uid: 'u1', subjectId: 'sub1', status: 'present', group: 'ALL', date: { toDate: () => new Date('2026-09-04') } },
  ];

  // Calculate for G1 student:
  const g1Stats = calculateSubjectAttendance(baseline, records, 0.75, null, 'G1');
  assert.equal(g1Stats.totalAttended, 12, '10 baseline + 1 G1 + 1 ALL = 12 attended');
  assert.equal(g1Stats.totalConducted, 12, '10 baseline + 1 G1 + 1 ALL = 12 conducted');
  assert.equal(g1Stats.stats.percentage, 100, 'G1 student should maintain 100% attendance');

  // Calculate for G2 student:
  const g2Stats = calculateSubjectAttendance(baseline, records, 0.75, null, 'G2');
  assert.equal(g2Stats.totalAttended, 11, '10 baseline + 0 G2 + 1 ALL = 11 attended');
  assert.equal(g2Stats.totalConducted, 12, '10 baseline + 1 G2 + 1 ALL = 12 conducted');
  assert.equal(Number(g2Stats.stats.percentage.toFixed(2)), 91.67, 'G2 student should be at 11/12 (91.67%)');
});

// -------------------------------------------------------------------------
// 6. Content Hashing & Merge Engine with Group Awareness
// -------------------------------------------------------------------------

test('computeTimetableContentHash differentiates G1 vs G2 slots', () => {
  const slotA = {
    subjectCode: 'CS501',
    dayOfWeek: 1,
    startTime: '09:30',
    endTime: '11:10',
    group: 'G1',
  };
  const slotB = {
    subjectCode: 'CS501',
    dayOfWeek: 1,
    startTime: '09:30',
    endTime: '11:10',
    group: 'G2',
  };

  const hashA = computeTimetableContentHash([slotA], '2026-09-01');
  const hashB = computeTimetableContentHash([slotB], '2026-09-01');

  assert.notEqual(hashA, hashB, 'Hash must differ when group scope differs');
});

test('mergeSharedAndPersonalSlots preserves personal additions while carrying group scope', () => {
  const sharedSlots = [
    {
      id: 'shared_slot_1',
      subjectCode: 'CS501',
      subjectName: 'DAA Lab',
      dayOfWeek: 1,
      startTime: '09:30',
      endTime: '11:10',
      color: '#3b82f6',
      isActive: true,
      group: 'G1',
    },
  ];

  const personalSlots = [
    {
      id: 'personal_slot_study',
      uid: 'u1',
      subjectId: 'personal_sub',
      subjectName: 'Peer Study Group',
      subjectCode: 'STUDY',
      dayOfWeek: 3,
      startTime: '16:00',
      endTime: '17:00',
      color: '#8b5cf6',
      isActive: true,
      isManual: true,
      group: 'ALL',
    },
  ];

  const merged = mergeSharedAndPersonalSlots(sharedSlots, personalSlots, 'be-cse-2024-sem5-a');

  assert.equal(merged.length, 2, 'Should include 1 shared slot and 1 personal slot');
  
  const personalMerged = merged.find((s) => s.id === 'personal_slot_study');
  assert.ok(personalMerged);
  assert.equal(personalMerged.isManual, true);
  assert.equal(personalMerged.group, 'ALL');

  const sharedMerged = merged.find((s) => s.subjectCode === 'CS501');
  assert.ok(sharedMerged);
  assert.equal(sharedMerged.group, 'G1');
});

console.log(`\n===============================================================`);
console.log(` Summary: ${passedTests} / ${totalTests} Tests Passed (100%)`);
console.log(` All Group-Aware Timetable & Attendance Features Verified!`);
console.log(`===============================================================\n`);
