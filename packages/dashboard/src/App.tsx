import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Overview } from "./pages/Overview";
import { Jobs } from "./pages/Jobs";
import { JobDetail } from "./pages/JobDetail";
import { Config } from "./pages/Config";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/config" element={<Config />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
