/**
 * AdminGmailSyncPage.tsx
 *
 * Admin-only status dashboard for the Gmail timetable sync pipeline.
 * Protected by AdminRoute — only authorized publishers can access.
 *
 * Displays:
 * - Gmail connected/disconnected status (derived from sync state in Firestore)
 * - Last successful sync timestamp
 * - Last attempted sync with safe error summary (no credentials exposed)
 * - Messages examined, attachments found, sections published
 * - Current feature flag (live/dry-run) status
 * - Per-section validation reports
 * - Manual "Sync Now" trigger (fires GitHub Actions workflow_dispatch via UI instructions)
 * - Rollback section (shows latest published versions per group)
 *
 * Security:
 * - Never displays OAuth tokens, refresh tokens, or client secrets.
 * - Email body/subject contents are never shown.
 * - Only reads authorizedPublishers/{adminUid} and timetableImportJobs.
 */

import { useState, useEffect } from 'react';
import {
  Mail,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Shield,
  Activity,
  FileText,
  Calendar,
  ChevronDown,
  ChevronUp,
  Info,
  Zap,
  Eye,
} from 'lucide-react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  limit,
} from 'firebase/firestore';
import { format, formatDistanceToNow } from 'date-fns';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncValidationReport {
  filename: string;
  section: string;
  slotCount: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats?: {
    totalSlots: number;
    distinctDays: number;
    g1Slots: number;
    g2Slots: number;
    allSlots: number;
    errorCount: number;
    warningCount: number;
  };
  publishResult?: {
    success: boolean;
    duplicate: boolean;
    dryRun?: boolean;
    version?: number;
    message: string;
  };
}

interface SyncJobRecord {
  id: string;
  uid: string;
  status: 'completed' | 'requires_manual_review' | 'pending';
  source: string;
  mode: 'live' | 'dry_run';
  featureFlagEnabled: boolean;
  syncJobId?: string;
  messagesExamined: number;
  attachmentsFound: number;
  attachmentsProcessed?: number;
  sectionsPublished: Array<{ section: string; version: number; dryRun: boolean }>;
  validationReports: SyncValidationReport[];
  errorSummary?: string;
  durationMs?: number;
  createdAt: { toDate: () => Date } | null;
  updatedAt: { toDate: () => Date } | null;
}

interface GmailSyncState {
  lastHistoryId?: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string | null;
  processedAttachmentHashes?: string[];
  lastJobId?: string;
  totalMessagesExamined?: number;
  updatedAt?: { toDate: () => Date } | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminGmailSyncPage() {
  const { currentUser } = useAuth();
  const { isAdmin, isPublisher, loading: adminLoading } = useAdminAuth();

  const [syncState, setSyncState] = useState<GmailSyncState | null>(null);
  const [syncJobs, setSyncJobs] = useState<SyncJobRecord[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [publisherActive, setPublisherActive] = useState<boolean | null>(null);

  // ── Load publisher doc (sync state) ───────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;

    const publisherRef = doc(db, 'authorizedPublishers', currentUser.uid);
    const unsub = onSnapshot(
      publisherRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setPublisherActive(data?.active !== false);
          setSyncState(data?.gmailSyncState || null);
        } else {
          setPublisherActive(false);
          setSyncState(null);
        }
      },
      (err) => {
        console.warn('Error loading publisher doc:', err);
      }
    );

