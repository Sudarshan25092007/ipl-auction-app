/**
 * apps/backend/src/db/queries/history.ts
 *
 * MAJOR FUNCTION: Database queries for historical completed auctions and ledger records.
 * Provides durable, immutable historical snapshots of auctions, squads, and transaction ledgers.
 */
import { pool } from '../client';
import type { RoomStatus } from '@ipl-auction/shared';

export interface HistoricalAuctionSummary {
  id: string;
  roomCode: string;
  status: RoomStatus;
  completedAt: string;
  managerCount: number;
  myFranchise: string | null;
  myFinalPurseLakhs: number;
  mySquadCount: number;
  totalSpentLakhs: number;
  rank: number;
  topBuy?: {
    playerName: string;
    priceLakhs: number;
    franchise: string;
  };
}

export interface HistoricalSquadPlayer {
  playerId: string;
  playerName: string;
  category: string;
  role: string;
  nationality: string;
  isMarquee: boolean;
  isCapped: boolean;
  basePriceLakhs: number;
  pricePaidLakhs: number;
  acquiredAt: string;
}

export interface HistoricalTeamRecord {
  franchise: string;
  managerUsername: string;
  walletRemainingLakhs: number;
  totalSpentLakhs: number;
  squadCount: number;
  squad: HistoricalSquadPlayer[];
}

export interface HistoricalAuctionDetail {
  id: string;
  roomCode: string;
  status: RoomStatus;
  hostUsername: string;
  createdAt: string;
  completedAt: string;
  teams: HistoricalTeamRecord[];
  topBuys: Array<{
    playerName: string;
    role: string;
    pricePaidLakhs: number;
    franchise: string;
  }>;
}

/**
 * Get list of completed / historical auctions for a user.
 */
export async function getHistoricalAuctions(
  userId: string
): Promise<HistoricalAuctionSummary[]> {
  const result = await pool.query<{
    id: string;
    room_code: string;
    status: RoomStatus;
    completed_at: Date;
    manager_count: string;
    my_franchise: string | null;
    my_wallet: number | null;
    my_squad_count: string;
    my_total_spent: string;
  }>(
    `SELECT 
       r.id,
       r.invite_code AS room_code,
       r.status,
       r.updated_at AS completed_at,
       (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS manager_count,
       rm.franchise AS my_franchise,
       rm.wallet_remaining_lakhs AS my_wallet,
       COALESCE((
         SELECT COUNT(*) FROM squad_players sp WHERE sp.room_member_id = rm.id
       ), 0) AS my_squad_count,
       COALESCE((
         SELECT SUM(price_paid_lakhs) FROM squad_players sp WHERE sp.room_member_id = rm.id
       ), 0) AS my_total_spent
     FROM rooms r
     LEFT JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $1
     WHERE r.status IN ('completed', 'terminated')
       AND (rm.user_id = $1 OR r.host_user_id = $1)
     ORDER BY r.updated_at DESC
     LIMIT 50`,
    [userId]
  );

  return result.rows.map((row, index) => ({
    id: row.id,
    roomCode: row.room_code,
    status: row.status,
    completedAt: row.completed_at.toISOString(),
    managerCount: parseInt(row.manager_count, 10) || 1,
    myFranchise: row.my_franchise,
    myFinalPurseLakhs: row.my_wallet ?? 12000,
    mySquadCount: parseInt(row.my_squad_count, 10) || 0,
    totalSpentLakhs: parseInt(row.my_total_spent, 10) || 0,
    rank: index + 1,
  }));
}

/**
 * Get full historical ledger detail for a completed auction.
 */
