"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Vector3 } from "three";
import { useEffect, useRef, useState } from "react";

export type TutorExpression = "neutral" | "happy" | "aa" | "ih" | "ou" | "ee" | "oh" | "blink";
const vowels = ["aa", "ih", "ou", "ee", "oh"] as const;

function Model({ speaking, expression, onLoad, onError }: {
  speaking: boolean;
  expression: TutorExpression;
  onLoad: () => void;
  onError: () => void;
}) {
  const { scene, camera } = useThree();
  const modelRef = useRef<VRM | null>(null);
  const callbacks = useRef({ onLoad, onError });
  callbacks.current = { onLoad, onError };

  useEffect(() => {
    let disposed = false;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load("/models/ai-tutor/avatar-sample-c.vrm", (gltf) => {
      const vrm = gltf.userData.vrm as VRM | undefined;
      if (!vrm) { callbacks.current.onError(); return; }
      if (disposed) { VRMUtils.deepDispose(vrm.scene); return; }
      VRMUtils.rotateVRM0(vrm);
      // Pose the model's existing skeleton: relax its exported T-pose.
      const left = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
      const right = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
      if (left) left.rotation.z = 1.15;
      if (right) right.rotation.z = -1.15;
      vrm.update(0);
      scene.add(vrm.scene);
      vrm.scene.updateMatrixWorld(true);
      const focus = new Vector3();
      vrm.humanoid.getRawBoneNode("head")?.getWorldPosition(focus);
      focus.y -= 0.13;
      camera.position.set(focus.x, focus.y, focus.z + 1.45);
      camera.lookAt(focus);
      camera.updateProjectionMatrix();
      modelRef.current = vrm;
      callbacks.current.onLoad();
    }, undefined, () => { if (!disposed) callbacks.current.onError(); });
    return () => {
      disposed = true;
      const vrm = modelRef.current;
      modelRef.current = null;
      if (vrm) { scene.remove(vrm.scene); VRMUtils.deepDispose(vrm.scene); }
    };
  }, [scene, camera]);

  useFrame(({ clock }, delta) => {
    const vrm = modelRef.current;
    if (!vrm) return;
    const time = clock.elapsedTime;
    const manager = vrm.expressionManager;
    // This is a speaking-state animation, not phoneme timing from audio.
    const activeVowel = vowels[Math.floor(time * 3) % vowels.length];
    for (const vowel of vowels) {
      const target = expression === vowel ? 0.8 : speaking && activeVowel === vowel ? 0.2 + Math.abs(Math.sin(time * 9)) * 0.45 : 0;
      const current = manager?.getValue(vowel) ?? 0;
      manager?.setValue(vowel, current + (target - current) * (1 - Math.exp(-delta * 18)));
    }
    const blinkPhase = time % 4.7;
    manager?.setValue("blink", expression === "blink" ? 1 : blinkPhase < 0.16 ? Math.sin(blinkPhase / 0.16 * Math.PI) : 0);
    manager?.setValue("happy", expression === "happy" ? 0.65 : 0.08);
    const head = vrm.humanoid.getNormalizedBoneNode("head");
    if (head) {
      head.rotation.x = speaking ? Math.sin(time * 2.1) * 0.035 : 0;
      head.rotation.y = Math.sin(time * 0.7) * 0.025;
    }
    vrm.update(Math.min(delta, 0.05));
  });
  return null;
}

export function AiTutorAvatar({ speaking, expression = "neutral" }: { speaking: boolean; expression?: TutorExpression }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  return (
    <div className="relative h-full w-full" role="img" aria-label="Model C, the animated AI tutor">
      <Canvas camera={{ position: [0, 1.4, 1.45], fov: 30, near: 0.01 }} dpr={[1, 1.5]} fallback={<p className="p-6 text-center text-sm">3D preview is unavailable on this device.</p>}>
        <ambientLight intensity={1.4} />
        <directionalLight position={[1, 2, 3]} intensity={2} />
        <Model speaking={speaking} expression={expression} onLoad={() => setStatus("ready")} onError={() => setStatus("error")} />
      </Canvas>
      {status !== "ready" ? <div role="status" className="absolute inset-0 grid place-items-center bg-violet-50/90 p-6 text-center text-sm text-slate-600">{status === "loading" ? "Loading your tutor…" : "The tutor model could not load. Please refresh to retry."}</div> : null}
    </div>
  );
}
