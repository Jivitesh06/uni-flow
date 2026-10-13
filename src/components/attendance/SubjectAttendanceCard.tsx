import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Sliders,
  History,
  ChevronRight,
  ChevronDown,
  Edit3,
} from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
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
  const [expanded, setExpanded] = useState(false);
  const {
    totalAttended,
    totalConducted,
    stats,
  } = aggregate;

  const { percentage, isOnTrack, status, maxAbsences, classesNeeded } = stats;
  const isHealthy = isOnTrack && status !== 'borderline';
  const isBorderline = status === 'borderline';
  const isShortage = !isOnTrack;
  const hasNoData = totalConducted === 0;

  let guidanceText = `Can miss up to ${maxAbsences} ${maxAbsences === 1 ? 'class' : 'classes'}`;
  let guidanceColor = 'text-emerald-600 dark:text-emerald-400';

  if (hasNoData) {
    guidanceText = 'No recorded sessions';
    guidanceColor = 'text-slate-400 dark:text-slate-500';
  } else if (isShortage) {
    guidanceText = `Attend next ${classesNeeded} ${classesNeeded === 1 ? 'class' : 'classes'} to reach ${targetPercent}%`;
    guidanceColor = 'text-rose-600 dark:text-rose-400';
  } else if (isBorderline) {
    guidanceText = `On ${targetPercent}% target — avoid absences`;
    guidanceColor = 'text-amber-600 dark:text-amber-400';
  }

  const statusLabel = hasNoData
    ? 'No data'
    : isHealthy
    ? 'On Track'
    : isBorderline
    ? 'Borderline'
    : 'Shortage';

  const statusPillClass = hasNoData
    ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'
    : isHealthy
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
    : isBorderline
    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60'
    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800/60';

  return (
    <Card className="overflow-hidden border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-gray-900 rounded-3xl shadow-sm hover:shadow-md transition-all">
      <CardContent className="p-4 sm:p-5">
        {/* Main Subject Row matching reference image */}
        <div
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3.5 sm:gap-4 cursor-pointer select-none"
        >
          {/* Mini Progress Ring */}
          <div className="shrink-0">
            <AttendanceRing
              percentage={percentage}
              size={54}
              strokeWidth={5}
              target={targetPercent}
              status={status}
              showTargetIndicator={false}
              className="shrink-0"
            />
          </div>

          {/* Subject Titles and Guidance */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                {subject.code || subject.name}
              </h4>
              {subject.code && subject.code !== subject.name && (
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium truncate hidden sm:inline">
                  • {subject.name}
                </span>
              )}
            </div>

            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
              {totalAttended} / {totalConducted} classes
            </p>

            <p className={`text-[11px] font-medium mt-0.5 ${guidanceColor} truncate`}>
              {guidanceText}
            </p>
          </div>

          {/* Status Pill & Expand Chevron */}
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusPillClass}`}>
              {statusLabel}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((p) => !p);
              }}
              className="p-1 text-slate-300 dark:text-slate-600 hover:text-slate-500 transition-colors"
              aria-label={expanded ? 'Collapse subject actions' : 'Expand subject actions'}
            >
              {expanded ? <ChevronDown className="w-4 h-4 text-blue-600" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expandable Action Drawer */}
        {expanded && (
          <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{subject.faculty ? `Faculty: ${subject.faculty}` : `${subject.credits || 3} Credits`}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenBaseline();
                }}
                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1"
              >
                <Sliders className="w-3 h-3" /> Baseline
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-green-300 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 font-bold h-9"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkPresent();
                }}
                loading={isMarking}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark Present
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-bold h-9"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkAbsent();
                }}
                loading={isMarking}
              >
                <XCircle className="w-3.5 h-3.5 mr-1" /> Mark Absent
              </Button>
            </div>

            {/* Recent Mini Activity Feed */}
            {recentRecords.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Recent Class Logs</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenHistory();
                    }}
                    className="hover:text-blue-600 dark:hover:text-blue-400 font-semibold lowercase"
                  >
                    view all history →
                  </button>
                </div>

                <div className="space-y-1">
                  {recentRecords.slice(0, 2).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50"
                    >
                      <span className="text-slate-600 dark:text-slate-300 font-medium text-[11px]">
                        {format(r.date.toDate(), 'EEE, MMM d')}
                        {r.weight && r.weight > 1 ? ` (${r.weight}×)` : ''}
                        {r.notes && <span className="text-[10px] text-slate-400 ml-1 italic truncate">({r.notes})</span>}
                      </span>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            r.status === 'present'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : r.status === 'absent'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {r.status}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCorrectRecord(r);
                          }}
                          className="text-slate-400 hover:text-blue-600 transition-colors p-0.5"
                          title="Correct this attendance entry"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recentRecords.length === 0 && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenHistory();
                  }}
                  className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 flex items-center gap-1"
                >
                  <History className="w-3 h-3" /> View Log History
                </button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
