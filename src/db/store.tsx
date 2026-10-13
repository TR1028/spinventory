/**
 * Hybrid data store behind `useAppData()`.
 *
 * - **Local Mode** (signed out): records live in IndexedDB (Dexie) and are read with a live query.
 * - **Cloud Mode** (signed in): records live in Cloudflare D1 behind the Worker API. The client keeps
 *   an in-memory snapshot (cached in localStorage for instant start-up and offline reading) and
 *   merges the delta returned by every mutation instead of refetching.
 *
 * Both modes run the same planners from `./domain`, so pages use one set of async actions whatever
 * the mode. Actions throw `DomainError` / `ApiError` with user-facing (Chinese) messages. Local data
 * is left untouched while signed in and comes back after signing out; `importLocalToCloud()` copies
 * it into the account.
 */
import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { todayISO } from "../utils/date";
import { getErrorMessage } from "../utils/errors";
import { createId } from "../utils/id";
import {
  API_BASE_URL_STORAGE_KEY,
  ApiError,
  authApi,
  createCloudApi,
  getApiBaseUrl,
  getApiBaseUrlSource,
  readTokenExpiry,
  writeApiBaseUrlOverride,
  type ApiBaseUrlSource,
  type CloudApi,
} from "./cloudApi";
import { db } from "./database";
import {
  applyDelta,
  createEmptySnapshot,
  planCreateBoostingLog,
  planCreatePlaySession,
  planCreateRacket,
  planCreateRubber,
  planDeleteBoostingLog,
  planDeletePlaySession,
  planDeleteRacket,
  planDeleteRubber,
  planReplaceRubber,
  planStashRubber,
  planUpdateBoostingLog,
  planUpdatePlaySession,
  planUpdateRacket,
  planUpdateRubber,
  type CreateBoostingLogInput,
  type CreatePlaySessionInput,
  type CreateRacketInput,
  type CreateRubberInput,
  type DomainContext,
  type DomainResult,
  type ReplaceRubberInput,
  type StashRubberInput,
  type UpdateBoostingLogInput,
  type UpdatePlaySessionInput,
  type UpdateRacketInput,
  type UpdateRubberInput,
} from "./domain";
import { readLocalSnapshot, runLocalMutation, setLocalMeta } from "./localRepository";
import type {
  AppDataDelta,
  AppSnapshot,
  AuthConfigResponse,
  AuthResponse,
  EntityKey,
  MutationResponse,
  RegisterRequest,
  SyncImportResponse,
  UserProfile,
} from "./schema";
import { ensureSeedData, isPristineSeedData } from "./seed";

export type {
  CreateBoostingLogInput,
  CreatePlaySessionInput,
  CreateRacketInput,
  CreateRubberInput,
  OutgoingRubberAction,
  RacketSpecs,
  ReplaceRubberInput,
  RubberFields,
  RubberSource,
  StashRubberInput,
  UpdateBoostingLogInput,
  UpdatePlaySessionInput,
  UpdateRacketInput,
  UpdateRubberInput,
  UsedRubberHistory,
} from "./domain";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DataMode = "local" | "cloud";

/** `loading`: fetching the cloud snapshot; `error`: the last fetch failed (cached data may be shown). */
export type CloudStatus = "signed-out" | "loading" | "ready" | "error";

