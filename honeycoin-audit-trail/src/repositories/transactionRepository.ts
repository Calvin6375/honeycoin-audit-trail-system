import { query } from '../db';
import { Transaction, TransactionWithRate } from '../models/transaction';

export class TransactionRepository {
    async getUserTransactionsWithRates(userId: number): Promise<TransactionWithRate[]> {
        const sql = `
            SELECT
                t.id,
                t.user_id,
                t.type,
                t.amount,
                t.currency_code,
                t.source_transaction_id,
                t.metadata,
                t.created_at,
                cr.rate AS rate_to_primary
            FROM transactions t
            LEFT JOIN currency_rates cr ON cr.currency_code = t.currency_code
            WHERE t.user_id = ?
            ORDER BY t.created_at ASC, t.id ASC
        `;

        const { rows } = await query(sql, [userId]);

        return (rows as any[]).map((row) => ({
            id: row.id,
            userId: row.user_id,
            type: row.type,
            amount: Number(row.amount),
            currencyCode: row.currency_code,
            sourceTransactionId: row.source_transaction_id ?? null,
            metadata: row.metadata ?? null,
            createdAt: new Date(row.created_at),
            rateToPrimary: row.rate_to_primary != null ? Number(row.rate_to_primary) : null,
        }));
    }

    async getTransactionById(id: number): Promise<Transaction | null> {
        const sql = `
            SELECT
                t.id,
                t.user_id,
                t.type,
                t.amount,
                t.currency_code,
                t.source_transaction_id,
                t.metadata,
                t.created_at
            FROM transactions t
            WHERE t.id = ?
            LIMIT 1
        `;

        const { rows } = await query(sql, [id]);
        const row = (rows as any[])[0];
        if (!row) return null;

        return {
            id: row.id,
            userId: row.user_id,
            type: row.type,
            amount: Number(row.amount),
            currencyCode: row.currency_code,
            sourceTransactionId: row.source_transaction_id ?? null,
            metadata: row.metadata ?? null,
            createdAt: new Date(row.created_at),
        };
    }
}
