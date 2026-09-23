import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PracticeModuleBuilder } from "@/components/PracticeModuleBuilder";

export default async function EditPracticeModulePage({ params }: { params: Promise<{ id: string }> }) { const { user } = await requireStaff(); const { id } = await params; const { data } = await (createAdminClient() as any).from("practice_modules").select("id,title,description,category,level,access_type,status,content").eq("id", id).eq("creator_id", user.id).maybeSingle(); if (!data) notFound(); return <main className="min-w-0"><PracticeModuleBuilder initial={{ id: data.id, title: data.title, description: data.description ?? "", category: data.category, level: data.level, accessType: data.access_type, status: data.status, content: data.content ?? { blocks: [], activities: [] } }} /></main>; }
