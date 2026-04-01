import { nanoid } from 'nanoid';
import type { CanvasElement, Invitation } from '../types';

const ALLOWED_ELEMENT_TYPES: CanvasElement['type'][] = ['text', 'image', 'shape', 'character', 'button'];
const ALLOWED_ANIMATIONS: Array<Invitation['animationType']> = ['confetti', 'holi', 'none'];
const ALLOWED_ENTRANCE_ANIMATIONS: Array<Invitation['entranceAnimation']> = [
  'envelope',
  'fadein',
  'slideup',
  'cardflip',
  'none',
];
const ALLOWED_TEXT_ALIGNMENTS: Array<CanvasElement['textAlign']> = ['left', 'center', 'right'];
const ALLOWED_FONT_WEIGHTS: Array<CanvasElement['fontWeight']> = ['normal', 'bold'];
const ALLOWED_BUTTON_SIZES: Array<CanvasElement['buttonSize']> = ['small', 'medium', 'large', 'custom'];
const ALLOWED_ELEMENT_ANIMATION_TYPES: Array<NonNullable<CanvasElement['elementAnimation']>['type']> = [
  'none',
  'pulse',
  'bounce',
  'shake',
  'fadeLoop',
  'spin',
];

export const DEFAULT_SUCCESS_MESSAGE = 'Yay! I love you! ❤️';
export const DEFAULT_REJECTION_MESSAGE = 'That answer is not getting away so easily.';
export const DEFAULT_TEXT_FONT = 'Inter';
export const DEFAULT_TEXT_ALIGN: NonNullable<CanvasElement['textAlign']> = 'left';
export const DEFAULT_FONT_WEIGHT: NonNullable<CanvasElement['fontWeight']> = 'normal';
export const DEFAULT_LINE_HEIGHT = 1.2;
export const DEFAULT_BUTTON_TEXT_COLOR = '#ffffff';
export const DEFAULT_BUTTON_RADIUS = 18;
export const DEFAULT_BUTTON_SIZE: NonNullable<CanvasElement['buttonSize']> = 'medium';
export const DEFAULT_ENTRANCE_ANIMATION: NonNullable<Invitation['entranceAnimation']> = 'fadein';
export const DEFAULT_CANVAS_SIZE = { width: 600, height: 800 };
export const DEFAULT_ELEMENT_ANIMATION: NonNullable<CanvasElement['elementAnimation']> = {
  type: 'none',
  loop: true,
  delay: 0,
};

const toFiniteNumber = (value: unknown, fallback: number) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const coerced = Number(value);
  return Number.isFinite(coerced) ? coerced : fallback;
};

const toSafeString = (value: unknown, fallback = '') => {
  return typeof value === 'string' ? value : fallback;
};

const getSafeTextAlign = (value: unknown, fallback: NonNullable<CanvasElement['textAlign']>) => {
  return ALLOWED_TEXT_ALIGNMENTS.includes(value as CanvasElement['textAlign'])
    ? (value as NonNullable<CanvasElement['textAlign']>)
    : fallback;
};

const getSafeFontWeight = (value: unknown, fallback: NonNullable<CanvasElement['fontWeight']>) => {
  return ALLOWED_FONT_WEIGHTS.includes(value as CanvasElement['fontWeight'])
    ? (value as NonNullable<CanvasElement['fontWeight']>)
    : fallback;
};

const getSafeButtonSize = (value: unknown, fallback: NonNullable<CanvasElement['buttonSize']>) => {
  return ALLOWED_BUTTON_SIZES.includes(value as CanvasElement['buttonSize'])
    ? (value as NonNullable<CanvasElement['buttonSize']>)
    : fallback;
};

const getSafeEntranceAnimation = (
  value: unknown,
  fallback: NonNullable<Invitation['entranceAnimation']>
) => {
  return ALLOWED_ENTRANCE_ANIMATIONS.includes(value as Invitation['entranceAnimation'])
    ? (value as NonNullable<Invitation['entranceAnimation']>)
    : fallback;
};

const sanitizeElementAnimation = (
  value: CanvasElement['elementAnimation']
): NonNullable<CanvasElement['elementAnimation']> => {
  if (!value) {
    return { ...DEFAULT_ELEMENT_ANIMATION };
  }

  const safeType = ALLOWED_ELEMENT_ANIMATION_TYPES.includes(value.type)
    ? value.type
    : DEFAULT_ELEMENT_ANIMATION.type;
  const duration =
    value.duration === undefined ? undefined : Math.max(0.3, Math.min(5, toFiniteNumber(value.duration, 1)));
  const delay =
    value.delay === undefined ? 0 : Math.max(0, Math.min(5, toFiniteNumber(value.delay, 0)));

  const sanitized: NonNullable<CanvasElement['elementAnimation']> = {
    type: safeType,
    loop: value.loop ?? true,
    delay,
  };

  if (duration !== undefined) {
    sanitized.duration = duration;
  }

  return sanitized;
};

export const sanitizeCanvasSize = (value: Invitation['canvasSize']) => {
  const width = Math.max(1, Math.min(1600, toFiniteNumber(value?.width, DEFAULT_CANVAS_SIZE.width)));
  const height = Math.max(1, Math.min(2000, toFiniteNumber(value?.height, DEFAULT_CANVAS_SIZE.height)));
  return { width, height };
};

export const estimateBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

