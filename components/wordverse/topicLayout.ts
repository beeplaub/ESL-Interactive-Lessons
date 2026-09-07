import type { WordverseRelationship } from "@/lib/wordverse";
import type { Position } from "./graph";

// Sunflower packing gives every member a stable, evenly spaced position without a force simulation.
export function topicLayout(count: number, aspect: number) {
  const stretch = Math.sqrt(Math.max(.5, Math.min(2, aspect)));
  const positions: Position[] = Array.from({ length: count }, (_, i) => {
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    const radius = 36 * Math.sqrt(i);
    return [Math.cos(angle) * radius * stretch, Math.sin(angle) * radius / stretch, 0];
  });
  const xs = positions.map(p => p[0]), ys = positions.map(p => p[1]);
  const minX = Math.min(0, ...xs), maxX = Math.max(0, ...xs), minY = Math.min(0, ...ys), maxY = Math.max(0, ...ys);
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  return { positions: positions.map(([x,y,z]) => [x-centerX,y-centerY,z] as Position), bounds: [Math.max(180, maxX-minX+120), Math.max(180, maxY-minY+120)] as [number,number] };
}

export function topicEdges(ids: string[], positions: Position[], edges: WordverseRelationship[]) {
  const byId = new Map(ids.map((id, i) => [id, positions[i]]));
  const seen = new Set<string>();
  const lines: number[] = [];
  for (const edge of edges) {
    const from = byId.get(edge.source_word_id), to = byId.get(edge.target_word_id);
    const key = [edge.source_word_id, edge.target_word_id].sort().join(":");
    if (!from || !to || from === to || seen.has(key)) continue;
    seen.add(key); lines.push(from[0],from[1],-8,to[0],to[1],-8);
  }
  return new Float32Array(lines);
}

export type LabelPoint = { x: number; y: number; width: number; visible: boolean };
// Greedy screen-space culling affects text only; all planets and hit targets remain present.
export function placeTopicLabels(points: LabelPoint[], width: number, height: number, active = -1) {
  const accepted: { x: number; y: number; width: number; height: number }[] = [];
  const placed = new Map<number, {x:number;y:number}>();
  const order = points.map((_,i) => i).filter(i => i !== active);
  if (active >= 0) order.unshift(active);
  for (const i of order) {
    const p = points[i];
    if (!p?.visible) continue;
    const candidates = [ {x:p.x+12,y:p.y-10}, {x:p.x-p.width-12,y:p.y-10}, {x:p.x-p.width/2,y:p.y+12}, {x:p.x-p.width/2,y:p.y-32} ];
    for (const candidate of candidates) {
      const box = {...candidate,width:p.width,height:20};
      if (box.x<4 || box.y<4 || box.x+box.width>width-4 || box.y+box.height>height-4) continue;
      if (accepted.some(b=>box.x<b.x+b.width+4 && box.x+box.width+4>b.x && box.y<b.y+b.height+4 && box.y+box.height+4>b.y)) continue;
      if (points.some((q,j)=>j!==i && q.visible && q.x>box.x-6 && q.x<box.x+box.width+6 && q.y>box.y-6 && q.y<box.y+box.height+6)) continue;
      placed.set(i,{x:box.x-p.x,y:box.y-p.y});accepted.push(box);break;
    }
  }
  return placed;
}
export function visibleTopicLabels(points: LabelPoint[], width: number, height: number, active = -1) {
  return new Set(placeTopicLabels(points,width,height,active).keys());
}
