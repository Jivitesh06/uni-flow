import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileText,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
  Edit2,
  Trash2,
  Plus,
  RefreshCw,
  Minus,
  Check,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import {
  parseChitkaraPdf,
  computeLectureDiff,
  ExtractedLecture,
  ChitkaraTimetableParseResult,
  TimetableDiffSummary,
  CHITKARA_SUBJECT_NAMES,
} from '../../lib/chitkaraTimetableParser';
import {
  isSectionMatch,
  describeSectionMismatch,
  formatFullSection,
} from '../../lib/collegeEmail';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import type { TimetableSlot, TimetableGroupScope } from '../../types';

interface PdfTimetableUploadCardProps {
  currentSlots: TimetableSlot[];
  userSection?: string;
  userSemester?: number;
  userProgram?: string;
  externalBuffer?: { buffer: ArrayBuffer; name: string; timestamp?: number } | null;
  onApprove: (
    lectures: ExtractedLecture[],
    effectiveDate: string,
    section: string,
    preserveManual: boolean,
    academicScope?: { semester?: number; batch?: string; program?: string }
  ) => Promise<void>;
  onBatchApprove?: (
    allSections: Record<string, ExtractedLecture[]>,
    effectiveDate: string,
    academicScope?: { semester?: number; batch?: string; program?: string }
  ) => Promise<void>;
  disableManualUpload?: boolean;
  actionButtonLabel?: string;
  title?: string;
  subtitle?: string;
  skipProfileSectionMatch?: boolean;
  showMultiSectionPublish?: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function PdfTimetableUploadCard({
  currentSlots,
  userSection,
  userSemester,
  userProgram,
  externalBuffer,
  onApprove,
  onBatchApprove,
  disableManualUpload = true,
  actionButtonLabel,
  title,
  subtitle,
  skipProfileSectionMatch = false,
  showMultiSectionPublish = false,
}: PdfTimetableUploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [batchApproving, setBatchApproving] = useState(false);

  // In-memory file cache
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('');

  // Parse result state
  const [parseResult, setParseResult] = useState<ChitkaraTimetableParseResult | null>(null);
  const [selectedSection, setSelectedSection] = useState<string>(userSection || 'BE-CSE-5A');
  const [editableLectures, setEditableLectures] = useState<ExtractedLecture[]>([]);
  const [effectiveDate, setEffectiveDate] = useState<string>('');
  const [preserveManual, setPreserveManual] = useState<boolean>(true);

  // Explicit Academic Scope Resolution state (distinguishes timetable scope from uploader's profile)
  const [resolvedSemester, setResolvedSemester] = useState<number>(userSemester || 5);
  const [resolvedBatch, setResolvedBatch] = useState<string>('2024');
  const [resolvedProgram, setResolvedProgram] = useState<string>(userProgram || 'BE-CSE');

  // Editing modal state
  const [editingSlot, setEditingSlot] = useState<ExtractedLecture | null>(null);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<{
    subjectCode: string;
    subjectName: string;
    faculty: string;
    room: string;
    startTime: string;
    endTime: string;
    dayOfWeek: number;
    group: TimetableGroupScope;
  }>({
    subjectCode: '',
    subjectName: '',
    faculty: '',
    room: '',
    startTime: '',
    endTime: '',
    dayOfWeek: 1,
    group: 'ALL',
  });

  async function processPdfBuffer(buffer: ArrayBuffer, name: string, sectionTarget?: string) {
    setProcessing(true);
    try {
      const userCanonicalSection = formatFullSection(
        userProgram || 'BE-CSE',
        userSemester || 5,
        userSection || 'A'
      );
      const target = sectionTarget || selectedSection || userCanonicalSection;
      const result = await parseChitkaraPdf(buffer, target, name);

      if (!result.success && result.isScanned) {
        toast.error(
          result.warnings[0] ||
            'Scanned image detected. Selectable text could not be extracted.'
        );
      }

      setParseResult(result);
      if (result.selectedSection) {
        setSelectedSection(result.selectedSection);
      }
      if (typeof result.detectedSemester === 'number') {
        setResolvedSemester(result.detectedSemester);
      }
      if (result.detectedProgram) {
        setResolvedProgram(result.detectedProgram);
      }
      if (result.detectedBatch) {
        setResolvedBatch(result.detectedBatch);
      }
      setEditableLectures(result.lectures);
      setEffectiveDate(result.effectiveDate || result.generationDate || 'Immediate');

      if (result.success) {
        toast.success(
          `Extracted ${result.totalLectures} classes for ${result.selectedSection}!`
        );
      }
    } catch (err: unknown) {
      toast.error(`Error parsing PDF: ${(err as Error).message || 'Invalid format'}`);
    } finally {
      setProcessing(false);
    }
  }

  // Reactive listener for external PDF buffer (e.g. from in-memory Gmail Sync)
  useEffect(() => {
    if (externalBuffer?.buffer) {
      setFileBuffer(externalBuffer.buffer);
      setFileName(externalBuffer.name || 'Gmail_Timetable.pdf');
      processPdfBuffer(externalBuffer.buffer, externalBuffer.name || 'Gmail_Timetable.pdf');
    }
  }, [externalBuffer]);

  function handleFileSelected(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF documents are supported (.pdf)');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('File size exceeds 15 MB limit');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (buffer) {
        setFileBuffer(buffer);
        await processPdfBuffer(buffer, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  }

  async function handleSectionChange(newSec: string) {
    setSelectedSection(newSec);
    if (fileBuffer) {
      await processPdfBuffer(fileBuffer, fileName, newSec);
    }
  }

  function openEditModal(slot: ExtractedLecture) {
    setEditingSlot(slot);
    setEditForm({
      subjectCode: slot.subjectCode,
      subjectName: slot.subjectName,
      faculty: slot.faculty,
      room: slot.room,
      startTime: slot.startTime,
      endTime: slot.endTime,
      dayOfWeek: slot.dayOfWeek,
      group: slot.group || 'ALL',
    });
    setShowEditModal(true);
  }

  function handleSaveEdit() {
    if (!editingSlot) return;
    setEditableLectures((prev) =>
      prev.map((s) =>
        s.id === editingSlot.id
          ? {
              ...s,
              subjectCode: editForm.subjectCode.trim().toUpperCase(),
              subjectName:
                editForm.subjectName.trim() ||
                CHITKARA_SUBJECT_NAMES[editForm.subjectCode.trim().toUpperCase()] ||
                editForm.subjectCode.trim().toUpperCase(),
              faculty: editForm.faculty.trim() || 'Department Faculty',
              room: editForm.room.trim() || 'TBD',
              startTime: editForm.startTime,
              endTime: editForm.endTime,
              dayOfWeek: editForm.dayOfWeek,
              dayName: DAYS[editForm.dayOfWeek],
              group: editForm.group || 'ALL',
            }
          : s
      )
    );
    setShowEditModal(false);
    toast.success('Updated lecture details');
  }

  function handleDeleteSlot(slotId: string) {
    setEditableLectures((prev) => prev.filter((s) => s.id !== slotId));
    toast.success('Removed class from proposal');
  }

  function handleReset() {
    setFileBuffer(null);
    setFileName('');
    setParseResult(null);
    setEditableLectures([]);
  }

  async function handleApproveTimetable() {
    if (editableLectures.length === 0) {
      toast.error('No classes available to import');
      return;
    }

    if (!skipProfileSectionMatch) {
      const isMatched = isSectionMatch(
        selectedSection,
        userSemester || 5,
        userSection || 'A',
        userProgram || 'BE-CSE'
      );
      if (!isMatched) {
        const mismatchMsg = describeSectionMismatch(
          selectedSection,
          userSemester || 5,
          userSection || 'A',
          userProgram || 'BE-CSE'
        );
        toast.error(
          mismatchMsg || 'Cannot import: selected section does not match your academic profile.',
          { duration: 6000 }
        );
        return;
      }
    }

    setApproving(true);
    try {
      await onApprove(editableLectures, effectiveDate, selectedSection, preserveManual, {
        semester: resolvedSemester,
        batch: resolvedBatch,
        program: resolvedProgram,
      });
      toast.success(`Successfully processed timetable for ${selectedSection}!`);
      handleReset();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to update timetable');
    } finally {
      setApproving(false);
    }
  }

  async function handleBatchApproveAllSections() {
    if (!parseResult || !parseResult.allSectionLectures || !onBatchApprove) {
      toast.error('No multi-section dataset available');
      return;
    }

    // Check if any section has unresolved warnings / review items
    const ambiguousSections: string[] = [];
    Object.entries(parseResult.allSectionLectures).forEach(([sec, secSlots]) => {
      if (secSlots.some((s) => s.requiresReview)) {
        ambiguousSections.push(sec);
      }
    });

    if (ambiguousSections.length > 0) {
      const proceed = confirm(
        `Notice: Section(s) [${ambiguousSections.join(', ')}] contain ambiguous group markers (e.g. combined G1/G2). Do you wish to confirm and publish all sections anyway?`
      );
      if (!proceed) return;
    }

    setBatchApproving(true);
    try {
      await onBatchApprove(parseResult.allSectionLectures, effectiveDate, {
        semester: resolvedSemester,
        batch: resolvedBatch,
        program: resolvedProgram,
      });
      toast.success(`Successfully published all ${parseResult.sectionsFound.length} detected sections!`);
      handleReset();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to batch publish sections');
    } finally {
      setBatchApproving(false);
    }
  }

  // Compute diff between active currentSlots and editableLectures
  const diff: TimetableDiffSummary = computeLectureDiff(
    currentSlots,
    editableLectures,
    preserveManual
  );

  return (
    <Card className="border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
      <CardHeader className="border-b border-gray-100 dark:border-gray-800 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              {title || 'Chitkara Timetable PDF Import & Section Isolator'}
            </CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              {subtitle || 'Processes official multi-page PDFs (e.g. 5A through 5G), isolates your section, and checks diffs in-memory'}
            </p>
          </div>
          <Badge variant="info" className="self-start sm:self-auto">
            100% In-Browser &bull; Zero Server Upload
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Upload Dropzone / Coming Soon Card */}
        {!fileBuffer ? (
          disableManualUpload ? (
            <div className="rounded-2xl p-8 text-center border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-sm">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-center gap-2">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                  Manual Timetable PDF Upload
                </h4>
                <Badge variant="default" className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-bold">
                  Coming Soon
                </Badge>
              </div>
              <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
                Manual PDF uploads are temporarily disabled. UniFlow prioritizes automated, zero-friction synchronization via your college Gmail. Connect your college Gmail above to automatically detect, parse, and verify your section&apos;s official timetable.
              </p>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 bg-gray-50/50 dark:bg-gray-800/30'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileSelected(e.target.files[0]);
                  }
                }}
              />
              <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
                <UploadCloud className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                Drop Chitkara Timetable PDF here, or click to browse
              </h4>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                Supports official 7-page PDFs (BE-CSE-5A to 5G). Isolates your specific section automatically.
              </p>
              <div className="flex items-center justify-center gap-3 mt-4 text-[11px] text-gray-400">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Private in memory
                </span>
                <span>&bull;</span>
                <span>Max 15 MB</span>
                <span>&bull;</span>
                <span>Instant preview</span>
              </div>
            </div>
          )
        ) : (
          /* File Loaded Header & Section Switcher */
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{fileName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {parseResult?.generationDate && `Generated: ${parseResult.generationDate} • `}
                    Effective: <span className="font-semibold text-blue-600 dark:text-blue-400">{effectiveDate}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleReset} disabled={approving || batchApproving}>
                  Reset
                </Button>
              </div>
            </div>

            {/* Academic Scope Configuration & Detection Banner */}
            <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-900/40 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Target Academic Scope:
                  </span>
                  <Badge variant="default" className="text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200">
                    {parseResult?.detectedSemester ? 'Auto-Detected from PDF' : 'Explicit Selection Required'}
                  </Badge>
                </div>
                <div className="text-[11px] text-gray-500 font-mono">
                  Target ID: <code className="text-blue-600 font-semibold">{resolvedProgram.toLowerCase()}_{resolvedBatch}_sem{resolvedSemester}_{selectedSection.toLowerCase()}</code>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                    Semester
                  </label>
                  <select
                    value={resolvedSemester}
                    onChange={(e) => setResolvedSemester(Number(e.target.value))}
                    className="w-full h-8 text-xs rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-2 font-semibold"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                      <option key={s} value={s}>
                        Semester {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                    Admission Batch Year
                  </label>
                  <input
                    type="text"
                    value={resolvedBatch}
                    onChange={(e) => setResolvedBatch(e.target.value.trim())}
                    placeholder="e.g. 2024"
                    className="w-full h-8 text-xs rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-2.5 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                    Degree Program
                  </label>
                  <input
                    type="text"
                    value={resolvedProgram}
                    onChange={(e) => setResolvedProgram(e.target.value.trim().toUpperCase())}
                    placeholder="BE-CSE"
                    className="w-full h-8 text-xs rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-2.5 font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* Section Mismatch Alert */}
            {!skipProfileSectionMatch && !isSectionMatch(selectedSection, userSemester || 5, userSection || 'A', userProgram || 'BE-CSE') && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Academic Group Mismatch</p>
                  <p className="mt-0.5">
                    {describeSectionMismatch(selectedSection, userSemester || 5, userSection || 'A', userProgram || 'BE-CSE')}
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    Please select your matching section from the section buttons below before importing.
                  </p>
                </div>
              </div>
            )}

            {/* Section Picker Pill Row */}
            {parseResult && parseResult.sectionsFound.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600" /> Select Your Section To Extract:
                  </label>
                  <span className="text-xs text-gray-500">
                    Found {parseResult.sectionsFound.length} sections in PDF
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {parseResult.sectionsFound.map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => handleSectionChange(sec)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        selectedSection === sec
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                      }`}
                    >
                      {sec}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Parsing Progress / Warnings */}
            {processing && (
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                Extracting lecture timetable and isolating section {selectedSection}...
              </div>
            )}

            {parseResult?.warnings && parseResult.warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                {parseResult.warnings.map((w, i) => (
                  <p key={i} className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}

            {/* Revision Diff Stats Summary Bar */}
            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-gray-700 dark:text-gray-200 mr-1">Timetable Comparison:</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-200/60">
                  <Plus className="w-3 h-3" /> {diff.added.length} Added
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-semibold border border-amber-200/60">
                  <RefreshCw className="w-3 h-3" /> {diff.changed.length} Modified
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 font-semibold border border-red-200/60">
                  <Minus className="w-3 h-3" /> {diff.cancelled.length} Cancelled
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium">
                  <Check className="w-3 h-3" /> {diff.unchanged.length} Unchanged
                </span>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={preserveManual}
                  onChange={(e) => setPreserveManual(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                />
                <span className="text-[11px] font-medium">Preserve manual entries</span>
              </label>
            </div>

            {/* Extracted Lectures List (Editable Table) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Proposed Lectures for {selectedSection} ({editableLectures.length} Total):
                </h4>
                <span className="text-[11px] text-gray-400">Click any row's edit icon to modify fields</span>
              </div>

              {editableLectures.length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-400">
                  No classes detected for section {selectedSection}.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-96 overflow-y-auto pr-1">
                  {editableLectures.map((lec) => (
                    <div
                      key={lec.id}
                      className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="w-1.5 self-stretch rounded-full" style={{ backgroundColor: lec.color || '#3b82f6' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-900 dark:text-white truncate">{lec.subjectName}</p>
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">
                            {lec.subjectCode}
                          </Badge>
                          {lec.group === 'G1' && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-bold">
                              G1
                            </Badge>
                          )}
                          {lec.group === 'G2' && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800 font-bold">
                              G2
                            </Badge>
                          )}
                          {lec.requiresReview && (
                            <Badge variant="warning" className="text-[10px] px-1.5 py-0" title={lec.reviewReason}>
                              Review
                            </Badge>
                          )}
                        </div>
                        <p className="text-gray-500 mt-1 flex items-center gap-2 text-[11px]">
                          <span className="font-semibold text-gray-700 dark:text-gray-300">{DAYS[lec.dayOfWeek]}</span>
                          <span>&bull;</span>
                          <span>{lec.startTime} – {lec.endTime}</span>
                        </p>
                        <p className="text-gray-400 text-[11px] mt-0.5">
                          Room: <span className="font-medium text-gray-600 dark:text-gray-300">{lec.room}</span> &bull; Faculty: <span className="font-medium text-gray-600 dark:text-gray-300">{lec.faculty}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(lec)}
                          className="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                          title="Edit lecture"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlot(lec.id)}
                          className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                          title="Remove lecture"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Approval Decision Card */}
            <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Ready to Apply {selectedSection} Timetable
                </p>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
                  Effective from {effectiveDate}. Past attendance records and logs remain completely safe and untouched.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleReset} disabled={approving || batchApproving}>
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  onClick={handleApproveTimetable}
                  loading={approving}
                  disabled={batchApproving}
                  className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Check className="w-4 h-4 mr-1.5" />
                  {actionButtonLabel || `Approve & Update Section ${selectedSection}`}
                </Button>

                {showMultiSectionPublish && onBatchApprove && parseResult && parseResult.sectionsFound.length > 1 && (
                  <Button
                    size="sm"
                    onClick={handleBatchApproveAllSections}
                    loading={batchApproving}
                    disabled={approving}
                    className="font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                  >
                    <Layers className="w-4 h-4 mr-1.5" />
                    Publish All Detected Sections ({parseResult.sectionsFound.length})
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Edit Extracted Class Details
                </h3>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Subject Code</label>
                    <Input
                      value={editForm.subjectCode}
                      onChange={(e) => setEditForm({ ...editForm, subjectCode: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Group Scope</label>
                    <select
                      value={editForm.group}
                      onChange={(e) => setEditForm({ ...editForm, group: e.target.value as TimetableGroupScope })}
                      className="w-full mt-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    >
                      <option value="ALL">All / Combined</option>
                      <option value="G1">Group 1 (G1)</option>
                      <option value="G2">Group 2 (G2)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Day of Week</label>
                    <select
                      value={editForm.dayOfWeek}
                      onChange={(e) => setEditForm({ ...editForm, dayOfWeek: Number(e.target.value) })}
                      className="w-full mt-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    >
                      {[1, 2, 3, 4, 5, 6].map((d) => (
                        <option key={d} value={d}>{DAYS[d]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Full Subject Name</label>
                    <Input
                      value={editForm.subjectName}
                      onChange={(e) => setEditForm({ ...editForm, subjectName: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Start Time (24h)</label>
                    <Input
                      type="time"
                      value={editForm.startTime}
                      onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">End Time (24h)</label>
                    <Input
                      type="time"
                      value={editForm.endTime}
                      onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Room</label>
                    <Input
                      value={editForm.room}
                      onChange={(e) => setEditForm({ ...editForm, room: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Faculty</label>
                    <Input
                      value={editForm.faculty}
                      onChange={(e) => setEditForm({ ...editForm, faculty: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleSaveEdit}>
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
