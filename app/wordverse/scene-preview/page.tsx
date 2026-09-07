import { redirect } from "next/navigation";

// Old preview bookmarks now open the authenticated, published vocabulary network.
export default function Page() {
  redirect("/wordverse");
}
