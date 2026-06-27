import { useEffect, useMemo, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { AddSession } from "./pages/AddSession";
import { ensureSeedData } from "./db/seed";

type Route =
  | { name: "dashboard" }
  | {
      name: "add-session";
      racketId?: string;
    };

function readRoute(): Route {
  const hash = window.location.hash.replace(/^#/, "");
  const [path, query = ""] = hash.split("?");
  const params = new URLSearchParams(query);

  if (path === "/add-session") {
    return {
      name: "add-session",
      racketId: params.get("racket") ?? undefined,
    };
  }

  return { name: "dashboard" };
}

function navigateTo(route: Route) {
  if (route.name === "dashboard") {
    window.location.hash = "/";
    return;
  }

  const params = new URLSearchParams();
  if (route.racketId) params.set("racket", route.racketId);
  window.location.hash = `/add-session${params.size ? `?${params.toString()}` : ""}`;
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => readRoute());

  useEffect(() => {
    ensureSeedData();
  }, []);

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const screen = useMemo(() => {
    if (route.name === "add-session") {
      return (
        <AddSession
          initialRacketId={route.racketId}
          onBack={() => navigateTo({ name: "dashboard" })}
          onSaved={() => navigateTo({ name: "dashboard" })}
        />
      );
    }

    return <Dashboard onAddSession={(racketId) => navigateTo({ name: "add-session", racketId })} />;
  }, [route]);

  return <main className="app-shell bg-paper">{screen}</main>;
}
