import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  Firestore,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getMessaging, isSupported } from 'firebase/messaging';

const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && import.meta && import.meta.env
    ? import.meta.env
    : typeof process !== 'undefined' && process.env
    ? process.env
    : {};

const rawApiKey = env.VITE_FIREBASE_API_KEY;
export const isFirebaseConfigured = Boolean(
  rawApiKey &&
  rawApiKey !== 'your_api_key' &&
  !rawApiKey.includes('YOUR_') &&
  !rawApiKey.includes('your_')
);

// Resilient configuration prevents synchronous app crash on local machines before .env is populated
const firebaseConfig = {
  apiKey: isFirebaseConfigured ? rawApiKey : 'AIzaSyDemoKeyForLocalTesting12345',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'uniflow-demo.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'uniflow-demo',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'uniflow-demo.appspot.com',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: env.VITE_FIREBASE_APP_ID || '1:1234567890:web:abcdef123456',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || 'G-XXXXXXXXXX',
};

// Ensure single Firebase app initialization
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Auth centrally
export const auth = getAuth(app);

// Explicitly set browserLocalPersistence on the auth instance
export async function ensureAuthPersistence(): Promise<void> {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (err) {
    console.warn('Firebase setPersistence warning:', err);
  }
}

// Immediately trigger persistence setup
ensureAuthPersistence();

// Initialize Firestore with persistent IndexedDB multi-tab cache when in browser environment
let dbInstance: Firestore;
if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
  try {
    dbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    dbInstance = getFirestore(app);
  }
} else {
  dbInstance = getFirestore(app);
}

export const db = dbInstance;
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Connect to local Firebase Emulators when VITE_USE_FIREBASE_EMULATOR is enabled
if (env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectFunctionsEmulator(functions, 'localhost', 5001);
    console.info('Connected to local Firebase Emulators (Auth: 9099, Firestore: 8080, Functions: 5001)');
  } catch (err) {
    console.warn('Firebase emulator connection note:', err);
  }
}

export const messaging = async () => {
  const supported = await isSupported();
  return supported ? getMessaging(app) : null;
};
