import { useRef, useState, useEffect, useCallback } from 'react';
import { VISEME_SHAPES, visemeAt } from './visemes';

// Name probes. GLTFLoader strips "." from node names, so `GR_RIG_Head.001`
// becomes `GR_RIG_Head001` — the regexes below match both forms.
const MOUTH_RE = /smile|mouth|lip|viseme/i;
const HEAD_RE = /head/i;
const MORPH_RE = /mouth|jaw|lip|open|speak|viseme|smile/i;
const JAW_RE = /jaw|mandible|mouth/i;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Human-like lip sync.
 *
 * Every frame it reads the shared playback clock (`speechRef`), finds the
 * phoneme being spoken, and eases the mouth mesh toward that shape. It picks
 * whichever mouth control the model actually provides:
 *
 *   1. ``morph``  — a morph target named mouth/jaw/lip/...  (best)
 *   2. ``jaw``    — a jaw bone
 *   3. ``mesh``   — a dedicated mouth mesh (this model: `GR_HERO_Smile`)
 *
 * Only the mouth mesh and the rig head's *position* are touched, so the
 * authored idle rotation animation keeps playing untouched underneath.
 */
export function useLipSync({ scene, speechRef }) {
  const [mode, setMode] = useState('none');

  const modeRef = useRef('none');
  const morphMeshRef = useRef(null);
  const morphIndexRef = useRef(null);
  const jawBoneRef = useRef(null);

  const mouthRef = useRef(null);
  const origPosRef = useRef(null);
  const origScaleRef = useRef(null);
  const anchorRef = useRef(null);

  const headRef = useRef(null);
  const headOrigYRef = useRef(0);

  // Detect mouth + head controls once the model is available.
  useEffect(() => {
    modeRef.current = 'none';
    morphMeshRef.current = null;
    morphIndexRef.current = null;
    jawBoneRef.current = null;
    mouthRef.current = null;
    headRef.current = null;

    if (!scene) return;

    let morphFound = null;
    let jawFound = null;
    let mouthFound = null;
    let headFound = null;

    scene.traverse((child) => {
      const isMesh = child.isMesh || child.isSkinnedMesh;

      if (isMesh) {
        const dict = child.morphTargetDictionary;
        if (!morphFound && dict && Object.keys(dict).length) {
          const name = Object.keys(dict).find((n) => MORPH_RE.test(n));
          if (name) morphFound = { mesh: child, index: dict[name] };
        }
        if (!mouthFound && MOUTH_RE.test(child.name || '')) mouthFound = child;
      }

      if (!jawFound && child.skeleton && child.skeleton.bones) {
        const bone = child.skeleton.bones.find((b) => JAW_RE.test(b.name || ''));
        if (bone) jawFound = bone;
      }

      // The rig head node carries the whole face; it has many children.
      if (!headFound && HEAD_RE.test(child.name || '') && child.children && child.children.length > 3) {
        headFound = child;
      }
    });

    if (morphFound) {
      modeRef.current = 'morph';
      morphMeshRef.current = morphFound.mesh;
      morphIndexRef.current = morphFound.index;
    } else if (jawFound) {
      modeRef.current = 'jaw';
      jawBoneRef.current = jawFound;
    } else if (mouthFound) {
      modeRef.current = 'mesh';
      mouthRef.current = mouthFound;

      const geo = mouthFound.geometry;
      if (geo) {
        if (!geo.boundingBox) geo.computeBoundingBox();
        const box = geo.boundingBox;
        anchorRef.current = box
          ? {
              x: (box.min.x + box.max.x) / 2,
              y: box.max.y, // pivot on the upper lip: the mouth opens downward
              z: (box.min.z + box.max.z) / 2,
            }
          : { x: 0, y: 0, z: 0 };
      }
      origPosRef.current = {
        x: mouthFound.position.x,
        y: mouthFound.position.y,
        z: mouthFound.position.z,
      };
      origScaleRef.current = {
        x: mouthFound.scale.x,
        y: mouthFound.scale.y,
        z: mouthFound.scale.z,
      };
    }

    if (headFound) {
      headRef.current = headFound;
      headOrigYRef.current = headFound.position.y;
    }

    setMode(modeRef.current);
  }, [scene]);

  // Apply a mouth shape: open = jaw drop, wide = lip spread, round = lip purse.
  const applyShape = useCallback((open, wide, round, energy) => {
    const m = modeRef.current;

    if (m === 'morph') {
      const mesh = morphMeshRef.current;
      if (mesh && morphIndexRef.current != null) {
        mesh.morphTargetInfluences[morphIndexRef.current] = open;
      }
      return;
    }

    if (m === 'jaw') {
      const bone = jawBoneRef.current;
      if (bone) bone.rotation.x = open * 0.5;
      return;
    }

    if (m === 'mesh' && mouthRef.current && origPosRef.current && origScaleRef.current && anchorRef.current) {
      const mesh = mouthRef.current;
      const base = origScaleRef.current;
      const p = origPosRef.current;
      const a = anchorRef.current;

      const sy = base.y * (1 + open * 2.0); // vertical: jaw opens
      const sx = base.x * (1 + wide * 0.3 - round * 0.3); // horizontal: spread / purse
      const sz = base.z * (1 + round * 0.55); // depth: lips push forward on "oo"
      const dy = -open * 0.03; // a touch of jaw drop

      mesh.scale.set(sx, sy, sz);
      mesh.position.set(
        p.x + a.x * (base.x - sx),
        p.y + a.y * (base.y - sy) + dy,
        p.z + a.z * (base.z - sz)
      );

      // Barely-there head lift while talking keeps the face alive.
      if (headRef.current) {
        headRef.current.position.y = headOrigYRef.current + energy * 0.008;
      }
    }
  }, []);

  // Animation loop: read the clock, ease toward the current phoneme.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const cur = { open: 0, wide: 0, round: 0 };

    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const track = speechRef && speechRef.current;
      let target = VISEME_SHAPES.REST;
      let speaking = false;

      if (track && track.speaking) {
        speaking = true;
        let tMs;
        if (track.mode === 'audio' && track.audioEl) {
          tMs = track.audioEl.currentTime * 1000;
        } else {
          tMs = now - track.startedAt;
        }
        target = VISEME_SHAPES[visemeAt(track.timeline, tMs)] || VISEME_SHAPES.REST;
      }

      // Asymmetric easing: mouths open quickly and close a little slower.
      const ease = (c, t, riseTau, fallTau) => {
        const tau = t > c ? riseTau : fallTau;
        return c + (t - c) * (1 - Math.exp(-dt / tau));
      };

      cur.open = ease(cur.open, target.open, 0.03, 0.055);
      cur.wide = ease(cur.wide, target.wide, 0.045, 0.06);
      cur.round = ease(cur.round, target.round, 0.05, 0.06);

      // A whisper of natural tremor, only while speaking.
      const tremor = speaking ? Math.sin(now * 0.011) * 0.012 : 0;

      const open = clamp01(cur.open + tremor);
      const wide = clamp01(cur.wide);
      const round = clamp01(cur.round);
      const energy = speaking ? open : 0;

      applyShape(open, wide, round, energy);

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      cur.open = cur.wide = cur.round = 0;
      applyShape(0, 0, 0, 0);
      if (headRef.current) headRef.current.position.y = headOrigYRef.current;
    };
  }, [applyShape, speechRef]);

  return { mode };
}
