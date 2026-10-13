import * as pdfjsLib from 'pdfjs-dist';
import { parseSectionDetails, normalizeSemester } from './collegeEmail.ts';

// Configure pdfjs worker for Vite / browser environment
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    // Fallback if URL constructor fails in test environment
  }
}

export type TimetableGroupScope = 'ALL' | 'G1' | 'G2';

export interface ExtractedLecture {
  id: string;
  dayOfWeek: number; // 0=Sun, 1=Mon, 2=Tue, ..., 6=Sat
  dayName: string;
  startTime: string; // HH:mm 24h
  endTime: string;   // HH:mm 24h
  subjectCode: string;
  subjectName: string;
  faculty: string;
  room: string;
  section: string;
  group: TimetableGroupScope; // 'G1' | 'G2' | 'ALL'
  periods?: number;
  weight?: number;
  durationMinutes?: number;
  requiresReview?: boolean;
  reviewReason?: string;
  color?: string;
  isNonAcademic?: boolean;
  isFreePeriod?: boolean;
}

/**
 * Detects whether a string is or contains a group label (Group 1, Group 2, G1, G2, etc.)
 */
export function detectGroupInString(str: string): {
  group: TimetableGroupScope | null;
  detectedGroup: TimetableGroupScope | null;
  isPureLabel: boolean;
  cleanedText: string;
  cleanedString: string;
  ambiguous: boolean;
  requiresReview: boolean;
  reviewReason?: string;
} {
  const trimmed = str.trim();

  // Check for ambiguous multiple groups (e.g. "Group 1 & Group 2", "G1/G2", "G1 and G2", "Group 1, Group 2")
  const hasG1 = /(?:GROUP[\s_-]*1|G[\s_-]*1|GR\.?[\s_-]*1|BATCH[\s_-]*1)/i.test(trimmed);
  const hasG2 = /(?:GROUP[\s_-]*2|G[\s_-]*2|GR\.?[\s_-]*2|BATCH[\s_-]*2)/i.test(trimmed);
  if (hasG1 && hasG2) {
    return {
      group: null,
      detectedGroup: null,
      isPureLabel: true,
      cleanedText: trimmed,
      cleanedString: trimmed,
      ambiguous: true,
      requiresReview: true,
      reviewReason: 'Ambiguous: multiple groups referenced',
    };
  }

  // Ambiguous group label (e.g. "Group", "Gr", "Batch" without a number, or Group 3+)
  if (/^(?:GROUP|BATCH|GR\.?)$/i.test(trimmed) || /(?:GROUP|BATCH|GR\.?)[\s_-]*[3-9]/i.test(trimmed)) {
    return {
      group: null,
      detectedGroup: null,
      isPureLabel: true,
      cleanedText: trimmed,
      cleanedString: trimmed,
      ambiguous: true,
      requiresReview: true,
      reviewReason: 'Ambiguous or unassigned group number',
    };
  }

  // Pure group 1
  if (/^(?:GROUP[\s_-]*1|G[\s_-]*1|GR\.?[\s_-]*1|BATCH[\s_-]*1|B1|GRP[\s_-]*1)$/i.test(trimmed)) {
    return {
      group: 'G1',
      detectedGroup: 'G1',
      isPureLabel: true,
      cleanedText: '',
      cleanedString: '',
      ambiguous: false,
      requiresReview: false,
    };
  }
  // Pure group 2
  if (/^(?:GROUP[\s_-]*2|G[\s_-]*2|GR\.?[\s_-]*2|BATCH[\s_-]*2|B2|GRP[\s_-]*2)$/i.test(trimmed)) {
    return {
      group: 'G2',
      detectedGroup: 'G2',
      isPureLabel: true,
      cleanedText: '',
      cleanedString: '',
      ambiguous: false,
      requiresReview: false,
    };
  }
  // Pure ALL / whole section
  if (/^(?:ALL|BOTH|COMBINED|WHOLE[\s_-]*SECTION|ENTIRE[\s_-]*SECTION)$/i.test(trimmed)) {
    return {
      group: 'ALL',
      detectedGroup: 'ALL',
      isPureLabel: true,
      cleanedText: '',
      cleanedString: '',
      ambiguous: false,
      requiresReview: false,
    };
  }

  // Embedded G1 (e.g. "DAA-Lab (G1)" or "DAA-G1" or "CS501 [Group 1]")
  if (/(?:[\s(_\-[\]]|^)(?:GROUP[\s_-]*1|G[\s_-]*1|GR\.?[\s_-]*1|BATCH[\s_-]*1)(?:[\s)_\-[\]]|$)/i.test(trimmed)) {
    const cleaned = trimmed
      .replace(/(?:[\s(_\-[\]]|^)(?:GROUP[\s_-]*1|G[\s_-]*1|GR\.?[\s_-]*1|BATCH[\s_-]*1)(?:[\s)_\-[\]]|$)/gi, ' ')
      .replace(/[()[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      group: 'G1',
      detectedGroup: 'G1',
      isPureLabel: false,
      cleanedText: cleaned,
      cleanedString: cleaned,
      ambiguous: false,
      requiresReview: false,
    };
  }
  // Embedded G2 (e.g. "OS-Lab (G2)" or "OS-G2" or "CS501 [Group 2]")
  if (/(?:[\s(_\-[\]]|^)(?:GROUP[\s_-]*2|G[\s_-]*2|GR\.?[\s_-]*2|BATCH[\s_-]*2)(?:[\s)_\-[\]]|$)/i.test(trimmed)) {
    const cleaned = trimmed
      .replace(/(?:[\s(_\-[\]]|^)(?:GROUP[\s_-]*2|G[\s_-]*2|GR\.?[\s_-]*2|BATCH[\s_-]*2)(?:[\s)_\-[\]]|$)/gi, ' ')
      .replace(/[()[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      group: 'G2',
      detectedGroup: 'G2',
      isPureLabel: false,
      cleanedText: cleaned,
      cleanedString: cleaned,
      ambiguous: false,
      requiresReview: false,
    };
  }

  return {
    group: null,
    detectedGroup: null,
    isPureLabel: false,
    cleanedText: trimmed,
    cleanedString: trimmed,
    ambiguous: false,
    requiresReview: false,
  };
}

export interface ChitkaraTimetableParseResult {
  success: boolean;
  sectionsFound: string[];
  selectedSection: string;
  detectedSemester?: number;
  detectedProgram?: string;
  detectedBatch?: string;
  detectedSectionLetter?: string;
  allSectionLectures?: Record<string, ExtractedLecture[]>;
  generationDate?: string;
  effectiveDate?: string;
  totalLectures: number;
  lectures: ExtractedLecture[];
  isScanned?: boolean;
  warnings: string[];
}

export const CHITKARA_SUBJECT_NAMES: Record<string, string> = {
  // 5th Semester
  'ADI': 'Applied Design & Innovation',
  'ADI-FA': 'Applied Design & Innovation (Financial Apps)',
  'NALR-I': 'Numerical Analysis & Linear Reasoning I',
  'SD': 'System Design & Architecture',
  'AAIPD': 'Applied AI Product Development',

  // 3rd Semester
  'CS': 'Computer Systems',
  'DS': 'Data Structures',
  'PIJ': 'Programming in Java',
  'FEE-II': 'Fundamentals of Electrical Engineering II',
  'DBMS': 'Database Management Systems',
  'MLE': 'Machine Learning Engineering',
  'IOT': 'Internet of Things',

  // 1st Semester
  'FCS': 'Foundations of Computer Science',
  'FCSL': 'Foundations of Computer Science Lab',
  'LAC': 'Linear Algebra & Calculus',
  'LACT': 'Linear Algebra & Calculus Tutorial',
  'SPC': 'Structured Programming in C',
  'IWT': 'Internet & Web Technologies',
  'IWTL': 'Internet & Web Technologies Lab',
  'IoT': 'Internet of Things',
  'MM': 'Multimedia Systems',

  // Non-academic
  'Lib': 'Library',
  'Library': 'Library',
};

export const SUBJECT_COLORS: Record<string, string> = {
  // Sem 5
  'ADI': '#3b82f6',     // Blue
  'ADI-FA': '#6366f1',  // Indigo
  'NALR-I': '#8b5cf6',  // Purple
  'SD': '#10b981',      // Emerald
  'AAIPD': '#f59e0b',   // Amber

  // Sem 3
  'CS': '#0284c7',      // Sky
  'DS': '#059669',      // Emerald
  'PIJ': '#d97706',     // Amber
  'FEE-II': '#dc2626',  // Red
  'DBMS': '#7c3aed',    // Violet
  'MLE': '#4f46e5',     // Indigo
  'IOT': '#0891b2',     // Cyan

  // Sem 1
  'FCS': '#2563eb',     // Blue
  'FCSL': '#1d4ed8',    // Dark Blue
  'LAC': '#7c3aed',     // Violet
  'LACT': '#6d28d9',    // Purple
  'SPC': '#059669',     // Green
  'IWT': '#ea580c',     // Orange
  'IWTL': '#c2410c',    // Dark Orange
  'IoT': '#0891b2',     // Cyan
  'MM': '#db2777',      // Pink

  // Non-academic
  'Lib': '#64748b',     // Slate
  'Library': '#64748b', // Slate
};

const DAY_MAP = [
  { code: 'Mo', name: 'Monday', dayOfWeek: 1 },
  { code: 'Tu', name: 'Tuesday', dayOfWeek: 2 },
  { code: 'We', name: 'Wednesday', dayOfWeek: 3 },
  { code: 'Th', name: 'Thursday', dayOfWeek: 4 },
  { code: 'Fr', name: 'Friday', dayOfWeek: 5 },
  { code: 'Sa', name: 'Saturday', dayOfWeek: 6 },
];

/**
 * Normalizes 12h time strings like "1:40" or "9:30" to standard 24h "HH:mm"
 */
export function normalizeTimeString24(raw: string): string {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw.trim();
  let h = parseInt(match[1], 10);
  const m = match[2];
  // College classes starting at 1, 2, 3, 4 are in the afternoon PM (13:00 to 16:00)
  if (h >= 1 && h <= 7) {
    h += 12;
  }
  return `${h.toString().padStart(2, '0')}:${m}`;
}

/**
 * Parses effective date from filename or string
 */
export function extractEffectiveDate(filename: string, textContent: string = ''): string | undefined {
  // Check filename first for (wef DD.MM.YYYY) or (wef DD-MM-YYYY)
  const fnMatch = filename.match(/wef\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i);
  if (fnMatch) {
    return fnMatch[1].replace(/[./]/g, '-');
  }

  // Check text content for w.e.f. date
  const textMatch = textContent.match(/w\.?e\.?f\.?\s*:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i);
  if (textMatch) {
    return textMatch[1].replace(/[./]/g, '-');
  }

  // Check for textual month date e.g. "October 12, 2026"
  const monthMatch = (filename + ' ' + textContent).match(
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,\s*\d{4})\b/i
  );
  if (monthMatch) {
    return monthMatch[1];
  }

  return undefined;
}

/**
 * Extracts or derives admission batch year from filename, text content, or academic schedule
 */
export function extractBatch(
  filename: string = '',
  textContent: string = '',
  detectedSemester?: number,
  generationDate?: string
): string | undefined {
  // 1. Check for explicit batch in filename or text e.g. "2024 batch" or "batch-2024" or "batch 2025"
  const match = (filename + ' ' + textContent).match(/\b(20\d{2})\s*batch\b/i) ||
    (filename + ' ' + textContent).match(/\bbatch[\s_-]*(20\d{2})\b/i);
  if (match) {
    return match[1];
  }

  // 2. Derive admission batch from generation year and semester if available
  let genYear: number | undefined;
  if (generationDate) {
    const yrMatch = generationDate.match(/\b(20\d{2})\b/);
    if (yrMatch) genYear = parseInt(yrMatch[1], 10);
  }
  if (!genYear) {
    const yrMatch = filename.match(/\b(20\d{2})\b/);
    if (yrMatch) genYear = parseInt(yrMatch[1], 10);
  }

  if (genYear && detectedSemester) {
    // In autumn semester (1, 3, 5, 7):
    // Sem 1 starts in genYear -> batch = genYear
    // Sem 3 starts in genYear - 1 -> batch = genYear - 1
    // Sem 5 starts in genYear - 2 -> batch = genYear - 2
    const yearsPrior = Math.floor((detectedSemester - 1) / 2);
    return (genYear - yearsPrior).toString();
  }

  return undefined;
}

interface RawTextItem {
  str: string;
  x: number;
  y: number;
}

/**
 * Core Parser: Parses a Chitkara aSc Timetables PDF document.
 * Operates 100% in-browser using pdfjs-dist. Zero server uploads.
 */
export async function parseChitkaraPdf(
  dataBuffer: ArrayBuffer | Uint8Array,
  targetSection?: string,
  filename: string = ''
): Promise<ChitkaraTimetableParseResult> {
  const warnings: string[] = [];
  
  // Always copy bytes so pdfjs does not detach the caller's original buffer
  let uint8: Uint8Array;
  if (dataBuffer instanceof Uint8Array) {
    uint8 = new Uint8Array(dataBuffer.byteLength);
    uint8.set(dataBuffer);
  } else {
    uint8 = new Uint8Array(dataBuffer.slice(0));
  }

  let doc: pdfjsLib.PDFDocumentProxy;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: uint8,
      useSystemFonts: true,
    });
    doc = await loadingTask.promise;
  } catch (err) {
    return {
      success: false,
      sectionsFound: [],
      selectedSection: targetSection || '',
      totalLectures: 0,
      lectures: [],
      isScanned: true,
      warnings: [`Failed to read PDF document: ${(err as Error).message}. Ensure it is a valid PDF file.`],
    };
  }

  const numPages = doc.numPages;
  if (numPages === 0) {
    return {
      success: false,
      sectionsFound: [],
      selectedSection: targetSection || '',
      totalLectures: 0,
      lectures: [],
      warnings: ['PDF contains 0 pages.'],
    };
  }

  // Pass 1: Scan all pages to identify available sections and generation date
  const pageSections: { pageNum: number; section: string; generationDate?: string; rawItems: RawTextItem[] }[] = [];
  let detectedGenDate: string | undefined;

  for (let pNum = 1; pNum <= numPages; pNum++) {
    const page = await doc.getPage(pNum);
    const tc = await page.getTextContent();
    const rawItems: RawTextItem[] = tc.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((it: any) => ({
        str: (it.str || '').trim(),
        x: Math.round(it.transform?.[4] || 0),
        y: Math.round(it.transform?.[5] || 0),
      }))
      .filter((it) => it.str.length > 0);

    // Identify Section
    const secItem = rawItems.find((it) => /BE-CSE-[0-9A-Z]+/i.test(it.str));
    const secMatch = secItem?.str.match(/BE-CSE-[0-9A-Z]+/i);
    const section = secMatch ? secMatch[0].toUpperCase() : `Page ${pNum}`;

    // Identify Generation Date
    const genItem = rawItems.find((it) => it.str.includes('Timetable generated:'));
    const genDate = genItem ? genItem.str.replace('Timetable generated:', '').trim() : undefined;
    if (genDate && !detectedGenDate) {
      detectedGenDate = genDate;
    }

    pageSections.push({ pageNum: pNum, section, generationDate: genDate, rawItems });
  }

  const sectionsFound = pageSections.map((p) => p.section);

  // If user selected a section, find that page. Otherwise default to user selection or Page 1.
  let selectedPage = pageSections[0];
  if (targetSection) {
    const found = pageSections.find((p) => p.section.toUpperCase() === targetSection.toUpperCase());
    if (found) {
      selectedPage = found;
    } else {
      warnings.push(`Section "${targetSection}" was not found in the PDF. Defaulting to ${selectedPage.section}.`);
    }
  }

  const effectiveDate = extractEffectiveDate(filename) || detectedGenDate;

  // Pass 2: Extract timetable grid on the selected page
  const items = selectedPage.rawItems;

  // Check if page has sufficient text content (isScanned detection)
  if (items.length < 15) {
    return {
      success: false,
      sectionsFound,
      selectedSection: selectedPage.section,
      generationDate: detectedGenDate,
      effectiveDate,
      totalLectures: 0,
      lectures: [],
      isScanned: true,
      warnings: ['This page appears to be a scanned image without selectable text. Text extraction cannot proceed.'],
    };
  }

  // Helper function to extract lectures for any given page
  function extractPageLectures(
    items: RawTextItem[],
    sectionName: string
  ): ExtractedLecture[] {
    if (items.length < 15) return [];

    // 1. Dynamic Period Detection from page text
    const periodHeaderItems = items
      .filter((it) => /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.test(it.str))
      .sort((a, b) => a.x - b.x);

    const periods = periodHeaderItems.map((p, idx) => {
      const match = p.str.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      const rawStart = match ? match[1] : '09:00';
      const rawEnd = match ? match[2] : '10:00';
      const prevX = idx > 0 ? (periodHeaderItems[idx - 1].x + p.x) / 2 : p.x - 45;
      const nextX =
        idx < periodHeaderItems.length - 1 ? (p.x + periodHeaderItems[idx + 1].x) / 2 : p.x + 45;

      return {
        num: idx + 1,
        startTime: normalizeTimeString24(rawStart),
        endTime: normalizeTimeString24(rawEnd),
        minX: prevX,
        maxX: nextX,
        midX: p.x,
      };
    });

    if (periods.length === 0) {
      const standardPeriods = [
        { num: 1, startTime: '09:30', endTime: '10:20', minX: 80, maxX: 170, midX: 131 },
        { num: 2, startTime: '10:20', endTime: '11:10', minX: 170, maxX: 261, midX: 223 },
        { num: 3, startTime: '11:10', endTime: '12:00', minX: 261, maxX: 353, midX: 315 },
        { num: 4, startTime: '12:00', endTime: '12:50', minX: 353, maxX: 446, midX: 407 },
        { num: 5, startTime: '12:50', endTime: '13:40', minX: 446, maxX: 540, midX: 499 },
        { num: 6, startTime: '13:40', endTime: '14:30', minX: 540, maxX: 632, midX: 591 },
        { num: 7, startTime: '14:30', endTime: '15:20', minX: 632, maxX: 725, midX: 683 },
        { num: 8, startTime: '15:20', endTime: '16:10', minX: 725, maxX: 820, midX: 775 },
      ];
      periods.push(...standardPeriods);
    }

    // 2. Dynamic Day Detection from page text
    const detectedDays: { code: string; name: string; dayOfWeek: number; y: number }[] = [];
    DAY_MAP.forEach((d) => {
      const item = items.find((it) => it.str === d.code);
      if (item) {
        detectedDays.push({ ...d, y: item.y });
      }
    });
    detectedDays.sort((a, b) => b.y - a.y);

    const dayRows = detectedDays.map((d, idx) => {
      const maxY = idx > 0 ? (detectedDays[idx - 1].y + d.y) / 2 : d.y + 45;
      const minY = idx < detectedDays.length - 1 ? (d.y + detectedDays[idx + 1].y) / 2 : d.y - 45;
      return { ...d, minY, maxY };
    });

    // Boundaries between consecutive periods for 2-period span detection
    const boundaries: { bIdx: number; x: number; pStart: number; pEnd: number }[] = [];
    for (let i = 0; i < periods.length - 1; i++) {
      boundaries.push({
        bIdx: i + 1,
        x: (periods[i].maxX + periods[i + 1].minX) / 2,
        pStart: periods[i].num,
        pEnd: periods[i + 1].num,
      });
    }

    function determinePeriodSpan(x: number): { pStart: number; pEnd: number; count: number } {
      for (const b of boundaries) {
        if (Math.abs(x - b.x) <= 22) {
          return { pStart: b.pStart, pEnd: b.pEnd, count: 2 };
        }
      }
      for (const p of periods) {
        if (x >= p.minX && x < p.maxX) {
          return { pStart: p.num, pEnd: p.num, count: 1 };
        }
      }
      return { pStart: 1, pEnd: 1, count: 1 };
    }

    function isRoom(str: string): boolean {
      return /^(?:RJ|CVR|LH|CR|LAB|CL|KLM)[0-9A-Z]+/i.test(str.trim());
    }

    function isFaculty(str: string): boolean {
      return /^(?:Dr|Mr|Ms|Prof)\.?\s+/i.test(str.trim()) || str.includes(' / ');
    }

    function isGroup(str: string): boolean {
      return /(?:Group\s*[12]|G[12]|Batch\s*[12])/i.test(str.trim());
    }

    function isHeaderOrMeta(str: string): boolean {
      return (
        /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.test(str) ||
        /^[1-8]$/.test(str) ||
        /^(?:Mo|Tu|We|Th|Fr|Sa)$/i.test(str) ||
        /^(?:Library|aSc Timetables|Timetable generated.*)$/i.test(str) ||
        /BE-CSE-[0-9A-Z]+/i.test(str) ||
        str.includes('Chitkara University')
      );
    }

    const pageLectures: ExtractedLecture[] = [];

    // Filter content items inside timetable grid (exclude section titles and top/bottom page chrome)
    const gridItems = items.filter(
      (it) => it.y > 90 && it.y < 488 && it.x > 80 && !isHeaderOrMeta(it.str)
    );

    const rooms = gridItems.filter((it) => isRoom(it.str));
    const faculties = gridItems.filter((it) => isFaculty(it.str));
    const groups = gridItems.filter((it) => isGroup(it.str));
    const subjects = gridItems.filter(
      (it) => !isRoom(it.str) && !isFaculty(it.str) && !isGroup(it.str)
    );

    // Process each subject card
    for (const subj of subjects) {
      // Find matching day
      const day =
        dayRows.find((d) => subj.y >= d.minY && subj.y < d.maxY) ||
        dayRows.find((d) => subj.y >= d.minY) ||
        dayRows[0];

      if (!day || day.dayOfWeek === 6) continue; // Skip Saturday or unmatched

      const span = determinePeriodSpan(subj.x);
      const pS = periods[span.pStart - 1] || periods[0];
      const pE = periods[span.pEnd - 1] || pS;

      const minX = pS.minX - 15;
      const maxX = pE.maxX + 15;

      const isLib = subj.str.toUpperCase() === 'LIB';

      let room = 'TBD';
      if (isLib) {
        room = 'Library';
      } else {
        const candRooms = rooms.filter(
          (r) => r.x >= minX && r.x <= maxX && r.y >= subj.y - 15 && r.y <= subj.y + 38
        );
        candRooms.sort((a, b) => {
          const costA = Math.abs(a.y - (subj.y + 16)) + Math.abs(a.x - minX) * 0.1;
          const costB = Math.abs(b.y - (subj.y + 16)) + Math.abs(b.x - minX) * 0.1;
          return costA - costB;
        });
        room = candRooms[0]?.str || 'TBD';
      }

      let faculty = '';
      if (!isLib) {
        const candFac = faculties.filter(
          (f) => f.x >= minX && f.x <= maxX && f.y >= subj.y - 35 && f.y <= subj.y + 10
        );
        candFac.sort((a, b) => Math.abs(a.y - (subj.y - 12)) - Math.abs(b.y - (subj.y - 12)));
        faculty = candFac[0]?.str || 'Department Faculty';
      }

      let group: TimetableGroupScope = 'ALL';
      if (!isLib) {
        const candGroups = groups.filter(
          (g) => g.x >= minX && g.x <= maxX && Math.abs(g.y - subj.y) <= 25
        );
        candGroups.sort((a, b) => Math.abs(a.y - subj.y) - Math.abs(b.y - subj.y));
        if (candGroups.length > 0) {
          const gStr = candGroups[0].str;
          if (/Group\s*1/i.test(gStr) && !/Group\s*2/i.test(gStr)) group = 'G1';
          else if (/Group\s*2/i.test(gStr) && !/Group\s*1/i.test(gStr)) group = 'G2';
        }
      }

      const code = isLib ? 'Lib' : subj.str;
      const fullName = isLib ? 'Library' : (CHITKARA_SUBJECT_NAMES[code] || code);
      const color = isLib
        ? '#64748b'
        : (SUBJECT_COLORS[code] ||
          (group === 'G1' ? '#3b82f6' : group === 'G2' ? '#8b5cf6' : '#10b981'));

      const [sh, sm] = pS.startTime.split(':').map(Number);
      const [eh, em] = pE.endTime.split(':').map(Number);
      const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);

      const requiresReview = !isLib && (room === 'TBD' || faculty === 'Department Faculty');
      const reviewReason = requiresReview
        ? room === 'TBD'
          ? 'Venue/Room could not be confidently identified'
          : 'Faculty not specified'
        : undefined;

      pageLectures.push({
        id: `slot_${day.dayOfWeek}_${pS.startTime.replace(':', '')}_${group.toLowerCase()}_${code.toLowerCase()}`,
        dayOfWeek: day.dayOfWeek,
        dayName: day.name,
        startTime: pS.startTime,
        endTime: pE.endTime,
        subjectCode: code,
        subjectName: fullName,
        faculty: faculty || (isLib ? '' : 'Department Faculty'),
        room,
        section: sectionName,
        group,
        periods: span.count,
        weight: span.count,
        durationMinutes,
        requiresReview,
        reviewReason,
        color,
        isNonAcademic: isLib,
        isFreePeriod: isLib,
      });
    }

    return pageLectures;
  }

  // Extract lectures for the user-selected page
  const lectures = extractPageLectures(selectedPage.rawItems, selectedPage.section);

  // Extract lectures across all discovered pages to support "Publish All Detected Sections"
  const allSectionLectures: Record<string, ExtractedLecture[]> = {};
  pageSections.forEach((p) => {
    allSectionLectures[p.section] = extractPageLectures(p.rawItems, p.section);
  });

  // Parse section details from the selected section (e.g. "BE-CSE-1A" -> semester 1, section A)
  const parsedSec = parseSectionDetails(selectedPage.section);
  const pageText = selectedPage.rawItems.map((i) => i.str).join(' ');
  const detectedBatch = extractBatch(filename, pageText, parsedSec.semester, detectedGenDate);

  return {
    success: lectures.length > 0,
    sectionsFound,
    selectedSection: selectedPage.section,
    detectedSemester: parsedSec.semester,
    detectedProgram: parsedSec.program || 'BE-CSE',
    detectedBatch,
    detectedSectionLetter: parsedSec.sectionLetter,
    allSectionLectures,
    generationDate: detectedGenDate,
    effectiveDate,
    totalLectures: lectures.length,
    lectures,
    warnings,
  };
}

