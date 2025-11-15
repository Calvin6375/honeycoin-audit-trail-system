# Audit Trail System – Local Test Environment Script

This `script.md` is a **full, end-to-end, production-style guide** for running and testing a financial audit trail system locally.

It assumes no prior context beyond Docker, Node.js, and a basic MySQL client. If  followed this document from top to bottom, they can:

- Boot a MySQL + Adminer stack with pre-loaded mock data
- Stand up an ExpressJS API that exposes audit endpoints
- Run audit SQL queries (including recursive CTEs) directly
- Execute test cases that exercise deposits, withdrawals, transfers, multi-currency flows, and fund-origin tracing

---

## 1. Project Overview

This project is a **financial audit trail demo** designed to showcase:

- Tracking of **deposits**, **withdrawals**, **transfers**, and **multi-currency flows**
- An opinionated schema for **auditable transaction history**
- A set of **SQL queries** (including recursive CTEs) that:
  - Fetch all successful transactions for a user
  - Calculate final balances normalized into a user’s base currency
  - Trace **fund origin chains** for transfers
  - Recursively trace where a sender obtained their funds

The core idea is that:

- Every movement of value is a **transaction** row.
- Transfers are modeled as **paired transactions** (`TRANSFER_OUT` from the sender, `TRANSFER_IN` for the receiver) linked via `related_transaction_id`.
- Each transaction stores **currency**, **amount**, and an **exchange rate to the user’s base currency** at the time of posting.
- Recursive CTE queries allow you to walk back through transaction relationships and user links to understand **where funds came from**, hop by hop.

This repository and README are structured so you can **spin up everything from scratch**, even on a fresh machine.

---

## 2. System Requirements

You will need the following installed locally:

- **Docker** (tested with Docker Desktop)
- **Docker Compose** (either `docker-compose` or the `docker compose` subcommand)
- **MySQL client** (e.g., `mysql` CLI or MySQL Workbench)
- **Node.js** (LTS recommended, e.g., Node 18+)
- **Git**

Optional but recommended:

- An HTTP client such as **curl**, **Postman**, or **Insomnia**

> **Note:** The MySQL version used in this guide assumes **MySQL 8+** so that **CTE and recursive queries** are available.

---

## 3. Database Setup (SQL Schema & Commands)

You can initialize the database in two ways:

1. Automatically via **Docker** using an initialization script (preferred; see the Docker section below)
2. Manually via **MySQL client** using the commands in this section

### 3.1. Create the Database

Run this from any MySQL client connected as a user with privileges to create databases:

```sql
CREATE DATABASE IF NOT EXISTS audit_trail_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Then select the database:

```sql
USE audit_trail_system;
```

### 3.2. `users` Table Schema

```sql
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  base_currency CHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.3. `transactions` Table Schema

This schema supports:

- Different transaction **types** (deposit, withdrawal, transfer in/out)
- **Multi-currency amounts** with an exchange rate into the user’s base currency
- **Transfer linking** via `related_transaction_id` and `counterparty_user_id`

```sql
CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT') NOT NULL,
  amount DECIMAL(18, 2) NOT NULL,
  currency CHAR(3) NOT NULL,
  status ENUM('PENDING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'SUCCESS',
  -- Exchange rate from transaction currency TO the user's base currency at posting time
  exchange_rate_to_base DECIMAL(18, 8) NULL,
  -- For transfers: link the two sides (outgoing and incoming) of the same logical transfer
  related_transaction_id BIGINT UNSIGNED NULL,
  -- For transfers: which user is on the other side of this transaction
  counterparty_user_id INT UNSIGNED NULL,
  -- Optional additional metadata (e.g., JSON notes, external IDs)
  metadata JSON NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_transactions_user_id (user_id),
  KEY idx_transactions_type (type),
  KEY idx_transactions_status (status),
  KEY idx_transactions_occurred_at (occurred_at),
  KEY idx_transactions_related (related_transaction_id),
  CONSTRAINT fk_transactions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
      ON DELETE CASCADE
      ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.4. Seed Users

Example seed users (these IDs are referenced in later examples):

```sql
INSERT INTO users (name, email, base_currency) VALUES
  ('Alice', 'alice@example.com', 'USD'),   -- id = 1
  ('Bob', 'bob@example.com', 'USD'),       -- id = 2
  ('Chinedu', 'chinedu@example.com', 'NGN'), -- id = 3
  ('Maria', 'maria@example.com', 'EUR');   -- id = 4
```

### 3.5. Seed Transactions (100+ Mock Rows)

Your environment already has 100 mock transactions. For documentation purposes, this section shows the **shape** of the inserts and how transfers are modeled. The **actual full list of 100+ rows should live in an `init.sql` file** (see the Docker section) and is not repeated here.

> **Important:** The goal here is to illustrate structure and relationships. In your actual repository, ensure `db/init.sql` contains the complete 100+ `INSERT` statements so that Docker can preload them.

#### 3.5.1. Example: Deposit & Withdrawal

```sql
-- Simple USD deposit for Alice
INSERT INTO transactions (
  user_id, type, amount, currency, status, exchange_rate_to_base, occurred_at
) VALUES
  (1, 'DEPOSIT', 1000.00, 'USD', 'SUCCESS', 1.00000000, '2024-01-01 09:00:00');

