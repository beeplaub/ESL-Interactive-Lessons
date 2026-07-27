import { requireAdmin } from "@/lib/auth";
import { getPlatformStyle } from "@/lib/design-system";
import { StyleControlWorkspace } from "@/components/StyleControlWorkspace";

export default async function AdminStylePage() {
  await requireAdmin();
  const { settings, revision } = await getPlatformStyle();
  return <StyleControlWorkspace initial={settings} revision={revision} />;
}
