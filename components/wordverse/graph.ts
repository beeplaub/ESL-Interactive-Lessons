import type { WordverseRelationship, WordverseWord } from "@/lib/wordverse";

export type Position = [number, number, number];
export type Neighbor = { word: WordverseWord; position: Position; color: string; type: string; leaves: { word: WordverseWord; position: Position }[] };
export const palette = ["#56deed", "#b991ef", "#edc279", "#92d6a0", "#b591ed", "#e5bd78", "#93ddba"];
const slots: Position[] = [[0, 280, 0], [-235, 180, -18], [235, 180, 12], [-280, -35, 8], [285, -35, -12], [-160, -255, 4], [160, -255, -8]];
const referenceOrder = ["price", "deal", "contract", "terms", "bargain", "discount", "agreement"];

// Only existing published-word edges supplied by the server may enter the graph.
export function buildNeighborhood(selectedId: string, visible: WordverseWord[], words: WordverseWord[], edges: WordverseRelationship[]): Neighbor[] {
  const byId = new Map(words.map(word => [word.id, word]));
  const allowed = new Set(visible.map(word => word.id));
  const adjacency = new Map<string, { word: WordverseWord; type: string; strength: number }[]>();
  for (const edge of edges) {
    for (const [from, to] of [[edge.source_word_id, edge.target_word_id], [edge.target_word_id, edge.source_word_id]]) {
      const word = byId.get(to);
      if (!word || from === to || !allowed.has(to)) continue;
      const list = adjacency.get(from) ?? [];
      list.push({ word, type: edge.relationship_type, strength: edge.strength });
      adjacency.set(from, list);
    }
  }
  const unique = (id: string) => {
    const seen = new Set<string>();
    return (adjacency.get(id) ?? []).toSorted((a, b) => b.strength - a.strength).filter(item => {
      if (seen.has(item.word.id)) return false;
      seen.add(item.word.id);
      return true;
    });
  };
  const primary = unique(selectedId);
  if (byId.get(selectedId)?.slug === "negotiate") {
    const rank = (slug: string) => { const index = referenceOrder.indexOf(slug); return index < 0 ? 99 : index; };
    primary.sort((a, b) => rank(a.word.slug) - rank(b.word.slug));
  }
  const chosen = primary.slice(0, 7);
  const used = new Set([selectedId, ...chosen.map(item => item.word.id)]);
  return chosen.map((item, index) => {
    const position: Position = chosen.length >= 5 ? slots[index] : [Math.sin(index * Math.PI * 2 / chosen.length) * 270, Math.cos(index * Math.PI * 2 / chosen.length) * 255, index % 2 ? -12 : 12];
    const angle = Math.atan2(position[1], position[0]);
    const candidates = unique(item.word.id).filter(candidate => !used.has(candidate.word.id)).slice(0, 3);
    const leaves = candidates.map((candidate, leafIndex) => {
      used.add(candidate.word.id);
      const leafAngle = angle + (leafIndex - (candidates.length - 1) / 2) * 0.65;
      return { word: candidate.word, position: [position[0] + Math.cos(leafAngle) * 112, position[1] + Math.sin(leafAngle) * 100, position[2]] as Position };
    });
    return { word: item.word, type: item.type, position, color: palette[index], leaves };
  });
}

export function knowledgeFor(word: WordverseWord) {
  return [
    { id: "meaning", label: "Meaning", detail: word.definition, terms: [] as string[] },
    { id: "pronunciation", label: "Pronunciation", detail: word.pronunciation, terms: [] as string[] },
    { id: "family", label: "Word family", detail: word.word_family.join(" · "), terms: word.word_family },
    { id: "collocations", label: "Collocations", detail: word.collocations.join(" · "), terms: word.collocations },
    { id: "examples", label: "Examples", detail: word.examples.join("\n\n"), terms: [] as string[] },
    { id: "synonyms", label: "Synonyms", detail: word.synonyms.join(" · "), terms: word.synonyms },
    { id: "antonyms", label: "Antonyms", detail: word.antonyms.join(" · "), terms: word.antonyms },
    { id: "grammar", label: "Grammar", detail: word.grammar_patterns.join("\n"), terms: [] as string[] },
    { id: "origin", label: "Origin", detail: word.origin, terms: [] as string[] },
    { id: "mistakes", label: "Common mistakes", detail: word.common_mistakes.join("\n"), terms: [] as string[] },
    { id: "register", label: "Register", detail: word.register, terms: [] as string[] },
    { id: "class", label: "Word class", detail: word.word_class, terms: [] as string[] },
  ].filter(item => Boolean(item.detail));
}

export type TopicCluster = { id: string; name: string; color: string; position: Position; words: WordverseWord[] };
export function buildTopicClusters(topics: import("@/lib/wordverse").WordverseTopic[], words: WordverseWord[]): TopicCluster[] {
  const definitions = [...topics].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const knownIds = new Set(definitions.map(t => t.id));
  const groups = new Map<string, WordverseWord[]>();
  const seen = new Set<string>();
  for (const word of words) {
    if (seen.has(word.id)) continue;
    seen.add(word.id);
    const id = word.topic_id && knownIds.has(word.topic_id) ? word.topic_id : "__other__";
    const group = groups.get(id) ?? []; group.push(word); groups.set(id, group);
  }
  if (groups.has("__other__")) definitions.push({ id: "__other__", slug: "other", name: "Other words", color: "#8daccd", position: Infinity });
  const columns = Math.ceil(Math.sqrt(Math.max(1, definitions.length)));
  const rows = Math.ceil(definitions.length / columns);
  return definitions.flatMap((topic, index) => {
    const members = groups.get(topic.id);
    if (!members?.length) return [];
    const x = (index % columns - (columns - 1) / 2) * 330;
    const y = ((rows - 1) / 2 - Math.floor(index / columns)) * 290;
    return [{ id: topic.id, name: topic.name, color: /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(topic.color) ? topic.color : palette[index % palette.length], position: [x, y, index % 2 ? -25 : 10] as Position,
      words: members.toSorted((a, b) => b.frequency_score - a.frequency_score || a.slug.localeCompare(b.slug)) }];
  });
}

// A bounded set of spaced foreground words, with the complete cluster available in list view.
export function clusterWordPosition(index: number, count: number): Position {
  if (count === 1) return [0, 0, 0];
  const inner = Math.min(4, count);
  const outer = index >= inner;
  const angle = Math.PI / 2 - (outer ? index - inner : index) * Math.PI * 2 / (outer ? Math.max(1, count - inner) : inner) + (outer ? .2 : 0);
  const radius = outer ? 110 : count <= 4 ? 70 : 47;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius, index % 2 ? 8 : 0];
}
