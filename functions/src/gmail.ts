import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { google } from 'googleapis';
import type { Request, Response } from 'express';
import {
  parsePdfBuffer,
  computeBufferHash,
  ParsedLectureSlot,
} from './pdfTimetableParser';
import type {
  TimetableSlot,
  TimetableRevision,
  TimetableImportJob,
} from './types';

const db = admin.firestore();

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
];

function getOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Gmail OAuth credentials not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REDIRECT_URI in function environment variables.');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Step 1 (Authenticated Callable - Recommended): Securely generate OAuth URL
 * Verifies caller's Firebase ID token so client uid cannot be forged.
 */
export const getGmailAuthUrl = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in to connect Gmail');
  }

  const uid = context.auth.uid;

  try {
    const oauth2Client = getOAuth2Client();
    const state = Buffer.from(
      JSON.stringify({ uid, ts: Date.now() })
    ).toString('base64');

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GMAIL_SCOPES,
      state,
      prompt: 'consent',
    });

    return { authUrl };
  } catch (err: unknown) {
    functions.logger.error('Failed to generate Gmail OAuth URL:', err);
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Gmail OAuth credentials not configured on backend. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REDIRECT_URI in functions/.env.'
    );
  }
});

/**
 * Step 1 (HTTP Request fallback with token/uid validation): Initiate Gmail OAuth flow
 */
export const gmailOAuthStart = functions.https.onRequest(async (req: Request, res: Response) => {
  try {
    let uid = req.query.uid as string;

    // If an idToken query or authorization header is provided, verify it cryptographically
    const authHeader = req.headers.authorization;
    const idToken = (req.query.idToken as string) || (authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null);

    if (idToken) {
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        uid = decoded.uid;
      } catch (tokenErr) {
        functions.logger.warn('Invalid ID token provided to gmailOAuthStart:', tokenErr);
        res.status(401).json({ error: 'Invalid authentication token' });
        return;
      }
    }

    if (!uid) {
      res.status(400).json({ error: 'Missing authenticated user identifier' });
      return;
    }

    const state = Buffer.from(JSON.stringify({ uid, ts: Date.now() })).toString('base64');
    const oauth2Client = getOAuth2Client();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GMAIL_SCOPES,
      state,
      prompt: 'consent',
    });

    res.redirect(authUrl);
  } catch (err: unknown) {
    functions.logger.error('Gmail OAuth start error:', err);
    res.status(500).json({ error: 'Gmail OAuth not configured. See README for setup instructions.' });
  }
});

/**
 * Step 2: Handle OAuth callback
 */
export const gmailOAuthCallback = functions.https.onRequest(async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    if (error) {
      functions.logger.warn('Gmail OAuth denied:', error);
      res.redirect(`${process.env.APP_URL}/email-sync?error=denied`);
      return;
    }

    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state' });
      return;
    }

    let uid: string;
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      uid = stateData.uid;
      if (Date.now() - stateData.ts > 600_000) {
        throw new Error('State expired');
      }
    } catch {
      res.status(400).json({ error: 'Invalid state parameter' });
      return;
    }

    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const gmailEmail = profile.data.emailAddress;

    const connRef = db
      .collection('users')
      .doc(uid)
      .collection('emailConnections')
      .doc();

    const connectionData = {
      uid,
      email: gmailEmail,
      provider: 'gmail',
      status: 'connected',
      historyId: profile.data.historyId,
      senderFilter: '',
      subjectKeywords: 'timetable, schedule, time table, routine, class routine, weekly schedule',
      filenameFilter: '*.pdf',
      lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSyncStatus: 'success',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await connRef.set(connectionData);

    // Securely store the sensitive refresh token in a private server-only subcollection
    // Completely restricted from client reads and writes via firestore.rules
    await db
      .collection('users')
      .doc(uid)
      .collection('emailSecrets')
      .doc(connRef.id)
      .set({
        uid,
        connectionId: connRef.id,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiry: tokens.expiry_date ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await db.collection('auditLogs').add({
      type: 'gmail_connected',
      uid,
      email: gmailEmail,
      connectionId: connRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    functions.logger.info(`Gmail connected for uid ${uid}, email ${gmailEmail}`);
    res.redirect(`${process.env.APP_URL}/email-sync?success=true`);
  } catch (err: unknown) {
    functions.logger.error('Gmail OAuth callback error:', err);
    res.redirect(`${process.env.APP_URL}/email-sync?error=callback_failed`);
  }
});

/**
 * Callable: Manually trigger Gmail sync for the authenticated user
 */
export const syncGmailNow = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const uid = context.auth.uid;

  try {
    const result = await performGmailSync(uid);
    return { success: true, ...result };
  } catch (err: unknown) {
    const message = (err as Error).message;
    functions.logger.error(`Gmail sync failed for ${uid}:`, err);
    throw new functions.https.HttpsError('internal', message || 'Sync failed.');
  }
});

