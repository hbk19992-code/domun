export function FavoriteButton({ active, onToggle, size = 18 }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle?.() }}
      aria-pressed={!!active}
      aria-label={active ? '즐겨찾기 해제' : '즐겨찾기'}
      title={active ? '즐겨찾기 해제' : '즐겨찾기에 추가'}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 4,
        lineHeight: 1,
        color: active ? 'var(--theme-star, #fbbf24)' : 'var(--theme-starMuted, #475569)',
        fontSize: size,
      }}
    >
      {active ? '★' : '☆'}
    </button>
  )
}

export function RatingStars({ value = 0, onChange, size = 14, readonly = false }) {
  const safeValue = Math.max(0, Math.min(5, Number(value) || 0))
  return (
    <div
      role={readonly ? 'img' : 'radiogroup'}
      aria-label={`별점 ${safeValue} / 5`}
      style={{ display: 'inline-flex', gap: 2, lineHeight: 1 }}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= safeValue
        if (readonly) {
          return (
            <span key={n} style={{ color: filled ? 'var(--theme-star, #fbbf24)' : 'var(--theme-starMuted, #334155)', fontSize: size }}>
              {filled ? '★' : '☆'}
            </span>
          )
        }
        return (
          <button
            key={n}
            onClick={(e) => {
              e.stopPropagation()
              onChange?.(safeValue === n ? 0 : n)
            }}
            aria-label={`별점 ${n}점`}
            aria-checked={safeValue === n}
            role="radio"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 1,
              lineHeight: 1,
              fontSize: size,
              color: filled ? 'var(--theme-star, #fbbf24)' : 'var(--theme-starMuted, #334155)',
            }}
          >
            {filled ? '★' : '☆'}
          </button>
        )
      })}
    </div>
  )
}

export function isFavorite(card) {
  return !!(card && (card.favorite || card.starred))
}

export function getRating(card) {
  const n = Number(card?.rating || 0)
  return Number.isFinite(n) ? Math.max(0, Math.min(5, Math.round(n))) : 0
}
