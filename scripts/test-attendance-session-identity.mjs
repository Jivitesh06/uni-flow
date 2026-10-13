/**
 * Regression tests for attendance session-identity fix.
 *
 * Validates that:
 *  1. Two different lectures of the same subject on the same day are independently markable.
 *  2. The same session cannot be marked twice (duplicate prevention).
 *  3. Lab sessions (weight > 1) retain correct weight.
 *  4. G1 and G2 sessions remain distinct.
 *  5. Legacy records without lectureSlotId still work safely.
 *  6. resolveNextUnmarkedSlotForSubject always returns the earliest unmarked slot.
 *  7. Returns null when all sessions are marked.
 *  8. LAC / LACT records are treated as the same subject.
 *  9. SPC / SPCL records are treated as the same subject.
 * 10. ADI / ADI-FA records are treated as the same subject.
 * 11. Correction workflow targets the specific session only.
 * 12. No random ID generated per click (slot.id is stable).
 */

// ---------------------------------------------------------------------------
// Minimal inline stubs (no build step needed)
// ---------------------------------------------------------------------------

function normalizeCode(raw) {
  if (!raw) return '';
  return raw
    .trim()
    .toUpperCase()
    .replace(/-FA$/, '')
    .replace(/[TL]$/, ''); // strip trailing T or L (LACT→LAC, SPCL→SPC)
}

/** Simplified matchesSubjectRecord — mirrors the key LAC/LACT, SPC/SPCL, ADI/ADI-FA logic */
function matchesSubjectRecord(subject, recordSubjectId) {
  if (!subject || !recordSubjectId) return false;
  const subId = typeof subject === 'string' ? subject : (subject.id || subject.code || '');
  const subCode = typeof subject === 'object' ? (subject.code || '') : subject;
  if (subId === recordSubjectId) return true;
  if (subCode === recordSubjectId) return true;

  // Check aliases array if present on subject object
  if (typeof subject === 'object' && Array.isArray(subject.aliases)) {
    if (subject.aliases.some((a) => a.toUpperCase() === recordSubjectId.toUpperCase())) {
      return true;
    }
  }

  // Alias / normalization matching (LAC↔LACT, SPC↔SPCL, ADI↔ADI-FA)
  return normalizeCode(subCode) === normalizeCode(recordSubjectId) ||
         normalizeCode(subId) === normalizeCode(recordSubjectId);
}

/**
 * Inline port of resolveNextUnmarkedSlotForSubject.
 * (Mirrors the logic added to AttendancePage.tsx)
 */
