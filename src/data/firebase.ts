/**
 * EcO — Firebase Initialization & Safe Configuration Boundary
 *
 * Configured with placeholder values ('***') as requested.
 * When real credentials are provided by the project owner in this file,
 * live Firebase Auth and Cloud Firestore persistence are automatically activated.
 *
 * Safe fallback is included so the application runs seamlessly in local preview
 * without throwing unhandled exceptions when credentials remain '***'.
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  Firestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  onSnapshot,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';

// ============================================================================
// FIREBASE CONFIGURATION (REPLACE '***' WITH YOUR FIREBASE PROJECT DETAILS)
// ============================================================================
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyA5FC1nw5OCkLNIBkNBqlOzeW6JY4Nn0dc",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "eco2026-a4b2f.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "eco2026-a4b2f",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "eco2026-a4b2f.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "541806262848",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:541806262848:web:388d09d0e6ae7f18f8fda5"
};

/**
 * Checks if the project owner has replaced the placeholder credentials.
 */
export function isFirebaseConfigured(): boolean {
  return (
    Boolean(firebaseConfig.apiKey) &&
    firebaseConfig.apiKey !== '***' &&
    !firebaseConfig.apiKey.includes('PASTE_') &&
    Boolean(firebaseConfig.projectId) &&
    firebaseConfig.projectId !== '***' &&
    !firebaseConfig.projectId.includes('PASTE_')
  );
}

// Global singletons
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured()) {
  try {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApps()[0];
    }
    auth = getAuth(app);
    try {
      db = initializeFirestore(app, {
        ignoreUndefinedProperties: true
      });
    } catch {
      db = getFirestore(app);
    }
  } catch (err) {
    console.warn('[EcO Firebase] Initialization warning:', err);
  }
}

/**
 * Recursively removes all keys with `undefined` values from an object,
 * ensuring it is 100% compliant with Cloud Firestore's data model.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    if (data instanceof Date) return data;
    const proto = Object.getPrototypeOf(data);
    if (proto && proto.constructor && proto.constructor.name !== 'Object') {
      return data;
    }

    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (value !== undefined) {
        clean[key] = typeof value === 'object' && value !== null ? sanitizeForFirestore(value) : value;
      }
    }
    return clean as T;
  }
  return data;
}

export { app, auth, db };

// ============================================================================
// FIRESTORE STRUCTURED ERROR HANDLING
// ============================================================================
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentAuth = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: currentAuth?.uid || null,
      email: currentAuth?.email || null,
      emailVerified: currentAuth?.emailVerified || null,
      isAnonymous: currentAuth?.isAnonymous || null,
      providerInfo:
        currentAuth?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email
        })) || []
    }
  };

  console.error('[EcO Firestore Error]:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// ============================================================================
// SAFE AUTHENTICATION ACTIONS (With friendly error messages)
// ============================================================================

export interface AuthUserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  providerId: string;
  creationTime?: string;
  lastSignInTime?: string;
}

export function mapFirebaseUser(user: User | null): AuthUserProfile | null {
  if (!user) return null;
  const provider = user.providerData?.[0]?.providerId || 'password';
  return {
    uid: user.uid,
    displayName: user.displayName || user.email?.split('@')[0] || 'EcO User',
    email: user.email,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
    providerId: provider.includes('google') ? 'google' : 'email',
    creationTime: user.metadata?.creationTime,
    lastSignInTime: user.metadata?.lastSignInTime
  };
}

/**
 * Translates Firebase Auth codes to clear, friendly language.
 */
export function getFriendlyAuthErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/user-not-found':
      return 'No account was found with this email. Please check your spelling or sign up.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect password or login credentials. Please try again or reset your password.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email address. Try signing in instead.';
    case 'auth/weak-password':
      return 'Your password is too short. Please use at least 6 characters.';
    case 'auth/popup-closed-by-user':
      return 'Sign in was cancelled. Please try clicking the button again.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Please allow popups for this site and try again.';
    case 'auth/too-many-requests':
      return 'Too many unsuccessful attempts. Access is temporarily restricted. Please try again in a few minutes or reset your password.';
    case 'auth/network-request-failed':
      return 'Network connection error. Please check your internet connection and try again.';
    case 'auth/requires-recent-login':
      return 'This sensitive operation requires a recent sign-in. Please sign out and sign in again before proceeding.';
    default:
      return 'An error occurred during authentication. Please check your connection and try again.';
  }
}

/**
 * Google Sign In
 */
