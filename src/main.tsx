import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "framer-motion";
import App from "./App";
import { CopyError } from "./components/CopyError";
import "./styles.css";

const shot = new URLSearchParams(location.search).get("shot");
if (shot) {
  document.documentElement.classList.add("shot");
  const native = window.matchMedia.bind(window);
  window.matchMedia = ((query: string) => {
    if (query.includes("prefers-reduced-motion")) {
      return {
        matches: true,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      } as MediaQueryList;
    }
    return native(query);
  }) as typeof window.matchMedia;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user"><App /><CopyError /></MotionConfig>
  </React.StrictMode>
);
