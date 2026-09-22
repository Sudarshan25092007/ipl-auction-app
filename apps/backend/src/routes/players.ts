import { Router, type Router as ExpressRouter } from 'express';
import { pool } from '../db/client';

export const playersRouter: ExpressRouter = Router();

playersRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, category, role, nationality, is_marquee, is_capped, base_price_lakhs 
       FROM players 
       ORDER BY category, name`
    );

    res.json({
      players: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        role: row.role,
        nationality: row.nationality,
        isMarquee: Boolean(row.is_marquee),
        isCapped: Boolean(row.is_capped),
        basePriceLakhs: Number(row.base_price_lakhs) || 0,
        is_marquee: Boolean(row.is_marquee),
        is_capped: Boolean(row.is_capped),
        base_price_lakhs: Number(row.base_price_lakhs) || 0,
      })),
      count: result.rows.length,
    });
  } catch (err: any) {
    console.error('[Players] Error fetching players:', err);
    res.status(500).json({ error: 'Failed to fetch players.' });
  }
});
