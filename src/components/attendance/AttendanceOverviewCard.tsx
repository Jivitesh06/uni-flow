import React from 'react';
import { Target, CheckCircle2, AlertTriangle, ShieldAlert, Sparkles, TrendingUp, Info } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
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
  subjectCount,
  safeCount,
  borderlineCount,
  shortageCount,
  targetPercent = 75,
  activeFilter = 'all',
  onSelectFilter,
}: AttendanceOverviewCardProps) {
  const { attended, conducted, percentage, isOnTrack, maxAbsences, classesNeeded, status } = stats;
  const isHealthy = isOnTrack && status !== 'borderline';
  const isBorderline = status === 'borderline';
  const isShortage = !isOnTrack;
  const hasNoData = conducted === 0;

  // Status banner styling & wording
  let statusTitle = 'On Track';
  let statusBadgeVariant: 'success' | 'warning' | 'danger' | 'default' = 'success';
  let statusBadgeText = 'Safe';
  let statusIcon = CheckCircle2;
  let statusBg = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60';

  if (isBorderline) {
    statusTitle = 'On Threshold';
    statusBadgeVariant = 'warning';
    statusBadgeText = 'Borderline';
    statusIcon = AlertTriangle;
    statusBg = 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60';
  } else if (isShortage) {
    statusTitle = 'Below Required Attendance';
    statusBadgeVariant = 'danger';
    statusBadgeText = 'Shortage';
    statusIcon = ShieldAlert;
    statusBg = 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60';
  } else if (hasNoData) {
    statusTitle = 'Awaiting Attendance';
    statusBadgeVariant = 'default';
    statusBadgeText = 'Unstarted';
    statusIcon = Sparkles;
    statusBg = 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800/60';
  }

  const StatusIconComponent = statusIcon;

  return (
    <Card className="overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm transition-all">
      <CardContent className="p-5 sm:p-7">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left Column: Circular Ring + High-Level Metric */}
          <div className="flex items-center gap-5 sm:gap-6">
            <AttendanceRing
              percentage={percentage}
              size={112}
              strokeWidth={10}
              target={targetPercent}
              status={status}
              subText="Overall"
              className="flex-shrink-0"
            />

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Overall Attendance
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusBg}`}
                >
                  <StatusIconComponent className="w-3 h-3" />
                  {statusTitle}
                </span>
              </div>

              <h3 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                {hasNoData ? '0.0%' : `${percentage.toFixed(1)}%`}
              </h3>

              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                <strong className="text-slate-900 dark:text-white font-semibold">{attended}</strong> attended of{' '}
                <strong className="text-slate-900 dark:text-white font-semibold">{conducted}</strong> conducted sessions across{' '}
                <strong className="text-slate-900 dark:text-white font-semibold">{subjectCount}</strong> subjects
              </p>
            </div>
          </div>

          {/* Right Column: Key Guidance & Threshold Chips */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 lg:gap-4 flex-shrink-0">
            {/* Target Card */}
            <div className="bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl px-4 py-3 flex items-center gap-3 min-w-[140px]">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Target</p>
                <p className="text-sm font-extrabold text-slate-900 dark:text-white">{targetPercent}% minimum</p>
              </div>
            </div>

            {/* Actionable Cushion or Required Classes Card */}
            <div
              className={`rounded-2xl px-4 py-3 border flex items-center gap-3 min-w-[170px] ${
                isShortage
                  ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200'
                  : isBorderline
                  ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200'
                  : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isShortage
                    ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                    : isBorderline
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                    : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                  {isShortage ? 'Recovery Needed' : isBorderline ? 'Zero Cushion' : 'Absence Cushion'}
                </p>
                <p className="text-sm font-black">
                  {hasNoData
                    ? '0 classes'
                    : isShortage
                    ? `+${classesNeeded} ${classesNeeded === 1 ? 'class' : 'classes'} needed`
                    : isBorderline
                    ? '0 classes safe to miss'
                    : `${maxAbsences} ${maxAbsences === 1 ? 'class' : 'classes'} safe`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Actionable Message & Subject Category Quick Filters */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span className="font-medium">
              {hasNoData
                ? 'Mark your class sessions or enter previous baselines to start tracking semester attendance.'
                : isShortage
                ? `Attend the next ${classesNeeded} consecutive ${classesNeeded === 1 ? 'session' : 'sessions'} across your subjects to recover above ${targetPercent}%.`
                : isBorderline
                ? `You are currently on the ${targetPercent}% line. Missing any upcoming class will lower your standing.`
                : `You can safely miss up to ${maxAbsences} weighted ${maxAbsences === 1 ? 'session' : 'sessions'} while remaining above ${targetPercent}%.`}
            </span>
          </div>

          {/* Quick Filter Pill Buttons */}
          {onSelectFilter && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => onSelectFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  activeFilter === 'all'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                All ({subjectCount})
              </button>
              <button
                type="button"
                onClick={() => onSelectFilter('safe')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  activeFilter === 'safe'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                }`}
              >
                Safe ({safeCount})
              </button>
              {borderlineCount > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectFilter('borderline')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                    activeFilter === 'borderline'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                  }`}
                >
                  Borderline ({borderlineCount})
                </button>
              )}
              {shortageCount > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectFilter('shortage')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                    activeFilter === 'shortage'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                  }`}
                >
                  Below 75% ({shortageCount})
                </button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
