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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const CANONICAL_REMINDER_OFFSET = 10;

export const CANONICAL_VAPID_PUBLIC_KEY =
  'BCRFPJBd3uyEhTLTp3xvC_XC7xWKY5AGVtb_K-egveVehf03iaHpo1XkhOmFoimtl9uP-fhRaju5xkG1cTZePl0';
export const CANONICAL_VAPID_PRIVATE_KEY =
  'NSQpdpXPsFOHRBFq2Od5HxBlf2-YHtK6TEoRPV6U_CQ';
export const CANONICAL_VAPID_SUBJECT =
  'mailto:notifications@uniflow-cu.web.app';

/**
 * Formats a Date to YYYY-MM-DD
 */
export function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Constructs canonical deterministic notification ID for reminders
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
 * Evaluates whether a timetable slot starts within the target 10-minute reminder window
 * (window: between 8 and 12 minutes from the evaluation timestamp).
 */
export function isSlotIn10MinWindow(slotStartTime, now = new Date(), windowStartMin = 8, windowEndMin = 12) {
  if (!slotStartTime) return false;
  const [sh, sm] = slotStartTime.split(':').map(Number);
  const slotDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    sh,
    sm,
    0,
    0
  );

  const diffMs = slotDate.getTime() - now.getTime();
  const diffMinutes = diffMs / 60000;
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

  return {
    title,
    body,
    icon: '/icons/icon-192x192.png',
    badge: '/favicon.svg',
    url: '/timetable',
    notification: {
      title,
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/favicon.svg',
    },
    data: {
      type: 'class_reminder',
      slotId: String(slot.id || ''),
      subjectCode: String(slot.subjectCode || ''),
      startTime: String(slot.startTime || ''),
      url: '/timetable',
    },
  };
}

/**
 * Sends a standard Web Push notification using web-push library and VAPID keys
 */
export async function sendWebPushNotification(subscription, payload, vapidOptions = {}) {
  const webpush = await import('web-push');
  const pub = vapidOptions.publicKey || process.env.VAPID_PUBLIC_KEY || CANONICAL_VAPID_PUBLIC_KEY;
  const priv = vapidOptions.privateKey || process.env.VAPID_PRIVATE_KEY || CANONICAL_VAPID_PRIVATE_KEY;
  const subject = vapidOptions.subject || process.env.VAPID_SUBJECT || CANONICAL_VAPID_SUBJECT;

  webpush.default.setVapidDetails(subject, pub, priv);

  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

  return webpush.default.sendNotification(subscription, payloadString, {
    TTL: 86400,
    urgency: 'high',
  });
}

/**
 * Main dispatcher entry point
 */
