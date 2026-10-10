import { lazy, Suspense, useEffect, useState } from "react";
import { AppProvider, useApp } from "./lib/store";
import { setLockHandler } from "./lib/api";
import { BottomNav, EmojiRain, PinPad, Reminders, Sidebar, SleepController, SleepDialog, Toasts } from "./components/shell";
import HomeScreen from "./screens/HomeScreen";
import Onboarding from "./screens/Onboarding";
import { OnScreenKeyboard, useKioskKeyboard } from "./components/Keyboard";
import { WeatherDialog } from "./components/WeatherDialog";
import { TimerLayer } from "./components/Timers";

const CalendarScreen = lazy(() => import("./screens/calendar/CalendarScreen"));
const TasksScreen = lazy(() => import("./screens/tasks/TasksScreen"));
const RewardsScreen = lazy(() => import("./screens/tasks/RewardsScreen"));
const ListsScreen = lazy(() => import("./screens/lists/ListsScreen"));
const MealsScreen = lazy(() => import("./screens/meals/MealsScreen"));
const RecipesScreen = lazy(() => import("./screens/meals/RecipesScreen"));
const SidekickScreen = lazy(() => import("./screens/sidekick/SidekickScreen"));
const SettingsScreen = lazy(() => import("./screens/settings/SettingsScreen"));

function Shell() {
  const app = useApp();
  const { screen, settings, unlock, profiles } = app;
  const [sleepDialog, setSleepDialog] = useState(false);
  const keyboard = useKioskKeyboard();

  useEffect(() => setLockHandler(unlock), [unlock]);
  useEffect(() => {
    // The wall display opens with ?kiosk=1: hide the mouse cursor there.
    if (new URLSearchParams(location.search).has("kiosk")) document.documentElement.classList.add("kiosk");
  }, []);
  useEffect(() => {
    document.documentElement.dataset.text = settings.textSize;
    document.documentElement.dataset.density = settings.density;
  }, [settings.textSize, settings.density]);

  if (!profiles.length && !localStorage.getItem("haven-skip-onboarding"))
    return (
      <>
        <Onboarding />
        {keyboard && <OnScreenKeyboard />}
      </>
    );

  const Screen = {
    home: HomeScreen,
    calendar: CalendarScreen,
    tasks: TasksScreen,
    rewards: RewardsScreen,
    lists: ListsScreen,
    meals: MealsScreen,
    recipes: RecipesScreen,
    sidekick: SidekickScreen,
    settings: SettingsScreen,
  }[screen];

  return (
    <div className="app">
      <Sidebar onSleep={() => setSleepDialog(true)} />
      <main className="main">
        <Suspense fallback={<div className="empty" style={{ flex: 1 }} />}>
          <Screen key={screen} />
        </Suspense>
      </main>
      <BottomNav />
      <PinPad />
      <Toasts />
      <EmojiRain />
      <SleepController />
      <Reminders />
      {sleepDialog && <SleepDialog onClose={() => setSleepDialog(false)} />}
      <WeatherDialog />
      <TimerLayer />
      {keyboard && <OnScreenKeyboard />}
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
