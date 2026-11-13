import { redirect } from "next/navigation";

// Reports are now reviewed inside the Community workspace's admin-only panel.
export default function CommunityReportsRedirect() {
  redirect("/community");
}
