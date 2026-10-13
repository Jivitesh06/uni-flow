import React from 'react';
import { Search, ArrowUpDown, Filter, X } from 'lucide-react';
import { Input } from '../ui/input';

export type AttendanceFilterType = 'all' | 'safe' | 'borderline' | 'shortage';
export type AttendanceSortType = 'lowest' | 'highest' | 'name' | 'classes';

interface AttendanceControlsProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterMode: AttendanceFilterType;
  onFilterChange: (mode: AttendanceFilterType) => void;
  sortMode: AttendanceSortType;
  onSortChange: (sort: AttendanceSortType) => void;
  counts: {
    total: number;
    safe: number;
    borderline: number;
    shortage: number;
  };
}

export function AttendanceControls({
  searchQuery,
  onSearchChange,
  filterMode,
  onFilterChange,
  sortMode,
  onSortChange,
  counts,
}: AttendanceControlsProps) {
  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          type="text"
          placeholder="Search subject name or code..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 pr-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter and Sort Group */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Filter Pills */}
        <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 shadow-sm text-xs">
          <button
            type="button"
            onClick={() => onFilterChange('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              filterMode === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All ({counts.total})
          </button>

          <button
            type="button"
            onClick={() => onFilterChange('safe')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              filterMode === 'safe'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Safe ({counts.safe})
          </button>

          {counts.borderline > 0 && (
            <button
              type="button"
              onClick={() => onFilterChange('borderline')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterMode === 'borderline'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Borderline ({counts.borderline})
            </button>
          )}

          <button
            type="button"
            onClick={() => onFilterChange('shortage')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              filterMode === 'shortage'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Below 75% ({counts.shortage})
          </button>
        </div>

        {/* Sort Selector */}
        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 shadow-sm text-xs">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span className="text-slate-400 font-medium hidden sm:inline">Sort:</span>
          <select
            value={sortMode}
            onChange={(e) => onSortChange(e.target.value as AttendanceSortType)}
            className="bg-transparent font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer pr-1"
          >
            <option value="lowest">Lowest %</option>
            <option value="highest">Highest %</option>
            <option value="name">Subject Name</option>
            <option value="classes">Most Classes</option>
          </select>
        </div>
      </div>
    </div>
  );
}
