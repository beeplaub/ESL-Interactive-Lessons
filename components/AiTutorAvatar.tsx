"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { useRef } from "react";

function TutorFigure({ speaking }: { speaking: boolean }) {
  const head = useRef<Group>(null);
  const mouth = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    if (head.current) {
      const motion = speaking ? 1 : 0;
      head.current.rotation.x = motion * (0.025 + Math.sin(time * 2.8) * 0.035);
      head.current.rotation.z = motion * Math.sin(time * 1.7) * 0.025;
      head.current.position.y = 0.56 + (speaking ? Math.sin(time * 5.6) * 0.018 : 0);
    }
    if (mouth.current) {
      mouth.current.scale.y = speaking ? 0.08 + Math.abs(Math.sin(time * 10.5)) * 0.16 : 0.045;
    }
  });

  return (
    <group>
      {/* Soft cream blouse and lavender cardigan */}
      <mesh position={[0, -1.15, -0.12]} scale={[0.93, 0.96, 0.46]}>
        <capsuleGeometry args={[0.59, 0.82, 8, 24]} />
        <meshStandardMaterial color="#faf6ef" roughness={0.92} />
      </mesh>
      <mesh position={[-0.38, -1.06, 0.12]} rotation={[0, 0, -0.08]} scale={[0.42, 0.94, 0.38]}>
        <capsuleGeometry args={[0.42, 0.72, 8, 20]} />
        <meshStandardMaterial color="#a98be0" roughness={0.88} />
      </mesh>
      <mesh position={[0.38, -1.06, 0.12]} rotation={[0, 0, 0.08]} scale={[0.42, 0.94, 0.38]}>
        <capsuleGeometry args={[0.42, 0.72, 8, 20]} />
        <meshStandardMaterial color="#a98be0" roughness={0.88} />
      </mesh>
      <mesh position={[-0.83, -1.08, 0.02]} rotation={[0, 0, -0.18]}>
        <capsuleGeometry args={[0.2, 0.74, 8, 18]} />
        <meshStandardMaterial color="#a98be0" roughness={0.88} />
      </mesh>
      <mesh position={[0.83, -1.08, 0.02]} rotation={[0, 0, 0.18]}>
        <capsuleGeometry args={[0.2, 0.74, 8, 18]} />
        <meshStandardMaterial color="#a98be0" roughness={0.88} />
      </mesh>
      <mesh position={[0, -0.65, 0.24]}>
        <sphereGeometry args={[0.31, 28, 20]} />
        <meshStandardMaterial color="#faf6ef" roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.92, 0.485]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.018, 0.26, 4, 8]} />
        <meshStandardMaterial color="#8c6acb" roughness={0.8} />
      </mesh>
      <mesh position={[0.26, -1.08, 0.49]}>
        <sphereGeometry args={[0.045, 16, 12]} />
        <meshStandardMaterial color="#d8b879" metalness={0.15} roughness={0.6} />
      </mesh>
      <mesh position={[0.26, -1.39, 0.49]}>
        <sphereGeometry args={[0.045, 16, 12]} />
        <meshStandardMaterial color="#d8b879" metalness={0.15} roughness={0.6} />
      </mesh>

      {/* Neck and head */}
      <mesh position={[0, -0.43, 0]}>
        <cylinderGeometry args={[0.19, 0.22, 0.48, 24]} />
        <meshStandardMaterial color="#e6ad8e" roughness={0.9} />
      </mesh>
      <group ref={head} position={[0, 0.56, 0]}>
        {/* Hair gathered in a loose high bun */}
        <mesh position={[0, 0.23, -0.16]} scale={[0.79, 0.76, 0.72]}>
          <sphereGeometry args={[0.74, 40, 32]} />
          <meshStandardMaterial color="#332638" roughness={0.94} />
        </mesh>
        <mesh position={[0.02, 0.83, -0.22]} scale={[0.65, 0.57, 0.61]}>
          <sphereGeometry args={[0.43, 32, 24]} />
          <meshStandardMaterial color="#382a3c" roughness={0.9} />
        </mesh>
        <mesh position={[-0.31, 0.84, -0.08]} scale={[0.72, 0.4, 0.55]} rotation={[0.05, 0, -0.2]}>
          <sphereGeometry args={[0.34, 28, 20]} />
          <meshStandardMaterial color="#49344a" roughness={0.92} />
        </mesh>
        {/* Soft face frame and loose curls */}
        <mesh position={[-0.64, -0.07, 0.18]} rotation={[0, 0, -0.12]}>
          <capsuleGeometry args={[0.1, 0.52, 8, 14]} />
          <meshStandardMaterial color="#382a3c" roughness={0.92} />
        </mesh>
        <mesh position={[0.64, -0.08, 0.18]} rotation={[0, 0, 0.12]}>
          <capsuleGeometry args={[0.1, 0.48, 8, 14]} />
          <meshStandardMaterial color="#382a3c" roughness={0.92} />
        </mesh>
        <mesh position={[0, -0.04, 0.02]} scale={[0.72, 0.88, 0.66]}>
          <sphereGeometry args={[0.74, 48, 36]} />
          <meshStandardMaterial color="#f0b99b" roughness={0.78} />
        </mesh>
        {/* Side-swept fringe */}
        <mesh position={[-0.25, 0.52, 0.38]} rotation={[0, 0, -0.42]} scale={[0.8, 0.32, 0.42]}>
          <sphereGeometry args={[0.45, 32, 20]} />
          <meshStandardMaterial color="#382a3c" roughness={0.9} />
        </mesh>
        <mesh position={[0.22, 0.48, 0.38]} rotation={[0, 0, 0.26]} scale={[0.72, 0.24, 0.36]}>
          <sphereGeometry args={[0.39, 28, 18]} />
          <meshStandardMaterial color="#382a3c" roughness={0.9} />
        </mesh>

        {/* Ears */}
        <mesh position={[-0.73, -0.08, 0.01]} scale={[0.19, 0.25, 0.13]}>
          <sphereGeometry args={[0.5, 20, 16]} />
          <meshStandardMaterial color="#e6ad8e" roughness={0.84} />
        </mesh>
        <mesh position={[0.73, -0.08, 0.01]} scale={[0.19, 0.25, 0.13]}>
          <sphereGeometry args={[0.5, 20, 16]} />
          <meshStandardMaterial color="#e6ad8e" roughness={0.84} />
        </mesh>

        {/* Large warm eyes */}
        {[-0.28, 0.28].map((x) => (
          <group key={x} position={[x, 0.08, 0.54]}>
            <mesh scale={[0.23, 0.28, 0.11]}><sphereGeometry args={[1, 28, 24]} /><meshStandardMaterial color="#fffdfb" roughness={0.38} /></mesh>
            <mesh position={[0.015, -0.015, 0.088]} scale={[0.135, 0.17, 0.085]}><sphereGeometry args={[1, 28, 24]} /><meshStandardMaterial color="#75452e" roughness={0.32} /></mesh>
            <mesh position={[0.02, -0.02, 0.151]} scale={[0.083, 0.12, 0.055]}><sphereGeometry args={[1, 24, 20]} /><meshStandardMaterial color="#241b20" roughness={0.25} /></mesh>
            <mesh position={[-0.025, 0.055, 0.193]} scale={[0.036, 0.045, 0.025]}><sphereGeometry args={[1, 16, 12]} /><meshBasicMaterial color="#ffffff" /></mesh>
          </group>
        ))}
        {/* Brows, nose, and animated mouth */}
        <mesh position={[-0.28, 0.38, 0.55]} rotation={[0, 0, -0.13]} scale={[0.22, 0.045, 0.05]}><sphereGeometry args={[1, 20, 12]} /><meshStandardMaterial color="#4b3540" roughness={0.8} /></mesh>
        <mesh position={[0.28, 0.38, 0.55]} rotation={[0, 0, 0.13]} scale={[0.22, 0.045, 0.05]}><sphereGeometry args={[1, 20, 12]} /><meshStandardMaterial color="#4b3540" roughness={0.8} /></mesh>
        <mesh position={[0, -0.13, 0.62]} scale={[0.075, 0.12, 0.06]}><sphereGeometry args={[1, 18, 14]} /><meshStandardMaterial color="#e3a88b" roughness={0.78} /></mesh>
        <mesh ref={mouth} position={[0, -0.34, 0.59]} scale={[0.19, 0.045, 0.06]}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshStandardMaterial color="#a94f58" roughness={0.55} />
        </mesh>
        <mesh position={[0, -0.32, 0.641]} scale={[0.13, 0.022, 0.018]}>
          <sphereGeometry args={[1, 20, 12]} />
          <meshStandardMaterial color="#f4c2ac" roughness={0.68} />
        </mesh>
      </group>
    </group>
  );
}

export function AiTutorAvatar({ speaking }: { speaking: boolean }) {
  return (
    <Canvas camera={{ position: [0, 0.05, 4.15], fov: 39 }} dpr={[1, 1.5]}>
      <ambientLight intensity={2.1} />
      <directionalLight position={[2, 4, 5]} intensity={2.4} />
      <pointLight position={[-3, 1, 2]} intensity={1.2} color="#fd8e73" />
      <TutorFigure speaking={speaking} />
    </Canvas>
  );
}
