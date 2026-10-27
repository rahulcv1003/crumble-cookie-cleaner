/** Shared, viewport-aware help for mouse, keyboard and touch. No action is run by a tooltip. */
import { t } from "../core/i18n";
import { h } from "./dom";

let active: HTMLElement | null = null;
let bubble: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let initialized = false;
const ID = "crumble-tooltip";

export function hideTooltip(): void {
  clearTimeout(timer);
  if (bubble) bubble.hidden = true;
  if (active) {
    const ids = (active.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((id) => id && id !== ID);
    if (ids.length) active.setAttribute("aria-describedby", ids.join(" "));
    else active.removeAttribute("aria-describedby");
    if (active.classList.contains("help-button")) active.setAttribute("aria-expanded", "false");
  }
  active = null;
}

function show(target: HTMLElement): void {
  hideTooltip();
  if (!target.isConnected || !target.dataset.tooltip) return;
  if (!bubble) {
    bubble = h("div", { id: ID, class: "tooltip", role: "tooltip", hidden: true });
    document.body.append(bubble);
  }
  active = target;
  bubble.textContent = target.dataset.tooltip;
  bubble.hidden = false;
  const ids = new Set((target.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
  ids.add(ID);
  target.setAttribute("aria-describedby", [...ids].join(" "));
  if (target.classList.contains("help-button")) target.setAttribute("aria-expanded", "true");
  // Keep the bubble inside the actual popup or window, not the layout viewport.
  const anchor = target.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  const bounds = bubble.getBoundingClientRect();
  const left = Math.max(12, Math.min(anchor.left + anchor.width / 2 - bounds.width / 2, width - bounds.width - 12));
  const below = anchor.bottom + 8;
  const top = below + bounds.height <= height - 12 ? below : Math.max(12, anchor.top - bounds.height - 8);
  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;
}

function initialize(): void {
  if (initialized) return;
  initialized = true;
  const targetFor = (event: Event) => event.target instanceof Element ? event.target.closest<HTMLElement>("[data-tooltip]") : null;
  document.addEventListener("pointerover", (event) => {
    const target = targetFor(event);
    if (!target || target === active) return;
    clearTimeout(timer);
    timer = setTimeout(() => show(target), 220);
  });
  document.addEventListener("pointerout", (event) => {
    const target = targetFor(event);
    if (!target) return;
    if (event.relatedTarget instanceof Node && (target.contains(event.relatedTarget) || bubble?.contains(event.relatedTarget))) return;
    clearTimeout(timer);
    // Leave enough time to move the pointer onto the help text (WCAG 1.4.13).
    timer = setTimeout(() => { if (document.activeElement !== active) hideTooltip(); }, 180);
  });
  document.addEventListener("focusin", (event) => {
    const target = targetFor(event);
    if (target) show(target);
    else hideTooltip();
  });
  document.addEventListener("focusout", (event) => { if (targetFor(event) === active) hideTooltip(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") hideTooltip(); });
  document.addEventListener("pointerdown", (event) => {
    const target = targetFor(event);
    if (target?.classList.contains("help-button")) {
      event.preventDefault();
      if (target === active) hideTooltip();
      else show(target);
    } else hideTooltip();
  });
  document.addEventListener("pointerover", (event) => { if (bubble?.contains(event.target as Node)) clearTimeout(timer); });
  document.addEventListener("pointerout", (event) => {
    if (event.target === bubble && !(event.relatedTarget instanceof Node && active?.contains(event.relatedTarget))) {
      if (document.activeElement !== active) hideTooltip();
    }
  });
  window.addEventListener("scroll", () => {
    // Keyboard focus can scroll a setting into view. Keep its help attached to
    // the new position rather than immediately dismissing the focused control.
    if (active && document.activeElement === active) show(active);
    else hideTooltip();
  }, true);
  window.addEventListener("resize", hideTooltip);
  new MutationObserver(() => { if (active && !active.isConnected) hideTooltip(); }).observe(document.body, { childList: true, subtree: true });
}

export function withTooltip<T extends HTMLElement>(control: T, text: string): T {
  initialize();
  control.dataset.tooltip = text;
  return control;
}

export function helpButton(label: string, text: string): HTMLButtonElement {
  const button = h("button", { type: "button", class: "help-button", "aria-label": t("helpFor", [label]), "aria-expanded": "false" }, "?");
  button.addEventListener("click", (event) => {
    // Keyboard and assistive-technology activation have no pointerdown event.
    if (event.detail === 0) {
      if (active === button) hideTooltip();
      else show(button);
    }
  });
  return withTooltip(button, text);
}
