#!/usr/bin/env node

/**
 * UniFlow — Class Reminder Push Dispatcher
 *
 * Designed to run on a trusted server-side scheduler (e.g., GitHub Actions cron)
 * completely free of charge, respecting Firebase Spark free tier constraints.
 *
 * Dispatches real Web Push notifications (iOS PWA & Android/Desktop) and
 * FCM multicast notifications without requiring paid Firebase Cloud Functions.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const CANONICAL_REMINDER_OFFSET = 10;

export const CANONICAL_VAPID_PUBLIC_KEY =
  'BCRFPJBd3uyEhTLTp3xvC_XC7xWKY5AGVtb_K-egveVehf03iaHpo1XkhOmFoimtl9uP-fhRaju5xkG1cTZePl0';
export const CANONICAL_VAPID_SUBJECT =
  'mailto:notifications@uniflow-cu.web.app';

/**
 * Extracts date and time components explicitly in Asia/Kolkata (IST) timezone.
 * Eliminates UTC vs. IST discrepancies on GitHub-hosted and cloud runners.
 *
 * @param {Date|string|number} [date=new Date()]
 * @returns {{
 *   year: number,
 *   month: number,
 *   day: number,
 *   hour: number,
 *   minute: number,
 *   second: number,
 *   dayOfWeek: number, // 0=Sun, 1=Mon, ..., 6=Sat
 *   dateKey: string,   // YYYY-MM-DD
 *   timeKey: string,   // HH:mm
 *   minutesIntoDay: number
 * }}
 */
export function getIstParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(validDate);
  const partMap = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);
  const hour = parseInt(partMap.hour, 10);
  const minute = parseInt(partMap.minute, 10);
  const second = parseInt(partMap.second, 10);

  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = weekdayMap[partMap.weekday] ?? 0;

  const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const timeKey = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dayOfWeek,
    dateKey,
    timeKey,
    minutesIntoDay: hour * 60 + minute + second / 60,
  };
}

/**
 * Formats a Date to YYYY-MM-DD strictly in Asia/Kolkata (IST)
 */
export function getLocalDateKey(date = new Date()) {
  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      date = parsed;
    } else {
      return date;
    }
  }
  return getIstParts(date).dateKey;
}

/**
 * Constructs canonical deterministic notification ID for reminders.
 * Guaranteed to use the IST date key and slot start time.
 */
export function buildDeterministicNotificationId(
  uid,
  slot,
  date = new Date(),
  type = 'class_reminder',
  offsetMinutes = CANONICAL_REMINDER_OFFSET
) {
  const dateKey = getLocalDateKey(date);
  const rawId = slot.id || slot.subjectCode || 'class';
  const cleanSlotId = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanTime = (slot.startTime || 'time').replace(/[^a-zA-Z0-9_-]/g, '');
  return `${cleanUid}_${cleanSlotId}_${dateKey}_${cleanTime}_${type}_${offsetMinutes}m`;
}

/**
 * Evaluates whether a timetable slot starts within the reminder window
 * in Asia/Kolkata timezone.
 * Default window [2, 15] provides resilience against runner delays
 * while preventing stale reminders for classes that have already started.
 */
export function isSlotIn10MinWindow(
  slotStartTime,
  now = new Date(),
  windowStartMin = 2,
  windowEndMin = 15
) {
  if (!slotStartTime) return false;
  const [sh, sm] = slotStartTime.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm)) return false;

  const ist = getIstParts(now);
  const slotMinutes = sh * 60 + sm;
  const nowMinutes = ist.hour * 60 + ist.minute + (ist.second || 0) / 60;

  let diffMinutes = slotMinutes - nowMinutes;
  // Handle midnight boundaries
  if (diffMinutes < -720) diffMinutes += 1440;
  if (diffMinutes > 720) diffMinutes -= 1440;

  return diffMinutes >= windowStartMin && diffMinutes <= windowEndMin;
}

/**
 * Prepares standard FCM push message payload (for native Android / FCM Web SDK tokens)
 */
export function buildFcmPayload(slot, tokens, minutesLeft = CANONICAL_REMINDER_OFFSET) {
  const title = `Class in ${minutesLeft} mins: ${slot.subjectName}`;
  const body = `${slot.startTime} – ${slot.endTime} | Room: ${slot.room || 'TBA'}${
    slot.faculty ? ` | Faculty: ${slot.faculty}` : ''
  }`;
  const slotIdentifier = slot.id || slot.subjectCode || 'class';
  const startIdentifier = slot.startTime ? slot.startTime.replace(/[^a-zA-Z0-9]/g, '') : 'time';
  const tag = `uniflow-reminder-${slotIdentifier}-${startIdentifier}`;

  return {
    notification: {
      title,
      body,
    },
    data: {
      type: 'class_reminder',
      slotId: String(slot.id || ''),
      subjectCode: String(slot.subjectCode || ''),
      startTime: String(slot.startTime || ''),
      url: '/timetable',
      tag,
    },
    tokens,
  };
}

