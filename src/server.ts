import crypto from 'crypto';
import dotenv from 'dotenv';
import DodoPayments from 'dodopayments';
import express, { type Request, type Response } from 'express';
import { nanoid } from 'nanoid';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildInvitationPayload } from './lib/invitation.js';
import { adminAuth, adminDb, isFirebaseAdminConfigured } from './lib/firebase-admin.js';
import {
  getPlanByProductId,
  getPlanPolicy,
  getPublicPlanPolicies,
  normalizePlanId,
  validateInvitationAgainstPlan,
} from './lib/pricing.js';
import type { BillingProfile, Invitation, PlanId } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../frontend/.env') });

const app = express();
const PORT = Number(process.env.PORT || 3000);
const corsOrigin = process.env.CORS_ORIGIN || '*';
const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';
const checkoutReturnUrl = process.env.DODO_CHECKOUT_RETURN_URL || `${appBaseUrl}/editor?billing=return`;
const customerPortalReturnUrl =
  process.env.DODO_CUSTOMER_PORTAL_RETURN_URL || `${appBaseUrl}/editor?billing=portal`;

const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
const cloudinaryFolder = process.env.CLOUDINARY_FOLDER || 'funvitation';
const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY;
const dodoEnvironment =
  process.env.DODO_PAYMENTS_ENVIRONMENT === 'live_mode' ? 'live_mode' : 'test_mode';
const dodoWebhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY;

const isCloudinaryConfigured = Boolean(
  cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret
);
const isDodoConfigured = Boolean(dodoApiKey);
const dodoClient = isDodoConfigured
  ? new DodoPayments({
      bearerToken: dodoApiKey,
      environment: dodoEnvironment,
      webhookKey: dodoWebhookKey,
    })
  : null;

const createCloudinarySignature = (params: Record<string, string>, apiSecret: string) => {
  const serialized = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto.createHash('sha1').update(`${serialized}${apiSecret}`).digest('hex');
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isActiveInvite = (status: Invitation['status'] | undefined) => status !== 'archived';

const invitationsCollection = () => {
  if (!adminDb) {
    throw new Error('Firebase Admin is not configured.');
  }

  return adminDb.collection('invitations');
};

const billingProfilesCollection = () => {
  if (!adminDb) {
    throw new Error('Firebase Admin is not configured.');
  }

  return adminDb.collection('billing_profiles');
};

const processedWebhooksCollection = () => {
  if (!adminDb) {
    throw new Error('Firebase Admin is not configured.');
  }

  return adminDb.collection('processed_webhooks');
};

const requireBackendConfig = (res: Response) => {
  if (!isFirebaseAdminConfigured || !adminAuth || !adminDb) {
    res.status(500).json({
      error:
        'Backend auth/storage is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.',
    });
    return false;
  }

  return true;
};

const getBearerToken = (request: Request) => {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length).trim() || null;
};

const requireAuthenticatedUser = async (request: Request, response: Response) => {
  if (!requireBackendConfig(response) || !adminAuth) {
    return null;
  }

  const token = getBearerToken(request);
  if (!token) {
    response.status(401).json({ error: 'Authentication required.' });
    return null;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email) {
      response.status(400).json({ error: 'Authenticated user is missing an email address.' });
      return null;
    }

    return {
      uid: decoded.uid,
      email: decoded.email,
      displayName: decoded.name || undefined,
    };
  } catch {
    response.status(401).json({ error: 'Invalid or expired authentication token.' });
    return null;
  }
};

