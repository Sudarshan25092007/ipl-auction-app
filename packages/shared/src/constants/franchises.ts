/**
 * franchises.ts
 *
 * MAJOR FUNCTION: Runtime data for all 10 IPL franchises.
 * This is the complement to the FranchiseName union type in room.types.ts.
 *
 * FranchiseName union  = compile-time constraint (TypeScript rejects invalid names)
 * FRANCHISES array     = runtime data (iterate for UI rendering, lookups, etc.)
 *
 * FRANCHISE_MAP provides O(1) lookup by name. Without it, finding a franchise's
 * color requires .find() on every render — O(n). With the Map, it's O(1).
 * This matters in the BidHistoryFeed which renders on every bid tick.
 */

import type { FranchiseName } from '../types/room.types';

export interface FranchiseMeta {
  readonly name: FranchiseName;
  readonly abbreviation: string;
  readonly primaryColor: string;    // Hex code for UI theming
  readonly secondaryColor: string;  // Accent color
}

/**
 * `as const` ensures this array is typed as a readonly tuple of
 * literal objects — not a mutable FranchiseMeta[].
 * This prevents any code from accidentally mutating franchise data.
 */
export const FRANCHISES: readonly FranchiseMeta[] = [
  { name: 'Mumbai Indians',              abbreviation: 'MI',   primaryColor: '#005DA0', secondaryColor: '#D4AF37' },
  { name: 'Chennai Super Kings',         abbreviation: 'CSK',  primaryColor: '#FFFF00', secondaryColor: '#0081E9' },
  { name: 'Royal Challengers Bengaluru', abbreviation: 'RCB',  primaryColor: '#EC1C24', secondaryColor: '#000000' },
  { name: 'Kolkata Knight Riders',       abbreviation: 'KKR',  primaryColor: '#3A225D', secondaryColor: '#B3A123' },
  { name: 'Sunrisers Hyderabad',         abbreviation: 'SRH',  primaryColor: '#F7A721', secondaryColor: '#E8461B' },
  { name: 'Delhi Capitals',              abbreviation: 'DC',   primaryColor: '#0078BC', secondaryColor: '#EF1C25' },
  { name: 'Rajasthan Royals',            abbreviation: 'RR',   primaryColor: '#EA1A85', secondaryColor: '#254AA5' },
  { name: 'Punjab Kings',               abbreviation: 'PBKS', primaryColor: '#ED1B24', secondaryColor: '#A7A9AC' },
  { name: 'Lucknow Super Giants',        abbreviation: 'LSG',  primaryColor: '#A0E6FF', secondaryColor: '#0057A8' },
  { name: 'Gujarat Titans',             abbreviation: 'GT',   primaryColor: '#1C1C1C', secondaryColor: '#AEC6CF' },
] as const;

/**
 * O(1) lookup map: FranchiseName → FranchiseMeta
 *
 * Built once at module load time. Used anywhere we need franchise
 * colors/abbreviations without iterating the array.
 *
 * Usage: FRANCHISE_MAP['Mumbai Indians'].primaryColor → '#005DA0'
 */
export const FRANCHISE_MAP: Readonly<Record<FranchiseName, FranchiseMeta>> =
  Object.fromEntries(
    FRANCHISES.map(f => [f.name, f])
  ) as Record<FranchiseName, FranchiseMeta>;
