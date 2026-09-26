/**
 * apps/backend/src/routes/history.ts
 *
 * MAJOR FUNCTION: REST endpoints for the Historical Ledger (/history).
 * Provides access to past completed auctions, squad rosters, and purchase details.
 */
import { Router, type Router as ExpressRouter } from 'express';
import { jwtAuth } from '../middleware/auth';
import {
  getHistoricalAuctions,
  getHistoricalAuctionDetail,
} from '../db/queries/history';

export const historyRouter: ExpressRouter = Router();

// All history routes require authentication
historyRouter.use(jwtAuth);

/**
 * GET /history — List all previous completed/terminated auctions.
 */
historyRouter.get('/', async (req, res) => {
  try {
    const userId = req.user!.sub;
    const history = await getHistoricalAuctions(userId);
    res.json({ history });
  } catch (err) {
    console.error('[History] Failed to get auction history:', err);
    res.status(500).json({ error: 'Failed to load auction history.' });
  }
});

/**
 * GET /history/:idOrCode — Get full ledger breakdown for a specific completed auction.
 */
historyRouter.get('/:idOrCode', async (req, res) => {
  try {
    const userId = req.user!.sub;
    const { idOrCode } = req.params;
    const detail = await getHistoricalAuctionDetail(idOrCode, userId);

    if (!detail) {
      res.status(404).json({ error: 'Historical auction record not found.' });
      return;
    }

    res.json({ detail });
  } catch (err) {
    console.error('[History] Failed to get auction detail:', err);
    res.status(500).json({ error: 'Failed to load auction detail.' });
  }
});
