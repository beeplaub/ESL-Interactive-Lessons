import { NativeAuthCallback } from "@/components/NativeAuthCallback";

export default async function NativeAuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string }>;
}) {
  const params = await searchParams;
  return <NativeAuthCallback code={params.code ?? ""} nextPath={params.next ?? "/account"} />;
}
