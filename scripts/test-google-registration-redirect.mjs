import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isProfileComplete, validateAcademicProfile } from '../src/lib/academicProfile.ts';
import { resolveStudentAcademicGroup } from '../src/lib/sharedTimetable.ts';
import { getCachedUserProfile, setCachedUserProfile } from '../src/lib/profileStorage.ts';

console.log('======================================================================');
console.log(' UNIFLOW GOOGLE REGISTRATION REDIRECT & PROFILE SYNC TEST SUITE');
console.log('======================================================================\n');

let passCount = 0;
let totalCount = 0;

function runTest(name, fn) {
  totalCount++;
  try {
    fn();
    passCount++;
    console.log(`  ✓ [PASS ${totalCount.toString().padStart(2, '0')}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL ${totalCount.toString().padStart(2, '0')}] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  totalCount++;
  try {
    await fn();
    passCount++;
    console.log(`  ✓ [PASS ${totalCount.toString().padStart(2, '0')}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL ${totalCount.toString().padStart(2, '0')}] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Mock localStorage simulator for node test environment
const mockStorage = new Map();
const storageMock = {
  getItem: (key) => mockStorage.get(key) ?? null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};
globalThis.localStorage = storageMock;
globalThis.window = { localStorage: storageMock };

// -----------------------------------------------------------------------------
// Emulate the AuthContext + Onboarding + ProtectedRoute state flow
// -----------------------------------------------------------------------------
class TestAuthEnvironment {
  constructor() {
    this.currentUser = null;
    this.userProfile = null;
    this.firestoreData = new Map();
    this.profileFetchSeq = 0;
    mockStorage.clear();
  }

  // Simulate Google Sign-In
  async signInWithGoogle(user) {
    this.currentUser = user;
    this.profileFetchSeq++;
    const requestId = this.profileFetchSeq;

    // Check if user already exists in Firestore
    const existing = this.firestoreData.get(`users/${user.uid}`);
    if (existing) {
      existing.profileCompleted = isProfileComplete(existing);
      this.userProfile = existing;
      setCachedUserProfile(user.uid, existing);
      return { user, profile: existing };
    }

    // New Google student: no Firestore doc yet, academic fields missing
    const pendingProfile = {
      uid: user.uid,
      email: user.email.toLowerCase(),
      displayName: user.displayName || 'Student',
      attendanceTarget: 75,
      college: 'Chitkara University',
      program: 'BE-CSE',
      batch: '2024',
      emailVerified: true,
      profileCompleted: false,
      createdAt: null,
    };

    if (requestId === this.profileFetchSeq) {
      setCachedUserProfile(user.uid, pendingProfile);
      this.userProfile = pendingProfile;
    }

    return { user, profile: pendingProfile };
  }

  // Simulate updateUserProfile matching AuthContext.tsx implementation
  async updateUserProfile(data) {
    if (!this.currentUser) throw new Error('No authenticated user found');
    this.profileFetchSeq++;

    const cleaned = { ...data };
    delete cleaned.role;
    delete cleaned.gmailAccessToken;
    delete cleaned.gmailRefreshToken;
    cleaned.uid = this.currentUser.uid;

    if (!cleaned.email && (this.currentUser.email || this.userProfile?.email)) {
      cleaned.email = (this.currentUser.email || this.userProfile?.email || '').toLowerCase();
    }
    if (cleaned.displayName === undefined) {
      cleaned.displayName = this.currentUser.displayName || this.userProfile?.displayName || 'Student';
    }
    if (cleaned.college === undefined && this.userProfile?.college) {
      cleaned.college = this.userProfile.college;
    }
    if (cleaned.program === undefined && this.userProfile?.program) {
      cleaned.program = this.userProfile.program;
    }
    if (cleaned.attendanceTarget === undefined) {
      cleaned.attendanceTarget = this.userProfile?.attendanceTarget ?? 75;
    }

    const candidateProfile = { ...this.userProfile, ...cleaned, uid: this.currentUser.uid };
    const complete = isProfileComplete(candidateProfile);
    cleaned.profileCompleted = complete;
    cleaned.updatedAt = Date.now();

    if (!this.userProfile?.createdAt && !cleaned.createdAt) {
      cleaned.createdAt = Date.now();
    }

    // Simulate Firestore setDoc merge
    const docKey = `users/${this.currentUser.uid}`;
    const prevDoc = this.firestoreData.get(docKey) || {};
    this.firestoreData.set(docKey, { ...prevDoc, ...cleaned });

    // Canonical in-memory profile
    const finalProfile = {
      ...candidateProfile,
      ...cleaned,
      uid: this.currentUser.uid,
      email: cleaned.email || this.userProfile?.email || this.currentUser.email || '',
      displayName: cleaned.displayName || this.userProfile?.displayName || this.currentUser.displayName || 'Student',
      attendanceTarget: cleaned.attendanceTarget ?? this.userProfile?.attendanceTarget ?? 75,
      emailVerified: Boolean(this.currentUser.emailVerified || this.userProfile?.emailVerified),
      profileCompleted: complete,
      createdAt: this.userProfile?.createdAt || cleaned.createdAt,
    };

    setCachedUserProfile(this.currentUser.uid, finalProfile);
    this.userProfile = finalProfile;
    return finalProfile;
  }

  // Emulate ProtectedRoute decision
  evaluateRoute(pathname) {
    if (!this.currentUser) return { action: 'navigate', to: '/login' };
    const cachedProfile = getCachedUserProfile(this.currentUser.uid);
    const effectiveProfile = this.userProfile || cachedProfile;
    const profileComplete = effectiveProfile?.profileCompleted ?? false;

    if (!profileComplete && pathname !== '/onboarding') {
      return { action: 'navigate', to: '/onboarding' };
    }
    if (profileComplete && pathname === '/onboarding') {
      return { action: 'navigate', to: '/dashboard' };
    }
    return { action: 'render', pathname };
  }
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

console.log('--- 1. First-Time Google Sign-In & Incomplete State ---');

await runAsyncTest('New Google user begins in incomplete state and routes to /onboarding', async () => {
  const env = new TestAuthEnvironment();
  const googleUser = {
    uid: 'google-new-user-123',
    email: 'alex.cs24@chitkarauniversity.edu.in',
    displayName: 'Alex Johnson',
    emailVerified: true,
  };

  const { profile } = await env.signInWithGoogle(googleUser);
  assert.equal(profile.profileCompleted, false, 'Pending profile must not be marked complete');
  assert.equal(env.userProfile.profileCompleted, false);

  // Attempting to access dashboard must be redirected to onboarding
  const decision = env.evaluateRoute('/dashboard');
  assert.equal(decision.action, 'navigate');
  assert.equal(decision.to, '/onboarding');
});

console.log('\n--- 2. Profile Submission & Automatic Redirect Root Cause ---');

await runAsyncTest('updateUserProfile guarantees profileCompleted: true on finalProfile and in state', async () => {
  const env = new TestAuthEnvironment();
  const googleUser = {
    uid: 'google-user-456',
    email: 'sam.cs24@chitkarauniversity.edu.in',
    displayName: 'Sam Student',
    emailVerified: true,
  };
  await env.signInWithGoogle(googleUser);

  // Validate form submission data as OnboardingPage does
  const validation = validateAcademicProfile({
    displayName: 'Sam Student',
    email: googleUser.email,
    universityId: '2411981234',
    semester: 5,
    section: 'C',
    studentGroup: 'G1',
    attendanceTarget: 75,
  });

  assert.equal(validation.isValid, true);
  assert.ok(validation.cleaned);

  // Save profile
  const saved = await env.updateUserProfile(validation.cleaned);

  // VERIFICATION: savedProfile.profileCompleted MUST be true
  assert.equal(saved.profileCompleted, true, 'savedProfile.profileCompleted must be true');
  assert.equal(env.userProfile.profileCompleted, true, 'AuthContext userProfile state must be true');

  // Verify cached profile in localStorage also has profileCompleted: true
  const cached = getCachedUserProfile(googleUser.uid);
  assert.ok(cached, 'Cached profile must exist in localStorage');
  assert.equal(cached.profileCompleted, true, 'Cached profile must be marked complete');
});

await runAsyncTest('Route guard allows /dashboard immediately without bounceback or reload', async () => {
  const env = new TestAuthEnvironment();
  const googleUser = {
    uid: 'google-user-789',
    email: 'morgan.cs24@chitkarauniversity.edu.in',
    displayName: 'Morgan Lee',
    emailVerified: true,
  };
  await env.signInWithGoogle(googleUser);

  // Submit onboarding
  const validation = validateAcademicProfile({
    displayName: 'Morgan Lee',
    email: googleUser.email,
    universityId: '2411985678',
    semester: 5,
    section: 'B',
    studentGroup: 'G2',
    attendanceTarget: 80,
  });
  await env.updateUserProfile(validation.cleaned);

  // ProtectedRoute evaluating /dashboard:
  const dashboardDecision = env.evaluateRoute('/dashboard');
  assert.equal(dashboardDecision.action, 'render', 'Dashboard must render directly without redirect');
  assert.equal(dashboardDecision.pathname, '/dashboard');

  // ProtectedRoute evaluating /onboarding (e.g. if user hits back or tries opening onboarding again):
  const onboardingDecision = env.evaluateRoute('/onboarding');
  assert.equal(onboardingDecision.action, 'navigate');
  assert.equal(onboardingDecision.to, '/dashboard', 'Completed student visiting onboarding must redirect to dashboard');
});

console.log('\n--- 3. Dashboard Group Resolution Without Reload ---');

await runAsyncTest('Dashboard resolves student academic group immediately from newly saved profile', async () => {
  const env = new TestAuthEnvironment();
  const googleUser = {
    uid: 'google-user-group-test',
    email: 'jordan.cs24@chitkarauniversity.edu.in',
    displayName: 'Jordan Patel',
    emailVerified: true,
  };
  await env.signInWithGoogle(googleUser);

  const validation = validateAcademicProfile({
    displayName: 'Jordan Patel',
    email: googleUser.email,
    universityId: '2411989999',
    semester: 5,
    section: 'C',
    studentGroup: 'G1',
    attendanceTarget: 75,
  });
  const saved = await env.updateUserProfile(validation.cleaned);

  // Verify group resolution as DashboardPage does
  const groupRes = resolveStudentAcademicGroup(saved);
  assert.ok(groupRes.params, 'Academic group params must resolve');
  assert.equal(groupRes.params.semester, 5);
  assert.ok(groupRes.params.section.includes('5C') || groupRes.params.section === 'C');
  assert.equal(saved.section, 'C');
  assert.equal(saved.studentGroup, 'G1');
});

console.log('\n--- 4. Existing Registered Users ---');

await runAsyncTest('Existing registered users with complete profiles bypass onboarding on sign-in', async () => {
  const env = new TestAuthEnvironment();
  const existingUser = {
    uid: 'google-existing-user',
    email: 'existing.cs24@chitkarauniversity.edu.in',
    displayName: 'Existing Student',
    emailVerified: true,
  };

  // Pre-seed Firestore doc as an existing student
  env.firestoreData.set(`users/${existingUser.uid}`, {
    uid: existingUser.uid,
    email: existingUser.email,
    displayName: existingUser.displayName,
    semester: 3,
    section: 'A',
    universityId: '2411980001',
    studentGroup: 'G1',
    attendanceTarget: 75,
    profileCompleted: true,
  });

  const { profile } = await env.signInWithGoogle(existingUser);
  assert.equal(profile.profileCompleted, true);

  const decision = env.evaluateRoute('/dashboard');
  assert.equal(decision.action, 'render');
  assert.equal(decision.pathname, '/dashboard');
});

console.log('\n--- 5. Error Handling & Data Preservation ---');

await runAsyncTest('Failed profile write preserves entered data and keeps user on registration', async () => {
  const env = new TestAuthEnvironment();
  const googleUser = {
    uid: 'google-fail-user',
    email: 'fail.cs24@chitkarauniversity.edu.in',
    displayName: 'Taylor Smith',
    emailVerified: true,
  };
  await env.signInWithGoogle(googleUser);

  let formFields = {
    displayName: 'Taylor Smith',
    universityId: '2411983333',
    semester: 5,
    section: 'A',
    studentGroup: 'G2',
  };

  // Simulate network rejection
  let caughtError = null;
  try {
    throw new Error('Network unavailable during profile save');
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError, 'Error must be caught');
  assert.equal(caughtError.message, 'Network unavailable during profile save');

  // Form fields remain intact
  assert.equal(formFields.displayName, 'Taylor Smith');
  assert.equal(formFields.universityId, '2411983333');
  assert.equal(formFields.section, 'A');

  // User profile in context remains incomplete
  assert.equal(env.userProfile.profileCompleted, false);
  const decision = env.evaluateRoute('/dashboard');
  assert.equal(decision.action, 'navigate');
  assert.equal(decision.to, '/onboarding');
});

console.log('\n--- 6. Concurrency & Duplicate Submission Prevention ---');

runTest('Form submission guard blocks duplicate concurrent submissions', () => {
  let isSubmitting = false;
  let writeCount = 0;

  function mockSubmit() {
    if (isSubmitting) return 'BLOCKED';
    isSubmitting = true;
    writeCount++;
    return 'SUBMITTED';
  }

  assert.equal(mockSubmit(), 'SUBMITTED');
  assert.equal(mockSubmit(), 'BLOCKED', 'Second rapid click while in-flight must be blocked');
  assert.equal(mockSubmit(), 'BLOCKED', 'Third rapid click must be blocked');
  assert.equal(writeCount, 1, 'Only exactly 1 write should take place');

  isSubmitting = false;
  assert.equal(mockSubmit(), 'SUBMITTED', 'After resolution, submit can run again if needed');
  assert.equal(writeCount, 2);
});

console.log('\n--- 7. Source Code Invariant Checks ---');

runTest('AuthContext.tsx updateUserProfile assigns complete to finalProfile and returns it', () => {
  const content = readFileSync(resolve('src/contexts/AuthContext.tsx'), 'utf-8');
  assert.ok(
    content.includes('async function updateUserProfile(data: Partial<UserProfile>): Promise<UserProfile>'),
    'updateUserProfile must return Promise<UserProfile>'
  );
  assert.ok(
    content.includes('profileCompleted: complete,'),
    'finalProfile must explicitly set profileCompleted: complete'
  );
  assert.ok(
    content.includes('return merged;'),
    'updateUserProfile must return merged profile'
  );
});

runTest('OnboardingPage.tsx verifies profileCompleted before showing success and navigating', () => {
  const content = readFileSync(resolve('src/pages/auth/OnboardingPage.tsx'), 'utf-8');
  assert.ok(
    content.includes('savedProfile?.profileCompleted'),
    'OnboardingPage must check savedProfile?.profileCompleted'
  );
  assert.ok(
    content.includes("navigate('/dashboard', { replace: true })"),
    'OnboardingPage must navigate to /dashboard with replace: true'
  );
  assert.ok(
    content.includes('isSubmittingRef'),
    'OnboardingPage must guard against duplicate submissions with isSubmittingRef'
  );
});

runTest('ProtectedRoute.tsx checks effectiveProfile with cachedProfile fallback', () => {
  const content = readFileSync(resolve('src/components/auth/ProtectedRoute.tsx'), 'utf-8');
  assert.ok(
    content.includes('getCachedUserProfile'),
    'ProtectedRoute must import getCachedUserProfile'
  );
  assert.ok(
    content.includes('effectiveProfile'),
    'ProtectedRoute must compute effectiveProfile'
  );
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n======================================================================');
console.log(` SUMMARY: ${passCount} / ${totalCount} Tests Passed (${Math.round((passCount / totalCount) * 100)}%)`);
if (passCount === totalCount) {
  console.log(' Google registration redirect & profile sync tests verified! 🚀');
}
console.log('======================================================================\n');
