import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  TimetableGroupParams,
  SharedTimetableDoc,
  buildSharedGroupId,
  buildSharedGroupLabel,
  getSharedTimetableCache,
  setSharedTimetableCache,
} from '../lib/sharedTimetable.ts';

export function useSharedTimetable(params: TimetableGroupParams | null) {
  const groupId = params ? buildSharedGroupId(params) : null;
  const groupLabel = params ? buildSharedGroupLabel(params) : '';

  // Synchronous cache hydration for 0ms offline rendering
  const [sharedDoc, setSharedDoc] = useState<SharedTimetableDoc | null>(() => {
    if (!groupId) return null;
    return getSharedTimetableCache(groupId);
  });

  const [loading, setLoading] = useState<boolean>(!sharedDoc && !!groupId);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!groupId) {
      setSharedDoc(null);
      setLoading(false);
      return;
    }

    // Try loading latest from cache if switching groups
    const cached = getSharedTimetableCache(groupId);
    if (cached) {
      setSharedDoc(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const docRef = doc(db, 'sharedTimetables', groupId);
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as SharedTimetableDoc;
          setSharedDoc(data);
          setSharedTimetableCache(groupId, data);
        } else {
          setSharedDoc(null);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn('Shared timetable listener note (falling back to local cache/personal):', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [groupId]);

  return {
    sharedDoc,
    loading,
    error,
    groupId,
    groupLabel,
  };
}
