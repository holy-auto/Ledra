"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { drawCertificateTexture, CARD_W, CARD_H } from "./certificateTexture";

/**
 * Hero シグネチャー 3D: 「浮かぶ証明書」。
 *
 * 構成: ガラス質の証明書カードが浮遊し、下から立ち上る光の粒（施工記録）が
 * カードを経てブロックチェーン（奥のブロック列）へ刻まれていく。
 * Gold のパルスが「アンカリングの瞬間」。ポインタで緩やかに視差。
 *
 * パフォーマンス方針:
 * - ポストプロセスなし。発光は加算ブレンドのスプライトで擬似的に。
 * - ジオメトリは plane / box / points のみ。dpr は最大 1.75。
 * - 表示可否は heroWebglGate で事前判定済み（このファイルは対応機でのみロードされる）。
 */

const GOLD = new THREE.Color("#c9a55c");
const BLUE = new THREE.Color("#4d9fff");
const VIOLET = new THREE.Color("#a78bfa");

/** 放射グラデーションの円テクスチャ（グロー/粒に共用） */
function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function CertificateCard({ pointer }: { pointer: React.MutableRefObject<{ x: number; y: number }> }) {
  const group = useRef<THREE.Group>(null);
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    drawCertificateTexture(c);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.getElapsedTime();
    // 浮遊 (bob) + 緩い自転 + ポインタ視差 (lerp)
    g.position.y = Math.sin(t * 0.7) * 0.12;
    const targetRotY = Math.sin(t * 0.35) * 0.22 + pointer.current.x * 0.18;
    const targetRotX = Math.sin(t * 0.5) * 0.05 - pointer.current.y * 0.12;
    g.rotation.y += (targetRotY - g.rotation.y) * 0.06;
    g.rotation.x += (targetRotX - g.rotation.x) * 0.06;
  });

  const aspect = CARD_W / CARD_H;
  const w = 3.7;
  const h = w / aspect;

  return (
    <group ref={group}>
      {/* カード本体（角丸はテクスチャの透明部分で表現） */}
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={texture} transparent metalness={0.55} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* 背面の淡い厚み（ガラスの奥行き感） */}
      <mesh position={[0, 0, -0.035]}>
        <planeGeometry args={[w * 1.004, h * 1.004]} />
        <meshBasicMaterial color="#1a2742" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** カード背後の大きなグロー */
function BackGlow({ map }: { map: THREE.Texture }) {
  const ref = useRef<THREE.Sprite>(null);
  useFrame(({ clock }) => {
    const s = ref.current;
    if (!s) return;
    const t = clock.getElapsedTime();
    const k = 5.6 + Math.sin(t * 0.8) * 0.25;
    s.scale.set(k, k * 0.72, 1);
  });
  return (
    <sprite ref={ref} position={[0, 0, -1.2]}>
      <spriteMaterial
        map={map}
        color={BLUE}
        transparent
        opacity={0.16}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </sprite>
  );
}

const PARTICLE_COUNT = 110;

/** 下から立ち上る記録の粒 */
function RecordParticles({ map }: { map: THREE.Texture }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const speeds = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // 決定的な擬似乱数（seed 固定）— リロードごとに見た目が変わらないように
      const r1 = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      const r2 = Math.abs(Math.sin(i * 78.233) * 12543.2971) % 1;
      const r3 = Math.abs(Math.sin(i * 39.425) * 26251.4133) % 1;
      positions[i * 3] = (r1 - 0.5) * 7;
      positions[i * 3 + 1] = (r2 - 0.5) * 5;
      positions[i * 3 + 2] = -0.8 - r3 * 2.2;
      speeds[i] = 0.15 + r3 * 0.35;
    }
    return { positions, speeds };
  }, []);

  useFrame((_, delta) => {
    const pts = ref.current;
    if (!pts) return;
    const arr = (pts.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3 + 1] += speeds[i] * delta;
      if (arr[i * 3 + 1] > 2.6) arr[i * 3 + 1] = -2.6;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={map}
        color={BLUE}
        size={0.055}
        transparent
        opacity={0.75}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

const BLOCK_COUNT = 5;
const ANCHOR_CYCLE = 4; // 秒 / ブロック

/** 奥へ連なるブロックチェーン。周期的に 1 ブロックが Gold に灯る = アンカリング */
function ChainBlocks() {
  const mats = useRef<THREE.MeshStandardMaterial[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const active = Math.floor(t / ANCHOR_CYCLE) % BLOCK_COUNT;
    const phase = (t % ANCHOR_CYCLE) / ANCHOR_CYCLE; // 0→1
    const pulse = Math.max(0, Math.sin(Math.min(phase * 2, 1) * Math.PI)); // 前半で点灯→減衰
    mats.current.forEach((m, i) => {
      if (!m) return;
      const on = i === active ? pulse : 0;
      m.emissive.copy(GOLD);
      m.emissiveIntensity = 0.06 + on * 0.9;
      m.opacity = 0.65 + on * 0.3;
    });
  });

  return (
    <group position={[2.35, -1.5, -1.6]} rotation={[0.35, -0.5, 0]}>
      {Array.from({ length: BLOCK_COUNT }, (_, i) => (
        <group key={i} position={[i * 0.78, i * 0.1, -i * 0.55]}>
          <mesh>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial
              ref={(m) => {
                if (m) mats.current[i] = m;
              }}
              color="#22355c"
              transparent
              opacity={0.65}
              metalness={0.4}
              roughness={0.5}
            />
          </mesh>
          {/* リンク */}
          {i < BLOCK_COUNT - 1 && (
            <mesh position={[0.39, 0.05, -0.27]} rotation={[0, 0.6, 0.12]}>
              <cylinderGeometry args={[0.012, 0.012, 0.55]} />
              <meshBasicMaterial color={GOLD} transparent opacity={0.35} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

export default function CertificateScene({ className = "" }: { className?: string }) {
  const pointer = useRef({ x: 0, y: 0 });
  const glow = useMemo(() => makeGlowTexture(), []);

  return (
    <div
      className={className}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.current.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      }}
      onPointerLeave={() => {
        pointer.current.x = 0;
        pointer.current.y = 0;
      }}
    >
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 5.4], fov: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
        aria-hidden
      >
        <ambientLight intensity={0.75} />
        <pointLight position={[-4, 2.5, 3]} intensity={26} color={BLUE} />
        <pointLight position={[4, -1.5, 2.5]} intensity={18} color={VIOLET} />
        <pointLight position={[0, 0.5, 3.5]} intensity={10} color="#ffffff" />

        <BackGlow map={glow} />
        <RecordParticles map={glow} />
        <CertificateCard pointer={pointer} />
        <ChainBlocks />
      </Canvas>
    </div>
  );
}
