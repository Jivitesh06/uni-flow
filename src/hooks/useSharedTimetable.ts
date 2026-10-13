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
  isCorruptedTimetableDoc,
} from '../lib/sharedTimetable.ts';

export type SharedTimetableStatus =
  | 'loading'
  | 'loaded'
  | 'cached'
  | 'not_published'
  | 'invalid_profile'
  | 'error';

export interface UseSharedTimetableResult {
  sharedDoc: SharedTimetableDoc | null;
  loading: boolean;
  status: SharedTimetableStatus;
  isOfflineCached: boolean;
  error: Error | null;
  groupId: string | null;
  groupLabel: string;
}

export function useSharedTimetable(
  params: TimetableGroupParams | null
): UseSharedTimetableResult {
  const isProfileValid = Boolean(params && params.section && params.semester);
  const groupId = isProfileValid && params ? buildSharedGroupId(params) : null;
  const groupLabel = isProfileValid && params ? buildSharedGroupLabel(params) : '';

  // Synchronous cache hydration for 0ms startup
  const [sharedDoc, setSharedDoc] = useState<SharedTimetableDoc | null>(() => {
    if (!groupId) return null;
    return getSharedTimetableCache(groupId);
  });

  const [loading, setLoading] = useState<boolean>(!sharedDoc && !!groupId);
  const [status, setStatus] = useState<SharedTimetableStatus>(() => {
    if (!isProfileValid) return 'invalid_profile';
    if (sharedDoc) return 'cached';
    return 'loading';
  });
  const [isOfflineCached, setIsOfflineCached] = useState<boolean>(Boolean(sharedDoc));
  const [error, setError] = useState<Error | null>(null);
  const [prevGroupId, setPrevGroupId] = useState<string | null>(groupId);
  if (prevGroupId !== groupId) {
    setPrevGroupId(groupId);
    const cached = groupId ? getSharedTimetableCache(groupId) : null;
    setSharedDoc(cached);
    setStatus(!isProfileValid ? 'invalid_profile' : (cached ? 'cached' : (groupId ? 'loading' : 'not_published')));
    setIsOfflineCached(Boolean(cached));
    setLoading(!cached && Boolean(groupId));
  }

  useEffect(() => {
    if (!isProfileValid || !groupId) {
      setSharedDoc(null);
      setLoading(false);
      setStatus('invalid_profile');
      setIsOfflineCached(false);
      return;
    }

    // Check synchronous cache / seed when groupId changes
    const initialCache = getSharedTimetableCache(groupId);
    if (initialCache) {
      setSharedDoc(initialCache);
      setStatus('cached');
      setIsOfflineCached(true);
      setLoading(false);
    } else {
      setSharedDoc(null);
      setStatus('loading');
      setIsOfflineCached(false);
      setLoading(true);
    }

    const docRef = doc(db, 'sharedTimetables', groupId);
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const rawData = snap.data() as SharedTimetableDoc;
          // Guard against corrupted Firestore documents (e.g. room codes or LEC as subjects)
          if (isCorruptedTimetableDoc(rawData)) {
            console.warn(
              `[useSharedTimetable] Detected corrupted timetable document in Firestore for ${groupId} (contains room codes/LEC as subjects). Rejecting and falling back to clean offline dataset.`
            );
            const cleanFallback = getSharedTimetableCache(groupId);
            if (cleanFallback) {
              setSharedDoc(cleanFallback);
              setStatus('cached');
              setIsOfflineCached(true);
            } else {
              setSharedDoc(null);
              setStatus('error');
              setIsOfflineCached(false);
            }
            setLoading(false);
            return;
          }

          const sanitizedSlots = (rawData.slots || []).map((s) => ({
            ...s,
            subjectName: s.subjectCode?.trim() || s.subjectName,
          }));
          const data = { ...rawData, id: snap.id, slots: sanitizedSlots } as SharedTimetableDoc;
          setSharedDoc(data);
          setSharedTimetableCache(groupId, data);
          setStatus('loaded');
          setIsOfflineCached(false);
        } else {
          // If not in Firestore, check if we have a valid offline cache or pre-seeded dataset
          const fallback = getSharedTimetableCache(groupId);
          if (fallback) {
            setSharedDoc(fallback);
            setStatus('cached');
            setIsOfflineCached(true);
          } else {
            setSharedDoc(null);
            setStatus('not_published');
            setIsOfflineCached(false);
          }
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn('Shared timetable listener note (falling back to local cache/seed):', err);
        const fallback = getSharedTimetableCache(groupId);
        if (fallback) {
          setSharedDoc(fallback);
          setStatus('cached');
          setIsOfflineCached(true);
        } else {
          setSharedDoc(null);
          setStatus('error');
          setIsOfflineCached(false);
        }
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [groupId, isProfileValid]);

  return {
    sharedDoc,
    loading,
    status,
    isOfflineCached,
    error,
    groupId,
    groupLabel,
  };
}
