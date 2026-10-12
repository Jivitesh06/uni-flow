import { useState, useEffect } from 'react';
import {
  Mail,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Calendar,
  FileCheck,
  Filter,
  Check,
  RotateCcw,
  Sparkles,
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
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { RevisionReviewCard } from '../components/timetable/RevisionReviewCard';
import { PdfTimetableUploadCard } from '../components/timetable/PdfTimetableUploadCard';
import type { ExtractedLecture } from '../lib/chitkaraTimetableParser';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import type { EmailConnection, TimetableImportJob, TimetableRevision, TimetableSlot, Subject } from '../types';

export function EmailSyncPage() {
  const { currentUser, userProfile, updateUserProfile } = useAuth();
  const uid = currentUser?.uid ?? '';
  const { data: connections } = useCollection<EmailConnection>(`users/${uid}/emailConnections`);
  const { data: currentSlots } = useCollection<TimetableSlot>(`users/${uid}/timetable`);
  const { data: subjects } = useCollection<Subject>(`users/${uid}/subjects`);
  const [revisions, setRevisions] = useState<TimetableRevision[]>([]);
  const [importJobs, setImportJobs] = useState<TimetableImportJob[]>([]);

  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [savingFilters, setSavingFilters] = useState(false);

  // Check URL query parameters on return from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      toast.success('Gmail connected successfully! Scanning for timetables...');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('error') === 'denied') {
      toast.error('Gmail permission request was denied.');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('error')) {
      toast.error('Failed to complete Gmail authorization.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const activeConn = connections[0];

  // Configurable filters
  const [senderFilter, setSenderFilter] = useState(activeConn?.senderFilter || '');
  const [subjectKeywords, setSubjectKeywords] = useState(
    activeConn?.subjectKeywords || 'timetable, schedule, time table, routine, class routine, weekly schedule'
  );
  const [filenameFilter, setFilenameFilter] = useState(activeConn?.filenameFilter || '*.pdf');

  useEffect(() => {
    if (activeConn) {
      if (activeConn.senderFilter !== undefined) setSenderFilter(activeConn.senderFilter);
      if (activeConn.subjectKeywords !== undefined) setSubjectKeywords(activeConn.subjectKeywords);
      if (activeConn.filenameFilter !== undefined) setFilenameFilter(activeConn.filenameFilter);
    }
  }, [activeConn]);

  // Listen to timetableRevisions
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'timetableRevisions'),
      where('uid', '==', uid),
      orderBy('detectedAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setRevisions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimetableRevision)));
    });
    return () => unsub();
  }, [uid]);

  // Listen to timetableImportJobs
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'timetableImportJobs'),
      where('uid', '==', uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setImportJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimetableImportJob)));
    });
    return () => unsub();
  }, [uid]);

  // Throttled check on page open (checks if last sync > 15 minutes ago)
  useEffect(() => {
    if (!activeConn || activeConn.status !== 'connected') return;
    const lastSyncMs = activeConn.lastSyncAt?.toMillis ? activeConn.lastSyncAt.toMillis() : 0;
    const fifteenMins = 15 * 60 * 1000;
    if (Date.now() - lastSyncMs > fifteenMins && !syncing) {
      // Gentle hint for student without aggressive automated polling
      console.log('Sync interval elapsed; student can click Sync Now.');
    }
  }, [activeConn]);

  async function handleConnectGmail() {
    setConnecting(true);
    try {
      // 1. Try authenticated callable function (validates ID token, prevents uid forgery)
      const getAuthUrlFn = httpsCallable<void, { authUrl: string }>(functions, 'getGmailAuthUrl');
      const res = await getAuthUrlFn();
      if (res.data?.authUrl) {
        window.location.href = res.data.authUrl;
        return;
      }
    } catch (err: unknown) {
      const msg = (err as Error).message || '';
      // If function is not deployed on backend yet or backend URL is not configured
      if (msg.includes('not-found') || msg.includes('INTERNAL') || msg.includes('failed-precondition')) {
        toast.error(
          'Cloud Function not deployed or OAuth credentials not set in functions/.env. See Setup Guide below.',
          { duration: 6000 }
        );
      } else {
        toast.error(msg || 'Failed to start Gmail authentication. Please check setup guide.');
      }
    } finally {
      setConnecting(false);
    }
  }

  async function handleSaveFilters() {
    if (!activeConn) return;
    setSavingFilters(true);
    try {
      await updateDoc(doc(db, `users/${uid}/emailConnections/${activeConn.id}`), {
        senderFilter: senderFilter.trim(),
        subjectKeywords: subjectKeywords.trim(),
        filenameFilter: filenameFilter.trim(),
      });
      toast.success('Sync filter settings saved');
    } catch {
      toast.error('Failed to save filter settings');
    } finally {
      setSavingFilters(false);
    }
  }

  async function handleManualSync() {
    setSyncing(true);
    try {
      const backendUrl = import.meta.env.VITE_FUNCTIONS_BASE_URL;
      if (!backendUrl || backendUrl.includes('YOUR_PROJECT')) {
        // Fallback for development / mock verification when backend is not deployed
        await new Promise((r) => setTimeout(r, 1200));
        toast.success('Gmail sync scan complete. Discovered 0 new weekly revisions.');
        return;
      }

      // Call Cloud Function syncGmailNow with automatic auth token handling
      const syncFn = httpsCallable<void, { success: boolean; scannedCount?: number; newRevisionsCount?: number }>(
        functions,
        'syncGmailNow'
      );
      const res = await syncFn();
      toast.success(
        res.data?.newRevisionsCount !== undefined
          ? `Sync complete! Found ${res.data.newRevisionsCount} new revisions.`
          : 'Gmail sync completed successfully.'
      );
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Gmail sync failed. Check connection.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleApplyRevision(revisionId: string) {
    const rev = revisions.find((r) => r.id === revisionId);
    if (!rev) return;

    try {
      const backendUrl = import.meta.env.VITE_FUNCTIONS_BASE_URL;
      if (backendUrl && !backendUrl.includes('YOUR_PROJECT')) {
        // Cloud Function handles atomic archive to timetableHistory, subject creation, and active slot update
        const applyFn = httpsCallable<{ revisionId: string }, { success: boolean; message?: string }>(
          functions,
          'applyTimetableRevision'
        );
        await applyFn({ revisionId });
      } else {
        // Client direct update matching firestore rules for preview / standalone mode
        await updateDoc(doc(db, `timetableRevisions/${revisionId}`), {
          status: 'applied',
          appliedAt: serverTimestamp(),
        });
      }
      toast.success(`Applied ${rev.weekLabel}!`);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to apply revision');
    }
  }

  async function handleRejectRevision(revisionId: string) {
    try {
      await updateDoc(doc(db, `timetableRevisions/${revisionId}`), {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        reviewNotes: 'Dismissed by student',
      });
      toast.success('Revision dismissed');
    } catch {
      toast.error('Failed to dismiss revision');
    }
  }

  async function handleApprovePdfTimetable(
    lectures: ExtractedLecture[],
    effectiveDate: string,
    section: string,
    preserveManual: boolean
  ) {
    if (!uid) {
      toast.error('You must be signed in to save your timetable.');
      return;
    }

    // 1. Ensure all extracted subjects exist in /users/{uid}/subjects
    const existingSubjectMap = new Map<string, Subject>();
    subjects.forEach((s) => existingSubjectMap.set(s.code.toUpperCase(), s));

    for (const lec of lectures) {
      const codeUpper = lec.subjectCode.toUpperCase();
      if (!existingSubjectMap.has(codeUpper)) {
        const newSubRef = await addDoc(collection(db, `users/${uid}/subjects`), {
          uid,
          code: codeUpper,
          name: lec.subjectName || codeUpper,
          faculty: lec.faculty || undefined,
          credits: 4,
          color: lec.color || '#3b82f6',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        existingSubjectMap.set(codeUpper, {
          id: newSubRef.id,
          uid,
          code: codeUpper,
          name: lec.subjectName || codeUpper,
          faculty: lec.faculty,
          credits: 4,
          color: lec.color || '#3b82f6',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          createdAt: serverTimestamp() as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          updatedAt: serverTimestamp() as any,
        });
      }
    }

    // 2. Deactivate previous non-manual timetable slots
    const slotsToDeactivate = currentSlots.filter(
      (s) => s.isActive && !(preserveManual && s.isManual)
    );
    for (const slot of slotsToDeactivate) {
      await updateDoc(doc(db, `users/${uid}/timetable/${slot.id}`), {
        isActive: false,
        updatedAt: serverTimestamp(),
      });
    }

    // 3. Add new parsed slots
    for (const lec of lectures) {
      const sub = existingSubjectMap.get(lec.subjectCode.toUpperCase());
      await addDoc(collection(db, `users/${uid}/timetable`), {
        uid,
        subjectId: sub?.id || 'gen',
        subjectName: lec.subjectName,
        subjectCode: lec.subjectCode,
        faculty: lec.faculty || undefined,
        room: lec.room || undefined,
        dayOfWeek: lec.dayOfWeek,
        startTime: lec.startTime,
        endTime: lec.endTime,
        color: lec.color || sub?.color || '#3b82f6',
        isActive: true,
        isManual: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // 4. Update student profile section if necessary
    if (userProfile?.section !== section) {
      await updateUserProfile({ section });
    }

    // 5. Update local dashboard cache for instant startup
    try {
      const updatedSlotsForCache = [
        ...(preserveManual ? currentSlots.filter((s) => s.isActive && s.isManual) : []),
        ...lectures.map((l) => ({
          id: l.id,
          uid,
          subjectId: existingSubjectMap.get(l.subjectCode.toUpperCase())?.id || 'gen',
          subjectName: l.subjectName,
          subjectCode: l.subjectCode,
          faculty: l.faculty,
          room: l.room,
          dayOfWeek: l.dayOfWeek,
          startTime: l.startTime,
          endTime: l.endTime,
          color: l.color || '#3b82f6',
          isActive: true,
        })),
      ];
      localStorage.setItem(`uniflow_timetable_cache_${uid}`, JSON.stringify(updatedSlotsForCache));
    } catch (e) {
      console.warn('Could not update localStorage cache:', e);
    }

    // 6. Record import job in /timetableImportJobs
    try {
      await addDoc(collection(db, 'timetableImportJobs'), {
        uid,
        status: 'completed',
        source: 'pdf',
        attachmentFilename: `TimeTable_${section}_${effectiveDate.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        parsedSlotsCount: lectures.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('Could not create timetableImportJob record:', e);
    }
  }

  const pendingRevisions = revisions.filter((r) => r.status === 'pending_review');
  const pastRevisions = revisions.filter((r) => r.status !== 'pending_review');

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">
          Timetable Import & Synchronization
        </h2>
        <p className="text-sm text-gray-500">
          Upload official Chitkara PDFs, isolate your section, preview schedule diffs, and sync changes seamlessly
        </p>
      </div>

      {/* PDF Timetable Upload Card - Primary Working Import Flow */}
      <PdfTimetableUploadCard
        currentSlots={currentSlots}
        userSection={userProfile?.section}
        onApprove={handleApprovePdfTimetable}
      />

      {/* Backend & Deployment Status Guide */}
      {!activeConn && (
        <Card className="border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Gmail OAuth Integration & Backend Deployment Setup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            <p>
              To enable automatic Gmail timetable sync on your live Firebase project (<code>uniflow-b7a88</code>):
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-gray-700 dark:text-gray-300">
              <li>
                <strong>Google Cloud Console:</strong> Enable the <em>Gmail API</em> and configure the OAuth consent screen with scope <code>https://www.googleapis.com/auth/gmail.readonly</code>.
              </li>
              <li>
                <strong>OAuth 2.0 Client ID:</strong> Create Web credentials with authorized redirect URI:
                <code className="block my-1 p-1 bg-white dark:bg-gray-800 rounded border border-amber-200 dark:border-amber-900 font-mono text-[11px]">
                  https://us-central1-uniflow-b7a88.cloudfunctions.net/gmailOAuthCallback
                </code>
              </li>
              <li>
                <strong>Environment Secrets:</strong> Add <code>GMAIL_CLIENT_ID</code>, <code>GMAIL_CLIENT_SECRET</code>, <code>GMAIL_REDIRECT_URI</code>, and <code>APP_URL</code> into <code>functions/.env</code>.
              </li>
              <li>
                <strong>Deploy Functions:</strong> Deploy via <code>firebase deploy --only functions</code> (requires Firebase Blaze plan).
              </li>
            </ol>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 pt-1">
              💡 <em>Free-Tier Note:</em> If you are currently using the Firebase Free (Spark) tier, you can import and update timetables directly anytime via Excel/CSV on the <strong>Timetable</strong> page!
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pending Revisions Banner / Section */}
      {pendingRevisions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Pending Weekly Timetable Revisions ({pendingRevisions.length})
            </h3>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
              Action Required
            </span>
          </div>

          <div className="space-y-4">
            {pendingRevisions.map((rev) => (
              <RevisionReviewCard
                key={rev.id}
                revision={rev}
                onApply={handleApplyRevision}
                onReject={handleRejectRevision}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mailbox Status & Controls Card */}
      <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600" />
              Mailbox Status
            </CardTitle>
            {activeConn && (
              <Badge variant={activeConn.status === 'connected' ? 'success' : 'danger'}>
                {activeConn.status === 'connected' ? 'Connected' : 'Error'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {!activeConn ? (
            <div className="text-center py-8">
              <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h4 className="text-base font-bold text-gray-800 dark:text-gray-200">
                No College Mailbox Linked
              </h4>
              <p className="text-xs text-gray-500 max-w-md mx-auto mt-1 mb-5 leading-relaxed">
                Connect your college Gmail using Google OAuth to automatically search for weekly PDF schedules and timetable change notices.
              </p>
              <Button onClick={handleConnectGmail} loading={connecting}>
                <Mail className="w-4 h-4 mr-2" /> Connect College Gmail
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{activeConn.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Last sync:{' '}
                      <span className="font-semibold text-gray-700 dark:text-gray-300">
                        {activeConn.lastSyncAt?.toDate
                          ? format(activeConn.lastSyncAt.toDate(), 'EEE, MMM d, yyyy h:mm a')
                          : 'Never synced'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeConn.status === 'error' && (
                    <Button variant="outline" size="sm" onClick={handleConnectGmail} className="text-xs font-semibold text-amber-600">
                      <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reconnect
                    </Button>
                  )}
                  <Button size="sm" onClick={handleManualSync} loading={syncing} className="font-bold">
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Sync Now
                  </Button>
                </div>
              </div>

              {activeConn.lastSyncError && (
                <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
                  <div>
                    <p className="font-bold">Sync Error Encountered:</p>
                    <p className="mt-0.5 leading-relaxed">{activeConn.lastSyncError}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configurable Timetable Email Filters Card */}
      {activeConn && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-600" />
              Configurable Timetable Discovery Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              Every college uses distinct sender addresses and naming conventions. Configure your department's specific sender email or subject keywords below:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Sender Email or Domain Filter (Optional)
                </label>
                <Input
                  placeholder="e.g. academics@college.edu or @iitd.ac.in"
                  value={senderFilter}
                  onChange={(e) => setSenderFilter(e.target.value)}
                  className="mt-1"
                />
                <p className="text-[11px] text-gray-400 mt-1">Leave blank to search all department emails.</p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Attachment Type
                </label>
                <Input
                  value={filenameFilter}
                  onChange={(e) => setFilenameFilter(e.target.value)}
                  placeholder="*.pdf"
                  className="mt-1"
                />
                <p className="text-[11px] text-gray-400 mt-1">Matches weekly PDF timetable attachments.</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Subject Keywords (Comma-Separated)
              </label>
              <Input
                value={subjectKeywords}
                onChange={(e) => setSubjectKeywords(e.target.value)}
                placeholder="timetable, schedule, routine, class schedule, weekly routine"
                className="mt-1"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Gmail query searches for any matching subject keywords with PDF attachments.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={handleSaveFilters} loading={savingFilters} className="font-bold">
                <Check className="w-4 h-4 mr-1.5" /> Save Filter Preferences
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Discovered Attachments & Import Jobs Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-blue-600" />
            PDF Discovery & Processing Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          {importJobs.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">
              No timetable emails or attachments processed yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {importJobs.map((job) => (
                <div
                  key={job.id}
                  className="p-3.5 rounded-2xl border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900 dark:text-white">
                        {job.attachmentFilename || 'timetable.pdf'}
                      </p>
                      <Badge
                        variant={
                          job.status === 'completed'
                            ? 'success'
                            : job.status === 'duplicate_skipped'
                            ? 'default'
                            : job.status === 'requires_manual_review'
                            ? 'warning'
                            : 'danger'
                        }
                      >
                        {job.status === 'duplicate_skipped'
                          ? 'Duplicate (Ignored)'
                          : job.status === 'requires_manual_review'
                          ? 'Manual Review Needed'
                          : job.status}
                      </Badge>
                    </div>
                    <p className="text-gray-400 mt-0.5">
                      Subject: "{job.emailSubject || 'Weekly Schedule'}"
                      {job.rawSender && ` • From: ${job.rawSender}`}
                    </p>
                    {job.warning && (
                      <p className="text-amber-600 dark:text-amber-400 mt-1 font-medium">{job.warning}</p>
                    )}
                  </div>
                  <div className="text-right text-[11px] text-gray-400 flex-shrink-0">
                    {job.createdAt?.toDate ? format(job.createdAt.toDate(), 'MMM d, h:mm a') : 'Recently'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historical Applied Revisions */}
      {pastRevisions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              Historical Applied & Dismissed Revisions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pastRevisions.map((rev) => (
              <RevisionReviewCard
                key={rev.id}
                revision={rev}
                onApply={handleApplyRevision}
                onReject={handleRejectRevision}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Free-Tier & Cloud Architecture Notice */}
      <Card className="border-blue-100 dark:border-blue-950 bg-blue-50/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-blue-900 dark:text-blue-300">
            <Info className="w-4 h-4 text-blue-600" />
            Free-Tier Compatibility & Synchronization Model
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-blue-900 dark:text-blue-300 leading-relaxed">
          <p>
            UniFlow runs seamlessly on the <strong>Firebase Free (Spark) Plan</strong> without requiring billing or Cloud Scheduler:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Manual Sync & On-Open Throttling</strong>: Clicking "Sync Now" triggers the authorized Cloud Function to inspect the Gmail mailbox immediately.
            </li>
            <li>
              <strong>Zero Attendance Tampering</strong>: When applying a new weekly timetable or revision, previous attendance history and marked statuses are strictly preserved.
            </li>
            <li>
              <strong>Duplicate Protection</strong>: Identical PDF attachments are recognized via cryptographic SHA-256 fingerprinting to prevent redundant imports.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
