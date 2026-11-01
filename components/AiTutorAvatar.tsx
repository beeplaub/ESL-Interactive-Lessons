"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { useRef } from "react";

function TutorFigure({ speaking }: { speaking: boolean }) {
  const mouth = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!mouth.current) return;
    mouth.current.scale.y = speaking ? 0.11 + Math.abs(Math.sin(clock.elapsedTime * 13)) * 0.19 : 0.055;
  });
  return (
    <group position={[0, -0.1, 0]}>
      <mesh position={[0, -1.05, -0.2]}><capsuleGeometry args={[0.72, 1.05, 8, 20]} /><meshStandardMaterial color="#4031a1" roughness={0.72} /></mesh>
      <mesh position={[0, -0.32, 0]}><cylinderGeometry args={[0.18, 0.2, 0.45, 24]} /><meshStandardMaterial color="#d99670" roughness={0.85} /></mesh>
      <mesh position={[0, 0.38, 0]}><sphereGeometry args={[0.72, 40, 32]} /><meshStandardMaterial color="#efb48f" roughness={0.78} /></mesh>
      <mesh position={[0, 0.78, -0.02]}><sphereGeometry args={[0.75, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.54]} /><meshStandardMaterial color="#29243e" roughness={0.9} /></mesh>
      <mesh position={[-0.25, 0.45, 0.64]}><sphereGeometry args={[0.055, 16, 12]} /><meshStandardMaterial color="#332b38" /></mesh>
      <mesh position={[0.25, 0.45, 0.64]}><sphereGeometry args={[0.055, 16, 12]} /><meshStandardMaterial color="#332b38" /></mesh>
      <mesh ref={mouth} position={[0, 0.12, 0.65]}><sphereGeometry args={[0.12, 20, 16]} /><meshStandardMaterial color="#9f4958" roughness={0.65} /></mesh>
      <mesh position={[-0.73, 0.36, 0]}><sphereGeometry args={[0.13, 16, 16]} /><meshStandardMaterial color="#e6a780" /></mesh>
      <mesh position={[0.73, 0.36, 0]}><sphereGeometry args={[0.13, 16, 16]} /><meshStandardMaterial color="#e6a780" /></mesh>
    </group>
  );
}

export function AiTutorAvatar({ speaking }: { speaking: boolean }) {
  return (
    <Canvas camera={{ position: [0, 0, 4.2], fov: 37 }} dpr={[1, 1.5]}>
      <ambientLight intensity={2.1} />
      <directionalLight position={[2, 4, 5]} intensity={2.4} />
      <pointLight position={[-3, 1, 2]} intensity={1.2} color="#fd8e73" />
      <TutorFigure speaking={speaking} />
    </Canvas>
  );
}
