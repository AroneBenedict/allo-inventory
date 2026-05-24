import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Called by Vercel Cron every minute (see vercel.json)
// Also runs lazily on confirm — so even if cron is delayed, expiry is enforced
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()

    // Find all pending reservations that have passed their expiry time
    const expired = await prisma.reservation.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
    })

    if (expired.length === 0) {
      return NextResponse.json({ released: 0, message: 'No expired reservations found' })
    }

    // Release each one — return stock and mark as released
    let released = 0
    for (const r of expired) {
      try {
        await prisma.$transaction([
          prisma.$executeRaw`
            UPDATE "StockLevel"
            SET "reserved" = GREATEST(0, "reserved" - ${r.quantity}),
                "updatedAt" = NOW()
            WHERE "productId"  = ${r.productId}
              AND "warehouseId" = ${r.warehouseId}
          `,
          prisma.reservation.update({
            where: { id: r.id },
            data: { status: 'RELEASED' },
          }),
        ])
        released++
      } catch (err) {
        console.error(`Failed to release reservation ${r.id}:`, err)
      }
    }

    console.log(`[cron/expire] Released ${released}/${expired.length} expired reservations`)
    return NextResponse.json({ released, total: expired.length })
  } catch (err) {
    console.error('[cron/expire]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