export async function runReminderDispatcher(options = {}) {
  const { now = new Date(), dryRun = false, db = null, messaging = null, vapidOptions = {} } = options;

  console.log('------------------------------------------------------------');
  console.log(`[UniFlow Dispatcher] Running at ${now.toISOString()} (Local: ${now.toLocaleTimeString()})`);
  console.log(`[UniFlow Dispatcher] Target day of week: ${now.getDay()}`);
  console.log('------------------------------------------------------------');

  if (!db) {
    console.log('[UniFlow Dispatcher] No live Firestore connection provided (Dry-run / test mode).');
    return {
      status: 'success_dry_run',
      dispatchedCount: 0,
      timestamp: now.toISOString(),
    };
  }

  let totalDispatched = 0;
  let totalEvaluated = 0;
  let webPushSuccessCount = 0;
  let fcmSuccessCount = 0;

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

      // 3. Read personal timetable slots for today
      const timetableSnap = await db
        .collection('users')
        .doc(uid)
        .collection('timetable')
        .where('dayOfWeek', '==', now.getDay())
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
              (s) => s.dayOfWeek === now.getDay() && s.isActive !== false
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
          const notifId = buildDeterministicNotificationId(uid, slot, now, 'class_reminder', CANONICAL_REMINDER_OFFSET);

          // Check if already dispatched
          const notifRef = db.collection('users').doc(uid).collection('notifications').doc(notifId);
          const notifSnap = await notifRef.get();

          if (notifSnap.exists) {
            console.log(`[UniFlow Dispatcher] Reminder ${notifId} already recorded for ${uid}, skipping.`);
            continue;
          }

          const webPushPayload = buildWebPushPayload(slot, CANONICAL_REMINDER_OFFSET);

          if (!dryRun) {
            // A. Dispatch to Web Push subscriptions (iOS PWA, Android, Desktop)
            for (const sub of pushSubscriptions) {
              try {
                await sendWebPushNotification(
                  {
                    endpoint: sub.endpoint,
                    keys: sub.keys,
                  },
                  webPushPayload,
                  vapidOptions
                );
                webPushSuccessCount++;
                console.log(`[UniFlow Dispatcher] Web Push delivered to ${sub.platform || 'device'} for ${uid}`);
              } catch (wpErr) {
                // If subscription expired or unsubscribed, delete document
                if (wpErr.statusCode === 404 || wpErr.statusCode === 410) {
                  console.log(`[UniFlow Dispatcher] Subscription expired (${wpErr.statusCode}), removing: ${sub.id}`);
                  await db.collection('users').doc(uid).collection('pushSubscriptions').doc(sub.id).delete().catch(() => {});
                } else {
                  console.warn(`[UniFlow Dispatcher] Web Push delivery warning for ${uid}:`, wpErr.message);
                }
              }
            }

            // B. Dispatch to FCM tokens if available and messaging provided
            if (fcmTokens.length > 0 && messaging) {
              const fcmPayload = buildFcmPayload(slot, fcmTokens, CANONICAL_REMINDER_OFFSET);
              try {
                const resp = await messaging.sendEachForMulticast(fcmPayload);
                fcmSuccessCount += resp.successCount;
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
                  const adminModule = await import('firebase-admin');
                  await db
                    .collection('users')
                    .doc(uid)
                    .update({
                      fcmTokens: adminModule.default.firestore.FieldValue.arrayRemove(...deadTokens),
                    })
                    .catch(() => {});
                }
              } catch (fcmErr) {
                console.warn(`[UniFlow Dispatcher] FCM multicast error for ${uid}:`, fcmErr.message);
              }
            }

            // C. Record notification in Firestore with deterministic ID
            await notifRef.set({
              uid,
              type: 'class_reminder',
              title: webPushPayload.title,
              body: webPushPayload.body,
              read: false,
              slotId: slot.id || null,
              subjectCode: slot.subjectCode || null,
              classDate: getLocalDateKey(now),
              reminderOffset: CANONICAL_REMINDER_OFFSET,
              source: 'background_push_dispatcher',
              createdAt: new Date(),
            });

            totalDispatched++;
          } else {
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

  return {
    status: 'success',
    dispatchedCount: totalDispatched,
    evaluatedCount: totalEvaluated,
    webPushSuccessCount,
    fcmSuccessCount,
    timestamp: now.toISOString(),
  };
}

// Standalone execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--test');

  let adminApp = null;
  let db = null;
  let messaging = null;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    try {
      const admin = await import('firebase-admin');
      const creds = JSON.parse(serviceAccountKey);
      adminApp = admin.default.initializeApp({
        credential: admin.default.credential.cert(creds),
      });
      db = adminApp.firestore();
      messaging = adminApp.messaging();
    } catch (e) {
      console.warn('[UniFlow Dispatcher] Could not initialize firebase-admin from FIREBASE_SERVICE_ACCOUNT_KEY:', e.message);
    }
  }

  runReminderDispatcher({ dryRun: isDryRun || !adminApp, db, messaging })
    .then((res) => {
      console.log('[UniFlow Dispatcher] Run completed successfully:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[UniFlow Dispatcher] Run failed:', err);
      process.exit(1);
    });
}
