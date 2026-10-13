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
  Sliders,
  History,
  AlertCircle,
  Check,
  ArrowRight,
  BookOpen,
  BarChart2,
  Search,
} from 'lucide-react';
import {
  collection,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
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
  validateAttendanceBaseline,
  canonicalizeSubjectsForAttendance,
  buildTimetableSubjectEquivalenceMap,
  matchesSubjectRecord,
  type SubjectAttendanceAggregate,
} from '../lib/attendanceCalculations';
import { AttendanceOverviewCard } from '../components/attendance/AttendanceOverviewCard';
import { SubjectAttendanceCard } from '../components/attendance/SubjectAttendanceCard';
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

  // Baseline editing modal state
  const [baselineModalSubject, setBaselineModalSubject] = useState<Subject | null>(null);
  const [baselineConductedInput, setBaselineConductedInput] = useState<string>('');
  const [baselineAttendedInput, setBaselineAttendedInput] = useState<string>('');
  const [baselineStep, setBaselineStep] = useState<'input' | 'confirm'>('input');
  const [baselineSaving, setBaselineSaving] = useState(false);

  // History & Correction modal state
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [correctionNote, setCorrectionNote] = useState('');
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

  // Open Baseline Modal
  function handleOpenBaseline(sub: Subject) {
    const agg = subjectAggregates.get(sub.id);
    setBaselineModalSubject(sub);
    setBaselineConductedInput(String(agg?.baselineConducted ?? 0));
    setBaselineAttendedInput(String(agg?.baselineAttended ?? 0));
    setBaselineStep('input');
  }

  // Save Baseline to Firestore under /users/{uid}/subjects/{subjectId}
  async function handleSaveBaseline() {
    if (!baselineModalSubject || !uid) return;
    const validation = validateAttendanceBaseline(baselineAttendedInput, baselineConductedInput);
    if (!validation.isValid) {
      toast.error(validation.error || 'Invalid baseline values');
      return;
    }

    setBaselineSaving(true);
    try {
      await setDoc(
        doc(db, `users/${uid}/subjects/${baselineModalSubject.id}`),
        {
          name: baselineModalSubject.name,
          code: baselineModalSubject.code,
          faculty: baselineModalSubject.faculty || null,
          credits: baselineModalSubject.credits || 3,
          color: baselineModalSubject.color || '#3b82f6',
          initialAttended: validation.attended,
          initialConducted: validation.conducted,
          baselineAttended: validation.attended,
          baselineConducted: validation.conducted,
          baselineUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      toast.success(`Updated attendance baseline for ${baselineModalSubject.name}`);
      setBaselineModalSubject(null);
    } catch (err) {
      console.error('Failed to save baseline:', err);
      toast.error('Failed to save attendance baseline. Check network connection.');
    } finally {
      setBaselineSaving(false);
    }
  }

  // Mark attendance for a subject session (either today or selected custom date)
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

    // Prevent duplicate attendance records for the same session/date
    const existing = attendance.find((a) => {
      if (a.date.toDate().toDateString() !== targetDate.toDateString()) return false;
      if (a.status === 'cancelled') return false;
      if (lectureSlotId) {
        return a.lectureSlotId === lectureSlotId;
      }
      return !a.lectureSlotId && matchesSubjectRecord(sub || subjectId, a.subjectId);
    });

    if (existing) {
      toast.error(`Attendance already marked (${existing.status}) for ${format(targetDate, 'MMM d')}. Use correction instead.`);
      return;
    }

    const effectiveWeight = weight && weight >= 1 ? weight : 1;
    const markKey = lectureSlotId ? `${subjectId}-${lectureSlotId}` : subjectId;
    setMarkingKey(markKey);
    try {
      await addDoc(collection(db, `users/${uid}/attendance`), {
        uid,
        subjectId: sub?.id || subjectId,
        date: dateTs,
        lectureSlotId: lectureSlotId || null,
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

  /**
   * For a given subject (on the selected date), finds the earliest scheduled
   * session that has NOT yet been marked (no non-cancelled attendance record
   * with that session's slot ID for the target date).
   *
   * If all scheduled sessions are already marked, returns null.
   * If no scheduled sessions exist for that subject, returns null (legacy path).
   */
  function resolveNextUnmarkedSlotForSubject(
    subjectId: string
  ): { slot: TimetableSlot; weight: number } | null {
    const slotsForSubject = scheduledSlotsForDate.filter(
      (s) =>
        s.subjectId === subjectId ||
        matchesSubjectRecord(
          allSubjects.find((sub) => sub.id === subjectId) || subjectId,
          s.subjectId,
          resolutionContext
        )
    );
    if (slotsForSubject.length === 0) return null;

    for (const slot of slotsForSubject) {
      const alreadyMarked = attendance.some(
        (a) =>
          a.lectureSlotId === slot.id &&
          a.date.toDate().toDateString() === targetDateObj.toDateString() &&
          a.status !== 'cancelled'
      );
      if (!alreadyMarked) {
        return { slot, weight: slot.weight && slot.weight > 0 ? slot.weight : 1 };
      }
    }
    // All sessions for this subject on this date are already marked
    return null;
  }

  // Attendance correction workflow
  async function handleCorrection(recordId: string, newStatus: 'present' | 'absent' | 'cancelled') {
    try {
      await updateDoc(doc(db, `users/${uid}/attendance/${recordId}`), {
        status: newStatus,
        notes: correctionNote.trim() || undefined,
        updatedAt: serverTimestamp(),
      });
      toast.success('Attendance record corrected');
      setEditingRecord(null);
      setCorrectionNote('');
    } catch {
      toast.error('Failed to update record');
    }
  }

  // Delete attendance record
  async function handleDeleteRecord(recordId: string) {
    if (!confirm('Remove this attendance entry?')) return;
    try {
      await deleteDoc(doc(db, `users/${uid}/attendance/${recordId}`));
      toast.success('Record removed');
      if (editingRecord?.id === recordId) {
        setEditingRecord(null);
      }
    } catch {
      toast.error('Failed to delete record');
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
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Bar matching reference image */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Attendance</h2>
            <p className="text-xs text-gray-400">Target: {(target * 100).toFixed(0)}% institutional requirement</p>
          </div>
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
            <Search className="w-5 h-5" />
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
            <History className="w-4 h-4 mr-1.5" /> Full History ({attendance.length})
          </Button>
        </div>
      </div>

      {/* Premium Attendance Overview Card */}
      {allSubjects.length > 0 && (
        <AttendanceOverviewCard
          stats={overallStats}
          subjectCount={allSubjects.length}
          safeCount={counts.safe}
          borderlineCount={counts.borderline}
          shortageCount={counts.shortage}
          targetPercent={Math.round(target * 100)}
          activeFilter={statusFilter}
          onSelectFilter={(f) => {
            setStatusFilter(f);
            setSelectedSubjectId(null);
          }}
        />
      )}

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

            return (
              <SubjectAttendanceCard
                key={sub.id}
                subject={sub}
                aggregate={agg}
                targetPercent={Math.round(target * 100)}
                isMarking={isMarking}
                recentRecords={subAtt}
                onMarkPresent={() => {
                  const next = resolveNextUnmarkedSlotForSubject(sub.id);
                  if (next) {
                    markAttendance(next.slot.subjectId || sub.id, 'present', next.slot.id, next.weight);
                  } else {
                    const hasScheduled = scheduledSlotsForDate.some((s) =>
                      matchesSubjectRecord(sub, s.subjectId, resolutionContext)
                    );
                    if (hasScheduled) {
                      toast.error('All scheduled sessions for this date are already marked. Use Correct to edit.');
                    } else {
                      markAttendance(sub.id, 'present');
                    }
                  }
                }}
                onMarkAbsent={() => {
                  const next = resolveNextUnmarkedSlotForSubject(sub.id);
                  if (next) {
                    markAttendance(next.slot.subjectId || sub.id, 'absent', next.slot.id, next.weight);
                  } else {
                    const hasScheduled = scheduledSlotsForDate.some((s) =>
                      matchesSubjectRecord(sub, s.subjectId, resolutionContext)
                    );
                    if (hasScheduled) {
                      toast.error('All scheduled sessions for this date are already marked. Use Correct to edit.');
                    } else {
                      markAttendance(sub.id, 'absent');
                    }
                  }
                }}
                onOpenBaseline={() => handleOpenBaseline(sub)}
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
      {/* Set / Edit Previous Attendance Baseline Modal                   */}
      {/* ============================================================== */}
      {baselineModalSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-gray-100 dark:border-gray-800">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-blue-600" />
                  Previous Attendance Baseline
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Subject: <strong className="text-gray-800 dark:text-gray-200">{baselineModalSubject.name}</strong> ({baselineModalSubject.code})
                </p>
              </div>
              <button
                onClick={() => setBaselineModalSubject(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {baselineStep === 'input' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                  <p className="font-semibold mb-1">💡 What is a Baseline?</p>
                  Enter classes conducted and attended before you began tracking in UniFlow. These numbers will be added to your lecture-by-lecture records without erasing or overwriting any existing history.
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                      Total Classes Conducted
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g. 40"
                      value={baselineConductedInput}
                      onChange={(e) => setBaselineConductedInput(e.target.value)}
                      className="mt-1 font-bold text-base"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Classes held so far</p>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                      Classes Attended
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g. 32"
                      value={baselineAttendedInput}
                      onChange={(e) => setBaselineAttendedInput(e.target.value)}
                      className="mt-1 font-bold text-base"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Classes you attended</p>
                  </div>
                </div>

                {/* Instant Calculation Preview */}
                {(() => {
                  const val = validateAttendanceBaseline(baselineAttendedInput, baselineConductedInput);
                  if (!val.isValid) {
                    return (
                      <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{val.error}</span>
                      </div>
                    );
                  }

                  const subRecords = attendance.filter((a) => matchesSubjectRecord(baselineModalSubject, a.subjectId));
                  const preview = calculateSubjectAttendance(
                    { initialAttended: val.attended, initialConducted: val.conducted },
                    subRecords,
                    target
                  );

                  return (
                    <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-2.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Live Calculation Preview</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Proposed Baseline:</span>
                        <span className="font-bold">
                          {val.conducted > 0 ? `${((val.attended / val.conducted) * 100).toFixed(1)}%` : '0.0%'} ({val.attended}/{val.conducted})
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Tracked in UniFlow:</span>
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          {preview.loggedAttended} / {preview.loggedConducted} lectures
                        </span>
                      </div>
                      <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-base">
                        <span className="font-bold text-gray-900 dark:text-white">New Aggregate Total:</span>
                        <span className={`font-black ${preview.stats.isOnTrack ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                          {preview.totalConducted > 0 ? `${preview.stats.percentage.toFixed(1)}%` : '0.0%'} ({preview.totalAttended}/{preview.totalConducted})
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {preview.stats.isOnTrack
                          ? `✅ On track: Can safely miss ${preview.stats.maxAbsences} classes without falling below ${(target * 100).toFixed(0)}%.`
                          : `⚠️ Below target: Must attend next ${preview.stats.classesNeeded} classes to reach ${(target * 100).toFixed(0)}%.`}
                      </p>
                    </div>
                  );
                })()}

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setBaselineModalSubject(null)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 font-bold"
                    onClick={() => {
                      const val = validateAttendanceBaseline(baselineAttendedInput, baselineConductedInput);
                      if (!val.isValid) {
                        toast.error(val.error || 'Please correct inputs');
                        return;
                      }
                      setBaselineStep('confirm');
                    }}
                  >
                    Review Summary <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {baselineStep === 'confirm' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-bold text-sm mb-1">⚠️ Confirm Baseline Adjustment</p>
                  <p>
                    Updating this baseline adjusts your historical total without modifying or deleting individual lecture records tracked by UniFlow.
                  </p>
                </div>

                {(() => {
                  const val = validateAttendanceBaseline(baselineAttendedInput, baselineConductedInput);
                  const subRecords = attendance.filter((a) => matchesSubjectRecord(baselineModalSubject, a.subjectId));
                  const preview = calculateSubjectAttendance(
                    { initialAttended: val.attended, initialConducted: val.conducted },
                    subRecords,
                    target
                  );
                  const currentAgg = subjectAggregates.get(baselineModalSubject.id);

                  return (
                    <div className="border border-gray-100 dark:border-gray-800 rounded-2xl p-4 divide-y divide-gray-100 dark:divide-gray-800 text-xs space-y-2">
                      <div className="pb-2 flex justify-between">
                        <span className="text-gray-500">Current Aggregate:</span>
                        <span className="font-semibold">{currentAgg?.totalAttended ?? 0} / {currentAgg?.totalConducted ?? 0} classes ({currentAgg?.stats.percentage.toFixed(1) ?? '0.0'}%)</span>
                      </div>
                      <div className="py-2 flex justify-between">
                        <span className="text-gray-500">New Baseline Entered:</span>
                        <span className="font-bold text-blue-600">{val.attended} attended / {val.conducted} conducted</span>
                      </div>
                      <div className="py-2 flex justify-between">
                        <span className="text-gray-500">UniFlow Tracked Records:</span>
                        <span className="font-semibold">{preview.loggedAttended} / {preview.loggedConducted} (Preserved)</span>
                      </div>
                      <div className="pt-2 flex justify-between text-sm">
                        <span className="font-bold text-gray-900 dark:text-white">Updated Aggregate:</span>
                        <span className={`font-black ${preview.stats.isOnTrack ? 'text-green-600' : 'text-red-500'}`}>
                          {preview.totalAttended} / {preview.totalConducted} ({preview.stats.percentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setBaselineStep('input')}>
                    Back to Edit
                  </Button>
                  <Button className="flex-1 font-bold bg-blue-600 hover:bg-blue-700" loading={baselineSaving} onClick={handleSaveBaseline}>
                    <Check className="w-4 h-4 mr-1.5" /> Confirm & Save
                  </Button>
                </div>
              </div>
            )}
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
                    onClick={() => handleCorrection(editingRecord.id, 'present')}
                  >
                    Present
                  </Button>
                  <Button
                    variant={editingRecord.status === 'absent' ? 'danger' : 'outline'}
                    size="sm"
                    onClick={() => handleCorrection(editingRecord.id, 'absent')}
                  >
                    Absent
                  </Button>
                  <Button
                    variant={editingRecord.status === 'cancelled' ? 'secondary' : 'outline'}
                    size="sm"
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
                  onChange={(e) => setCorrectionNote(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
              <Button variant="danger" size="sm" onClick={() => handleDeleteRecord(editingRecord.id)}>
                Delete Entry
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditingRecord(null)}>
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
