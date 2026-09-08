"use client";

import { Hand, MessageCircle, Send, Trash2, UsersRound, Vote } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LiveVoiceNotes } from "@/components/LiveVoiceNotes";
import { liveJson, notifyLiveRoom, useLiveRefresh } from "@/lib/liveSync";
import { pollChoices } from "@/lib/livePolls";

type LiveGroup = { id: string; name: string; status: string; memberIds: string[] };
type LiveData = {
  userId: string;
  status: string;
  messages: Array<{ id: string; sender_id: string; sender_name: string; channel: string; group_id?: string | null; body: string; created_at: string }>;
  hands: Array<{ id: string; user_id: string; user_name: string; kind: string }>;
  polls: Array<{ id: string; question: string; poll_type: string; options: unknown; status: string }>;
  ownAnswers: Array<{ poll_id: string; answer: unknown }>;
  pollResults: Record<string, { total: number; choices: Array<{ label: string; count: number }> }>;
  groups: LiveGroup[];
  ownGroupId: string | null;
  teacher: boolean;
};
const card = "rounded-xl border border-[var(--br-border)] bg-surface p-3 shadow-sm";
const button = "min-h-10 rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-xs font-bold disabled:opacity-50";
const input = "min-h-10 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-sm";

export function LiveClassTools({ sessionId, teacher: initialTeacher = false, live = true }: { sessionId: string; teacher?: boolean; live?: boolean }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("EVERYONE");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollType, setPollType] = useState("MCQ");
  const [pollOptions, setPollOptions] = useState("Yes\nNo");
  const [answerDraft, setAnswerDraft] = useState("");
  const teacher = data?.teacher ?? initialTeacher;
  const active = live && (!data || data.status === "LIVE");
  const ownGroup = data?.groups.find((group) => group.id === data.ownGroupId) ?? null;
  const selectedGroup = channel.startsWith("GROUP:") ? data?.groups.find((group) => group.id === channel.slice(6)) ?? null : ownGroup;
  const groupChannel = channel === "GROUP" || channel.startsWith("GROUP:");
  const refresh = useCallback(async (signal: AbortSignal) => {
    const next = await liveJson<LiveData>(`/api/live/${sessionId}/interactions`, signal);
    if (!signal.aborted) setData(next);
  }, [sessionId]);
  const sync = useLiveRefresh(sessionId, "interactions", refresh, active);

  useEffect(() => { if (channel === "GROUP" && !ownGroup) setChannel("EVERYONE"); }, [channel, ownGroup]);

  async function act(payload: Record<string, unknown>) {
    if (busyRef.current || !active) return false;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/live/${sessionId}/interactions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not update the class.");
      notifyLiveRoom(sessionId, "interactions");
      if (["createGroups", "resetGroups", "groupState"].includes(String(payload.action))) notifyLiveRoom(sessionId, "voice");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connection lost. Your draft is still here; please retry.");
      return false;
    } finally { busyRef.current = false; setBusy(false); }
  }

  async function sendMessage() {
    const draft = message;
    if (draft.trim() && await act({ action: "message", body: draft, channel: groupChannel ? "GROUP" : channel, groupId: selectedGroup?.id, recipientId: replyTo?.id })) setMessage((current) => current === draft ? "" : current);
  }
  const activePoll = data?.polls.find((poll) => poll.status === "OPEN") ?? null;
  const shownPoll = activePoll ?? data?.polls[0];
  const choices = shownPoll ? pollChoices(shownPoll.poll_type, shownPoll.options) : [];
  const ownAnswer = data?.ownAnswers.find((answer) => answer.poll_id === shownPoll?.id);
  const results = shownPoll ? data?.pollResults[shownPoll.id] : null;
  const ownHand = data?.hands.some((hand) => hand.user_id === data.userId);
  const groupMessages = data?.messages.filter((item) => groupChannel ? item.channel === "GROUP" && item.group_id === selectedGroup?.id : channel === "TEACHER" ? item.channel === "TEACHER" || item.channel === "PRIVATE" : item.channel === "EVERYONE");

  return <aside className="space-y-3" aria-label="Classroom interaction tools">
    <div className="flex items-center justify-between gap-2 text-xs text-[var(--br-text-muted)]"><span role="status">{sync.status}</span><button type="button" onClick={sync.retry} className="min-h-9 px-2 font-bold text-[var(--br-brand)]">Refresh</button></div>
    {!active ? <p className="rounded-lg bg-[var(--br-surface-muted)] p-3 text-sm">Saved class activity · interaction opens when the class is live.</p> : null}
    {error ? <p role="alert" className="rounded-lg bg-[var(--br-surface-muted)] p-3 text-sm text-[var(--br-danger)]">{error}</p> : null}

    <section className={card}>
      <div className="flex items-center gap-2"><Hand size={16} /><h2 className="text-sm font-extrabold">Speaking queue & help</h2></div>
      {teacher ? <ol className="mt-2 space-y-2">{data?.hands.length ? data.hands.map((hand, index) => <li key={hand.id} className="flex items-center gap-2 rounded-lg bg-[var(--br-surface-muted)] p-2 text-xs"><span className="flex-1"><b>{index + 1}. {hand.user_name}</b><br />{hand.kind === "HELP" ? "Needs help" : "Ready to speak"}</span><button type="button" disabled={busy || !active} onClick={() => void act({ action: "resolveHand", handId: hand.id })} className={button}>Done</button></li>) : <li className="py-2 text-xs text-[var(--br-text-muted)]">No raised hands.</li>}</ol> : <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy || !active || ownHand} onClick={() => void act({ action: "hand", kind: "HAND" })} className={button}>{ownHand ? "You are in the queue" : "Raise hand"}</button><button type="button" disabled={busy || !active} onClick={() => void act({ action: "hand", kind: "HELP" })} className={button}>Need help</button>{ownHand ? <button type="button" disabled={busy || !active} onClick={() => void act({ action: "lowerHand" })} className={button}>Lower hand</button> : null}</div>}
    </section>

    {shownPoll ? <section className={card} aria-label="Class poll">
      <div className="flex items-center gap-2"><Vote size={16} /><p className="text-xs font-bold">{shownPoll.status === "OPEN" ? "Live poll" : shownPoll.status === "REVEALED" ? "Poll results" : "Poll closed"}</p></div>
      <h2 className="mt-2 text-sm font-extrabold">{shownPoll.question}</h2>
      {!teacher && shownPoll.status === "OPEN" ? <div className="mt-3 grid gap-2">
        {choices.length ? choices.map((choice) => <button key={choice} type="button" aria-pressed={String(ownAnswer?.answer) === choice} disabled={busy || !active} onClick={() => void act({ action: "answerPoll", pollId: shownPoll.id, answer: choice })} className={`${button} text-left ${String(ownAnswer?.answer) === choice ? "border-[var(--br-brand)] bg-[var(--br-surface-muted)] text-[var(--br-brand)]" : ""}`}>{choice}</button>) : <form onSubmit={(event) => { event.preventDefault(); void act({ action: "answerPoll", pollId: shownPoll.id, answer: answerDraft }); }}><input aria-label="Your poll answer" maxLength={80} value={answerDraft} onChange={(event) => setAnswerDraft(event.target.value)} className={input} placeholder="A word or short phrase" /><button disabled={busy || !active || !answerDraft.trim()} className={`${button} mt-2`}>Submit answer</button></form>}
      </div> : null}
      {ownAnswer ? <p role="status" className="mt-2 text-xs font-bold text-[var(--br-success)]">Answer saved: {String(ownAnswer.answer)}{shownPoll.status === "OPEN" ? ". You can change it until the poll closes." : ""}</p> : null}
      {results ? <div className="mt-3 space-y-2"><p className="text-xs font-bold">{results.total} response{results.total === 1 ? "" : "s"}</p>{results.choices.map((item) => <div key={item.label}><div className="flex justify-between gap-3 text-xs"><span className="break-words">{item.label}</span><b>{item.count}</b></div><div className="mt-1 h-1.5 rounded bg-[var(--br-surface-muted)]"><div className="h-full rounded bg-[var(--br-brand)]" style={{ width: `${results.total ? item.count / results.total * 100 : 0}%` }} /></div></div>)}</div> : !teacher && shownPoll.status !== "OPEN" ? <p className="mt-2 text-xs text-[var(--br-text-muted)]">Your teacher will reveal the results.</p> : null}
      {teacher && active ? <div className="mt-3 flex flex-wrap gap-2">{shownPoll.status === "OPEN" ? <button type="button" disabled={busy} onClick={() => void act({ action: "pollState", pollId: shownPoll.id, status: "CLOSED" })} className={button}>Close poll</button> : null}{shownPoll.status !== "REVEALED" ? <button type="button" disabled={busy} onClick={() => void act({ action: "pollState", pollId: shownPoll.id, status: "REVEALED" })} className={button}>Close & reveal results</button> : null}</div> : null}
    </section> : null}

    {teacher && active ? <details className={card} open={!shownPoll}><summary className="cursor-pointer text-sm font-extrabold">Create a quick poll</summary><form className="mt-3 space-y-2" onSubmit={async (event) => { event.preventDefault(); if (await act({ action: "createPoll", question: pollQuestion, pollType, options: pollOptions })) setPollQuestion(""); }}><input aria-label="Poll question" required maxLength={500} value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Ask the class…" className={input} /><select aria-label="Poll type" value={pollType} onChange={(event) => setPollType(event.target.value)} className={input}><option value="MCQ">Multiple choice</option><option value="TRUE_FALSE">True / False</option><option value="WORD_CLOUD">Word cloud</option><option value="EMOJI">Emoji</option><option value="RATING">Rating (1–5)</option></select>{pollType === "MCQ" ? <textarea aria-label="Poll options, one per line" value={pollOptions} onChange={(event) => setPollOptions(event.target.value)} rows={3} placeholder="One option per line" className={input} /> : null}<button disabled={busy || Boolean(activePoll)} className={button}>{activePoll ? "Close current poll first" : "Open poll"}</button></form></details> : null}

    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><MessageCircle size={16} /><h2 className="text-sm font-extrabold">Class chat</h2></div><select aria-label="Chat audience" value={channel} onChange={(event) => setChannel(event.target.value)} className="min-h-9 rounded border border-[var(--br-border)] bg-surface px-2 text-xs"><option value="EVERYONE">Everyone</option><option value="TEACHER">Teacher · private</option>{teacher ? data?.groups.map((group) => <option key={group.id} value={`GROUP:${group.id}`}>{group.name}</option>) : ownGroup ? <option value="GROUP">{ownGroup.name}</option> : null}</select></div>
      {ownGroup ? <p className="mt-2 text-xs text-[var(--br-text-muted)]">{ownGroup.name} · {ownGroup.memberIds.length} members · {ownGroup.status.toLowerCase()}</p> : null}
      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto" aria-label="Messages">{groupMessages?.length ? groupMessages.map((item) => <div key={item.id} className="rounded-lg bg-[var(--br-surface-muted)] p-2"><div className="flex justify-between gap-2"><p className="text-xs font-bold">{item.sender_name}</p>{teacher && item.sender_id !== data?.userId && channel === "TEACHER" ? <button type="button" onClick={() => setReplyTo({ id: item.sender_id, name: item.sender_name })} className="min-h-9 px-2 text-xs font-bold">Reply</button> : null}{teacher ? <button type="button" disabled={busy || !active} onClick={() => { if (window.confirm("Remove this message?")) void act({ action: "moderateMessage", messageId: item.id }); }} className="p-1 text-[var(--br-text-muted)]" aria-label="Remove message"><Trash2 size={14} /></button> : null}</div><p className="whitespace-pre-wrap break-words text-sm">{item.body}</p></div>) : <p className="py-4 text-center text-xs text-[var(--br-text-muted)]">No messages in this conversation yet.</p>}</div>
      {teacher && channel === "TEACHER" ? <p className="mt-2 text-xs font-bold">{replyTo ? `Replying privately to ${replyTo.name}` : "Select Reply on a learner’s message."}</p> : null}
      <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}><input aria-label="Chat message" value={message} maxLength={2000} onChange={(event) => setMessage(event.target.value)} placeholder="Write a message…" className={`${input} min-w-0 flex-1`} disabled={!active} /><button disabled={busy || !active || !message.trim() || (teacher && channel === "TEACHER" && !replyTo) || (groupChannel && (!selectedGroup || selectedGroup.status === "CLOSED"))} className={button} aria-label="Send message"><Send size={16} /></button></form>
    </section>

    {teacher ? <details className={card}><summary className="cursor-pointer text-sm font-extrabold"><UsersRound size={16} className="mr-2 inline" />Group work</summary><p className="mt-2 text-xs text-[var(--br-text-muted)]">Temporary groups with private group chat. Speaking calls remain in your meeting app.</p><div className="mt-3 flex gap-2">{[2, 3, 4].map((count) => <button key={count} type="button" disabled={busy || !active} onClick={() => { if (!data?.groups.length || window.confirm("Replace the current groups?")) void act({ action: "createGroups", count }); }} className={button}>{count} groups</button>)}</div>{data?.groups.map((group) => <div key={group.id} className="mt-2 flex items-center justify-between gap-2 text-xs"><span><b>{group.name}</b> · {group.memberIds.length} learners</span><button type="button" disabled={busy || !active} onClick={() => void act({ action: "groupState", groupId: group.id, status: group.status === "OPEN" ? "CLOSED" : "OPEN" })} className={button}>{group.status === "OPEN" ? "Close" : "Open"}</button></div>)}{data?.groups.length ? <button type="button" disabled={busy || !active} onClick={() => { if (window.confirm("Reset all groups?")) void act({ action: "resetGroups" }); }} className={`${button} mt-2`}>Reset groups</button> : null}</details> : null}
    <LiveVoiceNotes sessionId={sessionId} teacher={teacher} live={active} />
  </aside>;
}
