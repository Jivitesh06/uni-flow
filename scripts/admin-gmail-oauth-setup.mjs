/**
 * scripts/admin-gmail-oauth-setup.mjs
 *
 * ONE-TIME LOCAL SETUP TOOL — Run on the admin's own machine only.
 * NOT executed in GitHub Actions or any server context.
 *
 * Purpose:
 * - Performs the Google OAuth 2.0 authorization code flow.
 * - Obtains a Gmail offline_access refresh token.
 * - Prints ONLY the refresh token value for the admin to store as
 *   a GitHub Actions secret (GMAIL_REFRESH_TOKEN).
 * - Does NOT write anything to Firestore, files, or environment.
 * - Does NOT log client secrets, access tokens, or token contents.
 *
 * Usage:
 *   GMAIL_CLIENT_ID=<your-client-id> \
 *   GMAIL_CLIENT_SECRET=<your-client-secret> \
 *   node scripts/admin-gmail-oauth-setup.mjs
 *
 * Then copy the printed token value into GitHub repository secret GMAIL_REFRESH_TOKEN.
 *
 * Prerequisites:
 * - A Google Cloud project with Gmail API enabled.
 * - An OAuth 2.0 "Web application" client credential with:
 *   - Redirect URI: http://localhost:3199/oauth2callback
 * - The GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET env vars set.
 */

import http from 'node:http';
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { google } from 'googleapis';

// ─── Config ───────────────────────────────────────────────────────────────────

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3199/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const PORT = 3199;
const ADMIN_EMAIL = 'jivitesh1260.be24@chitkarauniversity.edu.in';

// ─── Entry Point ──────────────────────────────────────────────────────────────

(async () => {
  console.log('======================================================================');
  console.log(' UniFlow — Admin Gmail OAuth 2.0 Setup (One-Time Local Tool)');
  console.log('======================================================================\n');

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error(
      '❌ GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set as environment variables.\n' +
      '   Example:\n' +
      '   GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node scripts/admin-gmail-oauth-setup.mjs\n'
    );
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  // Generate a CSRF state token to prevent request forgery
  const state = crypto.randomBytes(24).toString('hex');

  // Build the authorization URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',        // Requests refresh token
    scope: SCOPES,
    prompt: 'consent',             // Force consent screen to ensure refresh token is issued
    state,
    login_hint: ADMIN_EMAIL,       // Pre-fill admin email
  });

  console.log('📋 Admin Gmail to authorize:', ADMIN_EMAIL);
  console.log('🔑 OAuth scopes requested:', SCOPES.join(', '));
  console.log('\n⚠️  IMPORTANT: You must sign in as the ADMIN account only.');
  console.log('   Do NOT authorize a student account.\n');
  console.log('🌐 Opening authorization URL in your browser...');
  console.log('   If the browser does not open automatically, visit:\n');
  console.log('  ', authUrl, '\n');

  // Try to open the browser automatically
  try {
    const { exec } = await import('node:child_process');
    const platform = process.platform;
    const cmd =
      platform === 'darwin' ? `open "${authUrl}"` :
      platform === 'win32' ? `start "${authUrl}"` :
      `xdg-open "${authUrl}"`;
    exec(cmd);
  } catch {
    // Browser open is best-effort; user can copy the URL manually
  }

  // Wait for the OAuth callback on localhost
  const refreshToken = await waitForOAuthCallback(oauth2Client, state, PORT);

  // Validate the obtained token by verifying Gmail access
  console.log('\n🔍 Validating the obtained refresh token...');
  try {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const authorizedEmail = profile.data.emailAddress;

    if (authorizedEmail.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      console.error(`\n❌ Wrong account authorized!`);
      console.error(`   Expected: ${ADMIN_EMAIL}`);
      console.error(`   Got:      ${authorizedEmail}`);
      console.error(`\n   Please re-run this script and sign in as the admin account.\n`);
      process.exit(1);
    }

    console.log(`✅ Gmail access confirmed for: ${authorizedEmail}`);
    console.log(`   Mailbox history ID: ${profile.data.historyId} (save for incremental sync)\n`);
  } catch (err) {
    console.error(`\n❌ Gmail validation failed: ${err.message}`);
    process.exit(1);
  }

  // Output instructions (never log the token value in a way that could be captured)
  console.log('======================================================================');
  console.log(' ✅ Authorization successful!');
  console.log('======================================================================');
  console.log('\n📋 Next step: Copy the value below and add it as GitHub repository secret.');
  console.log('\n   Secret name: GMAIL_REFRESH_TOKEN');
  console.log('   Navigate to: GitHub repo → Settings → Secrets → Actions → New secret\n');
  console.log('   Value (copy the entire line between the dashes):');
  console.log('   ──────────────────────────────────────────────────');
  // Print the token to stdout only — never to a log file or stderr
  process.stdout.write(`   ${refreshToken}\n`);
  console.log('   ──────────────────────────────────────────────────\n');
  console.log('⚠️  Store this value ONLY in the GitHub secret. Do NOT commit it to code.');
  console.log('   After copying, close this terminal to clear the value from screen.\n');
  console.log('Also add these GitHub secrets if not already set:');
  console.log('  GMAIL_CLIENT_ID        =', CLIENT_ID.slice(0, 8) + '...(already set)');
  console.log('  GMAIL_CLIENT_SECRET    = (same secret you used here)');
  console.log('  FIREBASE_ADMIN_UID     = TngcyE1MF9ZLRIQYW25C7LefShp2');
  console.log('  TIMETABLE_SYNC_ENABLED = false  ← keep false until you approve live sync');
  console.log('  TIMETABLE_SENDER_EMAIL = office.cse@chitkarauniversity.edu.in');
  console.log('  TIMETABLE_SUBJECT_PREFIX = Time Table:\n');
})();

