// Display labels shared by several screens.
import type { Grip, PainLocation, SessionType } from './domain/types';

export const GRIPS: { value: Grip; label: string }[] = [
  { value: 'half_crimp', label: 'Half crimp' },
  { value: 'open_hand', label: 'Open hand' },
];

export const gripLabel = (g: Grip) => GRIPS.find((x) => x.value === g)?.label ?? g;

/** "+5 kg", "0 kg", "−10 kg" (negative = assistance) */
export const kg = (v: number) => (v > 0 ? `+${v} kg` : v < 0 ? `−${-v} kg` : '0 kg');

export const typeLabel = (t: SessionType) => (t === 'full' ? 'Full' : 'Light');

export const PAIN_LABELS: Record<PainLocation, string> = {
  finger_joint: 'Finger joint',
  pulley: 'Pulley',
  forearm: 'Forearm',
  elbow: 'Elbow',
  shoulder: 'Shoulder',
  none: 'None',
};
