"use client";
/**
 * ParticleField — React Three Fiber background animation.
 *
 * Renders:
 * - 2,000 cyan particles rotating slowly (starfield feel)
 * - 3 large glowing gradient orbs drifting in 3D space
 * - Mouse-tracked subtle camera drift
 *
 * Must be dynamically imported with { ssr: false } to avoid SSR mismatch.
 *
 * Usage:
 * ```tsx
 * const ParticleField = dynamic(() => import("@/components/three/ParticleField"), { ssr: false });
 * <ParticleField />
 * ```
 */

import { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Points, PointMaterial, Sphere } from "@react-three/drei";
import * as THREE from "three";

// ── Floating particles ─────────────────────────────────────────────────────

function Particles({ count = 2000 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null!);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Distribute in a sphere of radius 5
      const r = 5 * Math.cbrt(Math.random()); // uniform sphere distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.04;
    ref.current.rotation.x += delta * 0.015;
  });

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#06b6d4"
        size={0.018}
        sizeAttenuation
        depthWrite={false}
        opacity={0.65}
      />
    </Points>
  );
}

// ── Glowing orb ────────────────────────────────────────────────────────────

interface OrbProps {
  position: [number, number, number];
  color: string;
  speed: number;
  radius: number;
}

function Orb({ position, color, speed, radius }: OrbProps) {
  const ref = useRef<THREE.Mesh>(null!);
  const baseY = position[1];
  const timer = useRef(new THREE.Timer());

  useFrame(() => {
    if (!ref.current) return;
    timer.current.update();
    const t = timer.current.getElapsed() * speed;
    ref.current.position.y = baseY + Math.sin(t) * 0.4;
    ref.current.position.x = position[0] + Math.cos(t * 0.7) * 0.3;
  });

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[radius, 32, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.07} />
    </mesh>
  );
}

// ── Mouse-drift camera ─────────────────────────────────────────────────────

function CameraDrift() {
  const { camera, gl } = useThree();
  const mouse = useRef({ x: 0, y: 0 });

  useMemo(() => {
    const el = gl.domElement;
    const handler = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    el.addEventListener("mousemove", handler);
    return () => el.removeEventListener("mousemove", handler);
  }, [gl]);

  useFrame(() => {
    camera.position.x += (mouse.current.x * 0.3 - camera.position.x) * 0.02;
    camera.position.y += (-mouse.current.y * 0.2 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// ── Scene ──────────────────────────────────────────────────────────────────

function Scene() {
  return (
    <>
      <ambientLight intensity={0.1} />
      <CameraDrift />
      <Particles count={2000} />
      {/* Cyan orb — top-left */}
      <Orb position={[-2.5, 1.5, -1]} color="#06b6d4" speed={0.4} radius={1.8} />
      {/* Purple orb — bottom-right */}
      <Orb position={[2.5, -1.5, -2]} color="#d946ef" speed={0.3} radius={2.2} />
      {/* Subtle teal accent — center */}
      <Orb position={[0, 0, -3]} color="#22d3ee" speed={0.2} radius={1.2} />
    </>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────

export default function ParticleField() {
  return (
    <Canvas
      camera={{ position: [0, 0, 4], fov: 65, near: 0.1, far: 50 }}
      gl={{ antialias: false, powerPreference: "low-power", alpha: true }}
      style={{ background: "transparent" }}
      dpr={[1, 1.5]} // cap pixel ratio for performance
    >
      <Scene />
    </Canvas>
  );
}
