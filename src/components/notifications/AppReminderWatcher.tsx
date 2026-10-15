import { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSharedTimetable } from '../../hooks/useSharedTimetable';
import { useCollection } from '../../hooks/useFirestore';
import { useClassReminder } from '../../hooks/useClassReminder';
import {
  resolveStudentAcademicGroup,
  mergeSharedAndPersonalSlots,
  buildSharedGroupId,
} from '../../lib/sharedTimetable';
import type { TimetableSlot } from '../../types';

/**
 * Headless application-level class reminder watcher.
 * Ensures the 10-minute class reminder scheduler ticks consistently
 * across all protected pages (Timetable, Attendance, Calendar, Dashboard, Settings).
 */
export function AppReminderWatcher() {
  const { currentUser, userProfile } = useAuth();
  const uid = currentUser?.uid ?? '';
  const { data: personalSlots } = useCollection<TimetableSlot>(`users/${uid}/timetable`);

  const groupResolution = useMemo(() => {
    return resolveStudentAcademicGroup(userProfile);
  }, [userProfile]);

  const groupParams = groupResolution.params;
  const { sharedDoc } = useSharedTimetable(groupParams);

  const effectiveSlots = useMemo(() => {
    return mergeSharedAndPersonalSlots(
      sharedDoc?.slots || [],
      personalSlots,
      groupParams ? buildSharedGroupId(groupParams) : undefined
    );
  }, [sharedDoc?.slots, personalSlots, groupParams]);

  useClassReminder(effectiveSlots, userProfile);

  return null;
}
