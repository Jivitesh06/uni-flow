# ClassPulse (UniFlow)

**ClassPulse** is a complete, responsive, real-time Smart College Timetable and Attendance Tracker built with **React**, **Vite**, **TypeScript**, **Tailwind CSS**, and **Firebase** (Authentication, Cloud Firestore, Cloud Functions, and Firebase Cloud Messaging).

---

## 🌟 Key Features

### 1. Student Dashboard & Live Class Pulse
- **Current & Next Class Cards**: Instant visibility into the lecture happening right now or next up.
- **Next Lecture Countdown**: Live ticker counting down hours, minutes, and seconds to the next lecture.
- **Lecture Metadata**: Subject name, course code, room/hall number, and faculty name.
- **Daily Schedule Timeline**: Chronological display of today's schedule with "Now", "Upcoming", and "Done" indicators.
- **Free-Slot Finder**: Automatically detects open breaks/study slots between 09:00 and 17:00.

### 2. Timetable Management
- **Weekly & Daily Views**: Toggle between high-level weekly calendar grids and detailed day-by-day itineraries.
- **Manual Slot Creation & Editing**: Configurable days, start/end times, room allocations, color badges, and instructor names.
- **Excel / CSV Import Fallback**: Upload `.xlsx` or `.csv` files to bulk-populate subjects and timetable slots automatically via `xlsx`.
- **Revision Detection**: Timetable changes generated through imports queue into a review list.

### 3. Subject-Wise Attendance Tracker
- **Subject-Wise Statistics**: Individual percentage tracking against an institutional target (default 75%, configurable in Settings).
- **Exact Mathematical Formulas**:
  - Attendance percentage:
    $$\text{Percentage} = \frac{\text{Attended}}{\text{Conducted}} \times 100$$
  - Consecutive lectures needed to reach target $r$ (e.g. $0.75$):
    $$\text{Classes Needed} = \max\left(0, \left\lceil \frac{r \times T - A}{1 - r} \right\rceil\right)$$
  - Maximum future absences permitted without falling below target $r$:
    $$\text{Max Absences} = \max\left(0, \left\lfloor \frac{A}{r} - T \right\rfloor\right)$$
- **Attendance History & Correction Workflow**:
  - Mark *Present* or *Absent* for today or any specific date.
  - Correction modal allows editing past records (e.g., excused medical absence) with correction notes.
- **Baseline Attendance Separation**: Historical totals imported during onboarding are maintained in `attendanceBaselines` to avoid double-counting.

### 4. Progressive Web App (PWA) & Offline Shell
- **Installable Experience**: Configured with a valid Web App Manifest (`name: "UniFlow"`, `short_name: "UniFlow"`, `display: "standalone"`, `theme_color: "#2563eb"`).
- **Icons**: 192×192, 512×512, 512×512 maskable, and 180×180 Apple touch icons.
- **Service Worker & Caching**: Powered by `vite-plugin-pwa` and Workbox:
  - Pre-caches only static application shell assets (`HTML`, `JS`, `CSS`, fonts, icons).
  - Explicit Workbox denylist prevents caching Firebase authentication endpoints, tokens, OAuth exchanges, and Firestore student records.
- **Install Triggers**: Browser install prompt button in Settings, TopBar, and Sidebar; step-by-step iOS Safari guide modal (*Share → Add to Home Screen → Add*).
- **Offline States**: Offline warning banner and connection-restored feedback badge.

### 5. Persistent Firebase Authentication
- **Local Persistence**: Enforces `browserLocalPersistence` across email/password and Google Sign-In via `ensureAuthPersistence()`.
- **Session Preservation**: Sessions seamlessly persist across browser restarts, tab reloads, and PWA reopenings.
- **Offline Resilience**: Offline launches gracefully restore the cached Firebase session without triggering unauthenticated redirects or logout loops.
- **Zero Token Leakage**: No passwords, tokens, or simulated states are ever placed into application-managed `localStorage`.
- **College Allowlist**: College email domain restriction verified client-side and server-side.

### 6. Gmail OAuth Integration & Mailbox Sync
- **Isolated Permissions**: Firebase Authentication and Gmail mailbox access are strictly segregated.
- **Minimum Required Scope**: Evaluates and requests only `https://www.googleapis.com/auth/gmail.readonly`.
- **Zero Client Token Exposure**: OAuth refresh tokens are stored exclusively on the server side via Cloud Functions. Tokens are never stored in `localStorage`, cookies, or client-accessible Firestore fields.
- **Provider Abstraction**: Extensible design supporting future Microsoft Graph / Outlook integration.
- **Fallback Guidance**: Displays setup instructions and manual import options if API credentials are pending.

---

## 🛠️ Technology Stack

- **Frontend**: React 18, Vite 5, TypeScript 5.6
- **Styling**: Tailwind CSS 3, Lucide Icons, Framer Motion
- **Authentication**: Firebase Authentication
- **Database**: Cloud Firestore
- **Backend / Microservices**: Firebase Cloud Functions (TypeScript, Node 18)
- **Email Integration**: Google APIs (`googleapis`) via OAuth 2.0 authorization code flow
- **Hosting**: Firebase Hosting

---

## 📂 Project Structure

