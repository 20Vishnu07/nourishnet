/**
 * High-Performance Colorful Paper Confetti Explosion Utility
 * Creates a festive multi-colored blasting papers celebration across the screen.
 */

type ConfettiShape = 'rect' | 'circle' | 'ribbon';

interface Particle {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  rotation: number;
  vRot: number;
  color: string;
  shape: ConfettiShape;
  opacity: number;
}

export function blastPaperConfetti(options?: {
  particleCount?: number;
  colors?: string[];
  origin?: { x: number; y: number };
  durationMs?: number;
}) {
  if (typeof window === 'undefined') return;

  const count = options?.particleCount || 190;
  const colors = options?.colors || [
    '#10b981', // Emerald
    '#059669', // Forest Green
    '#3b82f6', // Sky Blue
    '#6366f1', // Indigo
    '#f59e0b', // Amber
    '#ef4444', // Crimson Red
    '#ec4899', // Pink
    '#8b5cf6', // Purple
    '#14b8a6', // Teal
    '#f97316', // Vibrant Orange
  ];

  // Create full-screen canvas overlay
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '999999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (canvas.parentNode) {
      document.body.removeChild(canvas);
    }
    return;
  }

  const resize = () => {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  };
  resize();

  const originX = options?.origin?.x ?? window.innerWidth * 0.5;
  const originY = options?.origin?.y ?? window.innerHeight * 0.65;

  // Initialize particles
  const particles: Particle[] = [];
  const shapes: ConfettiShape[] = ['rect', 'circle', 'ribbon'];

  for (let i = 0; i < count; i++) {
    // Angle: blast upwards and outwards (-160 deg to -20 deg)
    const angle = (Math.PI / 180) * (-90 + (Math.random() * 140 - 70));
    const speed = 14 + Math.random() * 26;
    const color = colors[Math.floor(Math.random() * colors.length)] ?? '#10b981';
    const shape = shapes[Math.floor(Math.random() * shapes.length)] ?? 'rect';

    particles.push({
      x: originX + (Math.random() * 40 - 20),
      y: originY + (Math.random() * 30 - 15),
      w: 8 + Math.random() * 12,
      h: 6 + Math.random() * 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: Math.random() * 360,
      vRot: (Math.random() * 16 - 8) * (Math.PI / 180),
      color,
      shape,
      opacity: 1,
    });
  }

  // Also add celebratory side cannon bursts for dramatic blasting papers effect
  for (let i = 0; i < count / 2; i++) {
    const leftBurst = i % 2 === 0;
    const startX = leftBurst ? window.innerWidth * 0.15 : window.innerWidth * 0.85;
    const angle = leftBurst
      ? (Math.PI / 180) * (-60 + (Math.random() * 40 - 20))
      : (Math.PI / 180) * (-120 + (Math.random() * 40 - 20));
    const speed = 16 + Math.random() * 22;
    const color = colors[Math.floor(Math.random() * colors.length)] ?? '#f59e0b';
    const shape = shapes[Math.floor(Math.random() * shapes.length)] ?? 'ribbon';

    particles.push({
      x: startX,
      y: window.innerHeight * 0.75,
      w: 9 + Math.random() * 12,
      h: 7 + Math.random() * 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: Math.random() * 360,
      vRot: (Math.random() * 18 - 9) * (Math.PI / 180),
      color,
      shape,
      opacity: 1,
    });
  }

  const startTime = performance.now();
  const maxDuration = options?.durationMs || 4500;

  function render(now: number) {
    if (!ctx) return;
    const elapsed = now - startTime;
    if (elapsed > maxDuration || particles.length === 0) {
      if (canvas.parentNode) {
        document.body.removeChild(canvas);
      }
      return;
    }

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    const fadeStart = maxDuration * 0.65;
    const globalAlpha = elapsed > fadeStart ? Math.max(0, 1 - (elapsed - fadeStart) / (maxDuration - fadeStart)) : 1;

    for (const p of particles) {
      // Physics update: gravity + drag
      p.vy += 0.42;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vRot;

      ctx.save();
      ctx.globalAlpha = p.opacity * globalAlpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'ribbon') {
        const scaleX = Math.cos(p.rotation * 1.5);
        ctx.scale(scaleX, 1);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * 1.5);
      } else {
        const scaleY = Math.sin(p.rotation * 2);
        ctx.scale(1, scaleY);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }

      ctx.restore();
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}