"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import type { NotificationItem } from "./LearnerAppShell";
import { markNotificationRead } from "@/app/notifications/actions";

type Props = {
  initialNotifications: NotificationItem[];
  mode: "desktop" | "mobile";
};

export function NotificationsDropdown({ initialNotifications, mode }: Props) {
  const [readKeys, setReadKeys] = useState<string[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Load read keys from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("brenup_read_notifications");
      if (stored) {
        setReadKeys(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load read notifications:", e);
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (detailsRef.current) {
          detailsRef.current.open = false;
        }
      }
    };

    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [isOpen]);

  const handleToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    setIsOpen(e.currentTarget.open);
  };

  const handleRead = (item: NotificationItem) => {
    if (item.notificationId) {
      if (item.isRead || readNotificationIds.includes(item.notificationId)) return;
      setReadNotificationIds((current) => [...current, item.notificationId!]);
      void markNotificationRead(item.notificationId).catch((error) => {
        console.error("Failed to mark notification as read:", error);
        setReadNotificationIds((current) => current.filter((id) => id !== item.notificationId));
      });
      return;
    }
    const key = item.key;
    if (readKeys.includes(key)) return;
    const updated = [...readKeys, key];
    setReadKeys(updated);
    try {
      localStorage.setItem("brenup_read_notifications", JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save read notifications:", e);
    }
  };

  const unreadCount = initialNotifications.filter((item) => item.notificationId ? !item.isRead && !readNotificationIds.includes(item.notificationId) : !readKeys.includes(item.key)).length;

  const tones = {
    purple: "bg-[#6C3BFF]",
    orange: "bg-[#FF8C00]",
    green: "bg-[#00C98D]",
    blue: "bg-[#4E8DFF]",
  };

  if (mode === "desktop") {
    return (
      <details ref={detailsRef} onToggle={handleToggle} className="group relative">
        <summary
          className="relative grid size-11 cursor-pointer list-none place-items-center rounded-[14px] border border-[#ECECF5] bg-white shadow-[0_2px_8px_rgba(0,0,0,.04)] marker:hidden [&::-webkit-details-marker]:hidden"
          aria-label="Notifications"
        >
          <Bell className="size-[18px] text-[#6E738D]" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-[#F6F7FB] bg-[#FF5D73] text-[10px] font-black text-white">
              {unreadCount}
            </span>
          ) : null}
        </summary>
        <div className="absolute right-0 top-14 z-40 w-[360px] overflow-hidden rounded-[22px] border border-[#ECECF5] bg-white shadow-[0_24px_60px_rgba(20,23,43,.18)]">
          <div className="border-b border-[#ECECF5] px-4 py-3">
            <p className="text-sm font-black text-[#14172B]">Notifications</p>
            <p className="text-xs font-semibold text-[#6E738D]">Latest learning and platform updates</p>
          </div>
          <div className="max-h-[360px] overflow-y-auto p-2">
            {initialNotifications.length ? (
              initialNotifications.map((item, index) => {
                const isRead = item.notificationId ? Boolean(item.isRead || readNotificationIds.includes(item.notificationId)) : readKeys.includes(item.key);
                return (
                  <Link
                    key={`${item.key}-${index}`}
                    href={item.href}
                    onClick={() => handleRead(item)}
                    className={`flex gap-3 rounded-2xl px-3 py-3 transition hover:bg-[#F6F7FB] ${
                      isRead ? "opacity-65" : ""
                    }`}
                  >
                    <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${tones[item.tone]}`} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm transition-all ${
                          isRead ? "font-semibold text-[#6E738D]" : "font-extrabold text-[#14172B]"
                        }`}
                      >
                        {item.title}
                      </span>
                      <span
                        className={`mt-0.5 block line-clamp-2 text-xs leading-5 transition-all ${
                          isRead ? "font-normal text-[#A0A5BA]" : "font-semibold text-[#6E738D]"
                        }`}
                      >
                        {item.detail}
                      </span>
                    </span>
                  </Link>
                );
              })
            ) : (
              <p className="rounded-2xl bg-[#F6F7FB] px-4 py-6 text-center text-sm font-semibold text-[#6E738D]">
                No notifications yet.
              </p>
            )}
          </div>
        </div>
      </details>
    );
  }

  // Mobile mode
  return (
    <details ref={detailsRef} onToggle={handleToggle} className="group relative">
      <summary
        className="relative grid size-9 cursor-pointer list-none place-items-center rounded-[10px] text-white marker:hidden [&::-webkit-details-marker]:hidden"
        aria-label="Notifications"
      >
        <Bell className="size-5" />
        {unreadCount > 0 ? (
          <span className="absolute right-0.5 top-0.5 grid size-3.5 place-items-center rounded-full border border-[#09112C] bg-[#FF5D73] text-[8px] font-bold">
            {unreadCount}
          </span>
        ) : null}
      </summary>
      <div className="fixed inset-x-3 top-[68px] z-50 max-h-[70vh] overflow-y-auto rounded-[22px] border border-[#ECECF5] bg-white shadow-2xl shadow-black/20">
        <div className="border-b border-[#ECECF5] px-4 py-3">
          <p className="text-sm font-black text-[#14172B]">Notifications</p>
          <p className="text-xs font-semibold text-[#6E738D]">Latest learning and platform updates</p>
        </div>
        <div className="p-2">
          {initialNotifications.length ? (
            initialNotifications.map((item, index) => {
              const isRead = item.notificationId ? Boolean(item.isRead || readNotificationIds.includes(item.notificationId)) : readKeys.includes(item.key);
              return (
                <Link
                  key={`${item.key}-${index}`}
                  href={item.href}
                  onClick={() => handleRead(item)}
                  className={`flex gap-3 rounded-2xl px-3 py-3 transition hover:bg-[#F6F7FB] ${
                    isRead ? "opacity-65" : ""
                  }`}
                >
                  <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${tones[item.tone]}`} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm transition-all ${
                        isRead ? "font-semibold text-[#6E738D]" : "font-extrabold text-[#14172B]"
                      }`}
                    >
                      {item.title}
                    </span>
                    <span
                      className={`mt-0.5 block line-clamp-2 text-xs leading-5 transition-all ${
                        isRead ? "font-normal text-[#A0A5BA]" : "font-semibold text-[#6E738D]"
                      }`}
                    >
                      {item.detail}
                    </span>
                  </span>
                </Link>
              );
            })
          ) : (
            <p className="rounded-2xl bg-[#F6F7FB] px-4 py-6 text-center text-sm font-semibold text-[#6E738D]">
              No notifications yet.
            </p>
          )}
        </div>
      </div>
    </details>
  );
}
