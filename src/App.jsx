import React, { Component, Suspense, useEffect, useRef, useState } from 'react';

import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, useAnimations, Html, Environment, Lightformer, ContactShadows } from '@react-three/drei';
import { LoopRepeat, NeutralToneMapping } from 'three';
import { VoiceInterface } from './components/VoiceInterface';
import './style.css';

class ViewerError extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <div className="error">The 3D view could not load. Please refresh, or <a href="/models/graduate-robot.glb" download>download the robot</a>.</div> : this.props.children; }
}
function Robot({ playing, speed, onSceneLoaded }) {
  const { scene, animations } = useGLTF('/models/graduate-robot.glb');
  const { actions, mixer } = useAnimations(animations, scene);
  useEffect(() => {
    if (onSceneLoaded) onSceneLoaded(scene);
  }, [scene, onSceneLoaded]);
  useEffect(() => {
    Object.values(actions).forEach(a => a.reset().setLoop(LoopRepeat, Infinity).play());
    return () => Object.values(actions).forEach(a => a.stop());
  }, [actions]);
  useEffect(() => { mixer.timeScale = playing ? speed : 0; }, [mixer, playing, speed]);
  return <primitive object={scene} />;
}
function CameraControls({ reset }) {
  const controls = useRef();
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(2.5, 3.4, 6);
    controls.current.target.set(0, 1.45, 0);
    controls.current.update();
  }, [camera, reset]);
  return <OrbitControls ref={controls} makeDefault target={[0, 1.45, 0]} enablePan={false} minDistance={4} maxDistance={12} minPolarAngle={0.5} maxPolarAngle={1.55} />;
}
function Viewer({ playing, speed, classroom, reset, onSceneLoaded }) {
  return <Canvas shadows dpr={[1, 1.75]} camera={{ position: [2.5, 3.4, 6], fov: 35 }} gl={{ antialias: true, toneMapping: NeutralToneMapping }}>
    <color attach="background" args={['#eceef2']} />
    <ambientLight intensity={0.7} />
    <directionalLight position={[-3, 7, 5]} intensity={2.4} />
    <directionalLight position={[4, 3, 2]} intensity={0.6} />
    <Environment resolution={128}>
      <Lightformer position={[-3, 4, 4]} scale={[5, 5, 1]} intensity={2} />
      <Lightformer position={[4, 2, -2]} rotation={[0, Math.PI, 0]} scale={[3, 4, 1]} intensity={2} />
    </Environment>
    <Suspense fallback={<Html center><span className="loading">Meeting your graduate…</span></Html>}>
      <Robot playing={playing} speed={speed} onSceneLoaded={onSceneLoaded} />
      {classroom && <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={10} blur={2} far={4} resolution={256} frames={1} />}
    </Suspense>
    <CameraControls reset={reset}/>
  </Canvas>;
}
function App() {
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [classroom, setClassroom] = useState(true);
  const [reset, setReset] = useState(0);
  const [robotScene, setRobotScene] = useState(null);
  return <main>
    <header><a className="brand" href="/" aria-label="Little Classroom home"><span className="brand-icon">✦</span> little classroom<span className="brand-dot">.</span></a><span className="project-tag">A LITTLE CURIOSITY GOES A LONG WAY</span></header>
    <section className="intro"><div><p className="eyebrow">READY FOR THE NEXT CHAPTER</p><h1>Big ideas.<br/><span>Little robot.</span></h1></div><p className="description">A friendly face for a world of discovery.<br/>Meet our little graduate, ready to explore.</p></section>
    <section className="studio" aria-label="Interactive graduate robot model"><div className="scene-label"><span className="live-dot"/> THE GRADUATE <span className="label-right">02 / GRADUATE ROBOT</span></div><div className="canvas-wrap"><ViewerError><Viewer playing={playing} speed={speed} classroom={classroom} reset={reset} onSceneLoaded={setRobotScene}/></ViewerError><span className="drag-hint">↔ Drag to look around · Scroll to zoom</span></div>
    <div className="controls"><div className="buttons"><button className="primary" onClick={() => setPlaying(p => !p)}>{playing ? 'Ⅱ Pause animation' : '▷ Play animation'}</button><button onClick={() => setReset(r => r + 1)}>↺ Reset view</button></div><div className="options"><label>Speed <select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><label className="toggle"><input type="checkbox" checked={classroom} onChange={e => setClassroom(e.target.checked)}/> Ground shadow</label></div></div></section>
    <VoiceInterface robotScene={robotScene} />
    <footer><div><strong>Made for curious minds.</strong><span> A little graduate. A world of possibilities.</span></div><a href="/models/graduate-robot.glb" download>Download 3D robot <span>↗</span></a></footer>
  </main>;
}
export default App;