export async function getHistoricalAuctionDetail(
  roomIdOrCode: string,
  userId: string
): Promise<HistoricalAuctionDetail | null> {
  // 1. Get room
  const roomRes = await pool.query<{
    id: string;
    invite_code: string;
    status: RoomStatus;
    host_user_id: string;
    created_at: Date;
    updated_at: Date;
    host_username: string;
  }>(
    `SELECT r.*, u.username AS host_username
     FROM rooms r
     JOIN users u ON u.id = r.host_user_id
     WHERE (r.id::text = $1 OR r.invite_code = UPPER($1))
       AND r.status IN ('completed', 'terminated')
     LIMIT 1`,
    [roomIdOrCode]
  );

  if (!roomRes.rows[0]) {
    return null;
  }

  const room = roomRes.rows[0];

  // 2. Get members & squad players
  const membersRes = await pool.query<{
    id: string;
    user_id: string;
    username: string;
    franchise: string | null;
    wallet_remaining_lakhs: number;
  }>(
    `SELECT rm.id, rm.user_id, u.username, rm.franchise, rm.wallet_remaining_lakhs
     FROM room_members rm
     JOIN users u ON u.id = rm.user_id
     WHERE rm.room_id = $1
     ORDER BY rm.joined_at ASC`,
    [room.id]
  );

  const squadRes = await pool.query<{
    room_member_id: string;
    player_id: string;
    player_name: string;
    category: string;
    role: string;
    nationality: string;
    is_marquee: boolean;
    is_capped: boolean;
    base_price_lakhs: number;
    price_paid_lakhs: number;
    acquired_at: Date;
  }>(
    `SELECT sp.room_member_id, sp.price_paid_lakhs, sp.acquired_at,
            p.id AS player_id, p.name AS player_name, p.category, p.role,
            p.nationality, p.is_marquee, p.is_capped, p.base_price_lakhs
     FROM squad_players sp
     JOIN room_members rm ON sp.room_member_id = rm.id
     JOIN players p ON sp.player_id = p.id
     WHERE rm.room_id = $1
     ORDER BY sp.acquired_at ASC`,
    [room.id]
  );

  // Group squad by member id
  const squadsByMemberId = new Map<string, HistoricalSquadPlayer[]>();
  for (const s of squadRes.rows) {
    if (!squadsByMemberId.has(s.room_member_id)) {
      squadsByMemberId.set(s.room_member_id, []);
    }
    squadsByMemberId.get(s.room_member_id)!.push({
      playerId: s.player_id,
      playerName: s.player_name,
      category: s.category,
      role: s.role,
      nationality: s.nationality,
      isMarquee: s.is_marquee,
      isCapped: s.is_capped,
      basePriceLakhs: s.base_price_lakhs,
      pricePaidLakhs: s.price_paid_lakhs,
      acquiredAt: s.acquired_at.toISOString(),
    });
  }

  const teams: HistoricalTeamRecord[] = membersRes.rows
    .filter((m) => Boolean(m.franchise))
    .map((m) => {
      const squad = squadsByMemberId.get(m.id) || [];
      const totalSpentLakhs = squad.reduce((sum, p) => sum + p.pricePaidLakhs, 0);
      return {
        franchise: m.franchise!,
        managerUsername: m.username,
        walletRemainingLakhs: m.wallet_remaining_lakhs,
        totalSpentLakhs,
        squadCount: squad.length,
        squad,
      };
    });

  // Top buys across the entire auction
  const topBuys = [...squadRes.rows]
    .sort((a, b) => b.price_paid_lakhs - a.price_paid_lakhs)
    .slice(0, 5)
    .map((s) => {
      const member = membersRes.rows.find((m) => m.id === s.room_member_id);
      return {
        playerName: s.player_name,
        role: s.role,
        pricePaidLakhs: s.price_paid_lakhs,
        franchise: member?.franchise || 'Unknown',
      };
    });

  return {
    id: room.id,
    roomCode: room.invite_code,
    status: room.status,
    hostUsername: room.host_username,
    createdAt: room.created_at.toISOString(),
    completedAt: room.updated_at.toISOString(),
    teams,
    topBuys,
  };
}
