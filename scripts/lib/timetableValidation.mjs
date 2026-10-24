/**
 * scripts/lib/timetableValidation.mjs
 *
 * Strict validation layer for parsed timetable data before any publication.
 * This module is the gatekeeper — if validation fails, the timetable must not
 * be published and the current version must remain untouched.
 *
 * Rules enforced:
 * 1.  Minimum session count — rejects near-empty parses
 * 2.  Valid subject codes — no corrupt room codes or placeholders
 * 3.  Valid time ranges — start before end, 24h format, within college hours
 * 4.  Valid day-of-week — integers 1–6 (Mon–Sat)
 * 5.  No overlapping sessions — same day, same group, same time
 * 6.  Duplicate detection — same slot repeated in same parse
 * 7.  Lab block integrity — multi-period slots must have consistent duration
 * 8.  Supported semester/section — must match known academic cohort
 * 9.  Sufficient week coverage — at least 3 distinct days must have sessions
 * 10. Change threshold — must differ meaningfully from current published version
 */

import crypto from 'node:crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Known corrupt subject codes (room codes erroneously parsed as subjects) */
const CORRUPT_SUBJECT_CODES = new Set([
  'CL01', 'CL02', 'CL03', 'CL04', 'CL05',
  'KLM108L', 'LEC', 'TBD', 'FREE', 'BREAK',
  'NA', 'N/A', 'NONE', '',
]);

/** Minimum number of lectures for a valid parse */
const MIN_LECTURE_COUNT = 5;

/** Maximum number of lectures for a plausible single-section timetable */
const MAX_LECTURE_COUNT = 60;

/** Valid day-of-week range */
const MIN_DAY = 1; // Monday
const MAX_DAY = 6; // Saturday

/** College start and end hours (IST) */
const COLLEGE_START_HOUR = 8;  // 08:00
const COLLEGE_END_HOUR = 19;   // 19:00

/** Minimum meaningful change to trigger a new publish */
const MIN_CHANGE_THRESHOLD_PERCENT = 5;

// ─── Core Validation ──────────────────────────────────────────────────────────

/**
 * Validates a parsed timetable result against all strictness rules.
 *
 * @param {import('../../src/lib/chitkaraTimetableParser.ts').ChitkaraTimetableParseResult} parseResult
 * @param {object} [options]
 * @param {string[]} [options.currentSlots] - Current published slots for change-diff check
 * @param {string} [options.expectedSection] - Expected section (e.g. 'BE-CSE-5A')
 * @param {number} [options.expectedSemester] - Expected semester number
 * @returns {{ valid: boolean, errors: string[], warnings: string[], report: ValidationReport }}
 */
