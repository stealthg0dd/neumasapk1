"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Ring + core ───────────────────────────────────────────────────────────────

function ProcessorCore({ state }: { state: "uploading" | "processing" | "done" | "error" }) {
  const groupRef  = useRef<THREE.Group>(null);
  const ring1Ref  = useRef<THREE.Mesh>(null);
  const ring2Ref  = useRef<THREE.Mesh>(null);
  const coreRef   = useRef<THREE.Mesh>(null);
  const timerRef = useRef(new THREE.Timer());

  const color = state === "done"
    ? "#22d3ee"  // cyan
    : state === "error"
    ? "#f87171"  // red
    : "#a78bfa"; // purple

  useFrame((_, delta) => {
    if (!groupRef.current || !ring1Ref.current || !ring2Ref.current) return;
    timerRef.current.update();
    const speed = state === "processing" ? 1.4 : state === "uploading" ? 0.8 : 0.2;
    ring1Ref.current.rotation.z += delta * speed;
    ring2Ref.current.rotation.z -= delta * speed * 0.6;
    ring2Ref.current.rotation.x += delta * 0.3;

    if (coreRef.current) {
      const scale = 1 + Math.sin(timerRef.current.getElapsed() * 1.67) * (state === "processing" ? 0.1 : 0.04);
      coreRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Outer ring */}
      <mesh ref={ring1Ref}>
        <torusGeometry args={[1.3, 0.03, 16, 80]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
      </mesh>

      {/* Inner ring — tilted */}
      <mesh ref={ring2Ref} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[0.9, 0.025, 16, 60]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} />
      </mesh>

      {/* Core sphere */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.35, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={state === "done" ? 3 : 1}
          roughness={0.1}
          metalness={0.8}
        />
      </mesh>
    </group>
  );
}

// ── Orbiting particles ────────────────────────────────────────────────────────

function OrbitalParticles({ active }: { active: boolean }) {
  const ref   = useRef<THREE.Points>(null);
  const count = 600;

  const positions = useMemo(() => {
    const random = createSeededRandom(count + 11);
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r     = 1.8 + random() * 1.2;
      const theta = random() * Math.PI * 2;
      const phi   = Math.acos(2 * random() - 1);
      arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    if (!ref.current || !active) return;
    ref.current.rotation.y += delta * 0.25;
    ref.current.rotation.x += delta * 0.08;
  });

  return (
    <Points ref={ref} positions={positions} stride={3}>
      <PointMaterial
        transparent
        color="#67e8f9"
        size={0.025}
        sizeAttenuation
        depthWrite={false}
        opacity={active ? 0.7 : 0.2}
      />
    </Points>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────────

function Scene({ state }: { state: "uploading" | "processing" | "done" | "error" }) {
  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[3, 3, 3]} intensity={2} color="#a78bfa" />
      <pointLight position={[-3, -3, 3]} intensity={1.5} color="#22d3ee" />
      <ProcessorCore state={state} />
      <OrbitalParticles active={state === "processing"} />
    </>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

interface ScanProcessorProps {
  state: "uploading" | "processing" | "done" | "error";
}

export function ScanProcessor({ state }: ScanProcessorProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4], fov: 50 }}
      dpr={[1, 1.5]}
      style={{ background: "transparent" }}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
    >
      <Scene state={state} />
    </Canvas>
  );
}
