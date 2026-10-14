import { useEffect, useState, useMemo, useRef } from 'react';
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
  calculateSubjectAttendance,
  canonicalizeSubjectsForAttendance,
  buildTimetableSubjectEquivalenceMap,
  matchesSubjectRecord,
} from '../lib/attendanceCalculations';
import { calculateLiveClassState, calculateDailySlotSessionNumber } from '../lib/timetableCalculations';
import { calculateFreeClassrooms } from '../lib/roomAvailability';
import { getGreeting } from '../lib/greeting';
import { LiveClassCard } from '../components/timetable/LiveClassCard';
import { FreeClassroomCard } from '../components/timetable/FreeClassroomCard';
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

function DashboardSubjectRow({
  sub,
  conducted,
  attended,
  pct,
  target,
}: {
  sub: Subject;
  conducted: number;
  attended: number;
  pct: number;
  target: number;
}) {
  const isMeetingTarget = conducted === 0 ? true : pct >= target;
  const clampedPct = Math.min(100, Math.max(0, conducted === 0 ? 0 : pct));

  const [animatedWidth, setAnimatedWidth] = useState(0);
  const isInitialMount = useRef(true);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setAnimatedWidth(clampedPct);
      return;
    }

    if (isInitialMount.current) {
      isInitialMount.current = false;
      const frame = requestAnimationFrame(() => {
        setAnimatedWidth(clampedPct);
      });
      return () => cancelAnimationFrame(frame);
    } else {
      setAnimatedWidth(clampedPct);
    }
  }, [clampedPct]);

  const colorClass = conducted === 0
    ? 'text-slate-500 dark:text-slate-400'
    : isMeetingTarget
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-rose-600 dark:text-rose-400';

  const barFillClass = conducted === 0
    ? 'bg-slate-300 dark:bg-slate-700'
    : isMeetingTarget
    ? 'bg-emerald-500'
    : 'bg-rose-500';

  const displayPct = conducted === 0
    ? '0%'
    : `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
            {sub.code || sub.name}
          </p>
        </div>

        {/* Horizontal progress bar for medium+ space with smooth 1000ms transition */}
        <div className="hidden sm:block w-36 md:w-48 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ease-out ${barFillClass}`}
            style={{ width: `${animatedWidth}%` }}
          />
        </div>

        <div className="shrink-0 text-right">
          <span className={`text-xs sm:text-sm font-black tracking-tight ${colorClass}`}>
            {displayPct}
          </span>
        </div>
      </div>

      {/* Compact progress bar on mobile screens with smooth 1000ms transition */}
      <div className="sm:hidden w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-out ${barFillClass}`}
          style={{ width: `${animatedWidth}%` }}
        />
      </div>
    </div>
  );
}

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

  const liveState = useMemo(() => {
    return calculateLiveClassState(studentApplicableSlots, now);
  }, [studentApplicableSlots, now]);

  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);
  const [roomRefreshTicker, setRoomRefreshTicker] = useState(0);

  const roomInspection = useMemo(() => {
    // Re-evaluates based on current time or manual refresh
    return calculateFreeClassrooms(now);
  }, [now, roomRefreshTicker]);

  function handleRefreshRooms() {
    setIsRefreshingRooms(true);
    setNow(new Date());
    setRoomRefreshTicker((c) => c + 1);
    setTimeout(() => setIsRefreshingRooms(false), 400);
  }

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

  // Dynamic time of day greeting
  const greeting = getGreeting(now);

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* 1. Header Greeting matching Reference Image */}
      <div className="pt-1">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          {greeting.text} {greeting.emoji}
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

                const sessionInfo = calculateDailySlotSessionNumber(slot, todaySlots);

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
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                            {slot.subjectCode || slot.subjectName}
                          </p>
                          {sessionInfo && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              L{sessionInfo.sessionNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
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

      {/* 5. Free Classrooms Right Now Card */}
      <FreeClassroomCard
        inspection={roomInspection}
        onRefresh={handleRefreshRooms}
        isRefreshing={isRefreshingRooms}
      />

      {/* 6. Subject-Wise Attendance Card */}
      <Card className="overflow-hidden border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-gray-900 rounded-3xl shadow-sm">
        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">
              Subject Attendance
            </CardTitle>
            <span className="text-xs font-semibold text-slate-400">
              Target: {target}%
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-3 space-y-3">
          {displaySubjects.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No subjects registered yet.</p>
          ) : (
            <div className="space-y-3">
              {displaySubjects.map((sub) => {
                const agg = subjectAttendanceMap.get(sub.id);
                const conducted = agg ? agg.totalConducted : 0;
                const attended = agg ? agg.totalAttended : 0;
                const pct = agg ? agg.stats.percentage : 0;

                return (
                  <DashboardSubjectRow
                    key={sub.id}
                    sub={sub}
                    conducted={conducted}
                    attended={attended}
                    pct={pct}
                    target={target}
                  />
                );
              })}
            </div>
          )}

          <div className="pt-2">
            <Link to="/attendance" className="block">
              <Button
                variant="outline"
                size="sm"
                className="w-full h-9 rounded-2xl text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/40 hover:bg-blue-100/50"
              >
                View Full Attendance <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
