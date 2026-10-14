/**
 * Free Classroom Finder & Room Availability Engine
 * 
 * Aggregates all discovered departmental timetables (Semesters 1, 3, 5, etc.)
 * across all sections to determine room occupancy at any given moment.
 */

import { SEEDED_SHARED_TIMETABLES } from '../data/seededSharedTimetables.ts';
import { timeToMinutes } from './timetableCalculations.ts';
import type { TimetableSlot } from '../types';

export interface RoomOccupancyStatus {
  room: string;
  isFree: boolean;
  status: 'free' | 'occupied';
  currentClass?: {
    subjectCode: string;
    subjectName: string;
    section: string;
    startTime: string;
    endTime: string;
  };
  nextClass?: {
    subjectCode: string;
    subjectName: string;
    section: string;
    startTime: string;
    endTime: string;
    minutesUntil: number;
  };
  freeDurationMinutes?: number; // Minutes free until next class, or until end of day (e.g. 17:00)
}

export interface FreeClassroomInspectionResult {
  timestamp: Date;
  dayOfWeek: number;
  timeFormatted: string;
  totalRoomsTracked: number;
  freeRoomsCount: number;
  occupiedRoomsCount: number;
  freeRooms: RoomOccupancyStatus[];
  occupiedRooms: RoomOccupancyStatus[];
  allRooms: RoomOccupancyStatus[];
  isCoverageComplete: boolean;
  coverageWarning?: string;
  includedTimetableCount: number;
  includedSections: string[];
}

/**
 * Normalizes physical room identifiers to eliminate casing, whitespace, and formatting discrepancies.
 * e.g. " rj 204 r " -> "RJ204R", "cvr-303r" -> "CVR303R", "Library" -> "LIBRARY"
 */
export function normalizeRoomIdentifier(roomRaw: string): string {
  if (!roomRaw || typeof roomRaw !== 'string') return '';
  const trimmed = roomRaw.trim().toUpperCase();
  // Remove inner spaces, dashes, or underscores for standardized room matching (e.g. RJ 204 R -> RJ204R)
  return trimmed.replace(/[\s\-_]+/g, '');
}

/**
 * Returns human-readable standardized presentation label for a room code.
 * (e.g., "RJ204R" -> "RJ-204R" or "RJ204R")
 */
export function formatRoomDisplay(normalizedRoom: string): string {
  if (!normalizedRoom) return '';
  // Format patterns like RJ204R or CVR303R cleanly
  return normalizedRoom;
}

/**
 * Collects and deduplicates all timetable slots across every available timetable in storage and local seed.
 * Automatically discovers any newly imported or cached timetables.
 */
export function getAllDiscoveredTimetableDocs(): {
  docs: { id: string; section?: string; semester?: number; slots: any[] }[];
  isComplete: boolean;
  warning?: string;
} {
  const docsMap = new Map<string, { id: string; section?: string; semester?: number; slots: any[] }>();

  // 1. Ingest all seeded shared timetables across all semesters (1, 3, 5, etc.)
  if (SEEDED_SHARED_TIMETABLES && typeof SEEDED_SHARED_TIMETABLES === 'object') {
    for (const [id, doc] of Object.entries(SEEDED_SHARED_TIMETABLES)) {
      if (doc && Array.isArray(doc.slots)) {
        docsMap.set(id, {
          id,
          section: doc.section,
          semester: doc.semester,
          slots: doc.slots,
        });
      }
    }
  }

  // 2. Discover any newly added or updated shared timetables in localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('uniflow_shared_tt_') && !key.includes('_ts_')) {
          const groupId = key.replace('uniflow_shared_tt_', '');
          const raw = window.localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.slots)) {
              docsMap.set(groupId, {
                id: groupId,
                section: parsed.section || groupId.split('_').pop(),
                semester: parsed.semester,
                slots: parsed.slots,
              });
            }
          }
        }
      }
    } catch {
      // LocalStorage inspection safe fallback
    }
  }

  const docs = Array.from(docsMap.values());
  const isComplete = docs.length > 0;
  const warning = !isComplete
    ? 'No timetable datasets currently loaded — room availability cannot be verified.'
    : undefined;

  return { docs, isComplete, warning };
}

/**
 * Builds the authoritative room inventory from verified timetable slots.
 */
export function extractKnownRoomInventory(
  timetableDocs: { id: string; section?: string; slots: any[] }[]
): string[] {
  const roomsSet = new Set<string>();

  for (const doc of timetableDocs) {
    for (const slot of doc.slots) {
      if (slot.room && typeof slot.room === 'string') {
        const norm = normalizeRoomIdentifier(slot.room);
        // Exclude generic non-room labels
        if (norm && norm !== 'TBA' && norm !== 'ONLINE' && norm !== 'NONE') {
          roomsSet.add(norm);
        }
      }
    }
  }

  return Array.from(roomsSet).sort();
}

/**
 * Evaluates live room occupancy for all rooms at currentTime.
 * Pure function: deterministic, comprehensively testable with arbitrary dates/times.
 */
