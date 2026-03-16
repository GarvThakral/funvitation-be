import { nanoid } from 'nanoid';
import type { CanvasElement, Invitation } from '../types';

const ALLOWED_ELEMENT_TYPES: CanvasElement['type'][] = ['text', 'image', 'shape', 'character', 'button'];
const ALLOWED_ANIMATIONS: Array<Invitation['animationType']> = ['confetti', 'holi', 'none'];

const toFiniteNumber = (value: unknown, fallback: number) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const coerced = Number(value);
  return Number.isFinite(coerced) ? coerced : fallback;
};

const toSafeString = (value: unknown, fallback = '') => {
  return typeof value === 'string' ? value : fallback;
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
  if (element.fontFamily !== undefined) sanitized.fontFamily = toSafeString(element.fontFamily);
  if (element.src !== undefined) sanitized.src = toSafeString(element.src);
  if (element.characterPart !== undefined) sanitized.characterPart = toSafeString(element.characterPart);
  if (element.buttonType === 'yes' || element.buttonType === 'no') sanitized.buttonType = element.buttonType;

  return sanitized;
};

export const buildInvitationPayload = (params: {
  id: string;
  elements: CanvasElement[];
  backgroundColor: string;
  successMessage: string;
  animationType: Invitation['animationType'];
  musicUrl: string;
}): Invitation => {
  const safeAnimationType = ALLOWED_ANIMATIONS.includes(params.animationType) ? params.animationType : 'none';

  return {
    id: params.id,
    title: 'My Invitation',
    elements: params.elements.map(sanitizeElement),
    backgroundColor: toSafeString(params.backgroundColor, '#ffffff'),
    successMessage: toSafeString(params.successMessage, 'Yay! I love you! ❤️'),
    animationType: safeAnimationType,
    musicUrl: toSafeString(params.musicUrl),
    createdAt: Date.now(),
  };
};