const getDefaultBillingProfile = (params: {
  uid: string;
  email: string;
  displayName?: string;
}): BillingProfile => ({
  uid: params.uid,
  email: params.email,
  emailLower: normalizeEmail(params.email),
  displayName: params.displayName,
  planId: 'starter',
  subscriptionStatus: 'free',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const getOrCreateBillingProfile = async (params: {
  uid: string;
  email: string;
  displayName?: string;
}) => {
  const docRef = billingProfilesCollection().doc(params.uid);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    const profile = getDefaultBillingProfile(params);
    await docRef.set(profile);
    return profile;
  }

  const profile = snapshot.data() as BillingProfile;
  const nextEmailLower = normalizeEmail(params.email);
  if (
    profile.email !== params.email ||
    profile.emailLower !== nextEmailLower ||
    profile.displayName !== params.displayName
  ) {
    const updatedProfile: BillingProfile = {
      ...profile,
      email: params.email,
      emailLower: nextEmailLower,
      displayName: params.displayName,
      updatedAt: Date.now(),
    };
    await docRef.set(updatedProfile, { merge: true });
    return updatedProfile;
  }

  return profile;
};

const findBillingProfileByEmail = async (email: string) => {
  const snapshot = await billingProfilesCollection()
    .where('emailLower', '==', normalizeEmail(email))
    .limit(1)
    .get();

  return snapshot.docs[0] ?? null;
};

const countActiveInvites = async (ownerUid: string) => {
  const snapshot = await invitationsCollection().where('ownerUid', '==', ownerUid).get();
  return snapshot.docs.reduce((count, doc) => {
    const invitation = doc.data() as Invitation;
    return isActiveInvite(invitation.status) ? count + 1 : count;
  }, 0);
};

const buildBillingOverview = (profile: BillingProfile, activeInviteCount: number) => {
  const currentPlan = getPlanPolicy(profile.planId);
  const maxActiveInvites = currentPlan.limits.maxActiveInvites;

  return {
    profile: {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName,
      planId: profile.planId,
      subscriptionStatus: profile.subscriptionStatus,
      hasCustomerPortal: Boolean(profile.dodoCustomerId),
    },
    currentPlan: {
      id: currentPlan.id,
      label: currentPlan.label,
      priceLabel: currentPlan.priceLabel,
      marketingFeatures: currentPlan.marketingFeatures,
      limits: currentPlan.limits,
      capabilities: currentPlan.capabilities,
      checkoutEnabled: Boolean(currentPlan.dodoProductId),
      isFree: currentPlan.id === 'starter',
    },
    plans: getPublicPlanPolicies(),
    usage: {
      activeInvites: activeInviteCount,
      maxActiveInvites,
      remainingActiveInvites:
        maxActiveInvites === null ? null : Math.max(0, maxActiveInvites - activeInviteCount),
    },
  };
};

const isPaidPlan = (planId: PlanId) => planId !== 'starter';

const markWebhookProcessed = async (webhookId: string) => {
  const ref = processedWebhooksCollection().doc(webhookId);
  const snapshot = await ref.get();
  if (snapshot.exists) {
    return false;
  }

  await ref.set({ processedAt: Date.now() });
  return true;
};

const syncBillingProfileFromSubscription = async (eventType: string, payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return;
  }

  const subscription = payload as {
    customer?: { customer_id?: string; email?: string; name?: string };
    product_id?: string;
    subscription_id?: string;
    status?: string;
  };

  const email = subscription.customer?.email;
  if (!email) {
    return;
  }

  const billingDoc = await findBillingProfileByEmail(email);
  if (!billingDoc) {
    return;
  }

  const current = billingDoc.data() as BillingProfile;
  const derivedPlanId = getPlanByProductId(subscription.product_id) ?? 'starter';
  const shouldResetToStarter =
    eventType === 'subscription.cancelled' ||
    eventType === 'subscription.expired' ||
    eventType === 'subscription.failed' ||
    eventType === 'subscription.on_hold';

  const nextPlanId = shouldResetToStarter ? 'starter' : derivedPlanId;
  const nextStatus = shouldResetToStarter
    ? eventType.replace('subscription.', '')
    : subscription.status === 'active'
      ? 'active'
      : current.subscriptionStatus;

  const nextProfile: BillingProfile = {
    ...current,
    email,
    emailLower: normalizeEmail(email),
    displayName: subscription.customer?.name || current.displayName,
    planId: nextPlanId,
    subscriptionStatus:
      nextStatus === 'active' ||
      nextStatus === 'pending' ||
      nextStatus === 'on_hold' ||
      nextStatus === 'cancelled' ||
      nextStatus === 'failed' ||
      nextStatus === 'expired'
        ? nextStatus
        : current.subscriptionStatus,
    dodoCustomerId: subscription.customer?.customer_id || current.dodoCustomerId,
    dodoSubscriptionId: subscription.subscription_id || current.dodoSubscriptionId,
    dodoProductId: subscription.product_id || current.dodoProductId,
    updatedAt: Date.now(),
  };

  await billingDoc.ref.set(nextProfile, { merge: true });
};

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', corsOrigin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

