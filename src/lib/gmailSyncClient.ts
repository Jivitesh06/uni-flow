/**
 * UniFlow Client-Side Gmail Sync Client
 * 
 * Powered by Google Identity Services (GIS) Token Client.
 * Runs 100% in-browser under Firebase Spark Free Tier:
 * - NO serverless backend or Cloud Functions required
 * - Minimum necessary scope: https://www.googleapis.com/auth/gmail.readonly
 * - Short-lived access token kept STRICTLY in memory (never written to localStorage/sessionStorage/Firestore)
 * - Explicit account matching: rejects tokens if the selected Google account doesn't match the registered college email
 * - Filters Chitkara CSED office timetables: from:office.cse@chitkarauniversity.edu.in subject:"Time Table:"
 */

import { normalizeCollegeEmail } from './collegeEmail.ts';

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const DEFAULT_CHITKARA_CSED_SENDER = 'office.cse@chitkarauniversity.edu.in';
export const DEFAULT_CHITKARA_SUBJECT_PREFIX = 'Time Table:';

export interface DiscoveredTimetableAttachment {
  messageId: string;
  attachmentId: string;
  filename: string;
  size: number;
  subject: string;
  sender: string;
  date: string;
}

export interface GoogleUserProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

/**
 * Builds the Gmail search query for college timetables.
 */
export function buildGmailSearchQuery(
  sender: string = DEFAULT_CHITKARA_CSED_SENDER,
  subjectPrefix: string = DEFAULT_CHITKARA_SUBJECT_PREFIX,
  requirePdf: boolean = true
): string {
  const parts: string[] = [];
  if (sender && sender.trim()) {
    parts.push(`from:${sender.trim()}`);
  }
  if (subjectPrefix && subjectPrefix.trim()) {
    parts.push(`subject:"${subjectPrefix.trim()}"`);
  }
  if (requirePdf) {
    parts.push('filename:pdf');
  }
  return parts.join(' ');
}

/**
 * Checks if the signed-in Google email matches the registered college email.
 */
export function checkAccountEmailMatch(googleEmail: string, registeredEmail: string): boolean {
  if (!googleEmail || !registeredEmail) return false;
  return normalizeCollegeEmail(googleEmail) === normalizeCollegeEmail(registeredEmail);
}

/**
 * Safely decodes RFC 4648 Base64URL string (as returned by Gmail API) into a Uint8Array
 */
export function decodeBase64Url(base64UrlStr: string): Uint8Array {
  // Convert Base64URL to standard Base64:
  // '-' -> '+', '_' -> '/'
  let base64 = base64UrlStr.replace(/-/g, '+').replace(/_/g, '/');
  // Pad with '=' if length is not a multiple of 4
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  // Decode standard base64 in browser or node
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } else if (typeof Buffer !== 'undefined') {
    // Node environment fallback for automated testing
    return new Uint8Array(Buffer.from(base64, 'base64'));
  } else {
    throw new Error('Base64 decoding not supported in this runtime environment');
  }
}

/**
 * Dynamically loads Google Identity Services script if not already present.
 */
export function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if GIS is already loaded
    if (typeof window !== 'undefined' && (window as unknown as { google?: { accounts?: { oauth2?: unknown } } }).google?.accounts?.oauth2) {
      resolve();
      return;
    }

    if (typeof document === 'undefined') {
      reject(new Error('Window / document not available to load GIS script'));
      return;
    }

    const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services script')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services SDK'));
    document.head.appendChild(script);
  });
}

/**
 * Initiates the GIS Token Client OAuth popup flow to obtain a short-lived access token.
 * Token is returned in-memory and MUST NOT be written to persistent storage.
 */
