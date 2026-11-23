export const SCHEDULE_TIME_ZONE = "Asia/Dhaka";

export type ScheduleEventType = "ASSIGNMENT" | "LIVE_CLASS" | "TASK";

export type ScheduleEvent = {
  id: string;
  title: string;
  startsAt: string;
  type: ScheduleEventType;
  href: string;
  detail?: string | null;
};

export function dateKeyInScheduleTimeZone(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHEDULE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDateKeyDays(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

export function monthKeyForDate(dateKey: string) {
  return dateKey.slice(0, 7);
}

export function monthCalendarRange(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (firstOfMonth.getUTCDay() + 6) % 7;
  const startDate = new Date(Date.UTC(year, month - 1, 1 - mondayOffset));
  const startDateKey = startDate.toISOString().slice(0, 10);
  const endDateKey = addDateKeyDays(startDateKey, 42);
  return {
    startDateKey,
    endDateKey,
    startAt: `${startDateKey}T00:00:00+06:00`,
    endAt: `${endDateKey}T00:00:00+06:00`,
  };
}

export function shiftMonthKey(monthKey: string, amount: number) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + amount, 1)).toISOString().slice(0, 7);
}
