import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Pencil,
  History,
  ChevronRight,
  ChevronDown,
  Edit3,
  Calendar,
  Target,
} from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { AttendanceRing } from './AttendanceRing';
import type { Subject, AttendanceRecord } from '../../types';
import type {
  SubjectAttendanceAggregate,
  AttendanceEligibility,
} from '../../lib/attendanceCalculations';

interface SubjectAttendanceCardProps {
  subject: Subject;
  aggregate: SubjectAttendanceAggregate;
  targetPercent?: number;
  isMarking?: boolean;
  recentRecords?: AttendanceRecord[];
  eligibility?: AttendanceEligibility;
  onMarkPresent: () => void;
  onMarkAbsent: () => void;
  onOpenTotalsEditor?: () => void;
  onOpenBaseline?: () => void;
  onOpenHistory: () => void;
  onCorrectRecord: (record: AttendanceRecord) => void;
}

export function SubjectAttendanceCard({
  subject,
  aggregate,
  targetPercent = 75,
  isMarking = false,
  recentRecords = [],
  eligibility,
  onMarkPresent,
  onMarkAbsent,
  onOpenTotalsEditor,
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

  // Status badge styling matching approved UI reference
  let statusLabel = 'On Track';
  let statusBadgeClass = 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50';
  let statusDotClass = 'bg-emerald-500';

  if (hasNoData) {
    statusLabel = 'No data';
    statusBadgeClass = 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    statusDotClass = 'bg-slate-400';
  } else if (isShortage) {
    statusLabel = 'Shortage';
    statusBadgeClass = 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50';
    statusDotClass = 'bg-rose-500';
  } else if (isBorderline) {
    statusLabel = 'Borderline';
    statusBadgeClass = 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50';
    statusDotClass = 'bg-amber-500';
  }

  // Attendance Guidance Component box matching approved UI reference
  let guidancePrimary = `Can miss ${maxAbsences} ${maxAbsences === 1 ? 'class' : 'classes'}`;
  let guidanceSecondary: string | null = null;
  let guidanceIcon = <Calendar className="w-5 h-5 text-emerald-500 shrink-0" />;
  let guidanceBoxClass = 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-100/80 dark:border-emerald-900/40';
  let guidanceTextClass = 'text-emerald-700 dark:text-emerald-300';
  let guidanceSubtextClass = 'text-emerald-600 dark:text-emerald-400';

  if (hasNoData) {
    guidancePrimary = 'No recorded sessions';
    guidanceSecondary = null;
    guidanceIcon = <Calendar className="w-5 h-5 text-slate-400 shrink-0" />;
    guidanceBoxClass = 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800';
    guidanceTextClass = 'text-slate-600 dark:text-slate-300';
    guidanceSubtextClass = 'text-slate-500 dark:text-slate-400';
  } else if (isShortage) {
    guidancePrimary = `Attend ${classesNeeded} ${classesNeeded === 1 ? 'class' : 'classes'}`;
    guidanceSecondary = `to reach ${targetPercent}%`;
    guidanceIcon = <Target className="w-5 h-5 text-rose-500 shrink-0" />;
    guidanceBoxClass = 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-100/80 dark:border-rose-900/40';
    guidanceTextClass = 'text-rose-700 dark:text-rose-300';
    guidanceSubtextClass = 'text-rose-500 dark:text-rose-400';
  } else if (isBorderline) {
    guidancePrimary = `On ${targetPercent}% target`;
    guidanceSecondary = 'Avoid absences';
    guidanceIcon = <Target className="w-5 h-5 text-amber-500 shrink-0" />;
    guidanceBoxClass = 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-100/80 dark:border-amber-900/40';
    guidanceTextClass = 'text-amber-700 dark:text-amber-300';
    guidanceSubtextClass = 'text-amber-600 dark:text-amber-400';
  }

  return (
    <Card className="overflow-hidden border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-gray-900 rounded-3xl shadow-sm hover:shadow-md transition-all">
      <CardContent className="p-5 sm:p-6">
        {/* Main Subject Section */}
        <div
          onClick={() => setExpanded(!expanded)}
          className="cursor-pointer select-none"
        >
          <div className="flex items-center gap-4 sm:gap-5">
            {/* Prominent Circular Progress Ring on Left */}
            <div className="shrink-0 flex items-center justify-center">
              <AttendanceRing
                percentage={percentage}
                size={102}
                strokeWidth={9.5}
                target={targetPercent}
                status={status}
                attended={totalAttended}
                conducted={totalConducted}
                showTargetIndicator={false}
                className="shrink-0"
              />
            </div>

            {/* Subject Code, Status Pill, Full Name & Guidance Container on Right */}
            <div className="min-w-0 flex-1 space-y-2">
              {/* Row 1: Subject Code + Status Badge + Circular Chevron Button */}
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-black text-lg sm:text-xl text-slate-900 dark:text-white truncate tracking-tight">
                  {subject.code || subject.name}
                </h4>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusBadgeClass}`}>
                    <span className={`w-2 h-2 rounded-full ${statusDotClass}`} />
                    {statusLabel}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded((p) => !p);
                    }}
                    className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    aria-label={expanded ? 'Collapse subject actions' : 'Expand subject actions'}
                  >
                    {expanded ? <ChevronDown className="w-4 h-4 text-blue-600" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Row 2: Full Subject Name in Muted Text */}
              {subject.name && (
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium truncate -mt-1">
                  {subject.name}
                </p>
              )}

              {/* Row 3: Attendance Guidance Component Box with Edit Icon */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenTotalsEditor) {
                    onOpenTotalsEditor();
                  } else if (onOpenBaseline) {
                    onOpenBaseline();
                  }
                }}
                className={`rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2.5 border transition-all hover:opacity-95 ${guidanceBoxClass}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {guidanceIcon}
                  <div className="min-w-0">
                    <p className={`text-xs sm:text-sm font-bold truncate leading-tight ${guidanceTextClass}`}>
                      {guidancePrimary}
                    </p>
                    {guidanceSecondary && (
                      <p className={`text-[11px] font-medium leading-tight mt-0.5 ${guidanceSubtextClass}`}>
                        {guidanceSecondary}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenTotalsEditor) {
                      onOpenTotalsEditor();
                    } else if (onOpenBaseline) {
                      onOpenBaseline();
                    }
                  }}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
                  title="Edit attendance totals"
                  aria-label="Edit attendance totals"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Row 4: Faculty Name at the bottom of the card face (strictly NO room/venue and NO lecture number) */}
          {subject.faculty && (
            <div className="flex items-center gap-1.5 pt-2.5 text-xs text-slate-400 dark:text-slate-500 font-medium truncate">
              <span className="truncate">👤 {subject.faculty}</span>
            </div>
          )}
        </div>

        {/* Expandable Action Drawer */}
        {expanded && (
          <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs text-slate-500 flex-wrap gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {subject.faculty ? `👤 Faculty: ${subject.faculty}` : `${subject.credits || 3} Credits`}
              </span>
              {(eligibility?.eligibleSlot?.room || (subject as any).room) && (
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  📍 Room: {eligibility?.eligibleSlot?.room || (subject as any).room}
                </span>
              )}
            </div>

            {/* Attendance Eligibility & Marking Section */}
            {eligibility?.status === 'ELIGIBLE' && (
              <div className="space-y-2">
                {eligibility.eligibleSlot && (
                  <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 bg-blue-50/50 dark:bg-blue-950/20 px-2.5 py-1 rounded-lg border border-blue-100/60 dark:border-blue-900/30 font-medium">
                    <span>
                      Session: <strong className="font-mono text-slate-800 dark:text-slate-200">{eligibility.eligibleSlot.startTime} – {eligibility.eligibleSlot.endTime}</strong>
                      {eligibility.weight && eligibility.weight > 1 ? ` (${eligibility.weight}× Lab)` : ''}
                    </span>
                    <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300">Ready to Mark</span>
                  </div>
                )}
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
              </div>
            )}

            {eligibility?.status === 'NO_SCHEDULED_CLASS' && (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>{eligibility.message || 'No scheduled class for this subject today'}</span>
              </div>
            )}

            {eligibility?.status === 'FUTURE_SESSION' && (
              <div className="p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 text-xs text-blue-700 dark:text-blue-300 flex items-center justify-between">
                <span>{eligibility.message || `Scheduled at ${eligibility.upcomingTime}`}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 shrink-0">
                  Upcoming
                </span>
              </div>
            )}

            {eligibility?.status === 'ALL_MARKED' && (
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                <span>All scheduled sessions for this date are marked</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenHistory();
                  }}
                  className="text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:underline shrink-0 ml-2"
                >
                  View / Correct →
                </button>
              </div>
            )}

            {!eligibility && (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                <span>Checking scheduled sessions...</span>
              </div>
            )}

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