```
├── .firebaserc                     # Firebase active project configuration
├── firebase.json                   # Firebase Hosting, Firestore, and Functions config
├── firestore.indexes.json          # Firestore composite query indexes
├── firestore.rules                 # Security rules with strict validation & role protections
├── index.html                      # Vite entry HTML
├── package.json                    # Frontend dependencies
├── SCHEMA.md                       # Comprehensive Firestore schema & collection dictionary
├── src/
│   ├── App.tsx                     # Main routes & providers
│   ├── main.tsx                    # Entry point
│   ├── components/
│   │   ├── auth/ProtectedRoute.tsx # Route guard
│   │   ├── layout/                 # Sidebar, TopBar, AppLayout
│   │   └── ui/                     # Button, Card, Badge, Input, Progress
│   ├── contexts/
│   │   ├── AuthContext.tsx         # Firebase Auth provider & profile state
│   │   └── ThemeContext.tsx        # Dark / Light theme toggle
│   ├── hooks/
│   │   └── useFirestore.ts         # Real-time collection listener hook
│   ├── lib/
│   │   ├── attendanceCalculations.ts # Mathematical formulas for 75% target
│   │   ├── attendanceCalculations.test.ts # Unit test cases
│   │   ├── firebase.ts             # Firebase Web SDK initialization
│   │   └── utils.ts                # Classnames utility
│   ├── pages/
│   │   ├── auth/                   # Login, Register, ForgotPassword
│   │   ├── DashboardPage.tsx       # Live status, countdown, free slots, pulse
│   │   ├── TimetablePage.tsx       # Weekly & Daily views, Excel import
│   │   ├── SubjectsPage.tsx        # Course catalog & credit definitions
│   │   ├── AttendancePage.tsx      # Attendance logging & correction workflow
│   │   ├── NotificationsPage.tsx   # Alert center & reminder feeds
│   │   ├── EmailSyncPage.tsx       # Gmail connection & sync history
│   │   └── SettingsPage.tsx        # Target percentage & profile customization
│   └── types/index.ts              # Data contracts & TypeScript models
└── functions/                      # Firebase Cloud Functions (TypeScript)
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts                # Cloud functions bundle export
        ├── auth.ts                 # User creation trigger & domain allowlist
        ├── gmail.ts                # OAuth 2.0 flow, token handling, Gmail scan
        ├── scheduled.ts            # Scheduled cron jobs (sync & attendance checks)
        ├── notifications.ts        # FCM push trigger & token registry
        └── types.ts                # Backend types
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 18+
- npm 9+
- Firebase CLI (`npm install -g firebase-tools`)

### 2. Environment Setup
Copy the environment template in the project root:
```bash
cp .env.example .env
```
Fill in your Firebase web application credentials in `.env`:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FUNCTIONS_BASE_URL=https://us-central1-your_project.cloudfunctions.net
```

### 3. Install & Build Frontend
```bash
npm install
npm run build
```

### 4. Install & Build Backend Functions
```bash
cd functions
npm install
npm run build
cd ..
```

### 5. Running the Development Server
```bash
npm run dev
```
Visit `http://localhost:5173`.

---

## 🧪 Testing

### Running Attendance Calculation Unit Tests
The attendance calculation unit tests verify the mathematical formulas against all edge cases:
- Division-by-zero protection on new courses ($0$ conducted classes).
- Exact target matches ($15 / 20 = 75\%$).
- Above target margin calculation ($18 / 20 = 90\% \implies \text{can miss } 4 \text{ classes}$).
- Below target recovery calculation ($10 / 20 = 50\% \implies \text{must attend } 20 \text{ consecutive classes}$).
- Fractional ceiling checks ($7 / 10 = 70\% \implies \text{must attend } 2 \text{ classes}$ to reach $9 / 12 = 75\%$).

Run the test suite:
```bash
node src/lib/testRunner.mjs
```

---

## 🔒 Firestore Security Rules Summary

The `firestore.rules` file enforces zero-trust data access:
- **Ownership Verification**: All document operations within `/users/{uid}/*` require `request.auth.uid == uid`.
- **Privilege Separation**: Clients cannot create or alter `_refreshToken`, `_tokenExpiry`, `historyId`, or role fields.
- **Attendance Verification**: Only `source == 'manual'` writes are permitted directly from client apps. Valid statuses are constrained to `['present', 'absent', 'not_marked', 'cancelled']`.
- **System Collections**: `auditLogs` is completely restricted to Cloud Functions via the Firebase Admin SDK. `timetableRevisions` and `attendanceBaselines` are write-protected from client modification.

### Testing with Firebase Emulator Suite
Start local emulators:
```bash
firebase emulators:start
```
The emulator UI is accessible at `http://localhost:4000`.

---

## 📬 Gmail API Integration Setup

To connect institutional Gmail mailboxes:
1. Open the [Google Cloud Console](https://console.cloud.google.com/) for your Firebase project.
2. Under **APIs & Services**, enable the **Gmail API**.
3. Configure the **OAuth Consent Screen** (User Type: Internal or External) and add scope `https://www.googleapis.com/auth/gmail.readonly`.
4. Create **OAuth 2.0 Client IDs** (Web Application):
   - **Authorized redirect URI**: `https://us-central1-YOUR_PROJECT.cloudfunctions.net/gmailOAuthCallback`
5. Set credentials in `functions/.env`:
   ```env
   GMAIL_CLIENT_ID=your_client_id.apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=your_client_secret
   GMAIL_REDIRECT_URI=https://us-central1-YOUR_PROJECT.cloudfunctions.net/gmailOAuthCallback
   APP_URL=https://your_project.web.app
   ```
6. Deploy functions: `firebase deploy --only functions`.

---

## ☁️ Deployment

### Deploy to Firebase Hosting
```bash
npm run build
firebase deploy --only hosting
```

### Deploy Firestore Security Rules & Indexes
```bash
firebase deploy --only firestore
```

### Deploy Cloud Functions
*(Requires Firebase Blaze Pay-as-you-go plan)*:
```bash
firebase deploy --only functions
```

---

## 📄 License
ClassPulse (UniFlow) is released under the MIT License.
