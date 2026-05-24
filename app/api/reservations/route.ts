import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ReserveSchema } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

const RESERVATION_TTL_MINUTES = 10

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = ReserveSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { productId, warehouseId, quantity } = parsed.data
    const idempotencyKey = req.headers.get('idempotency-key')

    // Bonus: idempotency check — if same key was used before, return original result
    if (idempotencyKey) {
      const existing = await prisma.reservation.findUnique({
        where: { idempotencyKey },
        include: { product: true, warehouse: true },
      })
      if (existing) {
        return NextResponse.json(formatReservation(existing), { status: 200 })
      }
    }

    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000)

    // This is the core of correctness under concurrency.
    //
    // We use a raw SQL UPDATE with WHERE available >= quantity.
    // Postgres evaluates this atomically — only one concurrent request
    // will win the race for the last unit; all others get 0 rows updated
    // and receive a 409. No application-level locking needed.
    //
    // The alternative (SELECT then UPDATE) would have a TOCTOU race condition
    // where two requests read "1 available", both decide to proceed, and both
    // write a reservation — overselling the item.
    const updated = await prisma.$executeRaw`
      UPDATE "StockLevel"
      SET    "reserved"   = "reserved" + ${quantity},
             "updatedAt"  = NOW()
      WHERE  "productId"  = ${productId}
        AND  "warehouseId" = ${warehouseId}
        AND  ("totalUnits" - "reserved") >= ${quantity}
    `

    if (updated === 0) {
      // Either stock doesn't exist or not enough units available
      const stock = await prisma.stockLevel.findUnique({
        where: { productId_warehouseId: { productId, warehouseId } },
      })
      if (!stock) {
        return NextResponse.json({ error: 'Product/warehouse combination not found' }, { status: 404 })
      }
      return NextResponse.json(
        {
          error: 'Not enough stock available',
          available: Math.max(0, stock.totalUnits - stock.reserved),
          requested: quantity,
        },
        { status: 409 }
      )
    }

    // Stock locked — now create the reservation record
    const reservation = await prisma.reservation.create({
      data: {
        productId,
        warehouseId,
        quantity,
        status: 'PENDING',
        expiresAt,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
      include: { product: true, warehouse: true },
    })

    return NextResponse.json(formatReservation(reservation), { status: 201 })
  } catch (err) {
    console.error('[POST /api/reservations]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const reservations = await prisma.reservation.findMany({
      include: { product: true, warehouse: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json(reservations.map(formatReservation))
  } catch (err) {
    console.error('[GET /api/reservations]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function formatReservation(r: {
  id: string
  productId: string
  product: { name: string }
  warehouseId: string
  warehouse: { name: string }
  quantity: number
  status: string
  expiresAt: Date
  createdAt: Date
}) {
  return {
    id: r.id,
    productId: r.productId,
    productName: r.product.name,
    warehouseId: r.warehouseId,
    warehouseName: r.warehouse.name,
    quantity: r.quantity,
    status: r.status,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }
}
