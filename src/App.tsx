import { useEffect, useMemo, useState } from "react";
import { ErrorBanner } from "./components/ui";
import { useAppData } from "./db/store";
import { Dashboard } from "./pages/Dashboard";
import { AddSession } from "./pages/AddSession";
import { AddRacket } from "./pages/AddRacket";
import { Inventory, type InventoryTab } from "./pages/Inventory";
import { RacketDetail } from "./pages/RacketDetail";

type Route =
  | { name: "dashboard" }
  | { name: "add-racket" }
  | {
      name: "inventory";
      tab?: InventoryTab;
    }
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

  if (path === "/inventory") {
    return { name: "inventory", tab: params.get("tab") === "blades" ? "blades" : "rubbers" };
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

function routeToHash(route: Route) {
  if (route.name === "dashboard") return "/";
  if (route.name === "add-racket") return "/rackets/new";
  if (route.name === "inventory") return route.tab === "blades" ? "/inventory?tab=blades" : "/inventory";
  if (route.name === "racket-detail") return `/rackets/${encodeURIComponent(route.racketId)}`;

  const params = new URLSearchParams();
  if (route.racketId) params.set("racket", route.racketId);
  return `/add-session${params.size ? `?${params.toString()}` : ""}`;
}

function navigateTo(route: Route) {
  window.location.hash = routeToHash(route);
}

/** Updates the URL without a history entry or a re-render (e.g. the inventory tab). */
function replaceRoute(route: Route) {
  window.history.replaceState(window.history.state, "", `#${routeToHash(route)}`);
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => readRoute());
  const { error, clearError } = useAppData();

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Hash navigation keeps the previous scroll position; every screen should start at the top
  // (switching the inventory tab stays on the same screen).
  const screenKey = route.name === "racket-detail" || route.name === "add-session" ? `${route.name}:${route.racketId ?? ""}` : route.name;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screenKey]);

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

    if (route.name === "inventory") {
      return (
        <Inventory
          initialTab={route.tab}
          onBack={() => navigateTo({ name: "dashboard" })}
          onTabChange={(tab) => {
            replaceRoute({ name: "inventory", tab });
            setRoute({ name: "inventory", tab });
          }}
          onOpenRacket={(racketId) => navigateTo({ name: "racket-detail", racketId })}
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
          onOpenInventory={(tab) => navigateTo({ name: "inventory", tab })}
        />
      );
    }

    return (
      <Dashboard
        onAddSession={(racketId) => navigateTo({ name: "add-session", racketId })}
        onAddRacket={() => navigateTo({ name: "add-racket" })}
        onOpenRacket={(racketId) => navigateTo({ name: "racket-detail", racketId })}
        onOpenInventory={() => navigateTo({ name: "inventory" })}
      />
    );
  }, [route]);

  return (
    <main className="app-shell bg-paper">
      {error ? (
        <div className="sticky top-0 z-40 mx-auto w-full max-w-3xl px-4 pt-3 sm:px-6">
          <ErrorBanner message={error} onDismiss={clearError} />
        </div>
      ) : null}
      {screen}
    </main>
  );
}