// ─── Local OAuth Callback Server ──────────────────────────────────────────────

/**
 * Starts a temporary local HTTP server to receive the OAuth callback.
 * Validates the CSRF state parameter and exchanges the code for tokens.
 * Shuts down the server after receiving one callback.
 *
 * @param {import('google-auth-library').OAuth2Client} oauth2Client
 * @param {string} expectedState
 * @param {number} port
 * @returns {Promise<string>} The refresh token
 */
function waitForOAuthCallback(oauth2Client, expectedState, port) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);

      if (url.pathname !== '/oauth2callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const receivedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h2>Authorization failed: ${error}</h2><p>You can close this tab.</p>`);
        server.close();
        reject(new Error(`OAuth authorization denied: ${error}`));
        return;
      }

      if (receivedState !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h2>Invalid state parameter. Possible CSRF attack.</h2>');
        server.close();
        reject(new Error('OAuth CSRF state mismatch'));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h2>No authorization code received.</h2>');
        server.close();
        reject(new Error('No authorization code in callback'));
        return;
      }

      try {
        // Exchange authorization code for tokens
        const { tokens } = await oauth2Client.getToken(code);

        if (!tokens.refresh_token) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(
            '<h2>No refresh token received.</h2>' +
            '<p>This can happen if the account was previously authorized without requesting offline access. ' +
            'Go to <a href="https://myaccount.google.com/permissions">Google Account Permissions</a>, ' +
            'revoke access for your app, then re-run this script.</p>'
          );
          server.close();
          reject(new Error('No refresh_token in token response. Revoke app access and try again.'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body style="font-family:sans-serif;padding:2rem">' +
          '<h2 style="color:green">✅ Authorization successful!</h2>' +
          '<p>The refresh token has been printed to your terminal.</p>' +
          '<p>Copy it and add it as a GitHub Actions secret named <code>GMAIL_REFRESH_TOKEN</code>.</p>' +
          '<p>You can close this tab.</p>' +
          '</body></html>'
        );
        server.close();
        resolve(tokens.refresh_token);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h2>Token exchange failed</h2><p>${err.message}</p>`);
        server.close();
        reject(new Error(`Token exchange failed: ${err.message}`));
      }
    });

    server.listen(port, () => {
      console.log(`\n🔌 Waiting for OAuth callback on http://localhost:${port}/oauth2callback ...`);
      console.log('   (This will time out if you do not complete the OAuth flow in your browser)\n');
    });

    server.on('error', (err) => {
      reject(new Error(`Failed to start local OAuth callback server on port ${port}: ${err.message}`));
    });

    // Timeout after 3 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth callback timed out after 3 minutes. Please re-run the script.'));
    }, 3 * 60 * 1000);
  });
}
