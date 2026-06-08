/**
 * apps/backend/src/db/queries/players.ts
 *
 * MAJOR FUNCTION: Repository for the `players` table.
 * Players are read-only during an auction — no INSERT/UPDATE here.
 * Seeded once via packages/database/seeds/seedPlayers.ts (Phase 6).
 *
 * CACHING STRATEGY:
 *   getAllPlayers() is called once per auction (at queue initialization).
 *   The result is cached in Redis as the full serialized queue.
 *   Subsequent reads during an auction use the Redis cache — not this DB function.
 *   This function is the DB fallback if Redis is cold or evicted.
 */
import { pool } from '../client';
import type { Player } from '@ipl-auction/shared';

// DB row type — snake_case to match PostgreSQL convention
interface PlayerRow {
  id: string;
  name: string;
  category: string;
  role: string;
  nationality: string;
  is_marquee: boolean;
  is_capped: boolean;
  base_price_lakhs: number;
}

/** Map DB row (snake_case) to shared Player interface (camelCase) */
function rowToPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    role: row.role as Player['role'],
    nationality: row.nationality as Player['nationality'],
    isMarquee: row.is_marquee,
    isCapped: row.is_capped,
    basePriceLakhs: row.base_price_lakhs,
  };
}

/**
 * Fetch all players, split by marquee status.
 * Called once per auction by queueManager.initializeQueue().
 * Returns two arrays for sequential Fisher-Yates shuffle.
 */
export async function getAllPlayers(): Promise<{ marquee: Player[]; general: Player[] }> {
  const result = await pool.query<PlayerRow>(
    `SELECT id, name, category, role, nationality, is_marquee, is_capped, base_price_lakhs
     FROM players
     ORDER BY is_marquee DESC, name ASC`
  );

  const marquee: Player[] = [];
  const general: Player[] = [];

  for (const row of result.rows) {
    const player = rowToPlayer(row);
    if (player.isMarquee) {
      marquee.push(player);
    } else {
      general.push(player);
    }
  }

  return { marquee, general };
}

/**
 * Fetch a single player by UUID.
 * Used by auctionHandler to validate the bid is for the CURRENT player on the block.
 */
export async function getPlayerById(playerId: string): Promise<Player | null> {
  const result = await pool.query<PlayerRow>(
    `SELECT id, name, category, role, nationality, is_marquee, is_capped, base_price_lakhs
     FROM players WHERE id = $1`,
    [playerId]
  );
  return result.rows[0] ? rowToPlayer(result.rows[0]) : null;
}