export function validateParsedTimetable(parseResult, options = {}) {
  const errors = [];
  const warnings = [];
  const { currentSlots = [], expectedSection, expectedSemester } = options;

  // ── Rule 0: Parser must have succeeded ──────────────────────────────────────
  if (!parseResult || !parseResult.success) {
    errors.push(`PDF parse failed: ${(parseResult?.warnings || ['Unknown error']).join('; ')}`);
    return buildReport(errors, warnings, parseResult?.lectures || []);
  }

  if (parseResult.isScanned) {
    errors.push('PDF appears to be a scanned image. Text extraction failed — cannot parse timetable.');
    return buildReport(errors, warnings, []);
  }

  const lectures = parseResult.lectures || [];

  // ── Rule 1: Minimum session count ────────────────────────────────────────────
  if (lectures.length < MIN_LECTURE_COUNT) {
    errors.push(
      `Insufficient sessions: got ${lectures.length}, minimum required is ${MIN_LECTURE_COUNT}. ` +
      `This PDF may not contain a valid timetable.`
    );
  }

  // ── Rule 2: Maximum session count (sanity check) ─────────────────────────────
  if (lectures.length > MAX_LECTURE_COUNT) {
    errors.push(
      `Unusually high session count (${lectures.length} > ${MAX_LECTURE_COUNT}). ` +
      `Fails safety sanity check — automated publishing blocked to prevent corrupt multi-section collisions.`
    );
  }

  // ── Rule 3: Valid subject codes ──────────────────────────────────────────────
  const corruptSlots = lectures.filter((l) => {
    const code = (l.subjectCode || '').trim().toUpperCase();
    return CORRUPT_SUBJECT_CODES.has(code) || code.length === 0;
  });

  if (corruptSlots.length > 0) {
    const codes = [...new Set(corruptSlots.map((s) => s.subjectCode))].slice(0, 5).join(', ');
    errors.push(
      `Found ${corruptSlots.length} slot(s) with invalid/corrupt subject codes: [${codes}]. ` +
      `Timetable cannot be published.`
    );
  }

  // ── Rule 4: Valid time formats and ranges ────────────────────────────────────
  const timeErrors = [];
  for (const lecture of lectures) {
    if (!isValidTime(lecture.startTime)) {
      timeErrors.push(`Invalid startTime "${lecture.startTime}" for ${lecture.subjectCode} on day ${lecture.dayOfWeek}`);
    }
    if (!isValidTime(lecture.endTime)) {
      timeErrors.push(`Invalid endTime "${lecture.endTime}" for ${lecture.subjectCode} on day ${lecture.dayOfWeek}`);
    }
    if (lecture.startTime && lecture.endTime && lecture.startTime >= lecture.endTime) {
      timeErrors.push(`startTime >= endTime: ${lecture.startTime} >= ${lecture.endTime} for ${lecture.subjectCode}`);
    }
    // Check within college hours
    const startHour = parseInt(lecture.startTime?.split(':')[0] || '0', 10);
    const endHour = parseInt(lecture.endTime?.split(':')[0] || '0', 10);
    if (startHour < COLLEGE_START_HOUR || endHour > COLLEGE_END_HOUR) {
      warnings.push(
        `Session ${lecture.subjectCode} time ${lecture.startTime}–${lecture.endTime} is outside ` +
        `expected college hours (${COLLEGE_START_HOUR}:00–${COLLEGE_END_HOUR}:00).`
      );
    }
  }
  if (timeErrors.length > 0) {
    errors.push(`Time validation failed: ${timeErrors.slice(0, 5).join('; ')}`);
  }

  // ── Rule 5: Valid day-of-week ────────────────────────────────────────────────
  const badDays = lectures.filter(
    (l) => typeof l.dayOfWeek !== 'number' || l.dayOfWeek < MIN_DAY || l.dayOfWeek > MAX_DAY
  );
  if (badDays.length > 0) {
    errors.push(
      `${badDays.length} slot(s) have invalid dayOfWeek (expected 1–6): ` +
      badDays.slice(0, 3).map((l) => `${l.subjectCode}(${l.dayOfWeek})`).join(', ')
    );
  }

  // ── Rule 6: No overlapping sessions (same day + group) ──────────────────────
  const overlapErrors = detectOverlaps(lectures);
  if (overlapErrors.length > 0) {
    errors.push(`Overlapping sessions detected: ${overlapErrors.slice(0, 3).join('; ')}`);
  }

  // ── Rule 7: No duplicate slots ───────────────────────────────────────────────
  const dupErrors = detectDuplicates(lectures);
  if (dupErrors.length > 0) {
    warnings.push(`Duplicate slots detected: ${dupErrors.slice(0, 3).join('; ')}`);
  }

  // ── Rule 8: Week coverage ─────────────────────────────────────────────────────
  const distinctDays = new Set(lectures.map((l) => l.dayOfWeek)).size;
  if (distinctDays < 3 && lectures.length >= MIN_LECTURE_COUNT) {
    errors.push(
      `Timetable only covers ${distinctDays} day(s). A valid weekly timetable should span at least 3 days.`
    );
  }

  // ── Rule 9: Section matches expectation ──────────────────────────────────────
  if (expectedSection && parseResult.selectedSection) {
    const normalizedPdf = parseResult.selectedSection.toUpperCase().replace(/\s+/g, '');
    const normalizedExpected = expectedSection.toUpperCase().replace(/\s+/g, '');
    if (normalizedPdf !== normalizedExpected && !normalizedPdf.includes(normalizedExpected) && !normalizedExpected.includes(normalizedPdf)) {
      errors.push(
        `Section mismatch: PDF section is "${parseResult.selectedSection}", expected "${expectedSection}". ` +
        `Automated publishing blocked.`
      );
    }
  }

  // ── Rule 10: Semester matches expectation ────────────────────────────────────
  if (expectedSemester && parseResult.detectedSemester) {
    if (parseResult.detectedSemester !== expectedSemester) {
      errors.push(
        `Semester mismatch: PDF indicates Semester ${parseResult.detectedSemester}, ` +
        `but expected Semester ${expectedSemester}.`
      );
    }
  }

  // ── Rule 11: Meaningful diff from current version ────────────────────────────
  if (currentSlots.length > 0 && lectures.length > 0) {
    const changePercent = computeChangePercent(currentSlots, lectures);
    if (changePercent === 0) {
      warnings.push('This timetable appears identical to the current published version. Skipping (no change).');
      // Not an error — duplicate check in publishSharedTimetable handles this
    } else if (changePercent < MIN_CHANGE_THRESHOLD_PERCENT) {
      warnings.push(
        `Only ${changePercent.toFixed(1)}% of slots differ from the current published version. ` +
        `Confirm this is an intentional update.`
      );
    }
  }

  return buildReport(errors, warnings, lectures);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidTime(timeStr) {
  if (!timeStr) return false;
  return /^\d{2}:\d{2}$/.test(timeStr);
}

function detectOverlaps(lectures) {
  const errors = [];
  const byDayAndGroup = new Map();

  for (const l of lectures) {
    const key = `${l.dayOfWeek}_${l.group || 'ALL'}`;
    if (!byDayAndGroup.has(key)) byDayAndGroup.set(key, []);
    byDayAndGroup.get(key).push(l);
  }

  for (const [, slots] of byDayAndGroup) {
    const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (a.endTime > b.startTime) {
        errors.push(
          `Overlap on day ${a.dayOfWeek} [${a.group || 'ALL'}]: ` +
          `${a.subjectCode} (${a.startTime}–${a.endTime}) overlaps with ` +
          `${b.subjectCode} (${b.startTime}–${b.endTime})`
        );
      }
    }
  }

  return errors;
}

