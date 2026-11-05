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
import "./kids-polish.css";
import "./date-field.css";
import "./journal-detail.css";
import "./family-hero.css";
import "./sidebar-toggle.css";
import "./tasks-v2.css";
import "./scroll-hints.css";
import "./scroll-hints.js";
import "./person-chips.css";
import "./avatar-stack.css";
import "./people-picker.css";
import "./swipe-row.css";
import "./calendar-v2.css";
import "./landscape.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {import.meta.env.VITE_BAYIT_CLOUD?<CloudRoot App={App}/>:<App/>}
  </React.StrictMode>,
);
