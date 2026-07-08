import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { installStudioTheme } from "./theme/tokens";
import "./styles.css";

installStudioTheme();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("missing #root element");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
