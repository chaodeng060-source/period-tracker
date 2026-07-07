import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

type Phase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal' | 'late' | null

interface Derived {
  last_start: string | null
  next_due: string | null
  recorded: number
  cycles: number
  avg_cycle: number
  period_length: number
  day_of_cycle: number | null
  days_until_next: number | null
  phase: Phase
}

interface PeriodState {
  starts: string[]
  period_length?: number
}

const PHASE_META: Record<Exclude<Phase, null | 'late'>, { label: string; color: string }> = {
  menstrual: { label: '经期', color: '#ef8fae' },
  follicular: { label: '卵泡期', color: '#88aee4' },
  ovulation: { label: '排卵期', color: '#7fce96' },
  luteal: { label: '黄体期', color: '#8fa89b' },
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const MS_PER_DAY = 24 * 60 * 60 * 1000

function Caret({ flip }: { flip?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden
    >
      <polyline points="14 5 7 12 14 19" />
    </svg>
  )
}

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function md(s: string | null | undefined): string {
  return s ? s.slice(5) : '-'
}

function phaseForCycleDay(dayOfCycle: number, cycleLen: number, periodLen: number): Phase {
  const ovulation = Math.max(periodLen + 1, cycleLen - 14)
  if (dayOfCycle <= periodLen) return 'menstrual'
  if (dayOfCycle < ovulation - 1) return 'follicular'
  if (dayOfCycle <= ovulation + 1) return 'ovulation'
  return 'luteal'
}

function phaseForDate(date: Date, starts: Date[], cycleLen: number, periodLen: number): Phase {
  if (!starts.length) return null
  const reference = [...starts].reverse().find((start) => start.getTime() <= date.getTime()) ?? starts[starts.length - 1]
  const rawDiff = Math.floor((date.getTime() - reference.getTime()) / MS_PER_DAY)
  const diff = ((rawDiff % cycleLen) + cycleLen) % cycleLen
  return phaseForCycleDay(diff + 1, cycleLen, periodLen)
}

function phaseLabel(phase: Phase): string {
  if (phase === 'late') return '已超期'
  if (phase && PHASE_META[phase]) return PHASE_META[phase].label
  return '周期'
}

function distanceText(days: number | null | undefined): string {
  if (days == null) return '记录一次起始日后开始预计'
  if (days >= 0) return `距下次预计还有${days}天`
  return `已超过预计${Math.abs(days)}天`
}

export default function App() {
  const [state, setState] = useState<PeriodState | null>(null)
  const [derived, setDerived] = useState<Derived | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  useEffect(() => {
    let alive = true
    fetch('/api/period/state')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (!alive) return
        setState(data.state)
        setDerived(data.derived)
        setErr(null)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const logPeriod = useCallback(async (action: 'start' | 'undo', date?: string) => {
    setBusy(true)
    try {
      const r = await fetch('/api/period/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(date ? { date } : {}) }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setState(data.state)
      setDerived(data.derived)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const startSet = useMemo(() => new Set(state?.starts ?? []), [state])
  const startDates = useMemo(
    () => [...startSet].map(parseYmd).sort((a, b) => a.getTime() - b.getTime()),
    [startSet],
  )
  const cycleLen = derived?.avg_cycle ?? 28
  const periodLen = derived?.period_length ?? state?.period_length ?? 5
  const todayStr = ymd(new Date())

  const cells = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
    const lead = (first.getDay() + 6) % 7
    const out: (Date | null)[] = []
    for (let i = 0; i < lead; i += 1) out.push(null)
    for (let d = 1; d <= daysInMonth; d += 1) {
      out.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d))
    }
    return out
  }, [viewMonth])

  const statusPhase = derived?.phase ?? null
  const monthLabel = `${viewMonth.getFullYear()} 年 ${viewMonth.getMonth() + 1}月`
  const shiftMonth = (delta: number) =>
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))

  return (
    <div style={panelStyle}>
      <div style={contentStyle}>
        {(loading || err) && (
          <div style={{ ...noticeStyle, color: err ? '#b74f5c' : '#8f9994' }}>
            {err ? `出错了：${err}` : '加载中...'}
          </div>
        )}

        <section style={heroCardStyle}>
          <div style={heroTitleStyle}>
            {derived?.last_start ? (
              <>
                <span style={heroTitleMainStyle}>{phaseLabel(statusPhase)}</span>
                <span style={heroTitleDotStyle}>·</span>
                <span style={heroTitleDayStyle}>第{derived.day_of_cycle ?? '-'}天</span>
              </>
            ) : (
              <span style={heroTitleMainStyle}>还没有周期记录</span>
            )}
          </div>
          <div style={heroSubStyle}>{distanceText(derived?.days_until_next)}</div>
        </section>

        <section style={statsGridStyle}>
          <StatCard label="上次开始" value={md(derived?.last_start)} />
          <StatCard label="下次预计" value={md(derived?.next_due)} />
          <StatCard label="平均周期" value={derived?.avg_cycle ? `${derived.avg_cycle}天` : '-'} />
        </section>

        <button
          type="button"
          disabled={busy}
          onClick={() => logPeriod('start')}
          style={{
            ...primaryButtonStyle,
            opacity: busy ? 0.58 : 1,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          经期来了
        </button>

        <div style={legendStyle}>
          {Object.entries(PHASE_META).map(([key, meta]) => (
            <span key={key} style={legendItemStyle}>
              <span style={{ ...legendDotStyle, background: meta.color }} />
              {meta.label}
            </span>
          ))}
        </div>

        <section style={calendarCardStyle}>
          <div style={calendarHeaderStyle}>
            <button type="button" onClick={() => shiftMonth(-1)} style={navButtonStyle} aria-label="上个月">
              <Caret />
            </button>
            <div style={monthTitleStyle}>{monthLabel}</div>
            <button type="button" onClick={() => shiftMonth(1)} style={navButtonStyle} aria-label="下个月">
              <Caret flip />
            </button>
          </div>

          <div style={weekdayGridStyle}>
            {WEEKDAYS.map((w) => (
              <div key={w} style={weekdayStyle}>
                {w}
              </div>
            ))}
          </div>

          <div style={dayGridStyle}>
            {cells.map((d, i) => {
              if (!d) return <div key={`empty-${i}`} />
              const ds = ymd(d)
              const isStart = startSet.has(ds)
              const isToday = ds === todayStr
              const isDue = derived?.next_due === ds
              // 还没到的日子不标相位点——只画到今天为止
              const isFuture = ds > todayStr
              const phase = isFuture ? null : phaseForDate(d, startDates, cycleLen, periodLen)
              const phaseColor = phase && phase !== 'late' ? PHASE_META[phase]?.color : undefined
              const showDot = Boolean(phaseColor && (!isStart || isToday))
              return (
                <button
                  key={ds}
                  type="button"
                  onClick={() => logPeriod(isStart ? 'undo' : 'start', ds)}
                  disabled={busy}
                  title={isStart ? '点击撤销这天的起始记录' : '点击标记这天来潮'}
                  style={{
                    ...dayButtonStyle,
                    background: isStart ? '#eff8f0' : 'transparent',
                    color: isDue ? '#39554a' : '#3c4842',
                    fontWeight: isToday ? 600 : 400,
                  }}
                >
                  <span>{d.getDate()}</span>
                  {showDot && <span style={{ ...dayDotStyle, background: phaseColor }} />}
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCardStyle}>
      <div style={statValueStyle}>{value}</div>
      <div style={statLabelStyle}>{label}</div>
    </div>
  )
}

const panelStyle: CSSProperties = {
  minHeight: '100%',
  boxSizing: 'border-box',
  overflowY: 'auto',
  background: '#ffffff',
  color: '#25312b',
  fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "HarmonyOS Sans SC", sans-serif',
}

const contentStyle: CSSProperties = {
  width: '100%',
  maxWidth: 432,
  minHeight: '100%',
  margin: '0 auto',
  boxSizing: 'border-box',
  padding: '18px 20px 24px',
}

const noticeStyle: CSSProperties = {
  margin: '-3px 0 8px',
  fontSize: 12,
  lineHeight: 1.2,
}

const heroCardStyle: CSSProperties = {
  height: 100,
  boxSizing: 'border-box',
  borderRadius: 21,
  padding: '23px 30px 20px',
  marginBottom: 14,
  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.97) 0%, rgba(240, 249, 241, 0.74) 100%)',
  border: '1px solid rgba(25, 108, 60, 0.08)',
  boxShadow: '0 8px 26px rgba(30, 71, 48, 0.045)',
}

const heroTitleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 9,
  marginBottom: 14,
  color: '#4d8065',
  whiteSpace: 'nowrap',
}

const heroTitleMainStyle: CSSProperties = {
  fontSize: 19,
  lineHeight: 1,
  fontWeight: 600,
  letterSpacing: 0,
}

const heroTitleDotStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1,
  fontWeight: 500,
  color: '#4d8065',
}

const heroTitleDayStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1,
  fontWeight: 500,
  color: '#4d8065',
}

const heroSubStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1,
  fontWeight: 400,
  color: '#9aa39f',
}

const statsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 14,
  marginBottom: 14,
}

const statCardStyle: CSSProperties = {
  height: 66,
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '11px 7px 10px',
  borderRadius: 18,
  border: '1px solid rgba(25, 108, 60, 0.07)',
  background: '#ffffff',
  boxShadow: '0 8px 23px rgba(28, 69, 46, 0.055)',
}

const statValueStyle: CSSProperties = {
  fontSize: 17,
  lineHeight: 1,
  color: '#4d8065',
  fontWeight: 500,
  marginBottom: 8,
  letterSpacing: 0,
}

const statLabelStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1,
  color: '#8a9290',
  whiteSpace: 'nowrap',
}

const primaryButtonStyle: CSSProperties = {
  width: '100%',
  height: 50,
  borderRadius: 20,
  border: '1px solid rgba(25, 108, 60, 0.06)',
  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(240, 250, 242, 0.8))',
  boxShadow: '0 8px 22px rgba(30, 71, 48, 0.035)',
  color: '#4d8065',
  fontSize: 18,
  lineHeight: 1,
  fontWeight: 600,
  letterSpacing: 0,
  margin: '0 0 14px',
}

const legendStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 22,
  margin: '0 0 13px',
}

const legendItemStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 12,
  lineHeight: 1,
  fontWeight: 400,
  color: '#7a8580',
  whiteSpace: 'nowrap',
}

