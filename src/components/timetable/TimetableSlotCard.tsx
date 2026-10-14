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
  CheckCircle2,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { timeToMinutes } from '../../lib/timetableCalculations';
import type { TimetableSlot } from '../../types';

interface TimetableSlotCardProps {
  slot: TimetableSlot;
  isToday: boolean;
  currentMinutes: number;
  viewMode?: 'grid' | 'agenda';
  isNextClass?: boolean;
  sessionNumber?: number;
  onEdit?: (slot: TimetableSlot) => void;
  onDelete?: (slot: TimetableSlot) => void;
}

export function TimetableSlotCard({
  slot,
  isToday,
  currentMinutes,
  viewMode = 'grid',
  isNextClass = false,
  sessionNumber,
  onEdit,
  onDelete,
}: TimetableSlotCardProps) {
  const startMins = timeToMinutes(slot.startTime);
  const endMins = timeToMinutes(slot.endTime);
  const durationMins = slot.durationMinutes || (endMins > startMins ? endMins - startMins : 50);

  const isNow = isToday && currentMinutes >= startMins && currentMinutes < endMins;
  const isPast = isToday && currentMinutes >= endMins;
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

  const diffMins = isToday && startMins > currentMinutes ? startMins - currentMinutes : 0;
  const countdownText = diffMins > 0
    ? `In ${Math.floor(diffMins / 60) > 0 ? `${Math.floor(diffMins / 60)}h ` : ''}${diffMins % 60}m`
    : 'Starts soon';

  // Agenda / Daily view matching reference image
  if (viewMode === 'agenda') {
    return (
      <div className="flex items-start gap-3 sm:gap-4 relative group">
        {/* Left Time Column with vertical line */}
        <div className="w-14 sm:w-16 shrink-0 pt-1 text-right">
          <p className="font-bold text-xs text-slate-900 dark:text-white leading-tight font-mono">
            {slot.startTime}
          </p>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
            {slot.endTime}
          </p>
        </div>

        {/* Timeline Axis Node */}
        <div className="flex flex-col items-center shrink-0 self-stretch pt-2">
          <div
            className={`w-3 h-3 rounded-full border-2 ${
              isNow
                ? 'bg-emerald-500 border-white ring-2 ring-emerald-500 shadow-sm animate-pulse'
                : isPast
                ? 'bg-emerald-500 border-white dark:border-slate-900 ring-1 ring-emerald-500/30'
                : isNextClass
                ? 'bg-blue-600 border-white ring-2 ring-blue-500 shadow-sm'
                : 'bg-blue-400 border-white dark:border-slate-900'
            }`}
          />
          <div className="w-0.5 flex-1 bg-slate-200 dark:bg-slate-800 my-1 group-last:hidden" />
        </div>

        {/* Right Session Card */}
        <div
          className={`flex-1 rounded-2xl border transition-all p-4 bg-white dark:bg-gray-900 shadow-sm mb-3 ${
            isNextClass
              ? 'border-2 border-blue-500 shadow-md ring-1 ring-blue-500/20'
              : isNow
              ? 'border-2 border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20'
              : isPast
              ? 'border-slate-100 dark:border-slate-800/80 opacity-80'
              : 'border-slate-100 dark:border-slate-800/80 hover:border-slate-200 dark:hover:border-slate-700'
          }`}
        >
          {/* Header Tags: Live Class vs Upcoming */}
          {isNow ? (
            <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-emerald-100 dark:border-emerald-900/40">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Live Class
              </span>
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                In progress
              </span>
            </div>
          ) : isNextClass ? (
            <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-blue-100 dark:border-blue-900/40">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                Upcoming
              </span>
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                {countdownText}
              </span>
            </div>
          ) : null}

          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                  {slot.subjectCode || slot.subjectName}
                </h4>
                {typeof sessionNumber === 'number' && sessionNumber > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40">
                    Lecture {sessionNumber}
                  </span>
                )}
              </div>

              {slot.subjectName !== slot.subjectCode && (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {slot.subjectName}
                </p>
              )}
            </div>

            {/* Checkmark or status icon */}
            <div className="shrink-0 flex items-center gap-1.5">
              {isPast && (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              )}
              {isNow && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Live
                </span>
              )}
            </div>
          </div>

          {/* Badges: Type & Room */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            {isLab ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Lab (2×)
              </span>
            ) : isNonAcademic ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                Non-Academic
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Lecture
              </span>
            )}

            {slot.room && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {slot.room}
              </span>
            )}

            {slot.group && slot.group !== 'ALL' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                Group {slot.group}
              </span>
            )}

            {slot.faculty && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium ml-auto truncate max-w-[140px]">
                {slot.faculty}
              </span>
            )}
          </div>

          {/* Only Show Prominent Mark Attendance on Live Slot (In Progress) */}
          {isNow && !isNonAcademic && (
            <div className="mt-3 pt-2.5 border-t border-emerald-100 dark:border-emerald-900/40">
              <Link
                to={`/attendance?subject=${encodeURIComponent(slot.subjectId || slot.subjectCode)}&slot=${encodeURIComponent(slot.id)}`}
                className="block"
              >
                <button
                  type="button"
                  className="w-full h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                >
                  <Calendar className="w-3.5 h-3.5 mr-0.5" /> Mark Attendance <ChevronRight className="w-4 h-4" />
                </button>
              </Link>
            </div>
          )}

          {/* Edit / Delete actions for manual slots */}
          {!isShared && (
            <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              {onEdit && (
                <button
                  onClick={() => onEdit(slot)}
                  className="text-slate-400 hover:text-blue-600 flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(slot)}
                  className="text-slate-400 hover:text-red-600 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Delete
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
          </div>
        </div>

        {isNow && (
          <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-white text-emerald-700 font-black uppercase tracking-wider animate-pulse shrink-0 shadow-sm">
            Now
          </span>
        )}
      </div>

      <div className="mt-2 pt-1.5 border-t border-white/20 flex items-center justify-between text-[10px] opacity-95 font-medium">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" /> {slot.startTime}–{slot.endTime}
        </span>
        <span>
          {slot.room ? slot.room : 'TBA'}
        </span>
      </div>

      <div className="text-[10px] opacity-85 mt-1 truncate">
        {slot.faculty ? slot.faculty : ''}
      </div>

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