-- Alice withdraws some funds
INSERT INTO transactions (
  user_id, type, amount, currency, status, exchange_rate_to_base, occurred_at
) VALUES
  (1, 'WITHDRAWAL', 200.00, 'USD', 'SUCCESS', 1.00000000, '2024-01-02 10:15:00');
```

#### 3.5.2. Example: Transfer (Maria → Alice → Bob → Chinedu)

The **chain** Maria → Alice → Bob → Chinedu is represented as linked pairs of `TRANSFER_OUT` and `TRANSFER_IN` records.

```sql
-- 1) Maria (EUR) → Alice (USD)
-- Outgoing from Maria
INSERT INTO transactions (
  user_id, type, amount, currency, status, exchange_rate_to_base,
  counterparty_user_id, occurred_at
) VALUES
  (4, 'TRANSFER_OUT', 500.00, 'EUR', 'SUCCESS', 1.05000000, 1, '2024-01-03 08:00:00');

-- Incoming to Alice (converted to USD base)
INSERT INTO transactions (
  user_id, type, amount, currency, status, exchange_rate_to_base,
  counterparty_user_id, related_transaction_id, occurred_at
) VALUES
  (1, 'TRANSFER_IN', 550.00, 'USD', 'SUCCESS', 1.00000000, 4, LAST_INSERT_ID(), '2024-01-03 08:00:05');

-- 2) Alice (USD) → Bob (USD)
INSERT INTO transactions (
  user_id, type, amount, currency, status, exchange_rate_to_base,
  counterparty_user_id, occurred_at
) VALUES
  (1, 'TRANSFER_OUT', 300.00, 'USD', 'SUCCESS', 1.00000000, 2, '2024-01-04 11:00:00');

INSERT INTO transactions (
  user_id, type, amount, currency, status, exchange_rate_to_base,
  counterparty_user_id, related_transaction_id, occurred_at
) VALUES
  (2, 'TRANSFER_IN', 300.00, 'USD', 'SUCCESS', 1.00000000, 1, LAST_INSERT_ID(), '2024-01-04 11:00:05');

-- 3) Bob (USD) → Chinedu (NGN)
INSERT INTO transactions (
  user_id, type, amount, currency, status, exchange_rate_to_base,
  counterparty_user_id, occurred_at
) VALUES
  (2, 'TRANSFER_OUT', 150.00, 'USD', 'SUCCESS', 1.00000000, 3, '2024-01-05 14:30:00');

INSERT INTO transactions (
  user_id, type, amount, currency, status, exchange_rate_to_base,
  counterparty_user_id, related_transaction_id, occurred_at
) VALUES
  (3, 'TRANSFER_IN', 150.00, 'USD', 'SUCCESS', 0.00160000, 2, LAST_INSERT_ID(), '2024-01-05 14:30:05');
```

#### 3.5.3. Placeholder Block for Remaining Mock Data

In your actual `init.sql`, ensure you include at least **100** total `INSERT` rows, covering:

- Multiple deposits and withdrawals per user
- Various currencies (`USD`, `EUR`, `NGN`, etc.)
- One-way transfers, circular patterns, transfers with missing FX rate, etc.

Example placeholder (do **not** run as-is; replace with real inserts in `init.sql`):

```sql
-- ... 97+ additional INSERT INTO transactions(...) VALUES (...)
-- covering random amounts, dates, currencies, and transfer chains.
```

---

## 4. Docker Compose Setup

The recommended way to run MySQL for this demo is via Docker + Docker Compose.

### 4.1. Directory Layout

From the root of the repository (where this `script.md` lives), use the following structure:

```text
.
├── docker-compose.yml
└── db
    └── init.sql
```

- `docker-compose.yml` – defines MySQL and Adminer services
- `db/init.sql` – contains the `CREATE DATABASE`, `CREATE TABLE`, and `INSERT` statements

### 4.2. Create `db/init.sql`

Create a file at `db/init.sql` and populate it with:

1. `CREATE DATABASE audit_trail_system;`
2. `USE audit_trail_system;`
3. The `users` and `transactions` **schema** from section **3.2** and **3.3**
4. The seed **users** and **100+ transactions** from section **3.4** and **3.5**

For example (skeleton – you should paste full definitions and real inserts here):

```sql
CREATE DATABASE IF NOT EXISTS audit_trail_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE audit_trail_system;

-- Users and transactions schema (copy from sections 3.2 and 3.3)
-- ...

-- Seed users (copy from section 3.4)
-- ...

-- Seed transactions (full 100+ real rows)
-- ...
```

### 4.3. Create `docker-compose.yml`

Create `docker-compose.yml` in the project root with the following content:

```yaml
version: '3.9'

services:
  mysql:
    image: mysql:8.0
    container_name: audit_trail_mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: audit_trail_system
      MYSQL_USER: app_user
      MYSQL_PASSWORD: app_password
    ports:
      - "3306:3306"
    volumes:
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    command: ["--default-authentication-plugin=mysql_native_password"]

  adminer:
    image: adminer:latest
    container_name: audit_trail_adminer
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      ADMINER_DEFAULT_SERVER: mysql

networks:
  default:
    name: audit_trail_network
```

### 4.4. Start the Database Stack

From the project root:

```bash
# Option A: docker compose (newer syntax)
docker compose up -d

