import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Clear existing data
  await prisma.reservation.deleteMany()
  await prisma.stockLevel.deleteMany()
  await prisma.product.deleteMany()
  await prisma.warehouse.deleteMany()

  // Warehouses
  const mumbai = await prisma.warehouse.create({
    data: { name: 'Mumbai Central', location: 'Mumbai, MH' },
  })
  const delhi = await prisma.warehouse.create({
    data: { name: 'Delhi North', location: 'New Delhi, DL' },
  })
  const bangalore = await prisma.warehouse.create({
    data: { name: 'Bangalore Hub', location: 'Bengaluru, KA' },
  })

  // Products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: 'Wireless Noise-Cancelling Headphones',
        description: 'Premium over-ear headphones with 40hr battery and active noise cancellation.',
        price: 4999,
        imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Mechanical Keyboard – TKL',
        description: 'Tenkeyless mechanical keyboard with Cherry MX Red switches and RGB backlight.',
        price: 3499,
        imageUrl: 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=400',
      },
    }),
    prisma.product.create({
      data: {
        name: 'USB-C Laptop Stand',
        description: 'Aluminium adjustable stand with built-in USB-C hub – 4K HDMI, 3x USB-A, SD card.',
        price: 2199,
        imageUrl: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Smart Watch Series X',
        description: 'Health tracking, GPS, 7-day battery. Water resistant up to 50m.',
        price: 8999,
        imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
      },
    }),
  ])

  // Stock levels — intentionally low on some to demo 409s
  const stockData = [
    // Headphones
    { product: products[0], warehouse: mumbai, total: 10 },
    { product: products[0], warehouse: delhi, total: 1 },   // scarce!
    { product: products[0], warehouse: bangalore, total: 5 },
    // Keyboard
    { product: products[1], warehouse: mumbai, total: 3 },
    { product: products[1], warehouse: delhi, total: 8 },
    { product: products[1], warehouse: bangalore, total: 0 }, // out of stock
    // Stand
    { product: products[2], warehouse: mumbai, total: 20 },
    { product: products[2], warehouse: delhi, total: 0 },
    { product: products[2], warehouse: bangalore, total: 12 },
    // Watch
    { product: products[3], warehouse: mumbai, total: 2 },   // scarce!
    { product: products[3], warehouse: delhi, total: 4 },
    { product: products[3], warehouse: bangalore, total: 1 }, // scarce!
  ]

  for (const s of stockData) {
    await prisma.stockLevel.create({
      data: {
        productId: s.product.id,
        warehouseId: s.warehouse.id,
        totalUnits: s.total,
        reserved: 0,
      },
    })
  }

  console.log(`Seeded ${products.length} products across 3 warehouses.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
