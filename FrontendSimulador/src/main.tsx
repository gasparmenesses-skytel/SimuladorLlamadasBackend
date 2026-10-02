import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { softphone } from "./softphone/store";
import "./styles.css";

void softphone.init();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