/**
 * Prepares Web Push RFC 8291 payload (for standard Web Push & iOS PWA subscriptions)
 */
export function buildWebPushPayload(slot, minutesLeft = CANONICAL_REMINDER_OFFSET) {
  const title = `Class in ${minutesLeft} mins: ${slot.subjectName}`;
  const body = `${slot.startTime} – ${slot.endTime} | Room: ${slot.room || 'TBA'}${
    slot.faculty ? ` | Faculty: ${slot.faculty}` : ''
  }`;
  const slotIdentifier = slot.id || slot.subjectCode || 'class';
  const startIdentifier = slot.startTime ? slot.startTime.replace(/[^a-zA-Z0-9]/g, '') : 'time';
  const tag = `uniflow-reminder-${slotIdentifier}-${startIdentifier}`;

  return {
    title,
    body,
    icon: '/icons/icon-192x192.png',
    badge: '/favicon.svg',
    url: '/timetable',
    tag,
    notification: {
      title,
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/favicon.svg',
      tag,
    },
    data: {
      type: 'class_reminder',
      slotId: String(slot.id || ''),
      subjectCode: String(slot.subjectCode || ''),
      startTime: String(slot.startTime || ''),
      url: '/timetable',
      tag,
    },
  };
}

/**
 * Normalizes a base64 / base64url key string by stripping whitespace,
 * surrounding quotes, and standardizing padding and URL-safe characters.
 *
 * @param {string} rawKey
 * @returns {string}
 */