const legendDotStyle: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: 999,
  flex: '0 0 auto',
}

const calendarCardStyle: CSSProperties = {
  borderRadius: 21,
  border: '1px solid rgba(25, 108, 60, 0.07)',
  background: '#ffffff',
  boxShadow: '0 10px 28px rgba(28, 69, 46, 0.05)',
  padding: '14px 26px 12px',
  boxSizing: 'border-box',
}

const calendarHeaderStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '32px 1fr 32px',
  alignItems: 'center',
  marginBottom: 12,
}

const navButtonStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 30,
  height: 30,
  borderRadius: 999,
  border: 'none',
  background: '#f2f8f2',
  color: '#4d8065',
  cursor: 'pointer',
  padding: 0,
}

const monthTitleStyle: CSSProperties = {
  textAlign: 'center',
  fontSize: 18,
  lineHeight: 1,
  fontWeight: 600,
  color: '#4d8065',
  letterSpacing: 0,
}

const weekdayGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  marginBottom: 7,
}

const weekdayStyle: CSSProperties = {
  height: 27,
  display: 'grid',
  placeItems: 'center',
  color: '#9aa19c',
  fontSize: 13,
  lineHeight: 1,
  fontWeight: 400,
}

const dayGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  rowGap: 5,
  columnGap: 4,
}

const dayButtonStyle: CSSProperties = {
  height: 32,
  width: 33,
  justifySelf: 'center',
  minWidth: 0,
  borderRadius: 11,
  border: 'none',
  background: 'transparent',
  color: '#3c4842',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  fontSize: 15,
  lineHeight: 1,
  padding: 0,
  cursor: 'pointer',
}

const dayDotStyle: CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: 999,
  flex: '0 0 auto',
}
