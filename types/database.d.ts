export type UserRole = "user" | "premium" | "mod" | "coowner" | "owner";

export interface DatabaseUserData {
  name?: string | null;
  description?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  marriedTo?: string | null;
  bolsillo?: number;
  banco?: number;
  xp?: number;
  level?: number;
  warns?: number;
  aura?: number;
  auraXp?: number;
  level?: number;
  stickerPackName?: string;
  stickerPackAuthor?: string;
  marry?: string | null;
  lastDaily?: number;
  lastWeekly?: number;
  lastMonthly?: number;
  lastFortnightly?: number;
  lastWork?: number;
  lastPpt?: number;
  lastCrime?: number;
  lastRob?: number;
  lastSlut?: number;
  lastMine?: number;
  lastHunt?: number;
  lastAdventure?: number;
  lastCf?: number;
  lastRoulete?: number;
  lastAura?: number;
  lastSteal?: number;
  inventory?: Record<string, number>;
  [key: string]: unknown;
}

export interface DatabaseUser {
  jid: string | null;
  lid: string | null;
  username: string | null;
  pushName?: string | null;
  phone_number: string | null;
  name?: string | null;
  description?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  marriedTo?: string | null;
  role: UserRole | string;
  is_banned: number;
  banned?: boolean;
  self?: number;
  aura?: number;
  auraXp?: number;
  stickerPackName?: string;
  stickerPackAuthor?: string;
  data?: DatabaseUserData;
  [key: string]: unknown;
}

export interface TopMsgUser {
  jid: string;
  lid?: string | null;
  pushName?: string;
  week: string;
  count: number;
}

export interface GroupWarnEntry {
  reason: string;
  date: string;
}

export interface DatabaseGroupData {
  selfConfigured?: boolean;
  warns?: Record<string, GroupWarnEntry[]>;
  welcomeMessage?: string;
  goodbyeMessage?: string;
  byeMessage?: string;
  welcome?: boolean | number;
  goodbye?: boolean | number;
  bye?: boolean | number;
  warnLimit?: number;
  antifake?: boolean | number;
  antitoxic?: boolean | number;
  economy?: Record<string, DatabaseUserData>;
  [key: string]: unknown;
}

export interface DatabaseGroup {
  jid?: string;
  group_id: string;
  group_name: string | null;
  antilink: number;
  antiCalls: number;
  antiToxic: number;
  antiSpam: number;
  antiStatus: number;
  onlyAdmin: number;
  prefix: string | null;
  self?: number;
  topMsgUsers?: TopMsgUser[] | string;
  catBlocked?: string[] | string;
  mutedUsers?: string[] | string;
  primaryBot?: string | null;
  chatBanned?: boolean | number;
  botOn?: number;
  privateMode?: boolean | number;
  adminMode?: boolean | number;
  welcomeMessage?: string;
  goodbyeMessage?: string;
  byeMessage?: string;
  welcome?: boolean | number;
  goodbye?: boolean | number;
  bye?: boolean | number;
  warnLimit?: number;
  warns?: Record<string, GroupWarnEntry[]>;
  data?: DatabaseGroupData;
  [key: string]: unknown;
}

export interface DatabaseBotData {
  createdAt?: number | string;
  ownerJid?: string;
  customPrefix?: string;
  customBotName?: boolean;
  customBanner?: BotMediaSetting | null;
  customAudio?: BotMediaSetting | null;
  currentBanner?: string | null;
  currentAudio?: string | null;
  sessionName?: string;
  currency?: string;
  currencySymbol?: string;
  [key: string]: unknown;
}

export interface BotMediaSetting {
  path?: string;
  base64?: string;
  mimetype?: string;
  ptt?: boolean;
  seconds?: number;
}

export interface DatabaseBot {
  jid: string;
  bot_id: string;
  bot_name: string | null;
  phone_number: string | null;
  lid: string | null;
  groups: string[] | string;
  isMain: number;
  status: "active" | "offline" | "connecting" | string;
  modPrefix: string | null;
  modSelf: number;
  currency?: string | null;
  currencySymbol?: string | null;
  currentBanner?: string | null;
  currentAudio?: string | null;
  data?: DatabaseBotData;
  [key: string]: unknown;
}

