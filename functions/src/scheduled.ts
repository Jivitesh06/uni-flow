import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { performGmailSync } from './gmail';

const db = admin.firestore();

/**
 * Scheduled: Run Gmail sync every 6 hours for all connected users.
 * Requires Firebase Blaze plan.
 * Cost note: Cloud Scheduler triggers are billed per job invocation.
 */
export const scheduledGmailSync = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (_context) => {
    functions.logger.info('Starting scheduled Gmail sync...');

    // Get all users with connected Gmail
    const connectionsSnap = await db
      .collectionGroup('emailConnections')
      .where('status', '==', 'connected')
      .where('provider', '==', 'gmail')
      .get();

    const uids = [...new Set(connectionsSnap.docs.map(d => d.data().uid))];
    functions.logger.info(`Syncing ${uids.length} connected Gmail accounts`);

    const results = await Promise.allSettled(
      uids.map(uid => performGmailSync(uid))
    );

    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        functions.logger.error(`Sync failed for uid ${uids[i]}:`, result.reason);
      }
    });
  });

/**
 * Scheduled: Check attendance and send alerts daily at 9 PM.
 * Requires Firebase Blaze plan.
 */
export const dailyAttendanceCheck = functions.pubsub
  .schedule('0 21 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (_context) => {
    functions.logger.info('Running daily attendance check...');

    const usersSnap = await db.collection('users').get();

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      const uid = user.uid;
      const target = (user.attendanceTarget ?? 75) / 100;

      try {
        // Get all subjects
        const subjectsSnap = await db
          .collection('users').doc(uid)
          .collection('subjects').get();

        // Get all attendance
        const attendanceSnap = await db
          .collection('users').doc(uid)
          .collection('attendance').get();

        const attendance = attendanceSnap.docs.map(d => d.data());

        for (const subDoc of subjectsSnap.docs) {
          const sub = subDoc.data();
          const subAtt = attendance.filter(a => a.subjectId === sub.id);
          const attended = subAtt.filter(a => a.status === 'present').length;
          const conducted = subAtt.filter(a => a.status !== 'not_marked' && a.status !== 'cancelled').length;

          if (conducted === 0) continue;

          const pct = attended / conducted;

          if (pct < target) {
            // Check if we already sent an alert today
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const existingAlert = await db
              .collection('users').doc(uid)
              .collection('notifications')
              .where('type', '==', 'attendance_alert')
              .where('subjectId', '==', sub.id)
              .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(today))
              .limit(1)
              .get();

            if (existingAlert.empty) {
              await db
                .collection('users').doc(uid)
                .collection('notifications')
                .add({
                  uid,
                  type: 'attendance_alert',
                  subjectId: sub.id,
                  title: `Low Attendance: ${sub.name}`,
                  body: `Your attendance in ${sub.name} is ${(pct * 100).toFixed(1)}%, below the ${(target * 100).toFixed(0)}% target.`,
                  read: false,
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
          }
        }
      } catch (err) {
        functions.logger.error(`Attendance check failed for uid ${uid}:`, err);
      }
    }
  });