export function calculateFreeClassrooms(
  currentTime: Date = new Date(),
  customTimetableDocs?: { id: string; section?: string; semester?: number; slots: any[] }[]
): FreeClassroomInspectionResult {
  const { docs: discoveredDocs, isComplete, warning } = customTimetableDocs
    ? { docs: customTimetableDocs, isComplete: customTimetableDocs.length > 0, warning: undefined }
    : getAllDiscoveredTimetableDocs();

  const currentDay = currentTime.getDay();
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const timeFormatted = `${String(currentTime.getHours()).padStart(2, '0')}:${String(currentTime.getMinutes()).padStart(2, '0')}`;

  const allKnownRooms = extractKnownRoomInventory(discoveredDocs);
  const includedSections = Array.from(new Set(discoveredDocs.map((d) => d.section || d.id))).sort();

  // If no timetables are loaded, rule: never claim rooms are free when data is incomplete
  if (!isComplete || allKnownRooms.length === 0) {
    return {
      timestamp: currentTime,
      dayOfWeek: currentDay,
      timeFormatted,
      totalRoomsTracked: 0,
      freeRoomsCount: 0,
      occupiedRoomsCount: 0,
      freeRooms: [],
      occupiedRooms: [],
      allRooms: [],
      isCoverageComplete: false,
      coverageWarning: warning || 'Timetable dataset unavailable — room availability cannot be safely verified.',
      includedTimetableCount: 0,
      includedSections: [],
    };
  }

  // Flatten all slots for today across every section with normalized room
  interface NormalizedDaySlot {
    roomNorm: string;
    subjectCode: string;
    subjectName: string;
    section: string;
    startTime: string;
    endTime: string;
    startMinutes: number;
    endMinutes: number;
  }

  const todaySlots: NormalizedDaySlot[] = [];

  for (const doc of discoveredDocs) {
    const secName = doc.section || doc.id;
    for (const slot of doc.slots) {
      if (slot.isActive === false || slot.isFreePeriod) continue;
      if (slot.dayOfWeek !== currentDay) continue;
      if (!slot.room || !slot.startTime || !slot.endTime) continue;

      const roomNorm = normalizeRoomIdentifier(slot.room);
      if (!roomNorm) continue;

      const sMin = timeToMinutes(slot.startTime);
      const eMin = timeToMinutes(slot.endTime);

      if (eMin <= sMin) continue; // invalid duration guard

      todaySlots.push({
        roomNorm,
        subjectCode: slot.subjectCode || 'CLASS',
        subjectName: slot.subjectName || slot.subjectCode || 'Class',
        section: secName,
        startTime: slot.startTime,
        endTime: slot.endTime,
        startMinutes: sMin,
        endMinutes: eMin,
      });
    }
  }

  const statuses: RoomOccupancyStatus[] = [];

  for (const room of allKnownRooms) {
    const roomSlots = todaySlots
      .filter((s) => s.roomNorm === room)
      .sort((a, b) => a.startMinutes - b.startMinutes);

    // Rule: Room is occupied if startTime <= now < endTime (start-inclusive, end-exclusive)
    const occupyingSlot = roomSlots.find(
      (s) => currentMinutes >= s.startMinutes && currentMinutes < s.endMinutes
    );

    // Find next upcoming class strictly starting after now
    const upcomingSlots = roomSlots.filter((s) => s.startMinutes > currentMinutes);
    const nextSlot = upcomingSlots.length > 0 ? upcomingSlots[0] : undefined;

    if (occupyingSlot) {
      statuses.push({
        room,
        isFree: false,
        status: 'occupied',
        currentClass: {
          subjectCode: occupyingSlot.subjectCode,
          subjectName: occupyingSlot.subjectName,
          section: occupyingSlot.section,
          startTime: occupyingSlot.startTime,
          endTime: occupyingSlot.endTime,
        },
        nextClass: nextSlot
          ? {
              subjectCode: nextSlot.subjectCode,
              subjectName: nextSlot.subjectName,
              section: nextSlot.section,
              startTime: nextSlot.startTime,
              endTime: nextSlot.endTime,
              minutesUntil: nextSlot.startMinutes - currentMinutes,
            }
          : undefined,
      });
    } else {
      // Room is free! Calculate useful free window in minutes
      let freeDuration: number | undefined;
      if (nextSlot) {
        freeDuration = nextSlot.startMinutes - currentMinutes;
      } else {
        // If no more classes today, free until end of standard academic day (17:00 = 1020 mins)
        const academicDayEndMinutes = 17 * 60;
        if (currentMinutes < academicDayEndMinutes) {
          freeDuration = academicDayEndMinutes - currentMinutes;
        }
      }

      statuses.push({
        room,
        isFree: true,
        status: 'free',
        nextClass: nextSlot
          ? {
              subjectCode: nextSlot.subjectCode,
              subjectName: nextSlot.subjectName,
              section: nextSlot.section,
              startTime: nextSlot.startTime,
              endTime: nextSlot.endTime,
              minutesUntil: nextSlot.startMinutes - currentMinutes,
            }
          : undefined,
        freeDurationMinutes: freeDuration,
      });
    }
  }

  // Sort free rooms by length of available window descending (longest free period first)
  const freeRooms = statuses
    .filter((s) => s.isFree)
    .sort((a, b) => (b.freeDurationMinutes ?? 999) - (a.freeDurationMinutes ?? 999));

  const occupiedRooms = statuses
    .filter((s) => !s.isFree)
    .sort((a, b) => a.room.localeCompare(b.room));

  return {
    timestamp: currentTime,
    dayOfWeek: currentDay,
    timeFormatted,
    totalRoomsTracked: allKnownRooms.length,
    freeRoomsCount: freeRooms.length,
    occupiedRoomsCount: occupiedRooms.length,
    freeRooms,
    occupiedRooms,
    allRooms: statuses,
    isCoverageComplete: isComplete,
    includedTimetableCount: discoveredDocs.length,
    includedSections,
  };
}
