import { useEffect } from 'react';
import mermaid from 'mermaid';
import panzoom from 'panzoom';

let initialized = false;

const BTN = 'inline-flex items-center justify-center w-8 h-8 rounded text-xs font-semibold bg-white/80 dark:bg-neutral-800/80 text-muted-foreground hover:bg-accent hover:text-accent-foreground shadow-sm transition-colors';

export default function MermaidRenderer() {
  useEffect(() => {
    if (!initialized) {
      mermaid.initialize({ startOnLoad: false, theme: 'default' });
      initialized = true;
    }

    const preBlocks = document.querySelectorAll<HTMLPreElement>('pre[data-language="mermaid"]');
    if (preBlocks.length === 0) return;

    preBlocks.forEach(async (pre, index) => {
      const code = pre.querySelector('code');
      if (!code) return;
      const graphDefinition = code.textContent || '';
      if (!graphDefinition.trim()) return;

      try {
        const { svg } = await mermaid.render(`m-${index}-${Date.now()}`, graphDefinition);

        // ---- outer wrapper ----
        const wrapper = document.createElement('div');
        wrapper.className = 'relative my-6 overflow-hidden rounded-lg border bg-card';

        // ---- viewport: panzoom target ----
        const viewport = document.createElement('div');
        viewport.className = 'mermaid-viewport';
        viewport.style.overflow = 'hidden';
        viewport.style.maxHeight = '600px';
        viewport.style.cursor = 'grab';
        viewport.innerHTML = svg;

        const svgEl = viewport.querySelector('svg');
        if (svgEl) {
          svgEl.style.display = 'block';
          svgEl.style.margin = '0 auto';
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
        }

        wrapper.appendChild(viewport);
        pre.parentNode?.replaceChild(wrapper, pre);

        // ---- panzoom ----
        const pz = panzoom(viewport, {
          smoothScroll: false,
          minZoom: 0.3,
          maxZoom: 5,
          zoomDoubleClickSpeed: 1,
          onDoubleClick(e) { e.preventDefault(); },
        });

        // ---- toolbar ----
        const toolbar = document.createElement('div');
        toolbar.className = 'absolute top-2 right-2 flex gap-1 z-10';
        toolbar.innerHTML = `
          <button class="${BTN}" data-action="in"  title="放大">＋</button>
          <button class="${BTN}" data-action="out" title="缩小">−</button>
          <button class="${BTN}" data-action="fit" title="适应">⊡</button>
        `;
        wrapper.appendChild(toolbar);

        // ---- button handlers ----
        toolbar.addEventListener('click', (e) => {
          const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
          if (!btn) return;
          const a = btn.dataset.action;
          if (a === 'in')  pz.smoothZoom(0, 0, 1.4);
          if (a === 'out') pz.smoothZoom(0, 0, 0.7);
          if (a === 'fit') {
            // reset zoom first, then reset position
            pz.zoomAbs(0, 0, 1);
            pz.moveTo(0, 0);
          }
        });

        // ---- cursor ----
        viewport.addEventListener('mousedown', () => { viewport.style.cursor = 'grabbing'; });
        viewport.addEventListener('mouseup',   () => { viewport.style.cursor = 'grab'; });
        viewport.addEventListener('mouseleave', () => { viewport.style.cursor = 'grab'; });

      } catch (err) {
        console.error('Mermaid render error:', err);
      }
    });
  }, []);

  return null;
}
