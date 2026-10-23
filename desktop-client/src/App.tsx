import { useEffect, useState } from "react";
import { PseudoVoiceDashboard } from "./components/PseudoVoiceDashboard";
import { AuthScreen } from "./components/AuthScreen";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { readThemePreference, savePreference, type Theme } from "./lib/preferences";

function AppContent() {
  const { user, signOut } = useAuth();
  const [theme, setTheme] = useState<Theme>(readThemePreference);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    savePreference("theme", theme);
  }, [theme]);
  return user
    ? <PseudoVoiceDashboard user={user} onSignOut={signOut} theme={theme} onThemeChange={setTheme} />
    : <AuthScreen theme={theme} onThemeChange={setTheme} />;
}

function App() {
  return <AuthProvider><AppContent /></AuthProvider>;
}

export default App;