export interface UserDbRow {
  jid: string | null;
  lid: string | null;
  username: string | null;
  phone_number: string | null;
  role: string | null;
  is_banned: number | null;
  self: number | null;
  coins?: number | null;
  bank?: number | null;
  name?: string | null;
  marriage_to?: string | null;
  genre?: string | null;
  birth_date?: string | null;
  description?: string | null;
  aura_points?: number | null;
  aura_level?: number | null;
  LastEconomyDaily?: number | null;
  LastEconomyWeekly?: number | null;
  LastEconomyMonthly?: number | null;
  LastEconomyFortnightly?: number | null;
  LastEconomyWork?: number | null;
  LastEconomyPpt?: number | null;
  LastEconomyMine?: number | null;
  LastEconomyHunt?: number | null;
  LastEconomyCrime?: number | null;
  LastEconomySlut?: number | null;
  LastEconomySteal?: number | null;
  LastEconomyAdventure?: number | null;
  LastEconomyCf?: number | null;
  LastEconomyRoulete?: number | null;
  LastEconomyAura?: number | null;
  LastEconomyRob?: number | null;
  data: string | null;
}

export interface GroupDbRow {
  jid: string;
  group_id: string;
  group_name: string | null;
  antilink: number | null;
  antiCalls: number | null;
  antiToxic: number | null;
  antiSpam: number | null;
  antiStatus: number | null;
  onlyAdmin: number | null;
  prefix: string | null;
  self: number | null;
  topMsgUsers: string | null;
  catBlocked: string | null;
  mutedUsers?: string | null;
  medUsers?: string | null;
  welcome?: number | boolean | null;
  goodbye?: number | boolean | null;
  welcomeMessage?: string | null;
  goodbyeMessage?: string | null;
  privateMode?: number | boolean | null;
  adminMode?: number | boolean | null;
  primaryBot?: string | null;
  data: string | null;
}

export interface BotDbRow {
  jid: string;
  bot_id: string;
  bot_name: string | null;
  phone_number: string | null;
  lid: string | null;
  groups: string | null;
  isMain: number | null;
  status: string | null;
  modPrefix: string | null;
  modSelf: number | null;
  currency?: string | null;
  currencySymbol?: string | null;
  currentBanner?: string | null;
  currentAudio?: string | null;
  data: string | null;
}

export interface IDatabase {
  getUser(jid: string): DatabaseUser;
  setUser(
    jid: string,
    dataObject: Partial<DatabaseUser> & Record<string, unknown>,
  ): void;
  getGroup(jid: string): DatabaseGroup;
  setGroup(
    jid: string,
    dataObject: Partial<DatabaseGroup> & Record<string, unknown>,
  ): void;
  getBot(jid: string): DatabaseBot;
  setBot(
    jid: string,
    dataObject: Partial<DatabaseBot> & Record<string, unknown>,
  ): void;
  setPushName(jid: string, pushName: string): void;
  getPrimary(groupJid: string): string | null;
  setPrimary(groupJid: string, botJid: string): void;
  addBotGroup(botJid: string, groupJid: string): void;
  getBotById(botId: string): DatabaseBot | null;
  deleteBot(jid: string): void;
  getAllUsers(): DatabaseUser[];
  getAllBots(): DatabaseBot[];
  hasRole(jid: string, role: UserRole | string): boolean;
  setRole(jid: string, role: UserRole | string): void;
  syncDefaultUserRoles(): void;
  isBanned(jid: string): boolean;
  ban(jid: string): void;
  unban(jid: string): void;
}

declare global {
  type UserRoleGlobal = UserRole;
  type DatabaseUserGlobal = DatabaseUser;
  type DatabaseGroupGlobal = DatabaseGroup;
  type DatabaseBotGlobal = DatabaseBot;
  type IDatabaseGlobal = IDatabase;
}
