import { useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { BottomNavBar } from "./components/BottomNavBar";
import { Sidebar } from "./components/Sidebar";
import { TopAppBar } from "./components/TopAppBar";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { StatisticsPage } from "./pages/StatisticsPage";
import { WidgetConfigPage } from "./pages/WidgetConfigPage";

const AUTH_STORAGE_KEY = "chatbotadmin.rememberMe";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem(AUTH_STORAGE_KEY) === "true");
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogin = (rememberMe: boolean) => {
    if (rememberMe) {
      localStorage.setItem(AUTH_STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    setIsAuthenticated(true);
    navigate("/");
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setIsAuthenticated(false);
    navigate("/login");
  };

  if (!isAuthenticated || location.pathname === "/login") {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-row">
      <Sidebar onLogout={handleLogout} />
      <div className="flex-grow flex flex-col lg:pl-64 min-w-0">
        <Routes>
          <Route
            path="/"
            element={
              <>
                <TopAppBar title="Dashboard Übersicht" />
                <DashboardPage />
              </>
            }
          />
          <Route path="/widgets/:id" element={<WidgetConfigPage />} />
          <Route path="/statistiken" element={<StatisticsPage />} />
        </Routes>
      </div>
      <BottomNavBar />
    </div>
  );
}

export default App;
