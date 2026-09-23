import { requireStaff } from "@/lib/auth";
import { PracticeModuleBuilder } from "@/components/PracticeModuleBuilder";

export default async function NewPracticeModulePage() { await requireStaff(); return <main className="min-w-0"><PracticeModuleBuilder /></main>; }
