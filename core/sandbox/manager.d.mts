export interface SandboxLog {
  level?: string;
  message?: string;
}

export interface SandboxResult {
  type?: string;
  ok?: boolean;
  status?: string;
  durationMs?: number;
  messages?: Array<{
    kind?: string;
    text?: string;
    at?: string;
  }>;
  error?: string | null;
  logs: SandboxLog[];
}

export function runSandbox(
  command: string,
  args?: string[]
): Promise<SandboxResult>;