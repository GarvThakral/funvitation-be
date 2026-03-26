export type TextAlign = 'left' | 'center' | 'right';
export type FontWeight = 'normal' | 'bold';
export type ButtonSize = 'small' | 'medium' | 'large' | 'custom';
export type EntranceAnimation = 'envelope' | 'fadein' | 'slideup' | 'cardflip' | 'none';
export type ElementAnimationType = 'none' | 'pulse' | 'bounce' | 'shake' | 'fadeLoop' | 'spin';
export type InvitationStatus = 'active' | 'archived';
export type PlanId = 'starter' | 'creator' | 'studio';

export interface ElementAnimationConfig {
  type: ElementAnimationType;
  duration?: number;
  loop?: boolean;
  delay?: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface CanvasElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'character' | 'button';
  x: number;
  y: number;
  width?: number;
  height?: number;
  fill?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: FontWeight;
  textAlign?: TextAlign;
  lineHeight?: number;
  textColor?: string;
  borderRadius?: number;
  buttonSize?: ButtonSize;
  paddingX?: number;
  paddingY?: number;
  rotation?: number;
  src?: string;
  characterPart?: string;
  buttonType?: 'yes' | 'no';
  elementAnimation?: ElementAnimationConfig;
}

export interface Invitation {
  id: string;
  title: string;
  elements: CanvasElement[];
  backgroundColor: string;
  successMessage?: string;
  rejectionMessage?: string;
  successImage?: string;
  animationType?: 'confetti' | 'holi' | 'none';
  entranceAnimation?: EntranceAnimation;
  musicUrl?: string;
  canvasSize?: CanvasSize;
  templateId?: string;
  status?: InvitationStatus;
  ownerUid?: string;
  ownerEmail?: string;
  createdAt: number;
}

export interface BillingProfile {
  uid: string;
  email: string;
  emailLower: string;
  displayName?: string;
  planId: PlanId;
  subscriptionStatus: 'free' | 'active' | 'pending' | 'on_hold' | 'cancelled' | 'failed' | 'expired';
  dodoCustomerId?: string;
  dodoSubscriptionId?: string;
  dodoProductId?: string;
  lastCheckoutSessionId?: string;
  createdAt: number;
  updatedAt: number;
}
