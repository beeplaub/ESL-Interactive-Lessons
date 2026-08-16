import { createSearchAPI } from "fumadocs-core/search/server";
import { getKnowledgeSearchIndex } from "@/lib/knowledge-base";

export const dynamic = "force-dynamic";

const search = createSearchAPI("simple", {
  indexes: getKnowledgeSearchIndex,
});

export const GET = search.GET;
