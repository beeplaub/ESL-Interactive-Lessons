import { requireStaff } from "@/lib/auth";
import { LocalTranscriberWorkspace } from "@/components/LocalTranscriberWorkspace";

export default async function LocalTranscriberPage() {
  await requireStaff();
  return <LocalTranscriberWorkspace />;
}