export function normalizeBase64Key(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return '';
  let str = rawKey.trim();
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Cryptographically validates that a P-256 VAPID private key matches the public key
 * using Node's native crypto without exposing secret values.
 *
 * Enforces:
 * 1. Private key decodes to exactly 32 bytes (256-bit scalar).
 * 2. If a 65-byte public key was mistakenly supplied, explains root cause clearly.
 * 3. Public key is a valid 65-byte uncompressed P-256 point starting with 0x04.
 * 4. Derived public key matches configured public key.
 */
export function validateVapidKeypair(publicKey, privateKey) {
  if (!publicKey) {
    return { valid: false, error: 'VAPID public key is missing' };
  }
  if (!privateKey) {
    return { valid: false, error: 'VAPID private key is missing' };
  }

  try {
    const cleanPriv = normalizeBase64Key(privateKey);
    const privBuf = Buffer.from(cleanPriv, 'base64url');

    if (privBuf.length === 65) {
      return {
        valid: false,
        error:
          'Invalid VAPID private key length (65 bytes, expected 32 bytes). ' +
          'A 65-byte uncompressed P-256 public key was mistakenly supplied in place of the private key. ' +
          'VAPID_PRIVATE_KEY must be the 32-byte private key scalar.',
      };
    }

    if (privBuf.length !== 32) {
      return {
        valid: false,
        error: `Invalid VAPID private key length (${privBuf.length} bytes, expected 32 bytes)`,
      };
    }

    const cleanPub = normalizeBase64Key(publicKey);
    const pubBuf = Buffer.from(cleanPub, 'base64url');

    if (pubBuf.length !== 65 || pubBuf[0] !== 0x04) {
      return {
        valid: false,
        error: `Invalid VAPID public key format (${pubBuf.length} bytes, expected 65-byte uncompressed point starting with 0x04)`,
      };
    }

    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(privBuf);
    const derivedPub = ecdh.getPublicKey('base64url');

    if (derivedPub !== cleanPub) {
      return { valid: false, error: 'VAPID private key does not match the configured public key' };
    }

    return { valid: true, error: null };
  } catch (err) {
    return { valid: false, error: `VAPID cryptographic validation failed: ${err.message}` };
  }
}

/**
 * Sends a standard Web Push notification using web-push library and VAPID keys
 */
export async function sendWebPushNotification(subscription, payload, vapidOptions = {}) {
  const webpushModule = await import('web-push');
  const webpush = webpushModule.default || webpushModule;

  const rawPub = vapidOptions.publicKey || process.env.VAPID_PUBLIC_KEY || CANONICAL_VAPID_PUBLIC_KEY;
  const rawPriv = vapidOptions.privateKey || process.env.VAPID_PRIVATE_KEY;
  const rawSubject = vapidOptions.subject || process.env.VAPID_SUBJECT || CANONICAL_VAPID_SUBJECT;

  if (!rawPriv) {
    throw new Error(
      '[UniFlow Dispatcher] Cannot dispatch Web Push notification: VAPID_PRIVATE_KEY is missing. ' +
      'Please configure the VAPID_PRIVATE_KEY secret/environment variable.'
    );
  }

  const pub = normalizeBase64Key(rawPub);
  const priv = normalizeBase64Key(rawPriv);
  const subject = String(rawSubject).trim().replace(/^["']|["']$/g, '');

  webpush.setVapidDetails(subject, pub, priv);

  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

  return webpush.sendNotification(subscription, payloadString, {
    TTL: 86400,
    urgency: 'high',
  });
}

/**
 * Safely parse service account credentials from raw JSON, base64-encoded string, or file path.
 */
export function parseServiceAccountCredentials(rawInput) {
  if (!rawInput) return null;
  let str = String(rawInput).trim();
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }

  // 1. Direct JSON parse
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}

  // 2. Base64 decoded JSON parse
  try {
    const decoded = Buffer.from(str, 'base64').toString('utf8').trim();
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}

  // 3. File path JSON parse
  try {
    if (fs.existsSync(str)) {
      const content = fs.readFileSync(str, 'utf8').trim();
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}

  return null;
}

/**
 * Initializes Firebase Admin SDK with robust credential discovery, field validation, and error reporting.
 */
export async function initializeFirebaseAdmin(options = {}) {
  const rawCreds =
    options.serviceAccount ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GCP_SA_KEY;

  if (!rawCreds) {
    return {
      adminApp: null,
      db: null,
      messaging: null,
      projectId: null,
      clientEmail: null,
      error: 'Missing Firebase service account credentials. Neither FIREBASE_SERVICE_ACCOUNT_KEY nor GOOGLE_APPLICATION_CREDENTIALS is set in the environment.',
    };
  }

  const creds = parseServiceAccountCredentials(rawCreds);
  if (!creds || typeof creds !== 'object') {
    return {
      adminApp: null,
      db: null,
      messaging: null,
      projectId: null,
      clientEmail: null,
      error: 'Failed to parse Firebase service account credentials. The input is neither valid JSON, a Base64-encoded JSON string, nor an accessible file path.',
    };
  }

  // Normalize snake_case and camelCase property names
  const clientEmail = creds.client_email || creds.clientEmail;
  let privateKey = creds.private_key || creds.privateKey;
  const projectId = creds.project_id || creds.projectId || process.env.FIREBASE_PROJECT_ID || 'uniflow-b7a88';

  // 1. Validate client_email
  if (!clientEmail || typeof clientEmail !== 'string') {
    const presentKeys = Object.keys(creds).filter((k) => !k.toLowerCase().includes('key'));
    return {
      adminApp: null,
      db: null,
      messaging: null,
      projectId,
      clientEmail: null,
      error: `Service account JSON is missing the required 'client_email' property. Present properties: [${presentKeys.join(', ')}]`,
    };
  }

  if (!clientEmail.includes('@')) {
    return {
      adminApp: null,
      db: null,
      messaging: null,
      projectId,
      clientEmail: null,
      error: "Service account 'client_email' property is not a valid email address.",
    };
  }

  // 2. Validate private_key
  if (!privateKey || typeof privateKey !== 'string') {
    const presentKeys = Object.keys(creds).filter((k) => !k.toLowerCase().includes('key'));
    return {
      adminApp: null,
      db: null,
      messaging: null,
      projectId,
      clientEmail,
      error: `Service account JSON is missing the required 'private_key' property. Present properties: [${presentKeys.join(', ')}]`,
    };
  }

  // Sanitize escaped newlines in PEM private key
  privateKey = privateKey.replace(/\\n/g, '\n');

  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
    return {
      adminApp: null,
      db: null,
      messaging: null,
      projectId,
      clientEmail,
      error: "Service account 'private_key' is malformed: missing '-----BEGIN PRIVATE KEY-----' or '-----END PRIVATE KEY-----' PEM boundary markers.",
    };
  }

  // 3. Project ID verification
  if (creds.project_id && creds.project_id !== 'uniflow-b7a88') {
    console.warn(`[UniFlow Dispatcher] Notice: Service account project_id ('${creds.project_id}') differs from expected production project ('uniflow-b7a88').`);
  }

  // Mask client email for safe logging (e.g. fir***dk@uniflow-b7a88.iam.gserviceaccount.com)
  const emailParts = clientEmail.split('@');
  const maskedEmail = emailParts.length === 2
    ? `${emailParts[0].slice(0, 3)}***@${emailParts[1]}`
    : '***@***';

  try {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const { getMessaging } = await import('firebase-admin/messaging');

    const existingApps = getApps();
    const app = existingApps.length > 0
      ? existingApps[0]
      : initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
          projectId,
        });

    const db = getFirestore(app);
    const messaging = getMessaging(app);

    return {
      adminApp: app,
      db,
      messaging,
      projectId,
      clientEmail,
      maskedEmail,
      error: null,
    };
  } catch (initErr) {
    return {
      adminApp: null,
      db: null,
      messaging: null,
      projectId,
      clientEmail,
      maskedEmail,
      error: `Firebase Admin initialization failed: ${initErr.message}`,
    };
  }
}

