import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import './DormitoryCanvas.css';

const MODEL_URL = '/models/dataf-dormitory.glb';
const LOOP_SECONDS = 16;
const PHASE_LABELS = { assembly: 'ค่อย ๆ เติมเต็มพื้นที่ของคุณ', hold: 'พื้นที่เล็ก ๆ สำหรับการเริ่มต้นที่ยิ่งใหญ่', disassembly: 'ทุกการเริ่มต้น ประกอบขึ้นได้เสมอ', static: 'มองหามุมที่เป็นคุณ' };
const ease = value => { const t = THREE.MathUtils.clamp(value, 0, 1); return t < .5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2; };

/** Disposes shared GPU resources only once, including textures on future model variants. */
function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const texture of textures) { texture.source?.data?.close?.(); texture.dispose(); }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function DormitoryFallback({ loading }) {
  return <div className={`dormitory-scene__fallback ${loading ? 'is-loading' : ''}`} aria-hidden="true">
    <div className="dormitory-scene__illustration"><div className="dormitory-scene__roof" />{[0, 1, 2].map(floor => <div className="dormitory-scene__floor" key={floor}>{[0, 1, 2, 3, 4, 5].map(room => <i key={room} />)}</div>)}<div className="dormitory-scene__ground" /></div>
  </div>;
}

