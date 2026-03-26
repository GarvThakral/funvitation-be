import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET;

const hasInlineServiceAccount = Boolean(projectId && clientEmail && privateKey);
const hasCredentialPath = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);

export const isFirebaseAdminConfigured = Boolean(projectId && (hasInlineServiceAccount || hasCredentialPath));

const adminApp = isFirebaseAdminConfigured
  ? getApps()[0] ||
    initializeApp(
      hasInlineServiceAccount
        ? {
            credential: cert({
              projectId,
              clientEmail,
              privateKey,
            }),
            projectId,
            storageBucket,
          }
        : {
            credential: applicationDefault(),
            projectId,
            storageBucket,
          }
    )
  : null;

export const adminAuth = adminApp ? getAuth(adminApp) : null;
export const adminDb = adminApp ? getFirestore(adminApp) : null;