/**
 * Main dispatcher entry point
 */
export async function runReminderDispatcher(options = {}) {
  const {
    now = new Date(),
    mode = 'live',
    dryRun = false,
    db = null,
    messaging = null,
    vapidOptions = {},
    testRecipientUid = null,
    isTestPush = false,
    sendWebPushFn = sendWebPushNotification,
  } = options;

  // Resolve effective execution mode
  const effectiveMode = dryRun || mode === 'dry-run' ? 'dry-run' : (mode === 'test-push' || isTestPush ? 'test-push' : 'live');
  const ist = getIstParts(now);

  console.log('============================================================');
  console.log(`[UniFlow Dispatcher] Mode: ${effectiveMode.toUpperCase()}`);
  console.log(`[UniFlow Dispatcher] Timestamp (UTC): ${now.toISOString()} | IST: ${ist.dateKey} ${ist.timeKey}`);
  console.log(`[UniFlow Dispatcher] Target day of week: ${ist.dayOfWeek}`);
  if (testRecipientUid) {
    console.log(`[UniFlow Dispatcher] Target Test Recipient UID: ${testRecipientUid}`);
  }
  console.log('============================================================');

  // Strict enforcement: LIVE and TEST-PUSH modes require a live Firestore connection
  if (!db) {
    if (effectiveMode === 'live' || effectiveMode === 'test-push') {
      throw new Error(
        `[UniFlow Dispatcher] FATAL: Cannot run in ${effectiveMode.toUpperCase()} mode without a live Firestore connection! ` +
        `Please ensure FIREBASE_SERVICE_ACCOUNT_KEY is configured in GitHub Secrets / environment.`
      );
    }

    console.log('[UniFlow Dispatcher] No live Firestore connection provided (Dry-run / test mode).');
    return {
      status: 'success_dry_run',
      mode: 'dry-run',
      dispatchedCount: 0,
      eligibleCount: 0,
      pushAttempts: 0,
      successfulSends: 0,
      failedSends: 0,
      expiredSubscriptionsPruned: 0,
      fcmTokensPruned: 0,
      alreadyRecordedCount: 0,
      timestamp: now.toISOString(),
    };
  }

  // Validate VAPID keypair in LIVE and TEST-PUSH modes
  const vapidPub = vapidOptions.publicKey || process.env.VAPID_PUBLIC_KEY || CANONICAL_VAPID_PUBLIC_KEY;
  const vapidPriv = vapidOptions.privateKey || process.env.VAPID_PRIVATE_KEY;

  if (effectiveMode === 'live' || effectiveMode === 'test-push') {
    if (!vapidPriv) {
      throw new Error(
        `[UniFlow Dispatcher] FATAL: VAPID_PRIVATE_KEY environment variable is missing in ${effectiveMode.toUpperCase()} mode. ` +
        `Please configure the VAPID_PRIVATE_KEY GitHub Actions secret.`
      );
    }

    const validation = validateVapidKeypair(vapidPub, vapidPriv);
    if (!validation.valid) {
      throw new Error(`[UniFlow Dispatcher] FATAL: VAPID keypair validation failed: ${validation.error}`);
    }
  }

  // ---------------------------------------------------------------------------
  // A. CONTROLLED TEST PUSH MODE
  // ---------------------------------------------------------------------------
  if (effectiveMode === 'test-push') {
    console.log('[UniFlow Dispatcher] Executing CONTROLLED TEST PUSH to verify real delivery...');
    let targetUid = testRecipientUid;

    // If no targetUid specified, find the first user with active push subscriptions
    if (!targetUid) {
      const snap = await db.collection('users').get();
      for (const uDoc of snap.docs) {
        const subsSnap = await db.collection('users').doc(uDoc.id).collection('pushSubscriptions').limit(1).get();
        if (!subsSnap.empty) {
          targetUid = uDoc.id;
          break;
        }
      }
    }

    if (!targetUid) {
      console.warn('[UniFlow Dispatcher] No registered test recipient or user with push subscriptions found in Firestore.');
      return {
        status: 'test_push_no_recipients',
        mode: 'test-push',
        pushAttempts: 0,
        successfulSends: 0,
        failedSends: 0,
        timestamp: now.toISOString(),
      };
    }

    console.log(`[UniFlow Dispatcher] Target test recipient resolved: ${targetUid}`);
    const subsSnap = await db.collection('users').doc(targetUid).collection('pushSubscriptions').get();
    const pushSubscriptions = [];
    subsSnap.forEach((docSnap) => {
      const d = docSnap.data();
      if (d && d.endpoint && d.keys) {
        pushSubscriptions.push({ id: docSnap.id, ...d });
      }
    });

    const userDoc = await db.collection('users').doc(targetUid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const fcmTokens = Array.isArray(userData?.fcmTokens) ? userData.fcmTokens : [];

    if (pushSubscriptions.length === 0 && fcmTokens.length === 0) {
      console.warn(`[UniFlow Dispatcher] Target recipient ${targetUid} has 0 push subscriptions and 0 FCM tokens.`);
      return {
        status: 'test_push_no_subscriptions',
        mode: 'test-push',
        targetUid,
        pushAttempts: 0,
        successfulSends: 0,
        failedSends: 0,
        timestamp: now.toISOString(),
      };
    }

    const testPayload = {
      title: '🔔 UniFlow Notification Test',
      body: 'Class reminders are active! Tapping here opens your timetable.',
      icon: '/icons/icon-192x192.png',
      badge: '/favicon.svg',
      url: '/timetable',
      notification: {
        title: '🔔 UniFlow Notification Test',
        body: 'Class reminders are active! Tapping here opens your timetable.',
        icon: '/icons/icon-192x192.png',
        badge: '/favicon.svg',
      },
      data: {
        type: 'test_notification',
        url: '/timetable',
        sentAt: now.toISOString(),
      },
    };

    let testPushAttempts = 0;
    let testSuccessfulSends = 0;
    let testFailedSends = 0;

    for (const sub of pushSubscriptions) {
      testPushAttempts++;
      try {
        await sendWebPushFn(
          { endpoint: sub.endpoint, keys: sub.keys },
          testPayload,
          { ...vapidOptions, publicKey: vapidPub, privateKey: vapidPriv }
        );
        testSuccessfulSends++;
        const endpointDisplay = sub.endpoint.split('?')[0].slice(0, 45);
        console.log(`[UniFlow Dispatcher] Controlled test Web Push accepted by ${endpointDisplay}... (Platform: ${sub.platform || 'unknown'})`);
      } catch (err) {
        testFailedSends++;
        console.warn(`[UniFlow Dispatcher] Controlled test Web Push failed: ${err.message}`);
      }
    }

    if (fcmTokens.length > 0 && messaging) {
      testPushAttempts += fcmTokens.length;
      try {
        const resp = await messaging.sendEachForMulticast({
          notification: {
            title: testPayload.title,
            body: testPayload.body,
          },
          data: {
            type: 'test_notification',
            url: '/timetable',
          },
          tokens: fcmTokens,
        });
        testSuccessfulSends += resp.successCount;
        testFailedSends += resp.failureCount;
        console.log(`[UniFlow Dispatcher] Controlled test FCM response: ${resp.successCount} sent, ${resp.failureCount} failed.`);
      } catch (err) {
        testFailedSends += fcmTokens.length;
        console.warn(`[UniFlow Dispatcher] Controlled test FCM error: ${err.message}`);
      }
    }

    return {
      status: testSuccessfulSends > 0 ? 'test_push_success' : 'test_push_failed',
      mode: 'test-push',
      targetUid,
      pushAttempts: testPushAttempts,
      successfulSends: testSuccessfulSends,
      failedSends: testFailedSends,
      timestamp: now.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // B. REGULAR REMINDER DISPATCH (LIVE or DRY-RUN)
  // ---------------------------------------------------------------------------
  let totalDispatched = 0;
  let totalEvaluated = 0;
  let eligibleCount = 0;
  let alreadyRecordedCount = 0;
  let pushAttempts = 0;
  let successfulSends = 0;
  let failedSends = 0;
  let expiredSubscriptionsPruned = 0;
  let fcmTokensPruned = 0;

  try {
    const usersSnap = await db.collection('users').get();
    console.log(`[UniFlow Dispatcher] Evaluating ${usersSnap.docs.length} registered users...`);

    for (const userDoc of usersSnap.docs) {
      totalEvaluated++;
      const userData = userDoc.data();
      const uid = userDoc.id;

      // 1. Fetch Web Push subscriptions for this user
      const subsSnap = await db.collection('users').doc(uid).collection('pushSubscriptions').get();
      const pushSubscriptions = [];
      subsSnap.forEach((docSnap) => {
        const subData = docSnap.data();
        if (subData && subData.endpoint && subData.keys) {
          pushSubscriptions.push({ id: docSnap.id, ...subData });
        }
      });

      // 2. Fetch FCM registration tokens
      const fcmTokens = Array.isArray(userData.fcmTokens) ? userData.fcmTokens : [];

      if (pushSubscriptions.length === 0 && fcmTokens.length === 0) {
        continue;
      }

      // 3. Read personal timetable slots for today in Asia/Kolkata timezone
      const timetableSnap = await db
        .collection('users')
        .doc(uid)
        .collection('timetable')
        .where('dayOfWeek', '==', ist.dayOfWeek)
        .where('isActive', '==', true)
        .get();

      let slots = timetableSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 4. If no personal slots, check shared timetable group if user has section/semester
      if (slots.length === 0 && userData.section) {
        try {
          const sem = String(userData.semester || '5').replace(/[^0-9]/g, '');
          const sec = String(userData.section || 'C').trim().toLowerCase();
          const sharedGroupId = `cuiet_be_cse_2022_${sem}_${sec}`;
          const sharedDoc = await db.collection('sharedTimetables').doc(sharedGroupId).get();

          if (sharedDoc.exists) {
            const sharedData = sharedDoc.data();
            const groupSlots = (sharedData.slots || []).filter(
              (s) => s.dayOfWeek === ist.dayOfWeek && s.isActive !== false
            );
            // Filter by student group (G1/G2) if applicable
            const studentGroup = userData.studentGroup || 'ALL';
            slots = groupSlots.filter((s) => {
              if (!s.group || s.group === 'ALL' || studentGroup === 'ALL') return true;
              return s.group === studentGroup;
            });
          }
        } catch (sharedErr) {
          console.warn(`[UniFlow Dispatcher] Note resolving shared timetable for ${uid}:`, sharedErr.message);
        }
      }

      for (const slot of slots) {
        if (!slot.startTime) continue;

        if (isSlotIn10MinWindow(slot.startTime, now)) {
          eligibleCount++;
          const notifId = buildDeterministicNotificationId(uid, slot, now, 'class_reminder', CANONICAL_REMINDER_OFFSET);

          // Check if already dispatched
          const notifRef = db.collection('users').doc(uid).collection('notifications').doc(notifId);
          const notifSnap = await notifRef.get();

          if (notifSnap.exists) {
            alreadyRecordedCount++;
            console.log(`[UniFlow Dispatcher] Reminder ${notifId} already recorded for ${uid}, skipping duplicate.`);
            continue;
          }

          const webPushPayload = buildWebPushPayload(slot, CANONICAL_REMINDER_OFFSET);

          if (effectiveMode === 'live') {
            let slotHadSuccessfulSend = false;

            // 1. Dispatch to Web Push subscriptions (iOS PWA, Android, Desktop)
            for (const sub of pushSubscriptions) {
              pushAttempts++;
              try {
                await sendWebPushFn(
                  {
                    endpoint: sub.endpoint,
                    keys: sub.keys,
                  },
                  webPushPayload,
                  { ...vapidOptions, publicKey: vapidPub, privateKey: vapidPriv }
                );
                successfulSends++;
                slotHadSuccessfulSend = true;
                console.log(`[UniFlow Dispatcher] Web Push delivered to ${sub.platform || 'device'} for ${uid}`);
              } catch (wpErr) {
                failedSends++;
                // If subscription expired or unsubscribed, delete document
                if (wpErr.statusCode === 404 || wpErr.statusCode === 410) {
                  console.log(`[UniFlow Dispatcher] Subscription expired (${wpErr.statusCode}), removing: ${sub.id}`);
                  expiredSubscriptionsPruned++;
                  await db.collection('users').doc(uid).collection('pushSubscriptions').doc(sub.id).delete().catch(() => {});
                } else {
                  console.warn(`[UniFlow Dispatcher] Web Push delivery warning for ${uid}:`, wpErr.message);
                }
              }
            }

            // 2. Dispatch to FCM tokens if available and messaging provided
            if (fcmTokens.length > 0 && messaging) {
              const fcmPayload = buildFcmPayload(slot, fcmTokens, CANONICAL_REMINDER_OFFSET);
              pushAttempts += fcmTokens.length;
              try {
                const resp = await messaging.sendEachForMulticast(fcmPayload);
                successfulSends += resp.successCount;
                failedSends += resp.failureCount;
                if (resp.successCount > 0) {
                  slotHadSuccessfulSend = true;
                }
                console.log(`[UniFlow Dispatcher] FCM dispatched for ${uid}: ${resp.successCount} sent, ${resp.failureCount} failed`);

                // Clean up invalid tokens
                const deadTokens = [];
                resp.responses.forEach((r, idx) => {
                  if (
                    !r.success &&
                    (r.error?.code === 'messaging/invalid-registration-token' ||
                      r.error?.code === 'messaging/registration-token-not-registered')
                  ) {
                    deadTokens.push(fcmTokens[idx]);
                  }
                });

                if (deadTokens.length > 0) {
                  fcmTokensPruned += deadTokens.length;
                  const { FieldValue } = await import('firebase-admin/firestore');
                  await db
                    .collection('users')
                    .doc(uid)
                    .update({
                      fcmTokens: FieldValue.arrayRemove(...deadTokens),
                    })
                    .catch(() => {});
                }
              } catch (fcmErr) {
                failedSends += fcmTokens.length;
                console.warn(`[UniFlow Dispatcher] FCM multicast error for ${uid}:`, fcmErr.message);
              }
            }

            // 3. Record notification in Firestore with deterministic ID only if at least one push was accepted
            if (slotHadSuccessfulSend) {
              await notifRef.set({
                uid,
                type: 'class_reminder',
                title: webPushPayload.title,
                body: webPushPayload.body,
                read: false,
                slotId: slot.id || null,
                subjectCode: slot.subjectCode || null,
                classDate: ist.dateKey,
                reminderOffset: CANONICAL_REMINDER_OFFSET,
                source: 'background_push_dispatcher',
                createdAt: new Date(),
              });
              totalDispatched++;
            }
          } else {
            // DRY RUN SIMULATION
            console.log(`[UniFlow Dispatcher] [DRY RUN] Would dispatch reminder ${notifId} to ${pushSubscriptions.length} web push subs & ${fcmTokens.length} FCM tokens.`);
            totalDispatched++;
          }
        }
      }
    }
  } catch (err) {
    console.error('[UniFlow Dispatcher] Execution error:', err);
    throw err;
  }

  // Determine final status
  let finalStatus;
  if (effectiveMode === 'dry-run') {
    finalStatus = 'dry_run_complete';
  } else if (eligibleCount === 0) {
    finalStatus = 'success_no_eligible_reminders';
  } else if (pushAttempts === 0 && alreadyRecordedCount === 0) {
    finalStatus = 'success_no_registered_subscriptions';
  } else if (failedSends > 0 && successfulSends === 0) {
    finalStatus = 'failed_all_pushes';
  } else if (failedSends > 0 && successfulSends > 0) {
    finalStatus = 'partial_success';
  } else {
    finalStatus = 'success';
  }

  const summary = {
    status: finalStatus,
    mode: effectiveMode,
    totalUsersEvaluated: totalEvaluated,
    eligibleCount,
    alreadyRecordedCount,
    pushAttempts,
    successfulSends,
    failedSends,
    expiredSubscriptionsPruned,
    fcmTokensPruned,
    dispatchedCount: totalDispatched,
    timestamp: now.toISOString(),
    istDateKey: ist.dateKey,
    istTimeKey: ist.timeKey,
  };

  console.log('[UniFlow Dispatcher] Run summary:', summary);

  // Write markdown step summary if running inside GitHub Actions
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      const summaryMarkdown = [
        '### 🔔 UniFlow Class Reminders Dispatcher Summary',
        '',
        `| Metric | Value |`,
        `| :--- | :--- |`,
        `| **Status** | \`${summary.status}\` |`,
        `| **Mode** | \`${summary.mode.toUpperCase()}\` |`,
        `| **Timestamp (UTC)** | \`${summary.timestamp}\` |`,
        `| **Timestamp (IST)** | \`${ist.dateKey} ${ist.timeKey}\` |`,
        `| **Users Evaluated** | ${summary.totalUsersEvaluated} |`,
        `| **Eligible Class Reminders** | ${summary.eligibleCount} |`,
        `| **Already Dispatched (Deduplicated)** | ${summary.alreadyRecordedCount} |`,
        `| **Push Attempts** | ${summary.pushAttempts} |`,
        `| **Successful Sends** | ${summary.successfulSends} |`,
        `| **Failed Sends** | ${summary.failedSends} |`,
        `| **Expired Subscriptions Pruned** | ${summary.expiredSubscriptionsPruned} |`,
        `| **Invalid FCM Tokens Pruned** | ${summary.fcmTokensPruned} |`,
        '',
      ].join('\n');
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown);
    } catch (summaryErr) {
      console.warn('[UniFlow Dispatcher] Failed to write GitHub step summary:', summaryErr.message);
    }
  }

  return summary;
}

