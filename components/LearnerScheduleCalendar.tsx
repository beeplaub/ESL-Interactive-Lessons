"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Clock3, Radio } from "lucide-react";
import { addDateKeyDays, dateKeyInScheduleTimeZone, monthKeyForDate, shiftMonthKey, type ScheduleEvent, type ScheduleEventType, SCHEDULE_TIME_ZONE } from "@/lib/schedule";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const filterOptions: Array<{ value: "ALL" | ScheduleEventType; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "ASSIGNMENT", label: "Assignments" },
  { value: "LIVE_CLASS", label: "Live classes" },
  { value: "TASK", label: "Tasks" },
];

function eventTypeLabel(type: ScheduleEventType) {
  if (type === "LIVE_CLASS") return "Live class";
  if (type === "ASSIGNMENT") return "Assignment";
  return "Task";
}

function eventIcon(type: ScheduleEventType) {
  if (type === "LIVE_CLASS") return <Radio size={16} />;
  if (type === "ASSIGNMENT") return <ClipboardList size={16} />;
  return <CalendarDays size={16} />;
}

function eventTone(type: ScheduleEventType) {
  if (type === "LIVE_CLASS") return "bg-[var(--br-brand-soft)] text-[var(--br-brand)]";
  if (type === "ASSIGNMENT") return "bg-[var(--br-action)]/10 text-[var(--br-action-strong)]";
  return "bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] text-[var(--br-chart-secondary)]";
}

function formatMonth(monthKey: string) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: SCHEDULE_TIME_ZONE })
    .format(new Date(`${monthKey}-15T12:00:00+06:00`));
}

function formatSelectedDate(dateKey: string, todayKey: string) {
  if (dateKey === todayKey) return "Today’s Agenda";
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: SCHEDULE_TIME_ZONE })
    .format(new Date(`${dateKey}T12:00:00+06:00`));
}

function formatAgendaDate(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: SCHEDULE_TIME_ZONE })
    .format(new Date(`${dateKey}T12:00:00+06:00`));
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: SCHEDULE_TIME_ZONE })
    .format(new Date(value));
}

