import { MotionConfig } from "framer-motion";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { ControlTower } from "./screens/ControlTower";
import { Counter } from "./screens/Counter";
import { Leakage } from "./screens/Leakage";
import { Planner } from "./screens/Planner";
import { Reorder } from "./screens/Reorder";
import { Simulate } from "./screens/Simulate";
import { Trail } from "./screens/Trail";
import { STATIC, StoreProvider } from "./state/store";

export default function App() {
  return (
    <MotionConfig reducedMotion={STATIC ? "always" : "user"}>
      <StoreProvider>
        <BrowserRouter>
          <Shell>
            <Routes>
              <Route path="/" element={<ControlTower />} />
              <Route path="/counter" element={<Counter />} />
              <Route path="/simulate" element={<Simulate />} />
              <Route path="/trail" element={<Trail />} />
              <Route path="/planner" element={<Planner />} />
              <Route path="/reorder" element={<Reorder />} />
              <Route path="/leakage" element={<Leakage />} />
              <Route path="*" element={<ControlTower />} />
            </Routes>
          </Shell>
        </BrowserRouter>
      </StoreProvider>
    </MotionConfig>
  );
}