// -----------------------------------------------------------------------------
// Standalone execution entry point
// -----------------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const isExplicitLive = args.includes('--live') || process.env.DISPATCH_MODE === 'live';
  const isExplicitDryRun = args.includes('--dry-run') || args.includes('--test') || process.env.DISPATCH_MODE === 'dry-run';
  const isTestPush = args.includes('--test-push') || process.env.DISPATCH_MODE === 'test-push';

  let testRecipientUid = null;
  const recipIdx = args.indexOf('--test-recipient');
  if (recipIdx !== -1 && args[recipIdx + 1]) {
    testRecipientUid = args[recipIdx + 1];
  } else if (process.env.TEST_RECIPIENT_UID) {
    testRecipientUid = process.env.TEST_RECIPIENT_UID;
  }

  // When executed in GitHub Actions or explicitly requested, use live mode.
  // Otherwise in local environments without --dry-run or --live, default to dry-run safely.
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const mode = isTestPush
    ? 'test-push'
    : (isExplicitLive || isGitHubActions
        ? 'live'
        : (isExplicitDryRun ? 'dry-run' : 'dry-run'));

  console.log(`[UniFlow Dispatcher] Target execution mode: ${mode.toUpperCase()}`);

  let adminResult;
  try {
    adminResult = await initializeFirebaseAdmin();
  } catch (err) {
    if (mode === 'live' || mode === 'test-push') {
      console.error('[UniFlow Dispatcher] FATAL: Failed to initialize Firebase Admin in LIVE mode:', err.message);
      process.exit(1);
    }
    console.warn('[UniFlow Dispatcher] Firebase Admin initialization failed (dry-run mode fallback):', err.message);
    adminResult = { db: null, messaging: null, error: err.message };
  }

  // In live or test-push mode, missing or failed database connection MUST terminate with code 1
  if ((mode === 'live' || mode === 'test-push') && (!adminResult || !adminResult.db)) {
    console.error(
      '\n============================================================\n' +
      '[UniFlow Dispatcher] FATAL CONFIGURATION ERROR\n' +
      'Cannot execute in LIVE mode without a live Firestore connection.\n' +
      `Reason: ${adminResult?.error || 'Missing or invalid FIREBASE_SERVICE_ACCOUNT_KEY'}\n\n` +
      'Please ensure the GitHub repository secret "FIREBASE_SERVICE_ACCOUNT_KEY"\n' +
      'is configured with the Firebase Service Account JSON credentials for project uniflow-b7a88.\n' +
      '============================================================\n'
    );
    process.exit(1);
  }

  // In live or test-push mode, VAPID_PRIVATE_KEY is strictly required
  if ((mode === 'live' || mode === 'test-push') && !process.env.VAPID_PRIVATE_KEY) {
    console.error(
      '\n============================================================\n' +
      '[UniFlow Dispatcher] FATAL CONFIGURATION ERROR\n' +
      'Cannot execute in LIVE mode without VAPID_PRIVATE_KEY.\n' +
      'Please configure the GitHub repository secret "VAPID_PRIVATE_KEY".\n' +
      '============================================================\n'
    );
    process.exit(1);
  }

  const { db, messaging, maskedEmail, projectId } = adminResult || {};
  if (db && maskedEmail) {
    console.log(`[UniFlow Dispatcher] Authenticated with Firebase Project: ${projectId || 'uniflow-b7a88'} (Service Account: ${maskedEmail})`);
  }

  runReminderDispatcher({
    mode,
    dryRun: mode === 'dry-run',
    db,
    messaging,
    testRecipientUid,
    isTestPush,
  })
    .then((res) => {
      console.log('[UniFlow Dispatcher] Execution finished:', res);
      if (res.status === 'failed_all_pushes' || res.status === 'test_push_failed') {
        console.error('[UniFlow Dispatcher] Terminating with exit code 1 due to push failures.');
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('[UniFlow Dispatcher] Execution failed with unhandled error:', err);
      process.exit(1);
    });
}