export function LearnerScheduleCalendar({
  events,
  todayKey,
  monthKey,
  mode,
}: {
  events: ScheduleEvent[];
  todayKey: string;
  monthKey: string;
  mode: "home" | "page";
}) {
  const initialSelectedDate = mode === "home" || monthKeyForDate(todayKey) === monthKey ? todayKey : `${monthKey}-01`;
  const [selectedDate, setSelectedDate] = useState(mode === "page" ? "ALL_DATES" : initialSelectedDate);
  const [filter, setFilter] = useState<"ALL" | ScheduleEventType>("ALL");
  const [displayMonthKey, setDisplayMonthKey] = useState(monthKey);
  const [, startMonthNavigation] = useTransition();
  const router = useRouter();
  useEffect(() => setDisplayMonthKey(monthKey), [monthKey]);
  const dateEvents = useMemo(() => {
    const byDate = new Map<string, ScheduleEvent[]>();
    for (const event of events) {
      const dateKey = dateKeyInScheduleTimeZone(event.startsAt);
      byDate.set(dateKey, [...(byDate.get(dateKey) ?? []), event]);
    }
    for (const rows of byDate.values()) rows.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    return byDate;
  }, [events]);
  const [year, month] = displayMonthKey.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const offset = (firstDay.getUTCDay() + 6) % 7;
  const firstCell = addDateKeyDays(`${displayMonthKey}-01`, -offset);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const calendarLength = mode === "home" && offset + daysInMonth <= 35 ? 35 : 42;
  const calendarDays = Array.from({ length: calendarLength }, (_, index) => addDateKeyDays(firstCell, index));
  const monthDataReady = mode === "home" || displayMonthKey === monthKey;
  const visibleEvents = useMemo(() => events
    .filter(() => monthDataReady)
    .filter((event) => filter === "ALL" || event.type === filter)
    .filter((event) => selectedDate === "ALL_DATES" || dateKeyInScheduleTimeZone(event.startsAt) === selectedDate)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()), [events, filter, monthDataReady, selectedDate]);
  const visibleDateGroups = useMemo(() => {
    const groups = new Map<string, ScheduleEvent[]>();
    for (const event of visibleEvents) {
      const dateKey = dateKeyInScheduleTimeZone(event.startsAt);
      groups.set(dateKey, [...(groups.get(dateKey) ?? []), event]);
    }
    return [...groups.entries()];
  }, [visibleEvents]);
  const previousMonth = shiftMonthKey(displayMonthKey, -1);
  const nextMonth = shiftMonthKey(displayMonthKey, 1);
  function navigateMonth(targetMonth: string) {
    setDisplayMonthKey(targetMonth);
    setSelectedDate("ALL_DATES");
    startMonthNavigation(() => router.push(`/calendar?month=${targetMonth}`));
  }

  if (mode === "home") {
    return (
      <div className="grid min-w-0 md:grid-cols-[.9fr_1.1fr]">
        <section aria-label="Choose a date" className="min-w-0 p-5 md:border-r md:border-[var(--br-border)] md:p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold text-[var(--br-dark-card)]">My Schedule</h2>
            <Link href="/calendar" className="text-[13px] font-semibold text-[var(--br-chart-primary)] hover:underline">View all</Link>
          </div>
          <div className="grid grid-cols-7 gap-x-1 gap-y-2 text-center text-[10px] font-bold text-[var(--br-chart-primary)]">
            {weekdayLabels.map((label, index) => {
              const selectedWeekday = selectedDate !== "ALL_DATES" && (new Date(`${selectedDate}T00:00:00Z`).getUTCDay() + 6) % 7 === index;
              return <span key={label} className={`py-1 ${selectedWeekday ? "text-[var(--br-action)]" : ""}`}>{label.slice(0, 1)}</span>;
            })}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-x-1 gap-y-2">
            {calendarDays.map((dateKey) => {
              const inMonth = monthKeyForDate(dateKey) === monthKey;
              const isSelected = dateKey === selectedDate;
              const count = dateEvents.get(dateKey)?.length ?? 0;
              return (
                <button
                  key={dateKey}
                  type="button"
                  disabled={!inMonth}
                  onClick={() => setSelectedDate(dateKey)}
                  aria-pressed={isSelected}
                  aria-label={inMonth ? `${new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeZone: SCHEDULE_TIME_ZONE }).format(new Date(`${dateKey}T12:00:00+06:00`))}${count ? `, ${count} events` : ""}` : undefined}
                  className={`relative grid aspect-square w-full place-items-center rounded-lg text-xs font-semibold transition ${!inMonth ? "pointer-events-none text-transparent" : isSelected ? "bg-[var(--br-action)] font-bold text-on-dark" : "text-[var(--br-dark-card)] hover:bg-[var(--br-surface-muted)]"}`}
                >
                  {inMonth ? Number(dateKey.slice(-2)) : ""}
                  {inMonth && count ? <span className={`absolute bottom-1 size-1 rounded-full ${isSelected ? "bg-white" : "bg-[var(--br-action)]"}`} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="min-w-0 border-t border-[var(--br-border)] p-5 md:border-t-0 md:p-6" aria-live="polite">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold text-[var(--br-dark-card)]">Today’s Agenda</h2>
            <Link href="/calendar" className="text-[13px] font-semibold text-[var(--br-chart-primary)] hover:underline">View all</Link>
          </div>
          {visibleEvents.length ? (
            <div className="space-y-2">
              {visibleEvents.map((event) => (
                <Link key={event.id} href={event.href} className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--br-border)] p-3 transition hover:border-[var(--br-brand)]/40 hover:bg-[var(--br-surface-muted)]">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${eventTone(event.type)}`}>{eventIcon(event.type)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-[var(--br-text)]">{event.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-semibold text-[var(--br-text-muted)]">{eventTypeLabel(event.type)}{event.detail ? ` · ${event.detail}` : ""}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--br-brand)]"><Clock3 size={13} />{formatEventTime(event.startsAt)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid min-h-[76px] place-items-center rounded-2xl border border-dashed border-[var(--br-border)] px-4 py-3 text-center text-xs text-[var(--br-text-muted)]">
              <div>Nothing scheduled for today.<Link href="/calendar" className="mt-1 block text-[13px] font-semibold text-[var(--br-chart-primary)] hover:underline">View planner</Link></div>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className={`grid min-w-0 gap-5 ${mode === "page" ? "lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]" : "md:grid-cols-[minmax(250px,0.85fr)_minmax(0,1.15fr)]"}`}>
      <section aria-label="Choose a date" className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          {mode === "page" ? <button type="button" onClick={() => navigateMonth(previousMonth)} aria-label="Previous month" className="grid size-9 place-items-center rounded-xl border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"><ChevronLeft size={17} /></button> : null}
            <h2 className="flex-1 text-center text-sm font-extrabold text-[var(--br-text)]">{formatMonth(displayMonthKey)}</h2>
          {mode === "page" ? <button type="button" onClick={() => navigateMonth(nextMonth)} aria-label="Next month" className="grid size-9 place-items-center rounded-xl border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"><ChevronRight size={17} /></button> : <span className="size-9" aria-hidden="true" />}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-[var(--br-text-muted)]">
          {weekdayLabels.map((label) => <span key={label} className="py-1">{label}</span>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {calendarDays.map((dateKey) => {
            const inMonth = monthKeyForDate(dateKey) === displayMonthKey;
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selectedDate;
            const count = dateEvents.get(dateKey)?.length ?? 0;
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => inMonth && setSelectedDate(dateKey)}
                disabled={!inMonth}
                aria-pressed={isSelected}
                aria-label={`${new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeZone: SCHEDULE_TIME_ZONE }).format(new Date(`${dateKey}T12:00:00+06:00`))}${count ? `, ${count} events` : ""}`}
                className={`relative grid aspect-square min-h-9 place-items-center rounded-xl text-xs font-semibold transition ${isSelected ? "bg-[var(--br-action)] text-on-dark" : isToday ? "border border-[var(--br-action)] text-[var(--br-action-strong)]" : inMonth ? "text-[var(--br-text)] hover:bg-[var(--br-surface-muted)]" : "cursor-default text-[var(--br-text-muted)]/35"}`}
              >
                {Number(dateKey.slice(-2))}
                {count ? <span className={`absolute bottom-1 size-1 rounded-full ${isSelected ? "bg-white" : "bg-[var(--br-action)]"}`} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="min-w-0 border-t border-[var(--br-border)] pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-[var(--br-text)]">{mode === "page" && selectedDate === "ALL_DATES" ? "All events this month" : formatSelectedDate(selectedDate, todayKey)}</h2>
            <p className="mt-0.5 text-xs text-[var(--br-text-muted)]">{visibleEvents.length} {visibleEvents.length === 1 ? "item" : "items"}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" aria-label="Filter calendar events">
            <button type="button" onClick={() => setSelectedDate("ALL_DATES")} aria-pressed={selectedDate === "ALL_DATES"} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${selectedDate === "ALL_DATES" ? "border-[var(--br-chart-primary)] bg-[var(--br-chart-primary)] text-on-dark" : "border-[var(--br-border)] bg-[var(--br-surface)] text-[var(--br-text-muted)] hover:border-[var(--br-chart-primary)]"}`}>
              All dates
            </button>
            {filterOptions.map((option) => (
              <button key={option.value} type="button" onClick={() => setFilter(option.value)} aria-pressed={filter === option.value} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${filter === option.value ? "border-[var(--br-brand)] bg-[var(--br-brand)] text-on-dark" : "border-[var(--br-border)] bg-[var(--br-surface)] text-[var(--br-text-muted)] hover:border-[var(--br-brand)]"}`}>
                {option.label}
              </button>
            ))}
        </div>

        <div className="mt-4 max-h-[34rem] space-y-4 overflow-y-auto pr-1">
          {(mode === "page" && selectedDate === "ALL_DATES" ? visibleDateGroups : [[selectedDate, visibleEvents] as [string, ScheduleEvent[]]]).map(([dateKey, rows]) => (
            <div key={dateKey} className="space-y-2">
              {mode === "page" && selectedDate === "ALL_DATES" ? <h3 className="sticky top-0 z-10 bg-[var(--br-surface)] py-1 text-xs font-extrabold text-[var(--br-text-muted)]">{formatAgendaDate(dateKey)}</h3> : null}
              {rows.map((event) => (
                <Link key={event.id} href={event.href} className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--br-border)] p-3 transition hover:border-[var(--br-brand)]/40 hover:bg-[var(--br-surface-muted)]">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${eventTone(event.type)}`}>{eventIcon(event.type)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-[var(--br-text)]">{event.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] font-semibold text-[var(--br-text-muted)]">
                      <span>{eventTypeLabel(event.type)}</span>
                      {event.detail ? <span>· {event.detail}</span> : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--br-brand)]"><Clock3 size={13} />{formatEventTime(event.startsAt)}</span>
                </Link>
              ))}
            </div>
          ))}
          {!visibleEvents.length ? <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--br-border)] px-4 text-center text-sm text-[var(--br-text-muted)]">{!monthDataReady ? "Loading this month…" : selectedDate === "ALL_DATES" ? "Nothing scheduled this month." : "Nothing scheduled for this day."}</div> : null}
        </div>
      </section>
    </div>
  );
}
