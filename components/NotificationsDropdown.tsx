"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Mail, MailOpen, Trash2 } from "lucide-react";
import type { NotificationItem } from "./LearnerAppShell";
import { deleteNotification, markAllNotificationsRead, markNotificationRead, markNotificationUnread } from "@/app/notifications/actions";

type Props = {
  initialNotifications: NotificationItem[];
  mode: "desktop" | "mobile";
};

const tones = {
  purple: "bg-[var(--br-chart-primary)]",
  orange: "bg-[var(--br-action-strong)]",
  green: "bg-[var(--br-success)]",
  blue: "bg-[var(--br-info)]",
};

export function NotificationsDropdown({ initialNotifications, mode }: Props) {
  const [readKeys, setReadKeys] = useState<string[]>([]);
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [unreadNotificationIds, setUnreadNotificationIds] = useState<string[]>([]);
  const [deletedNotificationIds, setDeletedNotificationIds] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("brenup_read_notifications");
      if (stored) setReadKeys(JSON.parse(stored));
      const dismissed = localStorage.getItem("brenup_dismissed_notifications");
      if (dismissed) setDismissedKeys(JSON.parse(dismissed));
    } catch (error) {
      console.error("Failed to load read notifications:", error);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        detailsRef.current.open = false;
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [isOpen]);

  const isRead = (item: NotificationItem) => {
    if (!item.notificationId) return readKeys.includes(item.key);
    if (unreadNotificationIds.includes(item.notificationId)) return false;
    return Boolean(item.isRead || readNotificationIds.includes(item.notificationId));
  };
  const visibleNotifications = initialNotifications.filter((item) => item.notificationId ? !deletedNotificationIds.includes(item.notificationId) : !dismissedKeys.includes(item.key));
  const unreadCount = visibleNotifications.filter((item) => !isRead(item)).length;
  const persistentUnreadIds = visibleNotifications.filter((item) => item.notificationId && !isRead(item)).map((item) => item.notificationId!);

  const markRead = (item: NotificationItem) => {
    if (isRead(item)) return;
    if (!item.notificationId) {
      const updated = [...readKeys, item.key];
      setReadKeys(updated);
      try { localStorage.setItem("brenup_read_notifications", JSON.stringify(updated)); } catch { /* local preference only */ }
      return;
    }
    setReadNotificationIds((current) => [...current, item.notificationId!]);
    setUnreadNotificationIds((current) => current.filter((id) => id !== item.notificationId));
    void markNotificationRead(item.notificationId).catch((error) => {
      console.error("Failed to mark notification as read:", error);
      setReadNotificationIds((current) => current.filter((id) => id !== item.notificationId));
    });
  };

  const toggleRead = (item: NotificationItem) => {
    if (!item.notificationId) {
      if (isRead(item)) {
        const updated = readKeys.filter((key) => key !== item.key);
        setReadKeys(updated);
        try { localStorage.setItem("brenup_read_notifications", JSON.stringify(updated)); } catch { /* local preference only */ }
      } else {
        markRead(item);
      }
      return;
    }
    if (!isRead(item)) return markRead(item);
    setUnreadNotificationIds((current) => [...current, item.notificationId!]);
    setReadNotificationIds((current) => current.filter((id) => id !== item.notificationId));
    void markNotificationUnread(item.notificationId).catch((error) => {
      console.error("Failed to mark notification as unread:", error);
      setUnreadNotificationIds((current) => current.filter((id) => id !== item.notificationId));
    });
  };

  const remove = (item: NotificationItem) => {
    if (!item.notificationId) {
      const updated = [...dismissedKeys, item.key];
      setDismissedKeys(updated);
      try { localStorage.setItem("brenup_dismissed_notifications", JSON.stringify(updated)); } catch { /* local preference only */ }
      return;
    }
    setDeletedNotificationIds((current) => [...current, item.notificationId!]);
    void deleteNotification(item.notificationId).catch((error) => {
      console.error("Failed to delete notification:", error);
      setDeletedNotificationIds((current) => current.filter((id) => id !== item.notificationId));
    });
  };

  const markAllRead = () => {
    if (!unreadCount || isMarkingAll) return;
    setIsMarkingAll(true);
    const derivedUnreadKeys = visibleNotifications.filter((item) => !item.notificationId && !isRead(item)).map((item) => item.key);
    if (derivedUnreadKeys.length) {
      const updated = [...new Set([...readKeys, ...derivedUnreadKeys])];
      setReadKeys(updated);
      try { localStorage.setItem("brenup_read_notifications", JSON.stringify(updated)); } catch { /* local preference only */ }
    }
    if (!persistentUnreadIds.length) {
      setIsMarkingAll(false);
      return;
    }
    setReadNotificationIds((current) => [...new Set([...current, ...persistentUnreadIds])]);
    setUnreadNotificationIds((current) => current.filter((id) => !persistentUnreadIds.includes(id)));
    void markAllNotificationsRead().catch((error) => {
      console.error("Failed to mark notifications as read:", error);
      setReadNotificationIds((current) => current.filter((id) => !persistentUnreadIds.includes(id)));
    }).finally(() => setIsMarkingAll(false));
  };

  const panelClass = mode === "desktop"
    ? "absolute right-0 top-14 z-40 w-[360px] overflow-hidden rounded-[22px] border border-[var(--br-surface-strong)] bg-surface shadow-[var(--br-shadow)]"
    : "fixed inset-x-3 top-[68px] z-50 max-h-[70vh] overflow-y-auto rounded-[22px] border border-[var(--br-surface-strong)] bg-surface shadow-2xl shadow-black/20";
  const summaryClass = mode === "desktop"
    ? "relative grid size-11 cursor-pointer list-none place-items-center rounded-[14px] border border-[var(--br-surface-strong)] bg-surface shadow-[var(--br-shadow)] marker:hidden [&::-webkit-details-marker]:hidden"
    : "relative grid size-9 cursor-pointer list-none place-items-center rounded-[10px] text-on-dark marker:hidden [&::-webkit-details-marker]:hidden";

  return (
    <details data-exclusive-popup ref={detailsRef} onToggle={(event) => setIsOpen(event.currentTarget.open)} className="group relative">
      <summary className={summaryClass} aria-label="Notifications">
        <Bell className={mode === "desktop" ? "size-[18px] text-[var(--br-text-muted)]" : "size-5"} />
        {unreadCount > 0 ? <span className={mode === "desktop" ? "absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-[var(--br-canvas-elevated)] bg-[var(--br-danger)] text-[10px] font-black text-on-dark" : "absolute right-0.5 top-0.5 grid size-3.5 place-items-center rounded-full border border-[var(--br-dark-card)] bg-[var(--br-danger)] text-[8px] font-bold"}>{unreadCount}</span> : null}
      </summary>
      <div className={panelClass}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--br-surface-strong)] px-4 py-3"><div><p className="text-sm font-black text-[var(--br-dark-card)]">Notifications</p><p className="text-xs font-semibold text-[var(--br-text-muted)]">Latest learning and platform updates</p></div>{unreadCount ? <button type="button" disabled={isMarkingAll} onClick={markAllRead} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-extrabold text-[var(--br-chart-primary)] hover:underline disabled:opacity-50"><CheckCheck className="size-3.5" /> Mark all read</button> : null}</div>
        <div className="max-h-[360px] overflow-y-auto p-2">
          {visibleNotifications.length ? visibleNotifications.map((item, index) => <NotificationRow key={`${item.key}-${index}`} item={item} read={isRead(item)} onOpen={() => markRead(item)} onToggleRead={() => toggleRead(item)} onDelete={() => remove(item)} />) : <p className="rounded-2xl bg-[var(--br-canvas-elevated)] px-4 py-6 text-center text-sm font-semibold text-[var(--br-text-muted)]">No notifications yet.</p>}
        </div>
        <Link href="/notifications" className="flex items-center justify-center border-t border-[var(--br-surface-strong)] px-4 py-3 text-xs font-extrabold text-[var(--br-chart-primary)] hover:bg-[var(--br-canvas-elevated)]">View all notifications</Link>
      </div>
    </details>
  );
}

