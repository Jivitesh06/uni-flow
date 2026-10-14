import React, { useState } from 'react';
import {
  DoorOpen,
  RefreshCw,
  Clock,
  Sparkles,
  AlertTriangle,
  ChevronRight,
  X,
  MapPin,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { FreeClassroomInspectionResult, RoomOccupancyStatus } from '../../lib/roomAvailability';

interface FreeClassroomCardProps {
  inspection: FreeClassroomInspectionResult;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function FreeClassroomCard({
  inspection,
  onRefresh,
  isRefreshing = false,
}: FreeClassroomCardProps) {
  const [showAllModal, setShowAllModal] = useState(false);

  const {
    freeRooms,
    occupiedRooms,
    totalRoomsTracked,
    freeRoomsCount,
    timeFormatted,
    isCoverageComplete,
    coverageWarning,
  } = inspection;

  const displayFreeTiles = freeRooms.slice(0, 4);

  return (
    <>
      <Card className="overflow-hidden border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-gray-900 rounded-3xl shadow-sm transition-all">
        {/* Card Header */}
        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <DoorOpen className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  Free Classrooms
                </CardTitle>
                <p className="text-[11px] text-slate-400 font-medium truncate">
                  {isCoverageComplete
                    ? `${freeRoomsCount} of ${totalRoomsTracked} available right now`
                    : 'Availability checking...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                {timeFormatted}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="h-8 w-8 p-0 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                title="Refresh room availability"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-3 space-y-3">
          {/* Incomplete coverage notice */}
          {!isCoverageComplete && (
            <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-medium">{coverageWarning || 'Some timetable data unavailable — results may be incomplete'}</p>
            </div>
          )}

          {/* 3-4 Room Tiles */}
          {displayFreeTiles.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {displayFreeTiles.map((roomStatus) => {
                const nextCls = roomStatus.nextClass;
                const freeMin = roomStatus.freeDurationMinutes;

                return (
                  <div
                    key={roomStatus.room}
                    className="p-3 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/20 dark:from-emerald-950/20 dark:via-gray-900 dark:to-teal-950/10 shadow-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-black text-slate-900 dark:text-white tracking-tight">
                        {roomStatus.room}
                      </span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </div>

                    <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      Free now
                    </p>

                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate pt-0.5 border-t border-emerald-100/60 dark:border-slate-800">
                      {nextCls ? (
                        <span>Next: {nextCls.startTime}</span>
                      ) : freeMin && freeMin > 0 ? (
                        <span>Free {Math.floor(freeMin / 60) > 0 ? `${Math.floor(freeMin / 60)}h ` : ''}{freeMin % 60}m</span>
                      ) : (
                        <span>Free rest of day</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 bg-slate-50/50 dark:bg-slate-900/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
              <DoorOpen className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                No verified free classrooms right now
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                All tracked academic rooms have ongoing sessions at this hour.
              </p>
            </div>
          )}

          {/* Action to view complete list */}
          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllModal(true)}
              className="w-full h-9 rounded-2xl text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/40 hover:bg-blue-100/50"
            >
              View All Tracked Rooms ({totalRoomsTracked}) <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Complete Room Modal / Drawer */}
      {showAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg max-h-[85vh] bg-white dark:bg-gray-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <DoorOpen className="w-4 h-4 text-blue-600" /> All Classroom Availability
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Verified across Semesters 1, 3 & 5 departmental timetables at {timeFormatted}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAllModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Scrollable list */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 no-scrollbar">
              {/* Available Rooms Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  <span>Available Right Now ({freeRooms.length})</span>
                  <span>Free</span>
                </div>

                {freeRooms.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2 text-center">No classrooms free at this moment.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {freeRooms.map((r) => (
                      <div
                        key={r.room}
                        className="p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center justify-between gap-2"
                      >
                        <div>
                          <p className="font-bold text-sm text-slate-900 dark:text-white">{r.room}</p>
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                            {r.nextClass ? `Next class: ${r.nextClass.startTime}` : 'Free rest of day'}
                          </p>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Occupied Rooms Section */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>Currently In Use ({occupiedRooms.length})</span>
                  <span>Occupied</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {occupiedRooms.map((r) => (
                    <div
                      key={r.room}
                      className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between gap-2 opacity-80"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{r.room}</p>
                        {r.currentClass && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {r.currentClass.subjectCode} ({r.currentClass.section}) • Ends {r.currentClass.endTime}
                          </p>
                        )}
                      </div>
                      <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 text-center">
              Room availability is calculated from published departmental schedules.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
