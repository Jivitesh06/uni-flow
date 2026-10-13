import { Link } from 'react-router-dom';
import {
  Clock,
  MapPin,
  User,
  Coffee,
  CheckCircle2,
  Calendar,
  Sparkles,
  AlertCircle,
  CalendarDays,
  Compass,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '../ui/card';
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
  } = liveState;

  const targetSlot = currentSlot || startingSoonSlot || nextSlot;
  const isOngoing = Boolean(currentSlot);

  return (
    <Card className="overflow-hidden border border-blue-100/90 dark:border-blue-900/50 bg-gradient-to-br from-blue-50/60 via-white to-indigo-50/30 dark:from-blue-950/40 dark:via-gray-900 dark:to-indigo-950/20 rounded-3xl shadow-sm transition-all">
      {/* Top Status & Date Context Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 border-b border-blue-100/70 dark:border-gray-800 bg-white/60 dark:bg-gray-900/40 text-xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span className="font-semibold text-slate-800 dark:text-slate-200">{dateFormatted}</span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="font-mono text-slate-500 dark:text-slate-400">{timeFormatted}</span>
        </div>

        <div className="flex items-center gap-2">
          {isStale && (
            <span
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-medium border border-amber-200/60 dark:border-amber-900/60"
            >
              <AlertCircle className="w-3 h-3 text-amber-600" /> Cached ({lastSyncedText || 'offline'})
            </span>
          )}
        </div>
      </div>

      <CardContent className="p-5 sm:p-6">
        <AnimatePresence mode="wait">
          {/* Active / Upcoming Next Class Hero */}
          {(status === 'LIVE_NOW' || status === 'STARTING_SOON' || status === 'FREE_NOW') && targetSlot ? (
            <motion.div
              key="active_class"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-4"
            >
              {/* Badge Row */}
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  <Compass className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  {isOngoing ? 'Class In Progress' : 'Next Class'}
                </span>

                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                  {isOngoing ? 'Ends in ' + timeRemainingFormatted : 'In ' + (minutesUntilNext ? formatMinutesDiff(minutesUntilNext) : timeRemainingFormatted)}
                </span>
              </div>

              {/* Subject Title & Code */}
              <Link to="/timetable" className="block group">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight group-hover:text-blue-600 transition-colors">
                      {targetSlot.subjectCode || targetSlot.subjectName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                      {targetSlot.subjectName}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-blue-600 transition-colors shrink-0 mt-1" />
                </div>
              </Link>

              {/* Metadata Row: Time, Room, Faculty */}
              <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-2 text-xs text-slate-600 dark:text-slate-400 font-medium">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{targetSlot.startTime} – {targetSlot.endTime}</span>
                </div>

                {targetSlot.room && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>{targetSlot.room}</span>
                  </div>
                )}

                {targetSlot.faculty && (
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>{targetSlot.faculty}</span>
                  </div>
                )}
              </div>
            </motion.div>
          ) : status === 'NO_MORE_CLASSES_TODAY' ? (
            <motion.div
              key="no_more_today"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Classes Completed
                </span>
                <span className="text-xs text-slate-400">All done for today</span>
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  You're all done with lectures for today! 🎉
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Great work staying on track. Mark any pending attendance or review your schedule.
                </p>
              </div>

              {nextScheduledDay && (
                <div className="p-3 rounded-2xl bg-white/80 dark:bg-gray-800/60 border border-purple-100 dark:border-purple-900/40 text-xs flex items-center justify-between mt-2">
                  <span className="text-slate-500 font-medium">Next lecture:</span>
                  <span className="font-bold text-purple-700 dark:text-purple-400">
                    {nextScheduledDay.dayName} at {nextScheduledDay.firstSlot.startTime} ({nextScheduledDay.firstSlot.subjectName})
                  </span>
                </div>
              )}
            </motion.div>
          ) : status === 'NO_CLASSES_TODAY' ? (
            <motion.div
              key="no_classes"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-3 text-center sm:text-left"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  Free Day / Holiday
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                No classes scheduled today! 🌟
              </h3>
              <p className="text-xs text-slate-500">
                Enjoy your break or catch up on your coursework.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="text-center py-6 space-y-2"
            >
              <CalendarDays className="w-8 h-8 text-blue-500 mx-auto mb-1" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                No Timetable Schedule Found
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Add your schedule to see live class countdowns and location alerts.
              </p>
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
