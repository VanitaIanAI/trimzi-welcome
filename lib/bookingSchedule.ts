// Four one-off openings. Values are first/last appointment STARTS, not closing times.
export const CHRISTMAS_OPENING_DATES = [
  '2026-12-21', '2026-12-22', '2026-12-28', '2026-12-29',
] as const;

export function isChristmasOpeningDate(dateISO: string): boolean {
  return (CHRISTMAS_OPENING_DATES as readonly string[]).includes(dateISO);
}

export function dayWindow(dateISO: string): { startLabel: string; endLabel: string } | null {
  if (isChristmasOpeningDate(dateISO)) return { startLabel: '11:00', endLabel: '17:15' };
  // Determine the weekday from the calendar date, independent of device/server timezone.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
  const day = new Date(`${dateISO}T12:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== dateISO) return null;
  const dow = day.getUTCDay();
  if (dow === 6) return { startLabel: '09:00', endLabel: '17:15' };
  if (dow >= 3 && dow <= 5) return { startLabel: '09:30', endLabel: '19:15' };
  return null;
}

export function build15MinGrid(dateISO: string): string[] {
  const window = dayWindow(dateISO);
  if (!window) return [];
  const minutes = (label: string) => {
    const [h, m] = label.split(':').map(Number);
    return h * 60 + m;
  };
  const labels: string[] = [];
  for (let m = minutes(window.startLabel); m <= minutes(window.endLabel); m += 15) {
    labels.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return labels;
}

// Enforce ONLY the four exceptions; retain existing validation behaviour for other dates.
export function isChristmasStartAllowed(dateISO: string, startISO: string): boolean {
  const suppliedException = isChristmasOpeningDate(dateISO);
  const start = new Date(startISO);
  if (!Number.isFinite(start.getTime())) return !suppliedException;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(start);
  const part = (type: string) => parts.find(p => p.type === type)?.value || '';
  const londonDate = `${part('year')}-${part('month')}-${part('day')}`;
  if (!suppliedException && !isChristmasOpeningDate(londonDate)) return true;
  const time = `${part('hour')}:${part('minute')}`;
  return suppliedException && londonDate === dateISO &&
    start.getUTCSeconds() === 0 && start.getUTCMilliseconds() === 0 &&
    build15MinGrid(dateISO).includes(time);
}