export async function requestGmailAccessToken(clientId: string): Promise<string> {
  if (!clientId || clientId.trim() === '' || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
    throw new Error(
      'Gmail OAuth is optional and not currently configured by the administrator. Your timetable is automatically provided via the central shared database.'
    );
  }

  await loadGisScript();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    throw new Error('Google Identity Services SDK is unavailable');
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GMAIL_READONLY_SCOPE,
        callback: (tokenResponse: { access_token?: string; error?: string; error_description?: string }) => {
          if (tokenResponse.error) {
            reject(new Error(`Google authorization error: ${tokenResponse.error_description || tokenResponse.error}`));
            return;
          }
          if (!tokenResponse.access_token) {
            reject(new Error('No access token received from Google'));
            return;
          }
          resolve(tokenResponse.access_token);
        },
        error_callback: (err: { message?: string; type?: string }) => {
          reject(new Error(`Failed to initialize Google login: ${err?.message || err?.type || 'Unknown error'}`));
        },
      });

      // Prompt user with consent dialog
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err: unknown) {
      reject(new Error(`GIS Initialization failed: ${(err as Error).message}`));
    }
  });
}

/**
 * Validates that the authorized Google account matches the student's registered UniFlow email.
 * Immediately rejects if there is an account mismatch to ensure student identity privacy.
 */
export async function verifyGoogleAccount(
  accessToken: string,
  expectedEmail: string
): Promise<{ emailAddress: string; matches: boolean }> {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Failed to verify Google account profile: ${res.status} ${errorBody}`);
  }

  const profile: GoogleUserProfile = await res.json();
  const matches = checkAccountEmailMatch(profile.emailAddress, expectedEmail);

  if (!matches) {
    throw new Error(
      `Account mismatch! You signed into Google with "${profile.emailAddress}", but your UniFlow profile is registered as "${expectedEmail}". Please connect using your matching college Google account.`
    );
  }

  return { emailAddress: profile.emailAddress, matches };
}

/**
 * Searches the student's Gmail mailbox for Chitkara CSED timetable messages.
 */
export async function searchTimetableEmails(
  accessToken: string,
  queryStr?: string
): Promise<DiscoveredTimetableAttachment[]> {
  const query = queryStr || buildGmailSearchQuery();
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail search query failed: ${res.status} ${errText}`);
  }

  const listData: { messages?: Array<{ id: string; threadId: string }> } = await res.json();
  if (!listData.messages || listData.messages.length === 0) {
    return [];
  }

  const attachments: DiscoveredTimetableAttachment[] = [];

  // Inspect the found messages to retrieve PDF attachments
  for (const item of listData.messages.slice(0, 5)) {
    const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!msgRes.ok) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgData: any = await msgRes.json();
    const headers = msgData.payload?.headers || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    const subject = getHeader('Subject');
    const sender = getHeader('From');
    const date = getHeader('Date');

    // Recursively check parts for attachments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function findAttachmentsInParts(parts: any[]) {
      if (!parts || !Array.isArray(parts)) return;
      for (const part of parts) {
        if (part.filename && part.filename.toLowerCase().endsWith('.pdf') && part.body?.attachmentId) {
          attachments.push({
            messageId: item.id,
            attachmentId: part.body.attachmentId,
            filename: part.filename,
            size: part.body.size || 0,
            subject,
            sender,
            date,
          });
        }
        if (part.parts) {
          findAttachmentsInParts(part.parts);
        }
      }
    }

    if (msgData.payload?.parts) {
      findAttachmentsInParts(msgData.payload.parts);
    } else if (msgData.payload?.filename?.toLowerCase().endsWith('.pdf') && msgData.payload.body?.attachmentId) {
      attachments.push({
        messageId: item.id,
        attachmentId: msgData.payload.body.attachmentId,
        filename: msgData.payload.filename,
        size: msgData.payload.body.size || 0,
        subject,
        sender,
        date,
      });
    }
  }

  return attachments;
}

/**
 * Downloads the binary PDF attachment from Gmail API into an in-memory ArrayBuffer.
 */
export async function downloadAttachmentBuffer(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<ArrayBuffer> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to download Gmail attachment: ${res.status} ${errText}`);
  }

  const json: { size: number; data: string } = await res.json();
  if (!json.data) {
    throw new Error('Gmail attachment payload contained no data');
  }

  const bytes = decodeBase64Url(json.data);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
