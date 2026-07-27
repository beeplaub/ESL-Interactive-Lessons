import { requireAdmin } from "@/lib/auth";
import { getPlatformStyle, getPlatformStyleRevisions } from "@/lib/design-system";
import { StyleControlWorkspace } from "@/components/StyleControlWorkspace";

export default async function AdminStylePage() {
  await requireAdmin();
  const [{ settings, revision }, revisions] = await Promise.all([getPlatformStyle(), getPlatformStyleRevisions()]);
  return <StyleControlWorkspace initial={settings} revision={revision} revisions={revisions} />;
}
