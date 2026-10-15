/**
 * Tiny DOM builder. Text is always added as text nodes (never parsed as HTML), so
 * imported notes or patterns can never inject markup (PRD: no innerHTML with dynamic data).
 */
type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else if (key === "class") el.className = String(value);
    else if (key === "checked" || key === "value" || key === "disabled" || key === "selected" || key === "indeterminate") (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.firstChild.remove();
}

const SVG = "http://www.w3.org/2000/svg";
function svg(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export type MarkKind = "keep" | "restart" | "clean" | "none";

/** The status mark from docs/DESIGN.md: full, half, struck or dotted square. Decorative; text carries the meaning. */
export function mark(kind: MarkKind): SVGElement {
  const root = svg("svg", { viewBox: "0 0 24 24", class: `mark ${kind}`, "aria-hidden": "true", focusable: "false" });
  root.append(svg("rect", { class: "frame", x: "3", y: "3", width: "18", height: "18", rx: "2" }));
  if (kind === "restart") root.append(svg("path", { class: "fill", d: "M3 12 H21 V19 a2 2 0 0 1 -2 2 H5 a2 2 0 0 1 -2 -2 Z" }));
  if (kind === "clean") root.append(svg("path", { class: "stroke", d: "M6.5 17.5 L17.5 6.5" }));
  return root;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- responses are typed at each call site
export async function send<T = any>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}
