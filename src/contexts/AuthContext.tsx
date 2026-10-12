import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db, ensureAuthPersistence } from '../lib/firebase';
import {
  CHITKARA_DOMAIN,
  normalizeCollegeEmail,
  parseStudentDetailsFromEmail,
} from '../lib/collegeEmail';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  semester?: string;
  section?: string;
  college?: string;
  universityId?: string;
  batch?: string;
  expectedGraduationYear?: number;
  attendanceTarget: number;
  emailVerified: boolean;
  createdAt: unknown;
}

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isOnline: boolean;
  isEmailVerified: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (
    email: string,
    password: string,
    name: string,
    initialProfile?: Partial<UserProfile>
  ) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>;
  deleteAccount: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  reloadUser: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Track online/offline status to prevent spurious logouts during disconnection
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function createOrFetchProfile(
    user: User,
    additionalData?: Partial<UserProfile>
  ): Promise<UserProfile> {
    const ref = doc(db, 'users', user.uid);
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        if (additionalData && Object.keys(additionalData).length > 0) {
          const merged = { ...data, ...additionalData };
          await setDoc(ref, merged, { merge: true });
          setUserProfile(merged);
          return merged;
        }
        setUserProfile(data);
        return data;
      }

      // Automatically parse student details from email (e.g. jivitesh1260.be24@chitkarauniversity.edu.in)
      const details = parseStudentDetailsFromEmail(user.email ?? '');

      // Create new profile with structured student fields
      const profile: UserProfile = {
        uid: user.uid,
        email: normalizeCollegeEmail(user.email ?? ''),
        displayName: user.displayName ?? '',
        photoURL: user.photoURL ?? undefined,
        attendanceTarget: 75,
        college: 'Chitkara University',
        section: additionalData?.section || 'BE-CSE-5A',
        universityId: additionalData?.universityId || details.universityId || '',
        batch: additionalData?.batch || details.batch || '2024',
        expectedGraduationYear:
          additionalData?.expectedGraduationYear || details.expectedGraduationYear || 2028,
        emailVerified: user.emailVerified,
        createdAt: serverTimestamp(),
        ...additionalData,
      };
      await setDoc(ref, profile);
      setUserProfile(profile);
      return profile;
    } catch (err) {
      console.warn('Network issue fetching user profile, using local session profile:', err);
      const details = parseStudentDetailsFromEmail(user.email ?? '');
      const fallbackProfile: UserProfile = {
        uid: user.uid,
        email: normalizeCollegeEmail(user.email ?? ''),
        displayName: user.displayName || user.email?.split('@')[0] || 'Student',
        photoURL: user.photoURL ?? undefined,
        attendanceTarget: 75,
        college: 'Chitkara University',
        section: additionalData?.section || 'BE-CSE-5A',
        universityId: additionalData?.universityId || details.universityId,
        batch: additionalData?.batch || details.batch,
        expectedGraduationYear:
          additionalData?.expectedGraduationYear || details.expectedGraduationYear,
        emailVerified: user.emailVerified,
        createdAt: null,
      };
      setUserProfile(fallbackProfile);
      return fallbackProfile;
    }
  }

  // Centralized Firebase Auth listener with persistence
  useEffect(() => {
    // Ensure persistence is applied on initialization
    ensureAuthPersistence().catch(() => {});

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (user) {
          setCurrentUser(user);
          setIsEmailVerified(Boolean(user.emailVerified));
          await createOrFetchProfile(user);
        } else {
          setCurrentUser(null);
          setUserProfile(null);
          setIsEmailVerified(false);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Firebase onAuthStateChanged error:', error);
        // Do not immediately sign out on network error
        if (navigator.onLine) {
          setCurrentUser(null);
          setUserProfile(null);
          setIsEmailVerified(false);
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  function validateEmailDomain(email: string | null | undefined) {
    const allowedDomain = import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || CHITKARA_DOMAIN;
    if (allowedDomain && email) {
      const normalized = normalizeCollegeEmail(email);
      const domain = normalized.split('@')[1];
      if (domain !== allowedDomain) {
        throw new Error(
          `Unauthorized email domain. Only official accounts ending in @${allowedDomain} are authorized.`
        );
      }
    }
  }

  async function signIn(email: string, password: string): Promise<User> {
    await ensureAuthPersistence();
    const normalizedEmail = normalizeCollegeEmail(email);
    validateEmailDomain(normalizedEmail);
    const { user } = await signInWithEmailAndPassword(auth, normalizedEmail, password);
    validateEmailDomain(user.email);
    setCurrentUser(user);
    setIsEmailVerified(Boolean(user.emailVerified));
    await createOrFetchProfile(user);
    return user;
  }

  async function signUp(
    email: string,
    password: string,
    name: string,
    initialProfile?: Partial<UserProfile>
  ): Promise<User> {
    await ensureAuthPersistence();
    const normalizedEmail = normalizeCollegeEmail(email);
    validateEmailDomain(normalizedEmail);
    const { user } = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    validateEmailDomain(user.email);
    await updateProfile(user, { displayName: name.trim() });
    try {
      await sendEmailVerification(user);
    } catch (e) {
      console.warn('Verification email send issue:', e);
    }
    setCurrentUser(user);
    setIsEmailVerified(Boolean(user.emailVerified));
    await createOrFetchProfile(user, initialProfile);
    return user;
  }

  async function signInWithGoogle(): Promise<User> {
    await ensureAuthPersistence();
    try {
      const { user } = await signInWithPopup(auth, googleProvider);
      try {
        validateEmailDomain(user.email);
      } catch (domainErr) {
        await signOut(auth);
        setCurrentUser(null);
        setUserProfile(null);
        setIsEmailVerified(false);
        throw domainErr;
      }
      setCurrentUser(user);
      setIsEmailVerified(Boolean(user.emailVerified));
      await createOrFetchProfile(user);
      return user;
    } catch (err: unknown) {
      const authErr = err as { code?: string; message?: string };
      if (authErr.code === 'auth/popup-closed-by-user') {
        throw new Error('Google sign-in was cancelled.');
      } else if (authErr.code === 'auth/popup-blocked') {
        throw new Error('Google sign-in popup was blocked by browser. Please allow popups.');
      } else if (authErr.code === 'auth/network-request-failed') {
        throw new Error('Network error during Google sign-in. Please check your connection.');
      }
      throw err;
    }
  }

  async function resendVerificationEmail(): Promise<void> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in. Please sign in first.');
    }
    if (user.emailVerified) {
      setIsEmailVerified(true);
      throw new Error('This account email is already verified.');
    }
    await sendEmailVerification(user);
  }

  async function reloadUser(): Promise<boolean> {
    if (!auth.currentUser) {
      setIsEmailVerified(false);
      return false;
    }
    await auth.currentUser.reload();
    const updatedUser = auth.currentUser;
    const verified = Boolean(updatedUser?.emailVerified);
    setIsEmailVerified(verified);

    // Provide a fresh object reference so React components listening to currentUser re-render
    if (updatedUser) {
      const userClone = Object.create(updatedUser);
      Object.assign(userClone, updatedUser);
      setCurrentUser(userClone);
    }

    if (verified && updatedUser) {
      try {
        const ref = doc(db, 'users', updatedUser.uid);
        await setDoc(ref, { emailVerified: true }, { merge: true });
        setUserProfile((prev) => (prev ? { ...prev, emailVerified: true } : null));
      } catch (err) {
        console.warn('Could not sync emailVerified to Firestore profile:', err);
      }
    }
    return verified;
  }

  async function logout() {
    await signOut(auth);
    // Thoroughly clear state to ensure no private information remains visible
    setCurrentUser(null);
    setUserProfile(null);
    setIsEmailVerified(false);
  }

  async function resetPassword(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    await sendPasswordResetEmail(auth, normalizedEmail);
  }

  async function updateUserProfile(data: Partial<UserProfile>) {
    if (!currentUser) return;
    const ref = doc(db, 'users', currentUser.uid);
    await setDoc(ref, data, { merge: true });
    setUserProfile((prev) => (prev ? { ...prev, ...data } : null));
  }

  async function deleteAccount() {
    if (!currentUser) return;
    await deleteUser(currentUser);
    setCurrentUser(null);
    setUserProfile(null);
    setIsEmailVerified(false);
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        isOnline,
        isEmailVerified,
        signIn,
        signUp,
        signInWithGoogle,
        logout,
        resetPassword,
        updateUserProfile,
        deleteAccount,
        resendVerificationEmail,
        reloadUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
