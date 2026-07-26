"use client";

import { Hand, MessageCircle, Send, Trash2, UsersRound, Vote } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LiveVoiceNotes } from "@/components/LiveVoiceNotes";

type LiveGroup = { id: string; name: string; status: string; memberIds: string[] };
type LiveData = {
  messages: Array<{ id: string; sender_id: string; sender_name: string; channel: string; group_id?: string | null; body: string; created_at: string }>;
  hands: Array<{ id: string; user_id: string; user_name: string; kind: string }>;
  polls: Array<{ id: string; question: string; poll_type: string; options: unknown; status: string }>;
  ownAnswers: Array<{ poll_id: string; answer: unknown }>;
  groups: LiveGroup[];
  ownGroupId: string | null;
  teacher: boolean;
};

export function LiveClassTools({ sessionId, teacher: initialTeacher = false }: { sessionId: string; teacher?: boolean }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("EVERYONE");
  const [error, setError] = useState<string | null>(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollType, setPollType] = useState("MCQ");
  const [pollOptions, setPollOptions] = useState("Yes\nNo");
  const refreshing = useRef(false);
  const teacher = data?.teacher ?? initialTeacher;
  const ownGroup = data?.groups.find((group) => group.id === data.ownGroupId) ?? null;

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const response = await fetch(`/api/live/${sessionId}/interactions`, { cache: "no-store" });
      if (response.ok) setData(await response.json());
    } finally {
      refreshing.current = false;
    }
  }, [sessionId]);

  async function act(payload: Record<string, unknown>) {
    setError(null);
    const response = await fetch(`/api/live/${sessionId}/interactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Could not update the class.");
    else await refresh();
  }

  useEffect(() => {
    void refresh();
    const supabase = createClient();
    const realtime = supabase.channel(`brenup-live-tools:${sessionId}`).on("broadcast", { event: "refresh" }, refresh).subscribe();
    const interval = window.setInterval(refresh, 3500);
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(realtime);
    };
  }, [refresh, sessionId]);

  function announce(payload: Record<string, unknown>) {
    void act(payload).then(() => {
      const supabase = createClient();
      void supabase.channel(`brenup-live-tools:${sessionId}`).send({ type: "broadcast", event: "refresh", payload: {} });
    });
  }

  const activePoll = data?.polls.find((poll) => poll.status === "OPEN") ?? null;
  const groupMessages = channel === "GROUP" ? data?.messages.filter((item) => item.channel === "GROUP") : data?.messages;

  return <aside className="space-y-3">
    <section className="rounded-xl border border-black/10 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5"><MessageCircle size={16} className="text-violetglow" /><h2 className="text-sm font-extrabold">Class chat</h2></div>
        <select value={channel} onChange={(event) => setChannel(event.target.value)} className="rounded-md border border-black/10 bg-white px-1.5 py-1 text-[10px] font-bold text-black/55">
          <option value="EVERYONE">Everyone</option><option value="TEACHER">Teacher</option>
          {ownGroup ? <option value="GROUP">{ownGroup.name}</option> : null}
        </select>
      </div>
      {ownGroup ? <p className="mt-2 rounded-md bg-[#F8F6FF] px-2 py-1 text-[10px] font-bold text-violetglow">You are in {ownGroup.name} · {ownGroup.memberIds.length} members</p> : null}
      <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
        {groupMessages?.length ? groupMessages.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-2"><div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-extrabold text-violetglow">{item.sender_name}{item.channel === "TEACHER" ? " · private" : item.channel === "GROUP" ? " · group" : ""}</p><p className="mt-0.5 text-xs text-black/70">{item.body}</p></div>{teacher ? <button type="button" onClick={() => { if (window.confirm("Remove this message from the class?")) announce({ action: "moderateMessage", messageId: item.id }); }} className="shrink-0 rounded p-1 text-black/35 hover:bg-red-50 hover:text-[#D9324A]" aria-label="Remove message"><Trash2 size={13} /></button> : null}</div></div>) : <p className="py-4 text-center text-xs text-black/45">{channel === "GROUP" ? "Your group chat is ready." : "Class chat will appear here."}</p>}
      </div>
      <div className="mt-3 flex gap-1"><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && message.trim()) { event.preventDefault(); announce({ action: "message", body: message, channel }); setMessage(""); } }} placeholder={channel === "GROUP" ? "Message your group..." : "Write a message..."} className="min-w-0 flex-1 rounded-md border border-black/10 px-2 py-1.5 text-xs" /><button type="button" onClick={() => { if (message.trim()) { announce({ action: "message", body: message, channel }); setMessage(""); } }} className="grid size-8 place-items-center rounded-md bg-violetglow text-white" aria-label="Send message"><Send size={14} /></button></div>
    </section>

    {teacher ? <section className="rounded-xl border border-black/10 bg-white p-3 shadow-sm"><div className="flex items-center gap-1.5"><UsersRound size={16} className="text-violetglow" /><h2 className="text-sm font-extrabold">Group work</h2></div><p className="mt-1 text-xs text-black/50">Create balanced temporary groups for this live class.</p><div className="mt-3 grid grid-cols-3 gap-1.5">{[2, 3, 4].map((count) => <button key={count} type="button" onClick={() => announce({ action: "createGroups", count })} className="rounded-md border border-violetglow/20 bg-[#F8F6FF] px-2 py-2 text-xs font-bold text-violetglow">{count} groups</button>)}</div>{data?.groups.length ? <div className="mt-3 space-y-1">{data.groups.map((group) => <div key={group.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs"><span className="min-w-0 flex-1"><b>{group.name}</b> · {group.memberIds.length} learners</span><button type="button" onClick={() => announce({ action: "groupState", groupId: group.id, status: group.status === "OPEN" ? "CLOSED" : "OPEN" })} className="shrink-0 font-bold text-violetglow">{group.status === "OPEN" ? "Close" : "Open"}</button></div>)}</div> : null}</section> : null}

    <section className="rounded-xl border border-black/10 bg-white p-3 shadow-sm"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5"><Hand size={16} className="text-violetglow" /><h2 className="text-sm font-extrabold">Class signals</h2></div><span className="text-[10px] font-bold text-black/45">{data?.hands.length ?? 0} active</span></div>{teacher ? <div className="mt-2 space-y-1">{data?.hands.length ? data.hands.map((hand) => <button key={hand.id} type="button" onClick={() => announce({ action: "resolveHand", handId: hand.id })} className="flex w-full items-center justify-between rounded-md bg-amber-50 px-2 py-1.5 text-left text-xs"><span>{hand.kind === "HELP" ? "Needs help" : "Hand raised"} · <b>{hand.user_name}</b></span><span className="font-bold text-violetglow">Resolve</span></button>) : <p className="py-2 text-xs text-black/45">No raised hands.</p>}</div> : <div className="mt-3 flex gap-2"><button type="button" onClick={() => announce({ action: "hand", kind: "HAND" })} className="flex-1 rounded-md bg-[#EEEAFB] px-2 py-2 text-xs font-bold text-violetglow">Raise hand</button><button type="button" onClick={() => announce({ action: "hand", kind: "HELP" })} className="flex-1 rounded-md bg-amber-50 px-2 py-2 text-xs font-bold text-amber-700">Need help</button></div>}</section>

    {teacher ? <section className="rounded-xl border border-black/10 bg-white p-3 shadow-sm"><div className="flex items-center gap-1.5"><Vote size={16} className="text-violetglow" /><h2 className="text-sm font-extrabold">Quick poll</h2></div><input value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Ask the class..." className="mt-3 w-full rounded-md border border-black/10 px-2 py-1.5 text-xs" /><div className="mt-2 flex gap-2"><select value={pollType} onChange={(event) => setPollType(event.target.value)} className="min-w-0 flex-1 rounded-md border border-black/10 px-2 py-1.5 text-xs"><option value="MCQ">Multiple choice</option><option value="TRUE_FALSE">True / False</option><option value="WORD_CLOUD">Word cloud</option><option value="EMOJI">Emoji</option><option value="RATING">Rating</option></select><button type="button" onClick={() => { if (pollQuestion.trim()) { announce({ action: "createPoll", question: pollQuestion, pollType, options: pollOptions }); setPollQuestion(""); } }} className="rounded-md bg-violetglow px-2.5 text-xs font-bold text-white">Open</button></div>{pollType === "MCQ" ? <textarea value={pollOptions} onChange={(event) => setPollOptions(event.target.value)} rows={2} placeholder="One option per line" className="mt-2 w-full rounded-md border border-black/10 px-2 py-1.5 text-xs" /> : null}</section> : null}

    {activePoll ? <section className="rounded-xl border border-violetglow/20 bg-violetglow/5 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-violetglow">Live poll</p><h2 className="mt-1 text-sm font-extrabold">{activePoll.question}</h2><div className="mt-3 grid gap-1.5">{activePoll.poll_type === "MCQ" ? (Array.isArray(activePoll.options) ? activePoll.options : []).map((option) => <button key={String(option)} type="button" onClick={() => announce({ action: "answerPoll", pollId: activePoll.id, answer: option })} className="rounded-md border border-violetglow/20 bg-white px-2 py-2 text-left text-xs font-semibold hover:bg-[#EEEAFB]">{String(option)}</button>) : <input onKeyDown={(event) => { if (event.key === "Enter") announce({ action: "answerPoll", pollId: activePoll.id, answer: (event.target as HTMLInputElement).value }); }} placeholder="Your answer..." className="rounded-md border border-violetglow/20 bg-white px-2 py-2 text-xs" />}</div></section> : null}
    <LiveVoiceNotes sessionId={sessionId} teacher={teacher} />
    {error ? <p className="rounded-md bg-red-50 p-2 text-xs font-semibold text-red-600">{error}</p> : null}
  </aside>;
}
