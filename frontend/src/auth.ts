export type UserRole = "user" | "admin" | "term" | "cnc";

export type PermissionId =
  | "nav_equipment"
  | "nav_realtime"
  | "nav_thermo"
  | "nav_admin"
  | "thermo_start_batch"
  | "operator_panel"
  | "report_cnc_create"
  | "report_thermo_create";

export type UserPermissions = Record<PermissionId, boolean>;

export type Account = {
  username: string;
  password: string;
  role: UserRole;
  displayName?: string;
  permissions?: Partial<UserPermissions>;
};

export type SessionUser = {
  username: string;
  role: UserRole;
  displayName: string;
  permissions: UserPermissions;
  entry?: "main" | "operator";
};

export const ALL_PERMISSION_IDS: PermissionId[] = [
  "nav_equipment",
  "nav_realtime",
  "nav_thermo",
  "nav_admin",
  "thermo_start_batch",
  "operator_panel",
  "report_cnc_create",
  "report_thermo_create",
];

const PERM_KEYS = ALL_PERMISSION_IDS;

function falsePerms(): UserPermissions {
  return Object.fromEntries(PERM_KEYS.map((k) => [k, false])) as UserPermissions;
}

export function defaultPermissionsForRole(role: UserRole): UserPermissions {
  if (role === "admin") {
    return Object.fromEntries(PERM_KEYS.map((k) => [k, true])) as UserPermissions;
  }
  if (role === "user") {
    return {
      ...falsePerms(),
      nav_equipment: true,
      nav_realtime: true,
      nav_thermo: true,
      thermo_start_batch: true,
      operator_panel: true,
      report_cnc_create: true,
      report_thermo_create: true,
    };
  }
  if (role === "term") {
    return {
      ...falsePerms(),
      nav_equipment: true,
      nav_realtime: true,
      nav_thermo: true,
      thermo_start_batch: true,
      report_thermo_create: true,
    };
  }
  return {
    ...falsePerms(),
    nav_equipment: true,
    nav_realtime: true,
    operator_panel: true,
    report_cnc_create: true,
  };
}

function mergePermissions(role: UserRole, partial?: Partial<UserPermissions>): UserPermissions {
  const base = defaultPermissionsForRole(role);
  if (!partial) return base;
  return { ...base, ...partial };
}

const BUILTIN_ACCOUNTS: Account[] = [
  {
    username: "user",
    password: "user",
    role: "user",
    displayName: "Иванов И. И.",
  },
  {
    username: "admin",
    password: "admin",
    role: "admin",
    displayName: "Администратор",
  },
  {
    username: "term",
    password: "term",
    role: "term",
    displayName: "Термистов Т. Т.",
  },
  {
    username: "cnc",
    password: "cnc",
    role: "cnc",
    displayName: "Петров П. П.",
  },
];

const SESSION_KEY = "mdc-auth-session";
const CUSTOM_ACCOUNTS_KEY = "mdc-auth-custom-accounts";

export function roleLabel(role: UserRole): string {
  if (role === "admin") return "Администратор";
  if (role === "term") return "Мастер-Печи / Термист";
  if (role === "cnc") return "Мастер-ЧПУ";
  return "Обычный пользователь";
}

export function canViewEquipmentType(role: UserRole, equipmentType: string | null): boolean {
  if (role === "admin" || role === "user") return true;
  const t = (equipmentType ?? "").toLowerCase();
  if (role === "term") return t.includes("печь");
  if (role === "cnc") return t.includes("чпу") || t.includes("cnc") || t.includes("станок с пу") || t.includes("пу");
  return false;
}

export function hasPermission(session: SessionUser | null, id: PermissionId): boolean {
  if (id === "nav_admin") {
    return session?.username === "admin";
  }
  return session?.permissions[id] === true;
}

function loadCustomAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(CUSTOM_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Account[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a) =>
        typeof a?.username === "string" &&
        typeof a?.password === "string" &&
        (a?.role === "user" || a?.role === "admin" || a?.role === "term" || a?.role === "cnc"),
    );
  } catch {
    return [];
  }
}

