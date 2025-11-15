import { TransactionRepository } from '../repositories/transactionRepository';
import {
    TransactionSummary,
    TransactionWithBalances,
    TransactionWithRate,
    BalanceByCurrency,
} from '../models/transaction';

const PRIMARY_CURRENCY = process.env.PRIMARY_CURRENCY || 'USD';

const isCreditType = (type: string): boolean => {
    const upper = type.toUpperCase();
    return upper === 'DEPOSIT' || upper === 'TRANSFER_IN' || upper === 'REFUND';
};

const isDebitType = (type: string): boolean => {
    const upper = type.toUpperCase();
    return (
        upper === 'WITHDRAWAL' ||
        upper === 'TRANSFER_OUT' ||
        upper === 'PAYMENT' ||
        upper === 'FEE'
    );
};

const toSignedAmount = (tx: TransactionWithRate): number => {
    if (isCreditType(tx.type)) return Math.abs(tx.amount);
    if (isDebitType(tx.type)) return -Math.abs(tx.amount);
    // Default to credit if type is unknown
    return Math.abs(tx.amount);
};

export class TransactionService {
    private readonly repo: TransactionRepository;

    constructor(repo?: TransactionRepository) {
        this.repo = repo ?? new TransactionRepository();
    }

    public async getUserTransactionSummary(
        userId: number,
        primaryCurrency: string = PRIMARY_CURRENCY
    ): Promise<TransactionSummary> {
        const txs = await this.repo.getUserTransactionsWithRates(userId);

        // Pre-compute balances per-currency and in primary currency
        let runningPrimary = 0;
        const runningByCurrency = new Map<string, number>();

        const withBalances: TransactionWithBalances[] = txs.map((tx) => {
            const signedAmount = toSignedAmount(tx);

            const rateToUse =
                tx.currencyCode.toUpperCase() === primaryCurrency.toUpperCase()
                    ? 1
                    : tx.rateToPrimary ?? 0;

            const amountInPrimary = signedAmount * rateToUse;

            const currentCurrencyBalance = runningByCurrency.get(tx.currencyCode) ?? 0;
            const newCurrencyBalance = currentCurrencyBalance + signedAmount;
            runningByCurrency.set(tx.currencyCode, newCurrencyBalance);

            runningPrimary += amountInPrimary;

            return {
                ...tx,
                signedAmount,
                amountInPrimary,
                balanceAfterCurrency: newCurrencyBalance,
                balanceAfterPrimary: runningPrimary,
            };
        });

        // Fund source validation: a transaction that references a source_transaction_id
        // is considered valid if that source transaction appears in the same user's
        // transaction history. This is a simple, deterministic fund-source audit.
        const txById = new Map<number, TransactionWithBalances>();
        for (const tx of withBalances) {
            txById.set(tx.id, tx);
        }
        for (const tx of withBalances) {
            if (tx.sourceTransactionId != null) {
                const source = txById.get(tx.sourceTransactionId);
                tx.isFundSourceValid = !!source && source.userId === tx.userId;
            }
        }

        const balancesByCurrency: BalanceByCurrency[] = [];
        for (const [currency, balance] of runningByCurrency.entries()) {
            const sampleTx = txs.find((t) => t.currencyCode === currency);
            const rateToPrimary =
                currency.toUpperCase() === primaryCurrency.toUpperCase()
                    ? 1
                    : sampleTx?.rateToPrimary ?? 0;

            balancesByCurrency.push({
                currency,
                balance,
                balanceInPrimary: balance * rateToPrimary,
            });
        }

        const summary: TransactionSummary = {
            userId,
            primaryCurrency,
            finalBalancePrimary: runningPrimary,
            balancesByCurrency,
            transactions: withBalances,
        };

        return summary;
    }
}
