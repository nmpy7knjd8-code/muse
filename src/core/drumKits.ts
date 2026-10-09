// Selectable drum kit sound characters — independent of groove patterns (mix & match).

export type DrumKitId = 'acoustic' | 'electronic' | 'fusion';

export interface DrumKitMeta {
  id: DrumKitId;
  name: string;
  /** One-line feel for the Drums UI. */
  blurb: string;
  tags: string[];
}

export const DEFAULT_DRUM_KIT: DrumKitId = 'acoustic';

export const DRUM_KITS: DrumKitMeta[] = [
  {
    id: 'acoustic',
    name: 'Acoustic',
    blurb: 'Warm kit body — taiko kick weight, roomy cymbals, natural tom ring.',
    tags: ['acoustic', 'warm', 'live'],
  },
  {
    id: 'electronic',
    name: 'Electronic',
    blurb: 'Tight click kicks, short snares, bright hats — club / broken-beat colour.',
    tags: ['electronic', 'tight', 'club'],
  },
  {
    id: 'fusion',
    name: 'Fusion',
    blurb: 'Longer ride wash, warmer toms, soft kick click — jazz-fusion / weird pocket.',
    tags: ['fusion', 'ride', 'warm'],
  },
];

export function drumKitById(id: string): DrumKitMeta | undefined {
  return DRUM_KITS.find((k) => k.id === id);
}

export function isDrumKitId(id: string): id is DrumKitId {
  return DRUM_KITS.some((k) => k.id === id);
}
