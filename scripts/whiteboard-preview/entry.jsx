// Synthetic browser fixture: real components, no account data or cloud calls.
import React from "react";
import { createRoot } from "react-dom/client";
import { WhiteboardWorkspace } from "../../components/whiteboard/WhiteboardWorkspace";
import { EMPTY_BOARD, routineTemplate } from "../../lib/whiteboard";

const teacher = !location.search.includes("student");
const userId = teacher ? "00000000-0000-4000-8000-000000000001" : "00000000-0000-4000-8000-000000000002";
const nativeFetch = window.fetch.bind(window);
const key = "whiteboard-synthetic-fixture";
if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ ...EMPTY_BOARD, objects: Object.fromEntries(routineTemplate().map((item) => [item.id, item])), operations: [] }));
window.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith("/api/")) return nativeFetch(input, init);
  if (url.includes("/board")) {
    const document = JSON.parse(localStorage.getItem(key));
    if (init?.method === "POST") {
      const data = JSON.parse(init.body);
      if (localStorage.getItem("board-fail-next")) { localStorage.removeItem("board-fail-next"); throw Error("Simulated interruption. Your edit is waiting to retry."); }
      if (document.operations.includes(data.operation)) return Response.json(document);
      if (!teacher && (!document.settings.editing || data.settings)) return Response.json({ error: "Board locked" }, { status: 409 });
      if (data.expectedRevision !== undefined && data.expectedRevision !== document.revision) return Response.json({ error: "Board changed" }, { status: 409 });
      for (const change of data.changes ?? []) if ((document.objects[change.id]?.revision ?? null) !== change.expected) return Response.json({ error: "Object changed" }, { status: 409 });
      document.revision++;
      for (const change of data.changes ?? []) { if (change.value) document.objects[change.id] = { ...change.value, revision: document.revision }; else delete document.objects[change.id]; }
      Object.assign(document.settings, data.settings ?? {});
      document.operations.push(data.operation);
      localStorage.setItem(key, JSON.stringify(document));
      return Response.json(document);
    }
    return Response.json({ ...document, userId, teacher, live: true, name: teacher ? "Emma (Teacher)" : "Minji" });
  }
  if (url.includes("/interactions")) return Response.json({ userId, teacher, status: "LIVE", messages: [], hands: [], polls: [], ownAnswers: [], pollResults: {}, groups: [], ownGroupId: null });
  if (url.includes("/voice")) return Response.json({ notes: [], userId, teacher, groups: [], ownGroupId: null });
  return Response.json({});
};
window.__boardTest = { document: () => JSON.parse(localStorage.getItem(key)), failNext: () => localStorage.setItem("board-fail-next", "true") };
const slides = ["Welcome", "Warm Up", "Vocabulary", "Grammar", "Speaking", "Wrap Up"].map((title, i) => ({ id: String(i), title, slide_number: i + 1, section_label: ["Let’s get started!", "Talk about your day", "Daily routines", "Present Simple", "Your turn!", "Key takeaways"][i] }));
createRoot(document.getElementById("root")).render(<WhiteboardWorkspace sessionId="00000000-0000-4000-8000-000000000003" status="LIVE" title="Lesson 4: My Daily Routine" level="A2 · Everyday Life" startedAt={new Date(Date.now() - 24 * 60000).toISOString()} callingEnabled={false} lesson={<div style={{ padding: 50 }}>Existing lesson player stays mounted here.</div>} slides={slides} />);
