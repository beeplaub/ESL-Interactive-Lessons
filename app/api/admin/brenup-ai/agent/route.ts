import { NextResponse } from "next/server";
import { agentAdmin, agentRequest, createSession, session, sessions, projects, createProject, renameProject, projectFiles, saveProjectFile } from "@/lib/ai/creator-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Agent request failed.";
  const status = message === "AUTH_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : message === "SESSION_NOT_FOUND" ? 404 : 400;
  return NextResponse.json({ error: message }, { status });
}
export async function GET(request: Request) {
  try {
    const userId = await agentAdmin();
    const id = new URL(request.url).searchParams.get("sessionId");
    if (id) return NextResponse.json({ session: await session(userId,id) }, { headers: { "Cache-Control": "no-store" } });
    const projectId=new URL(request.url).searchParams.get("projectId");
    return NextResponse.json({ sessions: await sessions(userId), projects: await projects(userId), ...(projectId?{files:await projectFiles(userId,projectId)}:{}) }, { headers: { "Cache-Control": "no-store" } });
  } catch(error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const userId = await agentAdmin();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status:403 });
    const text = await request.text();
    if (text.length>150000) throw new Error("Request is too large.");
    const body = JSON.parse(text);
    if(body.command === "create") return NextResponse.json({ session: await createSession(userId) });
    if(body.command === "create_project") return NextResponse.json({ project: await createProject(userId,body.name) });
    if(body.command === "rename_project") return NextResponse.json({ project: await renameProject(userId,body.id,body.name) });
    if(body.command === "save_project_file") return NextResponse.json({ file: await saveProjectFile(userId,body.projectId,body.file) });
    return NextResponse.json({ session: await agentRequest(userId,body) });
  } catch(error) { return failure(error); }
}