export type AppDataActions = {
  // Rackets
  /** Creates a racket (optionally mounting new / inventory rubbers); resolves to its id. */
  createRacket: (input: CreateRacketInput) => Promise<string>;
  updateRacket: (id: string, input: UpdateRacketInput) => Promise<void>;
  /** Deletes the racket with its rubbers (mounted and retired), their boosting logs and its sessions. */
  deleteRacket: (id: string) => Promise<void>;

  // Rubbers
  /** Adds inventory rubbers (several identical new sheets, or one used sheet); resolves to the record id. */
  createRubber: (input: CreateRubberInput) => Promise<string>;
  /** Edits a rubber; `removedAt: null` restores a retired rubber onto its (empty) slot. */
  updateRubber: (id: string, input: UpdateRubberInput) => Promise<void>;
  /** Takes a mounted rubber off for good (defaults to today), freezing its life; the slot becomes empty. */
  retireRubber: (id: string, date?: string) => Promise<void>;
  /**
   * 「放回囤货」: takes a mounted rubber off on `date` (default today), or brings a retired one back,
   * keeping it in the inventory as a used sheet whose life continues when it is mounted again.
   */
  stashRubber: (id: string, date?: string) => Promise<void>;
  deleteRubber: (id: string) => Promise<void>;
  /** Takes off whatever is on `input.side` (retired or stashed) and mounts a new or inventory rubber; resolves to its id. */
  replaceRubber: (racketId: string, input: ReplaceRubberInput) => Promise<string>;

  // Play sessions
  addPlaySession: (input: CreatePlaySessionInput) => Promise<string>;
  updatePlaySession: (id: string, input: UpdatePlaySessionInput) => Promise<void>;
  deletePlaySession: (id: string) => Promise<void>;

  // Boosting logs (boost numbers and the rubber's `boosted` flag are kept consistent)
  addBoostingLog: (input: CreateBoostingLogInput) => Promise<string>;
  updateBoostingLog: (id: string, input: UpdateBoostingLogInput) => Promise<void>;
  deleteBoostingLog: (id: string) => Promise<void>;
};

export type AppDataContextValue = AppDataActions & {
  mode: DataMode;
  /** Records of the active mode. */
  data: AppSnapshot;
  /** True until the first snapshot of the active mode is available. */
  isLoading: boolean;
  /** Background error (cloud load / sync / expired session). Actions throw their own errors. */
  error: string | null;
  clearError: () => void;

  cloud: {
    /** A Worker URL is available (saved in this browser, `VITE_API_BASE_URL`, or the dev proxy). */
    configured: boolean;
    /** Active Worker origin; empty for the same-origin dev proxy or when not configured. */
    apiBaseUrl: string;
    apiBaseUrlSource: ApiBaseUrlSource;
    status: CloudStatus;
    user: UserProfile | null;
    lastSyncedAt: string | null;
  };
  /** The browser's IndexedDB data (available in both modes, e.g. to offer an import). */
  local: {
    counts: Record<EntityKey, number>;
    /** Local data differs from the bundled demo data, so it is worth importing. */
    hasCustomData: boolean;
    /** When local data was last imported into the signed-in account. */
    importedAt: string | null;
  };

  getAuthConfig: () => Promise<AuthConfigResponse>;
  login: (identifier: string, password: string) => Promise<UserProfile>;
  register: (input: RegisterRequest) => Promise<UserProfile>;
  /** Signs out and forgets the cached cloud snapshot; the app returns to Local Mode. */
  logout: () => void;
  /** Re-fetches the cloud snapshot (no-op in Local Mode). Failures are reported through `error`. */
  refresh: () => Promise<void>;
  /** Upserts all local records into the signed-in account (cloud rows edited more recently win). */
  importLocalToCloud: () => Promise<SyncImportResponse>;
  /**
   * Saves a custom Worker URL for this browser (`null` / blank restores the default). Throws on an
   * invalid URL. Switching to another server signs out, since tokens are issued per Worker.
   */
  setApiBaseUrl: (url: string | null) => void;
};

// ---------------------------------------------------------------------------
// Session & cache persistence
// ---------------------------------------------------------------------------

type CloudSession = {
  token: string;
  user: UserProfile;
  /** Worker that issued the token (sessions of another server are discarded). */
  apiBaseUrl?: string;
};

type CloudState = {
  session: CloudSession;
  /** `null` until the first snapshot (or the localStorage cache) is available. */
  data: AppSnapshot | null;
  status: Exclude<CloudStatus, "signed-out">;
  lastSyncedAt: string | null;
};

const SESSION_STORAGE_KEY = "spinventory:auth";
const SNAPSHOT_CACHE_PREFIX = "spinventory:cloud-snapshot:";
/** Skip the offline cache for very large accounts to stay well inside the localStorage quota. */
const MAX_CACHE_LENGTH = 2_000_000;
const SESSION_EXPIRED_MESSAGE = "登录已过期，请重新登录";
const EMPTY_SNAPSHOT: AppSnapshot = createEmptySnapshot();

const importMetaKey = (userId: string) => `cloud-import:${userId}`;

function storageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable (private mode): nothing to remove.
  }
}

function isUserProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return typeof user.id === "string" && typeof user.username === "string";
}

function readStoredSession(): CloudSession | null {
  if (getApiBaseUrlSource() === "none") return null;
  const raw = storageGet(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token?: unknown; user?: unknown; apiBaseUrl?: unknown };
    if (typeof parsed.token !== "string" || !isUserProfile(parsed.user)) throw new Error("Invalid session");
    const apiBaseUrl = getApiBaseUrl();
    if (typeof parsed.apiBaseUrl === "string" && parsed.apiBaseUrl !== apiBaseUrl) throw new Error("Other server");
    const expiresAt = readTokenExpiry(parsed.token);
    if (expiresAt !== undefined && expiresAt <= Date.now()) throw new Error("Expired session");
    return { token: parsed.token, user: parsed.user, apiBaseUrl };
  } catch {
    storageRemove(SESSION_STORAGE_KEY);
    return null;
  }
}

function normalizeSnapshot(value: Partial<AppSnapshot> | null | undefined): AppSnapshot {
  return {
    rackets: Array.isArray(value?.rackets) ? value.rackets : [],
    rubbers: Array.isArray(value?.rubbers) ? value.rubbers : [],
    boostingLogs: Array.isArray(value?.boostingLogs) ? value.boostingLogs : [],
    playSessions: Array.isArray(value?.playSessions) ? value.playSessions : [],
  };
}

function readCachedSnapshot(userId: string) {
  const raw = storageGet(SNAPSHOT_CACHE_PREFIX + userId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { snapshot?: Partial<AppSnapshot>; syncedAt?: unknown };
    return {
      snapshot: normalizeSnapshot(parsed.snapshot),
      syncedAt: typeof parsed.syncedAt === "string" ? parsed.syncedAt : null,
    };
  } catch {
    return null;
  }
}

function writeCachedSnapshot(userId: string, snapshot: AppSnapshot, syncedAt: string) {
  const json = JSON.stringify({ snapshot, syncedAt });
  if (json.length > MAX_CACHE_LENGTH || !storageSet(SNAPSHOT_CACHE_PREFIX + userId, json)) {
    storageRemove(SNAPSHOT_CACHE_PREFIX + userId);
  }
}

type ApiState = { url: string; source: ApiBaseUrlSource };

function readApiState(): ApiState {
  return { url: getApiBaseUrl(), source: getApiBaseUrlSource() };
}

