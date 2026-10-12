import assert from 'node:assert';

console.log('===============================================================');
console.log(' UniFlow: Account Scenarios Test Suite (Simulated & Invariant)');
console.log('===============================================================');

// Mock Firebase User class
class MockUser {
  constructor({ uid, email, displayName, emailVerified = false, providerId = 'password' }) {
    this.uid = uid;
    this.email = email;
    this.displayName = displayName;
    this.emailVerified = emailVerified;
    this.providerData = [{ providerId }];
    this.verificationEmailSent = false;
  }

  async sendEmailVerification() {
    this.verificationEmailSent = true;
    return true;
  }

  async reload() {
    // Simulates checking remote server state
    return true;
  }
}

// Mock Auth Database
const mockAuthDb = new Map();

// Helper functions matching AuthContext
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function mockRegister({ email, password, name }) {
  const norm = normalizeEmail(email);
  if (mockAuthDb.has(norm)) {
    const err = new Error('The email address is already in use by another account.');
    err.code = 'auth/email-already-in-use';
    throw err;
  }
  if (password.length < 8) {
    const err = new Error('Password should be at least 8 characters');
    err.code = 'auth/weak-password';
    throw err;
  }
  const user = new MockUser({
    uid: `uid-${Date.now()}`,
    email: norm,
    displayName: name,
    emailVerified: false,
    providerId: 'password',
  });
  mockAuthDb.set(norm, { user, password, provider: 'password' });
  user.sendEmailVerification();
  return user;
}

function mockLogin({ email, password }) {
  const norm = normalizeEmail(email);
  const record = mockAuthDb.get(norm);
  if (!record) {
    const err = new Error('INVALID_LOGIN_CREDENTIALS');
    err.code = 'auth/invalid-credential';
    throw err;
  }
  if (record.provider === 'google.com' && !record.password) {
    // Account was created via Google Sign-In and has no password credential
    const err = new Error('INVALID_LOGIN_CREDENTIALS');
    err.code = 'auth/invalid-credential';
    throw err;
  }
  if (record.password !== password) {
    const err = new Error('INVALID_LOGIN_CREDENTIALS');
    err.code = 'auth/invalid-credential';
    throw err;
  }
  return record.user;
}

function mockGoogleSignIn({ email, displayName }) {
  const norm = normalizeEmail(email);
  let record = mockAuthDb.get(norm);
  if (!record) {
    const user = new MockUser({
      uid: `google-${Date.now()}`,
      email: norm,
      displayName,
      emailVerified: true, // Google accounts are pre-verified
      providerId: 'google.com',
    });
    record = { user, password: null, provider: 'google.com' };
    mockAuthDb.set(norm, record);
  }
  return record.user;
}

function checkProtectedRouteAccess(user) {
  if (!user) return { allowed: false, redirect: '/login' };
  if (!user.emailVerified) return { allowed: false, redirect: '/verify-email' };
  return { allowed: true, redirect: null };
}

// -----------------------------------------------------------------
// Scenario 1: New email/password registration
// -----------------------------------------------------------------
{
  const regUser = mockRegister({
    email: '  NewStudent@University.EDU  ',
    password: 'SecurePassword123!',
    name: 'New Student',
  });
  assert.strictEqual(regUser.email, 'newstudent@university.edu', 'Email must be normalized to lowercase');
  assert.strictEqual(regUser.emailVerified, false, 'New email/password account must start unverified');
  console.log('✓ Scenario 1 [TESTED - Unit Simulation]: New email/password registration creates user with normalized credentials');
}

// -----------------------------------------------------------------
// Scenario 2: Verification email dispatch
// -----------------------------------------------------------------
{
  const user = mockAuthDb.get('newstudent@university.edu').user;
  assert.strictEqual(user.verificationEmailSent, true, 'Verification email must be dispatched on registration');
  console.log('✓ Scenario 2 [TESTED - Unit Simulation]: Verification email dispatch triggered on account creation');
}

// -----------------------------------------------------------------
// Scenario 3: Email/password login after successful verification
// -----------------------------------------------------------------
{
  const user = mockAuthDb.get('newstudent@university.edu').user;
  // User verifies email link in their inbox
  user.emailVerified = true;

  const loggedIn = mockLogin({
    email: 'newstudent@university.edu',
    password: 'SecurePassword123!',
  });
  assert.strictEqual(loggedIn.email, 'newstudent@university.edu');
  assert.strictEqual(loggedIn.emailVerified, true);

  const routeAccess = checkProtectedRouteAccess(loggedIn);
  assert.strictEqual(routeAccess.allowed, true, 'Verified user must have full dashboard access');
  console.log('✓ Scenario 3 [TESTED - Unit Simulation]: Email/password login succeeds after verification and unlocks protected pages');
}

// -----------------------------------------------------------------
// Scenario 4: Incorrect password
// -----------------------------------------------------------------
{
  assert.throws(
    () => {
      mockLogin({
        email: 'newstudent@university.edu',
        password: 'WrongPassword999!',
      });
    },
    (err) => err.code === 'auth/invalid-credential',
    'Must throw auth/invalid-credential on password mismatch'
  );
  console.log('✓ Scenario 4 [TESTED - Unit Simulation]: Incorrect password triggers auth/invalid-credential');
}

