/**
 * player.types.ts
 *
 * MAJOR FUNCTION: Defines the immutable Player entity — the atomic unit of the auction.
 * Every bid, squad entry, socket payload, and DB row is ultimately anchored to this shape.
 *
 * DESIGN DECISION — basePriceLakhs as integer:
 *   Floating-point math is non-deterministic: 0.1 + 0.2 === 0.30000000000000004 in JS.
 *   By storing prices as integers in LAKHS (₹1 Lakh = ₹100,000), all bid arithmetic
 *   is pure integer math. No drift, no rounding errors.
 *   This mirrors Stripe's "store in cents, display in dollars" pattern.
 *   ₹1.5 Cr → 150 lakhs. ₹20 Cr → 2000 lakhs.
 *
 * DESIGN DECISION — readonly fields:
 *   Player data is fetched from the DB and never mutated in memory.
 *   `readonly` enforces this at compile time — any service attempting
 *   `player.name = "X"` will fail to compile. Catches bugs before runtime.
 */

/**
 * All valid player roles in the squad.
 *
 * String-literal union (not `enum`):
 *   - Compiles to ZERO runtime JavaScript
 *   - No reverse-mapping confusion (TypeScript enum quirk)
 *   - Values are plain strings — no special deserialization needed from JSON
 */
export type PlayerRole =
  | 'batter'
  | 'pacer'
  | 'spinner'
  | 'allrounder'
  | 'wk'; // wicket-keeper

/**
 * Maps to the `nationality` ENUM column in the `players` DB table.
 * Used by bidValidator to enforce the 8-overseas-player per squad rule.
 */
export type PlayerNationality = 'indian' | 'overseas';

/**
 * Category string from the seeding Excel sheet (e.g., "Premium Indian Batter").
 * Wide `string` type — there are ~25 categories and they vary by tournament year.
 * The meaningful fields (role, nationality, isMarquee) are derived from this
 * string during the seed script parsing and stored as typed columns.
 */
export type PlayerCategory = string;

/**
 * The canonical Player entity. 1:1 with a row in the `players` DB table.
 *
 * All fields are `readonly` — once fetched from DB, a player is immutable.
 * No service should ever mutate player data in memory.
 */
export interface Player {
  readonly id: string;                   // UUID — Primary Key in players table
  readonly name: string;
  readonly category: PlayerCategory;     // Raw category string for display
  readonly role: PlayerRole;             // Parsed role for squad composition logic
  readonly nationality: PlayerNationality;
  readonly isMarquee: boolean;           // true = Premium Draft round player
  readonly isCapped: boolean;            // false = uncapped Indian (different salary rules)
  readonly basePriceLakhs: number;       // Integer. 200 = ₹2 Cr minimum bid.
}
