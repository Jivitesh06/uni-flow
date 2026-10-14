import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronRight,
  Sparkles,
  Info,
  Clock,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  CURRENT_ACADEMIC_SESSION,
  groupEventsByMonth,
  getUpcomingHolidays,
  getNextUpcomingHoliday,
  getEventTemporalStatus,
  AcademicCalendarEvent,
} from '../data/academicCalendar';
import { format } from 'date-fns';

export function AcademicCalendarPage() {
  const [showAllEvents, setShowAllEvents] = useState(false);
  const now = new Date();
  const nextHoliday = getNextUpcomingHoliday(CURRENT_ACADEMIC_SESSION.events, now);
  const upcomingHolidays = getUpcomingHolidays(CURRENT_ACADEMIC_SESSION.events, now, 5);
  const monthGroups = groupEventsByMonth(CURRENT_ACADEMIC_SESSION.events);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header section with Session details */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
            {CURRENT_ACADEMIC_SESSION.name}
          </span>
          <span className="text-xs font-semibold text-slate-400">
            Academic Year {CURRENT_ACADEMIC_SESSION.academicYear}
          </span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Academic Calendar
        </h2>
        <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
          Upcoming holidays, semester breaks and important academic dates for {CURRENT_ACADEMIC_SESSION.institution}.
        </p>
      </div>

      {/* Primary Highlight Card: Next Upcoming Holiday */}
      {nextHoliday ? (
        <Card className="overflow-hidden border border-emerald-100/90 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/30 dark:from-emerald-950/30 dark:via-gray-900 dark:to-teal-950/20 rounded-3xl shadow-sm">
          <CardContent className="p-5 sm:p-6 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Next Upcoming Holiday
              </span>
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-white dark:bg-gray-800 px-2.5 py-1 rounded-full shadow-xs border border-emerald-100 dark:border-emerald-900/40">
                {nextHoliday.dayOfWeek}
              </span>
            </div>

            <div className="pt-1">
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {nextHoliday.title}
              </h3>
              <p className="text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                {nextHoliday.startDate === nextHoliday.endDate
                  ? format(new Date(nextHoliday.startDate + 'T00:00:00'), 'EEEE, MMMM d, yyyy')
                  : `${format(new Date(nextHoliday.startDate + 'T00:00:00'), 'MMMM d')} – ${format(new Date(nextHoliday.endDate + 'T00:00:00'), 'MMMM d, yyyy')}`}
              </p>
              {nextHoliday.description && (
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2">
                  {nextHoliday.description}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 p-6 text-center">
          <CalendarIcon className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <h4 className="font-bold text-slate-800 dark:text-slate-200">No upcoming holidays scheduled</h4>
          <p className="text-xs text-slate-400 mt-1">All semester holidays for this academic period have concluded.</p>
        </Card>
      )}

      {/* Upcoming Holidays List (Next 3–5) */}
      <Card className="overflow-hidden border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-gray-900 rounded-3xl shadow-sm">
        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
              <CalendarIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Upcoming Holidays & Breaks
            </CardTitle>
            <span className="text-xs font-semibold text-slate-400">
              {upcomingHolidays.length} upcoming
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 pt-3 space-y-3">
          {upcomingHolidays.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center">No upcoming holidays found.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {upcomingHolidays.map((holiday) => {
                const sDate = new Date(holiday.startDate + 'T00:00:00');
                const eDate = new Date(holiday.endDate + 'T00:00:00');
                const isMultiDay = holiday.startDate !== holiday.endDate;

                return (
                  <div key={holiday.id} className="py-3.5 first:pt-1 last:pb-1 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                          {holiday.title}
                        </h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                          {holiday.category === 'semester_break' ? 'Semester Break' : 'Holiday'}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
                        {isMultiDay
                          ? `${format(sDate, 'EEE, d MMM')} – ${format(eDate, 'EEE, d MMM yyyy')}`
                          : format(sDate, 'EEEE, d MMMM yyyy')}
                      </p>
                      {holiday.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                          {holiday.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllEvents(!showAllEvents)}
              className="w-full h-10 rounded-2xl text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/40 hover:bg-blue-100/50"
            >
              {showAllEvents ? (
                <>Hide Full Calendar <ChevronUp className="w-3.5 h-3.5 ml-1" /></>
              ) : (
                <>View Complete Calendar ({CURRENT_ACADEMIC_SESSION.events.length} Events) <ChevronDown className="w-3.5 h-3.5 ml-1" /></>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Full Vertical Monthly Timeline Calendar */}
      {showAllEvents && (
        <div className="space-y-6 pt-2">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-2">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Complete Fall Semester 2026 Schedule
            </h3>
            <p className="text-xs text-slate-500">
              Includes university reopening, non-teaching/teaching working Saturdays, and scheduled breaks.
            </p>
          </div>

          <div className="space-y-6">
            {monthGroups.map((group) => (
              <div key={group.sortKey} className="space-y-3">
                <div className="sticky top-14 z-10 py-1.5 px-3 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur-md">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    {group.monthYear}
                  </h4>
                </div>

                <div className="space-y-2.5">
                  {group.events.map((event) => {
                    const tempStatus = getEventTemporalStatus(event);
                    const isMultiDay = event.startDate !== event.endDate;
                    const isWorkingSat = event.category === 'working_saturday';

                    return (
                      <Card
                        key={event.id}
                        className={`rounded-2xl border transition-all ${
                          tempStatus === 'past'
                            ? 'opacity-70 border-slate-100 dark:border-slate-800/80 bg-white/70 dark:bg-gray-900/50'
                            : isWorkingSat
                            ? 'border-amber-200/80 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-gray-900 shadow-xs'
                        }`}
                      >
                        <CardContent className="p-4 space-y-1.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                              {event.title}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {isWorkingSat ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/60">
                                  Working Saturday
                                </span>
                              ) : event.category === 'holiday' ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  Holiday
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                                  Academic
                                </span>
                              )}
                              {tempStatus === 'past' && (
                                <span className="text-[10px] font-semibold text-slate-400">
                                  Passed
                                </span>
                              )}
                            </div>
                          </div>

                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 font-mono">
                            {isMultiDay
                              ? `${event.startDate} to ${event.endDate}`
                              : event.startDate}{' '}
                            • {event.dayOfWeek}
                          </p>

                          {event.description && (
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              {event.description}
                            </p>
                          )}

                          {event.timetableFollowed && (
                            <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/60 px-2 py-1 rounded-lg">
                              📌 Timetable: Follows {event.timetableFollowed}
                            </div>
                          )}

                          {event.substitutedOffDay && (
                            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              Off-day observed: {event.substitutedOffDay}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Official Source Attestation Footer */}
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/30 text-xs text-slate-500 dark:text-slate-400 space-y-1">
        <p className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-blue-600" /> Source Document
        </p>
        <p>
          Extracted directly from Chitkara University Himachal Pradesh official document: “{CURRENT_ACADEMIC_SESSION.sourceTitle}” (Dated {CURRENT_ACADEMIC_SESSION.sourceDate}).
        </p>
      </div>
    </div>
  );
}
