import { collection, addDoc, serverTimestamp, setDoc, doc, getDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase.ts';
import { isSlotApplicableToStudent } from './collegeEmail.ts';
import type { TimetableSlot, UserProfile } from '../types';

export interface NextClassReminderResult {
  nextSlot: TimetableSlot | null;
  minutesUntilStart: number | null;
  isWithin10MinWindow: boolean;
  reminderTriggerTime: Date | null;
  formattedCountdown: string;
  todaySlotsCount: number;
}

export const CANONICAL_REMINDER_OFFSET = 10;
const DISMISSED_KEY_PREFIX = 'uniflow_dismissed_notifications_';
const inFlightDispatches = new Set<string>();

/**
 * Formats a Date object to YYYY-MM-DD for stable daily deduplication keys
 */
export function getLocalDateKey(date: Date | string = new Date()): string {
  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      date = parsed;
    } else {
      return date;
    }
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Constructs a canonical deterministic notification document ID.
 * Standardized to CANONICAL_REMINDER_OFFSET (10m) so that checks across
 * scheduling, dismissal, and Firestore writes always match identically.
 */
export function buildDeterministicNotificationId(
  uid: string,
  slot: TimetableSlot,
  date: Date | string = new Date(),
  type = 'class_reminder',
  offsetMinutes = CANONICAL_REMINDER_OFFSET
): string {
  const dateKey = getLocalDateKey(date);
  const rawId = slot.id || slot.subjectCode || 'class';
  const cleanSlotId = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanTime = (slot.startTime || 'time').replace(/[^a-zA-Z0-9_-]/g, '');
  return `${cleanUid}_${cleanSlotId}_${dateKey}_${cleanTime}_${type}_${offsetMinutes}m`;
}

function getSafeLocalStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) return (globalThis as any).localStorage;
  return null;
}

/**
 * Retrieves the set of dismissed/deleted notification IDs for the given user.
 */
