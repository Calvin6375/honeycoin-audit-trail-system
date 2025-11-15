import { Request, Response } from 'express';
import { TransactionService } from '../services/transactionService';

export class TransactionController {
    private readonly service: TransactionService;

    constructor(service?: TransactionService) {
        this.service = service ?? new TransactionService();
    }

    public async getUserTransactionSummary(req: Request, res: Response): Promise<void> {
        const userIdParam = req.params.userId;
        const primaryCurrency = (req.query.primaryCurrency as string) || undefined;

        const userId = Number(userIdParam);
        if (!Number.isFinite(userId)) {
            res.status(400).json({ message: 'Invalid userId. Must be a number.' });
            return;
        }

        try {
            const summary = await this.service.getUserTransactionSummary(userId, primaryCurrency);
            res.status(200).json(summary);
        } catch (error) {
            console.error('Error retrieving transaction summary:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
}