/** Homepage-only WebGL island: no state, listeners or styling escape this component. */
export default function DormitoryCanvas() {
  const viewportRef = useRef(null);
  const apiRef = useRef(null);
  const [state, setState] = useState('loading');
  const [phase, setPhase] = useState('assembly');
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const host = viewportRef.current;
    if (!host) return undefined;
    let disposed = false;
    let renderer;
    let controls;
    let model;
    let animationId = 0;
    let lastTime = null;
    let elapsed = 4.5;
    let frameAccumulator = 0;
    let renderedFrames = 0;
    let inView = true;
    let isPaused = false;
    let failed = false;
    let currentPhase = '';
    let assembledParts = [];
    const abort = new AbortController();
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReduced = motionQuery.matches;
    setReducedMotion(prefersReduced);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-9, 9, 8, -8, .1, 100);
    const homePosition = new THREE.Vector3(12, 10.5, 15);
    const target = new THREE.Vector3(0, 2.5, 0);
    const draco = new DRACOLoader().setDecoderPath('/models/draco/').setWorkerLimit(1);
    const loader = new GLTFLoader().setDRACOLoader(draco);
    const ambient = new THREE.HemisphereLight(0xffffff, 0xb7c4d2, 2.4);
    const sunlight = new THREE.DirectionalLight(0xfff8ed, 3.1);
    sunlight.position.set(-7, 14, 9);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1024, 1024);
    Object.assign(sunlight.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: .5, far: 40 });
    sunlight.shadow.normalBias = .035;
    sunlight.shadow.bias = -.0002;
    scene.add(ambient, sunlight);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: .12 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -.12;
    shadow.receiveShadow = true;
    scene.add(shadow);

    const stop = () => { cancelAnimationFrame(animationId); animationId = 0; lastTime = null; frameAccumulator = 0; };
    const canAnimate = () => !disposed && !failed && model && inView && !document.hidden && !isPaused && !prefersReduced;
    const render = () => {
      if (disposed || failed || !renderer || document.hidden || !inView) return;
      renderer.render(scene, camera);
      host.dataset.frameCount = String(++renderedFrames);
      if (controls) host.dataset.cameraAzimuth = controls.getAzimuthalAngle().toFixed(4);
      host.dataset.drawCalls = String(renderer.info.render.calls);
      host.dataset.triangles = String(renderer.info.render.triangles);
    };
    const updateAssembly = () => {
      const time = elapsed % LOOP_SECONDS;
      const nextPhase = prefersReduced ? 'static' : time < 7 ? 'assembly' : time < 12 ? 'hold' : 'disassembly';
      if (currentPhase !== nextPhase) { currentPhase = nextPhase; setPhase(nextPhase); }
      for (const part of assembledParts) {
        let blend = 0;
        if (!prefersReduced) {
          if (time < 7) blend = 1 - ease((time - .5 - part.order * .16) / 1.85);
          else if (time >= 12) blend = ease((time - 12 - (23 - part.order) * .028) / 2.9);
        }
        part.object.position.copy(part.position).addScaledVector(part.offset, blend);
        part.object.rotation.set(part.tilt * blend, part.twist * blend, part.tilt * -.5 * blend);
      }
    };
    const tick = timestamp => {
      animationId = 0;
      if (!canAnimate()) { lastTime = null; return; }
      const delta = lastTime === null ? 0 : Math.min((timestamp - lastTime) / 1000, .06);
      lastTime = timestamp;
      elapsed += delta;
      frameAccumulator += delta;
      // 30 FPS is sufficient for this slow architectural motion; DPR is capped separately.
      if (frameAccumulator >= 1 / 30 || delta === 0) {
        updateAssembly();
        controls.autoRotate = elapsed % LOOP_SECONDS >= 7 && elapsed % LOOP_SECONDS < 12;
        controls.update(frameAccumulator);
        frameAccumulator = 0;
        render();
      }
      animationId = requestAnimationFrame(tick);
    };
    const sync = () => {
      stop();
      if (disposed || failed) return;
      if (controls && !canAnimate()) controls.autoRotate = false;
      if (model) { updateAssembly(); render(); }
      if (canAnimate()) animationId = requestAnimationFrame(tick);
    };
    const resize = () => {
      if (disposed || !renderer) return;
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      const aspect = width / height;
      const halfHeight = Math.max(7.4, 9.1 / aspect);
      camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
      camera.top = halfHeight; camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height, false);
      render();
    };
    const onMotion = () => { prefersReduced = motionQuery.matches; setReducedMotion(prefersReduced); sync(); };
    const onVisibility = () => sync();
    const onContextLost = event => { event.preventDefault(); failed = true; stop(); setState('fallback'); };
    const onControlsChange = () => { if (!canAnimate()) render(); };
    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; sync(); }, { threshold: .01 });

    const cleanup = () => {
      disposed = true;
      abort.abort();
      stop();
      apiRef.current = null;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      motionQuery.removeEventListener('change', onMotion);
      controls?.removeEventListener('change', onControlsChange);
      controls?.dispose();
      renderer?.domElement.removeEventListener('webglcontextlost', onContextLost);
      draco.dispose();
      disposeTree(scene);
      sunlight.shadow.dispose();
      scene.clear();
      renderer?.renderLists.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
    };

    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.setAttribute('aria-label', 'โมเดลหอพักสามมิติ ลากเพื่อหมุนดู หรือใช้ปุ่มหมุนด้านล่าง');
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.addEventListener('webglcontextlost', onContextLost);
      host.appendChild(renderer.domElement);
      camera.position.copy(homePosition);
      controls = new OrbitControls(camera, renderer.domElement);
      renderer.domElement.style.touchAction = 'pan-y';
      controls.target.copy(target);
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.enableDamping = false;
      controls.autoRotateSpeed = .4;
      controls.minPolarAngle = Math.PI * .17;
      controls.maxPolarAngle = Math.PI * .44;
      controls.update();
      controls.addEventListener('change', onControlsChange);
      resizeObserver.observe(host);
      intersectionObserver.observe(host);
      document.addEventListener('visibilitychange', onVisibility);
      motionQuery.addEventListener('change', onMotion);
      resize();
      apiRef.current = {
        pause() { isPaused = !isPaused; setPaused(isPaused); sync(); },
        rotate(direction) { const offset = camera.position.clone().sub(controls.target); offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), direction * Math.PI / 9); camera.position.copy(controls.target).add(offset); controls.update(); render(); },
        reset() { camera.position.copy(homePosition); controls.target.copy(target); controls.update(); render(); },
      };
      // Abort fetch on unmount; a decode already in flight is disposed on late resolution.
      fetch(MODEL_URL, { signal: abort.signal }).then(response => {
        if (!response.ok) throw new Error('Dormitory model could not be loaded');
        return response.arrayBuffer();
      }).then(bytes => {
        if (disposed) return null;
        return loader.parseAsync(bytes, '/models/');
      }).then(gltf => {
        if (!gltf) return;
        if (disposed) { disposeTree(gltf.scene); return; }
        model = gltf.scene;
        model.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
        assembledParts = model.children.map(object => {
          const data = object.userData;
          const order = Number(data.assemblyOrder || 0);
          const isRoom = data.category === 'room';
          const direction = Number(data.slot || 0) % 2 ? -1 : 1;
          return { object, order, position: object.position.clone(), offset: new THREE.Vector3(isRoom ? direction * .3 : 0, data.category === 'foundation' ? -.25 : 1.2 + Number(data.floor || 3) * .42, isRoom ? .3 : -.1), tilt: isRoom ? direction * .035 : .012, twist: isRoom ? direction * .07 : -.018 };
        });
        scene.add(model);
        setState('ready');
        sync();
      }).catch(error => {
        if (!disposed && error.name !== 'AbortError') { failed = true; stop(); setState('fallback'); }
      });
    } catch {
      failed = true;
      setState('fallback');
    }
    return cleanup;
  }, []);

  return <div className="dormitory-scene" data-state={state} data-phase={phase} data-paused={paused || reducedMotion}>
    <div className="dormitory-scene__viewport" ref={viewportRef} />
    {state !== 'ready' && <DormitoryFallback loading={state === 'loading'} />}
    <div className="dormitory-scene__caption">
      <span className="dormitory-scene__indicator" aria-hidden="true" />
      <span>{state === 'loading' ? 'กำลังจัดเตรียมหอพักของคุณ…' : state === 'fallback' ? 'พื้นที่พร้อมสำหรับทุกการเริ่มต้น' : PHASE_LABELS[phase]}</span>
    </div>
    {state === 'ready' && <div className="dormitory-scene__controls" aria-label="ควบคุมภาพหอพักสามมิติ">
      <span className="dormitory-scene__drag-hint">ลากเพื่อสำรวจ</span>
      <button type="button" onClick={() => apiRef.current?.rotate(-1)} aria-label="หมุนหอพักไปทางซ้าย" title="หมุนซ้าย"><ArrowLeft size={15} /></button>
      <button type="button" onClick={() => apiRef.current?.rotate(1)} aria-label="หมุนหอพักไปทางขวา" title="หมุนขวา"><ArrowRight size={15} /></button>
      <button type="button" onClick={() => apiRef.current?.reset()} aria-label="กลับสู่มุมมองเริ่มต้น" title="มุมมองเริ่มต้น"><RotateCcw size={15} /></button>
      {!reducedMotion && <button className="dormitory-scene__pause" type="button" onClick={() => apiRef.current?.pause()} aria-label={paused ? 'เล่นภาพเคลื่อนไหว' : 'หยุดภาพเคลื่อนไหว'} aria-pressed={paused}>{paused ? <Play size={14} /> : <Pause size={14} />}<span>{paused ? 'เล่น' : 'พัก'}</span></button>}
    </div>}
    {state === 'loading' && <span className="dormitory-scene__sr-only" role="status">กำลังโหลดโมเดลหอพักสามมิติ</span>}
    <span className="dormitory-scene__model-note">ภาพจำลองบรรยากาศหอพัก</span>
  </div>;
}