export function getDismissedNotificationIds(uid?: string): Set<string> {
  const storage = getSafeLocalStorage();
  if (!storage || !uid) return new Set();
  try {
    const raw = storage.getItem(`${DISMISSED_KEY_PREFIX}${uid}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

/**
 * Records that a notification was deleted or dismissed so that the background scheduler
 * or subsequent page visits will never recreate or redeliver it.
 * Tracks both the exact ID and the root slot prefix to neutralize any offset variance.
 */
export function markNotificationDismissed(notificationId: string, uid?: string): void {
  const storage = getSafeLocalStorage();
  if (!storage || !uid || !notificationId) return;
  try {
    const ids = getDismissedNotificationIds(uid);
    ids.add(notificationId);
    // Also strip trailing offset (e.g. "_10m", "_9m") to add the root slot prefix
    const rootPrefix = notificationId.replace(/_\d+m$/, '');
    ids.add(rootPrefix);
    const arr = Array.from(ids).slice(-300);
    storage.setItem(`${DISMISSED_KEY_PREFIX}${uid}`, JSON.stringify(arr));
  } catch {
    // ignore quota
  }
}

/**
 * Checks whether a notification with this ID or its root slot prefix has been dismissed or deleted.
 */
export function isNotificationDismissedOrDeleted(notificationId: string, uid?: string): boolean {
  if (!uid || !notificationId) return false;
  const dismissedSet = getDismissedNotificationIds(uid);
  if (dismissedSet.has(notificationId)) return true;
  const rootPrefix = notificationId.replace(/_\d+m$/, '');
  return dismissedSet.has(rootPrefix);
}

/**
 * Builds a deterministic storage key for class reminders.
 * Scoped by UID for safe multi-user isolation on shared devices.
 */
export function buildReminderStorageKey(slot: TimetableSlot, date = new Date(), uid?: string): string {
  const dateKey = getLocalDateKey(date);
  const identifier = slot.id || slot.subjectCode || 'class';
  const userPart = uid ? uid.replace(/[^a-zA-Z0-9_-]/g, '_') : 'anon';
  return `uniflow_reminder_sent_${userPart}_${dateKey}_${identifier}_${slot.startTime}`;
}

/**
 * Checks whether a reminder for this class slot has already been dispatched today
 */
export function hasReminderBeenSent(slot: TimetableSlot, date = new Date(), uid?: string): boolean {
  if (uid) {
    const detId = buildDeterministicNotificationId(uid, slot, date, 'class_reminder', CANONICAL_REMINDER_OFFSET);
    if (isNotificationDismissedOrDeleted(detId, uid)) return true;
  }
  const storage = getSafeLocalStorage();
  if (!storage) return false;

  // Check UID-scoped key
  if (uid) {
    const keyWithUid = buildReminderStorageKey(slot, date, uid);
    if (storage.getItem(keyWithUid) !== null) return true;
  }

  // Fallback to legacy un-scoped key
  const legacyKey = `uniflow_reminder_sent_${getLocalDateKey(date)}_${slot.id || slot.subjectCode || 'class'}_${slot.startTime}`;
  return storage.getItem(legacyKey) !== null;
}

/**
 * Marks that a reminder has been sent today for this class slot
 */
export function markReminderSent(slot: TimetableSlot, date = new Date(), uid?: string): void {
  const storage = getSafeLocalStorage();
  if (!storage) return;
  if (uid) {
    const keyWithUid = buildReminderStorageKey(slot, date, uid);
    storage.setItem(keyWithUid, new Date().toISOString());
  }
  const legacyKey = `uniflow_reminder_sent_${getLocalDateKey(date)}_${slot.id || slot.subjectCode || 'class'}_${slot.startTime}`;
  storage.setItem(legacyKey, new Date().toISOString());
}

/**
 * Synthesizes a melodic reminder chime using Web Audio API
 * Generates an audible chime even if device notification sounds are muted or blocked
 */
export function playReminderChime(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return false;
    const ctx = new AudioCtx();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // First tone: 659.25 Hz (E5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.3, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Second tone: 880.00 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.15);
    gain2.gain.setValueAtTime(0.001, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.35, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);

    // Clean up audio context when tones complete
    const cleanup = () => {
      try {
        if (ctx.state !== 'closed') {
          ctx.close().catch(() => {});
        }
      } catch {
        // ignore
      }
    };
    osc2.onended = cleanup;
    setTimeout(cleanup, 1000);

    return true;
  } catch (err) {
    console.warn('Web Audio chime playback error:', err);
    return false;
  }
}

/**
 * Calculates the next upcoming class for today and evaluates the 10-minute reminder window.
 * Strictly respects student group (G1, G2, ALL) and filters out classes from other groups
 * or classes that have already started.
 */
export function calculateNextClassReminder(
  slots: TimetableSlot[],
  studentGroup: 'G1' | 'G2' | 'ALL' | null | undefined,
  now = new Date()
): NextClassReminderResult {
  const currentDay = now.getDay();

  // 1. Filter slots for today and applicable to student's group
  const todayApplicableSlots = slots
    .filter((s) => s.dayOfWeek === currentDay && s.isActive !== false)
    .filter((s) => isSlotApplicableToStudent(s.group, studentGroup))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (todayApplicableSlots.length === 0) {
    return {
      nextSlot: null,
      minutesUntilStart: null,
      isWithin10MinWindow: false,
      reminderTriggerTime: null,
      formattedCountdown: '',
      todaySlotsCount: 0,
    };
  }

  // 2. Find the earliest slot whose start time is strictly in the future
  for (const slot of todayApplicableSlots) {
    const [h, m] = slot.startTime.split(':').map(Number);
    const slotStartDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      h,
      m,
      0,
      0
    );

    const diffMs = slotStartDate.getTime() - now.getTime();
    if (diffMs > 0) {
      const diffMinutes = diffMs / 60000;
      const roundedMinutes = Math.ceil(diffMinutes);

      // Trigger window: between 0.5 and 10.0 minutes before class start
      // diffMinutes >= 0.5 prevents stale reminders from firing on app open when class has already started or is in session
      const isWithin10MinWindow = diffMinutes <= 10.0 && diffMinutes >= 0.5;

      // The ideal reminder timestamp is T - 10 minutes
      const reminderTriggerTime = new Date(slotStartDate.getTime() - CANONICAL_REMINDER_OFFSET * 60 * 1000);

      // Format countdown text
      const totalSec = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;
      let formattedCountdown = '';
      if (hours > 0) {
        formattedCountdown = `${hours}h ${mins}m ${secs}s`;
      } else {
        formattedCountdown = `${mins}m ${secs}s`;
      }

      return {
        nextSlot: slot,
        minutesUntilStart: roundedMinutes,
        isWithin10MinWindow,
        reminderTriggerTime,
        formattedCountdown,
        todaySlotsCount: todayApplicableSlots.length,
      };
    }
  }

  // All classes for today have already started or concluded
  return {
    nextSlot: null,
    minutesUntilStart: null,
    isWithin10MinWindow: false,
    reminderTriggerTime: null,
    formattedCountdown: '',
    todaySlotsCount: todayApplicableSlots.length,
  };
}

/**
 * Creates and displays a system push / web notification with sound
 */
export async function dispatchClassReminderNotification(
  slot: TimetableSlot,
  minutesLeft: number = CANONICAL_REMINDER_OFFSET,
  uid?: string
): Promise<boolean> {
  // Always use CANONICAL_REMINDER_OFFSET for stable daily deduplication and dismissal matching
  const deterministicId = uid
    ? buildDeterministicNotificationId(uid, slot, new Date(), 'class_reminder', CANONICAL_REMINDER_OFFSET)
    : `local_${slot.id || slot.subjectCode}_${getLocalDateKey()}_${slot.startTime}_${CANONICAL_REMINDER_OFFSET}m`;

  // 1. Check if user has previously dismissed or deleted this notification
  if (uid && isNotificationDismissedOrDeleted(deterministicId, uid)) {
    return false;
  }

  // 2. Prevent concurrent duplicate dispatches
  if (inFlightDispatches.has(deterministicId)) {
    return false;
  }
  inFlightDispatches.add(deterministicId);

  try {
    // Always play the Web Audio chime for instant audible feedback
    playReminderChime();

    const title = `Class in ${minutesLeft} mins: ${slot.subjectName}`;
    const body = `${slot.startTime} – ${slot.endTime} | Room: ${slot.room || 'TBA'}${
      slot.faculty ? ` | Faculty: ${slot.faculty}` : ''
    }`;

    const options = {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/favicon.svg',
      tag: `uniflow-class-reminder-${slot.id || slot.subjectCode}-${slot.startTime}`,
      renotify: true,
      requireInteraction: true,
      data: {
        url: '/dashboard',
        classId: slot.id,
        startTime: slot.startTime,
        subjectCode: slot.subjectCode,
      },
    } as NotificationOptions & { renotify?: boolean };

    let notificationShown = false;

    // 1. Try displaying via Service Worker registration
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && 'showNotification' in reg) {
          await reg.showNotification(title, options);
          notificationShown = true;
        }
      } catch (err) {
        console.warn('Service worker showNotification failed, trying fallback:', err);
      }
    }

    // 2. Fallback to standard Notification constructor if service worker wasn't ready
    if (!notificationShown && typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission === 'granted') {
          const notif = new Notification(title, options);
          notif.onclick = () => {
            window.focus();
            window.location.href = '/dashboard';
            notif.close();
          };
          notificationShown = true;
        }
      } catch (err) {
        console.warn('Fallback Notification constructor failed:', err);
      }
    }

    // 3. Mark reminder as sent locally to avoid duplicates today
    markReminderSent(slot, new Date(), uid);

    // 4. Log reminder in Firestore user notifications subcollection with deterministic ID (idempotent write)
    if (uid) {
      try {
        const notifRef = doc(db, 'users', uid, 'notifications', deterministicId);
        const existingSnap = await getDoc(notifRef);
        if (!existingSnap.exists()) {
          await setDoc(notifRef, {
            uid,
            type: 'class_reminder',
            title,
            body,
            read: false,
            slotId: slot.id || null,
            subjectCode: slot.subjectCode || null,
            classDate: getLocalDateKey(),
            reminderOffset: CANONICAL_REMINDER_OFFSET,
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.warn('Failed to record notification in Firestore:', err);
      }
    }

    return notificationShown;
  } finally {
    // Release in-flight lock after brief debounce window to absorb strict mode/multi-component renders
    setTimeout(() => {
      inFlightDispatches.delete(deterministicId);
    }, 4000);
  }
}

/**
 * Registers Chromium Notification Trigger (TimestampTrigger) when supported by the browser.
 * Note: Chromium experimental API; standard browsers require server-side Web Push / FCM.
 */
export async function scheduleTimestampTriggerIfSupported(
  slot: TimetableSlot,
  targetTime: Date
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const hasTrigger =
    'showTrigger' in Notification.prototype &&
    'TimestampTrigger' in window;

  if (!hasTrigger || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const TimestampTriggerClass = (window as unknown as { TimestampTrigger: new (ts: number) => unknown }).TimestampTrigger;

    const title = `Class in 10 mins: ${slot.subjectName}`;
    const body = `${slot.startTime} – ${slot.endTime} | Room: ${slot.room || 'TBA'}${
      slot.faculty ? ` | Faculty: ${slot.faculty}` : ''
    }`;

    await reg.showNotification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/favicon.svg',
      tag: `uniflow-scheduled-${slot.id || slot.subjectCode}-${slot.startTime}`,
      data: {
        url: '/dashboard',
        classId: slot.id,
        startTime: slot.startTime,
      },
      // @ts-expect-error Chromium experimental Notification Triggers API
      showTrigger: new TimestampTriggerClass(targetTime.getTime()),
    });

    return true;
  } catch (err) {
    console.warn('TimestampTrigger registration failed:', err);
    return false;
  }
}

/**
 * Detects client runtime platform for push capability logging and telemetry.
 */
export function detectPlatform(): 'ios_pwa' | 'ios_safari' | 'android' | 'desktop' | 'unknown' {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);

  if (isIOS) {
    return isStandalone ? 'ios_pwa' : 'ios_safari';
  }
  if (/Android/i.test(ua)) {
    return 'android';
  }
  return 'desktop';
}

/**
 * Converts a base64 VAPID string to a Uint8Array for PushManager subscription
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const CANONICAL_VAPID_PUBLIC_KEY =
  'BCRFPJBd3uyEhTLTp3xvC_XC7xWKY5AGVtb_K-egveVehf03iaHpo1XkhOmFoimtl9uP-fhRaju5xkG1cTZePl0';

/**
 * Stores Web Push subscription endpoint and keys in Cloud Firestore
 */
export async function savePushSubscriptionToFirestore(
  uid: string,
  subscription: PushSubscription
): Promise<void> {
  try {
    const subJson = subscription.toJSON();
    const endpointStr = subscription.endpoint || '';
    let endpointHash = 'default_sub';
    try {
      endpointHash = (typeof btoa === 'function' ? btoa(endpointStr) : '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(-32);
    } catch {
      endpointHash = endpointStr.slice(-24).replace(/[^a-zA-Z0-9]/g, '_');
    }
    if (!endpointHash) endpointHash = 'default_sub';

    const subRef = doc(db, 'users', uid, 'pushSubscriptions', endpointHash);

    await setDoc(
      subRef,
      {
        uid,
        endpoint: subscription.endpoint,
        keys: subJson.keys || null,
        platform: detectPlatform(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // Also update parent user document for query visibility
    const userRef = doc(db, 'users', uid);
    await setDoc(
      userRef,
      {
        hasActivePushSubscription: true,
        lastPushRegistrationAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Failed to store push subscription in Firestore:', err);
  }
}

/**
 * Stores registered FCM Device Token on the user's document in Firestore
 */
export async function saveFCMTokenToFirestore(uid: string, token: string): Promise<void> {
  if (!uid || !token) return;
  try {
    const userRef = doc(db, 'users', uid);
    await setDoc(
      userRef,
      {
        fcmTokens: arrayUnion(token),
        platform: detectPlatform(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Failed to store FCM token in Firestore:', err);
  }
}

/**
 * Registers Web Push subscription and FCM token with Firestore
 */
export async function registerPushDeviceToken(uid: string): Promise<string | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !uid) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    let registeredIdentifier: string | null = null;

    const envVapid =
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_VAPID_KEY) ||
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VAPID_PUBLIC_KEY) ||
      CANONICAL_VAPID_PUBLIC_KEY;

    // 1. Standard Web Push Subscription via PushManager
    if ('pushManager' in reg) {
      try {
        let sub = await reg.pushManager.getSubscription();

        if (!sub && envVapid) {
          try {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(envVapid),
            });
          } catch (subErr) {
            console.warn('Web pushManager.subscribe notice:', subErr);
          }
        }

        if (sub) {
          await savePushSubscriptionToFirestore(uid, sub);
          registeredIdentifier = sub.endpoint;
        }
      } catch (pmErr) {
        console.warn('PushManager registration notice:', pmErr);
      }
    }

    // 2. Firebase Cloud Messaging (FCM) Web SDK Token if available
    try {
      const { messaging } = await import('./firebase.ts');
      const msg = await messaging();
      if (msg) {
        const { getToken } = await import('firebase/messaging');

        const fcmToken = await getToken(msg, {
          vapidKey: envVapid || undefined,
          serviceWorkerRegistration: reg,
        });

        if (fcmToken) {
          await saveFCMTokenToFirestore(uid, fcmToken);
          registeredIdentifier = fcmToken;
        }
      }
    } catch (fcmErr) {
      // FCM is optional when running without Google Play Services or if VAPID is unconfigured
      console.info('Firebase Messaging getToken note:', fcmErr);
    }

    return registeredIdentifier;
  } catch (err) {
    console.warn('registerPushDeviceToken failed:', err);
    return null;
  }
}

/**
 * Requests notification permission from user and subscribes to push manager if available
 */
export async function requestClassNotificationPermission(uid?: string): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  const permission = await Notification.requestPermission();

  if (permission === 'granted') {
    localStorage.setItem('uniflow_reminders_enabled', 'true');

    if (uid) {
      await registerPushDeviceToken(uid);
    }
  }

  return permission;
}
