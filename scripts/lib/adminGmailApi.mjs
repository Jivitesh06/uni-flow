/**
 * scripts/lib/adminGmailApi.mjs
 *
 * Server-side Gmail API utilities for UniFlow admin timetable sync.
 * Handles OAuth token refresh, message search, and attachment download.
 *
 * Security guarantees:
 * - Refresh tokens are never logged, printed, or exposed in error messages.
 * - Access tokens are kept in memory only and discarded after each run.
 * - Attachment bytes are kept in memory only; never written to disk.
 */

import { google } from 'googleapis';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Gmail read-only scope — minimum required, never request write access */
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/** Maximum attachments to evaluate per sync run */
const MAX_ATTACHMENTS_PER_RUN = 10;

/** Maximum message search results per query */
const MAX_SEARCH_RESULTS = 20;

// ─── OAuth Client ─────────────────────────────────────────────────────────────

/**
 * Creates an authenticated OAuth2 client using the stored refresh token.
 * The client automatically refreshes the access token when needed.
 *
 * @param {object} credentials - OAuth credentials (never logged)
 * @param {string} credentials.clientId
 * @param {string} credentials.clientSecret
 * @param {string} credentials.refreshToken
 * @returns {import('google-auth-library').OAuth2Client}
 */
export function createAuthenticatedOAuth2Client({ clientId, clientSecret, refreshToken }) {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing required Gmail OAuth credentials. Ensure GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, ' +
      'and GMAIL_REFRESH_TOKEN are set as GitHub Actions secrets.'
    );
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return auth;
}

/**
 * Validates that the OAuth2 client can obtain a valid access token.
 * Returns the authenticated Gmail instance without exposing token values.
 *
 * @param {import('google-auth-library').OAuth2Client} auth
 * @returns {Promise<import('googleapis').gmail_v1.Gmail>}
 */
export async function validateAndGetGmailClient(auth) {
  try {
    // Trigger a token refresh to verify credentials are valid
    await auth.getAccessToken();
  } catch (err) {
    // Do not include the error message verbatim — it may contain token fragments
    throw new Error(
      `Gmail OAuth token validation failed. The stored refresh token may be expired or revoked. ` +
      `Re-run the one-time OAuth setup: node scripts/admin-gmail-oauth-setup.mjs`
    );
  }
  return google.gmail({ version: 'v1', auth });
}

// ─── Message Search ────────────────────────────────────────────────────────────

/**
 * Builds a Gmail search query string for timetable emails.
 *
 * @param {object} options
 * @param {string} options.senderEmail - Sender filter (e.g. 'office.cse@chitkarauniversity.edu.in')
 * @param {string} options.subjectPrefix - Subject prefix (e.g. 'Time Table:')
 * @param {string} [options.afterDate] - ISO date string, search only emails after this date
 * @returns {string} Gmail search query
 */
export function buildGmailSearchQuery({ senderEmail, subjectPrefix, afterDate }) {
  const parts = [];

  if (senderEmail?.trim()) {
    parts.push(`from:${senderEmail.trim()}`);
  }

  if (subjectPrefix?.trim()) {
    // Escape any double quotes in the prefix for Gmail query safety
    const safePrefix = subjectPrefix.trim().replace(/"/g, '');
    parts.push(`subject:"${safePrefix}"`);
  }

  // PDF attachment filter
  parts.push('has:attachment');
  parts.push('filename:pdf');

  if (afterDate) {
    // Gmail after: filter uses YYYY/MM/DD format
    try {
      const d = new Date(afterDate);
      if (!isNaN(d.getTime())) {
        const afterStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
        parts.push(`after:${afterStr}`);
      }
    } catch {
      // Invalid date — skip the after filter
    }
  }

  return parts.join(' ');
}

/**
 * Searches Gmail for timetable messages matching the given query.
 * Returns message metadata (ID, thread ID) only — no body content.
 *
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {string} query - Gmail search query
 * @returns {Promise<Array<{messageId: string, threadId: string}>>}
 */
export async function searchTimetableMessages(gmail, query) {
  let allMessages = [];
  let pageToken = undefined;

  // Handle pagination, cap at MAX_SEARCH_RESULTS
  do {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: Math.min(MAX_SEARCH_RESULTS, 20),
      pageToken,
    });

    const messages = response.data.messages || [];
    allMessages = allMessages.concat(messages);
    pageToken = response.data.nextPageToken;

    if (allMessages.length >= MAX_SEARCH_RESULTS) break;
  } while (pageToken);

  return allMessages.slice(0, MAX_SEARCH_RESULTS).map((m) => ({
    messageId: m.id,
    threadId: m.threadId,
  }));
}

// ─── Attachment Discovery ─────────────────────────────────────────────────────

/**
 * Retrieves message metadata and identifies PDF attachments.
 * Never reads or logs email body content.
 *
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {string} messageId
 * @returns {Promise<{messageId, subject, date, attachments: Array<{attachmentId, filename, size}>}>}
 */
