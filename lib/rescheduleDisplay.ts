// Display only. API values and stored appointment times remain unchanged.
export function formatRescheduleTime(time: string): string {
  return /^\d{2}:\d{2}$/.test(time) && Number(time.slice(0, 2)) < 12 ? `${time} am` : time;
}

export function formatRescheduleDateTime(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
  const time = date.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return `${day}, ${formatRescheduleTime(time)}`;
}