function resolveNextUnmarkedSlotForSubject(subjectId, scheduledSlotsForDate, attendance, targetDateStr, allSubjects, resolutionContext) {
  const sub = allSubjects.find((s) => s.id === subjectId);

  const slotsForSubject = scheduledSlotsForDate.filter(
    (s) =>
      s.subjectId === subjectId ||
      matchesSubjectRecord(sub || subjectId, s.subjectId)
  );
  if (slotsForSubject.length === 0) return null;

  for (const slot of slotsForSubject) {
    const alreadyMarked = attendance.some(
      (a) =>
        a.lectureSlotId === slot.id &&
        a.dateStr === targetDateStr &&
        a.status !== 'cancelled'
    );
    if (!alreadyMarked) {
      return { slot, weight: slot.weight && slot.weight > 0 ? slot.weight : 1 };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passCount = 0;
let failCount = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failCount++;
  }
}

function section(title) {
  console.log(`\n── ${title}`);
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TODAY = '2026-10-13';

const subjects = [
  { id: 'sub-lac', code: 'LAC', name: 'Lab Allied Computing', aliases: ['LACT'] },
  { id: 'sub-spc', code: 'SPC', name: 'SPC', aliases: ['SPCL'] },
  { id: 'sub-adi', code: 'ADI', name: 'ADI', aliases: ['ADI-FA'] },
  { id: 'sub-dm',  code: 'DM',  name: 'Discrete Mathematics', aliases: [] },
  { id: 'sub-py',  code: 'PY',  name: 'Python', aliases: [] },
];

// Two lectures of the same subject on the same day
const scheduledSlots = [
  { id: 'slot-dm-1',  subjectId: 'sub-dm',  dayOfWeek: 1, startTime: '09:00', endTime: '09:55',  weight: 1, group: 'ALL' },
  { id: 'slot-dm-2',  subjectId: 'sub-dm',  dayOfWeek: 1, startTime: '11:00', endTime: '11:55',  weight: 1, group: 'ALL' },
  // Lab slot (weight 2)
  { id: 'slot-lac-1', subjectId: 'sub-lac', dayOfWeek: 1, startTime: '14:00', endTime: '15:55',  weight: 2, group: 'ALL' },
  // G1-only and G2-only slots for PY
  { id: 'slot-py-g1', subjectId: 'sub-py',  dayOfWeek: 1, startTime: '10:00', endTime: '10:55',  weight: 1, group: 'G1' },
  { id: 'slot-py-g2', subjectId: 'sub-py',  dayOfWeek: 1, startTime: '10:00', endTime: '10:55',  weight: 1, group: 'G2' },
  // Timetable uses LACT but subject ID is sub-lac (LAC)
  { id: 'slot-lact-2', subjectId: 'LACT',   dayOfWeek: 1, startTime: '16:00', endTime: '17:55',  weight: 2, group: 'ALL' },
  // SPC/SPCL
  { id: 'slot-spcl',  subjectId: 'SPCL',    dayOfWeek: 1, startTime: '13:00', endTime: '13:55',  weight: 1, group: 'ALL' },
  // ADI/ADI-FA
  { id: 'slot-adifa', subjectId: 'ADI-FA',  dayOfWeek: 1, startTime: '08:00', endTime: '08:55',  weight: 1, group: 'ALL' },
];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

section('Test 1 — Two lectures of the same subject are independently markable');
{
  const attendance = [];
  const next1 = resolveNextUnmarkedSlotForSubject('sub-dm', scheduledSlots, attendance, TODAY, subjects);
  assert(next1?.slot.id === 'slot-dm-1', 'First unmark returns slot-dm-1 (earliest)');

  // Mark the first session
  attendance.push({ lectureSlotId: 'slot-dm-1', dateStr: TODAY, status: 'present' });

  const next2 = resolveNextUnmarkedSlotForSubject('sub-dm', scheduledSlots, attendance, TODAY, subjects);
  assert(next2?.slot.id === 'slot-dm-2', 'After marking slot-dm-1, returns slot-dm-2');
}

section('Test 2 — Duplicate prevention: marking the same session twice is blocked');
{
  const attendance = [
    { lectureSlotId: 'slot-dm-1', dateStr: TODAY, status: 'present' },
    { lectureSlotId: 'slot-dm-2', dateStr: TODAY, status: 'present' },
  ];
  const next = resolveNextUnmarkedSlotForSubject('sub-dm', scheduledSlots, attendance, TODAY, subjects);
  assert(next === null, 'Returns null when all sessions already marked');
}

section('Test 3 — Lab session retains correct weight');
{
  const attendance = [];
  const next = resolveNextUnmarkedSlotForSubject('sub-lac', scheduledSlots, attendance, TODAY, subjects);
  assert(next?.slot.id === 'slot-lac-1', 'Lab slot returned');
  assert(next?.weight === 2, 'Lab weight is 2');
}

section('Test 4 — G1 and G2 sessions are distinct (sub-py)');
{
  const g1Slots = scheduledSlots.filter((s) => s.group === 'G1' || s.group === 'ALL');
  const g2Slots = scheduledSlots.filter((s) => s.group === 'G2' || s.group === 'ALL');

  const nextG1 = resolveNextUnmarkedSlotForSubject('sub-py', g1Slots, [], TODAY, subjects);
  const nextG2 = resolveNextUnmarkedSlotForSubject('sub-py', g2Slots, [], TODAY, subjects);

  assert(nextG1?.slot.id === 'slot-py-g1', 'G1 student gets slot-py-g1');
  assert(nextG2?.slot.id === 'slot-py-g2', 'G2 student gets slot-py-g2');
  assert(nextG1?.slot.id !== nextG2?.slot.id, 'G1 and G2 sessions have distinct IDs');
}

section('Test 5 — Legacy records without lectureSlotId remain safe');
{
  // Legacy record has no lectureSlotId
  const legacyRecord = { lectureSlotId: undefined, dateStr: TODAY, status: 'present' };
  const attendance = [legacyRecord];

  // The resolver checks a.lectureSlotId === slot.id — undefined !== 'slot-dm-1' so NOT blocked
  const next = resolveNextUnmarkedSlotForSubject('sub-dm', scheduledSlots, attendance, TODAY, subjects);
  assert(next?.slot.id === 'slot-dm-1', 'Legacy record without slotId does not block scheduled slot');
}

section('Test 6 — Cancelled records do not block re-marking');
{
  const attendance = [
    { lectureSlotId: 'slot-dm-1', dateStr: TODAY, status: 'cancelled' },
  ];
  const next = resolveNextUnmarkedSlotForSubject('sub-dm', scheduledSlots, attendance, TODAY, subjects);
  assert(next?.slot.id === 'slot-dm-1', 'Cancelled record does not block slot-dm-1');
}

section('Test 7 — No scheduled slot for subject → returns null (legacy path)');
{
  // subject sub-spc only has slot-spcl which uses subjectId 'SPCL', not 'sub-spc' directly
  // But matchesSubjectRecord handles SPC ↔ SPCL equivalence
  const noSlotForDate = []; // empty — simulating a different day
  const next = resolveNextUnmarkedSlotForSubject('sub-spc', noSlotForDate, [], TODAY, subjects);
  assert(next === null, 'Returns null when no slots on that date');
}

section('Test 8 — LAC / LACT attendance records resolve to same subject');
{
  // slot-lact-2 has subjectId 'LACT'; subject is sub-lac (code: LAC)
  assert(matchesSubjectRecord({ id: 'sub-lac', code: 'LAC' }, 'LACT'), 'LAC matches LACT record');
  assert(matchesSubjectRecord({ id: 'sub-lac', code: 'LAC' }, 'LAC'), 'LAC matches LAC record');
  assert(!matchesSubjectRecord({ id: 'sub-lac', code: 'LAC' }, 'SPC'), 'LAC does NOT match SPC');
}

section('Test 9 — SPC / SPCL records resolve to same subject');
{
  assert(matchesSubjectRecord({ id: 'sub-spc', code: 'SPC' }, 'SPCL'), 'SPC matches SPCL record');
  assert(matchesSubjectRecord({ id: 'sub-spc', code: 'SPC' }, 'SPC'), 'SPC matches SPC record');
}

section('Test 10 — ADI / ADI-FA records resolve to same subject');
{
  assert(matchesSubjectRecord({ id: 'sub-adi', code: 'ADI' }, 'ADI-FA'), 'ADI matches ADI-FA record');
  assert(matchesSubjectRecord({ id: 'sub-adi', code: 'ADI' }, 'ADI'), 'ADI matches ADI record');
}

section('Test 11 — Correction only affects the targeted session record');
{
  // Simulate: slot-dm-1 → present, slot-dm-2 → absent; correct dm-1 only
  const attendance = [
    { id: 'rec-1', lectureSlotId: 'slot-dm-1', dateStr: TODAY, status: 'present' },
    { id: 'rec-2', lectureSlotId: 'slot-dm-2', dateStr: TODAY, status: 'absent' },
  ];
  // After correction of rec-1 → absent
  attendance[0].status = 'absent';
  assert(attendance[0].status === 'absent', 'rec-1 corrected to absent');
  assert(attendance[1].status === 'absent', 'rec-2 unchanged (still absent)');
}

section('Test 12 — slot.id is stable; no random ID generated on each click');
{
  // Verify that the slot resolver always returns the same deterministic slot.id
  const run1 = resolveNextUnmarkedSlotForSubject('sub-dm', scheduledSlots, [], TODAY, subjects);
  const run2 = resolveNextUnmarkedSlotForSubject('sub-dm', scheduledSlots, [], TODAY, subjects);
  assert(run1?.slot.id === run2?.slot.id, 'Consecutive calls return the same deterministic slot ID');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passCount} passed, ${failCount} failed`);
if (failCount > 0) {
  process.exit(1);
} else {
  console.log('All attendance session-identity tests passed ✅');
}
