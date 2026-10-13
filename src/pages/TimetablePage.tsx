import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Edit2,
  Trash2,
  Calendar,
  List,
  Upload,
  UploadCloud,
  FileSpreadsheet,
  Clock,
  Sparkles,
  ArrowRight,
  MapPin,
  User,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Users,
  ShieldCheck,
  X,
  FileText,
  GraduationCap,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { timeToMinutes } from '../lib/timetableCalculations';
import { useSharedTimetable } from '../hooks/useSharedTimetable';
import {
  mergeSharedAndPersonalSlots,
  buildSharedGroupId,
  buildSharedGroupLabel,
  computeTimetableContentHash,
  resolveStudentAcademicGroup,
  TimetableGroupParams,
  SharedSlot,
  ACTIVE_COHORT_BATCH_MAP,
} from '../lib/sharedTimetable';
import { isSlotApplicableToStudent, normalizeSemester, normalizeSection } from '../lib/collegeEmail';
import { PdfTimetableUploadCard } from '../components/timetable/PdfTimetableUploadCard';
import { TimetableHeader, GroupFilter, TimetableView } from '../components/timetable/TimetableHeader';
import { TimetableSlotCard } from '../components/timetable/TimetableSlotCard';
import { TimetableLegend } from '../components/timetable/TimetableLegend';
import toast from 'react-hot-toast';
import type { TimetableSlot, Subject, TimetableRevision, TimetableGroupScope, TimetableChangeRequest } from '../types';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

interface SlotFormData {
  subjectId: string;
  faculty: string;
  room: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  color: string;
  group: TimetableGroupScope;
}

const defaultForm: SlotFormData = {
  subjectId: '',
  faculty: '',
  room: '',
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '10:00',
  color: '#3b82f6',
  group: 'ALL',
};

