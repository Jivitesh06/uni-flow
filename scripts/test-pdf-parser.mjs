import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  parseChitkaraPdf,
  computeLectureDiff,
  extractEffectiveDate,
  normalizeTimeString24,
  CHITKARA_SUBJECT_NAMES,
} from '../src/lib/chitkaraTimetableParser.ts';

console.log('===============================================================');
console.log(' UniFlow: Chitkara PDF Timetable Parser & Section Isolator Tests');
console.log('===============================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ [PASS] ${message}`);
    passedTests++;
  }
}

async function runTests() {
  const samplePdfPath = path.resolve('tests/fixtures/Time Table-BE CSE 2024 batch-5th Semester-(wef 12.10.2026).pdf');
  assert(fs.existsSync(samplePdfPath), 'Real 7-page Chitkara timetable sample PDF exists in test fixtures');

  const pdfBuffer = fs.readFileSync(samplePdfPath);
  const uint8 = new Uint8Array(pdfBuffer);

  // 1. Effective Date Extraction Test
  const filename = path.basename(samplePdfPath);
  const effDate = extractEffectiveDate(filename);
  assert(effDate === '12-10-2026', `Effective date correctly extracted as "${effDate}" from filename`);

  // 2. Normalization Time Tests
  assert(normalizeTimeString24('9:30') === '09:30', 'normalizeTimeString24 normalizes 9:30 to 09:30');
  assert(normalizeTimeString24('1:40') === '13:40', 'normalizeTimeString24 converts afternoon 1:40 to 13:40 (24h)');
  assert(normalizeTimeString24('12:50') === '12:50', 'normalizeTimeString24 handles noon 12:50 correctly');
  assert(normalizeTimeString24('3:20') === '15:20', 'normalizeTimeString24 converts afternoon 3:20 to 15:20');

  // 3. Multi-Page Section Discovery Test
  const parseResult5A = await parseChitkaraPdf(uint8, 'BE-CSE-5A', filename);
  assert(parseResult5A.success, 'Parser successfully parsed PDF for section BE-CSE-5A');
  assert(parseResult5A.sectionsFound.length === 7, `Discovered all 7 sections in PDF: ${parseResult5A.sectionsFound.join(', ')}`);
  assert(parseResult5A.sectionsFound.includes('BE-CSE-5A'), 'sectionsFound includes BE-CSE-5A');
  assert(parseResult5A.sectionsFound.includes('BE-CSE-5G'), 'sectionsFound includes BE-CSE-5G');
  assert(parseResult5A.selectedSection === 'BE-CSE-5A', 'Selected section correctly matched as BE-CSE-5A');

  // 4. Section Isolation Test (No bleeding across sections)
  assert(parseResult5A.lectures.length === 12, `Section BE-CSE-5A contains exactly 12 lectures (found ${parseResult5A.lectures.length})`);
  assert(
    parseResult5A.lectures.every((l) => l.section === 'BE-CSE-5A'),
    'Every extracted lecture belongs exclusively to section BE-CSE-5A'
  );

  // Parse Section 5B and check isolation
  const parseResult5B = await parseChitkaraPdf(uint8, 'BE-CSE-5B', filename);
  assert(parseResult5B.success, 'Parser successfully parsed PDF for section BE-CSE-5B');
  assert(parseResult5B.selectedSection === 'BE-CSE-5B', 'Selected section correctly set to BE-CSE-5B');
  assert(parseResult5B.lectures.length === 13, `Section BE-CSE-5B contains exactly 13 lectures (found ${parseResult5B.lectures.length})`);
  assert(
    parseResult5B.lectures.every((l) => l.section === 'BE-CSE-5B'),
    'Every extracted lecture belongs exclusively to section BE-CSE-5B'
  );

  // 5. Multi-Period Consecutive Class Merging Test
  // In 5A on Monday:
  // Period 1-2: NALR-I (09:30 - 11:10)
  // Period 3-4: ADI (11:10 - 12:50)
  // Period 7-8: ADI-FA (14:30 - 16:10)
  const monday5A = parseResult5A.lectures.filter((l) => l.dayOfWeek === 1);
  assert(monday5A.length === 3, `Monday for 5A has 3 distinct classes (merged from 6 periods)`);

  const nalrMonday = monday5A.find((l) => l.subjectCode === 'NALR-I');
  assert(Boolean(nalrMonday), 'NALR-I is scheduled on Monday');
  assert(nalrMonday.startTime === '09:30', `NALR-I start time is 09:30`);
  assert(nalrMonday.endTime === '11:10', `NALR-I multi-period end time is 11:10 (2 consecutive periods merged)`);
  assert(nalrMonday.faculty === 'Mr Satish', `NALR-I faculty correctly identified as Mr Satish`);
  assert(nalrMonday.room === 'CVR203R', `NALR-I room correctly identified as CVR203R`);

  const adiMonday = monday5A.find((l) => l.subjectCode === 'ADI');
  assert(Boolean(adiMonday), 'ADI is scheduled on Monday');
  assert(adiMonday.startTime === '11:10', 'ADI start time is 11:10');
  assert(adiMonday.endTime === '12:50', 'ADI multi-period end time is 12:50 (2 consecutive periods merged)');
  assert(adiMonday.room === 'RJ309R', `ADI room correctly identified as RJ309R`);
  assert(adiMonday.faculty === 'Mr Ritesh', `ADI faculty correctly identified as Mr Ritesh`);

  const adiFaMonday = monday5A.find((l) => l.subjectCode === 'ADI-FA');
  assert(Boolean(adiFaMonday), 'ADI-FA is scheduled on Monday');
  assert(adiFaMonday.startTime === '14:30', 'ADI-FA start time is 14:30');
  assert(adiFaMonday.endTime === '16:10', 'ADI-FA end time is 16:10');
  assert(adiFaMonday.room === 'RJ204R', `ADI-FA room correctly identified as RJ204R`);
  assert(adiFaMonday.faculty === 'Ms Ekta', `ADI-FA faculty correctly identified as Ms Ekta`);

  // 6. Empty Slots / Free Period Test
  // Monday Periods 5-6 (12:50 - 14:30) is lunch break: verify no ghost lectures exist
  const lunchLectures = parseResult5A.lectures.filter(
    (l) => l.dayOfWeek === 1 && l.startTime >= '12:50' && l.endTime <= '14:30'
  );
  assert(lunchLectures.length === 0, 'No ghost lectures generated during lunch break (12:50 - 14:30)');

  // Saturday: verify 0 academic classes
  const saturdayClasses = parseResult5A.lectures.filter((l) => l.dayOfWeek === 6);
  assert(saturdayClasses.length === 0, 'Saturday has 0 classes scheduled (weekend off)');

  // 7. Subject Name Mapping Dictionary Test
  assert(
    CHITKARA_SUBJECT_NAMES['ADI-FA'] === 'Applied Design & Innovation (Financial Apps)',
    'CHITKARA_SUBJECT_NAMES expands ADI-FA'
  );
  assert(
    CHITKARA_SUBJECT_NAMES['AAIPD'] === 'Applied AI Product Development',
    'CHITKARA_SUBJECT_NAMES expands AAIPD'
  );

  // 8. Timetable Diff Calculation Test
  const mockExistingSlots = [
    {
      id: 'old_1',
      dayOfWeek: 1,
      startTime: '09:30',
      endTime: '11:10',
      subjectCode: 'NALR-I',
      subjectName: 'Numerical Analysis & Linear Reasoning I',
      room: 'CVR203R',
      faculty: 'Mr Satish',
    },
    {
      id: 'old_2',
      dayOfWeek: 1,
      startTime: '11:10',
      endTime: '12:50',
      subjectCode: 'ADI',
      room: 'OLD_ROOM_101', // Different room to trigger modified
      faculty: 'Mr Ritesh',
    },
    {
      id: 'old_3',
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '09:00',
      subjectCode: 'OLD_COURSE', // Not in new schedule (08:00 is free) to trigger cancelled
    },
    {
      id: 'old_manual',
      dayOfWeek: 3,
      startTime: '17:00',
      endTime: '18:00',
      subjectCode: 'STUDY_GROUP',
      isManual: true, // Manual slot to test preservation
    },
  ];

  const diff = computeLectureDiff(mockExistingSlots, parseResult5A.lectures, true);
  assert(diff.unchanged.some((l) => l.subjectCode === 'NALR-I' && l.dayOfWeek === 1), 'Diff identifies unchanged NALR-I slot');
  assert(diff.changed.some((c) => c.oldSlot.subjectCode === 'ADI' && c.changeReason.includes('Room:')), 'Diff flags room change on ADI');
  assert(diff.cancelled.some((c) => c.subjectCode === 'OLD_COURSE'), 'Diff flags removed lecture as cancelled');
  assert(
    !diff.cancelled.some((c) => c.subjectCode === 'STUDY_GROUP'),
    'Preserve manual entries protects student-created STUDY_GROUP slot from cancellation'
  );
  assert(diff.added.length > 0, `Diff identifies ${diff.added.length} newly added slots`);

  // 9. Scanned / Empty PDF Guard Test
  const tinyBuffer = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]); // Invalid / tiny mock PDF
  const scannedResult = await parseChitkaraPdf(tinyBuffer, 'BE-CSE-5A', 'scanned.pdf');
  assert(!scannedResult.success, 'Parser rejects corrupt/scanned PDF gracefully');
  assert(scannedResult.isScanned, 'Parser flags isScanned: true for image/non-text PDF');
  assert(scannedResult.warnings.length > 0, 'Parser returns informative warning without inventing fake timetable');

  // 10. Memory Purity & Idempotency Test
  const parseResultSecond = await parseChitkaraPdf(uint8, 'BE-CSE-5A', filename);
  assert(
    JSON.stringify(parseResult5A.lectures) === JSON.stringify(parseResultSecond.lectures),
    'Parsing in memory is 100% deterministic and idempotent'
  );

  console.log('\n===============================================================');
  console.log(` Summary: ${passedTests} / ${totalTests} Tests Passed (100%)`);
  console.log(' All Chitkara PDF Parsing, Section Isolation & Diff Tests Succeeded!');
  console.log('===============================================================\n');
}

runTests().catch((err) => {
  console.error('Test runner encountered an error:', err);
  process.exit(1);
});
