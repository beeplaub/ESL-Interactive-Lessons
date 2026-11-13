"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, MessageCircle, Mic, Search, Shield, Trash2, UsersRound } from "lucide-react";
import { GlassDropdown } from "@/components/GlassDropdown";
import { VoiceRecorder } from "./VoiceRecorder";
import { VoiceNotePlayer } from "./VoiceNotePlayer";
import { LearnerResumeHero } from "@/components/LearnerResumeHero";

type Circle = { id: string; course_id: string; title: string; description: string | null; status: string; courses?: { title?: string; level?: string } | { title?: string; level?: string }[] | null };
type Post = { id: string; circle_id: string; author_id: string; post_type: string; title: string; body: string | null; feedback_mode: string; status: string; created_at: string };
type AdminConversation = Post & { circle_title: string };
type Reply = { id: string; post_id: string; author_id: string; reply_type: string; body: string | null; feedback_mode: string; created_at: string };
type Media = { id: string; post_id: string | null; reply_id: string | null; duration_seconds: number };
type Profile = { id: string; full_name: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null };
type Reaction = { post_id: string; user_id: string; reaction_type: string };
type Report = { id: string; post_id: string | null; reply_id: string | null; reason: string; details: string | null; status: string; created_at: string; target_title: string | null; target_body: string | null };

