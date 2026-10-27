/** Small, original line icons for section navigation. */
export function navIcon(name: string): SVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const root = document.createElementNS(ns, "svg");
  root.setAttribute("viewBox", "0 0 24 24");
  root.setAttribute("class", "nav-icon");
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("focusable", "false");
  const paths: Record<string, string> = {
    lists: "M8 6h12M8 12h12M8 18h12M3 6h1M3 12h1M3 18h1",
    cleaning: "M12 3v4M5.6 5.6l2.8 2.8M3 12h4M5.6 18.4l2.8-2.8M12 17v4M18.4 18.4l-2.8-2.8M17 12h4M18.4 5.6l-2.8 2.8",
    "site-data": "M4 7c0-4 16-4 16 0s-16 4-16 0M4 7v5c0 4 16 4 16 0V7M4 12v5c0 4 16 4 16 0v-5",
    log: "M4 7V3m0 4h4M4.4 7A9 9 0 1 1 3 14M12 7v5l3 2",
    display: "M4 4h16v12H4zM8 21h8M12 16v5",
    about: "M12 8h.01M11 12h1v5m-1 0h3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  };
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", paths[name] ?? paths.about!);
  root.append(path);
  return root;
}
