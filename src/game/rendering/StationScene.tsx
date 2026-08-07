import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { StationVisualState } from '../presentation/stationVisualState';
import { selectStationSceneStyle } from './stationSceneStyle';

interface StationSceneProps {
  readonly visualState: StationVisualState;
}

interface StationGeometryHandles {
  readonly beaconLight: THREE.PointLight;
  readonly beaconSignMaterial: THREE.MeshStandardMaterial;
  readonly storeLight: THREE.PointLight;
}

interface StationSceneRuntime extends StationGeometryHandles {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly skyLight: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly render: () => void;
}

const INITIAL_VISUAL_STATE: StationVisualState = {
  atmosphere: 'day',
  beaconStatus: 'stable',
  phase: 'day',
};

const addBox = (
  scene: THREE.Scene,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  color: THREE.ColorRepresentation,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.82 }),
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
};

const addEmissiveBox = (
  scene: THREE.Scene,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  color: THREE.ColorRepresentation,
  intensity: number,
): THREE.MeshStandardMaterial => {
  const mesh = addBox(scene, size, position, color);
  const material = mesh.material;
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    throw new TypeError('Emissive station mesh requires a standard material.');
  }
  material.emissive.set(color);
  material.emissiveIntensity = intensity;
  return material;
};

const addStationGeometry = (scene: THREE.Scene): StationGeometryHandles => {
  const ground = addBox(scene, [34, 0.6, 24], [0, -0.4, 0], '#858c52');
  ground.receiveShadow = true;

  addBox(scene, [34, 0.08, 2.2], [0, -0.05, -8.3], '#9da65d');
  addBox(scene, [34, 0.08, 1.6], [0, -0.04, -5.5], '#737d46');
  addBox(scene, [36, 0.12, 5.2], [0, 0, 7.2], '#303633');
  addBox(scene, [30, 0.04, 0.11], [-3, 0.08, 7.2], '#d7bd72');
  addBox(scene, [20, 0.1, 8.5], [-1, 0.02, 1.7], '#6d705a');

  addBox(scene, [10, 3.8, 7], [-4, 1.9, -1], '#d1b481');
  addBox(scene, [10.8, 0.5, 7.8], [-4, 4.05, -1], '#6f2c24');
  addBox(scene, [4.8, 3.1, 5.4], [7, 1.55, -2], '#8a846e');
  addBox(scene, [5.4, 0.45, 6], [7, 3.35, -2], '#46504b');
  addBox(scene, [7.8, 0.22, 3.4], [-3.2, 3.05, 4], '#713026');
  for (const x of [-6.4, 0]) addBox(scene, [0.18, 3, 0.18], [x, 1.5, 4], '#4c4538');

  addEmissiveBox(scene, [3.2, 1.35, 0.12], [-5.7, 1.85, 2.56], '#e7c56d', 0.45);
  addEmissiveBox(scene, [2.1, 1.35, 0.12], [-2.2, 1.85, 2.56], '#e7c56d', 0.45);

  for (const x of [-4.8, -1.4]) {
    addBox(scene, [1.2, 1.45, 0.8], [x, 0.72, 4.7], '#d9d1a7');
    addBox(scene, [0.36, 0.78, 0.12], [x, 0.82, 4.25], '#222b2c');
    addBox(scene, [1.32, 0.11, 0.92], [x, 1.48, 4.7], '#8a3028');
  }

  for (const x of [-11.5, -8.5, 2.5, 5.5, 11.5]) {
    addBox(scene, [0.35, 1.4, 0.35], [x, 0.7, -8.4], '#6d5744');
    addBox(scene, [2.5, 0.65, 0.28], [x, 1.4, -8.4], '#4f5a52');
  }

  addBox(scene, [0.5, 6, 0.5], [13.1, 3, 2.5], '#55483c');
  const beaconSignMaterial = addEmissiveBox(
    scene,
    [4.4, 1.45, 0.35],
    [13.1, 5.5, 2.5],
    '#ff6e4a',
    1.8,
  );

  const beaconLight = new THREE.PointLight('#ff6e4a', 120, 18, 1.8);
  beaconLight.position.set(13, 5.5, 2.2);
  beaconLight.castShadow = true;
  scene.add(beaconLight);

  const storeLight = new THREE.PointLight('#ffd68a', 65, 13, 1.5);
  storeLight.position.set(-4, 3, 1.5);
  scene.add(storeLight);

  return { beaconLight, beaconSignMaterial, storeLight };
};

export const StationScene = ({ visualState }: StationSceneProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<StationSceneRuntime>(null);
  const { atmosphere, beaconStatus } = visualState;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const initialStyle = selectStationSceneStyle(INITIAL_VISUAL_STATE);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(initialStyle.background);
    scene.fog = new THREE.FogExp2(initialStyle.background, initialStyle.fogDensity);

    const camera = new THREE.OrthographicCamera(-16, 16, 10, -10, 0.1, 100);
    camera.position.set(19, 22, 24);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(renderer.domElement);

    const skyLight = new THREE.HemisphereLight(
      initialStyle.hemisphereSky,
      initialStyle.hemisphereGround,
      initialStyle.hemisphereIntensity,
    );
    scene.add(skyLight);

    const sun = new THREE.DirectionalLight(
      initialStyle.sunColor,
      initialStyle.sunIntensity,
    );
    sun.position.set(-10, 20, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    const geometry = addStationGeometry(scene);

    const render = () => renderer.render(scene, camera);
    runtimeRef.current = {
      ...geometry,
      render,
      renderer,
      scene,
      skyLight,
      sun,
    };

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      const aspect = width / height;
      const viewHeight = 20;
      camera.left = (-viewHeight * aspect) / 2;
      camera.right = (viewHeight * aspect) / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    return () => {
      runtimeRef.current = null;
      observer.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          const mesh = object as THREE.Mesh;
          mesh.geometry.dispose();
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime === null) return;

    const style = selectStationSceneStyle({ atmosphere, beaconStatus });
    if (runtime.scene.background instanceof THREE.Color) {
      runtime.scene.background.set(style.background);
    }
    if (runtime.scene.fog instanceof THREE.FogExp2) {
      runtime.scene.fog.color.set(style.background);
      runtime.scene.fog.density = style.fogDensity;
    }
    runtime.skyLight.color.set(style.hemisphereSky);
    runtime.skyLight.groundColor.set(style.hemisphereGround);
    runtime.skyLight.intensity = style.hemisphereIntensity;
    runtime.sun.color.set(style.sunColor);
    runtime.sun.intensity = style.sunIntensity;
    runtime.storeLight.intensity = style.storeLightIntensity;
    runtime.beaconLight.color.set(style.beaconColor);
    runtime.beaconLight.intensity = style.beaconLightIntensity;
    runtime.beaconSignMaterial.emissive.set(style.beaconColor);
    runtime.beaconSignMaterial.emissiveIntensity = style.beaconSignEmissiveIntensity;
    runtime.render();
  }, [atmosphere, beaconStatus]);

  return (
    <div
      aria-label={`Great Plains station overview, ${visualState.atmosphere}, Beacon ${visualState.beaconStatus}`}
      className={`station-scene station-scene--${visualState.atmosphere}`}
      data-beacon-status={visualState.beaconStatus}
      ref={hostRef}
    >
      <div className="scene-label scene-label--store">Store</div>
      <div className="scene-label scene-label--garage">Garage plot</div>
      <div
        className="scene-label scene-label--beacon"
        data-status={visualState.beaconStatus}
      >
        Beacon {visualState.beaconStatus}
      </div>
    </div>
  );
};