# Option B: docker-compose (legacy standalone)
# docker-compose up -d
```

This will:

- Start MySQL on **port 3306**
- Run `db/init.sql` automatically on first startup
- Start **Adminer** on `http://localhost:8080` for DB inspection

You can verify MySQL is up via:

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p
# Enter: rootpassword
```

Then:

```sql
SHOW DATABASES;
USE audit_trail_system;
SHOW TABLES;
SELECT COUNT(*) FROM transactions;
```

You should see at least **100** rows in `transactions`.

---

## 5. ExpressJS API Setup

The ExpressJS API demonstrates how to expose the audit trail over HTTP.

### 5.1. Folder Structure

From the project root, create a `server` folder with this structure:

```text
server
├── package.json
├── .env.example
└── src
    ├── index.js
    ├── db.js
    └── auditService.js
```

### 5.2. `package.json`

Create `server/package.json` with the following content:

```json
{
  "name": "audit-trail-api",
  "version": "1.0.0",
  "description": "ExpressJS API for SQL-based financial audit trail demo",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "dotenv": "^16.0.0",
    "express": "^4.19.0",
    "mysql2": "^3.10.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

Then install dependencies:

```bash
cd server
npm install
```

### 5.3. `.env` Example

Create `server/.env.example`:

```dotenv
# MySQL connection
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=app_user
DB_PASSWORD=app_password
DB_NAME=audit_trail_system

# Application
PORT=3000
BASE_CURRENCY=USD
```

Copy it to `.env` and adjust if needed:

```bash
cd server
cp .env.example .env
# On Windows PowerShell, you can also use:
# copy .env.example .env
```

### 5.4. Database Connection Helper – `db.js`

Create `server/src/db.js`:

```js
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'app_user',
  password: process.env.DB_PASSWORD || 'app_password',
  database: process.env.DB_NAME || 'audit_trail_system',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = {
  pool
};
```

### 5.5. Audit Service – `auditService.js`

This file centralizes SQL queries used by the API.

Create `server/src/auditService.js`:

```js
const { pool } = require('./db');

async function getUserById(userId) {
  const [rows] = await pool.query(
    'SELECT id, name, email, base_currency AS baseCurrency, created_at AS createdAt FROM users WHERE id = ?',
    [userId]
  );
  return rows[0] || null;
}

async function getUserTransactions(userId) {
  const [rows] = await pool.query(
    `SELECT
       id,
       user_id AS userId,
       type,
       amount,
       currency,
       status,
       exchange_rate_to_base AS exchangeRateToBase,
       related_transaction_id AS relatedTransactionId,
       counterparty_user_id AS counterpartyUserId,
       metadata,
       occurred_at AS occurredAt,
       created_at AS createdAt
     FROM transactions
     WHERE user_id = ?
       AND status = 'SUCCESS'
     ORDER BY occurred_at ASC, id ASC`,
    [userId]
  );
  return rows;
}

async function getUserBalance(userId) {
  const [rows] = await pool.query(
    `SELECT
       u.id AS userId,
       u.base_currency AS baseCurrency,
       COALESCE(SUM(
         CASE t.type
           WHEN 'DEPOSIT' THEN t.amount * COALESCE(t.exchange_rate_to_base, 1)
           WHEN 'TRANSFER_IN' THEN t.amount * COALESCE(t.exchange_rate_to_base, 1)
           WHEN 'WITHDRAWAL' THEN -t.amount * COALESCE(t.exchange_rate_to_base, 1)
           WHEN 'TRANSFER_OUT' THEN -t.amount * COALESCE(t.exchange_rate_to_base, 1)
           ELSE 0
         END
       ), 0) AS balanceInBase
     FROM users u
     LEFT JOIN transactions t
       ON u.id = t.user_id
      AND t.status = 'SUCCESS'
     WHERE u.id = ?
     GROUP BY u.id, u.base_currency`,
    [userId]
  );

  return rows[0] || { userId, baseCurrency: null, balanceInBase: 0 };
}

async function getFundOriginChain(userId) {
  // This query starts from all successful incoming transfers (TRANSFER_IN) for the user
  // and walks backwards through senders (counterparty_user_id) and their deposits/transfers.
  const [rows] = await pool.query(
    `WITH RECURSIVE fund_chain AS (
       -- Level 0: direct incoming transfers to the target user
       SELECT
         t.id,
         t.user_id AS beneficiary_user_id,
         t.counterparty_user_id AS sender_user_id,
         t.type,
         t.amount,
         t.currency,
         t.status,
         t.exchange_rate_to_base,
         t.related_transaction_id,
         t.occurred_at,
         0 AS depth
       FROM transactions t
       WHERE t.user_id = ?
         AND t.type = 'TRANSFER_IN'
         AND t.status = 'SUCCESS'

       UNION ALL

       -- Level N: where did the sender get their money?
       SELECT
         t2.id,
         t2.user_id AS beneficiary_user_id,
         t2.counterparty_user_id AS sender_user_id,
         t2.type,
         t2.amount,
         t2.currency,
         t2.status,
         t2.exchange_rate_to_base,
         t2.related_transaction_id,
         t2.occurred_at,
         fc.depth + 1 AS depth
       FROM transactions t2
       INNER JOIN fund_chain fc
         ON t2.user_id = fc.sender_user_id
       WHERE t2.status = 'SUCCESS'
         AND t2.type IN ('DEPOSIT', 'TRANSFER_IN')
         AND fc.depth < 10
     )
     SELECT
       fc.*,
       bu.name AS beneficiaryName,
       su.name AS senderName
     FROM fund_chain fc
     LEFT JOIN users bu ON bu.id = fc.beneficiary_user_id
     LEFT JOIN users su ON su.id = fc.sender_user_id
     ORDER BY fc.depth ASC, fc.occurred_at ASC, fc.id ASC;`,
    [userId]
  );

  return rows;
}

module.exports = {
  getUserById,
  getUserTransactions,
  getUserBalance,
  getFundOriginChain
};
```

### 5.6. Express App – `index.js`

Create `server/src/index.js`:

```js
const express = require('express');
const dotenv = require('dotenv');
const { getUserById, getUserTransactions, getUserBalance, getFundOriginChain } = require('./auditService');

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all raw transactions for a user
app.get('/transactions/:userId', async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid userId parameter' });
  }

  try {
    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const transactions = await getUserTransactions(userId);
    res.json({ user, transactions });
  } catch (err) {
    console.error('Error in /transactions/:userId', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Audit endpoint: user info, all transactions, balance, and fund origin chain
app.get('/audit/:userId', async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid userId parameter' });
  }

  try {
    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [transactions, balance, fundOrigins] = await Promise.all([
      getUserTransactions(userId),
      getUserBalance(userId),
      getFundOriginChain(userId)
    ]);

    res.json({
      user,
      balance: {
        amountInBase: balance.balanceInBase,
        currency: balance.baseCurrency
      },
      transactions,
      fundOrigins
    });
  } catch (err) {
    console.error('Error in /audit/:userId', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Audit Trail API listening on port ${PORT}`);
});
```

---

## 6. Audit SQL Queries (Runnable Examples)

This section documents **standalone SQL queries** that you can run directly in MySQL Workbench, Adminer, or the `mysql` CLI.

Assumptions:

- `audit_trail_system` is the current database.
- The schema from section 3 is in place.

### 6.1. Fetch All Successful Transactions for a User

```sql
SELECT
  t.id,
  t.user_id AS userId,
  t.type,
  t.amount,
  t.currency,
  t.status,
  t.exchange_rate_to_base AS exchangeRateToBase,
  t.related_transaction_id AS relatedTransactionId,
  t.counterparty_user_id AS counterpartyUserId,
  t.metadata,
  t.occurred_at AS occurredAt,
  t.created_at AS createdAt
