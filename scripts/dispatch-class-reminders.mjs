#!/usr/bin/env node

/**
 * UniFlow — Class Reminder Push Dispatcher
 *
 * Designed to run on a trusted server-side scheduler (e.g., GitHub Actions cron)
 * completely free of charge, respecting Firebase Spark free tier constraints.
 *
 * Never requires exposing private service account keys in client-side code.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const CANONICAL_REMINDER_OFFSET = 10;

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
 * Prepares the standard FCM push message payload
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
      url: '/dashboard',
    },
    tokens,
  };
}

/**
 * Main dispatcher entry point
 */
export async function runReminderDispatcher(options = {}) {
  const { now = new Date(), dryRun = false, db = null, messaging = null } = options;

  console.log('------------------------------------------------------------');
  console.log(`[UniFlow Dispatcher] Running at ${now.toISOString()} (Local: ${now.toLocaleTimeString()})`);
  console.log(`[UniFlow Dispatcher] Target day of week: ${now.getDay()}`);
  console.log('------------------------------------------------------------');

  if (!db || !messaging) {
    console.log('[UniFlow Dispatcher] No live Firebase Admin connection provided (Dry-run / test mode).');
    return {
      status: 'success_dry_run',
      dispatchedCount: 0,
      timestamp: now.toISOString(),
    };
  }

  let totalDispatched = 0;
  let totalEvaluated = 0;

  try {
    const usersSnap = await db.collection('users').get();
    console.log(`[UniFlow Dispatcher] Evaluating ${usersSnap.docs.length} registered users...`);

    for (const userDoc of usersSnap.docs) {
      totalEvaluated++;
      const userData = userDoc.data();
      const uid = userDoc.id;
      const tokens = userData.fcmTokens || [];

      // Check pushSubscriptions subcollection if fcmTokens array is empty
      let allTokens = [...tokens];
      if (allTokens.length === 0) {
        const subsSnap = await db.collection('users').doc(uid).collection('pushSubscriptions').get();
        subsSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.token) allTokens.push(data.token);
        });
      }

      if (allTokens.length === 0) {
        continue;
      }

      // Read personal timetable slots
      const timetableSnap = await db
        .collection('users')
        .doc(uid)
        .collection('timetable')
        .where('dayOfWeek', '==', now.getDay())
        .where('isActive', '==', true)
        .get();

      const slots = timetableSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      for (const slot of slots) {
        if (!slot.startTime) continue;

        if (isSlotIn10MinWindow(slot.startTime, now)) {
          const notifId = buildDeterministicNotificationId(uid, slot, now, 'class_reminder', CANONICAL_REMINDER_OFFSET);

          // Check if already dispatched
          const notifRef = db.collection('users').doc(uid).collection('notifications').doc(notifId);
          const notifSnap = await notifRef.get();

          if (notifSnap.exists()) {
            console.log(`[UniFlow Dispatcher] Reminder ${notifId} already recorded for ${uid}, skipping.`);
            continue;
          }

          const payload = buildFcmPayload(slot, allTokens, CANONICAL_REMINDER_OFFSET);

          if (!dryRun) {
            const resp = await messaging.sendEachForMulticast(payload);
            console.log(`[UniFlow Dispatcher] Dispatched for ${uid} (${slot.subjectName}): ${resp.successCount} sent, ${resp.failureCount} failed`);

            // Record notification in Firestore
            await notifRef.set({
              uid,
              type: 'class_reminder',
              title: payload.notification.title,
              body: payload.notification.body,
              read: false,
              slotId: slot.id || null,
              subjectCode: slot.subjectCode || null,
              classDate: getLocalDateKey(now),
              reminderOffset: CANONICAL_REMINDER_OFFSET,
              createdAt: new Date(),
              source: 'background_cron',
            });

            // Clean up invalid tokens
            const deadTokens = [];
            resp.responses.forEach((r, idx) => {
              if (
                !r.success &&
                (r.error?.code === 'messaging/invalid-registration-token' ||
                  r.error?.code === 'messaging/registration-token-not-registered')
              ) {
                deadTokens.push(allTokens[idx]);
              }
            });

            if (deadTokens.length > 0) {
              console.log(`[UniFlow Dispatcher] Purging ${deadTokens.length} dead FCM tokens for ${uid}`);
              await db
                .collection('users')
                .doc(uid)
                .update({
                  fcmTokens: FieldValue.arrayRemove(...deadTokens),
                });
            }

            totalDispatched++;
          } else {
            console.log(`[UniFlow Dispatcher] [DRY RUN] Would dispatch reminder ${notifId} to ${allTokens.length} devices.`);
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
    timestamp: now.toISOString(),
  };
}

// Standalone execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--test');

  // Attempt to load admin credentials if present
  let adminApp = null;
  let db = null;
  let messaging = null;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    try {
      const admin = await import('firebase-admin');
      const creds = JSON.parse(serviceAccountKey);
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(creds),
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
