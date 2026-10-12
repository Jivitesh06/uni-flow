import { useState } from 'react';
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  Minus,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import type { TimetableRevision } from '../../types';

interface RevisionReviewCardProps {
  revision: TimetableRevision;
  onApply: (revisionId: string) => Promise<void>;
  onReject: (revisionId: string) => Promise<void>;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function RevisionReviewCard({
  revision,
  onApply,
  onReject,
}: RevisionReviewCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [applying, setApplying] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const { added, changed, cancelled, unchanged } = revision.changes || {
    added: [],
    changed: [],
    cancelled: [],
    unchanged: [],
  };

  async function handleApply() {
    setApplying(true);
    try {
      await onApply(revision.id);
      toast.success(`Applied ${revision.weekLabel} timetable!`);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to apply revision.');
    } finally {
      setApplying(false);
    }
  }

  async function handleReject() {
    setRejecting(true);
    try {
      await onReject(revision.id);
      toast.success('Revision dismissed.');
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to reject revision.');
    } finally {
      setRejecting(false);
    }
  }

  const isApplied = revision.status === 'applied';
  const isRejected = revision.status === 'rejected';

  return (
    <Card className={`border-2 transition-all ${
      isApplied
        ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/10'
        : isRejected
        ? 'border-gray-200 dark:border-gray-800 opacity-60'
        : 'border-blue-500/80 dark:border-blue-500/60 shadow-md bg-white dark:bg-gray-900'
    }`}>
      <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-2xl flex-shrink-0 ${
              revision.revisionType === 'revision'
                ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
                : 'bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
            }`}>
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base font-bold text-gray-900 dark:text-white">
                  {revision.weekLabel}
                </CardTitle>
                <Badge variant={revision.revisionType === 'revision' ? 'warning' : 'info'}>
                  {revision.revisionType === 'revision' ? 'Schedule Revision' : 'Weekly Timetable'}
                </Badge>
                {isApplied && <Badge variant="success">Applied</Badge>}
                {isRejected && <Badge variant="default">Rejected</Badge>}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                From: <span className="font-medium text-gray-700 dark:text-gray-300">{revision.sourceSender || 'College Admin'}</span>
                {revision.sourceFilename && ` • Attachment: ${revision.sourceFilename}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Change Stats Summary Chips */}
        <div className="flex items-center gap-2 flex-wrap mt-3 pt-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-200/60 dark:border-emerald-900/40">
            <Plus className="w-3 h-3" /> {added.length} Added
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-semibold border border-amber-200/60 dark:border-amber-900/40">
            <RefreshCw className="w-3 h-3" /> {changed.length} Modified
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 font-semibold border border-red-200/60 dark:border-red-900/40">
            <Minus className="w-3 h-3" /> {cancelled.length} Cancelled
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium">
            <Check className="w-3 h-3" /> {unchanged.length} Unchanged
          </span>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-5 space-y-4">
          {/* Modified / Changed Lectures */}
          {changed.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Modified Lectures
              </h4>
              <div className="space-y-2">
                {changed.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/40 text-xs"
                  >
                    <div className="flex items-center justify-between font-bold text-gray-900 dark:text-white">
                      <span>{DAYS[item.newSlot.dayOfWeek]} • {item.newSlot.startTime}–{item.newSlot.endTime}</span>
                      <span className="text-amber-600 dark:text-amber-400">{item.changeReason}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-gray-600 dark:text-gray-300">
                      <span className="line-through text-gray-400">
                        {item.oldSlot.subjectCode} ({item.oldSlot.room || 'No Room'})
                      </span>
                      <ArrowRight className="w-3 h-3 text-amber-600 flex-shrink-0" />
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {item.newSlot.subjectCode} {item.newSlot.subjectName !== item.newSlot.subjectCode ? `(${item.newSlot.subjectName})` : ''} • {item.newSlot.room ? `Room ${item.newSlot.room}` : 'No Room'} {item.newSlot.faculty ? `• ${item.newSlot.faculty}` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Added Lectures */}
          {added.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Added Lectures
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {added.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/40 text-xs"
                  >
                    <p className="font-bold text-gray-900 dark:text-white">{item.subjectName} ({item.subjectCode})</p>
                    <p className="text-gray-500 mt-0.5">
                      {DAYS[item.dayOfWeek]} • {item.startTime}–{item.endTime}
                      {item.room && ` • Room ${item.room}`}
                      {item.faculty && ` • ${item.faculty}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cancelled Lectures */}
          {cancelled.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400 flex items-center gap-1.5">
                <Minus className="w-3.5 h-3.5" /> Cancelled / Suspended Lectures
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cancelled.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-red-50/70 dark:bg-red-950/30 border border-red-200/70 dark:border-red-900/40 text-xs text-red-900 dark:text-red-300"
                  >
                    <p className="font-bold line-through opacity-80">{item.subjectName} ({item.subjectCode})</p>
                    <p className="text-xs opacity-75">
                      {DAYS[item.dayOfWeek]} • {item.startTime}–{item.endTime}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Footer */}
          {revision.status === 'pending_review' && (
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
              <p className="text-[11px] text-gray-500">
                🔒 Applying updates future lecture timings only. Past attendance records remain strictly intact.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReject}
                  loading={rejecting}
                  disabled={applying}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1 text-red-500" />
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  onClick={handleApply}
                  loading={applying}
                  disabled={rejecting}
                  className="font-bold bg-blue-600 hover:bg-blue-700"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Apply Schedule Revision
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
