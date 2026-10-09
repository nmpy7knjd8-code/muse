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
    blurb: 'Real FluidR3 kit one-shots — acoustic kick, snare, hats, toms, crash & ride.',
    tags: ['acoustic', 'sampled', 'live'],
  },
  {
    id: 'electronic',
    name: 'Electronic',
    blurb: 'Synthesised tight kicks, short snares, bright hats — club / broken-beat colour.',
    tags: ['electronic', 'tight', 'synth'],
  },
  {
    id: 'fusion',
    name: 'Fusion',
    blurb: 'Same real kit with longer cymbal wash and soft steel colour on melodic toms.',
    tags: ['fusion', 'sampled', 'ride'],
  },
];

export function drumKitById(id: string): DrumKitMeta | undefined {
  return DRUM_KITS.find((k) => k.id === id);
}

export function isDrumKitId(id: string): id is DrumKitId {
  return DRUM_KITS.some((k) => k.id === id);
}
