import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { shelfScroll } from "./motion";

/** Scroll nativo: il browser compone il movimento, React non aggiorna ogni frame. */
export function useShelfScroll(selectedId: string | null, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const move = useRef<(left: number) => void>(() => {});

  useEffect(() => {
    const rail = ref.current;
    if (!rail || !enabled) return;
    let target: number | null = null;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const clamp = (left: number) => Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, left));
    const finish = () => {
      clearTimeout(idle);
      target = null;
      delete rail.dataset.scrolling;
    };
    const stop = () => {
      if (target !== null) rail.scrollTo({ left: rail.scrollLeft, behavior: "auto" });
      finish();
    };
    const scrollTo = (left: number, smooth = !reduce) => {
      target = clamp(left);
      rail.scrollTo({ left: target, behavior: smooth ? "smooth" : "auto" });
    };
    move.current = scrollTo;
    const onScroll = () => {
      rail.dataset.scrolling = "true";
      clearTimeout(idle);
      // Fallback per WebView senza scrollend. Nessun loop rAF o render React.
      idle = setTimeout(finish, 140);
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      // Il gesto orizzontale e la sua inerzia restano gestiti dal browser.
      if (event.deltaX !== 0 || event.shiftKey) {
        stop();
        return;
      }
      if (!event.deltaY || rail.scrollWidth <= rail.clientWidth) return;
      const precise = event.deltaMode === 0 && Math.abs(event.deltaY) < shelfScroll.preciseThreshold;
      const unit = event.deltaMode === 1 ? shelfScroll.linePixels : event.deltaMode === 2 ? rail.clientWidth : 1;
      const delta = event.deltaY * unit * (precise ? 1 : shelfScroll.wheelGain);
      // Invertire direzione interrompe subito la destinazione precedente.
      const base = target !== null && Math.sign(target - rail.scrollLeft) === Math.sign(delta)
        ? target : rail.scrollLeft;
      const next = clamp(base + delta);
      // Ai bordi lasciamo passare il gesto verticale al contenitore esterno.
      if (Math.abs(next - rail.scrollLeft) < 1) return;
      event.preventDefault();
      scrollTo(next, !reduce && !precise);
    };
    rail.addEventListener("wheel", onWheel, { passive: false });
    rail.addEventListener("scroll", onScroll, { passive: true });
    rail.addEventListener("scrollend", finish);
    rail.addEventListener("pointerdown", stop, { passive: true });
    return () => {
      stop();
      move.current = () => {};
      rail.removeEventListener("wheel", onWheel);
      rail.removeEventListener("scroll", onScroll);
      rail.removeEventListener("scrollend", finish);
      rail.removeEventListener("pointerdown", stop);
    };
  }, [reduce, enabled]);

  useEffect(() => {
    const rail = ref.current;
    if (!rail || !enabled || !selectedId) return;
    const tile = rail.querySelector<HTMLElement>('[data-selected="true"]')?.closest<HTMLElement>(".clip-tile");
    if (!tile) return;
    const start = tile.offsetLeft - shelfScroll.edgeInset;
    const end = tile.offsetLeft + tile.offsetWidth + shelfScroll.edgeInset;
    if (start < rail.scrollLeft) move.current(start);
    else if (end > rail.scrollLeft + rail.clientWidth) move.current(end - rail.clientWidth);
  }, [selectedId, enabled]);

  return ref;
}