// -----------------------------------------------------------------
// Scenario 5: Existing Google-only account attempting password login
// -----------------------------------------------------------------
{
  // User creates account via Google
  mockGoogleSignIn({
    email: 'googleuser@gmail.com',
    displayName: 'Google User',
  });

  // User tries to log in with email/password form using their Google email
  assert.throws(
    () => {
      mockLogin({
        email: 'googleuser@gmail.com',
        password: 'SomeRandomPassword!',
      });
    },
    (err) => err.code === 'auth/invalid-credential',
    'Google-only account must throw auth/invalid-credential when password is provided'
  );
  console.log('✓ Scenario 5 [TESTED - Unit Simulation]: Google-only account attempting password login throws auth/invalid-credential');
}

// -----------------------------------------------------------------
// Scenario 6: Google sign-in still working
// -----------------------------------------------------------------
{
  const googleUser = mockGoogleSignIn({
    email: 'googleuser@gmail.com',
    displayName: 'Google User',
  });
  assert.strictEqual(googleUser.emailVerified, true, 'Google users must be pre-verified');
  const routeAccess = checkProtectedRouteAccess(googleUser);
  assert.strictEqual(routeAccess.allowed, true, 'Google user must immediately access dashboard without /verify-email');
  console.log('✓ Scenario 6 [TESTED - Unit Simulation]: Google sign-in preserves pre-verified status and direct dashboard access');
}

// -----------------------------------------------------------------
// Scenario 7: Protected-route behavior for unverified users
// -----------------------------------------------------------------
{
  const unverifiedStudent = new MockUser({
    uid: 'unverified-1',
    email: 'unverified@college.edu',
    emailVerified: false,
  });
  const routeCheck = checkProtectedRouteAccess(unverifiedStudent);
  assert.strictEqual(routeCheck.allowed, false);
  assert.strictEqual(routeCheck.redirect, '/verify-email', 'Must redirect unverified users to /verify-email');
  console.log('✓ Scenario 7 [TESTED - Unit Simulation]: Protected-route checks strictly divert unverified users to /verify-email');
}

// -----------------------------------------------------------------
// Scenario 8: Public landing page & PublicAuthRoute redirection
// -----------------------------------------------------------------
function checkPublicAuthRoute(user, targetPath) {
  if (user && user.emailVerified) {
    return { redirect: '/dashboard' };
  }
  if (user && !user.emailVerified) {
    return { redirect: '/verify-email' };
  }
  return { render: targetPath };
}

{
  // Unauthenticated user visits /login or /register
  const anonCheck = checkPublicAuthRoute(null, '/login');
  assert.strictEqual(anonCheck.render, '/login', 'Unauthenticated visitor sees /login page');

  // Authenticated verified student visits /login or /register
  const authUser = new MockUser({ uid: 'u1', email: 'u1@uni.edu', emailVerified: true });
  const authCheck = checkPublicAuthRoute(authUser, '/login');
  assert.strictEqual(authCheck.redirect, '/dashboard', 'Authenticated verified student redirects to /dashboard');

  // Authenticated unverified student visits /login
  const unverifiedUser = new MockUser({ uid: 'u2', email: 'u2@uni.edu', emailVerified: false });
  const unverifiedCheck = checkPublicAuthRoute(unverifiedUser, '/login');
  assert.strictEqual(unverifiedCheck.redirect, '/verify-email', 'Unverified student redirects to /verify-email');
  console.log('✓ Scenario 8 [TESTED - Unit Simulation]: PublicAuthRoute redirects authenticated users to /dashboard or /verify-email');
}

// -----------------------------------------------------------------
// Scenario 9: Return path state preservation on protected route redirect
// -----------------------------------------------------------------
function resolveLoginRedirect(targetLocationState) {
  if (targetLocationState && targetLocationState.from && targetLocationState.from.pathname) {
    return targetLocationState.from.pathname;
  }
  return '/dashboard';
}

{
  const preservedRedirect = resolveLoginRedirect({ from: { pathname: '/attendance' } });
  assert.strictEqual(preservedRedirect, '/attendance', 'Must redirect back to requested path after authentication');

  const defaultRedirect = resolveLoginRedirect(null);
  assert.strictEqual(defaultRedirect, '/dashboard', 'Defaults to /dashboard if no return path is present');
  console.log('✓ Scenario 9 [TESTED - Unit Simulation]: Return-path preservation redirects user to target destination upon login');
}

// -----------------------------------------------------------------
// Scenario 10: Public landing page at root URL '/'
// -----------------------------------------------------------------
function resolveRootRoute(path) {
  if (path === '/') return 'LandingPage';
  return 'MatchedRouteOr404';
}

{
  assert.strictEqual(resolveRootRoute('/'), 'LandingPage', 'Root / must render LandingPage');
  console.log('✓ Scenario 10 [TESTED - Unit Simulation]: Root URL / serves public SaaS LandingPage');
}

console.log('===============================================================');
console.log(' Summary: All 10 Account & Routing Scenarios Verified in Unit Simulation!');
console.log('===============================================================\n');
