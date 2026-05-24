import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const idempotencyKey = req.headers.get('idempotency-key')

    const reservation = await prisma.reservation.findUnique({
      where: { id: params.id },
      include: { product: true, warehouse: true },
    })

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
    }

    // If already confirmed and idempotency key matches — safe to return success
    if (reservation.status === 'CONFIRMED') {
      if (idempotencyKey && reservation.idempotencyKey === idempotencyKey) {
        return NextResponse.json(formatReservation(reservation), { status: 200 })
      }
      return NextResponse.json({ error: 'Reservation already confirmed' }, { status: 409 })
    }

    if (reservation.status === 'RELEASED') {
      return NextResponse.json({ error: 'Reservation was already released' }, { status: 409 })
    }

    // Check expiry
    if (new Date() > reservation.expiresAt) {
      // Expired — release the stock back and mark as released
      await prisma.$transaction([
        prisma.$executeRaw`
          UPDATE "StockLevel"
          SET "reserved" = GREATEST(0, "reserved" - ${reservation.quantity}),
              "updatedAt" = NOW()
          WHERE "productId" = ${reservation.productId}
            AND "warehouseId" = ${reservation.warehouseId}
        `,
        prisma.reservation.update({
          where: { id: params.id },
          data: { status: 'RELEASED' },
        }),
      ])
      return NextResponse.json(
        { error: 'Reservation has expired — stock has been released' },
        { status: 410 }
      )
    }

    // All good — confirm: decrement totalUnits (permanently) and clear reserved
    const [, confirmed] = await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE "StockLevel"
        SET "totalUnits" = "totalUnits" - ${reservation.quantity},
            "reserved"   = GREATEST(0, "reserved" - ${reservation.quantity}),
            "updatedAt"  = NOW()
        WHERE "productId"  = ${reservation.productId}
          AND "warehouseId" = ${reservation.warehouseId}
      `,
      prisma.reservation.update({
        where: { id: params.id },
        data: { status: 'CONFIRMED' },
        include: { product: true, warehouse: true },
      }),
    ])

    return NextResponse.json(formatReservation(confirmed))
  } catch (err) {
    console.error('[POST /api/reservations/:id/confirm]', err)
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
