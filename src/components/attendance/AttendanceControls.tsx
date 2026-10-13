import React from 'react';
import { Search, ArrowUpDown, X } from 'lucide-react';
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
  const onTrackCount = counts.safe + counts.borderline;

  return (
    <div className="space-y-3">
      {/* Search Input & Sort Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            placeholder="Search subjects..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-8 text-xs bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 rounded-2xl h-10 shadow-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl px-3 h-10 shadow-sm text-xs shrink-0">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={sortMode}
            onChange={(e) => onSortChange(e.target.value as AttendanceSortType)}
            className="bg-transparent font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer pr-1 text-xs"
          >
            <option value="lowest">Lowest %</option>
            <option value="highest">Highest %</option>
            <option value="name">Name</option>
            <option value="classes">Classes</option>
          </select>
        </div>
      </div>

      {/* Filter Chips matching the Reference Image */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* All (N) */}
        <button
          type="button"
          onClick={() => onFilterChange('all')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
            filterMode === 'all'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          All ({counts.total})
        </button>

        {/* On Track (N) */}
        <button
          type="button"
          onClick={() => onFilterChange('safe')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
            filterMode === 'safe'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100/60'
          }`}
        >
          On Track ({onTrackCount})
        </button>

        {/* Below 75% (N) */}
        <button
          type="button"
          onClick={() => onFilterChange('shortage')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
            filterMode === 'shortage'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100/60'
          }`}
        >
          Below 75% ({counts.shortage})
        </button>
      </div>
    </div>
  );
}
