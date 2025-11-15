CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Financial transactions table with multi-currency support and fund source tracing
CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    -- Type of transaction, e.g. DEPOSIT, WITHDRAWAL, TRANSFER_IN, TRANSFER_OUT
    type VARCHAR(30) NOT NULL,
    -- Signed amount in the transaction currency (always positive, direction inferred from type)
    amount DECIMAL(18, 2) NOT NULL,
    -- ISO 4217 currency code, e.g. USD, NGN, KES
    currency_code VARCHAR(3) NOT NULL,
    -- Optional link to a source transaction (for transfers or top-ups from another ledger)
    source_transaction_id INT NULL,
    -- Optional free-form details (JSON as text for broad MySQL compatibility)
    metadata TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (source_transaction_id) REFERENCES transactions(id)
);

-- Exchange rates relative to a primary currency (e.g. 1 unit of currency_code = rate * PRIMARY)
CREATE TABLE currency_rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    currency_code VARCHAR(3) NOT NULL UNIQUE,
    rate DECIMAL(18, 8) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
