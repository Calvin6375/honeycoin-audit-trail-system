# Audit Trail API – Curl Test Script

This `test.md` file contains **copy-paste ready curl commands** that exercise the 10 test cases described in `script.md`.

> **Important:** Before running these tests, ensure you have:
>
> 1. Started MySQL + Adminer via Docker (`docker compose up -d` or `docker-compose up -d`).
> 2. Applied the schema and seed data via `db/init.sql` as described in `script.md`.
> 3. Started the API server (from the `server` folder):
>
>    ```bash
>    npm run dev
>    ```
>
> 4. Run any **SQL setup** for each test case as described in `script.md` (section 8). Many tests add additional transactions before you call the API.

All curl commands assume the API is running locally on **port 3000**.

---

## Base Commands

Quick sanity checks before detailed tests:

### Health Check (pass)

```bash
curl http://localhost:3000/health
```

### Fetch All Transactions for a User (Generic) (pass)

Replace `:userId` with the desired user ID (e.g., `1`):
Guide:
User Id: 1 is alice
User Id: 2 is bob
User Id: 3 is chinedu
User Id: 4 is maria
User Id: 5 is eve

```bash
curl http://localhost:3000/api/transactions/1

```

### Full Audit View for a User (Generic) (pass)

```bash
curl http://localhost:3000/api/audit/1
```

---

## Test Case 1 – Deposit → Balance Update

**Goal:** After inserting a new `DEPOSIT` transaction for Alice (user `1`), her balance should increase.

1. **Run the SQL insert** from `script.md` (section 8.1) to add the deposit.
2. Then call the audit endpoint:

```bash
curl http://localhost:3000/audit/1
```

Review `balance.amountInBase` and confirm it increased by ~`100` compared to the previous value.

---

## Test Case 2 – Withdrawal → Balance Check

**Goal:** After inserting a new `WITHDRAWAL` transaction for Alice (user `1`), her balance should decrease.

1. **Run the SQL insert** from `script.md` (section 8.2) to add the withdrawal.
2. Then call:

```bash
curl http://localhost:3000/audit/1
```

Check that `balance.amountInBase` decreased by ~`50`.

---

## Test Case 3 – Multi-Currency Transfer → Conversion Example

**Goal:** Validate that a transfer from Maria (`4`, base `EUR`) to Alice (`1`, base `USD`) is reflected with correct conversion.

1. **Run the two SQL inserts** from `script.md` (section 8.3) to create the `TRANSFER_OUT` (EUR) and `TRANSFER_IN` (USD).
2. Then call:

```bash
curl http://localhost:3000/audit/1
```

Inspect the response:

- In `transactions`, look for a `TRANSFER_IN` of `220.00` in `USD`.
- Confirm that `balance.amountInBase` includes that `220` in the total.

---

## Test Case 4 – Chain: Maria → Alice → Bob → Chinedu

**Goal:** Demonstrate multi-hop fund origin tracing.

1. Ensure the Maria → Alice → Bob → Chinedu chain exists (from seed data or inserts in `script.md` section 3.5.2).
2. Then run an audit for Chinedu (user `3`):

```bash
curl http://localhost:3000/audit/3
```

In the response:

- Inspect the `fundOrigins` array.
- You should see hops representing the chain: Maria → Alice → Bob → Chinedu.

---

## Test Case 5 – Fraud Detection: Trace Funds 3 Hops Back

**Goal:** Show that the system can trace incoming funds several hops back (e.g., for Chinedu).

1. Reuse the chain from Test Case 4.
2. Call:

```bash
curl http://localhost:3000/audit/3
```

In `fundOrigins`:

- Verify entries at increasing depths (0, 1, 2, 3, ...).
- Confirm that you can follow the chain at least 3 levels back from the final recipient.

---

## Test Case 6 – Transfer Where Sender Has No History

**Goal:** Show behavior when a sender has no prior deposits or incoming transfers.

1. **Run the SQL** from `script.md` (section 8.6) to create user `Eve` and a transfer from Eve to Alice.
2. Then call:

```bash
curl http://localhost:3000/audit/1
```

Inspect `fundOrigins` for the Eve → Alice transfer:

- There should be a direct entry from Eve to Alice.
- There should be **no earlier** upstream records for Eve (no deposits or incoming transfers).

---

## Test Case 7 – Transfer from User in Different Currency

**Goal:** Validate that transfers from a user with a different base currency are normalized correctly.

1. **Run the SQL** from `script.md` (section 8.7) to create a transfer from Chinedu (`3`, NGN) to Alice (`1`, USD).
2. Then call:

```bash
curl http://localhost:3000/audit/1
```

Check the response:

- In `transactions`, confirm a `TRANSFER_IN` of `13.00 USD` for Alice.
- Confirm that the `balance.amountInBase` reflects this `13.00` addition.

---

## Test Case 8 – Circular Transfer Test

**Goal:** Ensure circular transfers don’t cause infinite recursion and are still traceable.

1. **Run the circular transfer SQL** from `script.md` (section 8.8) to create Alice → Bob → Alice loop transfers.
2. Then call (for Alice):

```bash
curl http://localhost:3000/audit/1
```

Validate that:

- The response returns normally (no timeout / error).
- `fundOrigins` is finite and includes the loop transactions up to the recursion depth limit.

You can also test Bob (`2`):

```bash
curl http://localhost:3000/audit/2
```

---

## Test Case 9 – Missing Conversion Rate Edge Case

**Goal:** Verify that transactions with `exchange_rate_to_base = NULL` default to `1` in balance calculations.

1. **Run the SQL** from `script.md` (section 8.9) to insert a `DEPOSIT` for Alice with `exchange_rate_to_base = NULL`.
2. Then call:

```bash
curl http://localhost:3000/audit/1
```

In the JSON response:

- Locate the deposit with `exchangeRateToBase` `null` in `transactions`.
- Confirm that the `balance.amountInBase` still increased by exactly the deposit `amount` (treated as FX = 1).

---

## Test Case 10 – Invalid `userId`

**Goal:** Validate error handling for invalid or nonexistent `userId` parameters.

### 10.1. Negative `userId`

```bash
curl -i http://localhost:3000/audit/-1
```

Expected:

- HTTP status code `400`.
- Body similar to:

  ```json
  { "error": "Invalid userId parameter" }
  ```

### 10.2. Nonexistent `userId`

```bash
curl -i http://localhost:3000/audit/9999
```

Expected:

- HTTP status code `404`.
- Body similar to:

  ```json
  { "error": "User not found" }
  ```

You can repeat the invalid-user test for `/transactions` as well:

```bash
curl -i http://localhost:3000/transactions/9999
```

Expected: 404 with `{ "error": "User not found" }`.

---

## Quick Smoke Test Suite

For a fast end-to-end smoke run (assuming all relevant SQL setup is already applied), you can execute these commands in sequence:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/audit/1
curl http://localhost:3000/audit/2
curl http://localhost:3000/audit/3
curl -i http://localhost:3000/audit/9999
```

These cover:

- Service health
- Two primary users (Alice and Bob)
- A multi-hop chain recipient (Chinedu)
- Error handling for a nonexistent user.
