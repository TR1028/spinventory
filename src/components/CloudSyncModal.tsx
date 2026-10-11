/** 「云端同步」 dialog: data mode, sign-in / registration, local → cloud import and server settings. */
import {
  Check,
  ChevronDown,
  Chrome,
  Cloud,
  CloudOff,
  CloudUpload,
  Github,
  KeyRound,
  LoaderCircle,
  LogOut,
  RefreshCw,
  RotateCcw,
  Server,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ENV_API_BASE_URL, type ApiBaseUrlSource } from "../db/cloudApi";
import type { AuthConfigResponse, EntityKey, OAuthProvider, SyncImportResponse } from "../db/schema";
import { useAppData } from "../db/store";
import { formatTimestamp } from "../utils/date";
import { getErrorMessage } from "../utils/errors";
import { ErrorBanner, Modal, Notice, SegmentedControl, TextField, buttonClass, useAsyncAction } from "./ui";

const MIN_PASSWORD_LENGTH = 8;

const sourceLabels: Record<ApiBaseUrlSource, string> = {
  custom: "自定义地址",
  build: "默认地址",
  "dev-proxy": "开发代理",
  none: "未配置",
};

const oauthProviders: { id: OAuthProvider; label: string; icon: ReactNode }[] = [
  { id: "github", label: "GitHub", icon: <Github size={18} aria-hidden="true" /> },
  { id: "google", label: "Google", icon: <Chrome size={18} aria-hidden="true" /> },
];

function sumCounts(counts: Record<EntityKey, number>) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function describeCounts(counts: Record<EntityKey, number>) {
  return `${counts.rackets} 块球拍 · ${counts.rubbers} 张胶皮 · ${counts.playSessions} 条打球 · ${counts.boostingLogs} 条灌油`;
}

function describeImport(result: SyncImportResponse) {
  const imported = sumCounts(result.imported);
  const invalid = sumCounts(result.invalid);
  const skipped = Math.max(0, sumCounts(result.received) - imported - invalid);
  const parts: string[] = [];
  if (imported) {
    parts.push(`导入完成：写入 ${imported} 条记录`);
    if (skipped) parts.push(`${skipped} 条云端已有相同或更新的版本，已跳过`);
  } else {
    parts.push(`导入完成：云端已是最新${skipped ? `（${skipped} 条记录均已存在）` : ""}，无需写入`);
  }
  if (invalid) parts.push(`${invalid} 条格式无效，已跳过`);
  return parts.join("，");
}

export function CloudSyncModal({ onClose }: { onClose: () => void }) {
  const { mode, cloud } = useAppData();

  return (
    <Modal
      title="云端同步"
      description="登录后数据保存在你部署的 Cloudflare Worker（D1）中，可多设备同步；未登录时只保存在这台设备。"
      onClose={onClose}
      testId="cloud-sync-modal"
    >
      <div className="grid gap-4">
        <SyncStatus />
        {!cloud.configured ? <NotConfiguredNotice /> : mode === "cloud" ? <AccountPanel /> : <AuthPanel />}
        <ServerSettings defaultOpen={!cloud.configured} />
      </div>
    </Modal>
  );
}

