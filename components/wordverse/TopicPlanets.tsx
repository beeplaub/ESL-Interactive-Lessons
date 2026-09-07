"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { AdditiveBlending, Color, InstancedMesh, Object3D, Vector3 } from "three";
import type { WordverseRelationship } from "@/lib/wordverse";
import type { Position, TopicCluster } from "./graph";
import { topicEdges, placeTopicLabels } from "./topicLayout";

const vertex = `varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`;
const fragment = `uniform vec3 tint;varying vec3 n;varying vec3 v;void main(){float rim=pow(1.-max(dot(normalize(n),normalize(v)),0.),2.4);gl_FragColor=vec4(vec3(.008,.025,.045)+tint*(.18+rim*1.4),1.);}`;
const haloVertex = `varying vec2 uvv;void main(){uvv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`;
const haloFragment = `uniform vec3 tint;varying vec2 uvv;void main(){float r=length(uvv-.5)*2.;gl_FragColor=vec4(tint,exp(-r*r*5.)*.27);}`;

export default function TopicPlanets({ cluster, positions, relationships, onSelect }: {
  cluster: TopicCluster; positions: Position[]; relationships: WordverseRelationship[];
  onSelect: (id: string, origin?: Position, scale?: number) => void;
}) {
  const spheres = useRef<InstancedMesh>(null), halos = useRef<InstancedMesh>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const active = useRef(-1);
  const elapsed = useRef(0);
  const project = useMemo(() => new Vector3(), []);
  const uniforms = useMemo(() => ({ tint: { value: new Color(cluster.color) } }), [cluster.color]);
  const lines = useMemo(() => topicEdges(cluster.words.map(w => w.id), positions, relationships), [cluster.words, positions, relationships]);
  const widths = useMemo(() => cluster.words.map(w => Math.min(180, Math.max(35, w.word.length * 8 + 18))), [cluster.words]);
  useLayoutEffect(() => {
    const dummy = new Object3D();
    positions.forEach((p,i) => { dummy.position.set(...p); dummy.updateMatrix(); spheres.current?.setMatrixAt(i,dummy.matrix); halos.current?.setMatrixAt(i,dummy.matrix); });
    for (const mesh of [spheres.current, halos.current]) if (mesh) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
    elapsed.current = 1;
  }, [positions]);
  useFrame(({camera,size}, dt) => {
    elapsed.current += dt;
    if (elapsed.current < .08) return;
    elapsed.current = 0;
    const points = positions.map((p,i) => {
      project.set(p[0]+cluster.position[0],p[1]+cluster.position[1],p[2]+cluster.position[2]).project(camera);
      const x = (project.x+1)*size.width/2, y = (1-project.y)*size.height/2;
      const visible = x >= 8 && x <= size.width-8 && y >= 8 && y <= size.height-8 && project.z >= -1 && project.z <= 1;
      const button = buttons.current[i];
      if (button) { button.style.visibility = visible ? "visible" : "hidden"; const diameter = Math.max(4,Math.min(36,16*camera.zoom)); button.style.width = `${diameter}px`; button.style.height = `${diameter}px`; }
      return { x,y,width:widths[i],visible };
    });
    const shown = placeTopicLabels(points,size.width,size.height,active.current);
    labels.current.forEach((label,i) => { if (label) { const p=shown.get(i);label.style.opacity=p ? "1":"0";label.style.pointerEvents=p ? "auto":"none"; if(p) {label.style.left=`calc(50% + ${p.x}px)`;label.style.top=`calc(50% + ${p.y}px)`;} } });
  });
  return <>
    <lineSegments><bufferGeometry><bufferAttribute attach="attributes-position" args={[lines,3]} /></bufferGeometry><lineBasicMaterial color={cluster.color} transparent opacity={.2} depthWrite={false} /></lineSegments>
    <instancedMesh ref={halos} args={[undefined,undefined,positions.length]} frustumCulled={false}><planeGeometry args={[38,38]} /><shaderMaterial uniforms={uniforms} vertexShader={haloVertex} fragmentShader={haloFragment} transparent depthWrite={false} blending={AdditiveBlending} /></instancedMesh>
    <instancedMesh ref={spheres} args={[undefined,undefined,positions.length]} frustumCulled={false}><sphereGeometry args={[8,20,14]} /><shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} /></instancedMesh>
    {cluster.words.map((word,i) => <Html key={word.id} center position={positions[i]} zIndexRange={[10,1]}>
      <button ref={node => { buttons.current[i] = node; }} type="button" aria-label={`Open ${word.word}`} title={word.word} data-topic-word={word.id}
        onMouseEnter={() => { active.current=i; elapsed.current=1; }} onMouseLeave={() => { active.current=-1; elapsed.current=1; }} onFocus={() => { active.current=i; elapsed.current=1; }} onBlur={() => { active.current=-1; elapsed.current=1; }}
        onClick={() => onSelect(word.id, positions[i].map((v,a) => v+cluster.position[a]) as Position, .085)}
        className="relative block size-4 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 hover:ring-1 hover:ring-cyan-100/70">
        <span ref={node => { labels.current[i] = node; }} aria-hidden="true" className="pointer-events-auto absolute  overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-[#04101d]/90 px-1.5 py-0.5 text-center text-xs text-white/90" style={{ width:widths[i],opacity:0,pointerEvents:"none" }}>{word.word}</span>
      </button>
    </Html>)}
  </>;
}
