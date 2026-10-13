import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Sliders,
  History,
  Edit3,
  User,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { AttendanceRing } from './AttendanceRing';
import type { Subject, AttendanceRecord } from '../../types';
import type { SubjectAttendanceAggregate } from '../../lib/attendanceCalculations';

interface SubjectAttendanceCardProps {
  subject: Subject;
  aggregate: SubjectAttendanceAggregate;
  targetPercent?: number;
  isMarking?: boolean;
  recentRecords?: AttendanceRecord[];
  onMarkPresent: () => void;
  onMarkAbsent: () => void;
  onOpenBaseline: () => void;
  onOpenHistory: () => void;
  onCorrectRecord: (record: AttendanceRecord) => void;
}

export function SubjectAttendanceCard({
  subject,
  aggregate,
  targetPercent = 75,
  isMarking = false,
  recentRecords = [],
  onMarkPresent,
  onMarkAbsent,
  onOpenBaseline,
  onOpenHistory,
  onCorrectRecord,
}: SubjectAttendanceCardProps) {
  const {
    totalAttended,
    totalConducted,
    baselineAttended,
    baselineConducted,
    loggedAttended,
    loggedConducted,
    hasBaseline,
    stats,
  } = aggregate;

  const { percentage, isOnTrack, status, statusLabel, nextActionText, maxAbsences, classesNeeded } = stats;
  const isHealthy = isOnTrack && status !== 'borderline';
  const isBorderline = status === 'borderline';
  const isShortage = !isOnTrack;
  const hasNoData = totalConducted === 0;

  // Status badge styling
  let badgeClasses = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60';
  let StatusIcon = ShieldCheck;
  if (isBorderline) {
    badgeClasses = 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60';
    StatusIcon = AlertTriangle;
  } else if (isShortage) {
    badgeClasses = 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60';
    StatusIcon = ShieldAlert;
  } else if (hasNoData) {
    badgeClasses = 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800/60';
    StatusIcon = BookOpen;
  }

  return (
    <Card
      className="group overflow-hidden border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/90 hover:shadow-lg transition-all duration-200 flex flex-col justify-between"
      style={{ borderTop: `4px solid ${subject.color || '#3b82f6'}` }}
    >
      <CardContent className="p-5 sm:p-6 flex flex-col h-full justify-between space-y-4">
        {/* Top Header: Title, Code, Status Badge */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white leading-snug truncate" title={subject.name}>
                  {subject.name}
                </h4>
                {subject.code && subject.code !== subject.name && (
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                    {subject.code}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                {subject.faculty ? (
                  <span className="flex items-center gap-1 truncate" title={subject.faculty}>
                    <User className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
                    <span className="truncate">{subject.faculty}</span>
                  </span>
                ) : (
                  <span>{subject.credits || 3} Credits</span>
                )}
                <span>•</span>
                <span className="font-medium text-slate-400 dark:text-slate-500">{targetPercent}% required</span>
              </div>
            </div>

            {/* Status Badge */}
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border flex-shrink-0 ${badgeClasses}`}
            >
              <StatusIcon className="w-3 h-3" />
              {statusLabel}
            </span>
          </div>

          {/* Metric Centerpiece: Donut Ring & Dynamic Guidance */}
          <div className="mt-4 p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center gap-4 sm:gap-5">
            <AttendanceRing
              percentage={percentage}
              size={76}
              strokeWidth={7}
              target={targetPercent}
              status={status}
              className="flex-shrink-0"
            />

            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {totalAttended} <span className="text-xs sm:text-sm font-semibold text-slate-400">/ {totalConducted} classes</span>
                </span>
              </div>

              {/* Dynamic Action Statement */}
              <p
                className={`text-xs font-semibold leading-relaxed ${
                  isShortage
                    ? 'text-rose-600 dark:text-rose-400'
                    : isBorderline
                    ? 'text-amber-600 dark:text-amber-400'
                    : hasNoData
                    ? 'text-slate-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {nextActionText}
              </p>

              {/* Subtle breakdown chips */}
              <div className="pt-1 flex items-center gap-2 flex-wrap text-[11px] text-slate-400">
                {isHealthy && maxAbsences > 0 && (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Cushion: {maxAbsences} {maxAbsences === 1 ? 'class' : 'classes'}
                  </span>
                )}
                {isShortage && classesNeeded > 0 && (
                  <span className="inline-flex items-center gap-1 font-medium text-rose-700 dark:text-rose-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Deficit: {classesNeeded} {classesNeeded === 1 ? 'class' : 'classes'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Baseline Composition Pill */}
          <div className="mt-3 flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
            <span className="text-[11px] truncate">
              {hasBaseline ? (
                <>
                  <strong className="text-slate-700 dark:text-slate-300 font-semibold">{baselineAttended}/{baselineConducted}</strong> baseline +{' '}
                  <strong className="text-slate-700 dark:text-slate-300 font-semibold">{loggedAttended}/{loggedConducted}</strong> tracked
                </>
              ) : (
                <>
                  <strong className="text-slate-700 dark:text-slate-300 font-semibold">{loggedAttended}/{loggedConducted}</strong> tracked sessions
                </>
              )}
            </span>

            <button
              type="button"
              onClick={onOpenBaseline}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0 ml-2"
            >
              <Sliders className="w-3 h-3" />
              {hasBaseline ? 'Edit Baseline' : 'Set Baseline'}
            </button>
          </div>
        </div>

        {/* Action Buttons: Present, Absent & History */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-emerald-300 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-bold text-xs"
              onClick={onMarkPresent}
              loading={isMarking}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-600 dark:text-emerald-400" /> Present
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-rose-300 dark:border-rose-800/80 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold text-xs"
              onClick={onMarkAbsent}
              loading={isMarking}
            >
              <XCircle className="w-4 h-4 mr-1.5 text-rose-600 dark:text-rose-400" /> Absent
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenHistory}
              title="View full attendance history for this subject"
              className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <History className="w-4 h-4" />
            </Button>
          </div>

          {/* Recent Mini Activity Feed */}
          {recentRecords.length > 0 && (
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>Recent Class Logs</span>
                <button
                  type="button"
                  onClick={onOpenHistory}
                  className="hover:text-blue-600 dark:hover:text-blue-400 font-semibold"
                >
                  View All &rarr;
                </button>
              </div>

              <div className="space-y-1">
                {recentRecords.slice(0, 2).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-slate-50/80 dark:bg-slate-800/50"
                  >
                    <span className="text-slate-600 dark:text-slate-300 font-medium text-[11px]">
                      {format(r.date.toDate(), 'EEE, MMM d')}
                      {r.weight && r.weight > 1 ? ` (${r.weight}×)` : ''}
                      {r.notes && <span className="text-[10px] text-slate-400 ml-1 italic truncate">({r.notes})</span>}
                    </span>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={r.status === 'present' ? 'success' : r.status === 'absent' ? 'danger' : 'default'}
                        className="text-[10px] px-1.5 py-0.2"
                      >
                        {r.status}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => onCorrectRecord(r)}
                        className="text-slate-400 hover:text-blue-600 transition-colors p-0.5"
                        title="Correct this attendance entry"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
