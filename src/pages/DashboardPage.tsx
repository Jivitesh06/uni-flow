import { useEffect, useState, useMemo } from 'react';
import {
  Calendar,
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  calculateAttendanceStats,
  calculateSubjectAttendance,
  canonicalizeSubjectsForAttendance,
  buildTimetableSubjectEquivalenceMap,
  matchesSubjectRecord,
} from '../lib/attendanceCalculations';
import { calculateLiveClassState } from '../lib/timetableCalculations';
import { LiveClassCard } from '../components/timetable/LiveClassCard';
import { AttendanceRing } from '../components/attendance/AttendanceRing';
import { useSharedTimetable } from '../hooks/useSharedTimetable';
import { useClassReminder } from '../hooks/useClassReminder';
import { ClassReminderBanner } from '../components/notifications/ClassReminderBanner';
import {
  mergeSharedAndPersonalSlots,
  buildSharedGroupId,
  resolveStudentAcademicGroup,
  TimetableGroupParams,
} from '../lib/sharedTimetable';
import { isSlotApplicableToStudent } from '../lib/collegeEmail';
import type { Subject, TimetableSlot, AttendanceRecord } from '../types';

export function DashboardPage() {
  const { currentUser, userProfile } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // Timetable offline cache key
  const uid = currentUser?.uid;
  const timetableCacheKey = uid ? `uniflow_cached_timetable_${uid}` : 'uniflow_cached_timetable';
  const timetableTsKey = uid ? `uniflow_cached_timetable_ts_${uid}` : 'uniflow_cached_timetable_ts';

  const [slots, setSlots] = useState<TimetableSlot[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const cached = localStorage.getItem(timetableCacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // cache parse ignore
    }
    return [];
  });

  const [isFirestoreLoaded, setIsFirestoreLoaded] = useState(false);
  const [isOffline, setIsOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false));
  const [lastSyncedText, setLastSyncedText] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const ts = localStorage.getItem(timetableTsKey);
    if (!ts) return '';
    const diffMin = Math.floor((Date.now() - Number(ts)) / 60000);
    return diffMin <= 1 ? 'just now' : `${diffMin}m ago`;
  });

  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [now, setNow] = useState(() => new Date());

  // 1-second ticker with visibility change listener
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const tick = () => setNow(new Date());
    const interval = setInterval(tick, 1000);

    const handleVisibility = () => {
      if (!document.hidden) tick();
    };
    window.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const currentUid = currentUser.uid;

    const unsub1 = onSnapshot(collection(db, `users/${currentUid}/subjects`), (s) =>
      setSubjects(s.docs.map((d) => ({ id: d.id, ...d.data() } as Subject)))
    );

    const unsub2 = onSnapshot(
      query(collection(db, `users/${currentUid}/timetable`), where('isActive', '==', true)),
      (s) => {
        const freshSlots = s.docs.map((d) => ({ id: d.id, ...d.data() } as TimetableSlot));
        setSlots(freshSlots);
        setIsFirestoreLoaded(true);
        try {
          localStorage.setItem(`uniflow_cached_timetable_${currentUid}`, JSON.stringify(freshSlots));
          localStorage.setItem(`uniflow_cached_timetable_ts_${currentUid}`, Date.now().toString());
          setLastSyncedText('just now');
        } catch {
          // ignore cache quota
        }
      },
      () => setIsFirestoreLoaded(true)
    );

    const unsub3 = onSnapshot(
      query(collection(db, `users/${currentUid}/attendance`), orderBy('date', 'desc')),
      (s) => setAttendance(s.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord)))
    );

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [currentUser]);

  // Academic group resolver
  const groupResolution = useMemo(() => {
    return resolveStudentAcademicGroup(userProfile);
  }, [userProfile]);

  const groupParams: TimetableGroupParams | null = groupResolution.params;
  const { sharedDoc } = useSharedTimetable(groupParams);

  const effectiveSlots = useMemo(() => {
    return mergeSharedAndPersonalSlots(
      sharedDoc?.slots || [],
      slots,
      groupParams ? buildSharedGroupId(groupParams) : undefined
    );
  }, [sharedDoc?.slots, slots, groupParams]);

  const studentGroup = userProfile?.studentGroup;

  // Filter slots applicable to this student
  const studentApplicableSlots = useMemo(() => {
    return effectiveSlots.filter((s) => isSlotApplicableToStudent(s.group, studentGroup));
  }, [effectiveSlots, studentGroup]);

  // Today's classes
  const todayDay = now.getDay();
  const todaySlots = useMemo(() => {
    return studentApplicableSlots
      .filter((s) => s.dayOfWeek === todayDay)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [studentApplicableSlots, todayDay]);

  const target = userProfile?.attendanceTarget ?? 75;

  // Timetable subject equivalence
  const resolutionContext = useMemo(() => {
    return buildTimetableSubjectEquivalenceMap(effectiveSlots, subjects);
  }, [effectiveSlots, subjects]);

  const displaySubjects = useMemo(() => {
    return canonicalizeSubjectsForAttendance(subjects, effectiveSlots, currentUser?.uid, resolutionContext);
  }, [subjects, effectiveSlots, currentUser?.uid, resolutionContext]);

  const subjectAttendanceMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateSubjectAttendance>>();
    for (const sub of displaySubjects) {
      const subRecords = attendance.filter((a) => matchesSubjectRecord(sub, a.subjectId, resolutionContext));
      map.set(
        sub.id,
        calculateSubjectAttendance(sub, subRecords, target / 100, null, studentGroup)
      );
    }
    return map;
  }, [displaySubjects, attendance, target, studentGroup, resolutionContext]);

  let overallAttended = 0;
  let overallConducted = 0;
  for (const agg of subjectAttendanceMap.values()) {
    overallAttended += agg.totalAttended;
    overallConducted += agg.totalConducted;
  }
  const overallStats = calculateAttendanceStats(overallAttended, overallConducted, target / 100);

  const onTrackCount = displaySubjects.filter((sub) => {
    const agg = subjectAttendanceMap.get(sub.id);
    return agg ? agg.stats.isOnTrack : true;
  }).length;

  const belowTargetCount = displaySubjects.filter((sub) => {
    const agg = subjectAttendanceMap.get(sub.id);
    return agg ? !agg.stats.isOnTrack : false;
  }).length;

  const liveState = useMemo(() => {
    return calculateLiveClassState(studentApplicableSlots, now);
  }, [studentApplicableSlots, now]);

  const isStale = (!isFirestoreLoaded && effectiveSlots.length > 0) || isOffline;
  const dateFormatted = format(now, 'EEEE, MMMM d, yyyy');
  const timeFormatted = format(now, 'h:mm:ss a');

  const reminder = useClassReminder(studentApplicableSlots, userProfile);

  // Remaining classes today
  const remainingCount = todaySlots.filter((slot) => {
    const [eh, em] = slot.endTime.split(':').map(Number);
    const end = new Date(now);
    end.setHours(eh, em, 0, 0);
    return now <= end;
  }).length;

  // Time of day greeting
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* 1. Header Greeting matching Reference Image */}
      <div className="pt-1">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          {greeting} 👋
        </h2>
        <p className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 mt-0.5">
          {userProfile?.displayName || 'Student'}
        </p>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {format(now, 'EEE, d MMM yyyy')}
          </span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            Semester {userProfile?.semester ?? 5} • Section {userProfile?.section ?? 'C'}
            {studentGroup && studentGroup !== 'ALL' ? ` (${studentGroup})` : ''}
          </span>
        </div>
      </div>

      {/* 2. Dismissible Class Reminder Banner */}
      <ClassReminderBanner reminder={reminder} />

      {/* 3. Primary Next Class Hero Card matching Reference Image */}
      <LiveClassCard
        liveState={liveState}
        dateFormatted={dateFormatted}
        timeFormatted={timeFormatted}
        isStale={isStale}
        lastSyncedText={lastSyncedText}
      />

      {/* 4. Today's Classes Timeline Card matching Reference Image */}
      <Card className="overflow-hidden border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-gray-900 rounded-3xl shadow-sm">
        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
              <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Today's Classes
            </CardTitle>
            <span className="text-xs font-semibold text-slate-400">
              {todaySlots.length === 0 ? 'No classes' : remainingCount > 0 ? `${remainingCount} remaining` : 'Completed'}
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-3 space-y-3">
          {todaySlots.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center">No lectures scheduled for today.</p>
          ) : (
            <div className="space-y-3">
              {todaySlots.map((slot) => {
                const [eh, em] = slot.endTime.split(':').map(Number);
                const end = new Date(now);
                end.setHours(eh, em, 0, 0);
                const isPast = now > end;

                // Check attendance record if marked
                const isMarkedPresent = attendance.some(
                  (a) =>
                    a.lectureSlotId === slot.id &&
                    a.date.toDate().toDateString() === now.toDateString() &&
                    a.status === 'present'
                );

                return (
                  <div key={slot.id} className="flex items-center gap-3 relative">
                    {/* Status node */}
                    <div className="shrink-0">
                      {isMarkedPresent || isPast ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Circle className="w-4 h-4 text-blue-500" />
                      )}
                    </div>

                    {/* Class Details */}
                    <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                          {slot.subjectCode || slot.subjectName}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium truncate">
                          {slot.startTime} – {slot.endTime}
                          {slot.room ? ` • ${slot.room}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-2">
            <Link to="/timetable" className="block">
              <Button
                variant="outline"
                size="sm"
                className="w-full h-9 rounded-2xl text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/40 hover:bg-blue-100/50"
              >
                View Full Timetable <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 5. Overall Attendance Summary Card matching Reference Image */}
      <Card className="overflow-hidden border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-gray-900 rounded-3xl shadow-sm">
        <CardHeader className="p-4 sm:p-5 pb-2">
          <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">
            Overall Attendance
          </CardTitle>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-2 space-y-4">
          <div className="flex items-center gap-5 sm:gap-6">
            {/* Circular Ring */}
            <AttendanceRing
              percentage={overallStats.percentage}
              size={84}
              strokeWidth={7}
              target={target}
              status={overallStats.status}
              subText="Overall"
              className="shrink-0"
            />

            {/* Attendance Count & Target Badge */}
            <div className="space-y-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                  {overallStats.attended} <span className="text-slate-400 font-semibold text-lg">/ {overallStats.conducted}</span>
                </span>
              </div>

              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Classes attended
              </p>

              <div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {target}% Target
                </span>
              </div>
            </div>
          </div>

          {/* 3-Column Stats Row matching reference */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
            <div>
              <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                {overallStats.maxAbsences}
              </p>
              <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                Can safely miss
              </p>
            </div>

            <div>
              <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                {onTrackCount}
              </p>
              <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                Subjects on track
              </p>
            </div>

            <div>
              <p className={`text-base sm:text-lg font-black ${belowTargetCount > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
                {belowTargetCount}
              </p>
              <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                Below {target}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
