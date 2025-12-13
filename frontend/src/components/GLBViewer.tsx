import { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader";

interface GLBViewerProps {
    src: string;
    alt?: string;
    onModelLoaded?: (gltf: GLTF, scene: THREE.Scene) => void;
    onError?: (err: Error) => void;
    enableSelection?: boolean;
    onMeshClick?: (mesh: THREE.Mesh) => void;
}

export default function GLBViewer({
    src,
    alt,
    onModelLoaded,
    onError,
    enableSelection = false,
    onMeshClick,
}: GLBViewerProps) {
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const loaderRef = useRef<GLTFLoader | null>(null);
    const currentModelRef = useRef<THREE.Group | THREE.Scene | null>(null);
    const animRef = useRef<number | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // separationValue: 0.0 .. 1.0 (0 = together, 1 = full separation)
    const [separationValue, setSeparationValue] = useState(0);

    // tuning
    const gapFactor = 1.2;      // base multiplier for per-mesh push distance
    const fallbackMeshSize = 0.5;

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.style.display = "block";
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = null;

        const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.01, 1000);
        camera.position.set(0, 1.6, 3);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.07;
        controls.screenSpacePanning = false;
        controls.minDistance = 0.05;
        controls.maxDistance = 1000;
        controls.target.set(0, 0.6, 0);

        // lights
        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        scene.add(hemi);
        const dir = new THREE.DirectionalLight(0xffffff, 0.9);
        dir.position.set(5, 10, 7.5);
        scene.add(dir);
        const rim = new THREE.DirectionalLight(0xffffff, 0.2);
        rim.position.set(-5, 2, -5);
        scene.add(rim);

        rendererRef.current = renderer;
        sceneRef.current = scene;
        cameraRef.current = camera;
        controlsRef.current = controls;

        const handleResize = () => {
            if (!mount) return;
            const w = mount.clientWidth;
            const h = mount.clientHeight;
            renderer.setSize(w, h);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        window.addEventListener("resize", handleResize);

        let mounted = true;
        const tick = () => {
            if (!mounted) return;
            controls.update();
            renderer.render(scene, camera);
            animRef.current = requestAnimationFrame(tick);
        };
        animRef.current = requestAnimationFrame(tick);

        return () => {
            mounted = false;
            window.removeEventListener("resize", handleResize);
            controls.dispose();
            if (animRef.current) cancelAnimationFrame(animRef.current);
            try { renderer.dispose(); } catch { }
            try { mount.removeChild(renderer.domElement); } catch { }
            scene.traverse((obj) => {
                if ((obj as any).geometry) (obj as any).geometry.dispose?.();
                if ((obj as any).material) {
                    if (Array.isArray((obj as any).material)) {
                        (obj as any).material.forEach((m: any) => m.dispose?.());
                    } else {
                        (obj as any).material.dispose?.();
                    }
                }
            });
            rendererRef.current = null;
            sceneRef.current = null;
            cameraRef.current = null;
            controlsRef.current = null;
        };
    }, []);

    // fit camera to object
    function frameModel(object3d: THREE.Object3D, camera: THREE.PerspectiveCamera, controls: OrbitControls | null, fitOffset = 1.2) {
        const box = new THREE.Box3().setFromObject(object3d);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxSize = Math.max(size.x, size.y, size.z);
        if (maxSize === 0) return;
        const fov = camera.fov * (Math.PI / 180);
        let distance = Math.abs((maxSize * fitOffset) / Math.tan(fov / 2));
        if (!isFinite(distance) || distance > 1000) distance = maxSize * 2;
        camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance * 0.3);
        camera.near = Math.max(0.01, distance / 1000);
        camera.far = Math.max(1000, distance * 10);
        camera.updateProjectionMatrix();
        if (controls) {
            controls.target.copy(center);
            controls.update();
        }
    }

    // update positions by applying orig + offset * separationValue
    function applySeparationToMeshes(root: THREE.Object3D, value: number) {
        root.traverse((node) => {
            if ((node as THREE.Mesh).isMesh) {
                const orig = node.userData.__origPos as THREE.Vector3 | undefined;
                const offset = node.userData.__sepOffsetLocal as THREE.Vector3 | undefined;
                if (orig && offset) {
                    node.position.copy(orig).addScaledVector(offset, value);
                }
            }
        });
    }

    // load model
    useEffect(() => {
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!scene || !camera) return;

        // clear previous
        if (currentModelRef.current) {
            scene.remove(currentModelRef.current);
            currentModelRef.current.traverse((obj) => {
                if ((obj as any).geometry) (obj as any).geometry.dispose?.();
                if ((obj as any).material) {
                    if (Array.isArray((obj as any).material)) {
                        (obj as any).material.forEach((m: any) => m.dispose?.());
                    } else {
                        (obj as any).material.dispose?.();
                    }
                }
            });
            currentModelRef.current = null;
            setSeparationValue(0);
        }

        if (!src) {
            setLoading(false);
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);

        if (!loaderRef.current) loaderRef.current = new GLTFLoader();
        const loader = loaderRef.current;

        loader.load(
            src,
            (gltf) => {
                const obj = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
                obj.userData.__gltf = gltf;

                // precompute offsets for separation:
                // 1) global center of entire model
                const globalBox = new THREE.Box3().setFromObject(obj);
                const globalCenter = globalBox.getCenter(new THREE.Vector3());

                // traverse meshes and compute local offset vectors (target_local - orig_local)
                obj.traverse((node) => {
                    if ((node as THREE.Mesh).isMesh) {
                        // ensure matrices up-to-date
                        node.updateMatrixWorld(true);

                        // store original local position
                        node.userData.__origPos = node.position.clone();

                        // world center of mesh
                        const meshBox = new THREE.Box3().setFromObject(node);
                        const meshCenterWorld = meshBox.getCenter(new THREE.Vector3());

                        // direction from global center -> mesh center (world)
                        const dir = new THREE.Vector3().subVectors(meshCenterWorld, globalCenter);
                        if (dir.lengthSq() < 1e-6) {
                            // fallback random direction
                            dir.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5));
                        }
                        dir.normalize();

                        // distance to push: based on mesh size
                        const meshSize = meshBox.getSize(new THREE.Vector3());
                        const meshMax = Math.max(meshSize.x, meshSize.y, meshSize.z) || fallbackMeshSize;
                        let distance = meshMax * gapFactor;
                        distance += 0.1 * meshMax;

                        // world target point
                        const worldTarget = new THREE.Vector3().addVectors(node.getWorldPosition(new THREE.Vector3()), dir.multiplyScalar(distance));

                        // convert worldTarget into parent's local coordinates
                        const parent = node.parent || obj;
                        parent.updateMatrixWorld(true);
                        const invParent = new THREE.Matrix4().copy(parent.matrixWorld).invert();
                        const localTarget = worldTarget.clone().applyMatrix4(invParent);

                        // compute offset in local space
                        const offsetLocal = new THREE.Vector3().subVectors(localTarget, node.position.clone());

                        node.userData.__sepOffsetLocal = offsetLocal;
                    }
                });

                // add to scene
                scene.add(obj);
                currentModelRef.current = obj;

                // frame camera
                frameModel(obj, camera, controls);

                setLoading(false);
                setError(null);
                onModelLoaded && onModelLoaded(gltf, scene);
            },
            undefined,
            (err) => {
                console.error("GLTFLoader error:", err);
                setLoading(false);
                setError((err as Error)?.message || "Failed to load 3D model");
                onError && onError(err as Error);
            }
        );

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    // when separationValue changes, update meshes positions immediately
    useEffect(() => {
        const model = currentModelRef.current;
        if (!model) return;
        const v = Number(separationValue) || 0;
        applySeparationToMeshes(model, v);
        // optionally, when user drags to max, reframe camera a bit for visibility
        if (v > 0.95 && cameraRef.current && controlsRef.current) {
            frameModel(model, cameraRef.current, controlsRef.current, 1.6);
        }
    }, [separationValue]);

    // optional click-to-select forwarding
    useEffect(() => {
        if (!enableSelection) return;
        const mount = mountRef.current;
        const camera = cameraRef.current;
        const scene = sceneRef.current;
        const renderer = rendererRef.current;
        if (!mount || !camera || !scene || !renderer) return;

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        function onPointerDown(ev: PointerEvent) {
            if (!renderer || !camera || !scene) return;
            const rect = renderer.domElement.getBoundingClientRect();
            pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);
            const intersects = raycaster.intersectObjects(scene.children, true);
            if (intersects && intersects.length) {
                const mesh = intersects[0].object as THREE.Mesh;
                onMeshClick && onMeshClick(mesh);
            }
        }

        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        return () => renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enableSelection, onMeshClick]);

    // UI
    return (
        <div
            ref={mountRef}
            style={{
                width: "100%",
                height: "100%",
                minHeight: 420,
                position: "relative",
                background: "transparent",
                borderRadius: 8,
                overflow: "hidden",
            }}
            aria-label={alt || "3D viewer"}
        >
            {/* horizontal separation slider (bottom overlay) */}
            <div style={{
                position: "absolute",
                left: 12,
                right: 12,
                bottom: 12,
                zIndex: 70,
                display: "flex",
                gap: 12,
                alignItems: "center",
                pointerEvents: "auto",
                background: "rgba(0,0,0,0.35)",
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.03)"
            }}>
                <div style={{ color: "var(--muted)", fontSize: 13, whiteSpace: "nowrap" }}>Explode</div>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={separationValue}
                    onChange={(e) => setSeparationValue(Number(e.target.value))}
                    style={{ flex: 1, appearance: "none", height: 6, borderRadius: 999, background: "linear-gradient(90deg,#2a2a2a,#111)" } as React.CSSProperties}
                    aria-label="Separate parts slider"
                />
                <div style={{ minWidth: 66, textAlign: "right", color: "var(--muted)", fontSize: 13 }}>
                    {(separationValue * 100).toFixed(0)}%
                </div>
            </div>

            {/* loading / error overlays */}
            {loading && (
                <div style={{
                    position: "absolute",
                    inset: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 60,
                    pointerEvents: "none"
                }}>
                    <div style={{
                        padding: 10,
                        background: "rgba(0,0,0,0.55)",
                        borderRadius: 8,
                        color: "var(--muted)",
                        fontSize: 13
                    }}>
                        Loading…
                    </div>
                </div>
            )}

            {error && (
                <div style={{
                    position: "absolute",
                    inset: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 80,
                    pointerEvents: "auto"
                }}>
                    <div style={{
                        padding: 10,
                        background: "rgba(20,10,10,0.9)",
                        borderRadius: 8,
                        color: "#ffb3b3",
                        fontSize: 13,
                        maxWidth: "80%",
                        textAlign: "center"
                    }}>
                        Error loading model: {String(error)}
                    </div>
                </div>
            )}
        </div>
    );
}
