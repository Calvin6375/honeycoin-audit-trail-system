# HoneyCoin Audit Trail System

SQL-based audit-trail microservice built for HoneyCoin's full-stack engineering challenge.

## 🚀 Overview
This service retrieves and verifies user transactions (deposits, withdrawals, transfers),
calculates final balances across multiple currencies, and recursively traces the source
of transferred funds.

## 🧱 Stack
- Node.js + TypeScript
- Express.js
- PostgreSQL
- Redis (cache)
- Jest (testing)
- Docker + GitHub Actions (CI)

## 🧩 API Endpoint
`GET /api/audit/:userId`

Returns:
```json
{
  "userId": "uuid",
  "baseCurrency": "KES",
  "finalBalance": 12500.00,
  "transactions": [ ... ],
  "trace": [ ... ]
}
⚙️ Setup
npm install
psql -f src/sql/schema.sql
psql -f src/sql/seed.sql
npm run dev
📈 Notes

Includes recursive fund tracing via CTE.

Converts all balances into user’s base currency.

Cached for 5 minutes to optimize performance.
