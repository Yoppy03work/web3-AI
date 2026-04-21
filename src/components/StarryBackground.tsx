"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  speed: number;
  baseOpacity: number;
}

interface ShootingStar {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  opacity: number;
  active: boolean;
}

export default function StarryBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let stars: Star[] = [];
    let shootingStar: ShootingStar = {
      x: 0,
      y: 0,
      length: 0,
      speed: 0,
      angle: 0,
      opacity: 0,
      active: false,
    };

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initStars();
    };

    const initStars = () => {
      stars = [];
      const numStars = Math.floor((canvas.width * canvas.height) / 4000); // 画面サイズに応じた星の数
      for (let i = 0; i < numStars; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 1.5 + 0.5,
          opacity: Math.random(),
          speed: Math.random() * 0.02 + 0.005,
          baseOpacity: Math.random() * 0.5 + 0.2, // 瞬きのベース
        });
      }
    };

    const spawnShootingStar = () => {
      if (shootingStar.active || Math.random() > 0.005) return; // 低確率で発生

      shootingStar = {
        x: Math.random() * canvas.width,
        y: 0,
        length: Math.random() * 80 + 20,
        speed: Math.random() * 10 + 5,
        angle: (Math.PI / 4) + (Math.random() * 0.2 - 0.1), // 右下へ斜め
        opacity: 1,
        active: true,
      };
    };

    const drawStars = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 通常の星を描画（瞬きエフェクト付き）
      stars.forEach((star) => {
        // sin波を使用してゆっくり瞬く
        star.opacity = star.baseOpacity + Math.sin(time * star.speed) * 0.3;
        
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(230, 233, 242, ${Math.max(0, star.opacity)})`;
        ctx.fill();
      });

      // 流れ星の描画と更新
      spawnShootingStar();
      if (shootingStar.active) {
        ctx.beginPath();
        ctx.moveTo(shootingStar.x, shootingStar.y);
        ctx.lineTo(
          shootingStar.x - Math.cos(shootingStar.angle) * shootingStar.length,
          shootingStar.y - Math.sin(shootingStar.angle) * shootingStar.length
        );
        ctx.strokeStyle = `rgba(255, 255, 255, ${shootingStar.opacity})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 位置の更新
        shootingStar.x += Math.cos(shootingStar.angle) * shootingStar.speed;
        shootingStar.y += Math.sin(shootingStar.angle) * shootingStar.speed;
        shootingStar.opacity -= 0.015; // 徐々に消える

        if (
          shootingStar.opacity <= 0 ||
          shootingStar.x > canvas.width ||
          shootingStar.y > canvas.height
        ) {
          shootingStar.active = false;
        }
      }

      animationFrameId = requestAnimationFrame(drawStars);
    };

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
    animationFrameId = requestAnimationFrame(drawStars);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[-1] pointer-events-none"
      aria-hidden="true"
    />
  );
}
