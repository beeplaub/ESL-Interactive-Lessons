"use client";
import { useEffect, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { MathUtils, OrthographicCamera, Vector3 } from "three";
import type { OrbitControls as Controls } from "three-stdlib";
import type { JourneyEntry } from "./navigation";
import type { Position } from "./graph";

export type CameraBookmark = { position: Vector3; target: Vector3; ratio: number };
export type CameraBookmarks = MutableRefObject<Map<number, CameraBookmark>>;
export default function JourneyCamera({ entry, center, bounds, bookmarks, reset, zoomStep, motion }: {
  entry: JourneyEntry; center: Position; bounds: [number, number]; bookmarks: CameraBookmarks; reset: number; zoomStep: number; motion: boolean;
}) {
  const { camera, size } = useThree();
  const controls = useRef<Controls>(null);
  const fit = Math.min(size.width / bounds[0], size.height / bounds[1]);
  const fitRef = useRef(fit);
  const fitEntry = useRef(entry.id);
  const previousReset = useRef(reset);
  const transition = useRef<CameraBookmark | null>(null);
  const previousStep = useRef(zoomStep);
  const latest = useRef({ center, mode: entry.location.mode });
  useEffect(() => { latest.current = { center, mode: entry.location.mode }; }, [center, entry.location.mode]);

  useEffect(() => {
    const cam = camera as OrthographicCamera;
    const oldFit = fitRef.current;
    if (fitEntry.current === entry.id) cam.zoom *= fit / oldFit;
    fitEntry.current = entry.id;
    fitRef.current = fit;
    cam.updateProjectionMatrix();
  }, [camera, fit, entry.id]);

  useEffect(() => {
    const cam = camera as OrthographicCamera;
    const cameraMap = bookmarks.current;
    const controller = controls.current;
    const saved = previousReset.current === reset ? cameraMap.get(entry.id) : undefined;
    previousReset.current = reset;
    const target = new Vector3(...latest.current.center);
    transition.current = saved ?? { target, position: target.clone().add(new Vector3(0, 0, 1000)), ratio: 1 };
    return () => {
      cameraMap.set(entry.id, { position: cam.position.clone(), target: controller?.target.clone() ?? new Vector3(), ratio: cam.zoom / fitRef.current });
    };
  }, [bookmarks, camera, entry.id, reset]);

  useEffect(() => {
    if (previousStep.current === zoomStep) return;
    const cam = camera as OrthographicCamera;
    transition.current = { position: cam.position.clone(), target: controls.current?.target.clone() ?? new Vector3(), ratio: MathUtils.clamp(cam.zoom / fitRef.current * Math.pow(1.2, zoomStep - previousStep.current), .65, 2.5) };
    previousStep.current = zoomStep;
  }, [camera, zoomStep]);

  useFrame((_, dt) => {
    const destination = transition.current;
    const controller = controls.current;
    if (!destination || !controller) return;
    controller.enabled = false;
    const cam = camera as OrthographicCamera;
    const alpha = motion ? 1 - Math.exp(-Math.min(dt, .05) * 9) : 1;
    cam.position.lerp(destination.position, alpha);
    controller.target.lerp(destination.target, alpha);
    cam.zoom = MathUtils.lerp(cam.zoom, destination.ratio * fitRef.current, alpha);
    cam.updateProjectionMatrix(); controller.update();
    if (cam.position.distanceTo(destination.position) < .05 && Math.abs(cam.zoom - destination.ratio * fitRef.current) < .0005 && controller.target.distanceTo(destination.target) < .05) {
      transition.current = null; controller.enabled = true;
    }
  }, -1);
  return <OrbitControls ref={controls} enableDamping={motion} dampingFactor={.08} minZoom={fit * .65} maxZoom={fit * 2.5} minPolarAngle={Math.PI / 2 - .22} maxPolarAngle={Math.PI / 2 + .22} minAzimuthAngle={-.28} maxAzimuthAngle={.28} enablePan panSpeed={.65} rotateSpeed={.4} />;
}