export const sanitizeElement = (element: CanvasElement): CanvasElement => {
  const safeType = ALLOWED_ELEMENT_TYPES.includes(element.type) ? element.type : 'shape';

  const sanitized: CanvasElement = {
    id: toSafeString(element.id, nanoid()),
    type: safeType,
    x: toFiniteNumber(element.x, 0),
    y: toFiniteNumber(element.y, 0),
    rotation: toFiniteNumber(element.rotation, 0),
  };

  if (element.width !== undefined) sanitized.width = toFiniteNumber(element.width, 100);
  if (element.height !== undefined) sanitized.height = toFiniteNumber(element.height, 100);
  if (element.fill !== undefined) sanitized.fill = toSafeString(element.fill, '#3b82f6');
  if (element.text !== undefined) sanitized.text = toSafeString(element.text);
  if (element.fontSize !== undefined) sanitized.fontSize = toFiniteNumber(element.fontSize, 16);
  if (element.fontFamily !== undefined) sanitized.fontFamily = toSafeString(element.fontFamily, DEFAULT_TEXT_FONT);
  if (element.fontWeight !== undefined) sanitized.fontWeight = getSafeFontWeight(element.fontWeight, DEFAULT_FONT_WEIGHT);
  if (element.textAlign !== undefined) sanitized.textAlign = getSafeTextAlign(element.textAlign, DEFAULT_TEXT_ALIGN);
  if (element.lineHeight !== undefined) sanitized.lineHeight = toFiniteNumber(element.lineHeight, DEFAULT_LINE_HEIGHT);
  if (element.textColor !== undefined) sanitized.textColor = toSafeString(element.textColor, DEFAULT_BUTTON_TEXT_COLOR);
  if (element.borderRadius !== undefined) sanitized.borderRadius = toFiniteNumber(element.borderRadius, DEFAULT_BUTTON_RADIUS);
  if (element.buttonSize !== undefined) sanitized.buttonSize = getSafeButtonSize(element.buttonSize, DEFAULT_BUTTON_SIZE);
  if (element.paddingX !== undefined) sanitized.paddingX = toFiniteNumber(element.paddingX, 16);
  if (element.paddingY !== undefined) sanitized.paddingY = toFiniteNumber(element.paddingY, 10);
  if (element.src !== undefined) sanitized.src = toSafeString(element.src);
  if (element.characterPart !== undefined) sanitized.characterPart = toSafeString(element.characterPart);
  if (element.buttonType === 'yes' || element.buttonType === 'no') sanitized.buttonType = element.buttonType;
  sanitized.elementAnimation = sanitizeElementAnimation(element.elementAnimation);

  if (safeType === 'text') {
    sanitized.fill = sanitized.fill ?? '#2f2c28';
    sanitized.fontSize = sanitized.fontSize ?? 24;
    sanitized.fontFamily = sanitized.fontFamily ?? DEFAULT_TEXT_FONT;
    sanitized.fontWeight = sanitized.fontWeight ?? DEFAULT_FONT_WEIGHT;
    sanitized.textAlign = sanitized.textAlign ?? DEFAULT_TEXT_ALIGN;
    sanitized.lineHeight = sanitized.lineHeight ?? DEFAULT_LINE_HEIGHT;
    sanitized.width = sanitized.width ?? 240;
    sanitized.height = sanitized.height ?? 48;
  }

  if (safeType === 'button') {
    sanitized.fill = sanitized.fill ?? '#22c55e';
    sanitized.text = sanitized.text ?? 'Button';
    sanitized.fontSize = sanitized.fontSize ?? 16;
    sanitized.fontFamily = sanitized.fontFamily ?? DEFAULT_TEXT_FONT;
    sanitized.fontWeight = sanitized.fontWeight ?? DEFAULT_FONT_WEIGHT;
    sanitized.textAlign = sanitized.textAlign ?? 'center';
    sanitized.lineHeight = sanitized.lineHeight ?? 1;
    sanitized.textColor = sanitized.textColor ?? DEFAULT_BUTTON_TEXT_COLOR;
    sanitized.borderRadius = sanitized.borderRadius ?? DEFAULT_BUTTON_RADIUS;
    sanitized.buttonSize = sanitized.buttonSize ?? DEFAULT_BUTTON_SIZE;
    sanitized.paddingX = sanitized.paddingX ?? 18;
    sanitized.paddingY = sanitized.paddingY ?? 10;
    sanitized.width = sanitized.width ?? 140;
    sanitized.height = sanitized.height ?? 48;
  }

  return sanitized;
};

export const buildInvitationPayload = (params: {
  id: string;
  elements: CanvasElement[];
  backgroundColor: string;
  successMessage: string;
  rejectionMessage: string;
  animationType: Invitation['animationType'];
  entranceAnimation: Invitation['entranceAnimation'];
  musicUrl: string;
  canvasSize: Invitation['canvasSize'];
  templateId?: Invitation['templateId'];
}): Invitation => {
  const safeAnimationType = ALLOWED_ANIMATIONS.includes(params.animationType) ? params.animationType : 'none';
  const safeEntranceAnimation = getSafeEntranceAnimation(
    params.entranceAnimation,
    DEFAULT_ENTRANCE_ANIMATION
  );

  return {
    id: params.id,
    title: 'My Invitation',
    elements: params.elements.map(sanitizeElement),
    backgroundColor: toSafeString(params.backgroundColor, '#ffffff'),
    successMessage: toSafeString(params.successMessage, DEFAULT_SUCCESS_MESSAGE),
    rejectionMessage: toSafeString(params.rejectionMessage, DEFAULT_REJECTION_MESSAGE),
    animationType: safeAnimationType,
    entranceAnimation: safeEntranceAnimation,
    musicUrl: toSafeString(params.musicUrl),
    canvasSize: sanitizeCanvasSize(params.canvasSize),
    templateId: params.templateId ? toSafeString(params.templateId) : undefined,
    createdAt: Date.now(),
  };
};
