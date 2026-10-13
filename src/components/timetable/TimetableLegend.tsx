import React from 'react';
import { BookOpen, Beaker, Users, Library, Activity } from 'lucide-react';

export function TimetableLegend() {
  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 backdrop-blur-sm p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 text-xs">
        <span className="font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          Schedule Legend:
        </span>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Lecture <span className="text-[10px] text-gray-400 font-normal">(1× weight)</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
              <Beaker className="w-3 h-3 text-emerald-500" />
              Lab / Practical <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">(2× weight)</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
              <Users className="w-3 h-3 text-amber-500" />
              Subgroups <span className="text-[10px] text-gray-400 font-normal">(G1 / G2)</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
              <Library className="w-3 h-3 text-slate-500" />
              Library / Study <span className="text-[10px] text-slate-500 font-normal">(0× weight)</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Activity className="w-3 h-3" />
              Live Now
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
