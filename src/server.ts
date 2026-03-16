import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import dotenv from "dotenv";
import { nanoid } from "nanoid";
import { initializeApp } from "firebase/app";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { buildInvitationPayload } from "./lib/invitation";
import type { Invitation } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../frontend/.env") });

const app = express();
const PORT = Number(process.env.PORT || 3000);
const corsOrigin = process.env.CORS_ORIGIN || "*";

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", corsOrigin);
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});
app.use(express.json({ limit: "15mb" }));

const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
const cloudinaryFolder = process.env.CLOUDINARY_FOLDER || "funvitation";
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID,
};

const isCloudinaryConfigured = Boolean(
  cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret
);
const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.storageBucket &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId
);
const firebaseApp = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
const db = firebaseApp ? getFirestore(firebaseApp) : null;

const createCloudinarySignature = (params: Record<string, string>, apiSecret: string) => {
  const serialized = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return crypto.createHash("sha1").update(`${serialized}${apiSecret}`).digest("hex");
};

// API routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/invitations", async (req, res) => {
  if (!db) {
    res.status(500).json({
      error:
        "Server invite storage is not configured. Set FIREBASE_* environment variables on the backend.",
    });
    return;
  }

  const rawInvitation = req.body?.invitation as Partial<Invitation> | undefined;
  if (!rawInvitation || typeof rawInvitation !== "object") {
    res.status(400).json({ error: "Invalid request payload." });
    return;
  }

  try {
    const id = nanoid(10);
    const invitation = buildInvitationPayload({
      id,
      elements: Array.isArray(rawInvitation.elements) ? rawInvitation.elements : [],
      backgroundColor: rawInvitation.backgroundColor || "#ffffff",
      successMessage: rawInvitation.successMessage || "Yay! I love you! ❤️",
      animationType: rawInvitation.animationType || "none",
      musicUrl: rawInvitation.musicUrl || "",
    });

    await setDoc(doc(db, "invitations", id), invitation);
    res.json({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save invitation.";
    res.status(500).json({ error: message });
  }
});

app.get("/api/invitations/:id", async (req, res) => {
  if (!db) {
    res.status(500).json({
      error:
        "Server invite storage is not configured. Set FIREBASE_* environment variables on the backend.",
    });
    return;
  }

  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "Missing invitation id." });
    return;
  }

  try {
    const snapshot = await getDoc(doc(db, "invitations", id));
    if (!snapshot.exists()) {
      res.status(404).json({ error: "Invitation not found." });
      return;
    }

    res.json({ invitation: snapshot.data() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch invitation.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/upload-image", async (req, res) => {
  if (!isCloudinaryConfigured) {
    res.status(500).json({
      error:
        "Server image upload is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    });
    return;
  }

  const { dataUrl } = req.body ?? {};
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    res.status(400).json({ error: "Invalid payload. Expected image data URL." });
    return;
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createCloudinarySignature(
      { folder: cloudinaryFolder, timestamp },
      cloudinaryApiSecret as string
    );

    const formData = new FormData();
    formData.append("file", dataUrl);
    formData.append("folder", cloudinaryFolder);
    formData.append("timestamp", timestamp);
    formData.append("api_key", cloudinaryApiKey as string);
    formData.append("signature", signature);

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      res.status(502).json({ error: `Cloudinary upload failed: ${errorText}` });
      return;
    }

    const result = (await uploadResponse.json()) as { secure_url?: string };
    if (!result.secure_url) {
      res.status(502).json({ error: "Cloudinary response missing secure_url." });
      return;
    }

    res.json({ secureUrl: result.secure_url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected upload error.";
    res.status(500).json({ error: message });
  }
});

if (process.env.VERCEL !== "1") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
