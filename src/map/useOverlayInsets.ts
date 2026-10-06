import { useEffect, useState, type RefObject } from 'react';
import { NO_INSETS, type Insets } from './levels';

/** Elements that sit over the map: the project or interconnector card and the filter panel. */
const OVERLAYS = '.card, .panel';

function measure(container: HTMLElement): Insets {
  const box = container.getBoundingClientRect();
  const insets = { ...NO_INSETS };
  for (const element of container.querySelectorAll(OVERLAYS)) {
    const r = element.getBoundingClientRect();
    if (r.width >= box.width - 1) {
      // Full-width bottom sheet (phones).
      insets.bottom = Math.max(insets.bottom, box.bottom - r.top);
    } else if (r.left <= box.left + 1) {
      insets.left = Math.max(insets.left, r.right - box.left);
    } else {
      insets.right = Math.max(insets.right, box.right - r.left);
    }
  }
  return insets;
}

function same(a: Insets, b: Insets): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

/**
 * How much of the map is covered by open panels, measured from the map's container. Updates
 * when a panel opens, closes or changes size.
 */
export function useOverlayInsets(mapRef: RefObject<HTMLElement | null>): Insets {
  const [insets, setInsets] = useState<Insets>(NO_INSETS);

  useEffect(() => {
    const container = mapRef.current?.parentElement;
    if (!container) return;
    const update = () => {
      const next = measure(container);
      setInsets((previous) => (same(previous, next) ? previous : next));
    };
    const resizes = new ResizeObserver(update);
    const watch = () => {
      resizes.disconnect();
      resizes.observe(container);
      container.querySelectorAll(OVERLAYS).forEach((element) => resizes.observe(element));
      update();
    };
    const children = new MutationObserver(watch);
    children.observe(container, { childList: true });
    const frame = requestAnimationFrame(watch);
    return () => {
      cancelAnimationFrame(frame);
      children.disconnect();
      resizes.disconnect();
    };
  }, [mapRef]);

  return insets;
}
