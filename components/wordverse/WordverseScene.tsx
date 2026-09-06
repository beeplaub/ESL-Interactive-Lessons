"use client";

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Html, Line } from "@react-three/drei";
import { AdditiveBlending, Color, Group, Points, Vector3 } from "three";
import JourneyCamera, { type CameraBookmark, type CameraBookmarks } from "./JourneyCamera";
import type { Journey, SceneLocation } from "./navigation";
import { ArrowLeft, List, Minus, Orbit, Pause, Play, Plus, RotateCcw, X } from "lucide-react";
import type { WordverseProgress, WordverseRelationship, WordverseWord, WordverseTopic } from "@/lib/wordverse";
import { buildNeighborhood, buildTopicClusters, clusterWordPosition, knowledgeFor, palette, type Neighbor, type Position, type TopicCluster } from "./graph";

export type SceneProps = {
  topics: WordverseTopic[]; words: WordverseWord[]; allWords: WordverseWord[]; relationships: WordverseRelationship[];
  selectedId: string; progressMap: Map<string, WordverseProgress>; view: SceneLocation["mode"]; journey: Journey;
  onSelect: (id: string, origin?: Position, originScale?: number) => void;
  onLaunch: () => void; onBack: () => void; onReturn: (id: number) => void;
  onVisit: (location: SceneLocation) => void;
};
const states: Record<string, string> = { MASTERED: "#7ce38a", REVIEW_DUE: "#ffc857", LEARNING: "#9b7cff", FAMILIAR: "#5ee7ff" };
const cameraOptions = { position: [0, 0, 1000] as Position, near: .1, far: 2600, zoom: .8 };
const controlClass = "grid size-10 place-items-center rounded-xl border border-white/15 bg-[#07121e]/90 text-white/70 backdrop-blur-md transition hover:border-cyan-200/50 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200";
const vertex = `varying vec3 vNormal; varying vec3 vView; void main(){ vec4 p=modelViewMatrix*vec4(position,1.); vNormal=normalize(normalMatrix*normal); vView=normalize(-p.xyz); gl_Position=projectionMatrix*p; }`;
const fragment = `uniform vec3 tint; varying vec3 vNormal; varying vec3 vView; void main(){ float facing=max(dot(normalize(vNormal),normalize(vView)),0.); float rim=pow(1.-facing,3.8); float hot=pow(1.-facing,14.); vec3 base=vec3(.003,.012,.025)+tint*.035*pow(1.-facing,1.8); gl_FragColor=vec4(base+tint*rim*.65+vec3(.65,.88,1.)*hot*.55,1.); }`;
const haloVertex = `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const haloFragment = `uniform vec3 tint; varying vec2 vUv; void main(){float r=length(vUv-.5)*2.; float ring=exp(-pow((r-.59)*20.,2.)); float haze=exp(-pow((r-.59)*6.,2.))*.19; gl_FragColor=vec4(tint,(ring*.48+haze)*(1.-smoothstep(.8,1.,r)));}`;

const nebulaFragment = `uniform vec3 tint; uniform float fade; varying vec2 vUv; void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float a=atan(p.y,p.x);float arms=pow(.5+.5*sin(a*3.-r*13.),5.);float haze=exp(-r*r*5.);float glow=(haze*.11+arms*haze*.26)*(1.-smoothstep(.7,1.,r));gl_FragColor=vec4(tint,glow*fade);}`;

function seeded(seed: number) { let value = seed; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
function particles(count: number, seed: number, radius: number, sphere = true) {
  const random = seeded(seed);
  const result = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const z = random() * 2 - 1, angle = random() * Math.PI * 2;
    const r = radius * (sphere ? 1.003 + random() * .006 : Math.cbrt(random()));
    result.set([Math.sqrt(1 - z * z) * Math.cos(angle) * r, Math.sqrt(1 - z * z) * Math.sin(angle) * r, z * r], i * 3);
  }
  return result;
}

function Orb({ radius, color, root, motion }: { radius: number; color: string; root?: boolean; motion: boolean }) {
  const dots = useRef<Points>(null);
  const positions = useMemo(() => particles(root ? 650 : 140, root ? 23 : 61, radius), [radius, root]);
  const uniforms = useMemo(() => ({ tint: { value: new Color(color) } }), [color]);
  useFrame((_, dt) => { if (dots.current && motion) dots.current.rotation.y += Math.min(dt, .05) * .035; });
  return <>
    <Billboard><mesh><planeGeometry args={[radius * 3.4, radius * 3.4]} /><shaderMaterial uniforms={uniforms} vertexShader={haloVertex} fragmentShader={haloFragment} transparent depthWrite={false} blending={AdditiveBlending} /></mesh></Billboard>
    <mesh><sphereGeometry args={[radius, 48, 32]} /><shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} /></mesh>
    <points ref={dots}><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><pointsMaterial color={color} size={root ? 1.1 : .8} transparent opacity={root ? .75 : .48} sizeAttenuation={false} depthWrite={false} blending={AdditiveBlending} /></points>
  </>;
}

function Ambient({ motion }: { motion: boolean }) {
  const group = useRef<Group>(null);
  const cloud = useMemo(() => particles(1100, 712, 640, false), []);
  const mesh = useMemo(() => {
    const random = seeded(76);
    const nodes: Position[] = Array.from({ length: 95 }, () => [(random() - .5) * 930, (random() - .5) * 810, -110 - random() * 160]);
    const positions: number[] = [];
    nodes.forEach((a, index) => nodes.slice(index + 1).forEach(b => { if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 155) positions.push(...a, ...b); }));
    return { points: new Float32Array(nodes.flat()), lines: new Float32Array(positions) };
  }, []);
  useFrame((_, dt) => { if (group.current && motion) group.current.rotation.y += Math.min(dt, .05) * .003; });
  return <group ref={group}>
    <points position={[0, 0, -230]}><bufferGeometry><bufferAttribute attach="attributes-position" args={[cloud, 3]} /></bufferGeometry><pointsMaterial size={1} sizeAttenuation={false} color="#2874b5" transparent opacity={.45} depthWrite={false} /></points>
    <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[mesh.points, 3]} /></bufferGeometry><pointsMaterial size={3} sizeAttenuation={false} color="#64589c" transparent opacity={.5} /></points>
    <lineSegments><bufferGeometry><bufferAttribute attach="attributes-position" args={[mesh.lines, 3]} /></bufferGeometry><lineBasicMaterial color="#235989" transparent opacity={.16} /></lineSegments>
    {[210, 290, 380].map(radius => <Line key={radius} points={Array.from({ length: 129 }, (_, i) => [Math.cos(i / 128 * Math.PI * 2) * radius, Math.sin(i / 128 * Math.PI * 2) * radius, -90] as Position)} color="#347ab2" transparent opacity={.13} lineWidth={.65} dashed dashSize={2} gapSize={6} />)}
  </group>;
}

function Connection({ to, from = [0, 0, 0], color, type, leaf = false }: { to: Position; from?: Position; color: string; type?: string; leaf?: boolean }) {
  return <>
    {!leaf && <Line points={[from, to]} color={color} transparent opacity={.09} lineWidth={8} />}
    <Line points={[from, to]} color={color} transparent opacity={leaf ? .48 : .65} lineWidth={leaf ? .65 : 2.4} />
    {!leaf && <Line points={[from, to]} color="#e5f8ff" transparent opacity={.85} lineWidth={.65} dashed={type === "ANTONYM"} dashSize={5} gapSize={4} />}
  </>;
}

function WordNode({ word, position, color, root = false, motion, state, onClick, onLaunch, origin, originScale = .56, arrivalId }: {
  word: WordverseWord; position: Position; color: string; root?: boolean; motion: boolean; state?: string; onClick: () => void; onLaunch?: () => void; origin?: Position; originScale?: number; arrivalId?: number;
}) {
  const group = useRef<Group>(null);
  const size = useThree(s => s.size);
  const scale = Math.min(1.15, Math.min(size.width / (size.width < 650 ? 760 : 1020), size.height / 870));
  const target = useMemo(() => new Vector3(...position), [position]);
  useEffect(() => {
    if (group.current && origin) { group.current.position.set(...origin); group.current.scale.setScalar(originScale); }
  }, [arrivalId, origin, originScale]);
  useFrame((_, dt) => { if (group.current) { const alpha = motion ? 1 - Math.exp(-Math.min(dt, .05) * 8) : 1; group.current.position.lerp(target, alpha); group.current.scale.setScalar(group.current.scale.x + (1 - group.current.scale.x) * alpha); } });
  const radius = root ? 94 : 53;
  return <group ref={group}>
    <Orb radius={radius} color={color} root={root} motion={motion} />
    <Html center position={[0, 0, radius + 2]} zIndexRange={[10, 1]}>
      <button type="button" onClick={onClick} aria-label={`${root ? "Selected word" : "Open"} ${word.word}`} title={word.definition}
        className="rounded-full text-center font-normal text-white outline-none transition hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-100"
        style={{ width: radius * 2 * scale, minHeight: Math.max(32, radius * 1.5 * scale), fontSize: Math.max(root ? 16 : 10, Math.min(root ? 34 : 22, radius * 1.8 / Math.max(1, word.word.length * .55)) * scale), lineHeight: 1.1, overflowWrap: "normal", textShadow: "0 2px 8px #000" }}>
        {word.word}
        {state && states[state] ? <span aria-label={state.toLowerCase().replaceAll("_", " ")} className="mx-auto mt-2 block size-1.5 rounded-full" style={{ background: states[state], boxShadow: `0 0 8px ${states[state]}` }} /> : null}
      </button>
      {root && onLaunch ? <button type="button" onClick={onLaunch} aria-label={`Open ${word.word} Solar System`} className="absolute -right-3 -top-3 grid size-8 place-items-center rounded-full border border-cyan-200/40 bg-[#061727] text-cyan-100 shadow-[0_0_18px_#1396ff55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><Orbit size={15} /></button> : null}
    </Html>
  </group>;
}

function TopicCloud({ cluster, focused, otherFocused, motion, onCluster, onSelect }: {
  cluster: TopicCluster; focused: boolean; otherFocused: boolean; motion: boolean;
  onCluster: (id: string) => void; onSelect: SceneProps["onSelect"];
}) {
  const size = useThree(state => state.size);
  const [near, setNear] = useState(false);
  const nearRef = useRef(false);
  const projected = useMemo(() => new Vector3(...cluster.position), [cluster.position]);
  const cloud = useMemo(() => particles(Math.min(300, 70 + cluster.words.length * 3), 312 + cluster.name.length, 125, false), [cluster.name, cluster.words.length]);
  const nebula = useMemo(() => ({ tint: { value: new Color(cluster.color) }, fade: { value: otherFocused ? .15 : 1 } }), [cluster.color, otherFocused]);
  const expanded = focused || (!otherFocused && near);
  const count = Math.min(size.width < 650 ? 8 : 12, cluster.words.length);
  useFrame(({ camera }) => {
    if (focused || otherFocused) return;
    projected.set(...cluster.position).project(camera);
    const close = camera.zoom * 125 > Math.min(size.width, size.height) * .31 && Math.abs(projected.x) < .65 && Math.abs(projected.y) < .65;
    if (close !== nearRef.current) { nearRef.current = close; setNear(close); }
  });
  return <group position={cluster.position}>
    <Billboard><mesh scale={[1.2, .8, 1]}><planeGeometry args={[350, 350]} /><shaderMaterial uniforms={nebula} vertexShader={haloVertex} fragmentShader={nebulaFragment} transparent depthWrite={false} blending={AdditiveBlending} /></mesh></Billboard>
    <points scale={[1, .75, .35]}><bufferGeometry><bufferAttribute attach="attributes-position" args={[cloud, 3]} /></bufferGeometry><pointsMaterial size={1.5} sizeAttenuation={false} color={cluster.color} transparent opacity={otherFocused ? .18 : .65} depthWrite={false} /></points>
    {!expanded ? !otherFocused ? <Html center position={[0, -5, 140]} zIndexRange={[10, 1]}><button onClick={() => onCluster(cluster.id)} aria-label={`Explore ${cluster.name}`} className="w-36 rounded-2xl border border-transparent bg-[#04101d]/30 px-3 py-4 text-center shadow-xl outline-none transition hover:border-cyan-200/40 focus-visible:ring-2 focus-visible:ring-cyan-100" style={{ opacity: otherFocused ? .3 : 1 }}><span className="block text-sm font-medium" style={{ color: cluster.color }}>{cluster.name}</span><span className="mt-1 block text-[10px] text-white/45">{cluster.words.length} words</span></button></Html> : null : cluster.words.slice(0, count).map((word, index) => {
      const p = clusterWordPosition(index, count);
      const world = p.map((v, axis) => v + cluster.position[axis]) as Position;
      return <group key={word.id} position={p}><Orb radius={7} color={cluster.color} motion={motion} /><Html center position={[0, -14, 12]} zIndexRange={[10, 1]}><button onClick={() => onSelect(word.id, world, .08)} aria-label={`Open ${word.word}`} className="max-w-[90px] rounded-md bg-[#04101d]/80 px-2 py-1 text-center text-xs leading-tight text-white/90 outline-none hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-100">{word.word}</button></Html></group>;
    })}
  </group>;
}

function TopicUniverse({ clusters, focusedId, motion, onCluster, onSelect }: {
  clusters: TopicCluster[]; focusedId?: string; motion: boolean; onCluster: (id: string) => void; onSelect: SceneProps["onSelect"];
}) {
  return <>{clusters.map(cluster => <TopicCloud key={cluster.id} cluster={cluster} focused={cluster.id === focusedId} otherFocused={Boolean(focusedId && focusedId !== cluster.id)} motion={motion} onCluster={onCluster} onSelect={onSelect} />)}</>;
}

function World({ props, neighbors, motion, reset, zoomStep, onKnowledge, clusters, bookmarks }: { props: SceneProps; neighbors: Neighbor[]; motion: boolean; reset: number; zoomStep: number; clusters: TopicCluster[]; bookmarks: CameraBookmarks; onKnowledge: (id: string) => void }) {
  const root = props.allWords.find(w => w.id === props.selectedId)!;
  const size = useThree(s => s.size);
  const solar = props.view === "solar";
  const knowledge = useMemo(() => knowledgeFor(root), [root]);
  const entry = props.journey.entries[props.journey.entries.length - 1];
  const cluster = entry.location.mode === "cluster" ? clusters.find(c => c.id === (entry.location as Extract<SceneLocation, { mode: "cluster" }>).topicId) : undefined;
  const wide = props.view === "universe" || props.view === "cluster";
  const bounds: [number, number] = cluster ? [340, 370] : wide ? [Math.max(850, ...clusters.map(c => Math.abs(c.position[0]) * 2 + 310)), Math.max(730, ...clusters.map(c => Math.abs(c.position[1]) * 2 + 320))] : [size.width < 650 ? 760 : 1020, 870];
  const origin = bookmarks.current.has(entry.id) ? undefined : entry.origin;
  return <>
    <JourneyCamera entry={entry} center={cluster?.position ?? [0, 0, 0]} bounds={bounds} bookmarks={bookmarks} reset={reset} zoomStep={zoomStep} motion={motion} />
    <Ambient motion={motion} />
    {wide ? <TopicUniverse clusters={clusters} focusedId={cluster?.id} motion={motion} onCluster={id => props.onVisit({ mode: "cluster", topicId: id, wordId: root.id })} onSelect={props.onSelect} /> : <>
    <WordNode key={root.id} arrivalId={entry.id} origin={origin} originScale={entry.originScale} word={root} position={[0, 0, 0]} color="#189dff" root motion={motion} state={props.progressMap.get(root.id)?.state} onClick={props.onLaunch} onLaunch={solar ? undefined : props.onLaunch} />
    {!solar ? neighbors.map(neighbor => <group key={neighbor.word.id}>
      <Connection to={neighbor.position} color={neighbor.color} type={neighbor.type} />
      <WordNode {...neighbor} motion={motion} state={props.progressMap.get(neighbor.word.id)?.state} onClick={() => props.onSelect(neighbor.word.id, neighbor.position, .56)} />
      {size.width >= 650 ? neighbor.leaves.map(leaf => <group key={leaf.word.id}>
        <Connection from={neighbor.position} to={leaf.position} color={neighbor.color} leaf />
        <mesh position={leaf.position}><sphereGeometry args={[4, 12, 8]} /><meshBasicMaterial color={neighbor.color} /></mesh>
        <Html position={[leaf.position[0] + (leaf.position[0] < -80 ? -14 : 14), leaf.position[1], leaf.position[2] + 5]} center zIndexRange={[8, 1]}>
          <button type="button" onClick={() => props.onSelect(leaf.word.id, leaf.position, .08)} className="w-max max-w-[90px] rounded px-1 text-left font-normal leading-tight outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-100" style={{ color: neighbor.color, fontSize: Math.max(11, Math.min(16, size.width / 65)), transform: leaf.position[0] < -80 ? "translateX(-50%)" : "translateX(50%)" }}>{leaf.word.word}</button>
        </Html>
      </group>) : null}
    </group>) : knowledge.map((item, i) => {
      const angle = Math.PI / 2 - i / knowledge.length * Math.PI * 2;
      const p: Position = [Math.cos(angle) * 295, Math.sin(angle) * 285, Math.sin(angle * 2) * 22];
      return <group key={item.id} position={p}>
        <Orb radius={27} color={palette[i % palette.length]} motion={motion} />
        <Html center position={[0, -49, 30]} zIndexRange={[10, 1]}><button type="button" onClick={() => onKnowledge(item.id)} className="w-24 rounded-lg bg-[#030c17]/60 px-1 py-2 text-center text-xs font-medium outline-none hover:bg-cyan-950/70 focus-visible:ring-2 focus-visible:ring-cyan-100" style={{ color: palette[i % palette.length] }}>{item.label}</button></Html>
        <mesh onClick={() => onKnowledge(item.id)}><sphereGeometry args={[32, 12, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
      </group>;
    })}
    </>}
  </>;
}

function GraphicsLifecycle({ onLost }: { onLost: () => void }) {
  const gl = useThree(state => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [gl, onLost]);
  return null;
}

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function WordverseScene(props: SceneProps) {
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [list, setList] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [lost, setLost] = useState(false);
  const [reset, setReset] = useState(0);
  const [zoomStep, setZoomStep] = useState(0);
  const [active, setActive] = useState<{ wordId: string; id: string } | null>(null);
  const bookmarks = useRef(new Map<number, CameraBookmark>());
  const detailClose = useRef<HTMLButtonElement>(null);
  const sceneHost = useRef<HTMLDivElement>(null);
  const neighbors = useMemo(() => buildNeighborhood(props.selectedId, props.words, props.allWords, props.relationships), [props.selectedId, props.words, props.allWords, props.relationships]);
  const clusters = useMemo(() => buildTopicClusters(props.topics, props.words), [props.topics, props.words]);
  const entry = props.journey.entries[props.journey.entries.length - 1];
  const clusterId = entry.location.mode === "cluster" ? entry.location.topicId : undefined;
  const cluster = clusters.find(c => c.id === clusterId);
  const root = props.allWords.find(w => w.id === props.selectedId);
  const detail = root && active?.wordId === root.id && props.view === "solar" ? knowledgeFor(root).find(k => k.id === active.id) : undefined;
  const broad = props.view === "universe" || props.view === "cluster";
  const detailId = detail?.id;
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches); update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { if (detailId) detailClose.current?.focus(); }, [detailId]);
  useEffect(() => { setListQuery(""); setActive(null); sceneHost.current?.focus(); }, [entry.id]);
  useEffect(() => {
    const ids = new Set(props.journey.entries.map(item => item.id));
    bookmarks.current.forEach((_, id) => { if (!ids.has(id)) bookmarks.current.delete(id); });
  }, [props.journey.entries]);
  if (!root) return null;

  function locationLabel(location: SceneLocation) {
    if (location.mode === "universe") return "Universe";
    if (location.mode === "cluster") return props.topics.find(t => t.id === location.topicId)?.name ?? "Other words";
    const word = props.allWords.find(w => w.id === location.wordId)?.word ?? "Word";
    return location.mode === "solar" ? `${word} · Solar` : word;
  }
  const title = locationLabel(entry.location);
  const visibleTrail = props.journey.entries.length > 4 ? [props.journey.entries[0], ...props.journey.entries.slice(-3)] : props.journey.entries;
  const listWords = props.view === "cluster" ? cluster?.words ?? [] : neighbors.map(n => n.word);
  const matches = listWords.filter(word => `${word.word} ${word.definition}`.toLowerCase().includes(listQuery.trim().toLowerCase()));
  const fallback = <div className="absolute inset-x-0 bottom-0 top-24 overflow-auto px-5 pb-16 pt-5 sm:px-8">
    <h2 className="mb-2 text-2xl text-white">{title}</h2>
    {props.view === "universe" ? <><p className="mb-6 text-sm text-white/50">Choose a topic to explore its words.</p><div className="grid gap-3 sm:grid-cols-2">{clusters.map(c => <button key={c.id} onClick={() => props.onVisit({ mode: "cluster", wordId: root.id, topicId: c.id })} className="rounded-2xl border border-white/15 bg-white/[.025] p-5 text-left focus-visible:ring-2 focus-visible:ring-cyan-100"><span className="block text-lg" style={{ color: c.color }}>{c.name}</span><span className="text-xs text-white/50">{c.words.length} words</span></button>)}</div></> : props.view === "solar" ? <div className="mt-6 grid gap-3 sm:grid-cols-2">{knowledgeFor(root).map(item => <button key={item.id} onClick={() => setActive({ wordId: root.id, id: item.id })} className="rounded-xl border border-white/15 p-4 text-left text-cyan-100">{item.label}</button>)}</div> : <>
      {!broad ? <><p className="mb-5 text-sm text-white/60">{root.definition}</p><button onClick={props.onLaunch} className="mb-5 rounded-xl border border-cyan-200/30 px-4 py-3 text-cyan-100">Open {root.word} Solar System</button></> : null}
      <input aria-label="Find a word in this view" placeholder="Find a word…" value={listQuery} onChange={event => setListQuery(event.target.value)} className="mb-5 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-cyan-200/60" />
      <div className="grid gap-3 sm:grid-cols-2">{matches.map(word => <button key={word.id} onClick={() => props.onSelect(word.id)} className="rounded-xl border border-white/15 p-4 text-left focus-visible:ring-2 focus-visible:ring-cyan-100"><span className="block text-lg text-cyan-100">{word.word}</span><span className="text-xs text-white/50">{word.definition}</span></button>)}</div>
      {!matches.length ? <p role="status" className="mt-5 text-sm text-white/50">No words match. Try another search or change your filters.</p> : null}
    </>}
  </div>;
  return <div ref={sceneHost} tabIndex={-1} aria-label="Wordverse scene" style={{ outline: "none" }} className="relative h-full min-h-[420px] overflow-hidden bg-[#020b14] outline-none" onKeyDown={event => {
    if (event.key === "Escape") { if (detail) { setActive(null); sceneHost.current?.focus(); } else props.onBack(); }
  }}>
    {!list && !lost ? <SceneBoundary fallback={fallback}><div className="absolute inset-x-0 bottom-7 top-24"><Canvas orthographic camera={cameraOptions} dpr={[1, 1.5]} gl={{ antialias: true, alpha: false, powerPreference: "low-power" }} fallback={<p>Choose list view to explore without 3D.</p>} onCreated={({ gl }) => gl.setClearColor("#020b14")}>
      <GraphicsLifecycle onLost={() => setLost(true)} /><Suspense fallback={null}><World props={props} neighbors={neighbors} clusters={clusters} bookmarks={bookmarks} motion={!paused && !reduced} reset={reset} zoomStep={zoomStep} onKnowledge={id => setActive({ wordId: root.id, id })} /></Suspense>
    </Canvas></div></SceneBoundary> : fallback}

    <nav aria-label="Exploration trail" className="absolute inset-x-0 top-0 z-20 flex h-11 items-center gap-2 overflow-x-auto border-b border-white/5 bg-[#04101b]/95 px-4 text-xs text-white/50">
      {visibleTrail.map((item, index) => <span key={item.id} className="flex shrink-0 items-center gap-2">{index ? <span aria-hidden="true">/</span> : null}{item.id === entry.id ? <span aria-current="page" className="text-cyan-100">{locationLabel(item.location)}</span> : <button onClick={() => props.onReturn(item.id)} className="rounded px-1 py-2 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-100">{locationLabel(item.location)}</button>}</span>)}
      {props.journey.entries.length > 4 ? <select aria-label="Exploration history" value={entry.id} onChange={e => props.onReturn(Number(e.target.value))} className="ml-auto max-w-24 rounded border border-white/10 bg-[#04101b] p-1 text-xs"><option value={entry.id}>History</option>{props.journey.entries.slice(0, -1).map(item => <option key={item.id} value={item.id}>{locationLabel(item.location)}</option>)}</select> : null}
    </nav>
    <div className="absolute left-3 top-[51px] z-20 flex items-center gap-2">
      {props.journey.entries.length > 1 ? <button type="button" onClick={props.onBack} className={controlClass} aria-label="Back to previous view"><ArrowLeft size={15} /></button> : <span className="hidden text-[10px] uppercase tracking-[.18em] text-cyan-100/40 sm:block">Choose a constellation</span>}
    </div>
    <div className="absolute right-3 top-[51px] z-20 flex gap-1.5">
      <button type="button" onClick={() => setList(v => !v)} aria-label={list ? "Show 3D view" : "Show list view"} aria-pressed={list} className={controlClass}><List size={15} /></button>
      {!list && !lost ? <><button type="button" onClick={() => setPaused(v => !v)} aria-label={paused ? "Resume motion" : "Pause motion"} aria-pressed={paused || reduced} disabled={reduced} className={`${controlClass} disabled:opacity-40`}>{paused || reduced ? <Play size={15} /> : <Pause size={15} />}</button><button type="button" onClick={() => setReset(v => v + 1)} aria-label="Re-center universe" className={controlClass}><RotateCcw size={15} /></button><button type="button" onClick={() => setZoomStep(v => v + 1)} aria-label="Zoom in" className={controlClass}><Plus size={15} /></button><button type="button" onClick={() => setZoomStep(v => v - 1)} aria-label="Zoom out" className={controlClass}><Minus size={15} /></button></> : null}
    </div>
    {!list && !lost ? <div className="absolute inset-x-4 bottom-3 z-20 text-center text-[10px] text-white/40">{cluster ? <button onClick={() => setList(true)} className="rounded-lg border border-white/15 bg-[#07121e]/90 px-4 py-2 text-xs text-cyan-100">Browse all {cluster.words.length} words in {cluster.name}</button> : <span className="pointer-events-none">Drag to look around · <span className="sm:hidden">pinch to zoom</span><span className="hidden sm:inline">scroll to zoom · right-drag to pan</span></span>}</div> : null}
    {(props.view === "universe" && !clusters.length) || (props.view === "cluster" && !cluster) || (props.view === "neighborhood" && !neighbors.length && !list) ? <p role="status" className="absolute bottom-14 left-1/2 w-64 -translate-x-1/2 rounded-xl bg-[#04101b]/90 p-4 text-center text-sm text-white/60">No connections match these filters. Try another cluster or change your filters.</p> : null}
    <p role="status" className="sr-only">{title}{cluster ? `, ${cluster.words.length} words` : ""}</p>
    {detail ? <section role="dialog" aria-label={`${root.word}: ${detail.label}`} className="absolute bottom-12 left-1/2 z-30 max-h-[45%] w-[min(92%,440px)] -translate-x-1/2 overflow-y-auto rounded-2xl border border-cyan-200/25 bg-[#071522]/95 p-5 shadow-2xl backdrop-blur-xl"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-cyan-200">{detail.label}</h2><button ref={detailClose} onClick={() => { setActive(null); sceneHost.current?.focus(); }} aria-label="Close knowledge detail" className="rounded p-2 text-white/65 focus-visible:ring-2 focus-visible:ring-cyan-100"><X size={16} /></button></div><p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/80">{detail.detail}</p><div className="mt-3 flex flex-wrap gap-2">{props.allWords.filter(w => detail.terms.some(term => term.toLowerCase() === w.word.toLowerCase()) && w.id !== root.id).map(w => <button key={w.id} onClick={() => { setActive(null); props.onSelect(w.id); }} className="rounded-lg border border-cyan-200/20 px-3 py-2 text-xs text-cyan-100">Explore {w.word} →</button>)}</div></section> : null}
  </div>;
}
