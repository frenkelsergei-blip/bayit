import React from "react";
import { createRoot } from "react-dom/client";
import {CloudRoot} from "./cloud-client.jsx";
import { App } from "./App.jsx";
import "./styles.css";
import "./refinements.css";
import "./review-refinements.css";
import "./ux-polish.css";
import "./themes.css";
import "./family-profiles.css";
import "./navigation.css";
import "./motion-fx.css";
import "./skeleton.css";
import "./provider-logos.css";
import "./sidebar-fit.css";
import "./theme-color.js";
import "./splash.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {import.meta.env.VITE_BAYIT_CLOUD?<CloudRoot App={App}/>:<App/>}
  </React.StrictMode>,
);