export interface TimetableSlotLike {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subjectCode: string;
  subjectName?: string;
  faculty?: string;
  room?: string;
  group?: TimetableGroupScope;
  isManual?: boolean;
}

export interface TimetableDiffSummary {
  added: ExtractedLecture[];
  changed: {
    oldSlot: TimetableSlotLike;
    newSlot: ExtractedLecture;
    changeReason: string;
  }[];
  cancelled: TimetableSlotLike[];
  unchanged: ExtractedLecture[];
}

/**
 * Computes side-by-side diff between existing timetable slots and extracted lectures
 */
export function computeLectureDiff(
  currentSlots: TimetableSlotLike[],
  newLectures: ExtractedLecture[],
  preserveManual: boolean = true
): TimetableDiffSummary {
  const added: ExtractedLecture[] = [];
  const changed: { oldSlot: TimetableSlotLike; newSlot: ExtractedLecture; changeReason: string }[] =
    [];
  const cancelled: TimetableSlotLike[] = [];
  const unchanged: ExtractedLecture[] = [];

  const activeExisting = currentSlots.filter((s) => !(preserveManual && s.isManual));
  const existingMap = new Map<string, TimetableSlotLike>();
  activeExisting.forEach((s) => {
    const key = `${s.dayOfWeek}_${s.startTime}_${(s.group || 'ALL').toUpperCase()}`;
    existingMap.set(key, s);
  });

  const matchedKeys = new Set<string>();

  newLectures.forEach((newSlot) => {
    const key = `${newSlot.dayOfWeek}_${newSlot.startTime}_${(newSlot.group || 'ALL').toUpperCase()}`;
    matchedKeys.add(key);
    const oldSlot = existingMap.get(key);

    if (!oldSlot) {
      added.push(newSlot);
    } else {
      const reasons: string[] = [];
      if (oldSlot.subjectCode.toUpperCase() !== newSlot.subjectCode.toUpperCase()) {
        reasons.push(`Subject: ${oldSlot.subjectCode} ➔ ${newSlot.subjectCode}`);
      }
      if ((oldSlot.group || 'ALL') !== newSlot.group) {
        reasons.push(`Group: ${oldSlot.group || 'ALL'} ➔ ${newSlot.group}`);
      }
      if ((oldSlot.room || '') !== (newSlot.room || '') && (oldSlot.room || newSlot.room)) {
        reasons.push(`Room: ${oldSlot.room || 'None'} ➔ ${newSlot.room || 'None'}`);
      }
      if (
        (oldSlot.faculty || '') !== (newSlot.faculty || '') &&
        (oldSlot.faculty || newSlot.faculty)
      ) {
        reasons.push(`Faculty: ${oldSlot.faculty || 'None'} ➔ ${newSlot.faculty || 'None'}`);
      }
      if (oldSlot.endTime !== newSlot.endTime) {
        reasons.push(`End time: ${oldSlot.endTime} ➔ ${newSlot.endTime}`);
      }

      if (reasons.length > 0) {
        changed.push({ oldSlot, newSlot, changeReason: reasons.join('; ') });
      } else {
        unchanged.push(newSlot);
      }
    }
  });

  existingMap.forEach((oldSlot, key) => {
    if (!matchedKeys.has(key)) {
      cancelled.push(oldSlot);
    }
  });

  return { added, changed, cancelled, unchanged };
}

