import * as pdfjsLib from 'pdfjs-dist';

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
  requiresReview?: boolean;
  reviewReason?: string;
  color?: string;
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

  // Check for ambiguous multiple groups (e.g. "Group 1 & Group 2", "G1/G2", "G1 and G2")
  const hasG1 = /(?:GROUP[\s_-]*1|G[\s_-]*1|GR\.?[\s_-]*1|BATCH[\s_-]*1)/i.test(trimmed);
  const hasG2 = /(?:GROUP[\s_-]*2|G[\s_-]*2|GR\.?[\s_-]*2|BATCH[\s_-]*2)/i.test(trimmed);
  if (hasG1 && hasG2) {
    return {
      group: null,
      detectedGroup: null,
      isPureLabel: false,
      cleanedText: trimmed,
      cleanedString: trimmed,
      ambiguous: true,
      requiresReview: true,
      reviewReason: 'Ambiguous group assignment: references multiple groups (G1 and G2)',
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
  generationDate?: string;
  effectiveDate?: string;
  totalLectures: number;
  lectures: ExtractedLecture[];
  isScanned?: boolean;
  warnings: string[];
}

export const CHITKARA_SUBJECT_NAMES: Record<string, string> = {
  'ADI': 'Applied Design & Innovation',
  'ADI-FA': 'Applied Design & Innovation (Financial Apps)',
  'NALR-I': 'Numerical Analysis & Linear Reasoning I',
  'SD': 'System Design & Architecture',
  'AAIPD': 'Applied AI Product Development',
};

const SUBJECT_COLORS: Record<string, string> = {
  'ADI': '#3b82f6',     // Blue
  'ADI-FA': '#6366f1',  // Indigo
  'NALR-I': '#8b5cf6',  // Purple
  'SD': '#10b981',      // Emerald
  'AAIPD': '#f59e0b',   // Amber
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
  
  // Always slice a fresh copy so pdfjs worker does not detach the caller's original buffer
  const uint8 = new Uint8Array(
    dataBuffer instanceof Uint8Array
      ? dataBuffer.slice().buffer
      : dataBuffer.slice(0)
  );

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

  // 1. Dynamic Period Detection from Time Headers
  const periodHeaderItems = items.filter((it) => /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.test(it.str));
  periodHeaderItems.sort((a, b) => a.x - b.x);

  const periods = periodHeaderItems.map((p, idx) => {
    const match = p.str.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    const rawStart = match ? match[1] : '09:00';
    const rawEnd = match ? match[2] : '10:00';
    const prevX = idx > 0 ? (periodHeaderItems[idx - 1].x + p.x) / 2 : p.x - 45;
    const nextX = idx < periodHeaderItems.length - 1 ? (p.x + periodHeaderItems[idx + 1].x) / 2 : p.x + 45;

    return {
      num: idx + 1,
      startTime: normalizeTimeString24(rawStart),
      endTime: normalizeTimeString24(rawEnd),
      minX: prevX,
      maxX: nextX,
      centerX: p.x,
    };
  });

  // Fallback if period headers were not matched by regex
  if (periods.length === 0) {
    warnings.push('Period time headers could not be determined automatically. Using standard 8-period timetable slots.');
    const standardPeriods = [
      { num: 1, startTime: '09:30', endTime: '10:20', minX: 85, maxX: 178 },
      { num: 2, startTime: '10:20', endTime: '11:10', minX: 178, maxX: 270 },
      { num: 3, startTime: '11:10', endTime: '12:00', minX: 270, maxX: 362 },
      { num: 4, startTime: '12:00', endTime: '12:50', minX: 362, maxX: 454 },
      { num: 5, startTime: '12:50', endTime: '13:40', minX: 454, maxX: 546 },
      { num: 6, startTime: '13:40', endTime: '14:30', minX: 546, maxX: 638 },
      { num: 7, startTime: '14:30', endTime: '15:20', minX: 638, maxX: 730 },
      { num: 8, startTime: '15:20', endTime: '16:10', minX: 730, maxX: 825 },
    ];
    periods.push(...standardPeriods.map(p => ({ ...p, centerX: (p.minX + p.maxX) / 2 })));
  }

  // 2. Dynamic Day Detection from Day Labels
  const detectedDays: { code: string; name: string; dayOfWeek: number; y: number }[] = [];
  DAY_MAP.forEach((d) => {
    const item = items.find((it) => it.str === d.code);
    if (item) {
      detectedDays.push({ ...d, y: item.y });
    }
  });
  detectedDays.sort((a, b) => b.y - a.y); // top to bottom

  const daysWithBounds = detectedDays.map((d, idx) => {
    const prevY = idx > 0 ? (detectedDays[idx - 1].y + d.y) / 2 : d.y + 38;
    const nextY = idx < detectedDays.length - 1 ? (d.y + detectedDays[idx + 1].y) / 2 : d.y - 38;
    return { ...d, maxY: prevY, minY: nextY };
  });

  // 3. Grid Extraction per Day Band
  const lectures: ExtractedLecture[] = [];

  // Helper to extract subject, faculty, room from a cluster of items
  function extractDetailsFromCluster(clusterItems: RawTextItem[]): {
    subject: string;
    faculty: string;
    room: string;
  } {
    let subject = '';
    let faculty = '';
    let room = '';

    clusterItems.forEach((it) => {
      const s = it.str.trim();
      const groupDet = detectGroupInString(s);
      if (groupDet.isPureLabel) {
        // Pure group label e.g. "Group 1", "G1", "ALL" - do not match as subject/faculty/room
        return;
      }
      const clean = groupDet.cleanedText || s;
      if (/^(?:Dr|Mr|Ms|Prof)\.?\s+/i.test(clean)) {
        faculty = clean;
      } else if (/^(?:RJ|CVR|LH|CR|LAB)[0-9A-Z]+/i.test(clean)) {
        room = clean;
      } else if (
        /^[A-Z0-9\-_]{2,14}$/i.test(clean) &&
        !['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'G1', 'G2', 'GROUP1', 'GROUP2', 'ALL', 'LEC'].includes(
          clean.toUpperCase()
        )
      ) {
        subject = clean;
      }
    });

    return { subject, faculty, room };
  }

  daysWithBounds.forEach((day) => {
    // Exclude Saturday if no academic items exist
    if (day.dayOfWeek === 6) return;

    // Filter items inside this day row (exclusive of lower border to prevent bleeding from the day below)
    const itemsInDay = items.filter(
      (it) =>
        it.y > day.minY &&
        it.y <= day.maxY &&
        it.x > 60 &&
        !it.str.includes('aSc Timetables') &&
        !it.str.includes('Timetable generated:')
    );

    interface UnmergedPeriodBlock {
      periodIndex: number;
      period: (typeof periods)[0];
      subject: string;
      faculty: string;
      room: string;
      group: TimetableGroupScope;
      requiresReview?: boolean;
      reviewReason?: string;
    }

    const dayBlocks: UnmergedPeriodBlock[] = [];

    // Extract blocks per Period Column
    periods.forEach((p, pIdx) => {
      const inP = itemsInDay.filter((it) => it.x >= p.minX && it.x < p.maxX);
      if (inP.length === 0) return;

      const g1Items = inP.filter((it) => detectGroupInString(it.str).group === 'G1');
      const g2Items = inP.filter((it) => detectGroupInString(it.str).group === 'G2');
      const ambiguousItems = inP.filter((it) => detectGroupInString(it.str).ambiguous);

      // Scenario A: Both G1 and G2 are present in the same period cell
      if (g1Items.length > 0 && g2Items.length > 0) {
        const avgG1Y = g1Items.reduce((acc, it) => acc + it.y, 0) / g1Items.length;
        const avgG2Y = g2Items.reduce((acc, it) => acc + it.y, 0) / g2Items.length;
        const avgG1X = g1Items.reduce((acc, it) => acc + it.x, 0) / g1Items.length;
        const avgG2X = g2Items.reduce((acc, it) => acc + it.x, 0) / g2Items.length;

        const g1Cluster: RawTextItem[] = [];
        const g2Cluster: RawTextItem[] = [];

        inP.forEach((it) => {
          const det = detectGroupInString(it.str);
          if (det.group === 'G1') {
            g1Cluster.push(it);
          } else if (det.group === 'G2') {
            g2Cluster.push(it);
          } else {
            // Positional association based on vertical split if y differs significantly, else horizontal/distance
            if (Math.abs(avgG1Y - avgG2Y) > 8) {
              const midY = (avgG1Y + avgG2Y) / 2;
              if (avgG1Y > avgG2Y) {
                if (it.y >= midY) g1Cluster.push(it);
                else g2Cluster.push(it);
              } else {
                if (it.y >= midY) g2Cluster.push(it);
                else g1Cluster.push(it);
              }
            } else if (Math.abs(avgG1X - avgG2X) > 8) {
              const midX = (avgG1X + avgG2X) / 2;
              if (avgG1X < avgG2X) {
                if (it.x <= midX) g1Cluster.push(it);
                else g2Cluster.push(it);
              } else {
                if (it.x <= midX) g2Cluster.push(it);
                else g1Cluster.push(it);
              }
            } else {
              const distG1 = Math.hypot(it.x - avgG1X, it.y - avgG1Y);
              const distG2 = Math.hypot(it.x - avgG2X, it.y - avgG2Y);
              if (distG1 <= distG2) g1Cluster.push(it);
              else g2Cluster.push(it);
            }
          }
        });

        const d1 = extractDetailsFromCluster(g1Cluster);
        if (d1.subject || d1.room || d1.faculty) {
          dayBlocks.push({
            periodIndex: pIdx,
            period: p,
            subject: d1.subject,
            faculty: d1.faculty,
            room: d1.room,
            group: 'G1',
          });
        }

        const d2 = extractDetailsFromCluster(g2Cluster);
        if (d2.subject || d2.room || d2.faculty) {
          dayBlocks.push({
            periodIndex: pIdx,
            period: p,
            subject: d2.subject,
            faculty: d2.faculty,
            room: d2.room,
            group: 'G2',
          });
        }
      } else if (g1Items.length > 0) {
        // Scenario B: Only Group 1
        const d = extractDetailsFromCluster(inP);
        if (d.subject || d.room || d.faculty) {
          dayBlocks.push({
            periodIndex: pIdx,
            period: p,
            subject: d.subject,
            faculty: d.faculty,
            room: d.room,
            group: 'G1',
          });
        }
      } else if (g2Items.length > 0) {
        // Scenario C: Only Group 2
        const d = extractDetailsFromCluster(inP);
        if (d.subject || d.room || d.faculty) {
          dayBlocks.push({
            periodIndex: pIdx,
            period: p,
            subject: d.subject,
            faculty: d.faculty,
            room: d.room,
            group: 'G2',
          });
        }
      } else if (ambiguousItems.length > 0) {
        // Scenario D: Ambiguous group indicator
        const d = extractDetailsFromCluster(inP);
        if (d.subject || d.room || d.faculty) {
          dayBlocks.push({
            periodIndex: pIdx,
            period: p,
            subject: d.subject,
            faculty: d.faculty,
            room: d.room,
            group: 'ALL',
            requiresReview: true,
            reviewReason: 'Ambiguous group indicator requiring confirmation',
          });
        }
      } else {
        // Scenario E: Unlabelled whole-section class (Combined ALL)
        const d = extractDetailsFromCluster(inP);
        if (d.subject || d.room || d.faculty) {
          dayBlocks.push({
            periodIndex: pIdx,
            period: p,
            subject: d.subject,
            faculty: d.faculty,
            room: d.room,
            group: 'ALL',
          });
        }
      }
    });

    // Merge multi-period classes across consecutive blocks independently per group
    const groups: TimetableGroupScope[] = ['ALL', 'G1', 'G2'];
    groups.forEach((g) => {
      const blocksForGroup = dayBlocks
        .filter((b) => b.group === g)
        .sort((a, b) => a.periodIndex - b.periodIndex);

      let idx = 0;
      while (idx < blocksForGroup.length) {
        const cur = blocksForGroup[idx];
        const startP = cur.period;
        let endP = cur.period;
        let subject = cur.subject;
        let faculty = cur.faculty;
        let room = cur.room;
        let requiresReview = cur.requiresReview;
        let reviewReason = cur.reviewReason;

        // Check if consecutive block belongs to this same lecture
        while (idx + 1 < blocksForGroup.length) {
          const next = blocksForGroup[idx + 1];
          const isConsecutive =
            next.periodIndex === blocksForGroup[idx].periodIndex + 1 &&
            next.period.startTime === endP.endTime;
          if (!isConsecutive) break;

          const sameSubject =
            subject && next.subject && subject.toUpperCase() === next.subject.toUpperCase();
          const isSplitCard =
            (!subject && cur.room && next.subject) ||
            (!next.room && next.subject && cur.room) ||
            (!faculty && cur.subject && next.faculty) ||
            (!next.subject && !next.room && next.faculty);

          if (sameSubject || isSplitCard) {
            endP = next.period;
            subject = subject || next.subject;
            faculty = faculty || next.faculty;
            room = room || next.room;
            requiresReview = requiresReview || next.requiresReview;
            reviewReason = reviewReason || next.reviewReason;
            idx++; // Consume merged block
          } else {
            break;
          }
        }

        if (subject || room || faculty) {
          const code = subject || 'LEC';
          const fullName = CHITKARA_SUBJECT_NAMES[code] || code;
          const color =
            SUBJECT_COLORS[code] ||
            (g === 'G1' ? '#3b82f6' : g === 'G2' ? '#8b5cf6' : '#10b981');

          lectures.push({
            id: `slot_${day.dayOfWeek}_${startP.startTime.replace(':', '')}_${g.toLowerCase()}`,
            dayOfWeek: day.dayOfWeek,
            dayName: day.name,
            startTime: startP.startTime,
            endTime: endP.endTime,
            subjectCode: code,
            subjectName: fullName,
            faculty: faculty || 'Department Faculty',
            room: room || 'TBD',
            section: selectedPage.section,
            group: g,
            requiresReview,
            reviewReason,
            color,
          });
        }
        idx++;
      }
    });
  });

  return {
    success: lectures.length > 0,
    sectionsFound,
    selectedSection: selectedPage.section,
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

