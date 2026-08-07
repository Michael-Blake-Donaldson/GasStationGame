import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface StationSceneProps {
  isNight: boolean;
}

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

const addStationGeometry = (scene: THREE.Scene): THREE.PointLight => {
  const ground = addBox(scene, [34, 0.6, 24], [0, -0.4, 0], '#75864d');
  ground.receiveShadow = true;

  addBox(scene, [36, 0.12, 5.2], [0, 0, 7.2], '#303633');
  addBox(scene, [10, 3.8, 7], [-4, 1.9, -1], '#d1b481');
  addBox(scene, [10.8, 0.5, 7.8], [-4, 4.05, -1], '#6f2c24');
  addBox(scene, [4.8, 3.1, 5.4], [7, 1.55, -2], '#8a846e');
  addBox(scene, [5.4, 0.45, 6], [7, 3.35, -2], '#46504b');

  for (const x of [-4.8, -1.4]) {
    addBox(scene, [1.2, 1.45, 0.8], [x, 0.72, 4.7], '#d9d1a7');
    addBox(scene, [0.36, 0.78, 0.12], [x, 0.82, 4.25], '#222b2c');
  }

  for (const x of [-11.5, -8.5, 2.5, 5.5, 11.5]) {
    addBox(scene, [0.35, 1.4, 0.35], [x, 0.7, -8.4], '#6d5744');
    addBox(scene, [2.5, 0.65, 0.28], [x, 1.4, -8.4], '#4f5a52');
  }

  addBox(scene, [0.5, 6, 0.5], [13.1, 3, 2.5], '#55483c');
  const beaconSign = addBox(scene, [4.4, 1.45, 0.35], [13.1, 5.5, 2.5], '#9f2825');
  const signMaterial = beaconSign.material;
  if (signMaterial instanceof THREE.MeshStandardMaterial) {
    signMaterial.emissive.set('#d2352f');
    signMaterial.emissiveIntensity = 1.8;
  }

  const beaconLight = new THREE.PointLight('#ff6e4a', 120, 18, 1.8);
  beaconLight.position.set(13, 5.5, 2.2);
  beaconLight.castShadow = true;
  scene.add(beaconLight);

  const storeLight = new THREE.PointLight('#ffd68a', 65, 13, 1.5);
  storeLight.position.set(-4, 3, 1.5);
  scene.add(storeLight);

  return beaconLight;
};

export const StationScene = ({ isNight }: StationSceneProps) => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isNight ? '#061217' : '#99b7b0');
    scene.fog = new THREE.FogExp2(scene.background, isNight ? 0.025 : 0.009);

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
      isNight ? '#6881a1' : '#d9ebed',
      '#253022',
      isNight ? 0.65 : 2.1,
    );
    scene.add(skyLight);

    const sun = new THREE.DirectionalLight(
      isNight ? '#7185ac' : '#fff0c5',
      isNight ? 0.6 : 3.2,
    );
    sun.position.set(-10, 20, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    const beaconLight = addStationGeometry(scene);
    beaconLight.intensity = isNight ? 160 : 28;

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
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frame = 0;
    const render = () => {
      frame = window.requestAnimationFrame(render);
      renderer.render(scene, camera);
    };
    render();

    return () => {
      window.cancelAnimationFrame(frame);
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
  }, [isNight]);

  return (
    <div
      className="station-scene"
      ref={hostRef}
      aria-label="Great Plains station overview"
    >
      <div className="scene-label scene-label--store">Store</div>
      <div className="scene-label scene-label--garage">Garage plot</div>
      <div className="scene-label scene-label--beacon">Beacon online</div>
    </div>
  );
};