function saveCustomAccounts(accounts: Account[]) {
  localStorage.setItem(CUSTOM_ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function getAllAccounts(): Account[] {
  return [...BUILTIN_ACCOUNTS, ...loadCustomAccounts()];
}

export type CustomAccountInput = {
  username: string;
  password: string;
  role: UserRole;
  displayName?: string;
  permissions?: Partial<UserPermissions>;
};

export function addCustomAccount(account: CustomAccountInput) {
  const username = account.username.trim();
  if (!username || !account.password.trim()) {
    throw new Error("Логин и пароль обязательны");
  }
  const all = getAllAccounts();
  if (all.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
    throw new Error("Пользователь с таким логином уже существует");
  }
  const custom = loadCustomAccounts();
  custom.push({
    username,
    password: account.password,
    role: account.role,
    displayName: account.displayName?.trim() || undefined,
    permissions: account.permissions,
  });
  saveCustomAccounts(custom);
}

export function isBuiltInAccount(username: string): boolean {
  const u = username.trim().toLowerCase();
  return BUILTIN_ACCOUNTS.some((a) => a.username.toLowerCase() === u);
}

/** Учётка для экрана редактирования: встроенные только для просмотра. */
export function getAccountForEdit(username: string):
  | { builtIn: true; account: Account }
  | { builtIn: false; account: Account }
  | null {
  const u = username.trim();
  const built = BUILTIN_ACCOUNTS.find((a) => a.username.toLowerCase() === u.toLowerCase());
  if (built) return { builtIn: true, account: built };
  const custom = loadCustomAccounts().find((a) => a.username.toLowerCase() === u.toLowerCase());
  if (custom) return { builtIn: false, account: custom };
  return null;
}

export function updateCustomAccount(
  username: string,
  patch: {
    newUsername?: string;
    password?: string;
    displayName?: string;
    role?: UserRole;
    permissions?: Partial<UserPermissions>;
  },
) {
  if (isBuiltInAccount(username)) {
    throw new Error("Базовую учётную запись нельзя изменить.");
  }
  const custom = loadCustomAccounts();
  const idx = custom.findIndex((a) => a.username.toLowerCase() === username.trim().toLowerCase());
  if (idx === -1) throw new Error("Пользователь не найден.");
  const cur = custom[idx];
  let nextUsername = cur.username;
  if (patch.newUsername?.trim()) {
    const nu = patch.newUsername.trim();
    if (nu.toLowerCase() !== cur.username.toLowerCase()) {
      if (getAllAccounts().some((a) => a.username.toLowerCase() === nu.toLowerCase())) {
        throw new Error("Пользователь с таким логином уже существует.");
      }
    }
    nextUsername = nu;
  }
  const nextRole = patch.role ?? cur.role;
  const next: Account = {
    username: nextUsername,
    password: patch.password?.trim() ? patch.password : cur.password,
    role: nextRole,
    displayName:
      patch.displayName !== undefined
        ? patch.displayName.trim() || undefined
        : cur.displayName,
    permissions:
      patch.permissions !== undefined ? { ...cur.permissions, ...patch.permissions } : cur.permissions,
  };
  custom[idx] = next;
  saveCustomAccounts(custom);
}

export function listAccountsForAdmin(): Array<{
  username: string;
  role: UserRole;
  displayName?: string;
  permissions?: Partial<UserPermissions>;
  builtIn: boolean;
}> {
  const custom = loadCustomAccounts();
  return [
    ...BUILTIN_ACCOUNTS.map((a) => ({
      username: a.username,
      role: a.role,
      displayName: a.displayName,
      permissions: a.permissions,
      builtIn: true,
    })),
    ...custom.map((a) => ({
      username: a.username,
      role: a.role,
      displayName: a.displayName,
      permissions: a.permissions,
      builtIn: false,
    })),
  ];
}

export function accountToSession(account: Account, entry?: SessionUser["entry"]): SessionUser {
  return {
    username: account.username,
    role: account.role,
    displayName: account.displayName?.trim() || account.username,
    permissions: mergePermissions(account.role, account.permissions),
    entry,
  };
}

export function authenticate(username: string, password: string): SessionUser | null {
  const user = getAllAccounts().find(
    (a) => a.username === username.trim() && a.password === password,
  );
  return user ? accountToSession(user) : null;
}

function normalizeSession(parsed: unknown): SessionUser | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.username !== "string") return null;
  if (o.role !== "user" && o.role !== "admin" && o.role !== "term" && o.role !== "cnc") {
    return null;
  }
  const role = o.role as UserRole;
  const displayName =
    typeof o.displayName === "string" && o.displayName.trim() ? o.displayName.trim() : o.username;
  let permissions: UserPermissions;
  if (o.permissions && typeof o.permissions === "object") {
    permissions = mergePermissions(role, o.permissions as Partial<UserPermissions>);
  } else {
    permissions = mergePermissions(role);
  }
  const entry = o.entry === "operator" || o.entry === "main" ? o.entry : undefined;
  return { username: o.username, role, displayName, permissions, entry };
}

export function getSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return normalizeSession(parsed);
  } catch {
    return null;
  }
}

export function saveSession(session: SessionUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
