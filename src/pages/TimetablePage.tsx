import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Edit2,
  Trash2,
  Calendar,
  List,
  Upload,
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
} from 'lucide-react';
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
  TimetableGroupParams,
} from '../lib/sharedTimetable';
import toast from 'react-hot-toast';
import type { TimetableSlot, Subject, TimetableRevision } from '../types';

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
}

const defaultForm: SlotFormData = {
  subjectId: '',
  faculty: '',
  room: '',
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '10:00',
  color: '#3b82f6',
};

export function TimetablePage() {
  const { currentUser, userProfile } = useAuth();
  const uid = currentUser?.uid ?? '';
  const { data: slots, loading: slotsLoading } = useCollection<TimetableSlot>(`users/${uid}/timetable`);
  const { data: subjects, loading: subjectsLoading } = useCollection<Subject>(`users/${uid}/subjects`);

  // Shared Timetable Group subscription
  const groupParams: TimetableGroupParams | null = useMemo(() => {
    if (!userProfile?.section) return null;
    return {
      institution: userProfile.college || 'Chitkara University',
      program: userProfile.program || 'BE-CSE',
      batch: userProfile.batch || '2024',
      semester: userProfile.semester || 5,
      section: userProfile.section,
    };
  }, [userProfile?.college, userProfile?.program, userProfile?.batch, userProfile?.semester, userProfile?.section]);

  const { sharedDoc } = useSharedTimetable(groupParams);

  // Merge shared published timetable with personal student additions (preserving manual classes)
  const effectiveSlots = useMemo(() => {
    return mergeSharedAndPersonalSlots(
      sharedDoc?.slots || [],
      slots,
      groupParams ? buildSharedGroupId(groupParams) : undefined
    );
  }, [sharedDoc?.slots, slots, groupParams]);

  const [view, setView] = useState<'weekly' | 'daily'>('weekly');
  const [selectedDay, setSelectedDay] = useState(() => new Date().getDay());
  const [showForm, setShowForm] = useState(false);
  const [editSlot, setEditSlot] = useState<TimetableSlot | null>(null);
  const [slotToDelete, setSlotToDelete] = useState<TimetableSlot | null>(null);
  const [form, setForm] = useState<SlotFormData>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
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

  const activeSlots = effectiveSlots.filter((s) => s.isActive);

  // Free intervals calculation for daily view
  function getDailyFreeSlots(day: number) {
    const daySlots = activeSlots
      .filter((s) => s.dayOfWeek === day)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    const free: { start: string; end: string }[] = [];
    if (daySlots.length === 0) return free;
    if (daySlots[0].startTime > '09:00') {
      free.push({ start: '09:00', end: daySlots[0].startTime });
    }
    for (let i = 0; i < daySlots.length - 1; i++) {
      if (daySlots[i].endTime < daySlots[i + 1].startTime) {
        free.push({ start: daySlots[i].endTime, end: daySlots[i + 1].startTime });
      }
    }
    if (daySlots[daySlots.length - 1].endTime < '17:00') {
      free.push({ start: daySlots[daySlots.length - 1].endTime, end: '17:00' });
    }
    return free;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white">College Timetable</h2>
          <p className="text-sm text-gray-500">
            View, plan, and customize your recurring lecture schedule
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1 shadow-sm">
            <button
              onClick={() => setView('weekly')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                view === 'weekly'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Weekly
            </button>
            <button
              onClick={() => setView('daily')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                view === 'daily'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" /> Daily
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)}>
            <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" />
            Import Excel
          </Button>

          <Button size="sm" onClick={() => openAdd()}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Lecture
          </Button>
        </div>
      </div>

      {/* Pending Weekly Revisions Notification */}
      {pendingRevisions.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-300 dark:border-amber-700/60 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Weekly Timetable Revision Pending Review
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 font-bold">
                  {pendingRevisions.length} new
                </span>
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                Found schedule revisions in your college email attachments ({pendingRevisions[0].weekLabel || 'Weekly Update'}). Review added, cancelled, or shifted classes before updating.
              </p>
            </div>
          </div>
          <Link to="/email-sync" className="w-full sm:w-auto">
            <Button size="sm" className="w-full sm:w-auto whitespace-nowrap bg-amber-600 hover:bg-amber-700 text-white font-semibold">
              Review Changes
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        </div>
      )}

      {/* Shared Section Schedule Info Banner */}
      {sharedDoc ? (
        <div className="bg-gradient-to-r from-blue-600/10 via-blue-500/5 to-transparent border border-blue-200 dark:border-blue-800/60 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 mt-0.5">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                  Shared Section Schedule
                </h4>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold font-mono">
                  v{sharedDoc.version}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-semibold">
                  Section {sharedDoc.section}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                {sharedDoc.groupLabel} · Effective: {sharedDoc.effectiveDate || 'Current Semester'} ({sharedDoc.slots.length} departmental lectures)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Synced in real-time</span>
          </div>
        </div>
      ) : userProfile?.section ? (
        <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800 rounded-2xl p-3 px-4 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-500" />
            <span>
              Academic Section: <strong>{userProfile.section}</strong> (Semester {userProfile.semester || 1})
            </span>
          </div>
          <span className="text-[11px] text-gray-400">Personal & Shared views merged</span>
        </div>
      ) : null}

      {/* Empty State when no slots configured */}
      {!slotsLoading && activeSlots.length === 0 && (
        <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Your Timetable is Empty</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mb-5 leading-relaxed">
            Add your recurring class schedule to enable the Live Class Dashboard, automatic room guidance, and free time finder.
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((day) => {
            const daySlots = activeSlots
              .filter((s) => s.dayOfWeek === day)
              .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
            const isToday = todayDay === day;

            return (
              <Card
                key={day}
                className={`flex flex-col transition-all ${
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
                    <p className="text-[11px] text-gray-400">{daySlots.length} Lectures</p>
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
                    <div className="text-center py-10 text-gray-400 text-xs flex flex-col items-center justify-center">
                      <span className="text-lg mb-1">☕</span>
                      <span>No lectures</span>
                      <button
                        onClick={() => openAdd(day)}
                        className="mt-2 text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                      >
                        + Add lecture
                      </button>
                    </div>
                  ) : (
                    daySlots.map((slot) => {
                      const startMins = timeToMinutes(slot.startTime);
                      const endMins = timeToMinutes(slot.endTime);
                      const isNow = isToday && currentMinutes >= startMins && currentMinutes < endMins;
                      const isPast = isToday && currentMinutes >= endMins;
                      const isShared = !slot.isManual || slot.id.startsWith('shared_');

                      return (
                        <div
                          key={slot.id}
                          className={`group relative rounded-2xl p-3 text-white transition-all shadow-sm ${
                            isNow
                              ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-blue-600 scale-[1.02]'
                              : isPast
                              ? 'opacity-70 saturate-75'
                              : 'hover:shadow-md'
                          }`}
                          style={{ backgroundColor: slot.color }}
                        >
                          <div className="flex items-start justify-between gap-1 pr-6">
                            <div>
                              <p className="font-extrabold text-xs leading-snug">{slot.subjectName}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] opacity-90 font-mono font-semibold">{slot.subjectCode}</span>
                                {isShared ? (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-blue-500/30 text-blue-100 font-semibold border border-blue-300/30">
                                    Shared
                                  </span>
                                ) : (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-500/30 text-purple-100 font-semibold border border-purple-300/30">
                                    Personal
                                  </span>
                                )}
                              </div>
                            </div>
                            {isNow && (
                              <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-white text-emerald-700 font-black uppercase tracking-wider animate-pulse flex-shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Now
                              </span>
                            )}
                            {isPast && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/20 text-white font-semibold">
                                Done
                              </span>
                            )}
                          </div>

                          <div className="mt-2 pt-1.5 border-t border-white/20 flex items-center justify-between text-[10px] opacity-90 font-medium">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {slot.startTime}–{slot.endTime}
                            </span>
                            {slot.room && <span>📍 {slot.room}</span>}
                          </div>

                          {slot.faculty && (
                            <p className="text-[10px] opacity-80 mt-1 truncate">👤 {slot.faculty}</p>
                          )}

                          {/* Quick edit / delete actions */}
                          <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1 bg-black/40 backdrop-blur-md rounded-lg p-1">
                            {isShared ? (
                              <span
                                title="Department-managed shared class"
                                className="p-1 text-white/80"
                              >
                                <ShieldCheck className="w-3.5 h-3.5 text-blue-300" />
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => openEdit(slot)}
                                  className="p-1 hover:bg-white/20 rounded text-white transition-colors"
                                  title="Edit slot"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => setSlotToDelete(slot)}
                                  className="p-1 hover:bg-white/20 rounded text-red-300 transition-colors"
                                  title="Delete slot"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. DAILY VIEW                                                  */}
      {/* ============================================================== */}
      {view === 'daily' && (
        <div className="space-y-5">
          {/* Day selection tabs */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
            <div className="flex gap-2">
              {DAYS.map((day, i) => {
                const count = activeSlots.filter((s) => s.dayOfWeek === i).length;
                const isToday = todayDay === i;
                const isSelected = selectedDay === i;

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(i)}
                    className={`flex-shrink-0 px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-400'
                    }`}
                  >
                    <span>{day}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {count}
                    </span>
                    {isToday && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Today" />
                    )}
                  </button>
                );
              })}
            </div>

            {selectedDay !== todayDay && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDay(todayDay)}
                className="text-xs whitespace-nowrap hidden sm:inline-flex"
              >
                Jump to Today
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {activeSlots
              .filter((s) => s.dayOfWeek === selectedDay)
              .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
              .map((slot) => {
                const startMins = timeToMinutes(slot.startTime);
                const endMins = timeToMinutes(slot.endTime);
                const isToday = selectedDay === todayDay;
                const isNow = isToday && currentMinutes >= startMins && currentMinutes < endMins;
                const isPast = isToday && currentMinutes >= endMins;
                const isUpcoming = isToday && currentMinutes < startMins;

                return (
                  <Card
                    key={slot.id}
                    className={`hover:shadow-md transition-all ${
                      isNow
                        ? 'border-2 border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20 shadow-sm'
                        : isPast
                        ? 'opacity-70'
                        : ''
                    }`}
                  >
                    <CardContent className="p-4 sm:p-5 flex items-center gap-4">
                      <div className="w-2.5 h-16 rounded-full flex-shrink-0" style={{ backgroundColor: slot.color }} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-extrabold text-base text-gray-900 dark:text-white truncate">
                            {slot.subjectName}
                          </p>
                          <span className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md font-mono font-semibold text-gray-600 dark:text-gray-300">
                            {slot.subjectCode}
                          </span>
                          {!slot.isManual || slot.id.startsWith('shared_') ? (
                            <Badge variant="default" className="text-[10px] bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              <Users className="w-3 h-3 mr-1" /> Shared
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-[10px] bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              Personal
                            </Badge>
                          )}
                          {isNow && (
                            <Badge variant="success" className="animate-pulse">
                              ● Live Now
                            </Badge>
                          )}
                          {isPast && <Badge variant="default">Completed</Badge>}
                          {isUpcoming && <Badge variant="info">Upcoming</Badge>}
                        </div>

                        <div className="flex items-center gap-4 text-xs text-gray-500 mt-2 flex-wrap">
                          <span className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> {slot.startTime} – {slot.endTime}
                          </span>
                          {slot.room && (
                            <span className="flex items-center gap-1 text-gray-700 dark:text-gray-300 font-medium">
                              <MapPin className="w-3.5 h-3.5 text-blue-500" /> Room {slot.room}
                            </span>
                          )}
                          {slot.faculty && (
                            <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                              <User className="w-3.5 h-3.5 text-blue-500" /> {slot.faculty}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!slot.isManual || slot.id.startsWith('shared_') ? (
                          <div className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/60 px-2.5 py-1.5 rounded-xl border border-gray-100 dark:border-gray-800">
                            <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                            <span className="hidden sm:inline font-medium">Synced</span>
                          </div>
                        ) : (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(slot)} title="Edit lecture slot">
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSlotToDelete(slot)}
                              className="text-red-500 hover:text-red-600"
                              title="Delete lecture slot"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

            {activeSlots.filter((s) => s.dayOfWeek === selectedDay).length === 0 && (
              <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8">
                <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <h4 className="font-bold text-gray-800 dark:text-gray-200">No classes on {DAYS[selectedDay]}</h4>
                <p className="text-xs text-gray-400 mt-1">Enjoy your free day or schedule dedicated study blocks.</p>
                <Button size="sm" onClick={() => openAdd(selectedDay)} className="mt-4">
                  <Plus className="w-4 h-4 mr-1.5" /> Add Class for {DAYS[selectedDay]}
                </Button>
              </div>
            )}

            {/* Free intervals finder */}
            {getDailyFreeSlots(selectedDay).length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
                <h4 className="text-xs font-bold uppercase text-amber-800 dark:text-amber-400 tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Free Intervals on {DAYS[selectedDay]} (Study / Breaks)
                </h4>
                <div className="flex flex-wrap gap-2">
                  {getDailyFreeSlots(selectedDay).map((fs, idx) => (
                    <span
                      key={idx}
                      className="text-xs px-3 py-1.5 rounded-xl bg-white dark:bg-gray-800 text-amber-800 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-800 shadow-sm"
                    >
                      ☕ {fs.start} – {fs.end}
                    </span>
                  ))}
                </div>
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
    </div>
  );
}