FROM transactions t
WHERE t.user_id = ?
  AND t.status = 'SUCCESS'
ORDER BY t.occurred_at ASC, t.id ASC;
```

Replace `?` with the desired `user_id` (e.g., `1`).

### 6.2. Calculate Final Balance Normalized into User’s Base Currency

This query uses the stored `exchange_rate_to_base` to convert all amounts into the user’s base currency.

```sql
SELECT
  u.id AS userId,
  u.name,
  u.base_currency AS baseCurrency,
  COALESCE(SUM(
    CASE t.type
      WHEN 'DEPOSIT' THEN t.amount * COALESCE(t.exchange_rate_to_base, 1)
      WHEN 'TRANSFER_IN' THEN t.amount * COALESCE(t.exchange_rate_to_base, 1)
      WHEN 'WITHDRAWAL' THEN -t.amount * COALESCE(t.exchange_rate_to_base, 1)
      WHEN 'TRANSFER_OUT' THEN -t.amount * COALESCE(t.exchange_rate_to_base, 1)
      ELSE 0
    END
  ), 0) AS balanceInBase
FROM users u
LEFT JOIN transactions t
  ON u.id = t.user_id
 AND t.status = 'SUCCESS'
WHERE u.id = ?
GROUP BY u.id, u.name, u.base_currency;
```

Again, replace `?` with the target `user_id`.

### 6.3. Trace the Fund Origin Chain for a Specific Transfer

This query starts from a particular **incoming transfer transaction** and walks back via `related_transaction_id` to find earlier related transactions.

```sql
WITH RECURSIVE transfer_chain AS (
  -- Start from a given incoming transfer (TRANSFER_IN)
  SELECT
    t.id,
    t.user_id AS userId,
    t.type,
    t.amount,
    t.currency,
    t.status,
    t.exchange_rate_to_base AS exchangeRateToBase,
    t.related_transaction_id AS relatedTransactionId,
    t.counterparty_user_id AS counterpartyUserId,
    t.occurred_at AS occurredAt,
    0 AS depth
  FROM transactions t
  WHERE t.id = ?
    AND t.type = 'TRANSFER_IN'

  UNION ALL

  -- Follow the chain backwards via related_transaction_id
  SELECT
    t2.id,
    t2.user_id AS userId,
    t2.type,
    t2.amount,
    t2.currency,
    t2.status,
    t2.exchange_rate_to_base AS exchangeRateToBase,
    t2.related_transaction_id AS relatedTransactionId,
    t2.counterparty_user_id AS counterpartyUserId,
    t2.occurred_at AS occurredAt,
    tc.depth + 1 AS depth
  FROM transactions t2
  INNER JOIN transfer_chain tc
    ON t2.id = tc.relatedTransactionId
)
SELECT *
FROM transfer_chain
ORDER BY depth ASC, occurredAt ASC;
```

Replace `?` with the **`id` of the TRANSFER_IN transaction** you are investigating.

### 6.4. Recursively Trace Where the Sender Got Their Money (User-Level Chain)

This query answers: *For all funds that arrived to a specific user via transfers, where did the senders get their money, recursively?*

```sql
WITH RECURSIVE fund_chain AS (
  -- Level 0: direct incoming transfers to the target user
  SELECT
    t.id,
    t.user_id AS beneficiary_user_id,
    t.counterparty_user_id AS sender_user_id,
    t.type,
    t.amount,
    t.currency,
    t.status,
    t.exchange_rate_to_base,
    t.related_transaction_id,
    t.occurred_at,
    0 AS depth
  FROM transactions t
  WHERE t.user_id = ?
    AND t.type = 'TRANSFER_IN'
    AND t.status = 'SUCCESS'

  UNION ALL

  -- Level N: where did the sender get their funds?
  SELECT
    t2.id,
    t2.user_id AS beneficiary_user_id,
    t2.counterparty_user_id AS sender_user_id,
    t2.type,
    t2.amount,
    t2.currency,
    t2.status,
    t2.exchange_rate_to_base,
    t2.related_transaction_id,
    t2.occurred_at,
    fc.depth + 1 AS depth
  FROM transactions t2
  INNER JOIN fund_chain fc
    ON t2.user_id = fc.sender_user_id
  WHERE t2.status = 'SUCCESS'
    AND t2.type IN ('DEPOSIT', 'TRANSFER_IN')
    AND fc.depth < 10
)
SELECT
  fc.depth,
  fc.id AS transactionId,
  bu.name AS beneficiaryName,
  su.name AS senderName,
  fc.amount,
  fc.currency,
  fc.exchange_rate_to_base AS exchangeRateToBase,
  fc.occurred_at AS occurredAt,
  fc.type
