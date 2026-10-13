/**
 * UniFlow — Multi-Semester Shared Timetable Seeder & Publisher
 *
 * Seeds authoritative departmental timetables for Semester 1, 3, and 5 from real PDF fixtures:
 * 1. Time Table-BE CSE 2024 batch-5th Semester-(wef 12.10.2026).pdf (Sem 5, Sections 5A-5G)
 * 2. BE CSE 3rd sem Section Wise.pdf (Sem 3, Sections 3A-3D)
 * 3. BE CSE 1st sem.pdf (Sem 1, Sections 1A-1D)
 *
 * Usage:
 *   node scripts/seed-5th-sem-shared-timetables.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChitkaraPdf } from '../src/lib/chitkaraTimetableParser.ts';
import {
  buildSharedGroupId,
  buildSharedGroupLabel,
  computeTimetableContentHash,
} from '../src/lib/sharedTimetable.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const FIXTURES = [
  {
    path: path.join(
      projectRoot,
      'tests',
      'fixtures',
      'Time Table-BE CSE 2024 batch-5th Semester-(wef 12.10.2026).pdf'
    ),
    defaultSem: 5,
    defaultBatch: '2024',
    effectiveDate: '12-10-2026',
  },
  {
    path: path.join(
      projectRoot,
      'tests',
      'fixtures',
      'BE CSE 3rd sem Section Wise.pdf'
    ),
    defaultSem: 3,
    defaultBatch: '2025',
    effectiveDate: '28-09-2026',
  },
  {
    path: path.join(
      projectRoot,
      'tests',
      'fixtures',
      'BE CSE 1st sem.pdf'
    ),
    defaultSem: 1,
    defaultBatch: '2026',
    effectiveDate: '18-09-2026',
  },
];

export async function generateSeededTimetables() {
  const seededDocs = {};
  const allSectionsFound = [];

  for (const fixture of FIXTURES) {
    if (!fs.existsSync(fixture.path)) {
      console.warn(`[SKIP] Fixture not found: ${fixture.path}`);
      continue;
    }

    const pdfBuffer = fs.readFileSync(fixture.path);
    const uint8 = new Uint8Array(pdfBuffer);
    const fixtureName = path.basename(fixture.path);

    const initial = await parseChitkaraPdf(uint8, undefined, fixtureName);
    const sectionsFound = initial.sectionsFound || [];

    for (const fullSec of sectionsFound) {
      allSectionsFound.push(fullSec);
      const parsed = await parseChitkaraPdf(uint8, fullSec, fixtureName);

      const semNum = parsed.detectedSemester || fixture.defaultSem;
      const detectedBatch = parsed.detectedBatch || fixture.defaultBatch;
      const secLetter = parsed.detectedSectionLetter || fullSec.replace(/^BE-CSE-\d+/i, '').toUpperCase();

      const groupParams = {
        institution: 'Chitkara University',
        program: 'BE-CSE',
        batch: detectedBatch,
        semester: semNum,
        section: secLetter,
      };

      const groupId = buildSharedGroupId(groupParams);
      const groupLabel = buildSharedGroupLabel(groupParams);

      const slots = parsed.lectures.map((l, idx) => ({
        id: `seed_${semNum}${secLetter.toLowerCase()}_${idx + 1}`,
        subjectCode: l.subjectCode,
        subjectName: l.subjectName,
        faculty: l.faculty,
        room: l.room,
        dayOfWeek: l.dayOfWeek,
        startTime: l.startTime,
        endTime: l.endTime,
        color: l.color,
        group: l.group || 'ALL',
        periods: l.periods,
        weight: l.weight,
        isNonAcademic: l.isNonAcademic,
        isFreePeriod: l.isFreePeriod,
        requiresReview: l.requiresReview || false,
      }));

      const effDate = parsed.effectiveDate || fixture.effectiveDate;
      const contentHash = computeTimetableContentHash(slots, effDate);

      const docData = {
        id: groupId,
        groupLabel,
        institution: 'Chitkara University',
        program: 'BE-CSE',
        batch: detectedBatch,
        semester: semNum,
        section: fullSec,
        version: 1,
        effectiveDate: effDate,
        contentHash,
        slots,
        publishedAt: null,
        publishedBy: 'system-seed',
        publishedByName: 'CSED Department Office',
        publisherRole: 'publisher',
        updatedAt: null,
        createdAt: null,
      };

      seededDocs[groupId] = docData;

      // Also create alias with batch 2024 if different, ensuring backward compatibility for legacy profile students
      if (detectedBatch !== '2024') {
        const legacyParams = {
          institution: 'Chitkara University',
          program: 'BE-CSE',
          batch: '2024',
          semester: semNum,
          section: secLetter,
        };
        const legacyGroupId = buildSharedGroupId(legacyParams);
        const legacyGroupLabel = buildSharedGroupLabel(legacyParams);
        seededDocs[legacyGroupId] = {
          ...docData,
          id: legacyGroupId,
          batch: '2024',
          groupLabel: legacyGroupLabel,
        };
      }
    }
  }

  return { seededDocs, sectionsFound: allSectionsFound };
}

async function main() {
  console.log('\n===============================================================');
  console.log(' UniFlow: Multi-Semester Shared Timetable Seeder & Publisher');
  console.log('===============================================================\n');

  const { seededDocs, sectionsFound } = await generateSeededTimetables();

  console.log(`✓ Discovered ${sectionsFound.length} sections across fixtures: ${sectionsFound.join(', ')}`);

  // Write TypeScript dataset file for frontend bundle fallback
  const tsContent = `/**
 * Pre-seeded Multi-Semester Departmental Timetables (Semesters 1, 3, and 5)
 * Auto-generated by scripts/seed-5th-sem-shared-timetables.mjs
 * 
 * Provides 0ms instant timetable display upon student registration across all semesters
 * without requiring Google Cloud Console setup, Gmail OAuth, or manual PDF upload.
 */

import type { SharedTimetableDoc } from '../lib/sharedTimetable.ts';

export const SEEDED_SHARED_TIMETABLES: Record<string, SharedTimetableDoc> = ${JSON.stringify(
    seededDocs,
    null,
    2
  )};

// Backward compatibility export for existing modules & tests
export const SEEDED_5TH_SEM_TIMETABLES: Record<string, SharedTimetableDoc> = SEEDED_SHARED_TIMETABLES;
`;

  const tsFilePath = path.join(projectRoot, 'src', 'data', 'seededSharedTimetables.ts');
  const jsonFilePath = path.join(projectRoot, 'src', 'data', 'seededSharedTimetables.json');

  fs.mkdirSync(path.dirname(tsFilePath), { recursive: true });
  fs.writeFileSync(tsFilePath, tsContent, 'utf-8');
  fs.writeFileSync(jsonFilePath, JSON.stringify(seededDocs, null, 2), 'utf-8');

  console.log(`✓ Wrote client dataset to ${path.relative(projectRoot, tsFilePath)}`);
  console.log(`✓ Wrote JSON dataset to ${path.relative(projectRoot, jsonFilePath)}`);

  for (const [id, doc] of Object.entries(seededDocs)) {
    console.log(`  - Section ${doc.section} (Sem ${doc.semester}, Batch ${doc.batch}): ${doc.slots.length} slots | ID: ${id}`);
  }

  console.log('\n===============================================================');
  console.log(' All Semesters (1, 3, 5) Successfully Seeded and Linked!');
  console.log('===============================================================\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
}