    return () => unsub();
  }, [currentUser]);

  // ── Load recent sync jobs ──────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    setJobsLoading(true);

    const q = query(
      collection(db, 'timetableImportJobs'),
      where('uid', '==', currentUser.uid),
      where('source', '==', 'email'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SyncJobRecord));
        setSyncJobs(jobs);
        setJobsLoading(false);
      },
      (err) => {
        console.warn('Error loading sync jobs:', err);
        setJobsLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser]);

  // ── Derived status ──────────────────────────────────────────────────────────
  const isGmailConnected = !!syncState?.lastHistoryId;
  const lastSuccess = syncState?.lastSuccessAt
    ? new Date(syncState.lastSuccessAt)
    : null;
  const lastAttempt = syncState?.lastAttemptAt
    ? new Date(syncState.lastAttemptAt)
    : null;
  const lastError = syncState?.lastError || null;

  const latestJob = syncJobs[0] || null;
  const isLiveMode = latestJob?.featureFlagEnabled === true;

  // ─── Render helpers ─────────────────────────────────────────────────────────

  function StatusBadge({ connected }: { connected: boolean }) {
    return connected ? (
      <Badge variant="success" className="flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" />
        Connected
      </Badge>
    ) : (
      <Badge variant="warning" className="flex items-center gap-1">
        <XCircle className="w-3 h-3" />
        Not configured
      </Badge>
    );
  }

  function ModeBadge({ live }: { live: boolean }) {
    return live ? (
      <Badge variant="danger" className="flex items-center gap-1">
        <Zap className="w-3 h-3" />
        LIVE
      </Badge>
    ) : (
      <Badge variant="info" className="flex items-center gap-1">
        <Eye className="w-3 h-3" />
        DRY-RUN
      </Badge>
    );
  }

  function JobStatusBadge({ status }: { status: SyncJobRecord['status'] }) {
    if (status === 'completed') return <Badge variant="success">Completed</Badge>;
    if (status === 'requires_manual_review') return <Badge variant="warning">Needs Review</Badge>;
    return <Badge variant="default">Pending</Badge>;
  }

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!isAdmin && !isPublisher) {
    return (
      <div className="flex items-center justify-center py-16">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-3">
            <Shield className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Access Restricted</h2>
            <p className="text-sm text-gray-500">This page is only accessible to authorized publishers.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            Gmail Timetable Sync
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Admin-only automatic timetable synchronization status
          </p>
        </div>
        <ModeBadge live={isLiveMode} />
      </div>

      {/* ── Status Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Gmail</p>
            <StatusBadge connected={isGmailConnected} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Last Sync</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {lastSuccess
                ? formatDistanceToNow(lastSuccess, { addSuffix: true })
                : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Messages Checked</p>
            <p className="text-2xl font-bold text-blue-600">
              {syncState?.totalMessagesExamined ?? '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Published Jobs</p>
            <p className="text-2xl font-bold text-green-600">
              {syncJobs.filter((j) => j.sectionsPublished?.length > 0).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Feature Flag Notice ───────────────────────────────────────────────── */}
      <Card className={isLiveMode
        ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
        : 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10'}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Info className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isLiveMode ? 'text-red-600' : 'text-blue-600'}`} />
            <div className="space-y-1 text-sm">
              {isLiveMode ? (
                <>
                  <p className="font-semibold text-red-700 dark:text-red-400">
                    ⚡ Live mode is active — timetable writes are enabled.
                  </p>
                  <p className="text-red-600 dark:text-red-400">
                    The GitHub Actions workflow will publish validated timetables automatically.
                    Set <code className="bg-red-100 dark:bg-red-900 px-1 rounded">TIMETABLE_SYNC_ENABLED</code> secret
                    to <code>false</code> in GitHub repo Settings to disable.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-blue-700 dark:text-blue-400">
                    🔒 Dry-run mode — no timetable writes are happening.
                  </p>
                  <p className="text-blue-600 dark:text-blue-400">
                    The sync pipeline validates timetables but does <strong>not</strong> publish them.
                    To enable live sync, set the <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">TIMETABLE_SYNC_ENABLED</code>
                    GitHub secret to <code>true</code> after owner approval.
                  </p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Gmail Connection Details ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />
            Gmail Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Authorized Account</p>
              <p className="font-medium text-gray-900 dark:text-white">
                jivitesh1260.be24@chitkarauniversity.edu.in
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Scope</p>
              <p className="font-mono text-xs text-gray-700 dark:text-gray-300">
                gmail.readonly
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Sender Filter</p>
              <p className="font-medium text-gray-900 dark:text-white">
                office.cse@chitkarauniversity.edu.in
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Subject Filter</p>
              <p className="font-medium text-gray-900 dark:text-white">
                "Time Table:" + has:attachment + filename:pdf
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">History Cursor</p>
              <p className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate">
                {syncState?.lastHistoryId || '— (not set, full search on next run)'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Last Attempt</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {lastAttempt ? format(lastAttempt, 'dd MMM yyyy, HH:mm') : '—'}
              </p>
            </div>
          </div>

          {lastError && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Last Error (safe summary)</p>
              <p className="text-xs text-red-600 dark:text-red-400 font-mono">{lastError}</p>
            </div>
          )}

          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500">
              💡 To trigger a manual sync, go to the{' '}
              <strong>GitHub repository → Actions → Timetable Email Sync → Run workflow</strong>.
              Set "Force dry-run mode" to <code>false</code> only if live sync is approved.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── One-Time Setup Instructions ───────────────────────────────────────── */}
      {!isGmailConnected && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              Gmail OAuth Setup Required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-gray-700 dark:text-gray-300">
              The Gmail sync pipeline requires a one-time OAuth authorization to obtain a refresh token.
              Run the following on your local machine (admin account only):
            </p>
            <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 space-y-1">
              <p># Set your OAuth credentials first</p>
              <p>export GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com</p>
              <p>export GMAIL_CLIENT_SECRET=your-client-secret</p>
              <p></p>
              <p># Run the setup tool</p>
              <p>node scripts/admin-gmail-oauth-setup.mjs</p>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              Then add the printed refresh token as <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">GMAIL_REFRESH_TOKEN</code>{' '}
              in GitHub repo Settings → Secrets → Actions.
            </p>
            <p className="text-xs text-gray-500">
              See <strong>scripts/admin-gmail-oauth-setup.mjs</strong> for full prerequisites.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Sync Job History ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            Sync Job History
            {jobsLoading && (
              <RefreshCw className="w-3 h-3 animate-spin text-gray-400 ml-1" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {syncJobs.length === 0 && !jobsLoading && (
            <div className="text-center py-8 text-gray-400">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No sync jobs yet.</p>
              <p className="text-xs mt-1">Jobs will appear here after the GitHub Actions workflow runs.</p>
            </div>
          )}

          <div className="space-y-3">
            {syncJobs.map((job) => (
              <div
                key={job.id}
                className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden"
              >
                {/* Job header */}
                <button
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                  onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                >
                  <div className="flex items-center gap-3">
                    <JobStatusBadge status={job.status} />
                    <ModeBadge live={job.featureFlagEnabled} />
                    <span className="text-sm text-gray-500">
                      {job.createdAt?.toDate
                        ? format(job.createdAt.toDate(), 'dd MMM, HH:mm')
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{job.messagesExamined} msgs</span>
                    <span>{job.attachmentsFound} PDFs</span>
                    <span className="text-green-600 font-medium">
                      {job.sectionsPublished?.length || 0} published
                    </span>
                    {expandedJobId === job.id
                      ? <ChevronUp className="w-4 h-4" />
                      : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {/* Expanded details */}
                {expandedJobId === job.id && (
                  <div className="border-t border-gray-100 dark:border-gray-800 p-3 space-y-3 text-sm">
                    {/* Error summary */}
                    {job.errorSummary && (
                      <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                        <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-0.5">Error</p>
                        <p className="text-xs text-red-600 dark:text-red-400 font-mono">{job.errorSummary}</p>
                      </div>
                    )}

                    {/* Published sections */}
                    {job.sectionsPublished?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                          Sections Published
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {job.sectionsPublished.map((s, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <Badge variant={s.dryRun ? 'info' : 'success'}>
                                {s.section} v{s.version}{s.dryRun ? ' (dry)' : ''}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Validation reports */}
                    {job.validationReports?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                          Validation Reports
                        </p>
                        <div className="space-y-2">
                          {job.validationReports.map((r, i) => (
                            <div
                              key={i}
                              className={`p-2 rounded border text-xs ${
                                r.valid
                                  ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10'
                                  : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold">
                                  {r.section} — {r.filename}
                                </span>
                                <span className={r.valid ? 'text-green-600' : 'text-red-600'}>
                                  {r.slotCount} slots {r.valid ? '✓' : '✗'}
                                </span>
                              </div>
                              {r.errors?.map((e, ei) => (
                                <p key={ei} className="text-red-600 dark:text-red-400">❌ {e}</p>
                              ))}
                              {r.warnings?.map((w, wi) => (
                                <p key={wi} className="text-amber-600 dark:text-amber-400">⚠️ {w}</p>
                              ))}
                              {r.publishResult && (
                                <p className="text-gray-600 dark:text-gray-400 mt-1">
                                  {r.publishResult.message}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
                      <span>Job ID: {job.syncJobId || job.id}</span>
                      {job.durationMs && <span>Duration: {(job.durationMs / 1000).toFixed(1)}s</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Security Notes ────────────────────────────────────────────────────── */}
      <Card className="border-gray-100 dark:border-gray-800">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>OAuth refresh tokens are stored only as GitHub Actions secrets — never in Firestore or browser storage.</p>
              <p>Email body content, subjects, and attachment bytes are never logged or stored.</p>
              <p>This page reads only your own <code>timetableImportJobs</code> records and the <code>authorizedPublishers</code> sync state.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
