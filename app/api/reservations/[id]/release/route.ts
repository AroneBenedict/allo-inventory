import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: params.id },
      include: { product: true, warehouse: true },
    })

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
    }

    if (reservation.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Cannot release a reservation with status: ${reservation.status}` },
        { status: 409 }
      )
    }

    const [, released] = await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE "StockLevel"
        SET "reserved" = GREATEST(0, "reserved" - ${reservation.quantity}),
            "updatedAt" = NOW()
        WHERE "productId"  = ${reservation.productId}
          AND "warehouseId" = ${reservation.warehouseId}
      `,
      prisma.reservation.update({
        where: { id: params.id },
        data: { status: 'RELEASED' },
        include: { product: true, warehouse: true },
      }),
    ])

    return NextResponse.json({
      id: released.id,
      status: released.status,
      message: 'Reservation released. Stock returned to available inventory.',
    })
  } catch (err) {
    console.error('[POST /api/reservations/:id/release]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
