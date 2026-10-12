import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Callable: Register FCM device token for the authenticated user.
 */
export const registerFCMToken = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const { token } = data as { token: string };
  if (!token || typeof token !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Token is required');
  }

  await db.collection('users').doc(context.auth.uid).set(
    {
      fcmTokens: admin.firestore.FieldValue.arrayUnion(token),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { success: true };
});

/**
 * Firestore trigger: When a new notification is created, send FCM push if token exists.
 */
export const onNewNotification = functions.firestore
  .document('users/{uid}/notifications/{notifId}')
  .onCreate(async (snap, context) => {
    const notif = snap.data();
    const uid = context.params.uid;

    // Get user FCM tokens
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const tokens: string[] = userData?.fcmTokens ?? [];

    if (tokens.length === 0) {
      functions.logger.info(`No FCM tokens for uid ${uid}, notification stored in Firestore only`);
      return;
    }

    const message: admin.messaging.MulticastMessage = {
      notification: {
        title: notif.title,
        body: notif.body,
      },
      data: {
        type: notif.type,
        notifId: snap.id,
      },
      tokens,
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      functions.logger.info(
        `FCM: ${response.successCount} sent, ${response.failureCount} failed for uid ${uid}`
      );

      // Remove invalid tokens
      const invalidTokens: string[] = [];
      response.responses.forEach((resp, i) => {
        if (!resp.success && (
          resp.error?.code === 'messaging/invalid-registration-token' ||
          resp.error?.code === 'messaging/registration-token-not-registered'
        )) {
          invalidTokens.push(tokens[i]);
        }
      });

      if (invalidTokens.length > 0) {
        await db.collection('users').doc(uid).update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
        });
      }
    } catch (err) {
      functions.logger.error(`FCM send failed for uid ${uid}:`, err);
    }
  });