app.post('/api/webhooks/dodo', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!dodoClient || !dodoWebhookKey) {
    res.status(500).json({ error: 'Dodo webhook integration is not configured.' });
    return;
  }

  const webhookId = String(req.headers['webhook-id'] || '');
  const webhookSignature = String(req.headers['webhook-signature'] || '');
  const webhookTimestamp = String(req.headers['webhook-timestamp'] || '');
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  try {
    const event = dodoClient.webhooks.unwrap(rawBody, {
      headers: {
        'webhook-id': webhookId,
        'webhook-signature': webhookSignature,
        'webhook-timestamp': webhookTimestamp,
      },
    }) as { type: string; data?: unknown };

    if (webhookId) {
      const isNew = await markWebhookProcessed(webhookId);
      if (!isNew) {
        res.status(200).json({ received: true, duplicate: true });
        return;
      }
    }

    if (event.type.startsWith('subscription.')) {
      await syncBillingProfileFromSubscription(event.type, event.data);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Dodo webhook processing failed:', error);
    res.status(401).json({ error: 'Invalid webhook signature.' });
  }
});

app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/billing/plans', (req, res) => {
  res.json({ plans: getPublicPlanPolicies() });
});

app.get('/api/billing/me', async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const profile = await getOrCreateBillingProfile(user);
  const activeInviteCount = await countActiveInvites(user.uid);
  res.json(buildBillingOverview(profile, activeInviteCount));
});

app.post('/api/billing/checkout', async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  if (!dodoClient) {
    res.status(500).json({ error: 'Dodo Payments is not configured on the backend.' });
    return;
  }

  const requestedPlanId = normalizePlanId(req.body?.planId);
  if (!requestedPlanId || !isPaidPlan(requestedPlanId)) {
    res.status(400).json({ error: 'Select a valid paid plan.' });
    return;
  }

  const requestedPlan = getPlanPolicy(requestedPlanId);
  if (!requestedPlan.dodoProductId) {
    res.status(500).json({ error: `${requestedPlan.label} is not mapped to a Dodo product id.` });
    return;
  }

  const profile = await getOrCreateBillingProfile(user);

  try {
    if (
      profile.planId === requestedPlanId &&
      profile.subscriptionStatus === 'active' &&
      profile.dodoSubscriptionId
    ) {
      res.status(409).json({ error: `You are already on the ${requestedPlan.label} plan.` });
      return;
    }

    if (
      profile.planId !== 'starter' &&
      profile.subscriptionStatus === 'active' &&
      profile.dodoSubscriptionId
    ) {
      await dodoClient.subscriptions.changePlan(profile.dodoSubscriptionId, {
        product_id: requestedPlan.dodoProductId,
        quantity: 1,
        proration_billing_mode: 'prorated_immediately',
        effective_at: 'immediately',
      });

      res.json({
        mode: 'changed',
        message: `Requested move to ${requestedPlan.label}. Billing status will refresh when Dodo confirms the change.`,
      });
      return;
    }

    const session = await dodoClient.checkoutSessions.create({
      product_cart: [{ product_id: requestedPlan.dodoProductId, quantity: 1 }],
      customer: {
        email: user.email,
        name: user.displayName || user.email,
      },
      return_url: checkoutReturnUrl,
      cancel_url: `${appBaseUrl}/#pricing`,
      metadata: {
        firebase_uid: user.uid,
        requested_plan: requestedPlanId,
      },
      show_saved_payment_methods: true,
    });

    await billingProfilesCollection().doc(user.uid).set(
      {
        email: user.email,
        emailLower: normalizeEmail(user.email),
        displayName: user.displayName,
        lastCheckoutSessionId: session.session_id,
        subscriptionStatus: profile.planId === 'starter' ? 'pending' : profile.subscriptionStatus,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    if (!session.checkout_url) {
      res.status(502).json({ error: 'Dodo checkout session did not return a checkout URL.' });
      return;
    }

    res.json({ mode: 'checkout', checkoutUrl: session.checkout_url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create checkout session.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/billing/portal', async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  if (!dodoClient) {
    res.status(500).json({ error: 'Dodo Payments is not configured on the backend.' });
    return;
  }

  const profile = await getOrCreateBillingProfile(user);
  if (!profile.dodoCustomerId) {
    res.status(409).json({ error: 'No paid billing profile exists for this account yet.' });
    return;
  }

  try {
    const session = await dodoClient.customers.customerPortal.create(profile.dodoCustomerId, {
      return_url: customerPortalReturnUrl,
    });
    res.json({ portalUrl: session.link });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create a customer portal session.';
    res.status(500).json({ error: message });
  }
});

app.get('/api/invitations/mine', async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const snapshot = await invitationsCollection().where('ownerUid', '==', user.uid).get();
  const invitations = snapshot.docs
    .map((doc) => doc.data() as Invitation)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((invitation) => ({
      id: invitation.id,
      title: invitation.title,
      templateId: invitation.templateId,
      status: invitation.status || 'active',
      createdAt: invitation.createdAt,
    }));

  res.json({ invitations });
});

app.patch('/api/invitations/:id/archive', async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'Missing invitation id.' });
    return;
  }

  const docRef = invitationsCollection().doc(id);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    res.status(404).json({ error: 'Invitation not found.' });
    return;
  }

  const invitation = snapshot.data() as Invitation;
  if (invitation.ownerUid !== user.uid) {
    res.status(403).json({ error: 'You do not have access to archive this invitation.' });
    return;
  }

  await docRef.set({ status: 'archived' }, { merge: true });
  res.json({ archived: true });
});

