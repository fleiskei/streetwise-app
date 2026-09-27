import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { startSync } from "./lib/sync";
import "./styles.css";

registerSW({ immediate: true });

// Drop caches of earlier versions (they may contain HTML stored for tile/data URLs).
if ("caches" in window) for (const name of ["tiles", "city-data"]) void caches.delete(name);

startSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
