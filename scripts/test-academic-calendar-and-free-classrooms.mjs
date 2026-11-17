import assert from 'node:assert/strict';
import {
  FALL_SEMESTER_2026_EVENTS,
  CURRENT_ACADEMIC_SESSION,
  toISODateKey,
  getEventTemporalStatus,
  getUpcomingHolidays,
  getNextUpcomingHoliday,
  groupEventsByMonth,
} from '../src/data/academicCalendar.ts';
import {
  calculateFreeClassrooms,
  normalizeRoomIdentifier,
  extractKnownRoomInventory,
  getAllDiscoveredTimetableDocs,
  registerLiveTimetableDocs,
  resetLiveTimetableDocsRegistry,
} from '../src/lib/roomAvailability.ts';

console.log('======================================================================');
console.log(' UNIFLOW ACADEMIC CALENDAR & FREE CLASSROOM FINDER TEST SUITE');
console.log('======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS ${totalTests}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL ${totalTests}] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------
// 1. ACADEMIC CALENDAR & UPCOMING HOLIDAYS TESTS
// -----------------------------------------------------------------------------
console.log('--- 1. Academic Calendar & Holiday Rules ---');

runTest('Official Fall 2026 session events are loaded with correct dates', () => {
  assert.equal(CURRENT_ACADEMIC_SESSION.id, 'fall-2026');
  assert.ok(FALL_SEMESTER_2026_EVENTS.length >= 12);
  
  // Independence Day
  const iday = FALL_SEMESTER_2026_EVENTS.find(e => e.id === 'fall2026-holiday-independence-day');
  assert.ok(iday);
  assert.equal(iday.startDate, '2026-08-15');
  assert.equal(iday.category, 'holiday');

  // Gandhi Jayanti
  const gandhi = FALL_SEMESTER_2026_EVENTS.find(e => e.id === 'fall2026-holiday-gandhi-jayanti');
  assert.ok(gandhi);
  assert.equal(gandhi.startDate, '2026-10-02');
});

runTest('Multi-day holiday ranges (Dussehra, Diwali, Winter Break) preserve exact start and end dates', () => {
  const dussehra = FALL_SEMESTER_2026_EVENTS.find(e => e.id === 'fall2026-holiday-dussehra');
  assert.ok(dussehra);
  assert.equal(dussehra.startDate, '2026-10-19');
  assert.equal(dussehra.endDate, '2026-10-20');

  const diwali = FALL_SEMESTER_2026_EVENTS.find(e => e.id === 'fall2026-holiday-diwali-break');
  assert.ok(diwali);
  assert.equal(diwali.startDate, '2026-11-07');
  assert.equal(diwali.endDate, '2026-11-11');

  const winter = FALL_SEMESTER_2026_EVENTS.find(e => e.id === 'fall2026-winter-break');
  assert.ok(winter);
  assert.equal(winter.startDate, '2026-12-31');
  assert.equal(winter.endDate, '2027-01-10');
});

runTest('Working Saturdays are modeled as working events with official timetable and off-day remarks', () => {
  const wsSep19 = FALL_SEMESTER_2026_EVENTS.find(e => e.id === 'fall2026-working-sat-sep-19');
  assert.ok(wsSep19);
  assert.equal(wsSep19.category, 'working_saturday');
  assert.equal(wsSep19.timetableFollowed, 'Friday timetable');
  assert.ok(wsSep19.officialRemarks.includes('Friday timetable is observed'));

  const wsOct10 = FALL_SEMESTER_2026_EVENTS.find(e => e.id === 'fall2026-working-sat-oct-10');
  assert.ok(wsOct10);
  assert.equal(wsOct10.category, 'working_saturday');
  assert.equal(wsOct10.timetableFollowed, 'Monday timetable');
  assert.equal(wsOct10.substitutedOffDay, 'October 3, 2026');

  const wsNov14 = FALL_SEMESTER_2026_EVENTS.find(e => e.id === 'fall2026-working-sat-nov-14');
  assert.ok(wsNov14);
  assert.equal(wsNov14.category, 'working_saturday');
  assert.equal(wsNov14.timetableFollowed, 'Tuesday timetable');
  assert.equal(wsNov14.substitutedOffDay, 'November 7, 2026');
});

runTest('Upcoming holidays sorting excludes past events and chronologically orders future events', () => {
  // Simulate date as 2026-10-14
  const mockNow = new Date('2026-10-14T09:00:00');
  const upcoming = getUpcomingHolidays(FALL_SEMESTER_2026_EVENTS, mockNow);

  // Gandhi Jayanti (Oct 2) and Janmashtami (Sep 4) must NOT be in upcoming list
  assert.ok(!upcoming.some(e => e.id === 'fall2026-holiday-gandhi-jayanti'));
  assert.ok(!upcoming.some(e => e.id === 'fall2026-holiday-janmashtami'));

  // First upcoming should be Dussehra (Oct 19)
  assert.equal(upcoming[0].id, 'fall2026-holiday-dussehra');
  // Followed by Diwali Break (Nov 7)
  assert.equal(upcoming[1].id, 'fall2026-holiday-diwali-break');
  // Next upcoming holiday single helper matches Dussehra
  const next = getNextUpcomingHoliday(FALL_SEMESTER_2026_EVENTS, mockNow);
  assert.equal(next?.id, 'fall2026-holiday-dussehra');
});

runTest('Common university holidays apply to all students (applicableCohorts: ALL)', () => {
  const holidays = FALL_SEMESTER_2026_EVENTS.filter(e => e.category === 'holiday');
  for (const h of holidays) {
    assert.ok(h.applicableCohorts?.includes('ALL'), `${h.title} should apply to ALL students`);
  }
});

runTest('Events grouped by month maintain chronological order across 2026 and 2027', () => {
  const groups = groupEventsByMonth(FALL_SEMESTER_2026_EVENTS);
  const keys = groups.map(g => g.sortKey);
  // Verify monotonic increase
  for (let i = 1; i < keys.length; i++) {
    assert.ok(keys[i] > keys[i - 1], `Month keys should be sorted: ${keys[i - 1]} < ${keys[i]}`);
  }
  // Check boundary crossing to January 2027
  assert.ok(keys.includes('2026-12'));
  assert.ok(keys.includes('2027-01'));
});

// -----------------------------------------------------------------------------
// 2. FREE CLASSROOM FINDER LOGIC TESTS
// -----------------------------------------------------------------------------
console.log('\n--- 2. Free Classroom Finder Room Occupancy & Completeness ---');

runTest('Room identifier normalization unifies casing, spacing and punctuation', () => {
  assert.equal(normalizeRoomIdentifier(' rj 204 r '), 'RJ204R');
  assert.equal(normalizeRoomIdentifier('cvr-303r'), 'CVR303R');
  assert.equal(normalizeRoomIdentifier('RJ_309_R'), 'RJ309R');
  assert.equal(normalizeRoomIdentifier('Library'), 'LIBRARY');
  assert.equal(normalizeRoomIdentifier(''), '');
});

runTest('All discovered timetables ingest Semesters 1, 3, and 5 successfully', () => {
  const { docs, isComplete } = getAllDiscoveredTimetableDocs();
  assert.ok(isComplete, 'Discovered docs should be complete');
  assert.ok(docs.length >= 10, 'Should contain all seeded departmental sections');

  const sems = new Set(docs.map(d => d.semester));
  assert.ok(sems.has(1), 'Should include Semester 1');
  assert.ok(sems.has(3), 'Should include Semester 3');
  assert.ok(sems.has(5), 'Should include Semester 5');

  const rooms = extractKnownRoomInventory(docs);
  assert.ok(rooms.includes('RJ204R'));
  assert.ok(rooms.includes('CVR303R'));
  assert.ok(rooms.includes('RJ310R'));
});

runTest('A room occupied by another section or semester is accurately flagged as occupied', () => {
  // Create test scenario: Section 5C occupies RJ204R from 10:00 to 11:40 on Wednesday (dayOfWeek = 3)
  const mockDocs = [
    {
      id: 'mock_5c',
      section: 'BE-CSE-5C',
      semester: 5,
      slots: [
        {
          subjectCode: 'AAIPD',
          room: 'RJ204R',
          dayOfWeek: 3,
          startTime: '10:00',
          endTime: '11:40', // 100 min lab
          isActive: true,
        },
      ],
    },
    {
      id: 'mock_1a',
      section: 'BE-CSE-1A',
      semester: 1,
      slots: [
        {
          subjectCode: 'PHY101',
          room: 'CVR303R',
          dayOfWeek: 3,
          startTime: '09:00',
          endTime: '09:50',
          isActive: true,
        },
      ],
    },
  ];

  // Test at 10:30 on Wednesday -> RJ204R must be occupied by Section 5C, CVR303R must be free
  const testDate = new Date(2026, 9, 14, 10, 30); // Wednesday, dayOfWeek = 3
  const res = calculateFreeClassrooms(testDate, mockDocs);

  const rj204r = res.allRooms.find(r => r.room === 'RJ204R');
  assert.ok(rj204r);
  assert.equal(rj204r.isFree, false);
  assert.equal(rj204r.currentClass?.subjectCode, 'AAIPD');
  assert.equal(rj204r.currentClass?.section, 'BE-CSE-5C');

  const cvr303r = res.allRooms.find(r => r.room === 'CVR303R');
  assert.ok(cvr303r);
  assert.equal(cvr303r.isFree, true);
});

runTest('Multi-period labs occupy the room for the entire duration (start-inclusive, end-exclusive)', () => {
  const mockDocs = [
    {
      id: 'mock_lab',
      section: 'BE-CSE-5A',
      slots: [
        {
          subjectCode: 'OS-LAB',
          room: 'CL01',
          dayOfWeek: 2,
          startTime: '09:00',
          endTime: '10:40',
          isActive: true,
        },
      ],
    },
  ];

  // At 09:00 (exact start) -> occupied
  const atStart = calculateFreeClassrooms(new Date(2026, 9, 13, 9, 0), mockDocs);
  assert.equal(atStart.allRooms.find(r => r.room === 'CL01')?.isFree, false);

  // At 10:39 (inside lab) -> occupied
  const inside = calculateFreeClassrooms(new Date(2026, 9, 13, 10, 39), mockDocs);
  assert.equal(inside.allRooms.find(r => r.room === 'CL01')?.isFree, false);

  // At 10:40 (exact end) -> free! (end-exclusive boundary)
  const atEnd = calculateFreeClassrooms(new Date(2026, 9, 13, 10, 40), mockDocs);
  assert.equal(atEnd.allRooms.find(r => r.room === 'CL01')?.isFree, true);
});

runTest('Incomplete or missing timetable data triggers warning and never makes false free claims', () => {
  // Empty docs array
  const emptyRes = calculateFreeClassrooms(new Date(), []);
  assert.equal(emptyRes.isCoverageComplete, false);
  assert.equal(emptyRes.freeRoomsCount, 0);
  assert.ok(emptyRes.coverageWarning);
});

runTest('Future timetable additions are automatically aggregated without modifying room availability logic', () => {
  const dynamicDocs = [
    {
      id: 'future_sem7_7a',
      section: 'BE-CSE-7A',
      semester: 7,
      slots: [
        {
          subjectCode: 'CAPSTONE',
          room: 'NEW_LAB_99',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '12:00',
          isActive: true,
        },
      ],
    },
  ];

  const res = calculateFreeClassrooms(new Date(2026, 9, 12, 10, 0), dynamicDocs);
  assert.ok(res.allRooms.some(r => r.room === 'NEWLAB99'), 'Should automatically discover and include NEWLAB99');
  assert.equal(res.allRooms.find(r => r.room === 'NEWLAB99')?.isFree, false);
});

runTest('Live database timetable updates override older versions and dynamically swap room occupancy', () => {
  // Baseline: Section 5A originally occupied RJ204R at 14:30 on Monday (dayOfWeek = 1)
  // Updated DB timetable: Section 5A shifted to RJ310R at 14:30, making RJ204R free!
  const updatedDbDocs = [
    {
      id: 'chitkara-university_be-cse_2024_sem5_be-cse-5a',
      section: 'BE-CSE-5A',
      semester: 5,
      version: 2,
      slots: [
        {
          id: 'v2_slot_1',
          subjectCode: 'ADI-FA',
          room: 'RJ310R', // Shifted from RJ204R to RJ310R
          dayOfWeek: 1,
          startTime: '14:30',
          endTime: '16:10',
          isActive: true,
        },
      ],
    },
  ];

  // At 15:00 on Monday (dayOfWeek = 1)
  const mondayAt3pm = new Date(2026, 9, 12, 15, 0); // Monday Oct 12, 2026 15:00
  const result = calculateFreeClassrooms(mondayAt3pm, updatedDbDocs);

  // RJ310R must be occupied by Section 5A
  const rj310r = result.allRooms.find(r => r.room === 'RJ310R');
  assert.ok(rj310r, 'RJ310R should be tracked');
  assert.equal(rj310r.isFree, false, 'RJ310R must be occupied by the updated schedule');
  assert.equal(rj310r.currentClass?.subjectCode, 'ADI-FA');
  assert.equal(rj310r.currentClass?.section, 'BE-CSE-5A');
  assert.equal(rj310r.currentClass?.endTime, '16:10');
});

runTest('In-memory live doc registry automatically supplies updated DB timetables to calculateFreeClassrooms', () => {
  try {
    const liveDocsFromDb = [
      {
        id: 'chitkara-university_be-cse_2024_sem5_be-cse-5c',
        section: 'BE-CSE-5C',
        semester: 5,
        version: 3,
        slots: [
          {
            id: 'live_slot_5c',
            subjectCode: 'CLOUD-LAB',
            room: 'LAB_CL99',
            dayOfWeek: 2, // Tuesday
            startTime: '10:00',
            endTime: '11:40',
            isActive: true,
          },
        ],
      },
    ];

    // Register live docs from Firestore
    registerLiveTimetableDocs(liveDocsFromDb);

    // Call calculateFreeClassrooms with NO custom docs argument (mirrors global UI callers)
    const tuesdayAt1030 = new Date(2026, 9, 13, 10, 30); // Tuesday 10:30
    const result = calculateFreeClassrooms(tuesdayAt1030);

    const cl99 = result.allRooms.find(r => r.room === 'LABCL99');
    assert.ok(cl99, 'LABCL99 should be tracked from registered live docs');
    assert.equal(cl99.isFree, false, 'LABCL99 must be occupied by live CLOUD-LAB session');
    assert.equal(cl99.currentClass?.subjectCode, 'CLOUD-LAB');
  } finally {
    resetLiveTimetableDocsRegistry();
  }
});

runTest('Cancelled or inactive classes (isActive: false) in updated DB timetable free up the room immediately', () => {
  const cancelledDoc = [
    {
      id: 'mock_cancelled',
      section: 'BE-CSE-5B',
      semester: 5,
      slots: [
        {
          subjectCode: 'CANCELLED-LEC',
          room: 'RJ204R',
          dayOfWeek: 3, // Wednesday
          startTime: '09:00',
          endTime: '09:50',
          isActive: false, // Class cancelled in updated DB timetable
        },
      ],
    },
  ];

  const wednesdayAt930 = new Date(2026, 9, 14, 9, 30);
  const result = calculateFreeClassrooms(wednesdayAt930, cancelledDoc);
  const rj204r = result.allRooms.find(r => r.room === 'RJ204R');
  assert.ok(rj204r);
  assert.equal(rj204r.isFree, true, 'Inactive/cancelled class must leave room free');
});

runTest('Free room inspection calculates correct nextClass subject, time, and remaining duration', () => {
  const scheduleWithGap = [
    {
      id: 'mock_gap_schedule',
      section: 'BE-CSE-5A',
      slots: [
        {
          subjectCode: 'NETWORKS',
          room: 'RJ309R',
          dayOfWeek: 4, // Thursday
          startTime: '14:30',
          endTime: '15:20',
          isActive: true,
        },
      ],
    },
  ];

  // At 12:00 on Thursday (2h 30m = 150m before class)
  const thursdayAtNoon = new Date(2026, 9, 15, 12, 0);
  const result = calculateFreeClassrooms(thursdayAtNoon, scheduleWithGap);
  const rj309r = result.allRooms.find(r => r.room === 'RJ309R');

  assert.ok(rj309r);
  assert.equal(rj309r.isFree, true);
  assert.equal(rj309r.nextClass?.subjectCode, 'NETWORKS');
  assert.equal(rj309r.nextClass?.startTime, '14:30');
  assert.equal(rj309r.freeDurationMinutes, 150); // 12:00 to 14:30 = 150 minutes
});

runTest('Non-physical virtual room codes (TBA, ONLINE, NONE) are never tracked as physical rooms', () => {
  const virtualDoc = [
    {
      id: 'mock_virtual',
      section: 'BE-CSE-1A',
      slots: [
        {
          subjectCode: 'MOOC101',
          room: 'ONLINE',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00',
          isActive: true,
        },
        {
          subjectCode: 'SEMINAR',
          room: 'TBA',
          dayOfWeek: 1,
          startTime: '10:00',
          endTime: '11:00',
          isActive: true,
        },
      ],
    },
  ];

  const rooms = extractKnownRoomInventory(virtualDoc);
  assert.equal(rooms.length, 0, 'Virtual rooms must be excluded from inventory');

  const result = calculateFreeClassrooms(new Date(2026, 9, 12, 9, 30), virtualDoc);
  assert.ok(!result.allRooms.some(r => r.room === 'ONLINE' || r.room === 'TBA'));
});

console.log('\n======================================================================');
console.log(` SUMMARY: ${passedTests} / ${totalTests} Tests Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log(' All Academic Calendar & Free Classroom tests verified! 🚀');
console.log('======================================================================\n');