function NotificationRow({ item, read, onOpen, onToggleRead, onDelete }: { item: NotificationItem; read: boolean; onOpen: () => void; onToggleRead: () => void; onDelete: () => void }) {
  return (
    <div className={`flex gap-2 rounded-2xl px-3 py-3 transition hover:bg-[var(--br-canvas-elevated)] ${read ? "opacity-65" : ""}`}>
      <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${tones[item.tone]}`} />
      <Link href={item.href} onClick={onOpen} className="min-w-0 flex-1"><span className={`block truncate text-sm ${read ? "font-semibold text-[var(--br-text-muted)]" : "font-extrabold text-[var(--br-dark-card)]"}`}>{item.title}</span><span className="mt-1 block text-[11px] font-semibold text-[var(--br-text-muted)]">Open in inbox</span></Link>
      <div className="flex shrink-0 flex-col gap-1"><button type="button" onClick={onToggleRead} title={read ? "Mark as unread" : "Mark as read"} className="grid size-7 place-items-center rounded-lg text-[var(--br-text-muted)] hover:bg-surface hover:text-[var(--br-chart-primary)]">{read ? <Mail className="size-3.5" /> : <MailOpen className="size-3.5" />}</button><button type="button" onClick={onDelete} title="Delete notification" className="grid size-7 place-items-center rounded-lg text-[var(--br-text-muted)] hover:bg-surface hover:text-[var(--br-danger)]"><Trash2 className="size-3.5" /></button></div>
    </div>
  );
}
