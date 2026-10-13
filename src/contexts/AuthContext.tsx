import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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
  normalizeSection,
  normalizeSemester,
  deriveAcademicYears,
  parseStudentDetailsFromEmail,
} from '../lib/collegeEmail.ts';

import { isProfileComplete } from '../lib/academicProfile.ts';

import {
  getCachedUserProfile,
  setCachedUserProfile,
  clearCachedUserProfile,
} from '../lib/profileStorage.ts';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  semester?: number;
  section?: string;
  college?: string;
  program?: string;
  universityId?: string;
  batch?: string;
  expectedGraduationYear?: number;
  studentGroup?: 'G1' | 'G2' | 'ALL' | null;
  subjectGroups?: Record<string, 'G1' | 'G2'>;
  attendanceTarget: number;
  emailVerified: boolean;
  profileCompleted?: boolean;
  role?: string;
  createdAt: unknown;
  updatedAt?: unknown;
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

  // Request sequence counter prevents stale async responses from racing and overwriting newer profiles
  const profileFetchSeqRef = useRef<number>(0);

  // Track online/offline status and auto-sync user profile when connectivity returns
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      if (auth.currentUser) {
        createOrFetchProfile(auth.currentUser).catch((err) => {
          console.warn('[AuthContext] Profile revalidation after online event failed:', err);
        });
      }
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
    const requestId = ++profileFetchSeqRef.current;
    const ref = doc(db, 'users', user.uid);
    try {
      const snap = await getDoc(ref);

      // Discard stale in-flight responses if a newer request began or account switched
      if (requestId !== profileFetchSeqRef.current || auth.currentUser?.uid !== user.uid) {
        console.info('[AuthContext] Discarding stale in-flight profile fetch for:', user.uid);
        return (snap.exists() ? snap.data() : {}) as UserProfile;
      }

      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        if (data.semester !== undefined && data.semester !== null) {
          data.semester = normalizeSemester(data.semester);
        }
        data.profileCompleted = isProfileComplete(data);

        // Only update if explicit non-empty additionalData is provided (e.g. during registration)
        if (additionalData && Object.keys(additionalData).length > 0) {
          const merged: Record<string, any> = { ...data };
          for (const [k, v] of Object.entries(additionalData)) {
            if (v !== undefined) {
              merged[k] = v;
            }
          }
          if (merged.semester !== undefined && merged.semester !== null) {
            merged.semester = normalizeSemester(merged.semester);
          }
          if (merged.section) {
            merged.section = normalizeSection(merged.section);
          }
          merged.profileCompleted = isProfileComplete(merged as UserProfile);
          merged.updatedAt = serverTimestamp();
          await setDoc(ref, merged, { merge: true });
          const updated = merged as UserProfile;
          setCachedUserProfile(user.uid, updated);
          setUserProfile(updated);
          return updated;
        }

        setCachedUserProfile(user.uid, data);
        setUserProfile(data);
        return data;
      }

      // Automatically derive academic years from universityId or email only when valid
      const derived = deriveAcademicYears(additionalData?.universityId, user.email);
      const hasAcademic = Boolean(additionalData?.section && additionalData?.semester && additionalData?.universityId);
      const sem = additionalData?.semester !== undefined && additionalData?.semester !== null
        ? normalizeSemester(additionalData.semester)
        : undefined;
      const sec = additionalData?.section ? normalizeSection(additionalData.section) : '';
      const roll = additionalData?.universityId ? String(additionalData.universityId).trim() : '';

      // Create new profile without silently defaulting section or semester
      const profilePayload: Record<string, any> = {
        uid: user.uid,
        email: normalizeCollegeEmail(user.email ?? ''),
        displayName: user.displayName || user.email?.split('@')[0] || 'Student',
        attendanceTarget: additionalData?.attendanceTarget ?? 75,
        college: additionalData?.college || 'Chitkara University',
        program: additionalData?.program || 'BE-CSE',
        batch: additionalData?.batch || (sem === 5 ? '2024' : (derived.admissionYear || '2024')),
        emailVerified: user.emailVerified,
        profileCompleted: hasAcademic,
        createdAt: serverTimestamp(),
      };

      if (user.photoURL) profilePayload.photoURL = user.photoURL;
      if (sem !== undefined) profilePayload.semester = sem;
      if (sec) profilePayload.section = sec;
      if (roll) profilePayload.universityId = roll;
      if (additionalData?.studentGroup) profilePayload.studentGroup = additionalData.studentGroup;
      if (additionalData?.expectedGraduationYear || derived.expectedGraduationYear) {
        profilePayload.expectedGraduationYear =
          additionalData?.expectedGraduationYear || derived.expectedGraduationYear;
      }

      if (requestId !== profileFetchSeqRef.current || auth.currentUser?.uid !== user.uid) {
        console.info('[AuthContext] Discarding stale in-flight profile creation for:', user.uid);
        return profilePayload as UserProfile;
      }

      await setDoc(ref, profilePayload);
      const created = profilePayload as UserProfile;
      setCachedUserProfile(user.uid, created);
      setUserProfile(created);
      return created;
    } catch (err) {
      console.warn('Network issue fetching user profile, checking local cache:', err);
      // Check for valid existing local cache before falling back to empty profile
      const cached = getCachedUserProfile<UserProfile>(user.uid);
      if (cached && (cached.profileCompleted || cached.section || cached.semester)) {
        console.info('[AuthContext] Preserving valid cached profile during offline fetch:', user.uid);
        if (requestId === profileFetchSeqRef.current && auth.currentUser?.uid === user.uid) {
          setUserProfile(cached);
        }
        return cached;
      }

      if (requestId !== profileFetchSeqRef.current || auth.currentUser?.uid !== user.uid) {
        console.info('[AuthContext] Discarding stale in-flight profile error handler for:', user.uid);
        return (cached || {}) as UserProfile;
      }

      const derived = deriveAcademicYears(additionalData?.universityId, user.email);
      const sem = additionalData?.semester !== undefined && additionalData?.semester !== null
        ? normalizeSemester(additionalData.semester)
        : undefined;
      const sec = additionalData?.section ? normalizeSection(additionalData.section) : '';
      const roll = additionalData?.universityId ? String(additionalData.universityId).trim() : '';

      const fallbackProfile: UserProfile = {
        uid: user.uid,
        email: normalizeCollegeEmail(user.email ?? ''),
        displayName: user.displayName || user.email?.split('@')[0] || 'Student',
        photoURL: user.photoURL ?? undefined,
        attendanceTarget: 75,
        college: additionalData?.college || 'Chitkara University',
        program: additionalData?.program || 'BE-CSE',
        semester: sem,
        section: sec,
        universityId: roll,
        batch: additionalData?.batch || derived.admissionYear || '2024',
        expectedGraduationYear:
          additionalData?.expectedGraduationYear || derived.expectedGraduationYear || undefined,
        emailVerified: user.emailVerified,
        profileCompleted: Boolean(sec && sem && roll),
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

          // Pre-hydrate from localStorage for instant offline access without UI flicker
          // Explicitly clear profile if the newly switched user does not have a cached profile
          const cached = getCachedUserProfile<UserProfile>(user.uid);
          setUserProfile(cached || null);

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
    setUserProfile(getCachedUserProfile<UserProfile>(user.uid) || null);
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
    setUserProfile(null);
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
      setUserProfile(getCachedUserProfile<UserProfile>(user.uid) || null);
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
    profileFetchSeqRef.current++;
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
    profileFetchSeqRef.current++;
    const ref = doc(db, 'users', currentUser.uid);
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleaned[key] = value;
      }
    }
    // Prevent client from writing privileged fields that violate firestore.rules
    delete cleaned.role;
    delete cleaned.gmailAccessToken;
    delete cleaned.gmailRefreshToken;

    if (cleaned.semester !== undefined) {
      cleaned.semester = normalizeSemester(cleaned.semester);
    }
    if (cleaned.section !== undefined) {
      cleaned.section = normalizeSection(cleaned.section);
    }
    // Ensure attendanceTarget is always valid number for firestore rules
    if (cleaned.attendanceTarget === undefined) {
      cleaned.attendanceTarget = userProfile?.attendanceTarget ?? 75;
    } else {
      cleaned.attendanceTarget = Math.min(100, Math.max(50, Number(cleaned.attendanceTarget) || 75));
    }
    const merged = { ...userProfile, ...cleaned };
    cleaned.profileCompleted = isProfileComplete(merged as UserProfile);
    cleaned.updatedAt = serverTimestamp();

    await setDoc(ref, cleaned, { merge: true });
    setCachedUserProfile(currentUser.uid, merged as UserProfile);
    setUserProfile((prev) => (prev ? { ...prev, ...cleaned } : null));
  }

  async function deleteAccount() {
    if (!currentUser) return;
    profileFetchSeqRef.current++;
    clearCachedUserProfile(currentUser.uid);
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
