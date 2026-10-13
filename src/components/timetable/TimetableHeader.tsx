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
    <div className="space-y-4">
      {/* Top Banner Row */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              Class Timetable
            </h2>

            {/* Academic Cohort Pill */}
            {(semester || section) && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <GraduationCap className="w-3.5 h-3.5" />
                {program} · Sem {semester || 1} {section ? `(${section})` : ''}
                {batch ? ` · Batch ${batch}` : ''}
              </span>
            )}
          </div>

          <p className="text-xs sm:text-sm text-gray-500 mt-1 flex items-center gap-2">
            <span>{format(currentTime, 'EEEE, MMMM d, yyyy')}</span>
            <span className="text-gray-300 dark:text-gray-700">•</span>
            <span className="font-mono font-medium text-blue-600 dark:text-blue-400">
              {format(currentTime, 'h:mm a')}
            </span>
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={onUploadPdf}
            className="text-xs h-9 border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 hover:bg-blue-50"
          >
            <UploadCloud className="w-4 h-4 mr-1.5 text-blue-600" />
            <span className="hidden sm:inline">Upload PDF /</span> Request Update
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onImportExcel}
            className="text-xs h-9 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" />
            <span className="hidden sm:inline">Import</span> Excel
          </Button>

          <Button size="sm" onClick={onAddSlot} className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Lecture
          </Button>
        </div>
      </div>

      {/* Overview Stat Chips + View Switches */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-1">
        {/* Weekly Stats Summary Chips */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800/80 border border-gray-200/60 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium">
            Weekly: <strong className="text-gray-900 dark:text-white font-bold">{totalClasses}</strong> classes
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
            Lectures: <strong className="font-bold">{lectureCount}</strong>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium">
            Labs: <strong className="font-bold">{labCount}</strong> (2× weight)
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/40 text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            Today: <strong className="font-bold">{todayCount}</strong>
          </div>
        </div>

        {/* View Switch + Subgroup Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Subgroup Filter */}
          <div className="flex rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1 shadow-sm text-xs">
            <button
              onClick={() => onGroupFilterChange('my')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                groupFilter === 'my'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              My Schedule{studentGroup && studentGroup !== 'ALL' ? ` (${studentGroup})` : ''}
            </button>

            <button
              onClick={() => onGroupFilterChange('G1')}
              className={`px-2 py-1 rounded-lg font-semibold transition-all ${
                groupFilter === 'G1'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Group 1
            </button>

            <button
              onClick={() => onGroupFilterChange('G2')}
              className={`px-2 py-1 rounded-lg font-semibold transition-all ${
                groupFilter === 'G2'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Group 2
            </button>

            <button
              onClick={() => onGroupFilterChange('all')}
              className={`px-2 py-1 rounded-lg font-semibold transition-all ${
                groupFilter === 'all'
                  ? 'bg-gray-700 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              All
            </button>
          </div>

          {/* Weekly vs Daily View Selector */}
          <div className="flex rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1 shadow-sm">
            <button
              onClick={() => onViewChange('weekly')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                view === 'weekly'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Weekly
            </button>
            <button
              onClick={() => onViewChange('daily')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                view === 'daily'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" /> Daily
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
