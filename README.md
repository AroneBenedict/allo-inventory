# Allo Inventory — Take-Home Exercise

Multi-warehouse inventory and reservation platform built with Next.js 14, Prisma, and Postgres.

## Live Demo

> **[https://allo-inventory.vercel.app](https://allo-inventory.vercel.app)**

The database is pre-seeded with 4 products across 3 warehouses. Some items are intentionally scarce (1–2 units) so you can see the 409 conflict response in action.

---

## Running locally

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/allo-inventory.git
cd allo-inventory
npm install
```

### 2. Set up a Postgres database

Sign up at [neon.tech](https://neon.tech) (free tier is fine). Create a project, then grab the two connection strings from **Dashboard → Connection Details**:

- **Connection string** (pooled) → `DATABASE_URL`
- **Direct connection** → `DIRECT_URL`

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
DATABASE_URL="postgresql://..."   # pooled, for runtime queries
DIRECT_URL="postgresql://..."     # direct, for migrations
CRON_SECRET="any-random-string"   # protects the expiry cron endpoint
```

### 4. Run migrations and seed

```bash
npm run db:migrate   # applies the SQL migration to your Postgres instance
npm run db:seed      # inserts products, warehouses, and stock levels
```

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How concurrency-safe reservation works

This was the core of the exercise, so I want to be explicit about it.

**The problem:** If two requests come in simultaneously for the last unit of a product, a naive implementation would:
1. Both read `reserved = 4`, `total = 5` → both see 1 available
2. Both decide to proceed
3. Both write `reserved = 5`
4. Both create a reservation — the item is now oversold

**The solution** is a single atomic `UPDATE` with a `WHERE` clause that checks availability:

```sql
UPDATE "StockLevel"
SET    "reserved"   = "reserved" + $quantity,
       "updatedAt"  = NOW()
WHERE  "productId"  = $productId
  AND  "warehouseId" = $warehouseId
  AND  ("totalUnits" - "reserved") >= $quantity
```

Postgres evaluates this atomically at the row level. If two transactions try to update the same `StockLevel` row simultaneously, Postgres serialises them — one wins, one waits. When the second one runs, `available` will have dropped below `quantity`, so `0 rows` are updated and it gets a 409.

This avoids both overselling and the overhead of explicit advisory locks. No Redis required for correctness.

I also considered `SELECT ... FOR UPDATE` inside a transaction, which would be correct too — but the single-statement approach is simpler and equivalent for this use case.

---

## How expiry works in production

Reservations have an `expiresAt` timestamp (10 minutes from creation). There are two layers of expiry:

**1. Vercel Cron (every minute)**

`vercel.json` schedules `GET /api/cron/expire` to run every minute. The endpoint scans for `PENDING` reservations past their `expiresAt`, releases the stock, and marks them `RELEASED`. The endpoint is protected by a `CRON_SECRET` header so arbitrary callers can't trigger it.

**2. Lazy expiry on confirm**

If the cron job hasn't run yet and a user tries to confirm an expired reservation, the `/confirm` handler checks `expiresAt` itself, releases the stock on the spot, and returns a 410. This means expiry is enforced at both the scheduled and the on-demand level.

The trade-off: there's a window of up to ~1 minute where an expired reservation hasn't been cleaned up yet, so the stock appears unavailable to other shoppers. For a real production system I'd either shrink the cron interval or add lazy cleanup to `GET /api/products` as well. I left this out to keep things simple.

---

## Bonus: Idempotency

The `POST /api/reservations` and `POST /api/reservations/:id/confirm` endpoints support an optional `Idempotency-Key` header. If a client sends the same key twice (e.g. after a network timeout), the server returns the original response without creating a duplicate reservation or double-confirming.

The key is stored on the `Reservation` record with a unique constraint, so even under concurrent retries, only one write wins — the second hits a unique violation which is caught and returns the existing record.

---

## Trade-offs and things I'd do differently

**What I prioritised:**
- Correctness of the reservation logic — this was the stated core of the exercise
- A working end-to-end flow you can actually demo
- A clean README that explains the thinking

**What I'd improve with more time:**
- **Tests.** I'd add at minimum an integration test that fires two simultaneous reserve requests for the last unit and asserts exactly one 201 and one 409. That's the single most important test for this codebase.
- **Optimistic UI.** Right now the product page refreshes stock every 30 seconds. In production I'd use Server-Sent Events or a WebSocket to push stock updates in real time.
- **Auth.** Reservations aren't tied to a user session, so anyone with the reservation ID can confirm or release it. In a real app this would obviously need authentication.
- **Quantity selector.** The UI hardcodes `quantity: 1`. The API already supports arbitrary quantities — just needs a UI control.
- **Error boundary.** The Next.js pages don't have error.tsx boundaries yet. Any unhandled throw would show a generic error page.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 App Router | Required |
| Language | TypeScript | Required; end-to-end types are useful here |
| ORM | Prisma | Familiar, good migrations story |
| Database | Neon (hosted Postgres) | Free tier, Prisma-compatible, easy to share |
| Hosting | Vercel | Zero-config Next.js deployment |
| Styling | Tailwind CSS | Fast to write, no separate CSS files |
| Validation | Zod | Schema is shared between API and frontend |