app.post('/api/invitations', async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  const rawInvitation = req.body?.invitation as Partial<Invitation> | undefined;
  if (!rawInvitation || typeof rawInvitation !== 'object') {
    res.status(400).json({ error: 'Invalid request payload.' });
    return;
  }

  try {
    const profile = await getOrCreateBillingProfile(user);
    const plan = getPlanPolicy(profile.planId);
    const activeInviteCount = await countActiveInvites(user.uid);

    if (
      plan.limits.maxActiveInvites !== null &&
      activeInviteCount >= plan.limits.maxActiveInvites
    ) {
      res.status(403).json({
        error: `${plan.label} allows ${plan.limits.maxActiveInvites} active invite. Archive an existing invite or upgrade your plan.`,
      });
      return;
    }

    const planViolation = validateInvitationAgainstPlan(rawInvitation, plan);
    if (planViolation) {
      res.status(403).json({ error: planViolation });
      return;
    }

    const id = nanoid(10);
    const invitation = buildInvitationPayload({
      id,
      elements: Array.isArray(rawInvitation.elements) ? rawInvitation.elements : [],
      backgroundColor: rawInvitation.backgroundColor || '#ffffff',
      successMessage: rawInvitation.successMessage || 'Yay! I love you! ❤️',
      rejectionMessage:
        rawInvitation.rejectionMessage || 'That answer is not getting away so easily.',
      animationType: rawInvitation.animationType || 'none',
      entranceAnimation: rawInvitation.entranceAnimation || 'fadein',
      musicUrl: rawInvitation.musicUrl || '',
      canvasSize: rawInvitation.canvasSize || { width: 600, height: 800 },
      templateId: rawInvitation.templateId,
    });

    const storedInvitation: Invitation = {
      ...invitation,
      status: 'active',
      ownerUid: user.uid,
      ownerEmail: user.email,
    };

    await invitationsCollection().doc(id).set(storedInvitation);
    res.json({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save invitation.';
    res.status(500).json({ error: message });
  }
});

app.get('/api/invitations/:id', async (req, res) => {
  if (!requireBackendConfig(res)) {
    return;
  }

  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'Missing invitation id.' });
    return;
  }

  try {
    const snapshot = await invitationsCollection().doc(id).get();
    if (!snapshot.exists) {
      res.status(404).json({ error: 'Invitation not found.' });
      return;
    }

    const invitation = snapshot.data() as Invitation;
    if (!isActiveInvite(invitation.status)) {
      res.status(404).json({ error: 'Invitation not found.' });
      return;
    }

    res.json({ invitation });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch invitation.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/upload-image', async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  if (!isCloudinaryConfigured) {
    res.status(500).json({
      error:
        'Server image upload is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    });
    return;
  }

  const { dataUrl } = req.body ?? {};
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    res.status(400).json({ error: 'Invalid payload. Expected image data URL.' });
    return;
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createCloudinarySignature(
      { folder: cloudinaryFolder, timestamp },
      cloudinaryApiSecret as string
    );

    const formData = new FormData();
    formData.append('file', dataUrl);
    formData.append('folder', cloudinaryFolder);
    formData.append('timestamp', timestamp);
    formData.append('api_key', cloudinaryApiKey as string);
    formData.append('signature', signature);

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/upload`,
      {
        method: 'POST',
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
      res.status(502).json({ error: 'Cloudinary response missing secure_url.' });
      return;
    }

    res.json({ secureUrl: result.secure_url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected upload error.';
    res.status(500).json({ error: message });
  }
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
