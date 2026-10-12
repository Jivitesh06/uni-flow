import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface UseAdminAuthResult {
  isAdmin: boolean;
  isPublisher: boolean;
  loading: boolean;
  publisherDoc: Record<string, any> | null;
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
 * 2. Client-side: Checks token claims and queries the server `/authorizedPublishers/{uid}` document.
 */
export function useAdminAuth(): UseAdminAuthResult {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isPublisher, setIsPublisher] = useState<boolean>(false);
  const [publisherDoc, setPublisherDoc] = useState<Record<string, any> | null>(null);

  async function checkAuthorization() {
    if (!currentUser) {
      setIsAdmin(false);
      setIsPublisher(false);
      setPublisherDoc(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. Check custom token claims if available
      const tokenResult = await currentUser.getIdTokenResult();
      const claimRole = tokenResult.claims?.role;
      const isClaimAdmin = claimRole === 'admin' || claimRole === 'publisher';

      // 2. Query Firestore authorizedPublishers collection (read: if isSignedIn())
      const pubDocRef = doc(db, 'authorizedPublishers', currentUser.uid);
      const pubSnap = await getDoc(pubDocRef);
      const isDocPublisher = pubSnap.exists();

      const authorized = isClaimAdmin || isDocPublisher;

      setIsAdmin(authorized);
      setIsPublisher(authorized);
      setPublisherDoc(isDocPublisher ? pubSnap.data() : null);
    } catch (err) {
      console.warn('Admin authorization check failed:', err);
      setIsAdmin(false);
      setIsPublisher(false);
      setPublisherDoc(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkAuthorization();
  }, [currentUser]);

  return {
    isAdmin,
    isPublisher,
    loading,
    publisherDoc,
    refresh: checkAuthorization,
  };
}
