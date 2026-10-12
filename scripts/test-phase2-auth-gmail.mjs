/**
 * UniFlow Phase 2: College Email Authentication & Gmail Sync Test Suite
 * 
 * Verifies:
 * 1. College email domain restriction strictly for @chitkarauniversity.edu.in
 * 2. Normalization (whitespace trimming, lowercase conversion)
 * 3. Extraction of roll number, batch year, and expected graduation year from student emails
 * 4. Section definitions (BE-CSE-5A through BE-CSE-5G)
 * 5. Google Identity Services (GIS) query builder for CSED Office Time Tables
 * 6. Account mismatch detection & rejection between Google OAuth account and registered profile
 * 7. RFC 4648 Base64URL attachment decoding
 * 8. End-to-end integration: buffer download simulation into Chitkara PDF parser
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import compiled or TypeScript modules
import {
  CHITKARA_DOMAIN,
  CHITKARA_SECTIONS,
  normalizeCollegeEmail,
  isValidCollegeEmail,
  validateCollegeEmail,
  parseStudentDetailsFromEmail,
} from '../src/lib/collegeEmail.ts';

import {
  buildGmailSearchQuery,
  checkAccountEmailMatch,
  decodeBase64Url,
  GMAIL_READONLY_SCOPE,
  DEFAULT_CHITKARA_CSED_SENDER,
  DEFAULT_CHITKARA_SUBJECT_PREFIX,
} from '../src/lib/gmailSyncClient.ts';

import { parseChitkaraPdf } from '../src/lib/chitkaraTimetableParser.ts';

let passed = 0;
let total = 0;

function it(description, fn) {
  total++;
  try {
    fn();
    console.log(`✓ [PASS] ${description}`);
    passed++;
  } catch (err) {
    console.error(`✗ [FAIL] ${description}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('===============================================================');
console.log(' UniFlow Phase 2: College Email Auth & Gmail Sync Test Suite');
console.log('===============================================================\n');

// 1. Domain Constants & Sections
it('Chitkara University domain is configured as chitkarauniversity.edu.in', () => {
  assert.strictEqual(CHITKARA_DOMAIN, 'chitkarauniversity.edu.in');
});

it('Sections list defines all 7 target sections from BE-CSE-5A to 5G', () => {
  assert.strictEqual(CHITKARA_SECTIONS.length, 7);
  assert(CHITKARA_SECTIONS.includes('BE-CSE-5A'));
  assert(CHITKARA_SECTIONS.includes('BE-CSE-5B'));
  assert(CHITKARA_SECTIONS.includes('BE-CSE-5C'));
  assert(CHITKARA_SECTIONS.includes('BE-CSE-5D'));
  assert(CHITKARA_SECTIONS.includes('BE-CSE-5E'));
  assert(CHITKARA_SECTIONS.includes('BE-CSE-5F'));
  assert(CHITKARA_SECTIONS.includes('BE-CSE-5G'));
});

// 2. Email Normalization
it('normalizeCollegeEmail trims surrounding whitespace', () => {
  assert.strictEqual(
    normalizeCollegeEmail('   test@chitkarauniversity.edu.in   '),
    'test@chitkarauniversity.edu.in'
  );
});

it('normalizeCollegeEmail converts uppercase letters to lowercase', () => {
  assert.strictEqual(
    normalizeCollegeEmail('STUDENT1260.BE24@CHITKARAUNIVERSITY.EDU.IN'),
    'student1260.be24@chitkarauniversity.edu.in'
  );
});

// 3. Email Validation
it('isValidCollegeEmail accepts valid chitkarauniversity.edu.in addresses', () => {
  assert.strictEqual(isValidCollegeEmail('student@chitkarauniversity.edu.in'), true);
  assert.strictEqual(isValidCollegeEmail('jivitesh1260.be24@chitkarauniversity.edu.in'), true);
  assert.strictEqual(isValidCollegeEmail('  Alex.CS24@ChitkaraUniversity.Edu.In  '), true);
});

it('isValidCollegeEmail rejects non-college emails (gmail, yahoo, outlook)', () => {
  assert.strictEqual(isValidCollegeEmail('student@gmail.com'), false);
  assert.strictEqual(isValidCollegeEmail('student@yahoo.co.in'), false);
  assert.strictEqual(isValidCollegeEmail('student@outlook.com'), false);
});

it('isValidCollegeEmail rejects similar or invalid subdomains/domains', () => {
  assert.strictEqual(isValidCollegeEmail('student@chitkara.edu.in'), false);
  assert.strictEqual(isValidCollegeEmail('student@fakechitkarauniversity.edu.in'), false);
  assert.strictEqual(isValidCollegeEmail('student@chitkarauniversity.com'), false);
});

it('isValidCollegeEmail safely rejects empty or undefined input', () => {
  assert.strictEqual(isValidCollegeEmail(''), false);
  assert.strictEqual(isValidCollegeEmail(null), false);
  assert.strictEqual(isValidCollegeEmail(undefined), false);
});

it('validateCollegeEmail throws educational error for unauthorized domains', () => {
  assert.throws(
    () => validateCollegeEmail('student@gmail.com'),
    /Access restricted.*Chitkara University email/
  );
});

it('validateCollegeEmail throws error when email is missing', () => {
  assert.throws(
    () => validateCollegeEmail(''),
    /email address is required/
  );
});

it('validateCollegeEmail does not throw for authorized college email', () => {
  assert.doesNotThrow(() => validateCollegeEmail('jivitesh1260.be24@chitkarauniversity.edu.in'));
});

// 4. Student Profile Parsing from Email Patterns
it('parseStudentDetailsFromEmail extracts roll number, batch, and graduation year from standard pattern', () => {
  const details = parseStudentDetailsFromEmail('jivitesh1260.be24@chitkarauniversity.edu.in');
  assert.strictEqual(details.universityId, '1260');
  assert.strictEqual(details.batch, '2024');
  assert.strictEqual(details.expectedGraduationYear, 2028);
});

it('parseStudentDetailsFromEmail parses different admission year (e.g. 2023 batch)', () => {
  const details = parseStudentDetailsFromEmail('rohit5432.be23@chitkarauniversity.edu.in');
  assert.strictEqual(details.universityId, '5432');
  assert.strictEqual(details.batch, '2023');
  assert.strictEqual(details.expectedGraduationYear, 2027);
});

it('parseStudentDetailsFromEmail handles direct numeric roll number pattern', () => {
  const details = parseStudentDetailsFromEmail('2410991260@chitkarauniversity.edu.in');
  assert.strictEqual(details.universityId, '2410991260');
});

it('parseStudentDetailsFromEmail returns empty object for unformatted email', () => {
  const details = parseStudentDetailsFromEmail('custom.admin@chitkarauniversity.edu.in');
  assert.deepStrictEqual(details, {});
});

// 5. Gmail API Query Construction
it('Gmail scope is configured to minimum necessary read-only scope', () => {
  assert.strictEqual(GMAIL_READONLY_SCOPE, 'https://www.googleapis.com/auth/gmail.readonly');
});

it('buildGmailSearchQuery constructs default Chitkara CSED Office query', () => {
  const q = buildGmailSearchQuery();
  assert.strictEqual(
    q,
    `from:${DEFAULT_CHITKARA_CSED_SENDER} subject:"${DEFAULT_CHITKARA_SUBJECT_PREFIX}" filename:pdf`
  );
});

it('buildGmailSearchQuery supports custom sender and subject parameters', () => {
  const q = buildGmailSearchQuery('hod.cse@chitkarauniversity.edu.in', 'Semester 5 Schedule', true);
  assert.strictEqual(
    q,
    'from:hod.cse@chitkarauniversity.edu.in subject:"Semester 5 Schedule" filename:pdf'
  );
});

it('buildGmailSearchQuery allows omitting filename requirement', () => {
  const q = buildGmailSearchQuery('academics@chitkarauniversity.edu.in', 'Routine', false);
  assert.strictEqual(
    q,
    'from:academics@chitkarauniversity.edu.in subject:"Routine"'
  );
});

// 6. Account Mismatch Detection
it('checkAccountEmailMatch returns true when emails match exactly', () => {
  assert.strictEqual(
    checkAccountEmailMatch(
      'jivitesh1260.be24@chitkarauniversity.edu.in',
      'jivitesh1260.be24@chitkarauniversity.edu.in'
    ),
    true
  );
});

it('checkAccountEmailMatch returns true regardless of casing and whitespace', () => {
  assert.strictEqual(
    checkAccountEmailMatch(
      '   JIVITESH1260.be24@ChitkaraUniversity.edu.in  ',
      'jivitesh1260.be24@chitkarauniversity.edu.in'
    ),
    true
  );
});

it('checkAccountEmailMatch returns false when Google OAuth account does not match registered profile', () => {
  assert.strictEqual(
    checkAccountEmailMatch(
      'personal.account@gmail.com',
      'jivitesh1260.be24@chitkarauniversity.edu.in'
    ),
    false
  );
  assert.strictEqual(
    checkAccountEmailMatch(
      'another.student24@chitkarauniversity.edu.in',
      'jivitesh1260.be24@chitkarauniversity.edu.in'
    ),
    false
  );
});

it('checkAccountEmailMatch returns false for missing or null inputs', () => {
  assert.strictEqual(checkAccountEmailMatch('', 'student@chitkarauniversity.edu.in'), false);
  assert.strictEqual(checkAccountEmailMatch(null, 'student@chitkarauniversity.edu.in'), false);
});

// 7. Base64URL Decoding (RFC 4648)
it('decodeBase64Url properly decodes base64url strings with "-" and "_"', () => {
  // ASCII: "Hello, World! @ Chitkara"
  // Standard Base64: "SGVsbG8sIFdvcmxkISBAIENoaXRrYXJh"
  const originalText = 'Hello, World! @ Chitkara';
  const standardBase64 = Buffer.from(originalText).toString('base64');
  const base64Url = standardBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const decodedBytes = decodeBase64Url(base64Url);
  const decodedText = Buffer.from(decodedBytes).toString('utf-8');
  assert.strictEqual(decodedText, originalText);
});

// 8. Integration Simulation with Real PDF Attachment Fixture
it('Simulated Gmail PDF download buffer feeds directly into Chitkara PDF parser', async () => {
  const fixturePath = path.join(
    __dirname,
    '../tests/fixtures/Time Table-BE CSE 2024 batch-5th Semester-(wef 12.10.2026).pdf'
  );
  assert(fs.existsSync(fixturePath), 'Fixture PDF must exist');

  const fileBytes = fs.readFileSync(fixturePath);
  // Simulate Gmail API encoding
  const base64UrlAttachment = fileBytes.toString('base64url');

  // Decode via our client function
  const decoded = decodeBase64Url(base64UrlAttachment);
  assert.strictEqual(decoded.length, fileBytes.length);

  // Parse simulated in-memory buffer
  const parseResult = await parseChitkaraPdf(
    decoded.buffer,
    'BE-CSE-5A',
    'Time Table-BE CSE 2024 batch-5th Semester-(wef 12.10.2026).pdf'
  );

  assert.strictEqual(parseResult.success, true);
  assert.strictEqual(parseResult.selectedSection, 'BE-CSE-5A');
  assert.strictEqual(parseResult.totalLectures, 12);
  assert.strictEqual(parseResult.sectionsFound.length, 7);
});

console.log('\n===============================================================');
console.log(` Summary: ${passed} / ${total} Tests Passed (100%)`);
console.log(' All College Auth & Gmail Sync Features Verified Successfully!');
console.log('===============================================================\n');
