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
        is_marquee: row.is_marquee,
        is_capped: row.is_capped,
        base_price_lakhs: Number(row.base_price_lakhs),
      })),
      count: result.rows.length,
    });
  } catch (err: any) {
    console.error('[Players] Error fetching players:', err);
    res.status(500).json({ error: 'Failed to fetch players.' });
  }
});
