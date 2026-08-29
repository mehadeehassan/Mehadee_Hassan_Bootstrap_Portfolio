(function () {
  const canUseCursorTrail = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!canUseCursorTrail || reducedMotion) return;

  const container = document.createElement("div");
  container.className = "cursor-smoke-container";
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);
  const cursorRing = document.createElement("span");
  cursorRing.className = "cursor-ring";
  container.appendChild(cursorRing);

  const particles = [];
  let ringX = 0;
  let ringY = 0;
  let targetX = 0;
  let targetY = 0;
  let lastX = 0;
  let lastY = 0;
  let hasPointer = false;
  let animationFrame = 0;
  let ringFrame = 0;

  function followCursor() {
    ringX += (targetX - ringX) * 0.18;
    ringY += (targetY - ringY) * 0.18;
    cursorRing.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
    ringFrame = requestAnimationFrame(followCursor);
  }
  followCursor();

  function addParticle(x, y, velocity) {
    if (particles.length >= 24) return;
    const element = document.createElement("span");
    element.className = "cursor-smoke-particle";
    const size = 7 + Math.random() * 9;
    const life = 420 + Math.random() * 260;
    element.style.width = `${size}px`;
    element.style.height = `${size}px`;
    container.appendChild(element);
    particles.push({
      element,
      x: x - size / 2,
      y: y - size / 2,
      started: performance.now(),
      life,
      driftX: (Math.random() - 0.5) * (0.35 + velocity * 0.05),
      driftY: -0.1 - Math.random() * 0.35,
      rotation: (Math.random() - 0.5) * 20
    });
  }

  function animate(now) {
    particles.forEach((particle, index) => {
      const progress = (now - particle.started) / particle.life;
      if (progress >= 1) {
        particle.element.remove();
        particles.splice(index, 1);
        return;
      }
      particle.x += particle.driftX;
      particle.y += particle.driftY;
      const scale = 0.75 + progress * 1.1;
      const opacity = 0.24 * (1 - progress) ** 1.5;
      particle.element.style.opacity = opacity;
      particle.element.style.transform = `translate3d(${particle.x}px, ${particle.y}px, 0) scale(${scale}) rotate(${particle.rotation * progress}deg)`;
    });
    animationFrame = particles.length ? requestAnimationFrame(animate) : 0;
  }

  window.addEventListener("pointermove", (event) => {
    targetX = event.clientX;
    targetY = event.clientY;
    if (!hasPointer) {
      ringX = targetX;
      ringY = targetY;
      cursorRing.classList.add("is-visible");
    }
    const distance = hasPointer ? Math.hypot(event.clientX - lastX, event.clientY - lastY) : 0;
    if (!hasPointer) {
      hasPointer = true;
      lastX = event.clientX;
      lastY = event.clientY;
      return;
    }
    if (distance < 5) return;
    lastX = event.clientX;
    lastY = event.clientY;
    addParticle(event.clientX, event.clientY, Math.min(distance, 40));
    if (!animationFrame) animationFrame = requestAnimationFrame(animate);
  }, { passive: true });
})();
