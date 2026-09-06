import { requireStaff } from "@/lib/auth";
import { ReelStudio } from "@/components/ReelStudio";

export const dynamic = "force-dynamic";

export default async function ReelStudioPage() {
  await requireStaff();
  return <ReelStudio />;
}
