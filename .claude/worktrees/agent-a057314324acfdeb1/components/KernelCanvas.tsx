"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Props {
  popped: boolean;
  onPop: () => void;
}

export default function KernelCanvas({ popped, onPop }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poppedRef = useRef(false);
  const sceneRef = useRef<{
    kernelGroup: THREE.Group;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    keyLight: THREE.PointLight;
    rotX: number;
    rotY: number;
    velX: number;
    velY: number;
    isDragging: boolean;
    prevX: number;
    prevY: number;
    time: number;
    animId: number;
    isPopped: boolean;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(320, 320);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 5.5);

    const ambient = new THREE.AmbientLight(0xF5EBC8, 0.5);
    scene.add(ambient);

    const keyLight = new THREE.PointLight(0xFFE8A0, 3.5, 30);
    keyLight.position.set(4, 3, 4);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0xC8A84B, 1.5, 20);
    fillLight.position.set(-3, -1, 2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xFFF5D0, 1.2);
    rimLight.position.set(0, -4, -3);
    scene.add(rimLight);

    const topLight = new THREE.PointLight(0xFFFFFF, 0.8, 15);
    topLight.position.set(0, 5, 2);
    scene.add(topLight);

    const kernelGroup = new THREE.Group();

    const bodyGeo = new THREE.SphereGeometry(1.0, 32, 32);
    const posArr = bodyGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < posArr.length; i += 3) {
      const x = posArr[i], y = posArr[i + 1], z = posArr[i + 2];
      posArr[i + 2] = z * 0.62;
      const taper = 1.0 - Math.max(0, y * 0.25);
      posArr[i] = x * taper;
      posArr[i + 2] = posArr[i + 2] * taper;
      const bulge = 1 + Math.max(0, (1 - Math.abs(y)) * 0.15);
      posArr[i] *= bulge;
      posArr[i + 1] = y * 1.35;
    }
    bodyGeo.attributes.position.needsUpdate = true;
    bodyGeo.computeVertexNormals();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xD4A840, roughness: 0.35, metalness: 0.08 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    kernelGroup.add(body);

    const highlightGeo = new THREE.SphereGeometry(0.99, 24, 24);
    const hPosArr = highlightGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < hPosArr.length; i += 3) {
      hPosArr[i + 2] *= 0.62;
      const taper = 1.0 - Math.max(0, hPosArr[i + 1] * 0.25);
      hPosArr[i] *= taper;
      hPosArr[i + 2] *= taper;
      const bulge = 1 + Math.max(0, (1 - Math.abs(hPosArr[i + 1])) * 0.15);
      hPosArr[i] *= bulge;
      hPosArr[i + 1] *= 1.35;
    }
    highlightGeo.attributes.position.needsUpdate = true;
    highlightGeo.computeVertexNormals();

    const highlightMat = new THREE.MeshStandardMaterial({ color: 0xF5D070, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.4 });
    const highlight = new THREE.Mesh(highlightGeo, highlightMat);
    kernelGroup.add(highlight);

    const creaseGeo = new THREE.CylinderGeometry(0.04, 0.03, 2.0, 8);
    const creaseMat = new THREE.MeshStandardMaterial({ color: 0x8A6018, roughness: 0.9 });
    const crease = new THREE.Mesh(creaseGeo, creaseMat);
    crease.position.z = 0.58;
    kernelGroup.add(crease);

    const tipGeo = new THREE.SphereGeometry(0.22, 12, 12);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xA07820, roughness: 0.6 });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.y = -1.3;
    tip.scale.z = 0.5;
    kernelGroup.add(tip);

    const germGeo = new THREE.SphereGeometry(0.28, 10, 10);
    const germMat = new THREE.MeshStandardMaterial({ color: 0xF0D898, roughness: 0.4 });
    const germ = new THREE.Mesh(germGeo, germMat);
    germ.position.set(0, -1.0, 0.4);
    germ.scale.set(1.2, 0.6, 0.5);
    kernelGroup.add(germ);

    kernelGroup.rotation.x = 0.15;
    kernelGroup.rotation.y = 0.3;
    scene.add(kernelGroup);

    const state = {
      kernelGroup, renderer, scene, camera, keyLight,
      rotX: 0.15, rotY: 0.3, velX: 0, velY: 0,
      isDragging: false, prevX: 0, prevY: 0,
      time: 0, animId: 0, isPopped: false,
    };
    sceneRef.current = state;

    // Drag handlers
    const onMouseDown = (e: MouseEvent) => { state.isDragging = true; state.prevX = e.clientX; state.prevY = e.clientY; canvas.style.cursor = "grabbing"; };
    const onMouseUp = () => { state.isDragging = false; canvas.style.cursor = "grab"; };
    const onMouseMove = (e: MouseEvent) => {
      if (!state.isDragging) return;
      state.velX = (e.clientX - state.prevX) * 0.01;
      state.velY = (e.clientY - state.prevY) * 0.01;
      state.rotY += state.velX; state.rotX += state.velY;
      state.prevX = e.clientX; state.prevY = e.clientY;
    };
    const onTouchStart = (e: TouchEvent) => { state.isDragging = true; state.prevX = e.touches[0].clientX; state.prevY = e.touches[0].clientY; };
    const onTouchEnd = () => { state.isDragging = false; };
    const onTouchMove = (e: TouchEvent) => {
      if (!state.isDragging) return;
      state.velX = (e.touches[0].clientX - state.prevX) * 0.01;
      state.velY = (e.touches[0].clientY - state.prevY) * 0.01;
      state.rotY += state.velX; state.rotX += state.velY;
      state.prevX = e.touches[0].clientX; state.prevY = e.touches[0].clientY;
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("touchstart", onTouchStart);
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchmove", onTouchMove);

    function animate() {
      state.animId = requestAnimationFrame(animate);
      state.time += 0.01;
      if (!state.isDragging && !state.isPopped) {
        state.velX *= 0.94; state.velY *= 0.94;
        state.rotY += state.velX + 0.005;
        state.rotX += state.velY;
        state.rotX = Math.max(-0.6, Math.min(0.6, state.rotX));
      }
      state.kernelGroup.rotation.y = state.rotY;
      state.kernelGroup.rotation.x = state.rotX;
      if (!state.isPopped) {
        const breathe = 1 + Math.sin(state.time * 0.8) * 0.015;
        state.kernelGroup.scale.setScalar(breathe);
      }
      state.keyLight.position.x = Math.sin(state.time * 0.4) * 5;
      state.keyLight.position.z = Math.cos(state.time * 0.4) * 4;
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(state.animId);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchmove", onTouchMove);
      renderer.dispose();
    };
  }, []);

  // Handle pop trigger from parent
  useEffect(() => {
    if (!popped || !sceneRef.current || poppedRef.current) return;
    poppedRef.current = true;
    const state = sceneRef.current;
    state.isPopped = true;

    let popTime = 0;
    const popAnim = setInterval(() => {
      popTime += 0.15;
      const s = 1 + Math.sin(popTime * 12) * 0.08 * Math.exp(-popTime * 0.5);
      state.kernelGroup.scale.setScalar(1 + popTime * 0.3 + s);
      if (popTime > 1.5) {
        clearInterval(popAnim);
        state.scene.remove(state.kernelGroup);
      }
    }, 16);
  }, [popped]);

  return (
    <div style={{ position: "relative", width: 320, height: 320, cursor: "grab" }}>
      {popped ? (
        <div style={{
          width: 320, height: 320, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 140,
          animation: "popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards",
        }}>
          🍿
          <style>{`@keyframes popIn { from { transform: scale(0); } to { transform: scale(1); } }`}</style>
        </div>
      ) : (
        <canvas ref={canvasRef} style={{ width: 320, height: 320, display: "block" }} />
      )}
      {!popped && (
        <div style={{
          position: "absolute", bottom: -20, left: "50%", transform: "translateX(-50%)",
          width: 120, height: 24,
          background: "radial-gradient(ellipse, rgba(150,120,40,0.25) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />
      )}
    </div>
  );
}
