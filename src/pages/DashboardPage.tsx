import { useEffect, useState, useMemo } from 'react';
import {
  Clock,
  Calendar,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
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

  const todayDay = now.getDay();

  // Unassigned group slots today
  const unassignedGroupSlotsToday = useMemo(() => {
    if (studentGroup) return [];
    return effectiveSlots.filter(
      (s) => s.dayOfWeek === todayDay && (s.group === 'G1' || s.group === 'G2')
    );
  }, [effectiveSlots, todayDay, studentGroup]);

  const todaySlots = studentApplicableSlots
    .filter((s) => s.dayOfWeek === todayDay)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Calculate free slots for today
  const freeSlots: { start: string; end: string }[] = [];
  if (todaySlots.length > 0) {
    const sorted = [...todaySlots].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].endTime < sorted[i + 1].startTime) {
        freeSlots.push({ start: sorted[i].endTime, end: sorted[i + 1].startTime });
      }
    }
  }

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

  const atRiskSubjects = displaySubjects.filter((sub) => {
    const agg = subjectAttendanceMap.get(sub.id);
    return agg ? !agg.stats.isOnTrack : false;
  });

  const liveState = useMemo(() => {
    return calculateLiveClassState(studentApplicableSlots, now);
  }, [studentApplicableSlots, now]);

  const isStale = (!isFirestoreLoaded && effectiveSlots.length > 0) || isOffline;
  const dateFormatted = format(now, 'EEEE, MMMM d, yyyy');
  const timeFormatted = format(now, 'h:mm:ss a');

  const reminder = useClassReminder(studentApplicableSlots, userProfile);

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* 1. Header: Date Context & Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            {format(now, 'EEEE, MMMM d')}
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mt-0.5">
            Hi, {userProfile?.displayName?.split(' ')[0] ?? 'Student'}
          </h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500 dark:text-gray-400">
            {userProfile?.semester && (
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                Semester {userProfile.semester}
              </span>
            )}
            {userProfile?.section && (
              <span>• Section {userProfile.section}</span>
            )}
            {studentGroup && studentGroup !== 'ALL' && (
              <span className="px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold">
                {studentGroup}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link to="/attendance">
            <Button size="sm" className="h-9 px-3.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Mark Attendance
            </Button>
          </Link>
          <Link to="/timetable">
            <Button size="sm" variant="outline" className="h-9 px-3.5 text-xs font-semibold border-gray-200 dark:border-gray-800">
              <Clock className="w-4 h-4 mr-1.5" />
              Timetable
            </Button>
          </Link>
        </div>
      </div>

      {/* 2. Actionable Alerts (Only shown when there is something to act on) */}
      <ClassReminderBanner reminder={reminder} />

      {unassignedGroupSlotsToday.length > 0 && (
        <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <p className="leading-relaxed">
            <strong>Group Labs Today:</strong> Your section has {unassignedGroupSlotsToday.length} lab class(es) today. Set your lab group (G1 or G2) in Settings to see your exact schedule.
          </p>
          <Link to="/settings" className="shrink-0">
            <Button size="sm" variant="outline" className="text-xs h-7 border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 font-bold">
              Set Group
            </Button>
          </Link>
        </div>
      )}

      {atRiskSubjects.length > 0 && (
        <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-900 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <p>
              <strong>Attendance Alert:</strong> {atRiskSubjects.length} {atRiskSubjects.length === 1 ? 'subject is' : 'subjects are'} currently below your {target}% goal.
            </p>
          </div>
          <Link to="/attendance" className="shrink-0">
            <Button size="sm" variant="outline" className="text-xs h-7 border-rose-300 dark:border-rose-800 bg-white dark:bg-gray-900 text-rose-700 dark:text-rose-300 font-bold">
              View Recovery Target
            </Button>
          </Link>
        </div>
      )}

      {/* 3. Primary Decision Hero: Live Class / Next Class */}
      <LiveClassCard
        liveState={liveState}
        dateFormatted={dateFormatted}
        timeFormatted={timeFormatted}
        isStale={isStale}
        lastSyncedText={lastSyncedText}
      />

      {/* 4. Core Two-Column Overview: Today's Schedule & Attendance Standing */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Today's Schedule Card */}
        <Card className="border border-gray-200/80 dark:border-gray-800 shadow-sm">
          <CardHeader className="p-4 sm:p-5 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                <Clock className="w-4 h-4 text-blue-600" />
                Today's Schedule
                <span className="text-xs font-normal text-gray-500">
                  ({todaySlots.length} {todaySlots.length === 1 ? 'class' : 'classes'})
                </span>
              </CardTitle>
              <Link to="/timetable" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
                Full week <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-2">
            {todaySlots.length === 0 ? (
              <div className="text-center py-8">
                <Sparkles className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">No classes scheduled today</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Enjoy your free day or catch up on study!</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {todaySlots.map((slot) => {
                  const [sh, sm] = slot.startTime.split(':').map(Number);
                  const [eh, em] = slot.endTime.split(':').map(Number);
                  const start = new Date(now);
                  start.setHours(sh, sm, 0, 0);
                  const end = new Date(now);
                  end.setHours(eh, em, 0, 0);
                  const isNow = now >= start && now <= end;
                  const isPast = now > end;

                  return (
                    <div
                      key={slot.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                        isNow
                          ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                          : isPast
                          ? 'border-gray-100 dark:border-gray-800 opacity-60'
                          : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                      }`}
                    >
                      <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: slot.color || '#3b82f6' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                            {slot.subjectName}
                          </p>
                          {slot.group && slot.group !== 'ALL' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                              {slot.group}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                          {slot.startTime} – {slot.endTime}
                          {slot.room && ` • Room ${slot.room}`}
                          {slot.faculty && ` • ${slot.faculty}`}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {isNow && <Badge variant="success" className="text-[10px]">Now</Badge>}
                        {isPast && <Badge variant="default" className="text-[10px]">Done</Badge>}
                        {!isNow && !isPast && <span className="text-[11px] text-gray-400 font-mono">{slot.startTime}</span>}
                      </div>
                    </div>
                  );
                })}

                {freeSlots.length > 0 && (
                  <div className="pt-2 text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-gray-400">Breaks today:</span>
                    {freeSlots.map((fs, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-mono text-[10px]">
                        ☕ {fs.start}–{fs.end}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overall Attendance Pulse Card */}
        <Card className="border border-gray-200/80 dark:border-gray-800 shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="p-4 sm:p-5 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Attendance Standing
                </CardTitle>
                <Link to="/attendance" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
                  View all ({displaySubjects.length}) <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 pt-2 space-y-4">
              {/* Main Metric */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    Overall Standing
                  </p>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-3xl font-black text-gray-900 dark:text-white">
                      {overallStats.conducted > 0 ? `${overallStats.percentage.toFixed(1)}%` : '0.0%'}
                    </span>
                    <span className="text-xs text-gray-400">
                      ({overallStats.attended}/{overallStats.conducted} classes)
                    </span>
                  </div>
                </div>

                <Badge
                  variant={
                    overallStats.conducted === 0
                      ? 'default'
                      : overallStats.isOnTrack && overallStats.status !== 'borderline'
                      ? 'success'
                      : overallStats.status === 'borderline'
                      ? 'warning'
                      : 'danger'
                  }
                  className="text-xs font-bold px-2.5 py-1"
                >
                  {overallStats.conducted === 0
                    ? 'No data'
                    : overallStats.isOnTrack && overallStats.status !== 'borderline'
                    ? 'On Track'
                    : overallStats.status === 'borderline'
                    ? 'Borderline'
                    : 'Below Target'}
                </Badge>
              </div>

              {/* Actionable Advice message */}
              <div className="p-3 rounded-xl text-xs leading-relaxed bg-blue-50/50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200 border border-blue-100 dark:border-blue-900/40">
                {overallStats.conducted === 0 ? (
                  <span>Mark your attendance or enter past lecture records in the Attendance Tracker.</span>
                ) : overallStats.isOnTrack ? (
                  <span>
                    ✓ You have a buffer of <strong>{overallStats.maxAbsences} classes</strong> you can safely miss while remaining above your {target}% target.
                  </span>
                ) : (
                  <span>
                    ⚠️ You need to attend <strong>{overallStats.classesNeeded} consecutive classes</strong> to reach your {target}% target.
                  </span>
                )}
              </div>

              {/* Quick Subject Snippet (Top 3 lowest) */}
              {displaySubjects.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Subjects Requiring Focus
                  </p>
                  {[...displaySubjects]
                    .sort((a, b) => {
                      const pctA = subjectAttendanceMap.get(a.id)?.stats.percentage ?? 100;
                      const pctB = subjectAttendanceMap.get(b.id)?.stats.percentage ?? 100;
                      return pctA - pctB;
                    })
                    .slice(0, 3)
                    .map((sub) => {
                      const agg = subjectAttendanceMap.get(sub.id);
                      const pct = agg?.stats.percentage ?? 0;
                      const isOnTrack = agg?.stats.isOnTrack ?? true;
                      return (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between py-1.5 px-2 rounded-lg text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        >
                          <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[180px]">
                            {sub.name}
                          </span>
                          <span className={`font-bold font-mono ${isOnTrack ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </div>

          <div className="p-4 sm:p-5 pt-0">
            <Link to="/attendance">
              <Button variant="outline" size="sm" className="w-full text-xs font-semibold h-8 border-gray-200 dark:border-gray-800">
                Open Attendance Tracker
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
