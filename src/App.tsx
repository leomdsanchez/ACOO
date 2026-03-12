import { RuntimeDashboard } from "./RuntimeDashboard";

function App() {
  const appName = import.meta.env.VITE_APP_NAME || "ACOO";
  return <RuntimeDashboard appName={appName} />;
}

export default App;