FROM fund_chain fc
LEFT JOIN users bu ON bu.id = fc.beneficiary_user_id
LEFT JOIN users su ON su.id = fc.sender_user_id
ORDER BY fc.depth ASC, fc.occurred_at ASC, fc.id ASC;
```

- Replace `?` with the **beneficiary user’s `id`** (e.g., for Alice, `1`).
- The `depth` column indicates how many hops away from the target user a transaction is.

This query powers the `getFundOriginChain` function used by the `/audit/:userId` endpoint.

---

## 7. Run Instructions (Step-by-Step)

This section assumes you’re starting from scratch.

### 7.1. Clone the Repository

```bash
git clone <repo>
cd audit_trail_system
```

If your repository root name differs, adjust the `cd` path accordingly. Ensure this `script.md` file is at the root.

### 7.2. Start MySQL + Adminer via Docker

From the project root:

```bash
# Make sure db/init.sql exists and contains the schema + 100+ inserts
ls db

# Then start the stack
docker compose up -d
# or: docker-compose up -d
```

Wait a few seconds for MySQL to initialize. Confirm containers are running:

```bash
docker ps
```

You should see `audit_trail_mysql` and `audit_trail_adminer`.

### 7.3. Verify the Database

Use Adminer at `http://localhost:8080`:

- System: `MySQL`
- Server: `mysql`
- Username: `root`
- Password: `rootpassword`
- Database: `audit_trail_system`

Or via CLI:

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p
# password: rootpassword

USE audit_trail_system;
SHOW TABLES;
SELECT COUNT(*) FROM transactions;
```

### 7.4. Configure and Run the Express API

From the project root:

```bash
cd server
cp .env.example .env
# or on PowerShell: copy .env.example .env

