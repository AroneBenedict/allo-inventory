'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProductWithStock } from '@/lib/schemas'

export default function HomePage() {
  const [products, setProducts] = useState<ProductWithStock[]>([])
  const [loading, setLoading] = useState(true)
  const [reserving, setReserving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products')
      const data = await res.json()
      setProducts(data)
    } catch {
      setError('Failed to load products. Please refresh.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
    // Refresh stock every 30s so the page stays roughly in sync
    const interval = setInterval(fetchProducts, 30_000)
    return () => clearInterval(interval)
  }, [])

  const handleReserve = async (productId: string, warehouseId: string) => {
    const key = `${productId}-${warehouseId}`
    setReserving(key)
    setError(null)

    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
      })
      const data = await res.json()

      if (res.status === 409) {
        setError(`Not enough stock — only ${data.available} unit(s) left. Someone else may have just reserved the last one.`)
        fetchProducts() // Refresh to show updated stock
        return
      }

      if (!res.ok) {
        setError(data.error || 'Reservation failed. Please try again.')
        return
      }

      // Success — go to checkout page with the reservation ID
      router.push(`/checkout/${data.id}`)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setReserving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 flex items-center gap-2">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading products…
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <p className="text-gray-500 mt-1">Stock is reserved for 10 minutes at checkout. Unreserved units are released automatically.</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-6">
        {products.map((product) => (
          <div key={product.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex gap-5 p-5">
              {product.imageUrl && (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-24 h-24 object-cover rounded-lg flex-shrink-0 bg-gray-100"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold text-gray-900">{product.name}</h2>
                    {product.description && (
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{product.description}</p>
                    )}
                  </div>
                  <span className="text-lg font-bold text-gray-900 flex-shrink-0">
                    ₹{product.price.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Stock by warehouse</p>
                  {product.stockLevels.map((s) => {
                    const isReserving = reserving === `${product.id}-${s.warehouseId}`
                    const outOfStock = s.available === 0
                    const lowStock = s.available > 0 && s.available <= 2

                    return (
                      <div
                        key={s.warehouseId}
                        className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                      >
                        <div>
                          <span className="text-sm font-medium text-gray-800">{s.warehouseName}</span>
                          <span className="text-xs text-gray-400 ml-2">{s.warehouseLocation}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-semibold ${
                            outOfStock ? 'text-gray-400' : lowStock ? 'text-amber-600' : 'text-emerald-600'
                          }`}>
                            {outOfStock ? 'Out of stock' : `${s.available} available`}
                            {lowStock && ' ⚠️'}
                          </span>
                          <button
                            onClick={() => handleReserve(product.id, s.warehouseId)}
                            disabled={outOfStock || isReserving}
                            className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
                              outOfStock
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : isReserving
                                ? 'bg-violet-300 text-white cursor-wait'
                                : 'bg-violet-600 hover:bg-violet-700 text-white'
                            }`}
                          >
                            {isReserving ? 'Reserving…' : 'Reserve'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
