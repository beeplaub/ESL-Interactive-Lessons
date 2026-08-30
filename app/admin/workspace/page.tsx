import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreatorWorkspace } from "@/components/CreatorWorkspace";

export const dynamic = "force-dynamic";

export default async function CreatorWorkspacePage() {
  const { user } = await requireStaff();
  const admin = createAdminClient();
  const [{ data: projects }, { data: tasks }, { data: notes }, { data: resources }] = await Promise.all([
    admin.from("creator_projects").select("id,title,description,category,status,due_at").eq("creator_id", user.id).neq("status", "ARCHIVED").order("updated_at", { ascending: false }).limit(100),
    admin.from("creator_tasks").select("id,project_id,title,description,status,priority,label,due_at,related_url").eq("creator_id", user.id).order("status", { ascending: true }).order("due_at", { ascending: true, nullsFirst: false }).limit(300),
    admin.from("creator_notes").select("id,title,body,project_id,updated_at").eq("creator_id", user.id).order("updated_at", { ascending: false }).limit(100),
    admin.from("creator_resources").select("id,title,value,resource_type,description,project_id").eq("creator_id", user.id).order("updated_at", { ascending: false }).limit(100),
  ]);
  return <CreatorWorkspace projects={projects ?? []} tasks={tasks ?? []} notes={notes ?? []} resources={resources ?? []} />;
}
