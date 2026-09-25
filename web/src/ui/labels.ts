import type { Breakdown, HeldBack } from '../scoring';

/**
 * What each score dimension is called on screen. One list, because the town
 * panel, the table and the near-miss chips all name the same things, and three
 * copies had already drifted: the panel showed "affinity" in raw camelCase
 * because its own copy never learned that dimension existed.
 */
export const DIM_LABEL: Record<keyof Breakdown, string> = {
  summerFit: 'Right kind of summer',
  affordability: 'Value',
  airport: 'Airports',
  city: 'City access',
  amenities: 'Services',
  mountains: 'Mountains',
  coast: 'Coast',
  winterMild: 'Mild winter',
  drier: 'Dryness',
  sunny: 'Sunshine',
  cleanAir: 'Clean air',
  internet: 'Broadband',
  livingCost: 'Living cost',
  energyBill: 'Energy bill',
  affinity: 'Like my picks',
  nature: 'Protected nature',
  ski: 'Ski slopes',
  pets: 'Good for a dog',
  safety: 'Safety',
};

/** One reason a near miss is held back, as a short phrase with its numbers. */
export function heldLabel(h: HeldBack): string {
  if (h.failure) {
    const f = h.failure;
    return f.value ? `${f.value} (limit ${f.limit})` : f.reason;
  }
  return `weak ${DIM_LABEL[h.dim!]?.toLowerCase() ?? h.dim} (${Math.round((h.value ?? 0) * 100)}/100)`;
}
