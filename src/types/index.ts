import { Timestamp } from 'firebase/firestore';
export type { UserProfile } from '../contexts/AuthContext';

export type AttendanceStatus = 'present' | 'absent' | 'not_marked' | 'cancelled';
export type AttendanceSource = 'manual' | 'email_import' | 'baseline';

export interface Subject {
  id: string;
  uid: string;
  name: string;
  code: string;
  faculty?: string;
  credits: number;
  color: string;
  totalAttended?: number;
  totalConducted?: number;
  totalsUpdatedAt?: Timestamp;
  initialAttended?: number;
  initialConducted?: number;
  baselineAttended?: number;
  baselineConducted?: number;
  baselineUpdatedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type TimetableGroupScope = 'ALL' | 'G1' | 'G2';

export interface TimetableSlot {
  id: string;
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
  isManual?: boolean;
  isShared?: boolean;
  sharedGroupId?: string;
  section?: string;
  group?: TimetableGroupScope; // 'G1' | 'G2' | 'ALL' (defaults to 'ALL' for legacy slots)
  periods?: number; // Number of periods spanned (e.g. 1 for lecture, 2 for lab)
  weight?: number;  // Attendance weight multiplier (defaults to periods or 1)
  durationMinutes?: number;
  requiresReview?: boolean;
  reviewReason?: string;
  effectiveDate?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AttendanceRecord {
  id: string;
  uid: string;
  subjectId: string;
  date: Timestamp;
  lectureSlotId?: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  weight?: number; // Attendance weight (e.g. 1 for standard period, 2 for 2-period lab)
  group?: TimetableGroupScope; // applicable group ('G1' | 'G2' | 'ALL')
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AttendanceBaseline {
  id: string;
  uid: string;
  subjectId: string;
  attended: number;
  conducted: number;
  asOfDate: Timestamp;
  createdAt: Timestamp;
}

export interface Notification {
  id: string;
  uid: string;
  type: 'class_reminder' | 'attendance_alert' | 'timetable_revision' | 'sync_failure';
  title: string;
  body: string;
  read: boolean;
  createdAt: Timestamp;
}

export interface EmailConnection {
  id: string;
  uid: string;
  email: string;
  provider: 'gmail' | 'microsoft';
  status: 'connected' | 'disconnected' | 'error';
  senderFilter?: string;
  subjectKeywords?: string;
  filenameFilter?: string;
  lastSyncAt?: Timestamp;
  lastSyncStatus?: 'success' | 'failure';
  lastSyncError?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface TimetableImportJob {
  id: string;
  uid: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'duplicate_skipped' | 'requires_manual_review';
  source: 'email' | 'pdf' | 'excel' | 'manual';
  emailMessageId?: string;
  threadId?: string;
  attachmentFilename?: string;
  attachmentHash?: string;
  receivedAt?: Timestamp;
  rawSender?: string;
  emailSubject?: string;
  parsedSlotsCount?: number;
  revisionId?: string;
  warning?: string;
  error?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TimetableRevision {
  id: string;
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
      group?: TimetableGroupScope;
    }>;
    changed: Array<{
      oldSlot: {
        subjectName: string;
        subjectCode: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        faculty?: string;
        room?: string;
        group?: TimetableGroupScope;
      };
      newSlot: {
        subjectName: string;
        subjectCode: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        faculty?: string;
        room?: string;
        group?: TimetableGroupScope;
      };
      changeReason: string;
    }>;
    cancelled: Array<{
      subjectName: string;
      subjectCode: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      faculty?: string;
      room?: string;
      group?: TimetableGroupScope;
    }>;
    unchanged: Array<{
      subjectName: string;
      subjectCode: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      faculty?: string;
      room?: string;
      group?: TimetableGroupScope;
    }>;
  };
  proposedSlots: Array<{
    subjectName: string;
    subjectCode: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    faculty?: string;
    room?: string;
    group?: TimetableGroupScope;
    color?: string;
  }>;
  detectedAt: Timestamp;
  appliedAt?: Timestamp;
  rejectedAt?: Timestamp;
  reviewNotes?: string;
}

export interface TimetableHistory {
  id: string;
  uid: string;
  revisionId: string;
  weekLabel: string;
  archivedAt: Timestamp;
  slots: TimetableSlot[];
}

export type TimetableChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface TimetableChangeRequest {
  id: string;
  submittedBy: string; // uid
  submittedByEmail: string;
  submittedByName: string;
  institution: string;
  program: string;
  batch: string;
  semester: number;
  section: string;
  groupId: string;
  groupLabel: string;
  effectiveDate: string;
  sourceFilename: string;
  contentHash: string;
  slots: Array<{
    id: string;
    subjectCode: string;
    subjectName: string;
    faculty?: string;
    room?: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    color?: string;
    group?: TimetableGroupScope;
    requiresReview?: boolean;
  }>;
  slotCount: number;
  hasGroupScopes: boolean;
  status: TimetableChangeRequestStatus;
  reviewNotes?: string;
  reviewedBy?: string; // admin uid
  reviewedByName?: string;
  reviewedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
