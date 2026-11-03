"use client";
import { useEffect, useState } from "react";
import { Clock3, DoorOpen } from "lucide-react";
import styles from "./Classroom.module.css";

export function WaitingRoom({ roomId, title }: { roomId: string; title: string }) {
  const [status, setStatus] = useState<"WAITING" | "JOINED" | "ENDED" | "REMOVED">("WAITING");
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/instant-live/rooms/${roomId}/join`, { cache: "no-store" });
        const data = await response.json();
        if (!alive) return;
        if (data.status === "JOINED") { setStatus("JOINED"); window.location.reload(); }
        else if (data.status === "ENDED" || data.status === "REMOVED") setStatus(data.status);
      } catch { /* Retry on the next interval. */ }
    };
    let timer: number | undefined;
    const schedule = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = document.hidden ? undefined : window.setInterval(() => void poll(), 2500);
    };
    const visibility = () => {
      if (!document.hidden) void poll();
      schedule();
    };
    void poll();
    schedule();
    document.addEventListener("visibilitychange", visibility);
    return () => { alive = false; if (timer !== undefined) window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [roomId]);
  const ended = status === "ENDED" || status === "REMOVED";
  return <main className={`${styles.root} live-waiting-page`}><section className="live-waiting-card">
    <span className="live-waiting-icon">{ended ? <DoorOpen size={22}/> : <Clock3 size={22}/>}</span>
    <p className="live-waiting-eyebrow">{ended ? "Access update" : "You’re in the waiting room"}</p>
    <h1>{ended ? (status === "REMOVED" ? "Access was declined" : "This class has ended") : title}</h1>
    <p>{ended ? "You can close this page." : "The teacher will let you in when they’re ready."}</p>
    {!ended ? <span className="live-waiting-pulse"><i/> Waiting for approval</span> : null}
  </section></main>;
}