/**
 * Core Gmail sync logic: searches messages, downloads PDFs, hashes attachments,
 * parses timetable slots, diffs against existing schedules, and queues revisions.
 */
export async function performGmailSync(uid: string): Promise<{
  scannedCount: number;
  newRevisionsCount: number;
  duplicateCount: number;
}> {
  const connectionsSnap = await db
    .collection('users')
    .doc(uid)
    .collection('emailConnections')
    .where('status', '==', 'connected')
    .where('provider', '==', 'gmail')
    .limit(1)
    .get();

  if (connectionsSnap.empty) {
    throw new Error('No connected Gmail account found. Please connect your Gmail first.');
  }

  const connDoc = connectionsSnap.docs[0];
  const conn = connDoc.data();
  const connId = connDoc.id;

  // Retrieve refresh token from private server-only emailSecrets subcollection
  const secretDoc = await db
    .collection('users')
    .doc(uid)
    .collection('emailSecrets')
    .doc(connId)
    .get();

  let refreshToken: string | null = null;
  let tokenExpiry: number | null = null;

  if (secretDoc.exists) {
    const secretData = secretDoc.data() || {};
    refreshToken = secretData.refreshToken || null;
    tokenExpiry = secretData.tokenExpiry || null;
  } else if (conn._refreshToken) {
    // Zero-downtime auto-migration:
    // Move legacy token into private emailSecrets and purge from emailConnections
    refreshToken = conn._refreshToken;
    tokenExpiry = conn._tokenExpiry || null;

    await db
      .collection('users')
      .doc(uid)
      .collection('emailSecrets')
      .doc(connId)
      .set({
        uid,
        connectionId: connId,
        refreshToken,
        tokenExpiry,
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // Strip legacy sensitive fields from public-readable emailConnections document
    await connDoc.ref.update({
      _refreshToken: admin.firestore.FieldValue.delete(),
      _tokenExpiry: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    functions.logger.info(`Auto-migrated legacy token to private emailSecrets for uid ${uid}`);
  }

  if (!refreshToken) {
    await connDoc.ref.update({
      status: 'error',
      lastSyncError: 'Gmail authorization expired. Please reconnect your account.',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw new Error('Gmail authorization has expired or was revoked. Please reconnect.');
  }

  // Fetch student profile for section and semester filtering
  const userDoc = await db.collection('users').doc(uid).get();
  const userData = userDoc.data() || {};
  const userProfile = {
    semester: userData.semester,
    section: userData.section,
    college: userData.college,
  };

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  // Listen for rotated or refreshed tokens and save to private emailSecrets
  oauth2Client.on('tokens', async (newTokens) => {
    if (newTokens.refresh_token) {
      try {
        await db
          .collection('users')
          .doc(uid)
          .collection('emailSecrets')
          .doc(connId)
          .set(
            {
              refreshToken: newTokens.refresh_token,
              tokenExpiry: newTokens.expiry_date ?? null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        functions.logger.info(`Persisted rotated refresh token in emailSecrets for uid ${uid}`);
      } catch (err) {
        functions.logger.warn(`Failed to update rotated token in emailSecrets for ${uid}:`, err);
      }
    }
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Build dynamic search query from user configuration
  const defaultKeywords = 'timetable, schedule, time table, routine, class routine, weekly schedule';
  const rawKeywords = conn.subjectKeywords || defaultKeywords;
  const keywordList = rawKeywords
    .split(',')
    .map((k: string) => k.trim())
    .filter(Boolean);

  const subjectClause = keywordList.length > 0
    ? `(${keywordList.map((k: string) => `subject:"${k}"`).join(' OR ')})`
    : `subject:timetable`;

  let searchQuery = `has:attachment filename:pdf ${subjectClause}`;
  if (conn.senderFilter && conn.senderFilter.trim()) {
    searchQuery += ` from:${conn.senderFilter.trim()}`;
  }

  functions.logger.info(`Searching Gmail for uid ${uid} with query: [${searchQuery}]`);

  let messageList;
  try {
    messageList = await gmail.users.messages.list({
      userId: 'me',
      q: searchQuery,
      maxResults: 15,
    });
  } catch (err: unknown) {
    const errorMsg = (err as Error).message;
    await connDoc.ref.update({
      lastSyncStatus: 'failure',
      lastSyncError: errorMsg,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw new Error(`Gmail API query failed: ${errorMsg}`);
  }

  const messages = messageList.data.messages ?? [];
  let scannedCount = 0;
  let newRevisionsCount = 0;
  let duplicateCount = 0;

  // Retrieve current active timetable slots for diffing
  const activeTimetableSnap = await db
    .collection('users')
    .doc(uid)
    .collection('timetable')
    .where('isActive', '==', true)
    .get();

  const currentSlots: ParsedLectureSlot[] = activeTimetableSnap.docs.map(d => {
    const data = d.data();
    return {
      subjectName: data.subjectName,
      subjectCode: data.subjectCode,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      faculty: data.faculty,
      room: data.room,
    };
  });

  // Load existing hashes to prevent re-processing identical PDF attachments
  const existingJobsSnap = await db
    .collection('timetableImportJobs')
    .where('uid', '==', uid)
    .get();

  const processedHashes = new Set<string>();
  existingJobsSnap.docs.forEach(d => {
    const hash = d.data().attachmentHash;
    if (hash) processedHashes.add(hash);
  });

  for (const msgRef of messages) {
    if (!msgRef.id) continue;
    scannedCount++;

    const fullMsg = await gmail.users.messages.get({
      userId: 'me',
      id: msgRef.id,
      format: 'full',
    });

    const headers = fullMsg.data.payload?.headers || [];
    const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
    const subject = getHeader('Subject');
    const from = getHeader('From');
    const dateStr = getHeader('Date');

    // Recursively collect all PDF parts
    const pdfParts: Array<{ filename: string; attachmentId: string }> = [];
    function inspectParts(parts?: any[]) {
      if (!parts) return;
      for (const part of parts) {
        if (
          part.body?.attachmentId &&
          (part.mimeType === 'application/pdf' || (part.filename && part.filename.toLowerCase().endsWith('.pdf')))
        ) {
          pdfParts.push({
            filename: part.filename || 'timetable.pdf',
            attachmentId: part.body.attachmentId,
          });
        }
        if (part.parts) {
          inspectParts(part.parts);
        }
      }
    }
    inspectParts(fullMsg.data.payload?.parts);

    for (const pdfPart of pdfParts) {
      // Download attachment content
      const attachResp = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: msgRef.id,
        id: pdfPart.attachmentId,
      });

      const base64Data = attachResp.data.data;
      if (!base64Data) continue;

      const pdfBuffer = Buffer.from(base64Data, 'base64url');
      const attachmentHash = computeBufferHash(pdfBuffer);

      // Duplicate Check
      if (processedHashes.has(attachmentHash)) {
        duplicateCount++;
        functions.logger.info(`Skipping duplicate PDF attachment: ${pdfPart.filename} (${attachmentHash})`);
        continue;
      }

      processedHashes.add(attachmentHash);

      // Parse PDF Text & Metadata
      const parseResult = await parsePdfBuffer(pdfBuffer, userProfile, currentSlots);

      if (!parseResult.success) {
        // Scanned or unreadable PDF
        await db.collection('timetableImportJobs').add({
          uid,
          status: 'requires_manual_review',
          source: 'email',
          emailMessageId: msgRef.id,
          threadId: fullMsg.data.threadId,
          attachmentFilename: pdfPart.filename,
          attachmentHash,
          rawSender: from,
          emailSubject: subject,
          warning: parseResult.warning,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await db.collection('users').doc(uid).collection('notifications').add({
          uid,
          type: 'sync_failure',
          title: 'Manual Review Needed: Scanned Timetable',
          body: `Received "${pdfPart.filename}" from ${from}, but text could not be extracted automatically. Please verify your schedule manually.`,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        continue;
      }

      // Convert extracted slots to TimetableSlot format
      const proposedSlots: TimetableSlot[] = parseResult.extractedSlots.map(s => ({
        uid,
        subjectId: '', // Resolved upon approval
        subjectName: s.subjectName,
        subjectCode: s.subjectCode,
        faculty: s.faculty,
        room: s.room,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        color: '#2563eb',
        isActive: true,
      }));

      // Create Timetable Revision Document for student review
      const revRef = await db.collection('timetableRevisions').add({
        uid,
        status: 'pending_review',
        revisionType: parseResult.revisionType,
        weekLabel: parseResult.weekLabel || 'Weekly Update',
        effectiveDate: parseResult.effectiveDate || null,
        detectedSection: parseResult.detectedSection || null,
        attachmentHash,
        sourceFilename: pdfPart.filename,
        sourceEmailSubject: subject,
        sourceSender: from,
        changes: parseResult.diff || { added: [], changed: [], cancelled: [], unchanged: [] },
        proposedSlots,
        detectedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      newRevisionsCount++;

      // Create Import Job Document
      await db.collection('timetableImportJobs').add({
        uid,
        status: 'completed',
        source: 'email',
        emailMessageId: msgRef.id,
        threadId: fullMsg.data.threadId,
        attachmentFilename: pdfPart.filename,
        attachmentHash,
        rawSender: from,
        emailSubject: subject,
        parsedSlotsCount: proposedSlots.length,
        revisionId: revRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Notify the student about the discovered timetable
      await db.collection('users').doc(uid).collection('notifications').add({
        uid,
        type: 'timetable_revision',
        title: `Weekly Timetable Detected: ${parseResult.weekLabel}`,
        body: `Discovered schedule in email "${subject}" with ${proposedSlots.length} lecture slots. Review and apply changes.`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  // Update connection with successful sync status
  await connDoc.ref.update({
    lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSyncStatus: 'success',
    lastSyncError: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { scannedCount, newRevisionsCount, duplicateCount };
}

/**
 * Callable: Apply a reviewed timetable revision
 * Archives current schedule to history, applies proposed slots,
 * and leaves historical attendance records completely untouched!
 */
export const applyTimetableRevision = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const uid = context.auth.uid;
  const { revisionId } = data as { revisionId: string };

  if (!revisionId) {
    throw new functions.https.HttpsError('invalid-argument', 'revisionId is required');
  }

  const revRef = db.collection('timetableRevisions').doc(revisionId);
  const revSnap = await revRef.get();

  if (!revSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Revision record not found');
  }

  const revData = revSnap.data() as TimetableRevision;
  if (revData.uid !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'Unauthorized access to revision');
  }

  if (revData.status === 'applied') {
    return { success: true, message: 'Revision already applied.' };
  }

  // 1. Fetch current active slots
  const currentSlotsSnap = await db
    .collection('users')
    .doc(uid)
    .collection('timetable')
    .where('isActive', '==', true)
    .get();

  const currentSlots = currentSlotsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 2. Archive current schedule into timetableHistory
  await db
    .collection('users')
    .doc(uid)
    .collection('timetableHistory')
    .add({
      uid,
      revisionId,
      weekLabel: revData.weekLabel,
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      slots: currentSlots,
    });

  // 3. Match or create subjects for proposed slots
  const subjectsSnap = await db.collection('users').doc(uid).collection('subjects').get();
  const subjectMap = new Map<string, string>();
  subjectsSnap.docs.forEach(d => {
    const s = d.data();
    subjectMap.set(s.code.toUpperCase(), d.id);
    subjectMap.set(s.name.toLowerCase(), d.id);
  });

  const batch = db.batch();

  // Deactivate old slots
  currentSlotsSnap.docs.forEach(docSnap => {
    batch.update(docSnap.ref, { isActive: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });

  // Insert proposed new slots
  const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
  for (const proposed of revData.proposedSlots) {
    let subId = subjectMap.get(proposed.subjectCode.toUpperCase()) || subjectMap.get(proposed.subjectName.toLowerCase());

    if (!subId) {
      // Auto-create subject
      const newSubRef = db.collection('users').doc(uid).collection('subjects').doc();
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      batch.set(newSubRef, {
        uid,
        name: proposed.subjectName,
        code: proposed.subjectCode,
        faculty: proposed.faculty || null,
        credits: 3,
        color,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      subId = newSubRef.id;
      subjectMap.set(proposed.subjectCode.toUpperCase(), subId);
    }

    const slotRef = db.collection('users').doc(uid).collection('timetable').doc();
    batch.set(slotRef, {
      uid,
      subjectId: subId,
      subjectName: proposed.subjectName,
      subjectCode: proposed.subjectCode,
      faculty: proposed.faculty || null,
      room: proposed.room || null,
      dayOfWeek: proposed.dayOfWeek,
      startTime: proposed.startTime,
      endTime: proposed.endTime,
      color: proposed.color || '#2563eb',
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // 4. Update revision status to applied
  batch.update(revRef, {
    status: 'applied',
    appliedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 5. Audit Log (Past attendance is NEVER touched or modified)
  const auditRef = db.collection('auditLogs').doc();
  batch.set(auditRef, {
    type: 'timetable_revision_applied',
    uid,
    revisionId,
    weekLabel: revData.weekLabel,
    slotsCount: revData.proposedSlots.length,
    appliedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  functions.logger.info(`Timetable revision ${revisionId} applied successfully for uid ${uid}`);
  return { success: true };
});

/**
 * Callable: Reject a timetable revision
 */
export const rejectTimetableRevision = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const uid = context.auth.uid;
  const { revisionId, reason } = data as { revisionId: string; reason?: string };

  const revRef = db.collection('timetableRevisions').doc(revisionId);
  const revSnap = await revRef.get();

  if (!revSnap.exists || revSnap.data()?.uid !== uid) {
    throw new functions.https.HttpsError('not-found', 'Revision record not found');
  }

  await revRef.update({
    status: 'rejected',
    rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
    reviewNotes: reason || 'Rejected by student',
  });

  return { success: true };
});

/**
 * Trigger: When an emailConnection is deleted by a student, automatically
 * delete the corresponding sensitive emailSecrets record.
 */
export const onEmailConnectionDeleted = functions.firestore
  .document('users/{uid}/emailConnections/{connId}')
  .onDelete(async (_snap, context) => {
    const { uid, connId } = context.params;
    try {
      await db
        .collection('users')
        .doc(uid)
        .collection('emailSecrets')
        .doc(connId)
        .delete();
      functions.logger.info(`Purged emailSecrets for uid: ${uid}, connId: ${connId}`);
    } catch (err) {
      functions.logger.warn(`Failed to purge emailSecrets for ${uid}/${connId}:`, err);
    }
  });