npm install
npm run dev
```

You should see something like:

```text
Audit Trail API listening on port 3000
```

### 7.5. Basic Health Check

In a separate terminal, call the health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response (example):

```json
{
  "status": "ok",
  "timestamp": "2024-01-10T12:34:56.789Z"
}
```

---

## 8. Testing Instructions (10 Test Cases)

This section enumerates **10 explicit test cases** an interviewer can run.

> **Note:** The exact transaction IDs and balances depend on your seeded data, but the **patterns and expectations** hold if your `init.sql` matches the described scenarios.

### 8.1. Test Case 1 – Deposit → Balance Update

**Goal:** Verify that a deposit increases the user’s base-currency balance.

1. Insert an extra deposit for Alice (user `1`):

   ```sql
   INSERT INTO transactions (
     user_id, type, amount, currency, status, exchange_rate_to_base, occurred_at
   ) VALUES
     (1, 'DEPOSIT', 100.00, 'USD', 'SUCCESS', 1.00000000, NOW());
   ```

2. Call:

   ```bash
   curl http://localhost:3000/audit/1
   ```

3. Assert that `balance.amountInBase` has increased by at least `100` compared to its previous value.

### 8.2. Test Case 2 – Withdrawal → Balance Check

**Goal:** Verify that a withdrawal decreases the balance.

1. Insert a withdrawal for Alice (user `1`):

   ```sql
   INSERT INTO transactions (
     user_id, type, amount, currency, status, exchange_rate_to_base, occurred_at
   ) VALUES
     (1, 'WITHDRAWAL', 50.00, 'USD', 'SUCCESS', 1.00000000, NOW());
   ```

2. Call:

   ```bash
   curl http://localhost:3000/audit/1
   ```

3. Confirm that `balance.amountInBase` decreases by roughly `50`.

### 8.3. Test Case 3 – Multi-Currency Transfer → Conversion Example

**Goal:** Validate that a transfer from a non-base currency user is normalized using `exchange_rate_to_base`.

Assuming Maria (`id = 4`, base `EUR`) sends funds to Alice (`id = 1`, base `USD`):

1. Insert an EUR transfer out from Maria and a USD transfer in for Alice (if not already in your seed data):

   ```sql
   -- Maria sends 200 EUR to Alice; FX rate: 1 EUR = 1.10 USD
   INSERT INTO transactions (
     user_id, type, amount, currency, status, exchange_rate_to_base,
     counterparty_user_id, occurred_at
   ) VALUES
     (4, 'TRANSFER_OUT', 200.00, 'EUR', 'SUCCESS', 1.10000000, 1, NOW());

   INSERT INTO transactions (
     user_id, type, amount, currency, status, exchange_rate_to_base,
     counterparty_user_id, related_transaction_id, occurred_at
   ) VALUES
     (1, 'TRANSFER_IN', 220.00, 'USD', 'SUCCESS', 1.00000000, 4, LAST_INSERT_ID(), NOW());
   ```

2. Call:

   ```bash
   curl http://localhost:3000/audit/1
   ```

3. Validate that:

   - Alice’s `transactions` array includes a `TRANSFER_IN` of `220.00 USD`.
   - `balance.amountInBase` reflects the **USD** value (`220`) and not the original `200 EUR`.

### 8.4. Test Case 4 – Chain: Maria → Alice → Bob → Chinedu

**Goal:** Demonstrate the fund origin chain across multiple hops.

1. Ensure your `init.sql` (or manual inserts) contains the chain:

   - Maria (`4`) → Alice (`1`) → Bob (`2`) → Chinedu (`3`)
   - Modeled as `TRANSFER_OUT`/`TRANSFER_IN` pairs with appropriate `related_transaction_id`.

2. Call:

   ```bash
   curl http://localhost:3000/audit/3
   ```

3. Inspect `fundOrigins` in the JSON:

   - You should see entries showing:
     - Direct incoming transfer to Chinedu from Bob
     - Bob’s incoming from Alice
     - Alice’s incoming from Maria
   - The `depth` column in the underlying SQL (or a similar notion in the returned rows) reflects the hop count.

### 8.5. Test Case 5 – Fraud Detection Test: Trace Funds 3 Hops Back

**Goal:** Demonstrate that the system can trace funds at least 3 hops back for risk/fraud analysis.

1. Using the same chain as in Test Case 4, call:

   ```bash
   curl http://localhost:3000/audit/3
   ```

2. For each `fundOrigins` row, verify that you can:

   - Identify the **ultimate depositor** or earliest transfer
   - Walk up to at least **3 levels** via:
     - `beneficiaryName`
     - `senderName`
     - `depth`

3. This demonstrates that you can see the origin source several hops away (e.g., Maria as the root for Chinedu’s funds).

### 8.6. Test Case 6 – Transfer Where Sender Has No History

**Goal:** Show how the system behaves when the sender has no prior deposit or transfer history.

1. Insert a brand-new user with no prior history (e.g., `Eve`):

   ```sql
   INSERT INTO users (name, email, base_currency)
   VALUES ('Eve', 'eve@example.com', 'USD');
   ```

2. Note the new `id` (e.g., `5`). Insert a transfer from Eve (`5`) to Alice (`1`):

   ```sql
   INSERT INTO transactions (
     user_id, type, amount, currency, status, exchange_rate_to_base,
     counterparty_user_id, occurred_at
   ) VALUES
     (5, 'TRANSFER_OUT', 75.00, 'USD', 'SUCCESS', 1.00000000, 1, NOW());

   INSERT INTO transactions (
     user_id, type, amount, currency, status, exchange_rate_to_base,
     counterparty_user_id, related_transaction_id, occurred_at
   ) VALUES
     (1, 'TRANSFER_IN', 75.00, 'USD', 'SUCCESS', 1.00000000, 5, LAST_INSERT_ID(), NOW());
   ```

3. Call:

   ```bash
   curl http://localhost:3000/audit/1
   ```

4. Inspect the fund origin chain. You should see:

   - A direct transfer from Eve to Alice
   - **No further upstream records** for Eve (no deposits or transfers in), showing a clear “unknown source” pattern.

### 8.7. Test Case 7 – Transfer from User in Different Currency

**Goal:** Validate base-currency normalization when a sender’s base currency differs from the receiver’s.

1. Ensure Chinedu (`3`, base `NGN`) sends funds to Alice (`1`, base `USD`). For example:

   ```sql
   -- Chinedu sends 10000 NGN to Alice; FX rate: 1 NGN = 0.0013 USD
   INSERT INTO transactions (
     user_id, type, amount, currency, status, exchange_rate_to_base,
     counterparty_user_id, occurred_at
   ) VALUES
     (3, 'TRANSFER_OUT', 10000.00, 'NGN', 'SUCCESS', 0.00130000, 1, NOW());

   INSERT INTO transactions (
     user_id, type, amount, currency, status, exchange_rate_to_base,
     counterparty_user_id, related_transaction_id, occurred_at
   ) VALUES
     (1, 'TRANSFER_IN', 13.00, 'USD', 'SUCCESS', 1.00000000, 3, LAST_INSERT_ID(), NOW());
   ```

2. Call:

   ```bash
   curl http://localhost:3000/audit/1
   ```

3. Confirm that the `TRANSFER_IN` for Alice is `13.00 USD` and that this amount is reflected in `balance.amountInBase`.

### 8.8. Test Case 8 – Circular Transfer Test

**Goal:** Validate that circular transfer patterns do not break the recursion (due to depth limiting).

1. Create a circular pattern, e.g., Alice (`1`) → Bob (`2`) → Alice (`1`):

   ```sql
   -- Alice → Bob
   INSERT INTO transactions (
     user_id, type, amount, currency, status, exchange_rate_to_base,
     counterparty_user_id, occurred_at
   ) VALUES
     (1, 'TRANSFER_OUT', 10.00, 'USD', 'SUCCESS', 1.00000000, 2, NOW());

   INSERT INTO transactions (
     user_id, type, amount, currency, status, exchange_rate_to_base,
     counterparty_user_id, related_transaction_id, occurred_at
   ) VALUES
     (2, 'TRANSFER_IN', 10.00, 'USD', 'SUCCESS', 1.00000000, 1, LAST_INSERT_ID(), NOW());

   -- Bob → Alice
   INSERT INTO transactions (
     user_id, type, amount, currency, status, exchange_rate_to_base,
     counterparty_user_id, occurred_at
   ) VALUES
     (2, 'TRANSFER_OUT', 10.00, 'USD', 'SUCCESS', 1.00000000, 1, NOW());

   INSERT INTO transactions (
     user_id, type, amount, currency, status, exchange_rate_to_base,
     counterparty_user_id, related_transaction_id, occurred_at
   ) VALUES
     (1, 'TRANSFER_IN', 10.00, 'USD', 'SUCCESS', 1.00000000, 2, LAST_INSERT_ID(), NOW());
   ```

2. Call:

   ```bash
   curl http://localhost:3000/audit/1
   ```

3. Confirm that:

   - The `fundOrigins` result set is finite and does **not** infinitely recurse (thanks to `depth < 10` in the CTE).
   - The chain still correctly shows the relevant transactions up to the maximum depth.

### 8.9. Test Case 9 – Missing Conversion Rate Edge Case

**Goal:** Show how missing `exchange_rate_to_base` values are handled.

1. Insert a transaction with `exchange_rate_to_base` = `NULL`:

   ```sql
   INSERT INTO transactions (
     user_id, type, amount, currency, status, exchange_rate_to_base, occurred_at
   ) VALUES
     (1, 'DEPOSIT', 500.00, 'USD', 'SUCCESS', NULL, NOW());
   ```

2. Call:

   ```bash
   curl http://localhost:3000/audit/1
   ```

3. Verify that the balance calculation treats the FX rate as `1` for this transaction due to `COALESCE(t.exchange_rate_to_base, 1)` in the SQL.

### 8.10. Test Case 10 – Invalid `userId`

**Goal:** Confirm robust error handling for invalid or nonexistent users.

1. Call with a negative userId:

   ```bash
   curl http://localhost:3000/audit/-1
   ```

   Expected response:

   - HTTP status `400`
   - JSON containing `{ "error": "Invalid userId parameter" }`

2. Call with a non-existent user (e.g., `9999`):

   ```bash
   curl http://localhost:3000/audit/9999
   ```

   Expected response:

   - HTTP status `404`
   - JSON containing `{ "error": "User not found" }`

---

## 9. Sample Output

The exact values will differ based on your seed data, but the **shape** should match these examples.

### 9.1. Sample Output – `GET /audit/1` (Alice)

```json
{
  "user": {
    "id": 1,
    "name": "Alice",
    "email": "alice@example.com",
    "baseCurrency": "USD",
    "createdAt": "2024-01-01T09:00:00.000Z"
  },
  "balance": {
    "amountInBase": 1325.5,
    "currency": "USD"
  },
  "transactions": [
    {
      "id": 1,
      "userId": 1,
      "type": "DEPOSIT",
      "amount": 1000,
      "currency": "USD",
      "status": "SUCCESS",
      "exchangeRateToBase": 1,
      "relatedTransactionId": null,
      "counterpartyUserId": null,
      "metadata": null,
      "occurredAt": "2024-01-01T09:00:00.000Z",
      "createdAt": "2024-01-01T09:00:00.000Z"
    },
    {
      "id": 2,
      "userId": 1,
      "type": "WITHDRAWAL",
      "amount": 200,
      "currency": "USD",
      "status": "SUCCESS",
      "exchangeRateToBase": 1,
      "relatedTransactionId": null,
      "counterpartyUserId": null,
      "metadata": null,
      "occurredAt": "2024-01-02T10:15:00.000Z",
      "createdAt": "2024-01-02T10:15:00.000Z"
    },
    {
      "id": 3,
      "userId": 1,
      "type": "TRANSFER_IN",
      "amount": 550,
      "currency": "USD",
      "status": "SUCCESS",
      "exchangeRateToBase": 1,
      "relatedTransactionId": 4,
      "counterpartyUserId": 4,
      "metadata": null,
      "occurredAt": "2024-01-03T08:00:05.000Z",
      "createdAt": "2024-01-03T08:00:05.000Z"
    },
    {
      "id": 5,
      "userId": 1,
      "type": "TRANSFER_OUT",
      "amount": 300,
      "currency": "USD",
      "status": "SUCCESS",
      "exchangeRateToBase": 1,
      "relatedTransactionId": 6,
      "counterpartyUserId": 2,
      "metadata": null,
      "occurredAt": "2024-01-04T11:00:00.000Z",
      "createdAt": "2024-01-04T11:00:00.000Z"
    }
  ],
  "fundOrigins": [
    {
      "id": 3,
      "beneficiary_user_id": 1,
      "sender_user_id": 4,
      "type": "TRANSFER_IN",
      "amount": 550,
      "currency": "USD",
      "status": "SUCCESS",
      "exchange_rate_to_base": 1,
      "related_transaction_id": 4,
      "occurred_at": "2024-01-03T08:00:05.000Z",
      "depth": 0,
      "beneficiaryName": "Alice",
      "senderName": "Maria"
    },
    {
      "id": 7,
      "beneficiary_user_id": 4,
      "sender_user_id": null,
      "type": "DEPOSIT",
      "amount": 1000,
      "currency": "EUR",
      "status": "SUCCESS",
      "exchange_rate_to_base": 1.05,
      "related_transaction_id": null,
      "occurred_at": "2024-01-01T08:00:00.000Z",
      "depth": 1,
      "beneficiaryName": "Maria",
      "senderName": null
    }
  ]
}
```

### 9.2. Sample Output – `GET /audit/2` (Bob)

```json
{
  "user": {
    "id": 2,
    "name": "Bob",
    "email": "bob@example.com",
    "baseCurrency": "USD",
    "createdAt": "2024-01-01T09:05:00.000Z"
  },
  "balance": {
    "amountInBase": 450,
    "currency": "USD"
  },
  "transactions": [
    {
      "id": 6,
      "userId": 2,
      "type": "TRANSFER_IN",
      "amount": 300,
      "currency": "USD",
      "status": "SUCCESS",
      "exchangeRateToBase": 1,
      "relatedTransactionId": 5,
      "counterpartyUserId": 1,
      "metadata": null,
      "occurredAt": "2024-01-04T11:00:05.000Z",
      "createdAt": "2024-01-04T11:00:05.000Z"
    },
    {
      "id": 8,
      "userId": 2,
      "type": "TRANSFER_OUT",
      "amount": 150,
      "currency": "USD",
      "status": "SUCCESS",
      "exchangeRateToBase": 1,
      "relatedTransactionId": 9,
      "counterpartyUserId": 3,
      "metadata": null,
      "occurredAt": "2024-01-05T14:30:00.000Z",
      "createdAt": "2024-01-05T14:30:00.000Z"
    }
  ],
  "fundOrigins": [
    {
      "id": 6,
      "beneficiary_user_id": 2,
      "sender_user_id": 1,
      "type": "TRANSFER_IN",
      "amount": 300,
      "currency": "USD",
      "status": "SUCCESS",
      "exchange_rate_to_base": 1,
      "related_transaction_id": 5,
      "occurred_at": "2024-01-04T11:00:05.000Z",
      "depth": 0,
      "beneficiaryName": "Bob",
      "senderName": "Alice"
    },
    {
      "id": 3,
      "beneficiary_user_id": 1,
      "sender_user_id": 4,
      "type": "TRANSFER_IN",
      "amount": 550,
      "currency": "USD",
      "status": "SUCCESS",
      "exchange_rate_to_base": 1,
      "related_transaction_id": 4,
      "occurred_at": "2024-01-03T08:00:05.000Z",
      "depth": 1,
      "beneficiaryName": "Alice",
      "senderName": "Maria"
    },
    {
      "id": 7,
      "beneficiary_user_id": 4,
      "sender_user_id": null,
      "type": "DEPOSIT",
      "amount": 1000,
      "currency": "EUR",
      "status": "SUCCESS",
      "exchange_rate_to_base": 1.05,
      "related_transaction_id": null,
      "occurred_at": "2024-01-01T08:00:00.000Z",
      "depth": 2,
      "beneficiaryName": "Maria",
      "senderName": null
    }
  ]
}
```

---

## 10. Reproducibility Checklist

To ensure everything works **end-to-end** for any interviewer:

1. **Clone** the repository and open this `script.md` in the root.
2. Create `db/init.sql` containing:
   - `CREATE DATABASE` + `USE` commands
   - `users` and `transactions` schema
   - Seed users and at least **100** realistic mock transactions
3. Create `docker-compose.yml` exactly as specified in section **4.3**.
4. Run `docker compose up -d` (or `docker-compose up -d`).
5. Verify `audit_trail_system.users` and `audit_trail_system.transactions` exist and contain data.
6. Under `server/`, create:
   - `package.json` (section **5.2**)
   - `.env` based on `.env.example` (section **5.3**)
   - `src/db.js`, `src/auditService.js`, `src/index.js` (sections **5.4–5.6**)
7. Run the API with:

   ```bash
   cd server
   npm install
   npm run dev
   ```

8. Hit the endpoints:
   - `GET /health`
   - `GET /transactions/:userId`
   - `GET /audit/:userId`
9. Execute the **10 test cases** in section **8**.
10. Compare the returned JSON to the **sample outputs** in section **9** to confirm consistency of structure and behavior.

Following these steps, an interviewer can fully simulate the audit trail system, inspect the SQL, and verify fund legitimacy tracing from raw data to API responses without any additional explanation.