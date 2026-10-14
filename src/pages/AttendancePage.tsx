import { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  TrendingDown,
  Target,
  Edit3,
  Calendar as CalendarIcon,
  ShieldAlert,
  FileText,
  RotateCcw,
  Pencil,
  History,
  AlertCircle,
  Check,
  ArrowRight,
  BookOpen,
  Search,
} from 'lucide-react';
import {
  collection,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  deleteField,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { useSharedTimetable } from '../hooks/useSharedTimetable.ts';
import {
  mergeSharedAndPersonalSlots,
  buildSharedGroupId,
  resolveStudentAcademicGroup,
  TimetableGroupParams,
} from '../lib/sharedTimetable.ts';
import { isSlotApplicableToStudent } from '../lib/collegeEmail.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Progress } from '../components/ui/progress';
import {
  calculateAttendanceStats,
  calculateSubjectAttendance,
  calculateLectureWeight,
  validateAttendanceBaseline,
  validateAttendanceTotals,
  evaluateSubjectAttendanceEligibility,
  canonicalizeSubjectsForAttendance,
  buildTimetableSubjectEquivalenceMap,
  matchesSubjectRecord,
  type SubjectAttendanceAggregate,
  type AttendanceEligibility,
} from '../lib/attendanceCalculations';
import { SubjectAttendanceCard } from '../components/attendance/SubjectAttendanceCard';
import { AttendanceRing } from '../components/attendance/AttendanceRing';
import {
  AttendanceControls,
  type AttendanceFilterType,
  type AttendanceSortType,
} from '../components/attendance/AttendanceControls';
import toast from 'react-hot-toast';
import type { Subject, AttendanceRecord, AttendanceBaseline, TimetableSlot } from '../types';

export function AttendancePage() {
  const { currentUser, userProfile } = useAuth();
  const uid = currentUser?.uid ?? '';
  const { data: subjects, loading: subjectsLoading } = useCollection<Subject>(`users/${uid}/subjects`);
  const { data: legacyBaselines } = useCollection<AttendanceBaseline>(`users/${uid}/attendanceBaselines`);

  // Shared Timetable Group subscription via unified resolver
  const groupResolution = useMemo(() => {
    return resolveStudentAcademicGroup(userProfile);
  }, [userProfile]);

  const groupParams: TimetableGroupParams | null = groupResolution.params;

  const { sharedDoc } = useSharedTimetable(groupParams);
  const { data: personalSlots } = useCollection<TimetableSlot>(`users/${uid}/timetable`);

  const effectiveSlots = useMemo(() => {
    return mergeSharedAndPersonalSlots(
      sharedDoc?.slots || [],
      personalSlots,
      groupParams ? buildSharedGroupId(groupParams) : undefined
    );
  }, [sharedDoc?.slots, personalSlots, groupParams]);

  // Build dynamic subject equivalence resolution context for the active timetable scope
  const resolutionContext = useMemo(() => {
    return buildTimetableSubjectEquivalenceMap(effectiveSlots, subjects);
  }, [effectiveSlots, subjects]);

  // Derive subjects list automatically from user subjects and authoritative shared slots,
  // dynamically canonicalizing timetable variations (e.g. LAC & LACT, SPC & SPCL, ADI & ADI-FA)
  const allSubjects = useMemo(() => {
    return canonicalizeSubjectsForAttendance(subjects, effectiveSlots, currentUser?.uid, resolutionContext);
  }, [subjects, effectiveSlots, currentUser?.uid, resolutionContext]);

  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const subjectParam = searchParams.get('subject');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AttendanceFilterType>('all');
  const [sortMode, setSortMode] = useState<AttendanceSortType>('lowest');
  const [markingKey, setMarkingKey] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const studentGroup = userProfile?.studentGroup;

  const targetDateObj = useMemo(() => {
    const [year, month, day] = customDate.split('-').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }, [customDate]);

  const selectedDayOfWeek = targetDateObj.getDay();

  const scheduledSlotsForDate = useMemo(() => {
    return effectiveSlots
      .filter(
        (s) =>
          s.dayOfWeek === selectedDayOfWeek &&
          isSlotApplicableToStudent(s.group, studentGroup)
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [effectiveSlots, selectedDayOfWeek, studentGroup]);

  // Attendance totals editing modal state
  const [totalsModalSubject, setTotalsModalSubject] = useState<Subject | null>(null);
  const [totalDeliveredInput, setTotalDeliveredInput] = useState<string>('');
  const [totalAttendedInput, setTotalAttendedInput] = useState<string>('');
  const [totalsSaving, setTotalsSaving] = useState(false);

  // History & Correction modal state
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [correctionNote, setCorrectionNote] = useState('');
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [correctingStatus, setCorrectingStatus] = useState<'present' | 'absent' | 'cancelled' | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historySubjectFilter, setHistorySubjectFilter] = useState<string | null>(null);

  const target = (userProfile?.attendanceTarget ?? 75) / 100;

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, `users/${uid}/attendance`),
      orderBy('date', 'desc')
    );
    const unsub = onSnapshot(q, (s) =>
      setAttendance(s.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord)))
    );
    return () => unsub();
  }, [uid]);

  // Map each subject to its comprehensive aggregate attendance (group-aware)
  const subjectAggregates = useMemo(() => {
    const map = new Map<string, SubjectAttendanceAggregate>();
    for (const sub of allSubjects) {
      const subRecords = attendance.filter((a) => matchesSubjectRecord(sub, a.subjectId, resolutionContext));
      const fallback = legacyBaselines.find((b) => matchesSubjectRecord(sub, b.subjectId, resolutionContext)) || null;
      map.set(
        sub.id,
        calculateSubjectAttendance(sub, subRecords, target, fallback, studentGroup)
      );
    }
    return map;
  }, [allSubjects, attendance, legacyBaselines, target, studentGroup, resolutionContext]);

  // Evaluate attendance eligibility for each subject on targetDateObj
  const subjectEligibilityMap = useMemo(() => {
    const map = new Map<string, AttendanceEligibility>();
    const now = new Date();
    for (const sub of allSubjects) {
      const eligibility = evaluateSubjectAttendanceEligibility(
        sub,
        scheduledSlotsForDate,
        attendance,
        targetDateObj,
        now,
        resolutionContext
      );
      map.set(sub.id, eligibility);
    }
    return map;
  }, [allSubjects, scheduledSlotsForDate, attendance, targetDateObj, resolutionContext]);

  // Overall attendance statistics across all subjects
  const overallStats = useMemo(() => {
    let totalAttended = 0;
    let totalConducted = 0;
    for (const agg of subjectAggregates.values()) {
      totalAttended += agg.totalAttended;
      totalConducted += agg.totalConducted;
    }
    return calculateAttendanceStats(totalAttended, totalConducted, target);
  }, [subjectAggregates, target]);

  // If navigated with ?subject=..., automatically focus and select that subject
  useEffect(() => {
    if (subjectParam && allSubjects.length > 0 && !selectedSubjectId) {
      const match = allSubjects.find(
        (s) =>
          s.id === subjectParam ||
          (s.code && s.code.toUpperCase() === subjectParam.toUpperCase()) ||
          matchesSubjectRecord(s, subjectParam, resolutionContext)
      );
      if (match) {
        setSelectedSubjectId(match.id);
      }
    }
  }, [subjectParam, allSubjects, selectedSubjectId, resolutionContext]);

  // Open Attendance Totals Modal
  function handleOpenTotalsEditor(sub: Subject) {
    const agg = subjectAggregates.get(sub.id);
    setTotalsModalSubject(sub);
    setTotalDeliveredInput(String(agg?.totalConducted ?? 0));
    setTotalAttendedInput(String(agg?.totalAttended ?? 0));
  }

  // Backwards compatibility alias for baseline
  function handleOpenBaseline(sub: Subject) {
    handleOpenTotalsEditor(sub);
  }

  // Save Attendance Totals to Firestore under /users/{uid}/subjects/{subjectId}
  async function handleSaveTotals() {
    if (!totalsModalSubject || !uid) return;
    const agg = subjectAggregates.get(totalsModalSubject.id);
    const loggedConducted = agg?.loggedConducted ?? 0;
    const loggedAttended = agg?.loggedAttended ?? 0;

    const validation = validateAttendanceTotals(
      totalAttendedInput,
      totalDeliveredInput,
      loggedAttended,
      loggedConducted
    );
    if (!validation.isValid) {
      toast.error(validation.error || 'Invalid attendance totals');
      return;
    }

    setTotalsSaving(true);
    try {
      await setDoc(
        doc(db, `users/${uid}/subjects/${totalsModalSubject.id}`),
        {
          name: totalsModalSubject.name,
          code: totalsModalSubject.code,
          faculty: totalsModalSubject.faculty || null,
          credits: totalsModalSubject.credits || 3,
          color: totalsModalSubject.color || '#3b82f6',
          initialAttended: validation.derivedBaselineAttended,
          initialConducted: validation.derivedBaselineConducted,
          baselineAttended: validation.derivedBaselineAttended,
          baselineConducted: validation.derivedBaselineConducted,
          baselineUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      toast.success(`Updated attendance totals for ${totalsModalSubject.name}`);
      setTotalsModalSubject(null);
    } catch (err) {
      console.error('Failed to save totals:', err);
      toast.error('Failed to save attendance totals. Check network connection.');
    } finally {
      setTotalsSaving(false);
    }
  }

  // Mark attendance for an eligible subject session on targetDateObj
  async function markAttendance(
    subjectId: string,
    status: 'present' | 'absent',
    lectureSlotId?: string,
    weight?: number,
    notes?: string
  ) {
    const targetDate = targetDateObj;
    const dateTs = Timestamp.fromDate(targetDate);

    const sub = allSubjects.find((s) => s.id === subjectId) || allSubjects.find((s) => matchesSubjectRecord(s, subjectId));

    // Resolve eligibility strictly using authoritative timetable evaluator
    const now = new Date();
    const eligibility = evaluateSubjectAttendanceEligibility(
      sub || subjectId,
      scheduledSlotsForDate,
      attendance,
      targetDate,
      now,
      resolutionContext
    );

    if (!eligibility.isEligible) {
      if (eligibility.status === 'NO_SCHEDULED_CLASS') {
        toast.error(`Cannot mark attendance: no class scheduled for ${sub?.name || 'this subject'} on this date`);
      } else if (eligibility.status === 'FUTURE_SESSION') {
        toast.error('Cannot mark attendance for upcoming classes');
      } else if (eligibility.status === 'ALL_MARKED') {
        toast.error('All scheduled sessions for this date are already marked. Use Correct to edit.');
      } else {
        toast.error(eligibility.reason || 'Cannot mark attendance');
      }
      return;
    }

    const slotToMark = eligibility.slot;
    if (!slotToMark) {
      toast.error('No valid scheduled class found for marking');
      return;
    }

    const targetSlotId = lectureSlotId || slotToMark.id;
    const effectiveWeight: number = weight && weight >= 1 ? weight : ((eligibility.weight && eligibility.weight > 0) ? eligibility.weight : 1);

    // Prevent duplicate attendance records for the same session/date
    const existing = attendance.find((a) => {
      if (a.date.toDate().toDateString() !== targetDate.toDateString()) return false;
      if (a.status === 'cancelled') return false;
      return a.lectureSlotId === targetSlotId;
    });

    if (existing) {
      toast.error(`Attendance already marked (${existing.status}) for ${format(targetDate, 'MMM d')}. Use correction instead.`);
      return;
    }

    const markKey = `${subjectId}-${targetSlotId}`;
    setMarkingKey(markKey);
    try {
      await addDoc(collection(db, `users/${uid}/attendance`), {
        uid,
        subjectId: sub?.id || subjectId,
        date: dateTs,
        lectureSlotId: targetSlotId,
        weight: effectiveWeight,
        status,
        notes: notes || null,
        group: userProfile?.studentGroup || 'ALL',
        source: 'manual',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success(
        effectiveWeight > 1
          ? `Marked ${status} (${effectiveWeight}-period lab, weight ${effectiveWeight}) for ${format(targetDate, 'MMM d')}`
          : `Marked ${status} for ${format(targetDate, 'MMM d')}`
      );
    } catch {
      toast.error('Failed to record attendance');
    } finally {
      setMarkingKey(null);
    }
  }

  function handleMarkSubject(subjectId: string, status: 'present' | 'absent') {
    markAttendance(subjectId, status);
  }

  // Attendance correction workflow
  async function handleCorrection(recordId: string, newStatus: 'present' | 'absent' | 'cancelled') {
    if (isCorrecting || isDeletingRecord) return;
    if (!uid) {
      toast.error('You must be signed in to correct attendance records', { id: 'attendance-correction' });
      return;
    }
    if (!recordId) {
      toast.error('Invalid attendance record ID', { id: 'attendance-correction' });
      return;
    }

    setIsCorrecting(true);
    setCorrectingStatus(newStatus);
    try {
      const trimmedNote = correctionNote.trim();
      const payload: {
        uid: string;
        status: 'present' | 'absent' | 'cancelled';
        updatedAt: ReturnType<typeof serverTimestamp>;
        notes?: string | ReturnType<typeof deleteField>;
      } = {
        uid,
        status: newStatus,
        updatedAt: serverTimestamp(),
      };

      if (trimmedNote) {
        payload.notes = trimmedNote;
      } else {
        payload.notes = deleteField();
      }

      await updateDoc(doc(db, `users/${uid}/attendance/${recordId}`), payload);
      toast.success('Attendance record corrected', { id: 'attendance-correction' });
      setEditingRecord(null);
      setCorrectionNote('');
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      console.error('[AttendanceCorrection] Failed to update attendance record:', {
        recordId,
        uid,
        newStatus,
        code: fbErr?.code,
        message: fbErr?.message,
      });

      const userMessage =
        fbErr?.code === 'permission-denied'
          ? 'Permission denied: Cannot edit this attendance record'
          : fbErr?.code === 'not-found'
          ? 'Record no longer exists'
          : 'Failed to update record. Please check your connection and try again.';

      toast.error(userMessage, { id: 'attendance-correction' });
    } finally {
      setIsCorrecting(false);
      setCorrectingStatus(null);
    }
  }

  // Delete attendance record
  async function handleDeleteRecord(recordId: string) {
    if (isCorrecting || isDeletingRecord) return;
    if (!uid) {
      toast.error('You must be signed in to remove attendance records', { id: 'attendance-deletion' });
      return;
    }
    if (!recordId) {
      toast.error('Invalid attendance record ID', { id: 'attendance-deletion' });
      return;
    }
    if (!confirm('Remove this attendance entry?')) return;

    setIsDeletingRecord(true);
    try {
      await deleteDoc(doc(db, `users/${uid}/attendance/${recordId}`));
      toast.success('Record removed', { id: 'attendance-deletion' });
      if (editingRecord?.id === recordId) {
        setEditingRecord(null);
        setCorrectionNote('');
      }
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      console.error('[AttendanceDeletion] Failed to delete attendance record:', {
        recordId,
        uid,
        code: fbErr?.code,
        message: fbErr?.message,
      });
      const userMessage =
        fbErr?.code === 'permission-denied'
          ? 'Permission denied: Cannot delete this attendance record'
          : 'Failed to delete record. Please check your connection and try again.';
      toast.error(userMessage, { id: 'attendance-deletion' });
    } finally {
      setIsDeletingRecord(false);
    }
  }

  // Count categories for quick badges
  const counts = useMemo(() => {
    let safe = 0;
    let borderline = 0;
    let shortage = 0;
    for (const sub of allSubjects) {
      const agg = subjectAggregates.get(sub.id);
      if (!agg) continue;
      if (agg.stats.status === 'safe') safe++;
      else if (agg.stats.status === 'borderline') borderline++;
      else if (agg.stats.status === 'shortage') shortage++;
    }
    return {
      total: allSubjects.length,
      safe,
      borderline,
      shortage,
    };
  }, [allSubjects, subjectAggregates]);

  // Filter and sort subjects for display
  const filteredSubjects = useMemo(() => {
    let list = [...allSubjects];

    // 1. Search Query filter (name, code, faculty)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.code && s.code.toLowerCase().includes(q)) ||
          (s.faculty && s.faculty.toLowerCase().includes(q))
      );
    }

    // 2. Health status filter
    if (statusFilter !== 'all') {
      list = list.filter((s) => {
        const agg = subjectAggregates.get(s.id);
        return agg && agg.stats.status === statusFilter;
      });
    }

    // 3. Specific selected subject filter (if clicked)
    if (selectedSubjectId) {
      list = list.filter((s) => s.id === selectedSubjectId);
    }

    // 4. Sorting
    list.sort((a, b) => {
      const aggA = subjectAggregates.get(a.id);
      const aggB = subjectAggregates.get(b.id);
      const pctA = aggA ? aggA.stats.percentage : 0;
      const pctB = aggB ? aggB.stats.percentage : 0;

      if (sortMode === 'lowest') {
        const condA = aggA ? aggA.totalConducted : 0;
        const condB = aggB ? aggB.totalConducted : 0;
        if (condA > 0 && condB === 0) return -1;
        if (condA === 0 && condB > 0) return 1;
        return pctA - pctB;
      }
      if (sortMode === 'highest') {
        return pctB - pctA;
      }
      if (sortMode === 'classes') {
        const condA = aggA ? aggA.totalConducted : 0;
        const condB = aggB ? aggB.totalConducted : 0;
        return condB - condA;
      }
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [allSubjects, searchQuery, statusFilter, selectedSubjectId, sortMode, subjectAggregates]);

  return (
    <div className="space-y-4 sm:space-y-5 max-w-7xl mx-auto">
      {/* Top Header Row: Title & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Attendance
          </h2>
          <p className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
            Target: <span className="text-blue-600 dark:text-blue-400 font-bold">{Math.round(target * 100)}%</span> institutional requirement
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const el = document.querySelector('input[placeholder="Search subjects..."]') as HTMLInputElement;
              if (el) {
                el.focus();
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }}
            className="p-2 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Search subjects"
            aria-label="Search subjects"
          >
            <Search className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <div className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-1.5 shadow-sm">
            <CalendarIcon className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-500 hidden sm:inline">Mark Date:</span>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="text-xs bg-transparent font-semibold text-gray-800 dark:text-gray-200 focus:outline-none"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setHistorySubjectFilter(null);
              setShowHistoryModal(true);
            }}
          >
            <History className="w-4 h-4 mr-1.5" /> History ({attendance.length})
          </Button>
        </div>
      </div>

      {/* Overall Attendance Card matching Panel 3 Reference Design */}
      <Card className="overflow-hidden border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-gray-900 rounded-3xl shadow-sm">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center gap-5 sm:gap-6">
            {/* Circular Ring on Left with centered percentage and subText="Overall" */}
            <div className="shrink-0 flex items-center justify-center">
              <AttendanceRing
                percentage={overallStats.percentage}
                size={96}
                strokeWidth={8}
                target={Math.round(target * 100)}
                status={overallStats.status}
                subText="Overall"
                showTargetIndicator={false}
                className="shrink-0 drop-shadow-xs"
              />
            </div>

            {/* Overall Ratio, Target Badge and Guidance on Right */}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
                  {overallStats.attended} <span className="text-slate-400 dark:text-slate-500 font-bold text-lg sm:text-xl">/ {overallStats.conducted}</span>
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
                Classes attended
              </p>

              <div className="pt-1 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                  {Math.round(target * 100)}% Target
                </span>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium pt-0.5">
                {overallStats.conducted === 0
                  ? 'No recorded sessions yet'
                  : overallStats.isOnTrack
                  ? `You can safely miss up to ${overallStats.maxAbsences} ${overallStats.maxAbsences === 1 ? 'weighted session' : 'weighted sessions'}`
                  : `Attend next ${overallStats.classesNeeded} ${overallStats.classesNeeded === 1 ? 'class' : 'classes'} to reach ${Math.round(target * 100)}%`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interactive Controls: Search, Status Filter & Sorting */}
      <AttendanceControls
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterMode={statusFilter}
        onFilterChange={(f) => {
          setStatusFilter(f);
          setSelectedSubjectId(null);
        }}
        sortMode={sortMode}
        onSortChange={setSortMode}
        targetPercent={Math.round(target * 100)}
        counts={counts}
      />

      {/* Subject Cards Grid */}
      {subjectsLoading ? (
        <div className="text-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-2 border-blue-600 border-t-transparent mx-auto mb-3" />
          <p className="text-xs text-gray-400">Loading your attendance records...</p>
        </div>
      ) : allSubjects.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">No Enrolled Subjects Yet</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mb-5 leading-relaxed">
            Add your semester subjects to start tracking lecture attendance, setting historical baselines, and monitoring minimum targets.
          </p>
          <Link to="/timetable">
            <Button size="sm">
              Set Up Timetable Schedule <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        </div>
      ) : filteredSubjects.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No subjects match your filter or search.</p>
          <p className="text-xs text-gray-400 mt-1">Try resetting the status filter or clearing your search term.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setSelectedSubjectId(null);
            }}
          >
            Reset All Filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredSubjects.map((sub) => {
            const agg = subjectAggregates.get(sub.id) || {
              baselineAttended: 0,
              baselineConducted: 0,
              loggedAttended: 0,
              loggedConducted: 0,
              totalAttended: 0,
              totalConducted: 0,
              stats: calculateAttendanceStats(0, 0, target),
              hasBaseline: false,
            };
            const subAtt = attendance.filter((a) => matchesSubjectRecord(sub, a.subjectId));
            const isMarking =
              markingKey === sub.id ||
              (markingKey?.startsWith(`${sub.id}-`) ?? false);

            const eligibility = subjectEligibilityMap.get(sub.id);

            return (
              <SubjectAttendanceCard
                key={sub.id}
                subject={sub}
                aggregate={agg}
                targetPercent={Math.round(target * 100)}
                isMarking={isMarking}
                recentRecords={subAtt}
                eligibility={eligibility}
                onMarkPresent={() => handleMarkSubject(sub.id, 'present')}
                onMarkAbsent={() => handleMarkSubject(sub.id, 'absent')}
                onOpenTotalsEditor={() => handleOpenTotalsEditor(sub)}
                onOpenBaseline={() => handleOpenTotalsEditor(sub)}
                onOpenHistory={() => {
                  setHistorySubjectFilter(sub.id);
                  setShowHistoryModal(true);
                }}
                onCorrectRecord={(record) => {
                  setEditingRecord(record);
                  setCorrectionNote(record.notes || '');
                }}
              />
            );
          })}
        </div>
      )}

      {/* ============================================================== */}
      {/* Edit Attendance Totals Modal                                   */}
      {/* ============================================================== */}
      {totalsModalSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-blue-600" />
                  Edit Attendance Totals
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Subject: <strong className="text-gray-800 dark:text-gray-200">{totalsModalSubject.name}</strong> ({totalsModalSubject.code})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTotalsModalSubject(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {(() => {
              const agg = totalsModalSubject ? subjectAggregates.get(totalsModalSubject.id) : null;
              const loggedConducted = agg?.loggedConducted ?? 0;
              const loggedAttended = agg?.loggedAttended ?? 0;
              const val = validateAttendanceTotals(
                totalAttendedInput,
                totalDeliveredInput,
                loggedAttended,
                loggedConducted
              );

              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                        Total Delivered
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="e.g. 40"
                        value={totalDeliveredInput}
                        onChange={(e) => setTotalDeliveredInput(e.target.value)}
                        className="mt-1 font-bold text-base"
                      />
                      <span className="text-[10px] text-gray-400 block mt-1">
                        Total classes held/delivered so far
                      </span>
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                        Total Attended
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="e.g. 32"
                        value={totalAttendedInput}
                        onChange={(e) => setTotalAttendedInput(e.target.value)}
                        className="mt-1 font-bold text-base"
                      />
                      <span className="text-[10px] text-gray-400 block mt-1">
                        Total classes attended so far
                      </span>
                    </div>
                  </div>

                  {/* Summary & Live Preview */}
                  {val.isValid ? (
                    <div className="space-y-2">
                      <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 flex items-center justify-between">
                        <div className="text-xs">
                          <span className="font-semibold text-slate-600 dark:text-slate-300 block">
                            Current Attendance:
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            {val.attended} / {val.delivered} classes
                          </span>
                        </div>
                        <span className="text-xl font-black text-blue-600 dark:text-blue-400 tracking-tight">
                          {val.percentage.toFixed(1)}%
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 leading-relaxed">
                        {loggedConducted > 0 ? (
                          <>
                            UniFlow tracks <strong className="text-slate-700 dark:text-slate-300">{loggedConducted}</strong> classes logged in your attendance history (<strong className="text-slate-700 dark:text-slate-300">{loggedAttended}</strong> attended). Adjusting totals sets your starting baseline to <strong className="text-slate-700 dark:text-slate-300">{val.derivedBaselineAttended} / {val.derivedBaselineConducted}</strong> without altering logged records.
                          </>
                        ) : (
                          <>
                            No classes logged yet in UniFlow. Totals will set your starting baseline directly.
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{val.error}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setTotalsModalSubject(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="flex-1 font-bold bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={!val.isValid || totalsSaving}
                      loading={totalsSaving}
                      onClick={handleSaveTotals}
                    >
                      Save Changes
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Attendance Correction Modal                                    */}
      {/* ============================================================== */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-100 dark:border-gray-800">
            <h3 className="text-lg font-bold mb-1 text-gray-900 dark:text-white flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-blue-600" /> Correct Attendance Record
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Date: <strong>{format(editingRecord.date.toDate(), 'MMMM d, yyyy')}</strong> • Current Status: <strong>{editingRecord.status}</strong>
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">New Status</label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <Button
                    variant={editingRecord.status === 'present' ? 'primary' : 'outline'}
                    size="sm"
                    disabled={isCorrecting || isDeletingRecord}
                    loading={isCorrecting && correctingStatus === 'present'}
                    onClick={() => handleCorrection(editingRecord.id, 'present')}
                  >
                    Present
                  </Button>
                  <Button
                    variant={editingRecord.status === 'absent' ? 'danger' : 'outline'}
                    size="sm"
                    disabled={isCorrecting || isDeletingRecord}
                    loading={isCorrecting && correctingStatus === 'absent'}
                    onClick={() => handleCorrection(editingRecord.id, 'absent')}
                  >
                    Absent
                  </Button>
                  <Button
                    variant={editingRecord.status === 'cancelled' ? 'secondary' : 'outline'}
                    size="sm"
                    disabled={isCorrecting || isDeletingRecord}
                    loading={isCorrecting && correctingStatus === 'cancelled'}
                    onClick={() => handleCorrection(editingRecord.id, 'cancelled')}
                  >
                    Cancelled
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Correction Reason / Note</label>
                <Input
                  placeholder="e.g. Teacher corrected medical leave"
                  value={correctionNote}
                  disabled={isCorrecting || isDeletingRecord}
                  onChange={(e) => setCorrectionNote(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
              <Button
                variant="danger"
                size="sm"
                disabled={isCorrecting || isDeletingRecord}
                loading={isDeletingRecord}
                onClick={() => handleDeleteRecord(editingRecord.id)}
              >
                Delete Entry
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isCorrecting || isDeletingRecord}
                onClick={() => {
                  setEditingRecord(null);
                  setCorrectionNote('');
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Full History Logs Modal                                        */}
      {/* ============================================================== */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl border border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Attendance Log History
                </h3>
                <p className="text-xs text-gray-500">
                  {historySubjectFilter
                    ? `Showing records for ${allSubjects.find((s) => s.id === historySubjectFilter)?.name}`
                    : 'All individual recorded lecture sessions'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowHistoryModal(false)}>
                Close
              </Button>
            </div>

            {/* Filter in History */}
            {allSubjects.length > 0 && (
              <div className="flex gap-1.5 flex-wrap pb-3 mb-3 border-b border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setHistorySubjectFilter(null)}
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                    !historySubjectFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  All ({attendance.length})
                </button>
                {allSubjects.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setHistorySubjectFilter(s.id === historySubjectFilter ? null : s.id)}
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                      historySubjectFilter === s.id ? 'text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                    style={historySubjectFilter === s.id ? { backgroundColor: s.color } : {}}
                  >
                    {s.code} ({attendance.filter((a) => matchesSubjectRecord(s, a.subjectId)).length})
                  </button>
                ))}
              </div>
            )}

            {(() => {
              const selectedFilterSub = historySubjectFilter
                ? allSubjects.find((s) => s.id === historySubjectFilter)
                : null;
              const displayLogs = selectedFilterSub
                ? attendance.filter((a) => matchesSubjectRecord(selectedFilterSub, a.subjectId))
                : historySubjectFilter
                ? attendance.filter((a) => a.subjectId === historySubjectFilter)
                : attendance;

              if (displayLogs.length === 0) {
                return (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    No individual lecture records found.
                  </div>
                );
              }

              return (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {displayLogs.map((rec) => {
                    const sub = allSubjects.find((s) => matchesSubjectRecord(s, rec.subjectId));
                    return (
                      <div key={rec.id} className="py-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{sub?.name || 'Subject'}</p>
                            <span className="text-[11px] font-mono text-gray-400">({sub?.code})</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {format(rec.date.toDate(), 'EEEE, MMMM d, yyyy')} • Source: {rec.source}
                            {rec.notes && <span className="ml-1 text-blue-500 italic">({rec.notes})</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={rec.status === 'present' ? 'success' : rec.status === 'absent' ? 'danger' : 'default'}>
                            {rec.status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingRecord(rec);
                              setCorrectionNote(rec.notes || '');
                              setShowHistoryModal(false);
                            }}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
