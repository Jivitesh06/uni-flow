import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface UseAdminAuthResult {
  isAdmin: boolean;
  isPublisher: boolean;
  loading: boolean;
  publisherDoc: Record<string, any> | null;
  authError: string | null;
  currentUid: string;
  currentEmail: string;
  refresh: () => Promise<void>;
}

/**
 * Hook to verify administrator & timetable publisher status.
 *
 * Real Authorization Boundary:
 * 1. Server-side: Cloud Firestore security rules mandate:
 *    `request.auth.token.role in ['admin', 'publisher'] || exists(/databases/$(database)/documents/authorizedPublishers/$(request.auth.uid))`
 *    Clients cannot self-grant this privilege because `/authorizedPublishers/{uid}` has `allow write: if false;`
 *    and `/users/{uid}` has `!('role' in request.resource.data)`.
 * 2. Client-side: Checks token claims, queries `/authorizedPublishers/{uid}`, and queries by registered email.
 */
export function useAdminAuth(): UseAdminAuthResult {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isPublisher, setIsPublisher] = useState<boolean>(false);
  const [publisherDoc, setPublisherDoc] = useState<Record<string, any> | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const checkAuthorization = useCallback(async () => {
    if (!currentUser) {
      setIsAdmin(false);
      setIsPublisher(false);
      setPublisherDoc(null);
      setAuthError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setAuthError(null);

    try {
      // 1. Check custom token claims if available
      const tokenResult = await currentUser.getIdTokenResult();
      const claimRole = tokenResult.claims?.role;
      const isClaimAdmin = claimRole === 'admin' || claimRole === 'publisher';

      if (isClaimAdmin) {
        setIsAdmin(true);
        setIsPublisher(true);
        setPublisherDoc({ role: claimRole, source: 'custom_claim' });
        setLoading(false);
        return;
      }

      // 2. Query Firestore authorizedPublishers document by UID
      const pubDocRef = doc(db, 'authorizedPublishers', currentUser.uid);
      const pubSnap = await getDoc(pubDocRef);

      if (pubSnap.exists()) {
        const data = pubSnap.data();
        if (data.active !== false) {
          setIsAdmin(true);
          setIsPublisher(true);
          setPublisherDoc(data);
          setLoading(false);
          return;
        }
      }

      // 3. Fallback: Query authorizedPublishers collection by email
      if (currentUser.email) {
        const emailLower = currentUser.email.trim().toLowerCase();
        const qEmail = query(
          collection(db, 'authorizedPublishers'),
          where('email', '==', emailLower)
        );
        const qSnap = await getDocs(qEmail);

        if (!qSnap.empty) {
          const matchDoc = qSnap.docs.find((d) => d.data().active !== false);
          if (matchDoc) {
            setIsAdmin(true);
            setIsPublisher(true);
            setPublisherDoc(matchDoc.data());
            setLoading(false);
            return;
          }
        }
      }

      // Not found in claims or authorizedPublishers
      setIsAdmin(false);
      setIsPublisher(false);
      setPublisherDoc(null);
    } catch (err: unknown) {
      console.warn('Admin authorization check failed:', err);
      const msg = (err as Error)?.message || 'Permission denied';
      setAuthError(msg);
      setIsAdmin(false);
      setIsPublisher(false);
      setPublisherDoc(null);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    checkAuthorization();
  }, [checkAuthorization]);

  return {
    isAdmin,
    isPublisher,
    loading,
    publisherDoc,
    authError,
    currentUid: currentUser?.uid || '',
    currentEmail: currentUser?.email || '',
    refresh: checkAuthorization,
  };
}
