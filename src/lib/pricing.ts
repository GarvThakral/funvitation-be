import {
  DEFAULT_CANVAS_SIZE,
  DEFAULT_REJECTION_MESSAGE,
  DEFAULT_SUCCESS_MESSAGE,
  sanitizeCanvasSize,
} from './invitation.js';
import type { Invitation, PlanId } from '../types.js';

export type TemplateAccess = 'core' | 'all';

export interface PlanCapabilities {
  templateAccess: TemplateAccess;
  allowCustomResponseMessages: boolean;
  allowMusic: boolean;
  allowPostLoadEffects: boolean;
  allowPremiumEntranceAnimations: boolean;
  allowCustomCanvasSize: boolean;
}

export interface PlanPolicy {
  id: PlanId;
  label: string;
  priceLabel: string;
  marketingFeatures: string[];
  dodoProductId?: string;
  limits: {
    maxActiveInvites: number | null;
  };
  capabilities: PlanCapabilities;
}

export interface PublicPlanPolicy extends Omit<PlanPolicy, 'dodoProductId'> {
  checkoutEnabled: boolean;
  isFree: boolean;
}

type PartialPlanOverride = Partial<Omit<PlanPolicy, 'id'>> & {
  limits?: Partial<PlanPolicy['limits']>;
  capabilities?: Partial<PlanCapabilities>;
};

