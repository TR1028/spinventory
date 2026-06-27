import { useEffect, useMemo, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { AddSession } from "./pages/AddSession";
import { AddRacket } from "./pages/AddRacket";
import { RacketDetail } from "./pages/RacketDetail";
import { ensureSeedData } from "./db/seed";

type Route =
  | { name: "dashboard" }
  | { name: "add-racket" }
  | {
      name: "racket-detail";
      racketId: string;
    }
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

  if (path === "/rackets/new") {
    return { name: "add-racket" };
  }

  if (path.startsWith("/rackets/")) {
    const racketId = decodeURIComponent(path.replace("/rackets/", ""));
    if (racketId) {
      return { name: "racket-detail", racketId };
    }
  }

  return { name: "dashboard" };
}

function navigateTo(route: Route) {
  if (route.name === "dashboard") {
    window.location.hash = "/";
    return;
  }

  if (route.name === "add-racket") {
    window.location.hash = "/rackets/new";
    return;
  }

  if (route.name === "racket-detail") {
    window.location.hash = `/rackets/${encodeURIComponent(route.racketId)}`;
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

    if (route.name === "add-racket") {
      return (
        <AddRacket
          onBack={() => navigateTo({ name: "dashboard" })}
          onCreated={(racketId) => navigateTo({ name: "racket-detail", racketId })}
        />
      );
    }

    if (route.name === "racket-detail") {
      return (
        <RacketDetail
          racketId={route.racketId}
          onBack={() => navigateTo({ name: "dashboard" })}
          onAddSession={(racketId) => navigateTo({ name: "add-session", racketId })}
          onDeleted={() => navigateTo({ name: "dashboard" })}
        />
      );
    }

    return (
      <Dashboard
        onAddSession={(racketId) => navigateTo({ name: "add-session", racketId })}
        onAddRacket={() => navigateTo({ name: "add-racket" })}
        onOpenRacket={(racketId) => navigateTo({ name: "racket-detail", racketId })}
      />
    );
  }, [route]);

  return <main className="app-shell bg-paper">{screen}</main>;
}