export function TimetablePage() {
  const { currentUser, userProfile } = useAuth();
  const uid = currentUser?.uid ?? '';
  const { data: slots, loading: slotsLoading } = useCollection<TimetableSlot>(`users/${uid}/timetable`);
  const { data: subjects, loading: subjectsLoading } = useCollection<Subject>(`users/${uid}/subjects`);

  // Shared Timetable Group subscription via unified resolver
  const groupResolution = useMemo(() => {
    return resolveStudentAcademicGroup(userProfile);
  }, [userProfile]);

  const groupParams: TimetableGroupParams | null = groupResolution.params;

  const {
    sharedDoc,
    status: sharedStatus,
    isOfflineCached,
    error: sharedError,
  } = useSharedTimetable(groupParams);

  // Merge shared published timetable with personal student additions (preserving manual classes)
  const effectiveSlots = useMemo(() => {
    return mergeSharedAndPersonalSlots(
      sharedDoc?.slots || [],
      slots,
      groupParams ? buildSharedGroupId(groupParams) : undefined
    );
  }, [sharedDoc?.slots, slots, groupParams]);

  type GroupFilter = 'my' | 'all' | 'G1' | 'G2';
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('my');
  const [view, setView] = useState<'weekly' | 'daily'>('daily');
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date().getDay();
    return today >= 1 && today <= 5 ? today : 1;
  });
  const [showForm, setShowForm] = useState(false);
  const [editSlot, setEditSlot] = useState<TimetableSlot | null>(null);
  const [slotToDelete, setSlotToDelete] = useState<TimetableSlot | null>(null);
  const [form, setForm] = useState<SlotFormData>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPdfRequestModal, setShowPdfRequestModal] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [myChangeRequests, setMyChangeRequests] = useState<TimetableChangeRequest[]>([]);
  const [pendingRevisions, setPendingRevisions] = useState<TimetableRevision[]>([]);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  const todayDay = currentTime.getDay();
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  // 1-minute ticker to keep current lecture highlighting up-to-date
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'timetableRevisions'),
      where('uid', '==', uid),
      where('status', '==', 'pending_review')
    );
    const unsub = onSnapshot(q, (snap) => {
      setPendingRevisions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimetableRevision)));
    });
    return () => unsub();
  }, [uid]);

  // Listen to student's pending timetable change requests
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'timetableChangeRequests'),
      where('submittedBy', '==', uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMyChangeRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimetableChangeRequest)));
    });
    return () => unsub();
  }, [uid]);

  async function handleSubmitUpdateRequest(
    lectures: any[],
    effectiveDate: string,
    section: string
  ) {
    if (!currentUser) return;
    if (!groupParams || !userProfile?.section) {
      toast.error('Please configure your section in Settings first');
      return;
    }

    // Lock student change request submission strictly to their own canonical section
    const targetSection = normalizeSection(userProfile.section);
    const targetGroupId = buildSharedGroupId({ ...groupParams, section: targetSection });
    const targetGroupLabel = buildSharedGroupLabel({ ...groupParams, section: targetSection });

    const sharedSlots: SharedSlot[] = lectures.map((l, idx) => ({
      id: `req_${targetSection.toLowerCase()}_${idx + 1}`,
      subjectCode: l.subjectCode,
      subjectName: l.subjectCode?.trim() || l.subjectName,
      faculty: l.faculty,
      room: l.room,
      dayOfWeek: l.dayOfWeek,
      startTime: l.startTime,
      endTime: l.endTime,
      color: '#3b82f6',
      group: l.group || 'ALL',
      periods: l.periods,
      weight: l.weight || (l.periodsSpanned && l.periodsSpanned > 1 ? l.periodsSpanned : 1),
      durationMinutes: l.durationMinutes,
      requiresReview: l.requiresReview || false,
    }));

    const contentHash = computeTimetableContentHash(sharedSlots, effectiveDate);

    setSubmittingRequest(true);
    try {
      await addDoc(collection(db, 'timetableChangeRequests'), {
        submittedBy: currentUser.uid,
        submittedByEmail: currentUser.email || '',
        submittedByName: userProfile?.displayName || currentUser.displayName || 'Student',
        institution: groupParams.institution || 'Chitkara University',
        program: groupParams.program || 'BE-CSE',
        batch: groupParams.batch || ACTIVE_COHORT_BATCH_MAP[normalizeSemester(groupParams.semester)] || '2024',
        semester: normalizeSemester(groupParams.semester),
        section: targetSection,
        groupId: targetGroupId,
        groupLabel: targetGroupLabel,
        effectiveDate,
        sourceFilename: 'Uploaded Student PDF',
        contentHash,
        slots: sharedSlots,
        slotCount: sharedSlots.length,
        hasGroupScopes: sharedSlots.some((s) => s.group === 'G1' || s.group === 'G2'),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success(
        `Timetable update request submitted for Section ${targetSection}! An administrator will review and publish it.`
      );
      setShowPdfRequestModal(false);
    } catch (err: unknown) {
      console.error('Failed to submit timetable request:', err);
      toast.error(`Submission failed: ${(err as Error).message || 'Server error'}`);
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function handleCancelRequest(requestId: string) {
    if (!confirm('Cancel this pending timetable update request?')) return;
    try {
      await deleteDoc(doc(db, 'timetableChangeRequests', requestId));
      toast.success('Timetable update request cancelled');
    } catch {
      toast.error('Failed to cancel request');
    }
  }

  // Synchronize local storage cache whenever slots change
  useEffect(() => {
    if (!uid || slotsLoading) return;
    try {
      localStorage.setItem(`uniflow_cached_timetable_${uid}`, JSON.stringify(slots.filter((s) => s.isActive)));
      localStorage.setItem(`uniflow_cached_timetable_ts_${uid}`, Date.now().toString());
    } catch {
      // safe fallback
    }
  }, [slots, uid, slotsLoading]);

  function openAdd(dayOverride?: number) {
    const initialDay = typeof dayOverride === 'number' ? dayOverride : selectedDay;
    setForm({
      ...defaultForm,
      dayOfWeek: initialDay,
      subjectId: subjects.length > 0 ? subjects[0].id : '',
      faculty: subjects.length > 0 && subjects[0].faculty ? subjects[0].faculty : '',
      color: subjects.length > 0 ? subjects[0].color : '#3b82f6',
      group: (userProfile?.studentGroup && userProfile.studentGroup !== 'ALL') ? userProfile.studentGroup : 'ALL',
    });
    setEditSlot(null);
    setShowForm(true);
  }

  function openEdit(slot: TimetableSlot) {
    setForm({
      subjectId: slot.subjectId,
      faculty: slot.faculty ?? '',
      room: slot.room ?? '',
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      color: slot.color,
      group: slot.group || 'ALL',
    });
    setEditSlot(slot);
    setShowForm(true);
  }

  // Quick preset helper to adjust End Time based on duration
  function applyDurationPreset(durationMinutes: number) {
    const startMins = timeToMinutes(form.startTime);
    const endMins = startMins + durationMinutes;
    if (endMins >= 1440) {
      toast.error('Lecture extends past midnight');
      return;
    }
    const h = Math.floor(endMins / 60).toString().padStart(2, '0');
    const m = (endMins % 60).toString().padStart(2, '0');
    setForm((f) => ({ ...f, endTime: `${h}:${m}` }));
  }

  async function handleSave() {
    if (!form.subjectId) {
      toast.error('Please select a subject');
      return;
    }
    if (!form.startTime || !form.endTime) {
      toast.error('Please enter both start and end times');
      return;
    }
    if (form.startTime >= form.endTime) {
      toast.error('End time must be later than start time');
      return;
    }
    const sub = subjects.find((s) => s.id === form.subjectId);
    if (!sub) return;

    setSaving(true);
    try {
      const data = {
        uid,
        subjectId: form.subjectId,
        subjectName: sub.name,
        subjectCode: sub.code,
        faculty: form.faculty.trim() || undefined,
        room: form.room.trim() || undefined,
        dayOfWeek: form.dayOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
        color: form.color,
        group: form.group || 'ALL',
        isActive: true,
        isManual: true,
        updatedAt: serverTimestamp(),
      };

      if (editSlot) {
        await updateDoc(doc(db, `users/${uid}/timetable/${editSlot.id}`), data);
        toast.success(`Updated ${sub.name} on ${DAYS[form.dayOfWeek]}`);
      } else {
        await addDoc(collection(db, `users/${uid}/timetable`), {
          ...data,
          createdAt: serverTimestamp(),
        });
        toast.success(`Added ${sub.name} to ${DAYS[form.dayOfWeek]}`);
      }
      setShowForm(false);
    } catch {
      toast.error('Failed to save timetable slot');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteSlot() {
    if (!slotToDelete) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, `users/${uid}/timetable/${slotToDelete.id}`));
      toast.success(`Removed ${slotToDelete.subjectName} from timetable`);
      setSlotToDelete(null);
    } catch {
      toast.error('Failed to delete slot');
    } finally {
      setDeleting(false);
    }
  }

  // Handle Excel / CSV Import
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: Record<string, string | number>[] = XLSX.utils.sheet_to_json(firstSheet);

      if (rows.length === 0) {
        toast.error('The uploaded file contains no rows');
        setImporting(false);
        return;
      }

      let importedCount = 0;
      for (const row of rows) {
        const subjectName = (row['Subject'] || row['subject'] || row['Course'] || row['Name'] || '') as string;
        const dayStr = (row['Day'] || row['day'] || 'Monday') as string;
        const startTime = (row['StartTime'] || row['Start'] || row['start'] || '09:00') as string;
        const endTime = (row['EndTime'] || row['End'] || row['end'] || '10:00') as string;
        const room = (row['Room'] || row['room'] || '') as string;
        const faculty = (row['Faculty'] || row['faculty'] || '') as string;

        if (!subjectName) continue;

        const dayIdx = DAYS.findIndex((d) => d.toLowerCase().startsWith(dayStr.toLowerCase().slice(0, 3)));
        const finalDay = dayIdx >= 0 ? dayIdx : 1;

        let sub = subjects.find((s) => s.name.toLowerCase() === subjectName.toLowerCase());
        let subId = sub?.id;
        if (!subId) {
          const newSubRef = await addDoc(collection(db, `users/${uid}/subjects`), {
            uid,
            name: subjectName,
            code: subjectName.slice(0, 4).toUpperCase(),
            credits: 3,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          subId = newSubRef.id;
        }

        await addDoc(collection(db, `users/${uid}/timetable`), {
          uid,
          subjectId: subId,
          subjectName,
          subjectCode: sub?.code || subjectName.slice(0, 4).toUpperCase(),
          faculty: faculty || undefined,
          room: room || undefined,
          dayOfWeek: finalDay,
          startTime: String(startTime).padStart(5, '0'),
          endTime: String(endTime).padStart(5, '0'),
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          isActive: true,
          isManual: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        importedCount++;
      }

      toast.success(`Successfully imported ${importedCount} slots!`);
      setShowImportModal(false);
    } catch {
      toast.error('Failed to parse timetable file. Check column names.');
    } finally {
      setImporting(false);
    }
  }

  const rawActiveSlots = useMemo(() => effectiveSlots.filter((s) => s.isActive), [effectiveSlots]);

  const activeSlots = useMemo(() => {
    if (groupFilter === 'all') return rawActiveSlots;
    if (groupFilter === 'G1') return rawActiveSlots.filter((s) => isSlotApplicableToStudent(s.group, 'G1'));
    if (groupFilter === 'G2') return rawActiveSlots.filter((s) => isSlotApplicableToStudent(s.group, 'G2'));
    return rawActiveSlots.filter((s) => isSlotApplicableToStudent(s.group, userProfile?.studentGroup));
  }, [rawActiveSlots, groupFilter, userProfile?.studentGroup]);


  const totalClasses = activeSlots.length;
  const labCount = useMemo(() => {
    return activeSlots.filter(
      (s) =>
        (s.weight && s.weight > 1) ||
        (typeof s.periods === 'number' && s.periods > 1) ||
        (s.durationMinutes && s.durationMinutes >= 90) ||
        /lab|practical/i.test(s.subjectName) ||
        /lab/i.test(s.subjectCode)
    ).length;
  }, [activeSlots]);
  const lectureCount = Math.max(0, totalClasses - labCount);
  const todayCount = useMemo(() => {
    return activeSlots.filter((s) => s.dayOfWeek === todayDay).length;
  }, [activeSlots, todayDay]);

  const [mobileWeeklyDay, setMobileWeeklyDay] = useState(() => (todayDay >= 1 && todayDay <= 5 ? todayDay : 1));

  const weekDates = useMemo(() => {
    const now = currentTime;
    const currentDay = now.getDay();
    const diffToMon = currentDay === 0 ? -6 : 1 - currentDay;
    const mon = new Date(now);
    mon.setDate(now.getDate() + diffToMon);

    return [1, 2, 3, 4, 5].map((d) => {
      const targetDate = new Date(mon);
      targetDate.setDate(mon.getDate() + (d - 1));
      return {
        dayIndex: d,
        shortName: SHORT_DAYS[d],
        dayNumber: targetDate.getDate(),
        fullDate: targetDate,
      };
    });
  }, [currentTime]);

  const currentDayDate = useMemo(() => {
    const item = weekDates.find((w) => w.dayIndex === selectedDay);
    return item ? item.fullDate : currentTime;
  }, [weekDates, selectedDay, currentTime]);

  const dayAgendaSlots = useMemo(() => {
    return activeSlots
      .filter((s) => s.dayOfWeek === selectedDay)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }, [activeSlots, selectedDay]);

  const completedSlotsCount = useMemo(() => {
    if (selectedDay !== todayDay) {
      return selectedDay < todayDay ? dayAgendaSlots.length : 0;
    }
    return dayAgendaSlots.filter((s) => timeToMinutes(s.endTime) <= currentMinutes).length;
  }, [selectedDay, todayDay, dayAgendaSlots, currentMinutes]);

  const remainingSlotsCount = Math.max(0, dayAgendaSlots.length - completedSlotsCount);

  const nextSlotId = useMemo(() => {
    if (selectedDay !== todayDay) return null;
    const upcoming = dayAgendaSlots.find((s) => timeToMinutes(s.startTime) > currentMinutes);
    return upcoming?.id || null;
  }, [selectedDay, todayDay, dayAgendaSlots, currentMinutes]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <TimetableHeader
        view={view as TimetableView}
        onViewChange={(v) => setView(v)}
        groupFilter={groupFilter as GroupFilter}
        onGroupFilterChange={(g) => setGroupFilter(g)}
        studentGroup={userProfile?.studentGroup}
        semester={userProfile?.semester}
        section={userProfile?.section}
        program={userProfile?.program || 'BE-CSE'}
        batch={groupParams?.batch}
        totalClasses={totalClasses}
        lectureCount={lectureCount}
        labCount={labCount}
        todayCount={todayCount}
        currentTime={currentTime}
        onAddSlot={() => openAdd()}
        onUploadPdf={() => setShowPdfRequestModal(true)} /* Upload PDF / Request Update */
      />

      {/* Unassigned Group Notice Banner */}
      {(!userProfile?.studentGroup || userProfile.studentGroup === 'ALL') &&
        rawActiveSlots.some((s) => s.group === 'G1' || s.group === 'G2') && (
          <div className="bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 mt-0.5">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  Section Contains Group 1 & Group 2 Classes
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                  Your timetable includes group-specific lab and practical sessions. Currently displaying all classes. Select your group in Settings to customize your schedule and attendance.
                </p>
              </div>
            </div>
            <Link to="/settings" className="w-full sm:w-auto">
              <Button size="sm" variant="outline" className="w-full sm:w-auto whitespace-nowrap border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100">
                Select Group in Settings
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </div>
        )}

      {/* Student Timetable Change Request Status Banners */}
      {myChangeRequests
        .filter((r) => r.status === 'pending')
        .map((req) => (
          <div
            key={req.id}
            className="bg-blue-50/90 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/70 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 mt-0.5">
                <UploadCloud className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                    Timetable Update Request Pending Admin Review
                  </h4>
                  <Badge variant="warning" className="text-[10px]">
                    Pending Approval
                  </Badge>
                  <span className="text-[11px] font-mono text-gray-500">
                    Section {req.section}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                  Submitted {req.slotCount} slots for Section {req.section} (Effective {req.effectiveDate}). An authorized administrator must review and approve this change before it is published to the shared database.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                size="sm"
                variant="outline"
                className="w-full sm:w-auto text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30 text-xs"
                onClick={() => handleCancelRequest(req.id)}
              >
                Cancel Request
              </Button>
            </div>
          </div>
        ))}

      {myChangeRequests
        .filter((r) => r.status === 'rejected')
        .slice(0, 1)
        .map((req) => (
          <div
            key={req.id}
            className="bg-red-50/80 dark:bg-red-950/20 border border-red-200 dark:border-red-800/60 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 mt-0.5">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-red-900 dark:text-red-200">
                  Timetable Update Request Declined
                </p>
                <p className="text-red-800 dark:text-red-300 mt-0.5">
                  Your request for Section {req.section} was not approved{req.reviewNotes ? `: "${req.reviewNotes}"` : '.'}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-red-600 hover:bg-red-100/50"
              onClick={() => handleCancelRequest(req.id)}
            >
              Dismiss
            </Button>
          </div>
        ))}


      {/* Empty State when no slots configured */}
      {!slotsLoading && activeSlots.length === 0 && (
        <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
            {sharedStatus === 'not_published' ? 'No Classes Published For This Section' : 'Your Timetable is Empty'}
          </h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mb-5 leading-relaxed">
            {sharedStatus === 'not_published'
              ? `The department has not yet published an official schedule for ${userProfile?.section ? `Section ${userProfile.section}` : 'your section'}. You can add personal slots manually.`
              : 'Add your recurring class schedule to enable the Live Class Dashboard, automatic room guidance, and free time finder.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button size="sm" onClick={() => openAdd()}>
              <Plus className="w-4 h-4 mr-1.5" /> Add First Lecture
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)}>
              <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" /> Import File
            </Button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 1. WEEKLY VIEW                                                 */}
      {/* ============================================================== */}
      {view === 'weekly' && activeSlots.length > 0 && (
        <div className="space-y-4">
          {/* Mobile Day Selector Bar (Visible only on mobile screens < md) */}
          <div className="block md:hidden">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {[1, 2, 3, 4, 5].map((day) => {
                const count = activeSlots.filter((s) => s.dayOfWeek === day).length;
                const isToday = todayDay === day;
                const isSelected = mobileWeeklyDay === day;

                return (
                  <button
                    key={day}
                    onClick={() => setMobileWeeklyDay(day)}
                    className={`flex-1 min-w-[62px] py-2 px-1 rounded-2xl text-center text-xs font-bold transition-all flex flex-col items-center gap-0.5 border ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-300'
                    }`}
                  >
                    <span className="text-[11px] font-semibold">{SHORT_DAYS[day]}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                      }`}
                    >
                      {count}
                    </span>
                    {isToday && (
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-blue-500'}`} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Mobile Active Day Agenda */}
            {(() => {
              const day = mobileWeeklyDay;
              const daySlots = activeSlots
                .filter((s) => s.dayOfWeek === day)
                .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
              const isToday = todayDay === day;

              return (
                <div className="space-y-2.5 mt-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      {DAYS[day]}
                      {isToday && (
                        <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                          Today
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => openAdd(day)}
                      className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Class
                    </button>
                  </div>

                  {daySlots.length === 0 ? (
                    <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 text-gray-400 text-xs flex flex-col items-center justify-center p-6 shadow-sm">
                      <span className="text-2xl mb-1">☕</span>
                      <span className="font-medium text-gray-600 dark:text-gray-300">No classes on {DAYS[day]}</span>
                      <button
                        onClick={() => openAdd(day)}
                        className="mt-2 text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                      >
                        + Add class
                      </button>
                    </div>
                  ) : (
                    daySlots.map((slot) => (
                      <TimetableSlotCard
                        key={slot.id}
                        slot={slot}
                        isToday={isToday}
                        currentMinutes={currentMinutes}
                        viewMode="agenda"
                        onEdit={openEdit}
                        onDelete={(s) => setSlotToDelete(s)}
                      />
                    ))
                  )}
                </div>
              );
            })()}
          </div>

          {/* Desktop 5-Day Grid (Visible on md and larger screens) */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((day) => {
              const daySlots = activeSlots
                .filter((s) => s.dayOfWeek === day)
                .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
              const isToday = todayDay === day;

              return (
                <Card
                  key={day}
                  className={`flex flex-col transition-all rounded-3xl overflow-hidden ${
                    isToday
                      ? 'ring-2 ring-blue-500 shadow-md bg-gradient-to-b from-blue-50/20 to-transparent dark:from-blue-950/20'
                      : 'hover:shadow-sm'
                  }`}
                >
                  <CardHeader className="p-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                        {DAYS[day]}
                      </CardTitle>
                      {isToday && (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-blue-600 text-white px-2 py-0.5 rounded-full shadow-sm">
                          Today
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[11px] text-gray-400 font-medium">{daySlots.length} Classes</p>
                      <button
                        onClick={() => openAdd(day)}
                        className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-0.5"
                        title={`Add lecture on ${DAYS[day]}`}
                      >
                        <Plus className="w-3 h-3" /> Add
                      </button>
                    </div>
                  </CardHeader>

                  <CardContent className="p-3 flex-1 space-y-2.5">
                    {daySlots.length === 0 ? (
                      <div className="text-center py-12 text-gray-400 text-xs flex flex-col items-center justify-center">
                        <span className="text-lg mb-1">☕</span>
                        <span className="font-medium text-gray-500">No classes</span>
                        <button
                          onClick={() => openAdd(day)}
                          className="mt-2 text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                        >
                          + Add class
                        </button>
                      </div>
                    ) : (
                      daySlots.map((slot) => (
                        <TimetableSlotCard
                          key={slot.id}
                          slot={slot}
                          isToday={isToday}
                          currentMinutes={currentMinutes}
                          viewMode="grid"
                          onEdit={openEdit}
                          onDelete={(s) => setSlotToDelete(s)}
                        />
                      ))
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. DAILY VIEW (Agenda) matching Reference Image Column 2       */}
      {/* ============================================================== */}
      {view === 'daily' && (
        <div className="space-y-4">
          {/* Horizontal Day Selector (Mon-Fri) matching Reference */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
            {weekDates.map((w) => {
              const count = activeSlots.filter((s) => s.dayOfWeek === w.dayIndex).length;
              const isSelected = selectedDay === w.dayIndex;
              const isToday = todayDay === w.dayIndex;

              return (
                <button
                  key={w.dayIndex}
                  type="button"
                  onClick={() => setSelectedDay(w.dayIndex)}
                  className={`flex-1 min-w-[62px] sm:min-w-[72px] py-2.5 px-2 rounded-2xl text-center transition-all flex flex-col items-center justify-center border shadow-sm ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/25 ring-2 ring-blue-500/20'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200/90 dark:border-slate-800 hover:border-blue-300'
                  }`}
                >
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider ${
                      isSelected ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {w.shortName}
                  </span>
                  <span
                    className={`text-base sm:text-lg font-black my-0.5 ${
                      isSelected ? 'text-white' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {w.dayNumber}
                  </span>
                  <div className="h-1.5 flex items-center justify-center">
                    {isSelected ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
                    ) : count > 0 ? (
                      <span className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-amber-400' : 'bg-blue-500/70'}`} />
                    ) : (
                      <span className="w-1.5 h-1.5 opacity-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Day Summary Banner matching Reference */}
          <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-white/90 dark:from-blue-950/40 dark:via-indigo-950/20 dark:to-slate-900 border border-blue-100/90 dark:border-blue-900/40 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3 sm:gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                  {selectedDay === todayDay ? 'Today, ' : ''}{format(currentDayDate, 'd MMM yyyy')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {dayAgendaSlots.length} classes • {completedSlotsCount} completed • {remainingSlotsCount} remaining
                </p>
              </div>
            </div>

            {selectedDay !== todayDay && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDay(todayDay)}
                className="text-xs h-8 px-2.5 bg-white/90 dark:bg-slate-900/90 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-semibold"
              >
                Jump to Today
              </Button>
            )}
          </div>

          {/* Timeline Session Cards */}
          <div className="space-y-1 pt-1">
            {dayAgendaSlots.map((slot, index) => {
              const isNext = slot.id === nextSlotId;
              const nextSlotInList = dayAgendaSlots[index + 1];
              const slotEndMinutes = timeToMinutes(slot.endTime);
              const nextSlotStartMinutes = nextSlotInList ? timeToMinutes(nextSlotInList.startTime) : 0;
              // A genuine free gap occurs only when there is a following slot, the gap is >= 30 mins,
              // and no other scheduled slot on this day overlaps the interval.
              const hasFreePeriodAfter =
                Boolean(nextSlotInList) &&
                nextSlotStartMinutes - slotEndMinutes >= 30 &&
                !dayAgendaSlots.some((other) => {
                  const oStart = timeToMinutes(other.startTime);
                  const oEnd = timeToMinutes(other.endTime);
                  return Math.max(slotEndMinutes, oStart) < Math.min(nextSlotStartMinutes, oEnd);
                });

              return (
                <React.Fragment key={slot.id}>
                  <TimetableSlotCard
                    slot={slot}
                    isToday={selectedDay === todayDay}
                    currentMinutes={currentMinutes}
                    viewMode="agenda"
                    isNextClass={isNext}
                    onEdit={openEdit}
                    onDelete={(s) => setSlotToDelete(s)}
                  />

                  {/* Free Period card during class intervals */}
                  {hasFreePeriodAfter && nextSlotInList && (
                    <div className="ml-16 sm:ml-20 -mt-1 mb-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex items-center justify-center text-sm shrink-0">
                          ☕
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Free Period</p>
                          <p className="text-[11px] text-slate-500">
                            {slot.endTime} - {nextSlotInList.startTime} • Free time • Study • Library
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-900/40 px-2 py-0.5 rounded-full shrink-0">
                        Break
                      </span>
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {dayAgendaSlots.length === 0 && (
              <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-8 shadow-sm">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h4 className="font-bold text-slate-800 dark:text-slate-200">No classes on {DAYS[selectedDay]}</h4>
                <p className="text-xs text-slate-400 mt-1">Enjoy your free day or schedule dedicated study blocks.</p>
                <Button size="sm" onClick={() => openAdd(selectedDay)} className="mt-4">
                  <Plus className="w-4 h-4 mr-1.5" /> Add Class for {DAYS[selectedDay]}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. ADD / EDIT LECTURE SLOT MODAL                               */}
      {/* ============================================================== */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-100 dark:border-gray-800">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              {editSlot ? 'Edit Class Slot' : 'Add Class Slot'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Subject</label>
                <select
                  value={form.subjectId}
                  onChange={(e) => {
                    const subId = e.target.value;
                    const sub = subjects.find((s) => s.id === subId);
                    setForm((f) => ({
                      ...f,
                      subjectId: subId,
                      faculty: sub?.faculty || f.faculty,
                      color: sub?.color || f.color,
                    }));
                  }}
                  className="w-full mt-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white font-medium"
                >
                  <option value="">Select a subject...</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
                {subjects.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ Add subjects first in the Subjects tab.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Day of Week</label>
                  <select
                    value={form.dayOfWeek}
                    onChange={(e) => setForm((f) => ({ ...f, dayOfWeek: +e.target.value }))}
                    className="w-full mt-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white font-medium"
                  >
                    {DAYS.map((d, i) => (
                      <option key={i} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Group Scope</label>
                  <select
                    value={form.group}
                    onChange={(e) => setForm((f) => ({ ...f, group: e.target.value as TimetableGroupScope }))}
                    className="w-full mt-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white font-medium"
                  >
                    <option value="ALL">All (Whole Section)</option>
                    <option value="G1">Group 1 (G1)</option>
                    <option value="G2">Group 2 (G2)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Color Tag</label>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, color: c }))}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        form.color === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Time Inputs & Quick Duration Presets */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Start Time</label>
                    <Input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                      className="mt-1 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">End Time</label>
                    <Input
                      type="time"
                      value={form.endTime}
                      onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                      className="mt-1 font-semibold"
                    />
                  </div>
                </div>

                {/* Duration Presets for Mobile Convenience */}
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-gray-400 font-bold uppercase">Duration:</span>
                  {[50, 60, 90, 120].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => applyDurationPreset(mins)}
                      className="text-[11px] px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-600"
                    >
                      +{mins}m
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Room / Hall</label>
                  <Input
                    placeholder="LH-201"
                    value={form.room}
                    onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Faculty</label>
                  <Input
                    placeholder="Dr. Smith"
                    value={form.faculty}
                    onChange={(e) => setForm((f) => ({ ...f, faculty: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button className="flex-1 font-bold" loading={saving} onClick={handleSave}>
                {editSlot ? 'Update Slot' : 'Save Slot'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. CONFIRM DELETE MODAL                                        */}
      {/* ============================================================== */}
      {slotToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-gray-100 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" /> Delete Lecture Slot?
            </h3>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Are you sure you want to remove <strong className="text-gray-900 dark:text-white">{slotToDelete.subjectName}</strong> on {DAYS[slotToDelete.dayOfWeek]} ({slotToDelete.startTime}–{slotToDelete.endTime}) from your weekly timetable?
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSlotToDelete(null)}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1 font-bold" loading={deleting} onClick={confirmDeleteSlot}>
                Delete Slot
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. EXCEL / CSV IMPORT MODAL                                    */}
      {/* ============================================================== */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-100 dark:border-gray-800">
            <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Import Timetable
            </h3>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Upload your timetable Excel (.xlsx) or CSV file. Recognized columns: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">Subject</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">Day</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">StartTime</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">EndTime</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">Room</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">Faculty</code>.
            </p>

            <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-6 text-center hover:border-blue-500 transition-colors">
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <label className="cursor-pointer font-semibold text-sm text-blue-600 dark:text-blue-400 hover:underline">
                Choose .xlsx or .csv file
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={importing}
                />
              </label>
              <p className="text-[11px] text-gray-400 mt-1">Excel sheets will automatically populate your timetable</p>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowImportModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 6. STUDENT PDF UPLOAD / REQUEST MODAL                          */}
      {/* ============================================================== */}
      {showPdfRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-2xl shadow-2xl border border-gray-100 dark:border-gray-800 max-h-[90vh] overflow-y-auto my-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <UploadCloud className="w-5 h-5 text-blue-600" />
                  Upload Timetable PDF
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Upload your section's official Chitkara University timetable PDF. Review parsed lectures, groups, and diff before submitting for administrator approval.
                </p>
              </div>
              <button
                onClick={() => setShowPdfRequestModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <PdfTimetableUploadCard
              currentSlots={effectiveSlots}
              userSection={userProfile?.section}
              userSemester={userProfile?.semester}
              userProgram={userProfile?.program}
              disableManualUpload={false}
              actionButtonLabel={submittingRequest ? "Submitting Request..." : "Submit Change Request for Approval"}
              title="Official Chitkara PDF Parser"
              subtitle="Extracts all lecture slots, groups (G1/G2/ALL), room codes, and effective dates for admin verification."
              onApprove={handleSubmitUpdateRequest}
            />

            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <Button variant="outline" onClick={() => setShowPdfRequestModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