export async function getMessageAttachments(gmail, messageId) {
  // Use format: 'full' to retrieve complete MIME part tree, attachment IDs, sizes, and any inline body data
  const message = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const payload = message.data.payload || {};
  const headers = payload.headers || [];
  const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || '';
  const date = headers.find((h) => h.name?.toLowerCase() === 'date')?.value || '';
  const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || '';

  const attachments = [];

  function sanitizeFilename(rawName) {
    if (!rawName) return '';
    // Strip surrounding quotes or header parameters
    return rawName.replace(/^["']|["']$/g, '').trim();
  }

  function getFilenameFromHeaders(partHeaders = []) {
    for (const h of partHeaders) {
      const name = h.name?.toLowerCase();
      if (name === 'content-disposition' || name === 'content-type') {
        const val = h.value || '';
        const match = val.match(/(?:filename|name)\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
        if (match) {
          return sanitizeFilename(match[1] || match[2]);
        }
      }
    }
    return '';
  }

  function inspectAndCollect(part, depth = 0) {
    if (!part) return;

    const mimeType = (part.mimeType || '').toLowerCase();
    const partFilename = sanitizeFilename(part.filename) || getFilenameFromHeaders(part.headers);
    const body = part.body || {};
    const attachmentId = body.attachmentId;
    const inlineData = body.data;
    const size = body.size || (inlineData ? inlineData.length : 0);

    const isPdfMime = mimeType === 'application/pdf' || mimeType === 'application/x-pdf';
    const isPdfExt = partFilename.toLowerCase().endsWith('.pdf');

    // Safe diagnostic log (MIME structure & metadata only — never email content or tokens)
    console.log(
      `[UniFlow Gmail API] Part [depth=${depth}]: mime="${mimeType}", ` +
      `filename="${partFilename || '<none>'}", size=${size}B, ` +
      `hasAttachmentId=${Boolean(attachmentId)}, hasInlineData=${Boolean(inlineData)}`
    );

    // Matches if it has PDF extension or PDF MIME type, and contains an attachmentId or inline data
    if ((isPdfExt || isPdfMime) && (attachmentId || inlineData)) {
      const resolvedFilename = isPdfExt ? partFilename : (partFilename ? `${partFilename}.pdf` : 'timetable.pdf');
      attachments.push({
        attachmentId: attachmentId || null,
        data: inlineData || null,
        filename: resolvedFilename,
        size,
        mimeType: mimeType || 'application/pdf',
      });
    }

    if (Array.isArray(part.parts) && part.parts.length > 0) {
      for (const subPart of part.parts) {
        inspectAndCollect(subPart, depth + 1);
      }
    }
  }

  // Check top-level payload first (single-part email where payload itself is the attachment)
  inspectAndCollect(payload, 0);

  console.log(`[UniFlow Gmail API] Message ${messageId}: found ${attachments.length} PDF attachment(s).`);

  return {
    messageId,
    subject,
    date,
    from,
    attachments: attachments.slice(0, MAX_ATTACHMENTS_PER_RUN),
  };
}

// ─── Attachment Download ──────────────────────────────────────────────────────

/**
 * Downloads a PDF attachment into an in-memory Buffer.
 * Supports both Gmail attachmentId retrieval and inline base64 body data.
 * The attachment is never written to disk.
 *
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {string} messageId
 * @param {string|null} attachmentId - Attachment ID if externalized
 * @param {string|null} [inlineData] - Base64 data if embedded inline in message body
 * @returns {Promise<Buffer>}
 */
export async function downloadAttachmentBuffer(gmail, messageId, attachmentId, inlineData = null) {
  let rawData = inlineData;

  if (!rawData && attachmentId) {
    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });
    rawData = response.data?.data;
  }

  if (!rawData) {
    throw new Error(`Attachment data is empty for message ${messageId}, attachment ${attachmentId || 'inline'}`);
  }

  // Gmail API returns base64url-encoded data
  const base64 = rawData.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

// ─── Gmail History (Incremental Sync) ────────────────────────────────────────

/**
 * Fetches Gmail history since a given historyId to find new messages.
 * Used for incremental sync to avoid reprocessing already-seen messages.
 *
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {string} startHistoryId - Last known history ID
 * @returns {Promise<{newMessageIds: string[], latestHistoryId: string | null}>}
 */
export async function getNewMessagesSinceHistoryId(gmail, startHistoryId) {
  const newMessageIds = new Set();
  let pageToken = undefined;
  let latestHistoryId = null;

  try {
    do {
      const response = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
        pageToken,
      });

      const historyList = response.data.history || [];
      for (const history of historyList) {
        if (history.historyId && (!latestHistoryId || parseInt(history.historyId) > parseInt(latestHistoryId))) {
          latestHistoryId = history.historyId;
        }
        for (const added of history.messagesAdded || []) {
          if (added.message?.id) {
            newMessageIds.add(added.message.id);
          }
        }
      }

      pageToken = response.data.nextPageToken;
    } while (pageToken);
  } catch (err) {
    // historyId expired (>7 days) — fall back to full search
    if (err.code === 404 || (err.message && err.message.includes('historyId'))) {
      return { newMessageIds: null, latestHistoryId: null, historyExpired: true };
    }
    throw err;
  }

  return {
    newMessageIds: [...newMessageIds],
    latestHistoryId,
    historyExpired: false,
  };
}

/**
 * Gets the current Gmail profile historyId to use as a baseline for future incremental syncs.
 *
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @returns {Promise<string>}
 */
export async function getCurrentHistoryId(gmail) {
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data.historyId;
}
