import type { firestore } from 'firebase-admin';

export type AttendanceStatus = 'present' | 'absent' | 'not_marked' | 'cancelled';
export type AttendanceSource = 'manual' | 'email_import' | 'baseline';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  semester?: string;
  section?: string;
  college?: string;
  attendanceTarget: number;
  emailVerified: boolean;
  fcmTokens?: string[];
  createdAt: firestore.Timestamp;
  updatedAt: firestore.Timestamp;
}

export interface Subject {
  id: string;
  uid: string;
  name: string;
  code: string;
  faculty?: string;
  credits: number;
  color: string;
  createdAt: firestore.Timestamp;
  updatedAt: firestore.Timestamp;
}

export interface TimetableSlot {
  id?: string;
  uid: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  faculty?: string;
  room?: string;
  dayOfWeek: number; // 0=Sun, 1=Mon ... 6=Sat
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  color: string;
  isActive: boolean;
  createdAt?: firestore.Timestamp;
  updatedAt?: firestore.Timestamp;
}

export interface AttendanceRecord {
  uid: string;
  subjectId: string;
  date: firestore.Timestamp;
  lectureSlotId?: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  notes?: string;
  createdAt: firestore.Timestamp;
  updatedAt: firestore.Timestamp;
}

export interface EmailSyncSettings {
  uid: string;
  senderFilter?: string;      // e.g. "academics@college.edu"
  subjectKeywords?: string;  // e.g. "timetable, schedule, routine"
  filenameFilter?: string;   // e.g. "*.pdf"
  autoSyncOnOpen?: boolean;  // throttled check on app open
  lastSyncedAt?: firestore.Timestamp;
  updatedAt: firestore.Timestamp;
}

export interface EmailConnection {
  uid: string;
  email: string;
  provider: 'gmail' | 'microsoft';
  status: 'connected' | 'disconnected' | 'error';
  senderFilter?: string;
  subjectKeywords?: string;
  filenameFilter?: string;
  historyId?: string;
  lastSyncAt?: firestore.Timestamp;
  lastSyncStatus?: 'success' | 'failure';
  lastSyncError?: string;
  createdAt: firestore.Timestamp;
  updatedAt: firestore.Timestamp;
  /** @deprecated Tokens are migrated and stored strictly in users/{uid}/emailSecrets/{connId} */
  _refreshToken?: string;
  /** @deprecated */
  _tokenExpiry?: number;
}

/**
 * Server-only sensitive credentials subcollection at users/{uid}/emailSecrets/{connectionId}.
 * Completely restricted from client reads and writes in firestore.rules.
 */
export interface EmailSecret {
  uid: string;
  connectionId: string;
  refreshToken: string | null;
  tokenExpiry?: number | null;
  migratedAt?: firestore.Timestamp;
  createdAt: firestore.Timestamp;
  updatedAt: firestore.Timestamp;
}

export interface TimetableImportJob {
  id?: string;
  uid: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'duplicate_skipped' | 'requires_manual_review';
  source: 'email' | 'pdf' | 'excel' | 'manual';
  emailMessageId?: string;
  threadId?: string;
  attachmentFilename?: string;
  attachmentHash?: string;
  receivedAt?: firestore.Timestamp;
  rawSender?: string;
  emailSubject?: string;
  parsedSlotsCount?: number;
  revisionId?: string;
  warning?: string;
  error?: string;
  createdAt: firestore.Timestamp;
  updatedAt: firestore.Timestamp;
}

export interface TimetableRevision {
  id?: string;
  uid: string;
  status: 'pending_review' | 'applied' | 'rejected';
  revisionType: 'initial_import' | 'weekly_update' | 'revision';
  weekLabel: string;
  effectiveDate?: string;
  detectedSection?: string;
  attachmentHash: string;
  sourceFilename: string;
  sourceEmailSubject?: string;
  sourceSender?: string;
  changes: {
    added: Array<{
      subjectName: string;
      subjectCode: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      faculty?: string;
      room?: string;
    }>;
    changed: Array<{
      oldSlot: any;
      newSlot: any;
      changeReason: string;
    }>;
    cancelled: Array<any>;
    unchanged: Array<any>;
  };
  proposedSlots: TimetableSlot[];
  detectedAt: firestore.Timestamp;
  appliedAt?: firestore.Timestamp;
  rejectedAt?: firestore.Timestamp;
  reviewNotes?: string;
}

export interface TimetableHistory {
  id?: string;
  uid: string;
  revisionId: string;
  archivedAt: firestore.Timestamp;
  weekLabel: string;
  slots: TimetableSlot[];
}
