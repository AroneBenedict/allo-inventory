import { z } from 'zod'

export const ReserveSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
})

export type ReserveInput = z.infer<typeof ReserveSchema>

export const ReservationStatus = z.enum(['PENDING', 'CONFIRMED', 'RELEASED'])

export interface ProductWithStock {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  stockLevels: {
    warehouseId: string
    warehouseName: string
    warehouseLocation: string
    totalUnits: number
    reserved: number
    available: number
  }[]
}

export interface ReservationDetail {
  id: string
  productId: string
  productName: string
  warehouseId: string
  warehouseName: string
  quantity: number
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED'
  expiresAt: string
  createdAt: string
}
