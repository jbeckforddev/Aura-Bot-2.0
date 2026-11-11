import type { CommandContext } from "../../types/index.d.ts";

export interface SandboxResult {
  type: "result";
  ok: boolean;
  status: string;
  command?: string;
  file?: string;
  error?: string;
}

export function runSandbox(
  command: string,
  args: string[],
  ctx: CommandContext
): Promise<SandboxResult>;