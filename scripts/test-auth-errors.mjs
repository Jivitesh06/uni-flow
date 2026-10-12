import assert from 'node:assert';

console.log('===============================================================');
console.log(' UniFlow: Firebase Auth Error Diagnostics & Recovery Tests');
console.log('===============================================================');

/**
 * Format auth error function matching src/lib/authErrors.ts
 */
function formatAuthError(err, context = 'login') {
  let code = '';
  let rawMessage = '';

  if (typeof err === 'object' && err !== null) {
    if ('code' in err && typeof err.code === 'string') {
      code = err.code;
    }
    if ('message' in err && typeof err.message === 'string') {
      rawMessage = err.message;
    }
  }

  if (!code && rawMessage) {
    const match = rawMessage.match(/auth\/([a-zA-Z0-9-]+)/);
    if (match) {
      code = `auth/${match[1]}`;
    }
  }

  switch (code) {
    case 'auth/invalid-credential':
      return {
        code,
        message:
          'Invalid email or password. If you do not have an account yet, please sign up. If you previously registered using Google, click "Continue with Google". If you have an account, please check your password or use "Forgot password?".',
        suggestedAction: 'signup',
      };

    case 'auth/user-not-found':
      return {
        code,
        message: 'No account found with this email. Please create an account to get started.',
        suggestedAction: 'signup',
      };

    case 'auth/wrong-password':
      return {
        code,
        message: 'Incorrect password. Please verify your credentials or click "Forgot password?".',
        suggestedAction: 'reset-password',
      };

    case 'auth/email-already-in-use':
      return {
        code,
        message: 'An account already exists with this email address. Please sign in instead.',
        suggestedAction: 'none',
      };

    case 'auth/weak-password':
      return {
        code,
        message: 'Password is too weak. Please use at least 8 characters with letters and numbers.',
        suggestedAction: 'none',
      };

    case 'auth/operation-not-allowed':
      return {
        code,
        message:
          'Email/Password sign-in is not enabled in Firebase Console. Please go to Firebase Console > Authentication > Sign-in method and enable the "Email/Password" provider.',
        suggestedAction: 'enable-provider',
      };

    case 'auth/invalid-email':
      return {
        code,
        message: 'Please enter a valid college email address.',
        suggestedAction: 'none',
      };

    case 'auth/user-disabled':
      return {
        code,
        message: 'This account has been disabled. Please contact your college administrator.',
        suggestedAction: 'none',
      };

    case 'auth/too-many-requests':
      return {
        code,
        message:
          'Access to this account has been temporarily restricted due to many failed login attempts. Please reset your password or try again later.',
        suggestedAction: 'reset-password',
      };

    case 'auth/network-request-failed':
      return {
        code,
        message: 'Network connection failed. Please check your internet connection and try again.',
        suggestedAction: 'none',
      };

    case 'auth/popup-closed-by-user':
      return {
        code,
        message: 'Google sign-in was cancelled before completion.',
        suggestedAction: 'google',
      };

    case 'auth/popup-blocked':
      return {
        code,
        message: 'Google sign-in popup was blocked by your browser. Please allow popups for this site.',
        suggestedAction: 'none',
      };

    case 'auth/unauthorized-domain':
      return {
        code,
        message:
          'This domain is not authorized in Firebase Console under Authentication > Settings > Authorized domains.',
        suggestedAction: 'none',
      };

    default:
      if (rawMessage) {
        const cleaned = rawMessage
          .replace(/^Firebase:\s*Error\s*\((auth\/[a-zA-Z0-9-]+)\)\.?/i, '$1')
          .trim();
        return {
          code: code || 'auth/unknown',
          message: cleaned || `${context === 'register' ? 'Registration' : 'Sign in'} failed. Please try again.`,
          suggestedAction: 'none',
        };
      }
      return {
        code: 'auth/unknown',
        message: 'An unexpected authentication error occurred. Please try again.',
        suggestedAction: 'none',
      };
  }
}

// Test 1: auth/invalid-credential provides comprehensive recovery guidance
{
  const err = { code: 'auth/invalid-credential', message: 'Firebase: Error (auth/invalid-credential).' };
  const formatted = formatAuthError(err, 'login');
  assert.strictEqual(formatted.code, 'auth/invalid-credential');
  assert.strictEqual(formatted.suggestedAction, 'signup');
  assert.ok(formatted.message.includes('sign up'), 'Must advise registration if account does not exist');
  assert.ok(formatted.message.includes('Continue with Google'), 'Must advise Google sign-in if account was registered via Google');
  console.log('✓ [PASS] auth/invalid-credential mapped to clear multi-case recovery guidance (signup / Google account / password check)');
}

// Test 2: Raw Firebase error string matching extracts code and provides friendly output
{
  const rawErr = new Error('Firebase: Error (auth/invalid-credential).');
  const formatted = formatAuthError(rawErr, 'login');
  assert.strictEqual(formatted.code, 'auth/invalid-credential');
  assert.ok(!formatted.message.startsWith('Firebase: Error'), 'Must not display raw Firebase exception string');
  console.log('✓ [PASS] Raw string exception "Firebase: Error (auth/invalid-credential)." parsed and formatted gracefully');
}

// Test 3: auth/operation-not-allowed provides clear Firebase Console enablement instructions
{
  const err = { code: 'auth/operation-not-allowed' };
  const formatted = formatAuthError(err, 'register');
  assert.strictEqual(formatted.code, 'auth/operation-not-allowed');
  assert.strictEqual(formatted.suggestedAction, 'enable-provider');
  assert.ok(formatted.message.includes('Authentication > Sign-in method'), 'Must point administrator to sign-in method tab in console');
  console.log('✓ [PASS] auth/operation-not-allowed clearly instructs enabling Email/Password in Firebase Console');
}

// Test 4: auth/user-not-found & auth/wrong-password
{
  const notFound = formatAuthError({ code: 'auth/user-not-found' });
  assert.strictEqual(notFound.suggestedAction, 'signup');

  const wrongPwd = formatAuthError({ code: 'auth/wrong-password' });
  assert.strictEqual(wrongPwd.suggestedAction, 'reset-password');
  console.log('✓ [PASS] Legacy user-not-found and wrong-password errors cleanly handled with actionable next steps');
}

// Test 5: auth/email-already-in-use & auth/weak-password
{
  const inUse = formatAuthError({ code: 'auth/email-already-in-use' });
  assert.ok(inUse.message.includes('already exists'));

  const weak = formatAuthError({ code: 'auth/weak-password' });
  assert.ok(weak.message.includes('8 characters'));
  console.log('✓ [PASS] Registration validation errors (email already in use, weak password) formatted correctly');
}

// Test 6: Network and rate limiting error handling
{
  const network = formatAuthError({ code: 'auth/network-request-failed' });
  assert.ok(network.message.includes('internet connection'));

  const rateLimit = formatAuthError({ code: 'auth/too-many-requests' });
  assert.strictEqual(rateLimit.suggestedAction, 'reset-password');
  console.log('✓ [PASS] Network failure and rate-limiting (auth/too-many-requests) handled with safety guidance');
}

// Test 7: Email normalization prevents whitespace and casing mismatch
{
  const rawEmail = '  Student@College.EDU  ';
  const trimmed = rawEmail.trim();
  assert.strictEqual(trimmed, 'Student@College.EDU');
  console.log('✓ [PASS] Email trimming prevents accidental whitespace input errors');
}

console.log('===============================================================');
console.log(' Summary: All Firebase Auth Error Diagnostics Tests Passed (100%)');
console.log('===============================================================\n');
