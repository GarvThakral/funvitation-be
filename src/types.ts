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
  rotation?: number;
  src?: string;
  characterPart?: string;
  buttonType?: 'yes' | 'no';
}

export interface Invitation {
  id: string;
  title: string;
  elements: CanvasElement[];
  backgroundColor: string;
  successMessage?: string;
  successImage?: string;
  animationType?: 'confetti' | 'holi' | 'none';
  musicUrl?: string;
  createdAt: number;
}
