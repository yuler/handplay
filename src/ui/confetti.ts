const COLORS = ['#ff7a6b', '#ffc93c', '#3fd4a2', '#5cc8ff', '#9b7bff', '#ff8fc7'];
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

/** One-shot DOM confetti burst; pieces remove themselves. Skipped for reduced motion. */
export function popConfetti(host: HTMLElement, count = 36) {
  host.innerHTML = '';
  if (reducedMotion?.matches) return;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('i');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = COLORS[i % COLORS.length];
    piece.style.animationDelay = `${Math.random() * 0.5}s`;
    piece.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
    piece.style.setProperty('--spin', `${(Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540)}deg`);
    if (i % 3 === 0) piece.style.borderRadius = '50%';
    host.appendChild(piece);
  }
  window.setTimeout(() => {
    host.innerHTML = '';
  }, 3200);
}