function createCloudState(session: CloudSession): CloudState {
  const cached = readCachedSnapshot(session.user.id);
  return { session, data: cached?.snapshot ?? null, status: "loading", lastSyncedAt: cached?.syncedAt ?? null };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createLocalContext(): DomainContext {
  return { now: new Date().toISOString(), today: todayISO(), createId };
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Fills an omitted / blank date with the device's local date (the Worker would fall back to UTC). */
function dateOrToday(value: string | undefined) {
  return value && value.trim() ? value : todayISO();
}

async function createdId(promise: Promise<string | undefined>) {
  const id = await promise;
  if (!id) throw new Error("服务器没有返回新记录的 ID");
  return id;
}

async function completed(promise: Promise<unknown>) {
  await promise;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [cloud, setCloudState] = useState<CloudState | null>(() => {
    const session = readStoredSession();
    return session ? createCloudState(session) : null;
  });
  /** Source of truth for callbacks (always current, unlike the rendered `cloud`). */
  const cloudRef = useRef(cloud);
  const [api, setApi] = useState<ApiState>(readApiState);
  const [error, setError] = useState<string | null>(null);
  const fetchSeqRef = useRef(0);
  /** Deltas applied while a snapshot fetch is in flight; replayed on top of its (older) result. */
  const pendingDeltasRef = useRef<AppDataDelta[] | null>(null);

  const updateCloud = useCallback((next: CloudState | null | ((current: CloudState | null) => CloudState | null)) => {
    const value = typeof next === "function" ? next(cloudRef.current) : next;
    cloudRef.current = value;
    setCloudState(value);
  }, []);

  /** Updates the cloud state only while `token` is still the active session. */
  const updateSession = useCallback(
    (token: string, update: (current: CloudState) => CloudState) =>
      updateCloud((current) => (current && current.session.token === token ? update(current) : current)),
    [updateCloud],
  );

  const switchSession = useCallback(
    (session: CloudSession | null) => {
      fetchSeqRef.current += 1;
      pendingDeltasRef.current = null;
      updateCloud(session ? createCloudState(session) : null);
    },
    [updateCloud],
  );

  const startSession = useCallback(
    ({ token, user }: AuthResponse) => {
      const session: CloudSession = { token, user, apiBaseUrl: getApiBaseUrl() };
      storageSet(SESSION_STORAGE_KEY, JSON.stringify(session));
      setError(null);
      switchSession(session);
    },
    [switchSession],
  );

  const endSession = useCallback(
    ({ clearCache, message = null }: { clearCache: boolean; message?: string | null }) => {
      const userId = cloudRef.current?.session.user.id;
      storageRemove(SESSION_STORAGE_KEY);
      if (userId && clearCache) storageRemove(SNAPSHOT_CACHE_PREFIX + userId);
      setError(message);
      switchSession(null);
    },
    [switchSession],
  );

  /** Signs out when the API rejects the active token; returns whether `error` was a 401. */
  const handleAuthFailure = useCallback(
    (error: unknown, token: string) => {
      if (!(error instanceof ApiError) || error.status !== 401) return false;
      if (cloudRef.current?.session.token === token) endSession({ clearCache: false, message: SESSION_EXPIRED_MESSAGE });
      return true;
    },
    [endSession],
  );

  const loadCloudSnapshot = useCallback(
    async (signal?: AbortSignal) => {
      const session = cloudRef.current?.session;
      if (!session) return;
      const fetchId = ++fetchSeqRef.current;
      pendingDeltasRef.current = [];
      updateSession(session.token, (current) => ({ ...current, status: "loading" }));

      try {
        const fetched = normalizeSnapshot(await createCloudApi(session.token).snapshot(signal));
        if (fetchId !== fetchSeqRef.current) return;
        const data = (pendingDeltasRef.current ?? []).reduce((snapshot, delta) => applyDelta(snapshot, delta), fetched);
        pendingDeltasRef.current = null;
        updateSession(session.token, (current) => ({
          ...current,
          data,
          status: "ready",
          lastSyncedAt: new Date().toISOString(),
        }));
      } catch (error) {
        if (isAbortError(error) || fetchId !== fetchSeqRef.current) return;
        pendingDeltasRef.current = null;
        if (handleAuthFailure(error, session.token)) return;
        updateSession(session.token, (current) => ({ ...current, status: "error" }));
        setError(`同步云端数据失败：${getErrorMessage(error)}`);
      }
    },
    [handleAuthFailure, updateSession],
  );

  // Demo data for first-time Local Mode users (idempotent).
  useEffect(() => {
    ensureSeedData().catch((error: unknown) => console.error("Failed to seed local data", error));
  }, []);

  // Load the cloud snapshot whenever a session starts (sign-in, page load, another tab).
  const activeToken = cloud?.session.token;
  useEffect(() => {
    if (!activeToken) return;
    const controller = new AbortController();
    void loadCloudSnapshot(controller.signal);
    return () => controller.abort();
  }, [activeToken, loadCloudSnapshot]);

  // Keep the offline cache in step with the in-memory cloud snapshot.
  const cloudData = cloud?.data ?? null;
  const cloudUserId = cloud?.session.user.id;
  const lastSyncedAt = cloud?.lastSyncedAt ?? null;
  useEffect(() => {
    if (cloudUserId && cloudData && lastSyncedAt) writeCachedSnapshot(cloudUserId, cloudData, lastSyncedAt);
  }, [cloudUserId, cloudData, lastSyncedAt]);

  // Follow sign-in / sign-out and server changes performed in other tabs.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== SESSION_STORAGE_KEY && event.key !== API_BASE_URL_STORAGE_KEY) return;
      setApi(readApiState());
      const session = readStoredSession();
      if (session?.token !== cloudRef.current?.session.token) switchSession(session);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [switchSession]);

  // Local data stays subscribed in both modes (counts / import prompt).
  const localData = useLiveQuery(readLocalSnapshot, []);
  const importKey = cloudUserId ? importMetaKey(cloudUserId) : null;
  const importedAt = useLiveQuery(
    async () => (importKey ? ((await db.meta.get(importKey))?.value ?? null) : null),
    [importKey],
  );

  /** Runs one mutation in the active mode; resolves to the id of the created record, if any. */
  const mutate = useCallback(
    async (
      planLocal: (snapshot: AppSnapshot, ctx: DomainContext) => DomainResult,
      callCloud: (api: CloudApi) => Promise<MutationResponse>,
    ): Promise<string | undefined> => {
      const session = cloudRef.current?.session;
      if (!session) {
        const result = await runLocalMutation((snapshot) => planLocal(snapshot, createLocalContext()));
        return result.id;
      }

      try {
        const result = await callCloud(createCloudApi(session.token));
        pendingDeltasRef.current?.push(result.delta);
        updateSession(session.token, (current) => ({
          ...current,
          data: applyDelta(current.data ?? EMPTY_SNAPSHOT, result.delta),
        }));
        return result.id;
      } catch (error) {
        const stale = error instanceof ApiError && (error.status === 404 || error.status === 409);
        // No answer in time (client timeout / server deadline): the change may still have been applied.
        const unsure = error instanceof ApiError && (error.timedOut || error.status === 503);
        // The cloud copy changed elsewhere (e.g. another device): resync so the UI shows the current state.
        if (!handleAuthFailure(error, session.token) && (stale || unsure)) void loadCloudSnapshot();
        throw error;
      }
    },
    [handleAuthFailure, loadCloudSnapshot, updateSession],
  );

  const actions = useMemo<AppDataActions>(
    () => ({
      createRacket: (input) => {
        const normalized: CreateRacketInput = { ...input, installedAt: dateOrToday(input.installedAt) };
        return createdId(
          mutate((snapshot, ctx) => planCreateRacket(snapshot, normalized, ctx), (api) => api.createRacket(normalized)),
        );
      },
      updateRacket: (id, input) =>
        completed(mutate((snapshot, ctx) => planUpdateRacket(snapshot, id, input, ctx), (api) => api.updateRacket(id, input))),
      deleteRacket: (id) => completed(mutate((snapshot, ctx) => planDeleteRacket(snapshot, id, ctx), (api) => api.deleteRacket(id))),

      createRubber: (input) =>
        createdId(mutate((snapshot, ctx) => planCreateRubber(snapshot, input, ctx), (api) => api.createRubber(input))),
      updateRubber: (id, input) =>
        completed(mutate((snapshot, ctx) => planUpdateRubber(snapshot, id, input, ctx), (api) => api.updateRubber(id, input))),
      retireRubber: (id, date) => {
        const input: UpdateRubberInput = { removedAt: dateOrToday(date) };
        return completed(
          mutate((snapshot, ctx) => planUpdateRubber(snapshot, id, input, ctx), (api) => api.updateRubber(id, input)),
        );
      },
      stashRubber: (id, date) => {
        const input: StashRubberInput = { date: dateOrToday(date) };
        return completed(mutate((snapshot, ctx) => planStashRubber(snapshot, id, input, ctx), (api) => api.stashRubber(id, input)));
      },
      deleteRubber: (id) =>
        completed(mutate((snapshot, ctx) => planDeleteRubber(snapshot, id, ctx), (api) => api.deleteRubber(id))),
      replaceRubber: (racketId, input) => {
        const normalized: ReplaceRubberInput = { ...input, date: dateOrToday(input.date) };
        return createdId(
          mutate(
            (snapshot, ctx) => planReplaceRubber(snapshot, racketId, normalized, ctx),
            (api) => api.replaceRubber(racketId, normalized),
          ),
        );
      },

      addPlaySession: (input) =>
        createdId(
          mutate((snapshot, ctx) => planCreatePlaySession(snapshot, input, ctx), (api) => api.createPlaySession(input)),
        ),
      updatePlaySession: (id, input) =>
        completed(mutate((snapshot) => planUpdatePlaySession(snapshot, id, input), (api) => api.updatePlaySession(id, input))),
      deletePlaySession: (id) =>
        completed(mutate((snapshot) => planDeletePlaySession(snapshot, id), (api) => api.deletePlaySession(id))),

      addBoostingLog: (input) =>
        createdId(
          mutate((snapshot, ctx) => planCreateBoostingLog(snapshot, input, ctx), (api) => api.createBoostingLog(input)),
        ),
      updateBoostingLog: (id, input) =>
        completed(mutate((snapshot) => planUpdateBoostingLog(snapshot, id, input), (api) => api.updateBoostingLog(id, input))),
      deleteBoostingLog: (id) =>
        completed(
          mutate((snapshot, ctx) => planDeleteBoostingLog(snapshot, id, ctx), (api) => api.deleteBoostingLog(id)),
        ),
    }),
    [mutate],
  );

  const getAuthConfig = useCallback(() => authApi.config(), []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const response = await authApi.login({ identifier: identifier.trim(), password });
      startSession(response);
      return response.user;
    },
    [startSession],
  );

  const register = useCallback(
    async (input: RegisterRequest) => {
      const email = input.email?.trim();
      const response = await authApi.register({
        username: input.username.trim(),
        password: input.password,
        ...(email ? { email } : {}),
      });
      startSession(response);
      return response.user;
    },
    [startSession],
  );

  const logout = useCallback(() => endSession({ clearCache: true }), [endSession]);

  const setApiBaseUrl = useCallback(
    (url: string | null) => {
      const previous = getApiBaseUrl();
      writeApiBaseUrlOverride(url && url.trim() ? url : null);
      const next = readApiState();
      setApi(next);
      if (next.url !== previous && cloudRef.current) endSession({ clearCache: true });
    },
    [endSession],
  );
  const refresh = useCallback(() => loadCloudSnapshot(), [loadCloudSnapshot]);
  const clearError = useCallback(() => setError(null), []);

  const importLocalToCloud = useCallback(async () => {
    const session = cloudRef.current?.session;
    if (!session) throw new Error("请先登录云端账号");
    const snapshot = await readLocalSnapshot();
    try {
      const result = await createCloudApi(session.token).importLocalData(snapshot);
      await setLocalMeta(importMetaKey(session.user.id), new Date().toISOString());
      await loadCloudSnapshot();
      return result;
    } catch (error) {
      handleAuthFailure(error, session.token);
      throw error;
    }
  }, [handleAuthFailure, loadCloudSnapshot]);

  const localSnapshot = localData ?? EMPTY_SNAPSHOT;
  const localCounts = useMemo<Record<EntityKey, number>>(
    () => ({
      rackets: localSnapshot.rackets.length,
      rubbers: localSnapshot.rubbers.length,
      boostingLogs: localSnapshot.boostingLogs.length,
      playSessions: localSnapshot.playSessions.length,
    }),
    [localSnapshot],
  );
  const hasCustomData = useMemo(
    () => Object.values(localCounts).some((count) => count > 0) && !isPristineSeedData(localSnapshot),
    [localCounts, localSnapshot],
  );

  const value = useMemo<AppDataContextValue>(
    () => ({
      ...actions,
      mode: cloud ? "cloud" : "local",
      data: cloud ? (cloud.data ?? EMPTY_SNAPSHOT) : localSnapshot,
      isLoading: cloud ? cloud.data === null && cloud.status === "loading" : localData === undefined,
      error,
      clearError,
      cloud: {
        configured: api.source !== "none",
        apiBaseUrl: api.url,
        apiBaseUrlSource: api.source,
        status: cloud?.status ?? "signed-out",
        user: cloud?.session.user ?? null,
        lastSyncedAt: cloud?.lastSyncedAt ?? null,
      },
      local: { counts: localCounts, hasCustomData, importedAt: importedAt ?? null },
      getAuthConfig,
      login,
      register,
      logout,
      refresh,
      importLocalToCloud,
      setApiBaseUrl,
    }),
    [
      actions,
      api,
      clearError,
      cloud,
      error,
      getAuthConfig,
      hasCustomData,
      importLocalToCloud,
      importedAt,
      localCounts,
      localData,
      localSnapshot,
      login,
      logout,
      refresh,
      register,
      setApiBaseUrl,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData() must be used inside <AppDataProvider>");
  return value;
}
