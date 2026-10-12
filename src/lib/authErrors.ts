export interface FormattedAuthError {
  code: string;
  message: string;
  suggestedAction?: 'signup' | 'google' | 'reset-password' | 'enable-provider' | 'none';
}

/**
 * Maps raw Firebase Authentication error codes to user-friendly, actionable error messages
 * without exposing sensitive system internals or violating email enumeration protections.
 */
export function formatAuthError(
  err: unknown,
  context: 'login' | 'register' | 'reset' = 'login'
): FormattedAuthError {
  let code = '';
  let rawMessage = '';

  if (typeof err === 'object' && err !== null) {
    if ('code' in err && typeof (err as { code: unknown }).code === 'string') {
      code = (err as { code: string }).code;
    }
    if ('message' in err && typeof (err as { message: unknown }).message === 'string') {
      rawMessage = (err as { message: string }).message;
    }
  }

  // Fallback regex matching if error code wasn't structured
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
