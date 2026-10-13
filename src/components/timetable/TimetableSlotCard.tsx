import React from 'react';
import {
  Clock,
  MapPin,
  User,
  ShieldCheck,
  Edit2,
  Trash2,
  Beaker,
  Library,
  Users,
  AlertCircle,
} from 'lucide-react';
import { timeToMinutes } from '../../lib/timetableCalculations';
import { Badge } from '../ui/badge';
import type { TimetableSlot } from '../../types';

interface TimetableSlotCardProps {
  slot: TimetableSlot;
  isToday: boolean;
  currentMinutes: number;
  viewMode?: 'grid' | 'agenda';
  onEdit?: (slot: TimetableSlot) => void;
  onDelete?: (slot: TimetableSlot) => void;
}

export function TimetableSlotCard({
  slot,
  isToday,
  currentMinutes,
  viewMode = 'grid',
  onEdit,
  onDelete,
}: TimetableSlotCardProps) {
  const startMins = timeToMinutes(slot.startTime);
  const endMins = timeToMinutes(slot.endTime);
  const durationMins = slot.durationMinutes || (endMins > startMins ? endMins - startMins : 50);

  const isNow = isToday && currentMinutes >= startMins && currentMinutes < endMins;
  const isPast = isToday && currentMinutes >= endMins;
  const isUpcoming = isToday && currentMinutes < startMins;
  const isShared = !slot.isManual || slot.id.startsWith('shared_');

  // Multi-period lab detection
  const isLab =
    (slot.weight && slot.weight > 1) ||
    (typeof slot.periods === 'number' && slot.periods > 1) ||
    durationMins >= 90 ||
    /lab|practical/i.test(slot.subjectName) ||
    /lab/i.test(slot.subjectCode);

  const isNonAcademic =
    (slot as any).isNonAcademic ||
    (slot as any).isFreePeriod ||
    /^(?:Lib|Library|Free Period)$/i.test(slot.subjectCode) ||
    /^(?:Lib|Library|Free Period)$/i.test(slot.subjectName);

  // Agenda / Daily view
  if (viewMode === 'agenda') {
    return (
      <div
        className={`group relative rounded-2xl border transition-all p-4 sm:p-5 flex items-start sm:items-center gap-4 bg-white dark:bg-gray-900 ${
          isNow
            ? 'border-2 border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-md ring-2 ring-emerald-500/20'
            : isPast
            ? 'border-gray-200/60 dark:border-gray-800 opacity-75'
            : 'border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm'
        }`}
      >
        {/* Color bar indicator */}
        <div
          className="w-2.5 h-16 sm:h-14 rounded-full flex-shrink-0"
          style={{ backgroundColor: slot.color || '#3b82f6' }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            {/* Subject Code Badge */}
            <span className="font-mono font-bold text-xs px-2.5 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200/80 dark:border-gray-700">
              {slot.subjectCode}
            </span>

            {/* Subject Name */}
            {slot.subjectName !== slot.subjectCode && (
              <h4 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white truncate max-w-xs sm:max-w-md">
                {slot.subjectName}
              </h4>
            )}

            {/* Badges */}
            {isLab && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300/80 dark:border-emerald-700">
                <Beaker className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                Lab (2× weight)
              </span>
            )}

            {slot.group === 'G1' && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold border border-amber-300/80 dark:border-amber-700">
                <Users className="w-3 h-3 text-amber-600" />
                Group 1
              </span>
            )}

            {slot.group === 'G2' && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 font-bold border border-purple-300/80 dark:border-purple-700">
                <Users className="w-3 h-3 text-purple-600" />
                Group 2
              </span>
            )}

            {isNonAcademic && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border border-slate-300 dark:border-slate-700">
                <Library className="w-3 h-3 text-slate-500" />
                Non-Academic
              </span>
            )}

            {/* Live status badge */}
            {isNow && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white font-extrabold uppercase tracking-wide animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-white" /> Live Now
              </span>
            )}
            {isPast && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
                Done
              </span>
            )}
            {isUpcoming && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-medium border border-blue-200 dark:border-blue-800">
                Upcoming
              </span>
            )}
          </div>

          {/* Details row: Time, Room, Faculty */}
          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              {slot.startTime} – {slot.endTime}
              <span className="text-[11px] text-gray-400 dark:text-gray-500 font-normal">
                ({durationMins}m)
              </span>
            </span>

            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              {slot.room ? (
                <span className="font-medium text-gray-700 dark:text-gray-300">Room {slot.room}</span>
              ) : (
                <span className="text-gray-400 italic">Room not listed</span>
              )}
            </span>

            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-gray-400" />
              {slot.faculty ? (
                <span className="text-gray-700 dark:text-gray-300">{slot.faculty}</span>
              ) : (
                <span className="text-gray-400 italic">Faculty TBA</span>
              )}
            </span>
          </div>
        </div>

        {/* Action icons / Sync badge */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isShared ? (
            <div
              className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/80 px-2.5 py-1.5 rounded-xl border border-gray-100 dark:border-gray-800"
              title="Official university section timetable"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
              <span className="hidden sm:inline font-medium">Shared</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {onEdit && (
                <button
                  onClick={() => onEdit(slot)}
                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                  title="Edit slot"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(slot)}
                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  title="Delete slot"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Weekly Grid Compact Card
  return (
    <div
      className={`group relative rounded-2xl p-3 text-white transition-all shadow-sm ${
        isNow
          ? 'ring-2 ring-white ring-offset-2 ring-offset-emerald-500 scale-[1.02] shadow-lg'
          : isPast
          ? 'opacity-70 saturate-75'
          : 'hover:shadow-md'
      }`}
      style={{ backgroundColor: slot.color || '#3b82f6' }}
    >
      <div className="flex items-start justify-between gap-1 pr-6">
        <div className="min-w-0">
          <p className="font-black text-xs leading-snug truncate">{slot.subjectName}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {slot.subjectCode !== slot.subjectName && (
              <span className="text-[10px] opacity-95 font-mono font-bold">{slot.subjectCode}</span>
            )}

            {isLab && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/40 text-emerald-100 font-extrabold border border-emerald-300/40 flex items-center gap-0.5">
                <Beaker className="w-2.5 h-2.5" />
                Lab (2×)
              </span>
            )}

            {slot.group === 'G1' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-400/40 text-amber-100 font-bold border border-amber-300/40">
                G1
              </span>
            )}

            {slot.group === 'G2' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-400/40 text-purple-100 font-bold border border-purple-300/40">
                G2
              </span>
            )}

            {isNonAcademic && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-500/40 text-slate-100 font-bold border border-slate-300/40">
                Non-Academic
              </span>
            )}

            {slot.requiresReview && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-400/50 text-red-100 font-bold border border-red-300/50"
                title={slot.reviewReason || 'Review Required'}
              >
                Review
              </span>
            )}
          </div>
        </div>

        {isNow && (
          <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-white text-emerald-700 font-black uppercase tracking-wider animate-pulse flex-shrink-0 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Now
          </span>
        )}
        {isPast && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/20 text-white font-semibold">
            Done
          </span>
        )}
      </div>

      {/* Time & Room */}
      <div className="mt-2 pt-1.5 border-t border-white/20 flex items-center justify-between text-[10px] opacity-95 font-medium">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" /> {slot.startTime}–{slot.endTime}
        </span>
        <span>
          {slot.room ? `📍 ${slot.room}` : <span className="opacity-70 italic">📍 No room</span>}
        </span>
      </div>

      {/* Faculty */}
      <div className="text-[10px] opacity-85 mt-1 truncate">
        {slot.faculty ? (
          <span>👤 {slot.faculty}</span>
        ) : (
          <span className="opacity-70 italic">👤 Faculty TBA</span>
        )}
      </div>

      {/* Quick edit / delete actions on hover */}
      <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1 bg-black/40 backdrop-blur-md rounded-lg p-1">
        {isShared ? (
          <span title="Official university timetable" className="p-1 text-white/80">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-300" />
          </span>
        ) : (
          <>
            {onEdit && (
              <button
                onClick={() => onEdit(slot)}
                className="p-1 hover:bg-white/20 rounded text-white transition-colors"
                title="Edit slot"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(slot)}
                className="p-1 hover:bg-white/20 rounded text-red-300 transition-colors"
                title="Delete slot"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
