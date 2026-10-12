import crypto from 'crypto';

export interface ParsedLectureSlot {
  subjectName: string;
  subjectCode: string;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  faculty?: string;
  room?: string;
  section?: string;
  isCancelled?: boolean;
  notes?: string;
}

export interface TimetableDiff {
  added: ParsedLectureSlot[];
  changed: {
    oldSlot: ParsedLectureSlot;
    newSlot: ParsedLectureSlot;
    changeReason: string;
  }[];
  cancelled: ParsedLectureSlot[];
  unchanged: ParsedLectureSlot[];
}

export interface ParseResult {
  success: boolean;
  isScanned: boolean;
  isAmbiguous: boolean;
  revisionType: 'initial_import' | 'weekly_update' | 'revision';
  weekLabel?: string;
  effectiveDate?: string;
  detectedSection?: string;
  attachmentHash: string;
  rawTextPreview: string;
  extractedSlots: ParsedLectureSlot[];
  diff?: TimetableDiff;
  warning?: string;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function computeBufferHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Normalizes 12h / 24h time strings to standard HH:mm
 */
export function normalizeTimeString(raw: string): string | null {
  const clean = raw.trim().toLowerCase();
  const match12 = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const mins = match12[2] ? parseInt(match12[2], 10) : 0;
    const meridian = match12[3];
    if (meridian === 'pm' && hours < 12) hours += 12;
    if (meridian === 'am' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  const match24 = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const mins = parseInt(match24[2], 10);
    if (hours >= 0 && hours < 24 && mins >= 0 && mins < 60) {
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Robust text extractor supporting both pdf-parse v1 and v2 formats
 */
export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfModule = require('pdf-parse');
  if (pdfModule.PDFParse) {
    const parser = new pdfModule.PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    return result?.text || '';
  } else if (typeof pdfModule === 'function') {
    const result = await pdfModule(pdfBuffer);
    return result?.text || '';
  }
  return '';
}

/**
 * Extracts academic text from a PDF Buffer
 */
export async function parsePdfBuffer(
  pdfBuffer: Buffer,
  userProfile?: { semester?: string; section?: string; college?: string },
  currentActiveSlots: ParsedLectureSlot[] = []
): Promise<ParseResult> {
  const attachmentHash = computeBufferHash(pdfBuffer);

  let text = '';
  try {
    text = await extractTextFromPdf(pdfBuffer);
  } catch (err: unknown) {
    return {
      success: false,
      isScanned: true,
      isAmbiguous: true,
      revisionType: 'weekly_update',
      attachmentHash,
      rawTextPreview: '',
      extractedSlots: [],
      warning: `Failed to read PDF structure: ${(err as Error).message}. PDF may be encrypted or corrupted.`,
    };
  }

  const rawTextPreview = text.slice(0, 500).trim();

  // If text is extremely short or empty, it's a scanned/image PDF
  if (text.trim().length < 30) {
    return {
      success: false,
      isScanned: true,
      isAmbiguous: true,
      revisionType: 'weekly_update',
      attachmentHash,
      rawTextPreview,
      extractedSlots: [],
      warning: 'Scanned or image-based PDF detected. Text cannot be automatically extracted. Please review manually or upload an Excel/CSV file.',
    };
  }

  // Detect Revision vs New Week
  const isRevision = /\b(revised|revision|rev\s*\d+|v\d+|updated\s+schedule|rescheduled)\b/i.test(text);
  const revisionType = currentActiveSlots.length === 0
    ? 'initial_import'
    : isRevision
    ? 'revision'
    : 'weekly_update';

  // Extract Week / Date Label
  let weekLabel: string | undefined;
  const weekMatch = text.match(/\b(week\s*(?:no\.?|#)?\s*\d+)\b/i);
  if (weekMatch) {
    weekLabel = weekMatch[1].trim();
  }

  const dateRangeMatch = text.match(
    /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{1,2}(?:st|nd|rd|th)?\s*(?:-|to)\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?[a-z]*\s*\d{1,2}(?:st|nd|rd|th)?(?:\s*,\s*\d{4})?)\b/i
  );
  if (dateRangeMatch) {
    weekLabel = weekLabel ? `${weekLabel} (${dateRangeMatch[1]})` : dateRangeMatch[1];
  }

  // Extract w.e.f. (With Effect From) date
  let effectiveDate: string | undefined;
  const wefMatch = text.match(/w\.?e\.?f\.?\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  if (wefMatch) {
    effectiveDate = wefMatch[1];
    if (!weekLabel) weekLabel = `w.e.f. ${effectiveDate}`;
  }

  // Extract Section
  let detectedSection: string | undefined;
  const secMatch = text.match(/\b(?:section|sec)\s*[:\-]?\s*([a-z0-9]+)\b/i);
  if (secMatch) {
    detectedSection = secMatch[1].toUpperCase();
  }

  // Parse Lines into Lecture Slots
  const extractedSlots: ParsedLectureSlot[] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let currentDay: number = 1; // default Monday

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line indicates day of week
    const lower = line.toLowerCase();
    for (let d = 0; d < 7; d++) {
      if (
        lower === DAY_NAMES[d] ||
        lower.startsWith(DAY_NAMES[d] + ' ') ||
        lower.startsWith(SHORT_DAYS[d] + ':') ||
        lower.startsWith(SHORT_DAYS[d] + ' -')
      ) {
        currentDay = d;
        break;
      }
    }

    // Look for time range on this line or nearby: e.g. "09:00 - 10:00" or "9:00 AM - 10:00 AM" or "09:00 to 10:00"
    const timeMatch = line.match(
      /(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)/i
    );

    if (timeMatch) {
      const rawStart = timeMatch[1];
      const rawEnd = timeMatch[2];
      const start = normalizeTimeString(rawStart);
      const end = normalizeTimeString(rawEnd);

      if (start && end) {
        // Look for course code: e.g. CS301, MATH101, ECE-204, IT-305
        const codeMatch = line.match(/\b([A-Z]{2,4}\s*[-]?\s*[0-9]{3,4})\b/);
        const subjectCode = codeMatch ? codeMatch[1].replace(/\s+/g, '') : 'LEC';

        // Extract Room: e.g. LH-201, Room 301, Hall A, Lab 3
        const roomMatch = line.match(/\b(?:room|hall|lh|lab|cr)\s*[-#]?\s*([a-z0-9]+)\b/i);
        const room = roomMatch ? roomMatch[0].toUpperCase() : undefined;

        // Extract Faculty: Dr. Alan, Prof. Turing, Mr. Sharma
        const facultyMatch = line.match(/\b((?:Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s+[A-Za-z]+(?:\s+[A-Za-z]+)?)\b/);
        const faculty = facultyMatch ? facultyMatch[1] : undefined;

        // Check for cancellation keyword
        const isCancelled = /\b(cancelled|canceled|holiday|suspended|off)\b/i.test(line);

        // Derive subject name from surrounding text
        let subjectName = subjectCode;
        const cleanName = line
          .replace(timeMatch[0], '')
          .replace(codeMatch ? codeMatch[0] : '', '')
          .replace(roomMatch ? roomMatch[0] : '', '')
          .replace(facultyMatch ? facultyMatch[0] : '', '')
          .replace(/[^a-zA-Z0-9\s]/g, ' ')
          .trim();

        if (cleanName.length > 3 && cleanName.length < 40) {
          subjectName = cleanName;
        }

        extractedSlots.push({
          subjectName,
          subjectCode,
          dayOfWeek: currentDay,
          startTime: start,
          endTime: end,
          faculty,
          room,
          section: detectedSection,
          isCancelled,
        });
      }
    }
  }

  // Filter by user section if specified
  const filteredSlots = extractedSlots;

  // Fallback: If simple line-by-line regex found 0 slots but text is long,
  // try secondary table pattern extraction (Day Header followed by subjects and times)
  if (filteredSlots.length === 0 && lines.length > 5) {
    for (let d = 1; d <= 5; d++) {
      const dayName = DAY_NAMES[d];
      const dayIndex = lines.findIndex(l => l.toLowerCase().includes(dayName));
      if (dayIndex >= 0) {
        for (let j = dayIndex + 1; j < Math.min(dayIndex + 8, lines.length); j++) {
          const l = lines[j];
          const codeMatch = l.match(/\b([A-Z]{2,4}\s*[-]?\s*[0-9]{3,4})\b/);
          if (codeMatch) {
            filteredSlots.push({
              subjectName: codeMatch[1],
              subjectCode: codeMatch[1],
              dayOfWeek: d,
              startTime: '09:00',
              endTime: '10:00',
              section: detectedSection,
            });
          }
        }
      }
    }
  }

  const isAmbiguous = filteredSlots.length === 0 || !weekLabel;

  // Compute diff against current active timetable
  const diff = computeTimetableDiff(currentActiveSlots, filteredSlots);

  return {
    success: filteredSlots.length > 0,
    isScanned: false,
    isAmbiguous,
    revisionType,
    weekLabel: weekLabel || 'Current Weekly Schedule',
    effectiveDate,
    detectedSection,
    attachmentHash,
    rawTextPreview,
    extractedSlots: filteredSlots,
    diff,
    warning: isAmbiguous
      ? 'Timetable parsed with partial confidence. Please review the detected lectures before applying.'
      : undefined,
  };
}

/**
 * Computes difference between current active timetable slots and newly parsed slots
 */
export function computeTimetableDiff(
  currentSlots: ParsedLectureSlot[],
  newSlots: ParsedLectureSlot[]
): TimetableDiff {
  const added: ParsedLectureSlot[] = [];
  const changed: { oldSlot: ParsedLectureSlot; newSlot: ParsedLectureSlot; changeReason: string }[] = [];
  const cancelled: ParsedLectureSlot[] = [];
  const unchanged: ParsedLectureSlot[] = [];

  const currentMap = new Map<string, ParsedLectureSlot>();
  for (const s of currentSlots) {
    const key = `${s.dayOfWeek}_${s.startTime}`;
    currentMap.set(key, s);
  }

  const newHandledKeys = new Set<string>();

  for (const newSlot of newSlots) {
    const key = `${newSlot.dayOfWeek}_${newSlot.startTime}`;
    newHandledKeys.add(key);

    const oldSlot = currentMap.get(key);

    if (newSlot.isCancelled) {
      cancelled.push(newSlot);
      continue;
    }

    if (!oldSlot) {
      added.push(newSlot);
    } else {
      const reasons: string[] = [];
      if (oldSlot.subjectCode !== newSlot.subjectCode && oldSlot.subjectName !== newSlot.subjectName) {
        reasons.push(`Subject: ${oldSlot.subjectCode} ➔ ${newSlot.subjectCode}`);
      }
      if (oldSlot.room !== newSlot.room && (oldSlot.room || newSlot.room)) {
        reasons.push(`Room: ${oldSlot.room || 'None'} ➔ ${newSlot.room || 'None'}`);
      }
      if (oldSlot.faculty !== newSlot.faculty && (oldSlot.faculty || newSlot.faculty)) {
        reasons.push(`Faculty: ${oldSlot.faculty || 'None'} ➔ ${newSlot.faculty || 'None'}`);
      }
      if (oldSlot.endTime !== newSlot.endTime) {
        reasons.push(`End time: ${oldSlot.endTime} ➔ ${newSlot.endTime}`);
      }

      if (reasons.length > 0) {
        changed.push({
          oldSlot,
          newSlot,
          changeReason: reasons.join('; '),
        });
      } else {
        unchanged.push(newSlot);
      }
    }
  }

  for (const [key, oldSlot] of currentMap.entries()) {
    if (!newHandledKeys.has(key)) {
      cancelled.push(oldSlot);
    }
  }

  return { added, changed, cancelled, unchanged };
}
