import { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  FileText,
  UploadCloud,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  History,
  Calendar,
  Layers,
  Sparkles,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RotateCcw,
  Check,
  X,
  Eye,
  Info,
} from 'lucide-react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { PdfTimetableUploadCard } from '../components/timetable/PdfTimetableUploadCard';
import {
  publishSharedTimetable,
  buildSharedGroupId,
  buildSharedGroupLabel,
  computeTimetableContentHash,
  SharedTimetableDoc,
  SharedSlot,
  TimetableGroupParams,
} from '../lib/sharedTimetable';
import { SEEDED_5TH_SEM_TIMETABLES } from '../data/seededSharedTimetables';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import toast from 'react-hot-toast';
import type { TimetableChangeRequest, TimetableSlot } from '../types';

export function AdminPublishPage() {
  const { currentUser, userProfile } = useAuth();
  const { isAdmin, isPublisher, publisherDoc } = useAdminAuth();

  const [activeTab, setActiveTab] = useState<'requests' | 'direct_upload' | 'published_groups'>('requests');
  const [requests, setRequests] = useState<TimetableChangeRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  // Filter states for change requests
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [semesterFilter, setSemesterFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected request modal / review drawer
  const [selectedRequest, setSelectedRequest] = useState<TimetableChangeRequest | null>(null);
  const [reviewNoteInput, setReviewNoteInput] = useState<string>('');
  const [approvingRequestId, setApprovingRequestId] = useState<string | null>(null);
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);

  // Live Firestore published docs state for comparison
  const [livePublishedDocs, setLivePublishedDocs] = useState<Record<string, SharedTimetableDoc>>({});

  // 1. Subscribe to Timetable Change Requests in Firestore
  useEffect(() => {
    if (!currentUser) return;
    setRequestsLoading(true);

    const q = query(
      collection(db, 'timetableChangeRequests'),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimetableChangeRequest));
        setRequests(loaded);
        setRequestsLoading(false);
      },
      (err) => {
        console.warn('Error loading change requests:', err);
        setRequestsLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser]);

  // 2. Load known group timetables from Firestore
  useEffect(() => {
    const knownGroups = [
      'chitkara-university_be-cse_2024_sem5_be-cse-5a',
      'chitkara-university_be-cse_2024_sem5_be-cse-5b',
      'chitkara-university_be-cse_2024_sem5_be-cse-5c',
      'chitkara-university_be-cse_2024_sem5_be-cse-5d',
      'chitkara-university_be-cse_2024_sem5_be-cse-5e',
      'chitkara-university_be-cse_2024_sem5_be-cse-5f',
      'chitkara-university_be-cse_2024_sem5_be-cse-5g',
    ];

    const unsubs = knownGroups.map((gid) =>
      onSnapshot(doc(db, 'sharedTimetables', gid), (snap) => {
        if (snap.exists()) {
          setLivePublishedDocs((prev) => ({
            ...prev,
            [gid]: { id: snap.id, ...snap.data() } as SharedTimetableDoc,
          }));
        }
      })
    );

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  // Filtered requests list
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (sectionFilter !== 'all' && r.section.toUpperCase() !== sectionFilter.toUpperCase()) return false;
      if (semesterFilter !== 'all' && String(r.semester) !== semesterFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = r.submittedByName?.toLowerCase().includes(q);
        const matchesEmail = r.submittedByEmail?.toLowerCase().includes(q);
        const matchesSection = r.section?.toLowerCase().includes(q);
        const matchesDate = r.effectiveDate?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesSection && !matchesDate) return false;
      }
      return true;
    });
  }, [requests, statusFilter, sectionFilter, semesterFilter, searchQuery]);

  // Handle Admin Approval & Publishing of a Student Change Request
  async function handleApproveRequest(request: TimetableChangeRequest) {
    if (!currentUser) return;
    setApprovingRequestId(request.id);

    try {
      const groupParams: TimetableGroupParams = {
        institution: request.institution || 'Chitkara University',
        program: request.program || 'BE-CSE',
        batch: request.batch || '2024',
        semester: request.semester,
        section: request.section,
      };

      // 1. Publish to sharedTimetables/{groupId} in Cloud Firestore
      const publishResult = await publishSharedTimetable(
        db,
        {
          uid: currentUser.uid,
          displayName: userProfile?.displayName || currentUser.displayName || 'Authorized Publisher',
          role: 'publisher',
        },
        groupParams,
        request.slots as SharedSlot[],
        request.effectiveDate
      );

      // 2. Mark request document as approved in Firestore
      await updateDoc(doc(db, 'timetableChangeRequests', request.id), {
        status: 'approved',
        reviewedBy: currentUser.uid,
        reviewedByName: userProfile?.displayName || currentUser.displayName || 'Authorized Publisher',
        reviewedAt: serverTimestamp(),
        reviewNotes: reviewNoteInput.trim() || undefined,
        updatedAt: serverTimestamp(),
      });

      toast.success(
        `Approved & Published Version ${publishResult.version} for Section ${request.section}! All students in this section will receive this update live.`
      );
      setSelectedRequest(null);
      setReviewNoteInput('');
    } catch (err: unknown) {
      console.error('Failed to approve request:', err);
      toast.error(`Approval failed: ${(err as Error).message || 'Server permission denied'}`);
    } finally {
      setApprovingRequestId(null);
    }
  }

  // Handle Admin Rejection of a Student Change Request
  async function handleRejectRequest(request: TimetableChangeRequest) {
    if (!currentUser) return;
    setRejectingRequestId(request.id);

    try {
      await updateDoc(doc(db, 'timetableChangeRequests', request.id), {
        status: 'rejected',
        reviewedBy: currentUser.uid,
        reviewedByName: userProfile?.displayName || currentUser.displayName || 'Authorized Publisher',
        reviewedAt: serverTimestamp(),
        reviewNotes: reviewNoteInput.trim() || 'Rejected by timetable administrator',
        updatedAt: serverTimestamp(),
      });

      toast.success(`Request for Section ${request.section} marked as rejected.`);
      setSelectedRequest(null);
      setReviewNoteInput('');
    } catch (err: unknown) {
      console.error('Failed to reject request:', err);
      toast.error(`Rejection failed: ${(err as Error).message || 'Server error'}`);
    } finally {
      setRejectingRequestId(null);
    }
  }

  // Handle Direct Admin PDF Publishing
  async function handleDirectPublish(
    lectures: any[],
    effectiveDate: string,
    section: string
  ) {
    if (!currentUser) return;

    const groupParams: TimetableGroupParams = {
      institution: 'Chitkara University',
      program: 'BE-CSE',
      batch: '2024',
      semester: 5,
      section,
    };

    const slotsToPublish: SharedSlot[] = lectures.map((l, idx) => ({
      id: `admin_pub_${section.toLowerCase()}_${idx + 1}`,
      subjectCode: l.subjectCode,
      subjectName: l.subjectName,
      faculty: l.faculty,
      room: l.room,
      dayOfWeek: l.dayOfWeek,
      startTime: l.startTime,
      endTime: l.endTime,
      color: '#3b82f6',
      group: l.group || 'ALL',
      requiresReview: l.requiresReview || false,
    }));

    const result = await publishSharedTimetable(
      db,
      {
        uid: currentUser.uid,
        displayName: userProfile?.displayName || currentUser.displayName || 'Authorized Publisher',
        role: 'publisher',
      },
      groupParams,
      slotsToPublish,
      effectiveDate
    );

    if (result.duplicate) {
      toast(result.message, { icon: 'ℹ️' });
    } else {
      toast.success(result.message);
    }
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-gray-900 via-blue-950 to-indigo-950 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-blue-900/40">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Authorized Publisher Panel
              </span>
              <span className="bg-white/10 text-gray-300 px-2.5 py-0.5 rounded-full text-xs font-mono">
                Spark Safe &bull; Zero Paid API
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Shared Timetable Publishing & Review Console
            </h2>
            <p className="text-gray-300 text-xs md:text-sm mt-1 max-w-2xl leading-relaxed">
              Review and approve student-submitted timetable change requests, directly publish official PDF revisions, and maintain section-isolated common schedules.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-4 py-2.5 text-center border border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Pending Submissions</p>
              <p className="text-xl font-black text-amber-400 mt-0.5">{pendingCount}</p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mt-6 pt-4 border-t border-white/10 flex-wrap">
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'requests'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            <Clock className="w-4 h-4" />
            Pending Student Requests
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-400 text-gray-900 font-black">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('direct_upload')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'direct_upload'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            Direct PDF Publisher
          </button>

          <button
            onClick={() => setActiveTab('published_groups')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'published_groups'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            <History className="w-4 h-4" />
            Published Schedules & Versions
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: PENDING STUDENT REQUESTS                                 */}
      {/* ============================================================== */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <Card>
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" /> Status:
                </span>
                {(['pending', 'approved', 'rejected', 'all'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 rounded-full text-xs font-bold capitalize transition-all ${
                      statusFilter === st
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                    }`}
                  >
                    {st === 'pending' ? `Pending (${pendingCount})` : st}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                  <Input
                    placeholder="Search by student, section..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 text-xs h-8 w-48 sm:w-60"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Requests List */}
          {requestsLoading ? (
            <div className="text-center py-20">
              <div className="animate-spin h-8 w-8 rounded-full border-2 border-blue-600 border-t-transparent mx-auto mb-3" />
              <p className="text-xs text-gray-400">Loading student change submissions...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-400 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                No Change Requests Match Filters
              </h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
                {statusFilter === 'pending'
                  ? 'There are currently no pending student timetable change requests waiting for approval.'
                  : 'Try selecting a different filter above.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredRequests.map((req) => {
                const isSelected = selectedRequest?.id === req.id;
                const hasAmbiguity = req.slots.some((s) => s.requiresReview);
                const currentDoc = livePublishedDocs[req.groupId] || SEEDED_5TH_SEM_TIMETABLES[req.groupId];

                return (
                  <Card
                    key={req.id}
                    className={`overflow-hidden transition-all border ${
                      isSelected
                        ? 'ring-2 ring-blue-500 border-blue-500'
                        : 'hover:border-gray-300 dark:hover:border-gray-700'
                    }`}
                  >
                    <CardContent className="p-5">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-base text-gray-900 dark:text-white">
                              Section {req.section}
                            </span>
                            <Badge
                              variant={
                                req.status === 'pending'
                                  ? 'warning'
                                  : req.status === 'approved'
                                  ? 'success'
                                  : 'danger'
                              }
                              className="capitalize text-[10px]"
                            >
                              {req.status}
                            </Badge>
                            {hasAmbiguity && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-900">
                                <AlertTriangle className="w-3 h-3" /> Ambiguous Group Labs
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            <span>
                              👤 Submitted by: <strong>{req.submittedByName || 'Student'}</strong> ({req.submittedByEmail})
                            </span>
                            <span>&bull;</span>
                            <span>
                              📅 Effective: <strong>{req.effectiveDate}</strong>
                            </span>
                            <span>&bull;</span>
                            <span>
                              📚 Total Slots: <strong>{req.slotCount}</strong> ({req.hasGroupScopes ? 'Includes G1/G2' : 'Combined Section'})
                            </span>
                          </div>

                          <p className="text-[11px] text-gray-400">
                            Source Document: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">{req.sourceFilename}</code> &bull; Submitted: {req.createdAt ? format(req.createdAt.toDate(), 'MMM d, yyyy h:mm a') : 'Recent'}
                          </p>

                          {req.reviewNotes && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-xl mt-1">
                              <strong>Admin Note:</strong> {req.reviewNotes}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedRequest(isSelected ? null : req)}
                            className="text-xs"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            {isSelected ? 'Hide Details' : 'Inspect Slots'}
                          </Button>

                          {req.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleApproveRequest(req)}
                                loading={approvingRequestId === req.id}
                                className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                <Check className="w-3.5 h-3.5 mr-1" /> Approve & Publish
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRejectRequest(req)}
                                loading={rejectingRequestId === req.id}
                                className="text-xs text-red-600 hover:bg-red-50 border-red-200"
                              >
                                <X className="w-3.5 h-3.5 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expanded Request Inspector Drawer */}
                      {isSelected && (
                        <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                              Proposed Class Slots for Section {req.section}
                            </h4>
                            <span className="text-[11px] text-gray-400 font-mono">
                              Content Hash: {req.contentHash}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {req.slots.map((s, idx) => (
                              <div
                                key={idx}
                                className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-gray-900 dark:text-white">
                                    {s.subjectCode}
                                  </span>
                                  {s.group && s.group !== 'ALL' && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                                      {s.group}
                                    </span>
                                  )}
                                </div>
                                <p className="text-gray-500 text-[11px] truncate">{s.subjectName}</p>
                                <p className="text-gray-400 text-[10px]">
                                  Day {s.dayOfWeek} &bull; {s.startTime}–{s.endTime} &bull; {s.room || 'Room TBD'}
                                </p>
                              </div>
                            ))}
                          </div>

                          {/* Decision Note Input */}
                          {req.status === 'pending' && (
                            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                              <Input
                                placeholder="Add optional review feedback note for student..."
                                value={reviewNoteInput}
                                onChange={(e) => setReviewNoteInput(e.target.value)}
                                className="text-xs flex-1"
                              />
                              <Button
                                size="sm"
                                onClick={() => handleApproveRequest(req)}
                                loading={approvingRequestId === req.id}
                                className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap"
                              >
                                <Check className="w-3.5 h-3.5 mr-1" /> Publish to Live Shared DB
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: DIRECT PDF PUBLISHER (ADMIN OVERRIDE)                    */}
      {/* ============================================================== */}
      {activeTab === 'direct_upload' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-300 leading-relaxed flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-0.5">Direct Administrator Publishing</p>
              Upload an official university timetable PDF directly. The parser will discover all available sections. You can confirm the target section, review diffs, edit slots, and publish directly to Cloud Firestore.
            </div>
          </div>

          <PdfTimetableUploadCard
            currentSlots={[]}
            disableManualUpload={false}
            skipProfileSectionMatch={true}
            actionButtonLabel="Confirm & Publish to Live Shared DB"
            title="Direct Administrator Timetable Publisher"
            subtitle="Select or drop any official multi-section PDF to publish authoritative schedules"
            onApprove={handleDirectPublish}
          />
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: PUBLISHED SCHEDULES & VERSIONS                           */}
      {/* ============================================================== */}
      {activeTab === 'published_groups' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4 text-blue-600" />
                Active Departmental Timetable Versions (BE-CSE 2024 Batch / Sem 5)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['5A', '5B', '5C', '5D', '5E', '5F', '5G'].map((sec) => {
                  const gid = `chitkara-university_be-cse_2024_sem5_be-cse-${sec.toLowerCase()}`;
                  const liveDoc = livePublishedDocs[gid];
                  const seedDoc = SEEDED_5TH_SEM_TIMETABLES[gid];
                  const active = liveDoc || seedDoc;
                  const isLive = Boolean(liveDoc);

                  return (
                    <div
                      key={sec}
                      className={`p-4 rounded-2xl border transition-all space-y-2 ${
                        isLive
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
                          : 'bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-base text-gray-900 dark:text-white">
                          Section {sec}
                        </span>
                        <Badge variant={isLive ? 'success' : 'default'} className="text-[10px]">
                          {isLive ? `Live Firestore v${liveDoc.version}` : 'Bundled Seed v1'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 pt-1">
                        <div>
                          <span className="text-gray-400 block text-[10px] uppercase font-bold">Effective Date</span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">{active?.effectiveDate || '12-10-2026'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px] uppercase font-bold">Total Slots</span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">{active?.slots?.length || 0} classes</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between text-[11px] text-gray-400">
                        <span className="font-mono truncate max-w-[180px]">{active?.contentHash}</span>
                        {isLive && active.revisionHistory && active.revisionHistory.length > 0 && (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            {active.revisionHistory.length} previous revision(s)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
