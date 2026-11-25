export type EconomyCooldownKey =
  | "daily"
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "steal"
  | "work"
  | "cf"
  | "roulete"
  | "mine"
  | "hunt"
  | "ppt"
  | "slut"
  | "crime"
  | "adventure"
  | "aura";

export interface CooldownRows {
  daily: number;
  weekly: number;
  fortnightly: number;
  monthly: number;
  steal: number;
  work: number;
  cf: number;
  roulete: number;
  mine: number;
  hunt: number;
  ppt: number;
  slut: number;
  crime: number;
  adventure: number;
  aura: number;
}

export interface EconomyUser {
  bolsillo: number;
  banco: number;
  coins: number;
  bank: number;
  xp?: number;
  level?: number;
  aura?: number;
  auraXp?: number;
  health?: number;
  mana?: number;
  dailyStreak?: number;
  weeklyStreak?: number;
  fortnightlyStreak?: number;
  monthlyStreak?: number;
  lastWork?: number;
  lastDaily?: number;
  lastWeekly?: number;
  lastMonthly?: number;
  lastFortnightly?: number;
  lastCrime?: number;
  lastRob?: number;
  lastSlut?: number;
  lastMine?: number;
  lastHunt?: number;
  lastAdventure?: number;
  lastCf?: number;
  lastRoulete?: number;
  lastPpt?: number;
  lastAura?: number;
  lastSteal?: number;
  inventory?: Record<string, number>;
  [key: string]: unknown;
}

export interface Profile {
  name: string;
  description: string;
  gender: string;
  birthDate: string | null;
  marriedTo: string | null;
  bolsillo: number;
  banco: number;
  aura: number;
  auraXp: number;
  role: string;
  cmdsUsedCount: number;
  pfp?: string;
  [key: string]: unknown;
}

export interface PendingProfileAction {
  kind: "marry" | "divorce";
  from: string;
  to: string;
  expiresAt: number;
}

export interface EconomyActivityOutcome {
  amount: number;
  xp: number;
  text: string;
  success: boolean;
}

declare global {
  type EconomyUserGlobal = EconomyUser;
  type ProfileGlobal = Profile;
}
