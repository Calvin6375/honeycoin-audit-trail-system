import { query } from '../db';
import { Transaction, TransactionWithRate } from '../models/transaction';

export class TransactionRepository {
    async getUserTransactionsWithRates(userId: number): Promise<TransactionWithRate[]> {
        // NOTE: The physical `transactions` table in the database uses a different
        // column naming scheme (transactionId, transactionType, senderAmount, etc.).
        // We alias those columns to the logical names expected by the rest of the
        // codebase (id, user_id, type, amount, currency_code, created_at, ...).
        const sql = `
            SELECT
                t.transactionId AS id,
                t.userId AS user_id,
                t.transactionType AS type,
                t.senderAmount AS amount,
                t.senderCurrency AS currency_code,
                NULL AS source_transaction_id,
                NULL AS metadata,
                t.fullTimestamp AS created_at,
                cr.rate AS rate_to_primary
            FROM transactions t
            LEFT JOIN currency_rates cr ON cr.currency_code = t.senderCurrency
            WHERE t.userId = ?
            ORDER BY t.fullTimestamp ASC, t.transactionId ASC
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
                t.transactionId AS id,
                t.userId AS user_id,
                t.transactionType AS type,
                t.senderAmount AS amount,
                t.senderCurrency AS currency_code,
                NULL AS source_transaction_id,
                NULL AS metadata,
                t.fullTimestamp AS created_at
            FROM transactions t
            WHERE t.transactionId = ?
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
