import { AnimatePresence } from "framer-motion";
import { useGameStore } from "./store/gameStore";
import ScreenTransition from "./components/layout/ScreenTransition";
import LoadingScreen from "./screens/LoadingScreen";
import TitleScreen from "./screens/TitleScreen";
import SetupScreen from "./screens/SetupScreen";
import LobbyScreen from "./screens/LobbyScreen";
import DraftScreen from "./screens/DraftScreen";
import PreBattleLoadingScreen from "./screens/PreBattleLoadingScreen";
import BattleScreen from "./screens/BattleScreen";
import GameOverScreen from "./screens/GameOverScreen";
import ErrorScreen from "./screens/ErrorScreen";

function ScreenRouter() {
  const screen = useGameStore((s) => s.screen);

  return (
    <AnimatePresence mode="wait">
      <ScreenTransition key={screen} screenKey={screen}>
        {renderScreen(screen)}
      </ScreenTransition>
    </AnimatePresence>
  );
}

function renderScreen(screen: string) {
  switch (screen) {
    case "loading":
      return <LoadingScreen />;
    case "title":
      return <TitleScreen />;
    case "setup":
      return <SetupScreen />;
    case "lobby":
      return <LobbyScreen />;
    case "draft":
      return <DraftScreen />;
    case "preBattleLoading":
      return <PreBattleLoadingScreen />;
    case "battle":
      return <BattleScreen />;
    case "gameOver":
      return <GameOverScreen />;
    default:
      return <ErrorScreen error={`Unknown screen: ${screen}`} />;
  }
}

export default function App() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0a0a1a] text-gray-200">
      <ScreenRouter />
    </div>
  );
}
