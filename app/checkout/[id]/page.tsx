'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { ReservationDetail } from '@/lib/schemas'

function useCountdown(expiresAt: string | null) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0)

  useEffect(() => {
    if (!expiresAt) return

    const tick = () => {
      const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
      setSecondsLeft(Math.max(0, diff))
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  return { secondsLeft, display: `${minutes}:${seconds.toString().padStart(2, '0')}` }
}

export default function CheckoutPage({ params }: { params: { id: string } }) {
  const [reservation, setReservation] = useState<ReservationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<'confirm' | 'cancel' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { secondsLeft, display } = useCountdown(reservation?.expiresAt ?? null)

  const fetchReservation = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations`)
      const all: ReservationDetail[] = await res.json()
      const found = all.find((r) => r.id === params.id)
      if (!found) {
        setError('Reservation not found.')
      } else {
        setReservation(found)
      }
    } catch {
      setError('Failed to load reservation.')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchReservation()
  }, [fetchReservation])

  const handleConfirm = async () => {
    if (!reservation) return
    setActionLoading('confirm')
    setError(null)

    const res = await fetch(`/api/reservations/${reservation.id}/confirm`, { method: 'POST' })
    const data = await res.json()

    if (res.status === 410) {
      setError('Your reservation expired before you could confirm. The stock has been released.')
      setReservation((prev) => prev ? { ...prev, status: 'RELEASED' } : prev)
    } else if (!res.ok) {
      setError(data.error || 'Something went wrong. Please try again.')
    } else {
      setReservation((prev) => prev ? { ...prev, status: 'CONFIRMED' } : prev)
    }

    setActionLoading(null)
  }

  const handleCancel = async () => {
    if (!reservation) return
    setActionLoading('cancel')
    setError(null)

    const res = await fetch(`/api/reservations/${reservation.id}/release`, { method: 'POST' })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Could not cancel. Please try again.')
    } else {
      setReservation((prev) => prev ? { ...prev, status: 'RELEASED' } : prev)
    }

    setActionLoading(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 flex items-center gap-2">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading reservation…
        </div>
      </div>
    )
  }

  if (!reservation || error === 'Reservation not found.') {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4">🔍</div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Reservation not found</h2>
        <p className="text-gray-500 mb-6">This reservation doesn't exist or may have been cleaned up.</p>
        <button onClick={() => router.push('/')} className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700">
          Back to products
        </button>
      </div>
    )
  }

  const isExpired = secondsLeft === 0 && reservation.status === 'PENDING'
  const isPending = reservation.status === 'PENDING' && !isExpired
  const isConfirmed = reservation.status === 'CONFIRMED'
  const isReleased = reservation.status === 'RELEASED' || isExpired

  const urgency = secondsLeft < 60 ? 'text-red-600' : secondsLeft < 180 ? 'text-amber-600' : 'text-emerald-600'

  return (
    <div className="max-w-lg mx-auto">
      <button
        onClick={() => router.push('/')}
        className="text-sm text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-1"
      >
        ← Back to products
      </button>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Status banner */}
        {isConfirmed && (
          <div className="bg-emerald-500 text-white text-center py-3 font-medium text-sm">
            ✅ Purchase confirmed — thank you!
          </div>
        )}
        {isReleased && (
          <div className="bg-gray-500 text-white text-center py-3 font-medium text-sm">
            🔓 Reservation released — stock returned to inventory
          </div>
        )}
        {isPending && secondsLeft < 60 && (
          <div className="bg-red-500 text-white text-center py-3 font-medium text-sm animate-pulse">
            ⚡ Hurry! Less than a minute left
          </div>
        )}

        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Reservation</p>
              <h1 className="text-xl font-bold text-gray-900">{reservation.productName}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {reservation.warehouseName} · Qty: {reservation.quantity}
              </p>
            </div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
              isConfirmed ? 'bg-emerald-100 text-emerald-700' :
              isReleased ? 'bg-gray-100 text-gray-600' :
              'bg-violet-100 text-violet-700'
            }`}>
              {reservation.status}
            </span>
          </div>

          {/* Countdown — only show for pending reservations */}
          {isPending && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-center">
              <p className="text-xs text-gray-500 mb-1">Time remaining to complete purchase</p>
              <p className={`text-4xl font-mono font-bold tabular-nums ${urgency}`}>{display}</p>
              <div className="mt-2 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    secondsLeft < 60 ? 'bg-red-500' : secondsLeft < 180 ? 'bg-amber-400' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (secondsLeft / 600) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {isExpired && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-center">
              <p className="text-red-700 font-medium">This reservation expired</p>
              <p className="text-red-500 text-sm mt-1">The stock has been returned to inventory. You can try reserving again.</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Order summary */}
          <div className="border-t border-gray-100 pt-4 mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Reservation ID</span>
              <span className="text-gray-700 font-mono text-xs">{reservation.id.slice(0, 16)}…</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Warehouse</span>
              <span className="text-gray-700">{reservation.warehouseName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Quantity</span>
              <span className="text-gray-700">{reservation.quantity}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Reserved at</span>
              <span className="text-gray-700">{new Date(reservation.createdAt).toLocaleTimeString()}</span>
            </div>
          </div>

          {/* Action buttons */}
          {isPending && (
            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                disabled={!!actionLoading}
                className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                {actionLoading === 'confirm' ? 'Confirming…' : '✓ Confirm purchase'}
              </button>
              <button
                onClick={handleCancel}
                disabled={!!actionLoading}
                className="px-4 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 font-medium py-3 rounded-lg transition-colors"
              >
                {actionLoading === 'cancel' ? '…' : 'Cancel'}
              </button>
            </div>
          )}

          {(isConfirmed || isReleased) && (
            <button
              onClick={() => router.push('/')}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              Back to products
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