export function CommunityWorkspace({ circles, posts, replies, media, profiles, reactions, myConversations, reports, adminConversations, currentUserId, isAdmin }: {
  circles: Circle[]; posts: Post[]; replies: Reply[]; media: Media[]; profiles: Profile[]; reactions: Reaction[];
  myConversations: Post[]; reports: Report[]; adminConversations: AdminConversation[]; currentUserId: string; isAdmin: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"circles" | "conversations">("circles");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [circleId, setCircleId] = useState(circles[0]?.id ?? "");
  const [myCourseId, setMyCourseId] = useState("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [feedbackMode, setFeedbackMode] = useState("CONVERSATION");
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [adminSectionOpen, setAdminSectionOpen] = useState(false);
  const [adminConversationQuery, setAdminConversationQuery] = useState("");

  const activePosts = useMemo(() => posts.filter((post) => post.circle_id === circleId && `${post.title} ${post.body ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())), [circleId, posts, query]);
  const myFilteredConversations = useMemo(() => myConversations.filter((post) => myCourseId === "all" || post.circle_id === myCourseId), [myConversations, myCourseId]);
  const filteredAdminConversations = useMemo(() => adminConversations.filter((post) => `${post.title} ${post.body ?? ""} ${post.circle_title} ${post.author_id}`.toLowerCase().includes(adminConversationQuery.trim().toLowerCase())), [adminConversations, adminConversationQuery]);
  const activeCircle = circles.find((circle) => circle.id === circleId);
  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const displayName = (userId: string) => { const profile = profileMap.get(userId); return profile?.full_name?.trim() || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Learner"; };
  const mutate = async (payload: Record<string, string>, successMessage = "Done.") => {
    setBusyAction(payload.action ?? payload.reportId ?? payload.postId ?? payload.replyId ?? "action");
    setNotice(null);
    try {
      const response = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const responseText = await response.text();
      let result: { error?: string } = {};
      try { result = JSON.parse(responseText) as { error?: string }; } catch { /* Keep the HTTP status visible when Next returns a non-JSON error page. */ }
      if (!response.ok) {
        setNotice(result.error || `The server returned ${response.status}. Refresh the page and try again.`);
        return false;
      }
      setNotice(successMessage);
      router.refresh();
      return true;
    } catch {
      setNotice("The server could not confirm this action. Refresh the page and check the conversation before trying again.");
      return false;
    } finally {
      setBusyAction(null);
    }
  };
  const openOriginalConversation = (post: Post) => {
    setCircleId(post.circle_id);
    setActivePostId(post.id);
    setView("circles");
    window.setTimeout(() => document.getElementById(`community-post-${post.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };

  useEffect(() => {
    if (!activePostId || view !== "circles") return;
    const timer = window.setTimeout(() => document.getElementById(`community-post-${activePostId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    return () => window.clearTimeout(timer);
  }, [activePostId, circleId, view]);

  return <div className="flex flex-col gap-5">
    <LearnerResumeHero eyebrow="BRENUP COMMUNITY" headingLevel="h1" title="Learn and grow together." description="Share ideas, start conversations, and encourage fellow learners.">
      <button type="button" onClick={() => { setView("circles"); setComposerOpen((open) => !open); }} className="rounded-xl bg-[var(--br-action)] font-bold text-on-dark transition hover:bg-[var(--br-action-strong)]">{composerOpen ? "Close composer" : "New Conversation"}<MessageCircle className="size-4" /></button>
    </LearnerResumeHero>

    {isAdmin ? <section className="overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-sm">
      <button type="button" onClick={() => setAdminSectionOpen((open) => !open)} aria-expanded={adminSectionOpen} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-2 text-sm font-extrabold"><Shield className="size-4 text-[var(--br-brand)]" /> Admin moderation</span>
        <span className="rounded-full bg-[var(--br-brand-soft)] px-2.5 py-1 text-xs font-extrabold text-[var(--br-brand)]">{reports.length} open reports</span>
      </button>
      {adminSectionOpen ? <div className="border-t border-[var(--br-border)] p-4">
        {reports.length ? <div className="grid gap-3">{reports.map((report) => <article key={report.id} className="rounded-xl border border-[var(--br-border)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-extrabold text-[var(--br-action-strong)]">Reported {report.reply_id ? "reply" : "conversation"} · {report.reason}</p><p className="mt-2 text-sm font-extrabold">{report.target_title || "Conversation"}</p>{report.target_body ? <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--br-text-muted)]">{report.target_body}</p> : null}{report.details ? <p className="mt-2 rounded-lg bg-[var(--br-surface-muted)] p-2 text-xs">Reporter note: {report.details}</p> : null}<p className="mt-2 text-[11px] text-[var(--br-text-muted)]">{new Date(report.created_at).toLocaleString()} · {report.status.replaceAll("_", " ")}</p></div>
            <div className="flex shrink-0 flex-wrap gap-2">{(report.post_id || report.reply_id) ? <><button type="button" disabled={busyAction === "moderate_content"} onClick={() => void mutate({ action: "moderate_content", targetType: report.post_id ? "post" : "reply", targetId: (report.post_id ?? report.reply_id)!, moderation: "HIDE" }, "Content hidden from learner view.")} className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-extrabold disabled:opacity-50">Hide</button><button type="button" disabled={busyAction === "moderate_content"} onClick={() => void mutate({ action: "moderate_content", targetType: report.post_id ? "post" : "reply", targetId: (report.post_id ?? report.reply_id)!, moderation: "RESTORE" }, "Content restored to learner view.")} className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-extrabold disabled:opacity-50">Restore</button></> : null}<button type="button" disabled={busyAction === report.id} onClick={() => void mutate({ action: "moderate_report", reportId: report.id, status: "RESOLVED" }, "Report resolved.")} className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-extrabold disabled:opacity-50">Resolve</button>{(report.post_id || report.reply_id) ? <button type="button" disabled={busyAction === "moderate_content"} onClick={() => { if (window.confirm("Permanently delete this reported content and its attached voice recordings?")) void mutate({ action: "moderate_content", targetType: report.post_id ? "post" : "reply", targetId: (report.post_id ?? report.reply_id)!, moderation: "DELETE" }, "Reported content deleted."); }} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-extrabold text-red-700 disabled:opacity-50"><Trash2 className="size-3.5" /> Delete</button> : null}</div>
          </div>
        </article>)}</div> : <p className="text-sm text-[var(--br-text-muted)]">No open community reports.</p>}
        <div className="mt-5 border-t border-[var(--br-border)] pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><h3 className="text-sm font-extrabold">All conversations</h3><p className="mt-1 text-xs text-[var(--br-text-muted)]">Includes hidden and previously resolved conversations. Permanent deletion also removes replies and voice recordings.</p></div>
            <label className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-[var(--br-text-muted)]" /><input value={adminConversationQuery} onChange={(event) => setAdminConversationQuery(event.target.value)} placeholder="Find a conversation" aria-label="Search all conversations" className="w-full rounded-full border border-[var(--br-border)] py-2 pl-8 pr-3 text-xs outline-none focus:border-[var(--br-brand)] sm:w-64" /></label>
          </div>
          {filteredAdminConversations.length ? <div className="mt-3 grid max-h-[32rem] gap-2 overflow-y-auto pr-1">{filteredAdminConversations.map((post) => <article key={post.id} className="flex flex-col gap-3 rounded-xl border border-[var(--br-border)] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="truncate text-sm font-extrabold">{post.title}</p><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-[var(--br-text-muted)]">{post.body || "Voice conversation"}</p><p className="mt-2 text-[11px] text-[var(--br-text-muted)]">{post.circle_title} · {displayName(post.author_id)} · {new Date(post.created_at).toLocaleString()} · {post.status.replaceAll("_", " ")}</p></div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {post.status === "PUBLISHED" ? <button type="button" disabled={busyAction === "moderate_content"} onClick={() => void mutate({ action: "moderate_content", targetType: "post", targetId: post.id, moderation: "HIDE" }, "Conversation hidden from learner view.")} className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-extrabold disabled:opacity-50">Hide</button> : <button type="button" disabled={busyAction === "moderate_content"} onClick={() => void mutate({ action: "moderate_content", targetType: "post", targetId: post.id, moderation: "RESTORE" }, "Conversation restored to learner view.")} className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-extrabold disabled:opacity-50">Restore</button>}
              <button type="button" disabled={busyAction === "moderate_content"} onClick={() => { if (window.confirm(`Permanently delete “${post.title}”, all its replies, reports, and attached voice recordings? This cannot be undone.`)) void mutate({ action: "moderate_content", targetType: "post", targetId: post.id, moderation: "DELETE" }, "Conversation permanently deleted."); }} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-extrabold text-red-700 disabled:opacity-50"><Trash2 className="size-3.5" /> Delete permanently</button>
            </div>
          </article>)}</div> : <p className="mt-4 text-sm text-[var(--br-text-muted)]">{adminConversations.length ? "No conversations match your search." : "No community conversations found."}</p>}
        </div>
      </div> : null}
    </section> : null}

    {composerOpen ? <form onSubmit={async (event) => {
      event.preventDefault(); setNotice(null);
      const response = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_post", circleId, title, body, feedbackMode, postType: voiceFile ? "VOICE" : "DISCUSSION" }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(result.error || "Could not create the conversation."); return; }
      if (voiceFile && result.post?.id) {
        const form = new FormData(); form.append("file", voiceFile); form.append("postId", result.post.id); form.append("durationSeconds", String(voiceDuration));
        const mediaResponse = await fetch("/api/community/media", { method: "POST", body: form });
        if (!mediaResponse.ok) { setNotice("Conversation posted, but the voice note could not be attached."); }
      }
      setNotice("Conversation posted."); setComposerOpen(false); setTitle(""); setBody(""); setVoiceFile(null); setVoiceDuration(0); router.refresh();
    }} className="rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-extrabold">Start a conversation</h2><p className="mt-1 text-xs text-[var(--br-text-muted)]">Only learners enrolled in this course can see it.</p></div><button type="button" onClick={() => setComposerOpen(false)} className="text-xs font-bold text-[var(--br-text-muted)]">Close</button></div>
      <div className="mt-4 grid gap-3"><label className="grid gap-1.5 text-xs font-bold">Course circle<GlassDropdown value={circleId} onChange={setCircleId} ariaLabel="Course circle" portal options={circles.map((circle) => ({ value: circle.id, label: circle.title }))} triggerClassName="h-auto w-full py-2.5 text-sm font-normal" /></label>
        <input required={!voiceFile} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What would you like to talk about?" className="rounded-xl border border-[var(--br-border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--br-brand)]" />
        <textarea required={!voiceFile} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Share a question, idea, or short reflection…" className="min-h-24 rounded-xl border border-[var(--br-border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--br-brand)]" />
        <VoiceRecorder onReady={(file, duration) => { setVoiceFile(file); setVoiceDuration(duration); }} />
        <p className="-mt-1 text-[11px] text-[var(--br-text-muted)]">Optional · up to 60 seconds and 2 MB. Voice notes are stored privately and shared only with circle members.</p>
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-bold text-[var(--br-text-muted)]"><span>Feedback</span><GlassDropdown value={feedbackMode} onChange={setFeedbackMode} ariaLabel="Feedback preference" portal options={[{ value: "CONVERSATION", label: "Just conversation" }, { value: "WELCOME", label: "Feedback welcome" }, { value: "CORRECT_ME", label: "Please correct me" }]} triggerClassName="h-9 min-w-40 rounded-lg px-2.5 text-xs" /></div><button type="submit" disabled={!circles.length} className="rounded-xl bg-[var(--br-action)] px-4 py-2.5 text-xs font-extrabold text-on-dark disabled:opacity-50">Post conversation</button></div>
      </div>
    </form> : null}
    {notice ? <div role="status" className="rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] px-4 py-3 text-xs font-bold text-[var(--br-text-muted)]">{notice}</div> : null}

    <div className="flex gap-2 border-b border-[var(--br-border)]" role="tablist" aria-label="Community views">
      {([ ["circles", "My Circles"], ["conversations", "My Conversations"] ] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} className={`border-b-2 px-3 py-3 text-sm font-extrabold ${view === key ? "border-[var(--br-action)] text-[var(--br-brand)]" : "border-transparent text-[var(--br-text-muted)]"}`}>{label}{key === "circles" && circles.length ? <span className="ml-1 rounded-full bg-[var(--br-brand-soft)] px-1.5 py-0.5 text-[10px]">{circles.length}</span> : null}{key === "conversations" && myConversations.length ? <span className="ml-1 rounded-full bg-[var(--br-brand-soft)] px-1.5 py-0.5 text-[10px]">{myConversations.length}</span> : null}</button>)}
    </div>

    {view === "circles" ? <section className="overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[var(--br-border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-extrabold">Your circles</h2><p className="mt-1 text-xs text-[var(--br-text-muted)]">Conversations from your enrolled courses</p></div><div className="flex w-full min-w-0 flex-nowrap items-center gap-2 sm:w-auto"><label className={`relative min-w-0 transition-[flex-basis] duration-200 ${searchFocused ? "flex-[1.2]" : "basis-[76px] shrink-0"} sm:flex-none`}><Search className="absolute left-2.5 top-2.5 size-4 text-[var(--br-text-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} placeholder="Search" aria-label="Search conversations" className="w-full rounded-full border border-[var(--br-border)] py-2 pl-8 pr-3 text-xs outline-none focus:border-[var(--br-brand)] sm:w-48" /></label><div className="min-w-0 flex-1 sm:flex-none"><GlassDropdown value={circleId} onChange={setCircleId} ariaLabel="Choose course circle" portal options={circles.map((circle) => ({ value: circle.id, label: circle.title }))} triggerClassName="h-9 w-full rounded-full px-3 text-xs font-bold sm:w-72" /></div></div></div>
      {!circles.length ? <div className="p-8 text-center"><UsersRound className="mx-auto size-8 text-[var(--br-text-muted)]" /><h3 className="mt-3 text-sm font-extrabold">Your circles will appear here</h3><p className="mt-1 text-xs text-[var(--br-text-muted)]">Enroll in a course to join its learner community.</p></div> : !activePosts.length ? <div className="p-8 text-center text-sm text-[var(--br-text-muted)]">No conversations match this search.</div> : <div>{activePosts.map((post) => <article id={`community-post-${post.id}`} key={post.id} className={`scroll-mt-24 border-b border-[var(--br-border)] p-4 last:border-0 ${activePostId === post.id ? "bg-[var(--br-brand-soft)]/40" : ""}`}>
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Avatar profile={profileMap.get(post.author_id)} name={displayName(post.author_id)} /><div><h3 className="text-sm font-extrabold">{post.title}</h3><p className="mt-1 text-[11px] text-[var(--br-text-muted)]">{displayName(post.author_id)} · {activeCircle?.title} · {post.feedback_mode === "CORRECT_ME" ? "Please correct me" : post.feedback_mode === "WELCOME" ? "Feedback welcome" : "Just conversation"}</p></div></div>{post.post_type === "VOICE" ? <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[10px] font-extrabold text-violet-700 shadow-sm"><Mic className="size-3.5" /> Voice note</span> : <span className="rounded-md bg-[var(--br-brand-soft)] px-2 py-1 text-[10px] font-extrabold text-[var(--br-brand)]">CONVERSATION</span>}</div>
        {post.body ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--br-text-muted)]">{post.body}</p> : null}{media.filter((item) => item.post_id === post.id).map((item) => <CommunityAudio key={item.id} mediaId={item.id} duration={item.duration_seconds} />)}
        {replies.filter((reply) => reply.post_id === post.id).map((reply) => <div key={reply.id} className="mt-3 ml-5 rounded-xl bg-[var(--br-surface-muted)] p-3 sm:ml-8"><div className="flex items-center gap-2"><Avatar profile={profileMap.get(reply.author_id)} name={displayName(reply.author_id)} /><p className="text-xs font-extrabold">{displayName(reply.author_id)}</p></div>{reply.body ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--br-text-muted)]">{reply.body}</p> : null}{media.filter((item) => item.reply_id === reply.id).map((item) => <CommunityAudio key={item.id} mediaId={item.id} duration={item.duration_seconds} />)}<div className="mt-2 flex items-center gap-4 text-xs font-bold text-[var(--br-text-muted)]"><button type="button" onClick={() => void mutate({ action: "report", replyId: reply.id, reason: "SAFETY_REVIEW" }, "Report sent to admins.")}>Report</button>{isAdmin ? <button type="button" onClick={() => void mutate({ action: "moderate_content", targetType: "reply", targetId: reply.id, moderation: "HIDE" }, "Reply hidden from learners.")}>Hide reply</button> : null}</div></div>)}
        <PostActions post={post} currentUserId={currentUserId} reactions={reactions} busyAction={busyAction} isAdmin={isAdmin} mutate={mutate} onReply={() => { setReplyFor(replyFor === post.id ? null : post.id); setReplyBody(""); }} />
        {replyFor === post.id ? <form className="mt-3 flex gap-2" onSubmit={async (event) => { event.preventDefault(); if (!replyBody.trim()) return; const ok = await mutate({ action: "create_reply", postId: post.id, body: replyBody.trim(), feedbackMode: "CONVERSATION" }, "Reply posted."); if (ok) { setReplyBody(""); setReplyFor(null); } }}><input required maxLength={5000} value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder="Add a thoughtful reply…" className="min-w-0 flex-1 rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs outline-none focus:border-[var(--br-brand)]" /><button type="submit" className="rounded-lg bg-[var(--br-action)] px-3 py-2 text-xs font-extrabold text-on-dark">Send</button></form> : null}
      </article>)}</div>}
    </section> : <section className="overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[var(--br-border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-extrabold">My Conversations</h2><p className="mt-1 text-xs text-[var(--br-text-muted)]">Threads you started, grouped by your enrolled course circles.</p></div><div className="flex w-full min-w-0 items-center gap-2 text-xs font-bold text-[var(--br-text-muted)] sm:w-auto"><span className="shrink-0">Course</span><div className="min-w-0 flex-1 sm:flex-none"><GlassDropdown value={myCourseId} onChange={setMyCourseId} ariaLabel="Filter conversations by course" portal options={[{ value: "all", label: "All courses" }, ...circles.map((circle) => ({ value: circle.id, label: circle.title }))]} triggerClassName="h-9 w-full rounded-full px-3 text-xs font-bold sm:w-80" /></div></div></div>
      {myFilteredConversations.length ? <div className="grid gap-3 p-4">{myFilteredConversations.map((post) => <article key={post.id} className="flex flex-col gap-3 rounded-xl border border-[var(--br-border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm font-extrabold">{post.title}</p><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-[var(--br-text-muted)]">{post.body || "Voice conversation"}</p><p className="mt-2 text-[11px] font-bold text-[var(--br-text-muted)]">{circleTitle(circles, post.circle_id)} · {replies.filter((reply) => reply.post_id === post.id).length} replies · {new Date(post.created_at).toLocaleDateString()}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => openOriginalConversation(post)} className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-extrabold text-[var(--br-brand)]">Open conversation</button><button type="button" disabled={busyAction === "delete_conversation"} onClick={() => { if (window.confirm(`Permanently delete “${post.title}”, all its replies, and attached voice recordings? This cannot be undone.`)) void mutate({ action: "delete_conversation", postId: post.id }, "Conversation and its voice recordings deleted."); }} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-extrabold text-red-700 disabled:opacity-50"><Trash2 className="size-3.5" /> Delete</button></div></article>)}</div> : <div className="p-8 text-center"><MessageCircle className="mx-auto size-8 text-[var(--br-text-muted)]" /><h3 className="mt-3 text-sm font-extrabold">No conversations started yet</h3><p className="mt-1 text-xs text-[var(--br-text-muted)]">Conversations you begin will appear here.</p></div>}
    </section>}
  </div>;
}

function circleTitle(circles: Circle[], circleId: string) {
  const circle = circles.find((item) => item.id === circleId);
  const courses = Array.isArray(circle?.courses) ? circle?.courses[0] : circle?.courses;
  return courses?.title || circle?.title || "Course circle";
}

function Avatar({ profile, name }: { profile: Profile | undefined; name: string }) {
  return <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--br-brand-soft)] text-xs font-black text-[var(--br-brand)]">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="size-full object-cover" /> : name.slice(0, 2).toUpperCase()}</div>;
}

function PostActions({ post, currentUserId, reactions, busyAction, isAdmin, mutate, onReply }: {
  post: Post; currentUserId: string; reactions: Reaction[]; busyAction: string | null; isAdmin: boolean;
  mutate: (payload: Record<string, string>, successMessage?: string) => Promise<boolean>; onReply: () => void;
}) {
  const postReactions = reactions.filter((reaction) => reaction.post_id === post.id && reaction.reaction_type === "HELPFUL");
  const reacted = postReactions.some((reaction) => reaction.user_id === currentUserId);
  return <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-[var(--br-text-muted)]">
    <button type="button" disabled={busyAction === "react"} aria-pressed={reacted} onClick={() => void mutate({ action: "react", postId: post.id, reactionType: "HELPFUL" }, reacted ? "Helpful reaction removed." : "Marked helpful.")} className={reacted ? "text-[var(--br-brand)]" : ""}>Helpful{postReactions.length ? ` · ${postReactions.length}` : ""}</button>
    <button type="button" onClick={onReply}>Reply</button>
    <button type="button" onClick={() => void mutate({ action: "report", postId: post.id, reason: "SAFETY_REVIEW" }, "Report sent to admins.")}><Flag className="mr-1 inline size-3.5" />Report</button>
    {isAdmin ? <><button type="button" onClick={() => void mutate({ action: "moderate_content", targetType: "post", targetId: post.id, moderation: "HIDE" }, "Conversation hidden from learners.")}>Hide</button><button type="button" onClick={() => { if (window.confirm("Permanently delete this conversation, its replies, and attached voice recordings?")) void mutate({ action: "moderate_content", targetType: "post", targetId: post.id, moderation: "DELETE" }, "Conversation deleted."); }} className="text-red-700"><Trash2 className="mr-1 inline size-3.5" />Delete</button></> : null}
  </div>;
}

function CommunityAudio({ mediaId, duration }: { mediaId: string; duration: number }) {
  const [attempt, setAttempt] = useState(0);
  return <VoiceNotePlayer key={`${mediaId}-${attempt}`} src={`/api/community/media/${mediaId}?attempt=${attempt}`} duration={duration} onRetry={() => setAttempt((current) => current + 1)} />;
}
