import { Target } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { AttendanceRing } from './AttendanceRing';
import type { AttendanceStats } from '../../lib/attendanceCalculations';

interface AttendanceOverviewCardProps {
  stats: AttendanceStats;
  subjectCount: number;
  safeCount: number;
  borderlineCount: number;
  shortageCount: number;
  targetPercent?: number;
  activeFilter?: string;
  onSelectFilter?: (filter: 'all' | 'safe' | 'borderline' | 'shortage') => void;
}

export function AttendanceOverviewCard({
  stats,
  targetPercent = 75,
}: AttendanceOverviewCardProps) {
  const { attended, conducted, percentage, isOnTrack, maxAbsences, classesNeeded, status } = stats;
  const isBorderline = status === 'borderline';
  const isShortage = !isOnTrack;
  const hasNoData = conducted === 0;

  let adviceText = `You can safely miss up to ${maxAbsences} weighted sessions`;
  if (hasNoData) {
    adviceText = 'Mark your class sessions to begin tracking semester attendance.';
  } else if (isShortage) {
    adviceText = `Attend the next ${classesNeeded} ${classesNeeded === 1 ? 'class' : 'classes'} to reach your ${targetPercent}% target`;
  } else if (isBorderline) {
    adviceText = `At your ${targetPercent}% target — avoid further absences to remain on track`;
  }

  return (
    <Card className="overflow-hidden border border-blue-100/80 dark:border-blue-900/40 bg-gradient-to-br from-blue-50/70 via-white to-blue-50/30 dark:from-blue-950/30 dark:via-gray-900 dark:to-blue-950/20 rounded-3xl shadow-sm transition-all">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center gap-5 sm:gap-7">
          {/* Progress Ring with Centered Percentage and Overall label */}
          <div className="shrink-0 flex items-center justify-center">
            <AttendanceRing
              percentage={percentage}
              size={96}
              strokeWidth={8}
              target={targetPercent}
              status={status}
              subText="Overall"
              className="shrink-0 drop-shadow-sm"
            />
          </div>

          {/* Right Metrics & Guidance */}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                {attended} <span className="text-slate-400 font-semibold text-lg sm:text-xl">/ {conducted}</span>
              </span>
            </div>

            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Classes attended
            </p>

            <div className="pt-0.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <Target className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                {targetPercent}% Target
              </span>
            </div>

            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 pt-1 leading-relaxed">
              {adviceText}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
