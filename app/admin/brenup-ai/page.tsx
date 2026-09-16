import { requireAdmin } from "@/lib/auth";
import { CreatorAgentWorkspace } from "@/components/CreatorAgentWorkspace";

export const dynamic = "force-dynamic";

export default async function BrenUpAiPage() {
  await requireAdmin();
  return <CreatorAgentWorkspace />;
}