export async function signInWithGoogle(): Promise<AuthUserProfile> {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error('CONFIG_PLACEHOLDER');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const cred = await signInWithPopup(auth, provider);
    return mapFirebaseUser(cred.user)!;
  } catch (error: any) {
    const code = error?.code || '';
    throw new Error(getFriendlyAuthErrorMessage(code));
  }
}

/**
 * Email & Password Sign In
 */
export async function signInWithEmail(email: string, pass: string): Promise<AuthUserProfile> {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error('CONFIG_PLACEHOLDER');
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
    return mapFirebaseUser(cred.user)!;
  } catch (error: any) {
    const code = error?.code || '';
    throw new Error(getFriendlyAuthErrorMessage(code));
  }
}

/**
 * Email & Password Sign Up
 */
export async function signUpWithEmail(
  email: string,
  pass: string,
  displayName: string
): Promise<AuthUserProfile> {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error('CONFIG_PLACEHOLDER');
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    if (displayName && displayName.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
    // Attempt sending verification email gracefully
    try {
      await sendEmailVerification(cred.user);
    } catch (e) {
      console.warn('[EcO Auth] Could not send initial verification email:', e);
    }
    return mapFirebaseUser(cred.user)!;
  } catch (error: any) {
    const code = error?.code || '';
    throw new Error(getFriendlyAuthErrorMessage(code));
  }
}

/**
 * Password Reset
 */
export async function sendPasswordReset(email: string): Promise<void> {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error('CONFIG_PLACEHOLDER');
  }

  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (error: any) {
    // For privacy, we don't leak user-not-found to prevent account enumeration
    const code = error?.code || '';
    if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
      return; // Act as success to prevent account enumeration
    }
    throw new Error(getFriendlyAuthErrorMessage(code));
  }
}

/**
 * Resend Email Verification
 */
export async function sendVerificationLink(): Promise<void> {
  if (!isFirebaseConfigured() || !auth || !auth.currentUser) {
    throw new Error('User is not currently authenticated.');
  }

  try {
    await sendEmailVerification(auth.currentUser);
  } catch (error: any) {
    const code = error?.code || '';
    throw new Error(getFriendlyAuthErrorMessage(code));
  }
}

/**
 * Update User Display Name
 */
export async function updateUserDisplayName(newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('Name cannot be empty.');

  if (isFirebaseConfigured() && auth?.currentUser) {
    try {
      await updateProfile(auth.currentUser, { displayName: trimmed });
      // Update in Firestore doc
      if (db) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await setDoc(userRef, { displayName: trimmed, updatedAt: new Date().toISOString() }, { merge: true });
      }
    } catch (error: any) {
      const code = error?.code || '';
      throw new Error(getFriendlyAuthErrorMessage(code));
    }
  }
}

/**
 * Change Password (requires current password first)
 */
export async function changeUserPassword(currentPass: string, newPass: string): Promise<void> {
  if (!isFirebaseConfigured() || !auth || !auth.currentUser) {
    throw new Error('CONFIG_PLACEHOLDER');
  }

  const user = auth.currentUser;
  if (!user.email) throw new Error('No email associated with current user.');

  try {
    // Re-authenticate
    const cred = EmailAuthProvider.credential(user.email, currentPass);
    await reauthenticateWithCredential(user, cred);
    // Update password
    await updatePassword(user, newPass);
  } catch (error: any) {
    const code = error?.code || '';
    throw new Error(getFriendlyAuthErrorMessage(code));
  }
}

/**
 * Sign Out
 */
export async function signOutUser(): Promise<void> {
  if (isFirebaseConfigured() && auth) {
    await signOut(auth);
  }
}

/**
 * Delete User Account & Data
 */
export async function deleteUserAccount(): Promise<void> {
  if (!isFirebaseConfigured() || !auth || !auth.currentUser) {
    return;
  }

  const user = auth.currentUser;
  const uid = user.uid;

  // 1. Delete all Firestore subcollections for this user
  if (db) {
    const collectionsToClean = [
      'paymentMethods',
      'expenses',
      'recurringExpenses',
      'earnings',
      'transfers',
      'people',
      'transactions',
      'sources',
      'notifications',
      'issueReports'
    ];

    try {
      for (const colName of collectionsToClean) {
        const colRef = collection(db, 'users', uid, colName);
        const snap = await getDocs(colRef);
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      // Delete user root doc
      await deleteDoc(doc(db, 'users', uid));
    } catch (err) {
      console.warn('[EcO Firestore] Could not clean all user docs prior to account delete:', err);
    }
  }

  // 2. Delete Auth user
  try {
    await deleteUser(user);
  } catch (error: any) {
    const code = error?.code || '';
    throw new Error(getFriendlyAuthErrorMessage(code));
  }
}
