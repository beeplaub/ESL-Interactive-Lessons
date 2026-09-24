import { requireStaff } from "@/lib/auth";
import { PracticeModuleCreateForm } from "@/components/PracticeModuleCreateForm";

export default async function NewPracticeModulePage() { await requireStaff(); return <div className="min-w-0"><PracticeModuleCreateForm /></div>; }
