import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Called when a new user is created via Firebase Auth.
 * Creates their Firestore profile.
 */
export const onUserCreated = functions.auth.user().onCreate(async (user) => {
  const profile = {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? '',
    photoURL: user.photoURL ?? null,
    attendanceTarget: 75,
    emailVerified: user.emailVerified,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection('users').doc(user.uid).set(profile, { merge: true });

  await admin.firestore()
    .collection('auditLogs')
    .add({
      type: 'user_created',
      uid: user.uid,
      email: user.email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  functions.logger.info(`User profile created for ${user.uid}`);
});

/**
 * Called when a user is deleted from Firebase Auth.
 * Cleans up user data.
 */
export const onUserDeleted = functions.auth.user().onDelete(async (user) => {
  const uid = user.uid;
  const batch = db.batch();

  // Delete user document
  batch.delete(db.collection('users').doc(uid));

  // Log the deletion
  const logRef = db.collection('auditLogs').doc();
  batch.set(logRef, {
    type: 'user_deleted',
    uid,
    email: user.email,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();
  functions.logger.info(`User data cleaned up for ${uid}`);
});

/**
 * Callable: Validate email domain against allowlist.
 * Call this from client after registration to verify the college email.
 */
export const validateEmailDomain = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const email: string = context.auth.token.email ?? '';
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN;

  if (!allowedDomain) {
    // No domain restriction configured — all emails allowed
    return { valid: true, message: 'No domain restriction configured' };
  }

  const domain = email.split('@')[1];
  const isValid = domain === allowedDomain;

  if (!isValid) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `This app requires a ${allowedDomain} email address. Your account (${email}) is not authorized.`
    );
  }

  return { valid: true, domain };
});
