import React from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  MapPin,
  User,
  Coffee,
  CheckCircle2,
  Calendar,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Hourglass,
  CalendarDays,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import type { LiveDashboardState } from '../../lib/timetableCalculations';

interface LiveClassCardProps {
  liveState: LiveDashboardState;
  dateFormatted: string;
  timeFormatted: string;
  isStale?: boolean;
  lastSyncedText?: string;
  onRefresh?: () => void;
}

export function LiveClassCard({
  liveState,
  dateFormatted,
  timeFormatted,
  isStale = false,
  lastSyncedText,
}: LiveClassCardProps) {
  const {
    status,
    currentSlot,
    startingSoonSlot,
    nextSlot,
    currentFreePeriod,
    nextScheduledDay,
    timeRemainingFormatted,
    minutesUntilNext,
    minutesRemainingInCurrent,
  } = liveState;

  return (
    <Card className="relative overflow-hidden border-2 border-primary-500/20 dark:border-primary-500/30 shadow-lg shadow-primary-500/5 bg-white dark:bg-gray-900 transition-all">
      {/* Top Banner Bar: Day, Date, Live Clock, Stale badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-950/40 text-xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
          <span className="font-bold text-gray-800 dark:text-gray-200">{dateFormatted}</span>
          <span className="text-gray-300 dark:text-gray-700">•</span>
          <span className="font-mono font-semibold text-gray-500 dark:text-gray-400">{timeFormatted}</span>
        </div>

        <div className="flex items-center gap-2">
          {isStale && (
            <span
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-medium border border-amber-200/60 dark:border-amber-900/60"
              title="Showing cached timetable while offline or refreshing"
            >
              <AlertCircle className="w-3 h-3 text-amber-600" /> Cached ({lastSyncedText || 'offline'})
            </span>
          )}
          <span className="text-[10px] text-gray-400 hidden sm:inline" title="Derived from student timetable schedule">
            Timetable-based Pulse
          </span>
        </div>
      </div>

      <CardContent className="p-5 sm:p-7">
        <AnimatePresence mode="wait">
          {/* ============================================================== */}
          {/* 1. LIVE NOW: Lecture in progress                               */}
          {/* ============================================================== */}
          {status === 'LIVE_NOW' && currentSlot && (
            <motion.div
              key="live_now"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-white" />
                    LIVE NOW
                  </span>
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    {timeRemainingFormatted} remaining
                  </span>
                </div>

                <div className="text-right sm:text-right font-mono text-sm text-gray-500 dark:text-gray-400 font-bold">
                  {currentSlot.startTime} – {currentSlot.endTime}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/30 dark:from-emerald-950/30 dark:via-gray-900 dark:to-emerald-950/10 border border-emerald-200 dark:border-emerald-800/60 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                      {currentSlot.subjectName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-mono text-xs font-bold">
                        {currentSlot.subjectCode}
                      </span>
                    </div>
                  </div>

                  <div className="w-4 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: currentSlot.color || '#10b981' }} />
                </div>

                <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-4 pt-4 border-t border-emerald-200/50 dark:border-emerald-800/40 text-sm">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold">
                    <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>{currentSlot.room ? `Room ${currentSlot.room}` : 'Room TBA'}</span>
                  </div>

                  {currentSlot.faculty && (
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>{currentSlot.faculty}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-gray-500 text-xs ml-auto font-mono">
                    <Hourglass className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Ends in {minutesRemainingInCurrent}m</span>
                  </div>
                </div>
              </div>

              {/* Next lecture up teaser */}
              {nextSlot && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 text-xs text-gray-600 dark:text-gray-400">
                  <span className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    Next: <strong className="text-gray-900 dark:text-white">{nextSlot.subjectName}</strong> ({nextSlot.startTime})
                    {nextSlot.room && ` in Room ${nextSlot.room}`}
                  </span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">in {formatMinutesDiff(minutesUntilNext)}</span>
                </div>
              )}
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* 2. STARTING SOON: Starts within 15 minutes                      */}
          {/* ============================================================== */}
          {status === 'STARTING_SOON' && startingSoonSlot && (
            <motion.div
              key="starting_soon"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-white shadow-sm shadow-amber-500/30 animate-pulse">
                    <Clock className="w-3 h-3" />
                    STARTING SOON
                  </span>
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                    Starts in {timeRemainingFormatted}!
                  </span>
                </div>

                <div className="text-right font-mono text-sm text-gray-500 dark:text-gray-400 font-bold">
                  {startingSoonSlot.startTime} – {startingSoonSlot.endTime}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50/80 via-white to-amber-50/30 dark:from-amber-950/30 dark:via-gray-900 dark:to-amber-950/10 border border-amber-200 dark:border-amber-800/60 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                      {startingSoonSlot.subjectName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-mono text-xs font-bold">
                        {startingSoonSlot.subjectCode}
                      </span>
                    </div>
                  </div>

                  <div className="w-4 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: startingSoonSlot.color || '#f59e0b' }} />
                </div>

                <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-4 pt-4 border-t border-amber-200/50 dark:border-amber-800/40 text-sm">
                  <div className="flex items-center gap-2 text-gray-900 dark:text-white font-extrabold">
                    <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>Head to: {startingSoonSlot.room ? `Room ${startingSoonSlot.room}` : 'Room TBA'}</span>
                  </div>

                  {startingSoonSlot.faculty && (
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <User className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>{startingSoonSlot.faculty}</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* 3. FREE NOW: Break or gap before next lecture                   */}
          {/* ============================================================== */}
          {status === 'FREE_NOW' && nextSlot && (
            <motion.div
              key="free_now"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-600 text-white shadow-sm shadow-blue-600/30">
                    <Coffee className="w-3 h-3" />
                    FREE NOW
                  </span>
                  <span className="text-xs font-bold text-blue-700 dark:text-blue-400">
                    {timeRemainingFormatted} of free time
                  </span>
                </div>

                {currentFreePeriod && (
                  <div className="text-right font-mono text-xs text-gray-500 font-medium">
                    Break window: {currentFreePeriod.start} – {currentFreePeriod.end}
                  </div>
                )}
              </div>

              <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-50/70 via-white to-indigo-50/30 dark:from-blue-950/30 dark:via-gray-900 dark:to-indigo-950/10 border border-blue-200 dark:border-blue-900/60 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400 mb-1">
                      Up Next Today
                    </p>
                    <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
                      {nextSlot.subjectName}
                    </h3>
                    <p className="text-xs text-gray-500 font-medium mt-0.5">{nextSlot.subjectCode}</p>
                  </div>

                  <div className="text-right">
                    <p className="font-mono font-black text-lg text-blue-600 dark:text-blue-400">
                      {nextSlot.startTime}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">until {nextSlot.endTime}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-4 pt-3 border-t border-blue-100 dark:border-blue-900/40 text-xs">
                  <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 font-semibold">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    <span>Location: {nextSlot.room ? `Room ${nextSlot.room}` : 'Room TBA'}</span>
                  </div>

                  {nextSlot.faculty && (
                    <div className="flex items-center gap-1.5 text-gray-500">
                      <User className="w-3.5 h-3.5 text-blue-600" />
                      <span>{nextSlot.faculty}</span>
                    </div>
                  )}

                  <div className="ml-auto text-blue-600 dark:text-blue-400 font-bold">
                    Starts in {timeRemainingFormatted}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* 4. NO MORE CLASSES TODAY: All sessions completed               */}
          {/* ============================================================== */}
          {status === 'NO_MORE_CLASSES_TODAY' && (
            <motion.div
              key="no_more_today"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="py-3 space-y-4 text-center sm:text-left"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span className="inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-purple-600 text-white w-fit mx-auto sm:mx-0 shadow-sm">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  NO MORE CLASSES TODAY
                </span>

                <span className="text-xs text-gray-400">Today's schedule completed</span>
              </div>

              <div className="p-5 rounded-2xl bg-gradient-to-r from-purple-50/50 via-white to-pink-50/30 dark:from-purple-950/20 dark:via-gray-900 dark:to-gray-900 border border-purple-100 dark:border-purple-900/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    You're all done with lectures for today! 🎉
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-md">
                    Great work staying on track. Mark any pending attendance or review your upcoming schedule below.
                  </p>
                </div>

                {nextScheduledDay && (
                  <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-purple-100 dark:border-purple-900/40 text-xs sm:text-right flex-shrink-0">
                    <p className="text-gray-400 font-medium">Next lecture day:</p>
                    <p className="font-bold text-purple-700 dark:text-purple-400">
                      {nextScheduledDay.dayName} at {nextScheduledDay.firstSlot.startTime}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate max-w-[160px]">
                      {nextScheduledDay.firstSlot.subjectName}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* 5. NO CLASSES TODAY: Weekend or free day                       */}
          {/* ============================================================== */}
          {status === 'NO_CLASSES_TODAY' && (
            <motion.div
              key="no_classes_today"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="py-2 space-y-4"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-indigo-600 text-white shadow-sm">
                  <Sparkles className="w-3.5 h-3.5" />
                  NO CLASSES TODAY
                </span>
                <span className="text-xs text-gray-400">Free Day / Holiday</span>
              </div>

              <div className="p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Enjoy your day off! 🌟
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    No classes are scheduled on your timetable for today.
                  </p>
                </div>

                {nextScheduledDay && (
                  <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-indigo-100 dark:border-indigo-900/40 text-xs sm:text-right flex-shrink-0">
                    <p className="text-gray-400 font-medium">Next scheduled class:</p>
                    <p className="font-bold text-indigo-600 dark:text-indigo-400">
                      {nextScheduledDay.dayName} at {nextScheduledDay.firstSlot.startTime}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate max-w-[180px]">
                      {nextScheduledDay.firstSlot.subjectName}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* 6. EMPTY TIMETABLE: Student hasn't added slots yet              */}
          {/* ============================================================== */}
          {status === 'EMPTY_TIMETABLE' && (
            <motion.div
              key="empty_timetable"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="text-center py-6 sm:py-8 space-y-3"
            >
              <div className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-950/60 text-primary-600 flex items-center justify-center mx-auto">
                <CalendarDays className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                No Timetable Configured Yet
              </h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Add your class schedule manually or import an Excel sheet to unlock live class countdowns, room alerts, and free period detection.
              </p>
              <div className="pt-2">
                <Link to="/timetable">
                  <Button size="sm" className="font-semibold text-xs">
                    Set Up Timetable <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

function formatMinutesDiff(minutes: number): string {
  if (minutes <= 0) return 'now';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