function SyncStatus() {
  const { mode, cloud, local } = useAppData();

  if (mode === "local") {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-3 ring-1 ring-ink/10" data-testid="sync-status">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/5 text-ink/60">
          <CloudOff size={20} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-black text-ink">本地模式</span>
          <span className="block text-xs font-medium text-ink/55">数据保存在此浏览器：{describeCounts(local.counts)}</span>
        </span>
      </div>
    );
  }

  const detail =
    cloud.status === "loading"
      ? "正在同步…"
      : cloud.status === "error"
        ? "同步失败，当前显示的是缓存数据"
        : cloud.lastSyncedAt
          ? `上次同步 ${formatTimestamp(cloud.lastSyncedAt, { withTime: true })}`
          : "已连接";

  return (
    <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-3 ring-1 ring-ink/10" data-testid="sync-status">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-court/10 text-court">
        {cloud.status === "loading" ? (
          <LoaderCircle size={20} className="animate-spin" aria-hidden="true" />
        ) : cloud.status === "error" ? (
          <TriangleAlert size={20} aria-hidden="true" />
        ) : (
          <Cloud size={20} aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-ink">云端已同步 · {cloud.user?.username}</span>
        <span className="block text-xs font-medium text-ink/55">{detail}</span>
      </span>
    </div>
  );
}

function NotConfiguredNotice() {
  return (
    <Notice tone="warn" icon={<Server size={16} aria-hidden="true" />} testId="cloud-not-configured">
      <p className="font-black">尚未配置云端服务</p>
      <p className="mt-1 text-xs leading-5">
        部署 Cloudflare Worker 后，在下方「服务器设置」填写它的地址即可登录同步；也可以在构建时设置 VITE_API_BASE_URL。
      </p>
    </Notice>
  );
}

type AuthTab = "login" | "register";

function AuthPanel() {
  const { cloud, getAuthConfig, login, register } = useAppData();
  const [tab, setTab] = useState<AuthTab>("login");
  const [config, setConfig] = useState<AuthConfigResponse | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const action = useAsyncAction();
  const apiBaseUrl = cloud.apiBaseUrl;

  // Ask the server whether it accepts registrations (again whenever the server changes).
  useEffect(() => {
    let cancelled = false;
    setConfig(null);
    setConfigError(null);
    getAuthConfig()
      .then((value) => {
        if (!cancelled) setConfig(value);
      })
      .catch((error: unknown) => {
        if (!cancelled) setConfigError(getErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, getAuthConfig]);

  const registrationClosed = config?.registrationOpen === false;

  function selectTab(next: AuthTab) {
    setTab(next);
    action.setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      if (tab === "login") {
        if (!identifier.trim() || !password) throw new Error("请输入账号和密码");
        await login(identifier, password);
        return;
      }
      if (!username.trim()) throw new Error("请填写用户名");
      if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`密码至少需要 ${MIN_PASSWORD_LENGTH} 位`);
      if (password !== confirmPassword) throw new Error("两次输入的密码不一致");
      await register({ username, email: email.trim() || undefined, password });
    });
  }

  return (
    <section className="grid gap-4 rounded-lg bg-white p-4 ring-1 ring-ink/10" data-testid="auth-panel">
      <SegmentedControl
        ariaLabel="登录或注册"
        value={tab}
        onChange={selectTab}
        options={[
          { value: "login", label: "登录", testId: "auth-tab-login" },
          { value: "register", label: registrationClosed ? "注册（已关闭）" : "注册", testId: "auth-tab-register" },
        ]}
      />

      {configError ? (
        <Notice tone="warn" icon={<TriangleAlert size={14} aria-hidden="true" />}>
          <span className="text-xs">暂时连不上云端服务：{configError}</span>
        </Notice>
      ) : null}

      <form onSubmit={handleSubmit} className="grid gap-3">
        {tab === "login" ? (
          <>
            <TextField
              label="用户名或邮箱"
              value={identifier}
              onChange={setIdentifier}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              testId="auth-identifier"
            />
            <TextField
              label="密码"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              testId="auth-password"
            />
          </>
        ) : registrationClosed ? (
          <Notice tone="muted" testId="registration-closed">
            这个服务器已关闭公开注册。请使用已有账号登录，或联系服务器管理员。
          </Notice>
        ) : (
          <>
            <TextField
              label="用户名"
              hint="2-32 位字母、数字、中文或 _ . -"
              value={username}
              onChange={setUsername}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              testId="auth-username"
            />
            <TextField
              label="邮箱"
              hint="选填，可用于登录"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              testId="auth-email"
            />
            <TextField
              label="密码"
              hint={`至少 ${MIN_PASSWORD_LENGTH} 位`}
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              testId="auth-password"
            />
            <TextField
              label="确认密码"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              testId="auth-password-confirm"
            />
          </>
        )}

        <ErrorBanner message={action.error} />
        {tab === "register" && registrationClosed ? null : (
          <button type="submit" disabled={action.pending} className={buttonClass.primary} data-testid="auth-submit">
            {action.pending ? (
              <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound size={18} aria-hidden="true" />
            )}
            {tab === "login" ? "登录并同步" : "注册并登录"}
          </button>
        )}
      </form>

      <div className="grid gap-2">
        <div className="flex items-center gap-3 text-[11px] font-bold text-ink/40">
          <span className="h-px flex-1 bg-ink/10" />
          其他登录方式
          <span className="h-px flex-1 bg-ink/10" />
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {oauthProviders.map((provider) => (
            <button
              key={provider.id}
              type="button"
              disabled
              title={`${provider.label} 登录即将支持`}
              className={`${buttonClass.secondary} relative px-2`}
              data-testid={`oauth-${provider.id}`}
            >
              {provider.icon}
              <span>{provider.label}</span>
              <span className="absolute -top-2 right-2 whitespace-nowrap rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                即将支持
              </span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs leading-5 text-ink/50">
        登录后显示云端数据；本地数据会保留在这台设备上，退出登录即可回到本地模式，也可以一键导入云端。
      </p>
    </section>
  );
}

function AccountPanel() {
  const { cloud, local, logout, refresh, importLocalToCloud } = useAppData();
  const importAction = useAsyncAction();
  const [result, setResult] = useState<SyncImportResponse | null>(null);
  const localTotal = sumCounts(local.counts);
  const highlightImport = local.hasCustomData && !local.importedAt;

  function handleImport() {
    void importAction.run(async () => {
      setResult(null);
      setResult(await importLocalToCloud());
    });
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-lg bg-white p-4 ring-1 ring-ink/10" data-testid="account-panel">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white">
            <UserRound size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black text-ink" data-testid="account-username">
              {cloud.user?.username}
            </div>
            <div className="truncate text-xs font-medium text-ink/55">{cloud.user?.email ?? "未绑定邮箱"}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={cloud.status === "loading"}
            className={buttonClass.secondary}
            data-testid="sync-now"
          >
            <RefreshCw size={16} className={cloud.status === "loading" ? "animate-spin" : ""} aria-hidden="true" />
            立即同步
          </button>
          <button type="button" onClick={logout} className={buttonClass.secondary} data-testid="logout-button">
            <LogOut size={16} aria-hidden="true" />
            退出登录
          </button>
        </div>
      </section>

      <section
        className={`grid gap-3 rounded-lg p-4 ${highlightImport ? "bg-limeglass ring-2 ring-court/30" : "bg-white ring-1 ring-ink/10"}`}
        data-testid="import-panel"
      >
        <div>
          <h3 className="text-sm font-black text-ink">这台设备上的本地数据</h3>
          <p className="mt-1 text-xs font-medium leading-5 text-ink/60">
            {localTotal ? describeCounts(local.counts) : "没有本地数据"}
            {localTotal && !local.hasCustomData ? "（仅示例数据）" : ""}
          </p>
          {local.importedAt ? (
            <p className="mt-1 text-xs font-semibold text-court">上次导入 {formatTimestamp(local.importedAt, { withTime: true })}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleImport}
          disabled={importAction.pending || localTotal === 0}
          className={`${buttonClass.court} w-full`}
          data-testid="import-local-button"
        >
          {importAction.pending ? (
            <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          ) : (
            <CloudUpload size={18} aria-hidden="true" />
          )}
          将本地数据导入云端
        </button>
        <ErrorBanner message={importAction.error} />
        {result ? (
          <p className="rounded-md bg-white/80 px-3 py-2 text-xs font-semibold text-court" data-testid="import-result">
            {describeImport(result)}
          </p>
        ) : null}
        <p className="text-xs leading-5 text-ink/50">按记录合并：重复导入不会产生重复数据，云端修改得更晚的记录会保留云端版本。</p>
      </section>
    </div>
  );
}

function ServerSettings({ defaultOpen }: { defaultOpen: boolean }) {
  const { cloud, mode, setApiBaseUrl } = useAppData();
  // Read once so React never toggles <details> while the user works inside it.
  const [open] = useState(defaultOpen);
  const [value, setValue] = useState(cloud.apiBaseUrlSource === "custom" ? cloud.apiBaseUrl : "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const currentUrl = cloud.apiBaseUrl || (cloud.apiBaseUrlSource === "dev-proxy" ? "/api（开发代理 → wrangler dev）" : "未配置");
  const fallback = ENV_API_BASE_URL ? "构建时配置的默认地址" : import.meta.env.DEV ? "开发代理" : "构建配置（当前为空）";

  function apply(next: string | null) {
    setError(null);
    setNotice(null);
    try {
      setApiBaseUrl(next);
      if (!next) setValue("");
      setNotice(next ? "已保存，新地址立即生效" : "已恢复默认地址");
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(value.trim() ? value : null);
  }

  return (
    <details open={open} className="group rounded-lg bg-white ring-1 ring-ink/10" data-testid="server-settings">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-sm font-black text-ink">
          <Server size={16} aria-hidden="true" />
          服务器设置
        </span>
        <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-ink/50">
          <span className="truncate">{sourceLabels[cloud.apiBaseUrlSource]}</span>
          <ChevronDown size={16} className="shrink-0 transition group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <form onSubmit={handleSubmit} className="grid gap-3 border-t border-ink/10 p-4">
        <p className="break-all text-xs font-medium text-ink/60">
          当前：
          <span className="font-bold text-ink" data-testid="api-base-url-current">
            {currentUrl}
          </span>
        </p>
        <TextField
          label="Worker 地址"
          hint="不含 /api"
          type="url"
          inputMode="url"
          placeholder={ENV_API_BASE_URL || "https://spinventory-api.<账号>.workers.dev"}
          value={value}
          onChange={setValue}
          autoCapitalize="none"
          autoComplete="url"
          spellCheck={false}
          testId="api-base-url-input"
        />
        <p className="text-xs leading-5 text-ink/50">
          只保存在这台设备。留空则使用{fallback}。{mode === "cloud" ? "更换服务器会退出当前账号。" : ""}
        </p>
        <ErrorBanner message={error} />
        {notice ? (
          <p className="text-xs font-semibold text-court" data-testid="api-base-url-notice">
            {notice}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClass.primary} data-testid="api-base-url-save">
            <Check size={16} aria-hidden="true" />
            保存地址
          </button>
          {cloud.apiBaseUrlSource === "custom" ? (
            <button type="button" onClick={() => apply(null)} className={buttonClass.secondary} data-testid="api-base-url-reset">
              <RotateCcw size={16} aria-hidden="true" />
              恢复默认
            </button>
          ) : null}
        </div>
      </form>
    </details>
  );
}
