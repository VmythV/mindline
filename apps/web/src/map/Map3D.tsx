import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { NodeView } from './types';
import { layout3d, type Layout3dMode } from './layout3d';

/** 内置节点类型配色（与 2D 观感呼应）；未知类型用灰。 */
const TYPE_COLORS: Record<string, string> = {
  idea: '#2563eb',
  task: '#15803d',
  objective: '#d97706',
  keyResult: '#ca8a04',
  knowledge: '#7c3aed',
  requirement: '#0891b2',
  bug: '#dc2626',
};
const DEFAULT_COLOR = '#64748b';

function Scene({
  nodes,
  mode,
  onPick,
}: {
  nodes: NodeView[];
  mode: Layout3dMode;
  onPick: (id: string) => void;
}) {
  const { positions, edges } = useMemo(() => layout3d(nodes, mode), [nodes, mode]);
  // 仅渲染有坐标的节点（防御：脏数据/环已被 layout3d 跳过）
  const ordered = useMemo(() => nodes.filter((n) => positions.has(n.id)), [nodes, positions]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hover, setHover] = useState<number | null>(null);

  // 写入每个实例的位置矩阵与颜色（单 draw call）
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    ordered.forEach((n, i) => {
      const p = positions.get(n.id);
      if (!p) return;
      dummy.position.set(p[0], p[1], p[2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const c = new THREE.Color(TYPE_COLORS[n.type] ?? DEFAULT_COLOR);
      if (n.effectivePrivate || n.private) c.multiplyScalar(0.45); // 私有降饱和
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [ordered, positions]);

  // 父子边：单个 BufferGeometry 批量线段
  const lineGeo = useMemo(() => {
    const pts: number[] = [];
    for (const [parent, child] of edges) {
      const a = positions.get(parent);
      const b = positions.get(child);
      if (a && b) pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [edges, positions]);

  // LOD：节点越多，球体细分越低（减面，单 draw call 下进一步降 GPU 负载）
  const seg = ordered.length > 1500 ? 8 : ordered.length > 600 ? 10 : 14;
  const hovered = hover != null ? ordered[hover] : undefined;
  const hoveredPos = hovered ? positions.get(hovered.id) : undefined;

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[20, 30, 20]} intensity={0.5} />
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial color="#475569" transparent opacity={0.4} />
      </lineSegments>
      {ordered.length > 0 && (
        <instancedMesh
          ref={meshRef}
          key={ordered.length}
          args={[undefined, undefined, ordered.length]}
          onPointerMove={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            setHover(e.instanceId ?? null);
          }}
          onPointerOut={() => setHover(null)}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            const n = e.instanceId != null ? ordered[e.instanceId] : undefined;
            if (n) onPick(n.id);
          }}
        >
          <sphereGeometry args={[1, seg, seg]} />
          <meshStandardMaterial roughness={0.5} metalness={0.1} />
        </instancedMesh>
      )}
      {hovered && hoveredPos && (
        <Html position={hoveredPos} distanceFactor={28} zIndexRange={[100, 0]}>
          <div className="px-2 py-0.5 rounded bg-slate-900/90 text-white text-xs whitespace-nowrap shadow">
            {hovered.title || '（无标题）'}
          </div>
        </Html>
      )}
    </>
  );
}

/** 3D 树总览（只读，F10）。点击节点经 onPick 下钻定位回 2D。 */
export default function Map3D({
  nodes,
  mode = 'tree',
  onPick,
}: {
  nodes: NodeView[];
  mode?: Layout3dMode;
  onPick: (nodeId: string) => void;
}) {
  return (
    // frameloop="demand"：静止时不渲染，仅相机/交互变化时出帧（大图省 GPU/电）。
    // demand 下不用 damping（惯性需持续帧），OrbitControls 变化会自动 invalidate。
    <Canvas
      frameloop="demand"
      camera={{ position: [0, 12, 42], fov: 50 }}
      style={{ background: '#0f172a' }}
    >
      <Scene nodes={nodes} mode={mode} onPick={onPick} />
      <OrbitControls makeDefault />
    </Canvas>
  );
}
