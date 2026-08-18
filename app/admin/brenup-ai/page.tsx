import { requireAdmin } from "@/lib/auth";
import { BrenUpAiWorkspace } from "@/components/BrenUpAiWorkspace";

export const dynamic = "force-dynamic";

export default async function BrenUpAiPage() {
  await requireAdmin();
  return <BrenUpAiWorkspace />;
}
