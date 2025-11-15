import { Router } from 'express';
import { TransactionController } from '../controllers/transactionController';

const router = Router();
const controller = new TransactionController();

// GET /api/transactions/:userId?primaryCurrency=USD
// Returns transaction history with balances and FX conversions
router.get('/:userId', controller.getUserTransactionSummary.bind(controller));

export default router;