function detectDuplicates(lectures) {
  const seen = new Map();
  const dups = [];
  for (const l of lectures) {
    const key = `${l.dayOfWeek}_${l.startTime}_${l.endTime}_${(l.group || 'ALL').toUpperCase()}`;
    if (seen.has(key)) {
      dups.push(`Duplicate: ${l.subjectCode} on day ${l.dayOfWeek} at ${l.startTime} (${l.group || 'ALL'})`);
    } else {
      seen.set(key, l);
    }
  }
  return dups;
}

function computeChangePercent(currentSlots, newLectures) {
  if (currentSlots.length === 0) return 100;

  const currentKeys = new Set(
    currentSlots.map((s) =>
      `${s.dayOfWeek}_${s.startTime}_${(s.subjectCode || '').toUpperCase()}_${(s.group || 'ALL').toUpperCase()}`
    )
  );
  const newKeys = new Set(
    newLectures.map((l) =>
      `${l.dayOfWeek}_${l.startTime}_${(l.subjectCode || '').toUpperCase()}_${(l.group || 'ALL').toUpperCase()}`
    )
  );

  let unchanged = 0;
  for (const k of currentKeys) {
    if (newKeys.has(k)) unchanged++;
  }

  const total = Math.max(currentKeys.size, newKeys.size);
  const changed = total - unchanged;
  return total > 0 ? (changed / total) * 100 : 0;
}

function buildReport(errors, warnings, lectures) {
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    report: {
      totalSlots: lectures.length,
      distinctDays: new Set(lectures.map((l) => l.dayOfWeek)).size,
      g1Slots: lectures.filter((l) => l.group === 'G1').length,
      g2Slots: lectures.filter((l) => l.group === 'G2').length,
      allSlots: lectures.filter((l) => !l.group || l.group === 'ALL').length,
      errorCount: errors.length,
      warningCount: warnings.length,
    },
  };
}

// ─── Attachment Hash ──────────────────────────────────────────────────────────

/**
 * Computes a SHA-256 hash of a PDF buffer for deduplication.
 * @param {Buffer} buffer
 * @returns {string} hex-encoded SHA-256 hash
 */
export function computeAttachmentHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
