import React from 'react';
import {
  UploadCloud,
  Plus,
  GraduationCap,
} from 'lucide-react';
import { Button } from '../ui/button';

export type GroupFilter = 'my' | 'all' | 'G1' | 'G2';
export type TimetableView = 'weekly' | 'daily';

interface TimetableHeaderProps {
  view: TimetableView;
  onViewChange: (view: TimetableView) => void;
  groupFilter: GroupFilter;
  onGroupFilterChange: (group: GroupFilter) => void;
  studentGroup?: string | null;
  semester?: string | number;
  section?: string;
  program?: string;
  batch?: string;
  totalClasses: number;
  lectureCount: number;
  labCount: number;
  todayCount: number;
  currentTime: Date;
  onAddSlot: () => void;
  onImportExcel?: () => void;
  onUploadPdf: () => void;
}

export function TimetableHeader({
  view,
  onViewChange,
  groupFilter,
  onGroupFilterChange,
  studentGroup,
  semester,
  section,
  program = 'BE-CSE',
  batch,
  totalClasses,
  lectureCount,
  labCount,
  todayCount,
  currentTime,
  onAddSlot,
  onUploadPdf,
}: TimetableHeaderProps) {
  return (
    <div className="space-y-3">
      {/* Row 1 — Academic Group and View Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Subgroup Filter Pills & Cohort Badge */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs min-w-0">
          {(semester || section) && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
              <GraduationCap className="w-3 h-3" />
              {program} · S{semester || 1}{section ? `-${section}` : ''}
            </span>
          )}

          <div className="flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5 shadow-xs">
            <button
              onClick={() => onGroupFilterChange('my')}
              className={`px-2 py-1 rounded-lg font-semibold transition-all text-[11px] ${
                groupFilter === 'my'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              My Schedule{studentGroup && studentGroup !== 'ALL' ? ` (${studentGroup})` : ''}
            </button>
            <button
              onClick={() => onGroupFilterChange('G1')}
              className={`px-2 py-1 rounded-lg font-semibold transition-all text-[11px] ${
                groupFilter === 'G1'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              G1
            </button>
            <button
              onClick={() => onGroupFilterChange('G2')}
              className={`px-2 py-1 rounded-lg font-semibold transition-all text-[11px] ${
                groupFilter === 'G2'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              G2
            </button>
            <button
              onClick={() => onGroupFilterChange('all')}
              className={`px-2 py-1 rounded-lg font-semibold transition-all text-[11px] ${
                groupFilter === 'all'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All
            </button>
          </div>
        </div>

        {/* View Switch: Today vs Week */}
        <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200/80 dark:border-slate-700/60 shadow-inner shrink-0">
          <button
            type="button"
            onClick={() => onViewChange('daily')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              view === 'daily'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onViewChange('weekly')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              view === 'weekly'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Week
          </button>
        </div>
      </div>

      {/* Row 2 — Timetable Actions */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:items-center sm:gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onUploadPdf}
          className="w-full sm:w-auto text-xs h-9 px-3 border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-semibold rounded-xl"
          title="Upload PDF or request timetable update"
        >
          <UploadCloud className="w-4 h-4 mr-1.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="truncate">Update Timetable</span>
        </Button>

        <Button
          size="sm"
          onClick={onAddSlot}
          className="w-full sm:w-auto text-xs h-9 px-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl"
        >
          <Plus className="w-4 h-4 mr-1.5 shrink-0" />
          <span className="truncate">Add Class</span>
        </Button>
      </div>
    </div>
  );
}
