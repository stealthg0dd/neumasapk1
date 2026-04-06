"use client";

import { useRef } from "react";
import type { Mesh } from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, Edges } from "@react-three/drei";
const COLORS = [
  "#0071a3",
  "#34c759",
  "#f5c15c",
  "#ff9500",
  "#5ac8fa",
  "#af52de",
];

export interface PantryItemCube {
  id: string;
  color: string;
  /** Normalized position inside the box [-0.35, 0.35] */
  position: [number, number, number];
}

function ItemCube({
  color,
  position,
}: {
  color: string;
  position: [number, number, number];
}) {
  const mesh = useRef<Mesh>(null);
  const scale = useRef(0.01);

  useFrame((_, delta) => {
    if (!mesh.current) return;
    const target = 1;
    scale.current += (target - scale.current) * (1 - Math.exp(-delta * 10));
    const s = Math.max(0.01, scale.current);
    mesh.current.scale.setScalar(s);
  });

  return (
    <mesh ref={mesh} position={position} castShadow>
      <boxGeometry args={[0.22, 0.22, 0.22]} />
      <meshStandardMaterial
        color={color}
        roughness={0.35}
        metalness={0.15}
        envMapIntensity={0.9}
      />
    </mesh>
  );
}

function PantryBoxFrame() {
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[1.4, 1, 1]} />
      <meshStandardMaterial
        color="#f5f5f7"
        transparent
        opacity={0.28}
        roughness={0.45}
        metalness={0.08}
      />
      <Edges color="#aeaeb2" threshold={18} />
    </mesh>
  );
}

function Scene({ items }: { items: PantryItemCube[] }) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        castShadow
        position={[4, 6, 4]}
        intensity={1.05}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <spotLight
        position={[-3, 5, 2]}
        angle={0.4}
        penumbra={0.6}
        intensity={0.6}
        color="#b8d4e8"
      />
      <Environment preset="city" />
      <PantryBoxFrame />
      {items.map((it) => (
        <ItemCube key={it.id} color={it.color} position={it.position} />
      ))}
      <OrbitControls
        enablePan={false}
        minDistance={2.4}
        maxDistance={5}
        maxPolarAngle={Math.PI / 1.9}
      />
    </>
  );
}

export interface PantrySceneProps {
  items: PantryItemCube[];
  className?: string;
}

/** 3D pantry “wow” — translucent box + spring-in cubes per scanned item. */
export function PantryScene({ items, className }: PantrySceneProps) {
  return (
    <div className={className ?? "h-[min(420px,50vh)] w-full rounded-2xl bg-gradient-to-b from-[#f5f5f7] to-[#e8e8ed]"}>
      <Canvas
        shadows
        camera={{ position: [2.2, 1.6, 2.8], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <Scene items={items} />
      </Canvas>
    </div>
  );
}

export function itemToCube(
  id: string,
  index: number,
  hueSeed?: string
): PantryItemCube {
  const color = COLORS[index % COLORS.length];
  const seed = (hueSeed ?? id).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rx = ((seed % 17) / 17 - 0.5) * 0.55;
  const ry = ((seed % 23) / 23 - 0.5) * 0.35;
  const rz = ((seed % 31) / 31 - 0.5) * 0.45;
  return {
    id,
    color,
    position: [rx, ry, rz],
  };
}
