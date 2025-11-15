export type TransactionType =
    | 'DEPOSIT'
    | 'WITHDRAWAL'
    | 'TRANSFER_IN'
    | 'TRANSFER_OUT'
    | 'ADJUSTMENT'
    | 'FEE';

export interface Transaction {
    id: number;
    userId: number;
    type: TransactionType | string;
    amount: number; // absolute amount in transaction currency
    currencyCode: string;
    sourceTransactionId?: number | null;
    metadata?: string | null;
    createdAt: Date;
}

export interface TransactionWithRate extends Transaction {
    rateToPrimary: number | null; // null when no FX rate is defined (or currency is primary with implicit 1.0)
}

export interface TransactionWithBalances extends TransactionWithRate {
    signedAmount: number;
    amountInPrimary: number;
    balanceAfterCurrency: number;
    balanceAfterPrimary: number;
    isFundSourceValid?: boolean;
}

export interface BalanceByCurrency {
    currency: string;
    balance: number;
    balanceInPrimary: number;
}

export interface TransactionSummary {
    userId: number;
    primaryCurrency: string;
    finalBalancePrimary: number;
    balancesByCurrency: BalanceByCurrency[];
    transactions: TransactionWithBalances[];
}
