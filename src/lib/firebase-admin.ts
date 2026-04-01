import dotenv from 'dotenv';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../frontend/.env') });

const normalizePrivateKey = (rawValue?: string) => {
  if (!rawValue) {
    return undefined;
  }

  let normalized = rawValue.trim().replace(/\r\n/g, '\n');

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }

  normalized = normalized.replace(/\\n/g, '\n');

  if (normalized.includes('-----BEGIN PRIVATE KEY-----')) {
    normalized = normalized.replace(/-----BEGIN PRIVATE KEY-----\s*/, '-----BEGIN PRIVATE KEY-----\n');
  }

  if (normalized.includes('-----END PRIVATE KEY-----')) {
    normalized = normalized.replace(/\s*-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----');
  }

  if (!normalized.endsWith('\n')) {
    normalized = `${normalized}\n`;
  }

  return normalized;
};

const projectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);
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