const parseJsonEnv = <T>(value: string | undefined, fallback: T): T => {
  if (!value?.trim()) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const DEFAULT_POLICIES: Record<PlanId, PlanPolicy> = {
  starter: {
    id: 'starter',
    label: 'Starter',
    priceLabel: '$0',
    marketingFeatures: ['1 active invite', 'Core templates', 'Basic sharing'],
    limits: {
      maxActiveInvites: 1,
    },
    capabilities: {
      templateAccess: 'core',
      allowCustomResponseMessages: false,
      allowMusic: false,
      allowPostLoadEffects: false,
      allowPremiumEntranceAnimations: false,
      allowCustomCanvasSize: false,
    },
  },
  creator: {
    id: 'creator',
    label: 'Creator',
    priceLabel: '$12/mo',
    marketingFeatures: ['Unlimited invites', 'Premium templates', 'Custom response messages'],
    limits: {
      maxActiveInvites: null,
    },
    capabilities: {
      templateAccess: 'all',
      allowCustomResponseMessages: true,
      allowMusic: false,
      allowPostLoadEffects: false,
      allowPremiumEntranceAnimations: false,
      allowCustomCanvasSize: false,
    },
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    priceLabel: '$29/mo',
    marketingFeatures: ['Unlimited invites', 'Music + premium effects', 'Custom canvas sizes'],
    limits: {
      maxActiveInvites: null,
    },
    capabilities: {
      templateAccess: 'all',
      allowCustomResponseMessages: true,
      allowMusic: true,
      allowPostLoadEffects: true,
      allowPremiumEntranceAnimations: true,
      allowCustomCanvasSize: true,
    },
  },
};

const ENV_OVERRIDES = parseJsonEnv<Partial<Record<PlanId, PartialPlanOverride>>>(
  process.env.PRICING_CONFIG_JSON,
  {}
);

const mergePolicy = (base: PlanPolicy, override: PartialPlanOverride | undefined): PlanPolicy => ({
  ...base,
  ...override,
  id: base.id,
  dodoProductId:
    base.id === 'creator'
      ? process.env.DODO_CREATOR_PRODUCT_ID || override?.dodoProductId || base.dodoProductId
      : base.id === 'studio'
        ? process.env.DODO_STUDIO_PRODUCT_ID || override?.dodoProductId || base.dodoProductId
        : undefined,
  marketingFeatures: override?.marketingFeatures ?? base.marketingFeatures,
  limits: {
    ...base.limits,
    ...override?.limits,
  },
  capabilities: {
    ...base.capabilities,
    ...override?.capabilities,
  },
});

export const PLAN_POLICIES: Record<PlanId, PlanPolicy> = {
  starter: mergePolicy(DEFAULT_POLICIES.starter, ENV_OVERRIDES.starter),
  creator: mergePolicy(DEFAULT_POLICIES.creator, ENV_OVERRIDES.creator),
  studio: mergePolicy(DEFAULT_POLICIES.studio, ENV_OVERRIDES.studio),
};

export const CORE_TEMPLATE_IDS = new Set(
  (process.env.CORE_TEMPLATE_IDS || 'valentine,birthday')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const PREMIUM_ENTRANCE_ANIMATIONS = new Set<NonNullable<Invitation['entranceAnimation']>>([
  'envelope',
  'slideup',
  'cardflip',
]);

const PRESET_CANVAS_SIZES = new Set([
  '600x600',
  '600x900',
  '900x600',
  '794x1123',
  `${DEFAULT_CANVAS_SIZE.width}x${DEFAULT_CANVAS_SIZE.height}`,
]);

export const getPlanPolicy = (planId: PlanId) => PLAN_POLICIES[planId] ?? PLAN_POLICIES.starter;

export const getPublicPlanPolicies = (): PublicPlanPolicy[] =>
  (Object.values(PLAN_POLICIES) as PlanPolicy[]).map((plan) => ({
    id: plan.id,
    label: plan.label,
    priceLabel: plan.priceLabel,
    marketingFeatures: plan.marketingFeatures,
    limits: plan.limits,
    capabilities: plan.capabilities,
    checkoutEnabled: Boolean(plan.dodoProductId),
    isFree: plan.id === 'starter',
  }));

export const getPlanByProductId = (productId: string | undefined): PlanId | null => {
  if (!productId) {
    return null;
  }

  const match = (Object.values(PLAN_POLICIES) as PlanPolicy[]).find(
    (plan) => plan.dodoProductId && plan.dodoProductId === productId
  );

  return match?.id ?? null;
};

export const normalizePlanId = (value: string | undefined | null): PlanId | null => {
  if (value === 'starter' || value === 'creator' || value === 'studio') {
    return value;
  }

  return null;
};

const hasCustomCanvasSize = (invitation: Partial<Invitation>) => {
  const safeCanvasSize = sanitizeCanvasSize(invitation.canvasSize);
  return !PRESET_CANVAS_SIZES.has(`${Math.round(safeCanvasSize.width)}x${Math.round(safeCanvasSize.height)}`);
};

export const validateInvitationAgainstPlan = (
  invitation: Partial<Invitation>,
  plan: PlanPolicy
): string | null => {
  if (
    plan.capabilities.templateAccess === 'core' &&
    invitation.templateId &&
    !CORE_TEMPLATE_IDS.has(invitation.templateId)
  ) {
    return `${plan.label} does not include premium templates.`;
  }

  if (
    !plan.capabilities.allowCustomResponseMessages &&
    ((invitation.successMessage || DEFAULT_SUCCESS_MESSAGE) !== DEFAULT_SUCCESS_MESSAGE ||
      (invitation.rejectionMessage || DEFAULT_REJECTION_MESSAGE) !== DEFAULT_REJECTION_MESSAGE)
  ) {
    return `${plan.label} does not include custom accept/reject messages.`;
  }

  if (!plan.capabilities.allowMusic && invitation.musicUrl?.trim()) {
    return `${plan.label} does not include music uploads.`;
  }

  if (!plan.capabilities.allowPostLoadEffects && invitation.animationType && invitation.animationType !== 'none') {
    return `${plan.label} does not include premium post-load effects.`;
  }

  if (
    !plan.capabilities.allowPremiumEntranceAnimations &&
    invitation.entranceAnimation &&
    PREMIUM_ENTRANCE_ANIMATIONS.has(invitation.entranceAnimation)
  ) {
    return `${plan.label} does not include premium entrance animations.`;
  }

  if (!plan.capabilities.allowCustomCanvasSize && hasCustomCanvasSize(invitation)) {
    return `${plan.label} does not include custom canvas sizes.`;
  }

  return null;
};
