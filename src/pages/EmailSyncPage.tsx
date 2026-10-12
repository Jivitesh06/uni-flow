import { useState, useEffect } from 'react';
import {
  Mail,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Calendar,
  FileCheck,
  Check,
  Sparkles,
  Info,
  Lock,
  LogOut,
  Download,
  AlertTriangle,
  ExternalLink,
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
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { RevisionReviewCard } from '../components/timetable/RevisionReviewCard';
import { PdfTimetableUploadCard } from '../components/timetable/PdfTimetableUploadCard';
import type { ExtractedLecture } from '../lib/chitkaraTimetableParser';
import {
  requestGmailAccessToken,
  verifyGoogleAccount,
  searchTimetableEmails,
  downloadAttachmentBuffer,
  DiscoveredTimetableAttachment,
  DEFAULT_CHITKARA_CSED_SENDER,
  DEFAULT_CHITKARA_SUBJECT_PREFIX,
} from '../lib/gmailSyncClient';
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

  // Client-Side GIS OAuth state (STRICTLY in-memory React state, never saved to localStorage or Firestore)
  const [inMemoryToken, setInMemoryToken] = useState<string | null>(null);
  const [connectedGoogleEmail, setConnectedGoogleEmail] = useState<string | null>(null);
  const [discoveredAttachments, setDiscoveredAttachments] = useState<DiscoveredTimetableAttachment[]>([]);
  const [accountMismatchError, setAccountMismatchError] = useState<string | null>(null);
  const [gmailPdfBuffer, setGmailPdfBuffer] = useState<{
    buffer: ArrayBuffer;
    name: string;
    timestamp: number;
  } | null>(null);

  // Loading states
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);

  // Filter configurations
  const [senderFilter, setSenderFilter] = useState(DEFAULT_CHITKARA_CSED_SENDER);
  const [subjectPrefix, setSubjectPrefix] = useState(DEFAULT_CHITKARA_SUBJECT_PREFIX);

  // Developer-configured OAuth Web Client ID (from environment)
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || '';

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

  /**
   * Primary Gmail Sync Flow:
   * 1. Initiates GIS Token Client popup
   * 2. Receives short-lived access token in memory
   * 3. Verifies token matches registered college email
   * 4. Queries Gmail for office.cse messages with Time Table:
   * 5. Downloads the attachment in memory and feeds into PDF parser
   */
  async function handleConnectAndSyncGmail(overrideToken?: string) {
    const expectedEmail = userProfile?.email || currentUser?.email || '';
    if (!expectedEmail) {
      toast.error('You must be signed in to sync your Gmail account.');
      return;
    }

    if (!googleClientId && !overrideToken) {
      toast(
        'Gmail auto-sync is an optional developer feature. Your official timetable is already synced and active via Shared Timetable.',
        { icon: 'ℹ️', duration: 5000 }
      );
      return;
    }

    setConnecting(true);
    setAccountMismatchError(null);

    let token = overrideToken || inMemoryToken;

    try {
      if (!token) {
        toast('Opening Google Account Picker...', { icon: '🔐' });
        token = await requestGmailAccessToken(googleClientId);
      }

      // 1. Verify account matching
      toast('Verifying college email identity...', { icon: '🔍' });
      const { emailAddress } = await verifyGoogleAccount(token, expectedEmail);

      // Successfully verified
      setInMemoryToken(token);
      setConnectedGoogleEmail(emailAddress);
      setAccountMismatchError(null);

      // 2. Search for Chitkara CSED Timetable emails
      toast.success(`Connected as ${emailAddress}! Scanning mailbox...`);
      setSyncing(true);

      const queryStr = `from:${senderFilter} subject:"${subjectPrefix}" filename:pdf`;
      const attachments = await searchTimetableEmails(token, queryStr);
      setDiscoveredAttachments(attachments);

      if (attachments.length === 0) {
        toast('No emails found matching "' + queryStr + '". Please verify with your CSED coordinator or re-scan after new emails arrive.', {
          icon: 'ℹ️',
          duration: 6000,
        });
      } else {
        toast.success(`Found ${attachments.length} timetable email(s) from CSED Office!`);
        // Automatically download the latest attachment
        const latest = attachments[0];
        await handleLoadAttachment(token, latest);
      }
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Gmail sync failed';
      if (msg.includes('Account mismatch')) {
        setAccountMismatchError(msg);
        setInMemoryToken(null);
        setConnectedGoogleEmail(null);
        toast.error('Account mismatch detected! Sync cancelled for student privacy.', {
          duration: 6000,
        });
      } else {
        toast.error(msg, { duration: 6000 });
      }
    } finally {
      setConnecting(false);
      setSyncing(false);
    }
  }

  /**
   * Downloads a specific discovered attachment into memory and passes it to the parser
   */
  async function handleLoadAttachment(token: string, attachment: DiscoveredTimetableAttachment) {
    setDownloadingAttachmentId(attachment.attachmentId);
    try {
      toast(`Downloading ${attachment.filename}...`, { icon: '📥' });
      const buffer = await downloadAttachmentBuffer(
        token,
        attachment.messageId,
        attachment.attachmentId
      );

      // Pass buffer to PDF parser state
      setGmailPdfBuffer({
        buffer,
        name: attachment.filename,
        timestamp: Date.now(),
      });

      toast.success(
        `Downloaded "${attachment.filename}"! Inspect sections and preview diff below.`
      );
    } catch (err: unknown) {
      toast.error(`Failed to download attachment: ${(err as Error).message}`);
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  /**
   * Clears the short-lived access token from memory
   */
  function handleDisconnectSession() {
    setInMemoryToken(null);
    setConnectedGoogleEmail(null);
    setDiscoveredAttachments([]);
    setAccountMismatchError(null);
    toast.success('Gmail session ended. Access token cleared from memory.');
  }

  async function handleApplyRevision(revisionId: string) {
    try {
      await updateDoc(doc(db, `timetableRevisions/${revisionId}`), {
        status: 'applied',
        appliedAt: serverTimestamp(),
      });
      toast.success('Applied revision!');
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
        source: inMemoryToken ? 'email' : 'pdf',
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
          Timetable Import &amp; Synchronization
        </h2>
        <p className="text-sm text-gray-500">
          Sync directly from your Chitkara college Gmail to automatically detect official timetables, isolate your section, and update classes
        </p>
      </div>

      {/* Shared Timetable Primary Source Banner */}
      <Card className="border-blue-200 dark:border-blue-900/50 bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-white dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-sm">
        <CardContent className="p-4 sm:p-5 flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-sm shrink-0 mt-0.5">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Shared Timetable Active (Primary Source)
              </h3>
              <Badge variant="success" className="text-[10px]">Zero Student Setup</Badge>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              Your official section timetable is provided automatically from the common university database.
              Students do not need to configure Google Cloud Console, enter Google Client IDs, or connect Gmail to view and manage their class timetable.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Account Mismatch Error Banner */}
      {accountMismatchError && (
        <Card className="border-red-300 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs text-red-900 dark:text-red-200 space-y-1">
              <p className="font-bold text-sm text-red-950 dark:text-red-100">
                Google Account Mismatch Detected
              </p>
              <p className="leading-relaxed">{accountMismatchError}</p>
              <p className="text-[11px] text-red-700 dark:text-red-300 pt-1">
                To protect student data privacy, UniFlow strictly ensures that Gmail sync tokens correspond directly to your authenticated college email profile (<code>{userProfile?.email || currentUser?.email}</code>).
              </p>
              <div className="pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleConnectAndSyncGmail()}
                  className="bg-white dark:bg-gray-900 border-red-300 text-red-700 dark:text-red-300 text-xs"
                >
                  Switch Google Account &amp; Retry
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Client-Side Gmail OAuth Sync Card */}
      <Card className="border-blue-100 dark:border-blue-900/40 shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-50/50 to-indigo-50/30 dark:from-blue-950/20 dark:to-indigo-950/10 border-b border-gray-100 dark:border-gray-800 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                <Mail className="w-4 h-4 text-blue-600" />
                Chitkara College Gmail Auto-Sync
              </CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                Searches for messages from <code>{senderFilter}</code> with subject <code>{subjectPrefix}</code>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={inMemoryToken ? 'success' : 'default'} className="text-[11px]">
                {inMemoryToken ? 'In-Memory Session Active' : 'Spark Free Tier (Zero Backend)'}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          {!inMemoryToken ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-600" />
                  Connect Chitkara University Gmail
                </h4>
                <p className="text-xs text-gray-500 max-w-xl leading-relaxed">
                  Uses Google Identity Services with read-only access. The temporary token is stored <strong>strictly in JavaScript RAM</strong> for this session and is never persisted to disk, localStorage, or Firestore.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  onClick={() => handleConnectAndSyncGmail()}
                  loading={connecting || syncing}
                  className="font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                >
                  <Mail className="w-4 h-4 mr-2" /> Connect College Gmail
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">
                        {connectedGoogleEmail}
                      </p>
                      <Badge variant="success" className="text-[10px]">Verified Match</Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Target: <span className="font-semibold text-gray-700 dark:text-gray-300">CSED Office Timetables</span> &bull; Token in RAM only
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleConnectAndSyncGmail(inMemoryToken)}
                    loading={syncing}
                    className="font-semibold"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Re-scan Gmail
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDisconnectSession}
                    className="text-gray-500 hover:text-red-600"
                    title="Clear access token from RAM"
                  >
                    <LogOut className="w-3.5 h-3.5 mr-1" /> End Session
                  </Button>
                </div>
              </div>

              {/* Discovered attachments list */}
              {discoveredAttachments.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Discovered Timetable Attachments ({discoveredAttachments.length})
                    </label>
                    <span className="text-xs text-gray-400">Click to parse into section isolator</span>
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {discoveredAttachments.map((att) => (
                      <div
                        key={att.attachmentId}
                        className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 dark:text-white truncate">
                            {att.filename}
                          </p>
                          <p className="text-gray-500 text-[11px] mt-0.5 truncate">
                            Subject: "{att.subject}" &bull; {att.date}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={downloadingAttachmentId === att.attachmentId}
                          onClick={() => handleLoadAttachment(inMemoryToken, att)}
                          className="shrink-0 font-bold"
                        >
                          <Download className="w-3.5 h-3.5 mr-1" />
                          {downloadingAttachmentId === att.attachmentId ? 'Loading...' : 'Load PDF'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Architecture Status Note */}
          <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-100 dark:border-gray-800">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              100% Free Tier Compatible &bull; Zero Student Configuration &bull; Secure Shared Database
            </span>
            <span className="text-gray-400 font-mono text-[11px]">
              {googleClientId ? 'Admin OAuth Configured' : 'Optional Discovery Mode'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* PDF Timetable Card - Section Isolator & Revision Review (Fed via Gmail Sync) */}
      <PdfTimetableUploadCard
        currentSlots={currentSlots}
        userSection={userProfile?.section}
        userSemester={typeof userProfile?.semester === 'number' ? userProfile.semester : 5}
        userProgram={userProfile?.program || 'BE-CSE'}
        externalBuffer={gmailPdfBuffer}
        disableManualUpload={true}
        onApprove={handleApprovePdfTimetable}
      />

      {/* Shared Timetable Architecture Overview Card */}
      <Card className="border-gray-200 dark:border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-gray-900 dark:text-white">
            <Info className="w-4 h-4 text-blue-600" />
            Timetable Synchronization Architecture
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
          <p>
            UniFlow operates on a shared-timetable-first model designed for frictionless student onboarding:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Instant Common Database:</strong> Timetables for registered sections (e.g. BE-CSE-5A through 5G) are maintained in the central university database and load automatically upon login.
            </li>
            <li>
              <strong>Zero Student Setup:</strong> Students never need to register Google Cloud projects, manage API keys, or configure OAuth credentials.
            </li>
            <li>
              <strong>Optional Departmental Auto-Discovery:</strong> University IT administrators can optionally configure <code>VITE_GOOGLE_CLIENT_ID</code> in the deployment environment to enable direct in-memory email parsing for revision notices.
            </li>
          </ul>
        </CardContent>
      </Card>

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
                      <span className="text-[10px] text-gray-400 uppercase font-bold">
                        Source: {job.source}
                      </span>
                    </div>
                    <p className="text-gray-400 mt-0.5">
                      Subject: "{job.emailSubject || 'Time Table: 5th Semester BE-CSE'}"
                      {job.rawSender && ` • From: ${job.rawSender}`}
                    </p>
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
    </div>
  );
}
