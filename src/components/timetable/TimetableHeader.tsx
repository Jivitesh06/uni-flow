import React from 'react';
import {
  Calendar,
  List,
  UploadCloud,
  FileSpreadsheet,
  Plus,
  GraduationCap,
  Sparkles,
  Users,
} from 'lucide-react';
import { Button } from '../ui/button';
import { format } from 'date-fns';

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
  onImportExcel: () => void;
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
  onImportExcel,
  onUploadPdf,
}: TimetableHeaderProps) {
  return (
    <div className="space-y-3">
      {/* Top Bar matching Reference: Icon + Title on left, Today/Week toggle on right */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              Timetable
            </h2>
          </div>
        </div>

        {/* Segmented Pill Switch: Today vs Week */}
        <div className="flex rounded-full bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200/80 dark:border-slate-700/60 shadow-inner">
          <button
            type="button"
            onClick={() => onViewChange('daily')}
            className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all ${
              view === 'daily'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onViewChange('weekly')}
            className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all ${
              view === 'weekly'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Week
          </button>
        </div>
      </div>

      {/* Secondary Row: Cohort Badge, Subgroup Filter, and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-1">
        {/* Subgroup Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {(semester || section) && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
              <GraduationCap className="w-3 h-3" />
              {program} · S{semester || 1}{section ? `-${section}` : ''}
            </span>
          )}

          <div className="flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5 shadow-sm">
            <button
              onClick={() => onGroupFilterChange('my')}
              className={`px-2 py-1 rounded-lg font-semibold transition-all text-[11px] ${
                groupFilter === 'my'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              My Schedule{studentGroup && studentGroup !== 'ALL' ? ` (${studentGroup})` : ''}
            </button>
            <button
              onClick={() => onGroupFilterChange('G1')}
              className={`px-2 py-1 rounded-lg font-semibold transition-all text-[11px] ${
                groupFilter === 'G1'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              G1
            </button>
            <button
              onClick={() => onGroupFilterChange('G2')}
              className={`px-2 py-1 rounded-lg font-semibold transition-all text-[11px] ${
                groupFilter === 'G2'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              G2
            </button>
            <button
              onClick={() => onGroupFilterChange('all')}
              className={`px-2 py-1 rounded-lg font-semibold transition-all text-[11px] ${
                groupFilter === 'all'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onUploadPdf}
            className="text-xs h-8 px-2.5 border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 hover:bg-blue-50"
            title="Upload PDF or request timetable update"
          >
            <UploadCloud className="w-3.5 h-3.5 mr-1 text-blue-600" />
            <span className="hidden md:inline">Request</span> PDF Update
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onImportExcel}
            className="text-xs h-8 px-2.5 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50"
            title="Import timetable from Excel or CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            Import
          </Button>

          <Button
            size="sm"
            onClick={onAddSlot}
            className="text-xs h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
