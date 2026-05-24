import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        stockLevels: {
          include: { warehouse: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    const result = products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      imageUrl: p.imageUrl,
      stockLevels: p.stockLevels.map((s) => ({
        warehouseId: s.warehouseId,
        warehouseName: s.warehouse.name,
        warehouseLocation: s.warehouse.location,
        totalUnits: s.totalUnits,
        reserved: s.reserved,
        available: Math.max(0, s.totalUnits - s.reserved),
      })),
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/products]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
