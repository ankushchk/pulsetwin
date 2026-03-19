import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ToastNotification from './components/ToastNotification.jsx';
import TopNav from './components/TopNav.jsx';

import Onboarding from './pages/Onboarding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MealLogger from './pages/MealLogger.jsx';
import VoiceCheckin from './pages/VoiceCheckin.jsx';
import WorkoutPlan from './pages/WorkoutPlan.jsx';
import AITrainer from './pages/AITrainer.jsx';
import BodyTwin from './pages/BodyTwin.jsx';
import Grocery from './pages/Grocery.jsx';
import Progress from './pages/Progress.jsx';
import Settings from './pages/Settings.jsx';

import { PulseTwinProvider } from './state/PulseTwinProvider.jsx';

export default function App() {
  return (
    <>
      <ToastNotification />
      <PulseTwinProvider>
        <BrowserRouter>
          <TopNav />
          <Routes>
            <Route path="/" element={<Navigate to="/onboarding" replace />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/meal" element={<MealLogger />} />
            <Route path="/voice" element={<VoiceCheckin />} />
            <Route path="/workout" element={<WorkoutPlan />} />
            <Route path="/trainer" element={<AITrainer />} />
            <Route path="/body-twin" element={<BodyTwin />} />
            <Route path="/grocery" element={<Grocery />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/settings" element={<Settings />} />
            <Route
              path="*"
              element={
                <div className="pt-page pt-container">
                  <div className="pt-card p-8 text-center">
                    <p className="pt-label">Error</p>
                    <h1 className="mt-2 pt-title">Page not found</h1>
                    <p className="mt-2 text-sm text-fit-muted">
                      Check the URL or use the navigation above.
                    </p>
                  </div>
                </div>
              }
            />
          </Routes>
        </BrowserRouter>
      </PulseTwinProvider>
    </>
  );
}

