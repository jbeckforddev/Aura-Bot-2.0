/**
 * Reglas de identidad para el Anti-Raid global.
 * No confundir un número telefónico con los dígitos de un LID.
 * La autorización de gban exige además la identidad verificada por el handler.
 */
export const GLOBAL_GBAN_CONTROLLER_PHONES = [
  "573118353868", // Controlador original: conservar compatibilidad.
  "525538176300", // Owner autorizado.
  "50672373785",  // Owner autorizado.
] as const;

const CONTROLLER_PHONES: ReadonlySet<string> = new Set(GLOBAL_GBAN_CONTROLLER_PHONES);

export interface AntiRaidOwnerIdentity {
  phone?: unknown;
  jid?: unknown;
  lid?: unknown;
}

interface RoleEntry {
  role?: unknown;
  jid?: unknown;
  lid?: unknown;
}

function phoneOf(raw: unknown): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value || value.startsWith("lid_") || value.endsWith("@lid") ||
      value.endsWith("@g.us")) return "";
  const digits = value.split("@")[0]!.split(":")[0]!.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : "";
}

function lidOf(raw: unknown): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value.startsWith("lid_")) {
    const digits = value.slice(4).replace(/\D/g, "");
    return /^\d{7,20}$/.test(digits) ? digits + "@lid" : "";
  }
  if (!value.endsWith("@lid")) return "";
  const digits = value.slice(0, -4).split(":")[0]!.replace(/\D/g, "");
  return /^\d{7,20}$/.test(digits) ? digits + "@lid" : "";
}

function identities(identity?: AntiRaidOwnerIdentity | null, fallback?: unknown) {
  const phones = new Set<string>();
  const lids = new Set<string>();
  for (const raw of [identity?.phone, identity?.jid, identity?.lid, fallback]) {
    const phone = phoneOf(raw);
    const lid = lidOf(raw);
    if (phone) phones.add(phone);
    if (lid) lids.add(lid);
  }
  return { phones, lids };
}

function configuredOwners(): RoleEntry[] {
  const records = (globalThis as unknown as { DEFAULT_USER_ROLES?: unknown }).DEFAULT_USER_ROLES;
  if (!Array.isArray(records)) return [];
  return records.filter((item): item is RoleEntry =>
    Boolean(item && typeof item === "object" && ["owner", "coowner"].includes(
      String((item as RoleEntry).role ?? "").toLowerCase()
    )));
}

/** Protege las cuentas owner/coowner de sanciones, barridos y expulsiones. */
export function isProtectedAntiRaidOwner(
  identity?: AntiRaidOwnerIdentity | null,
  fallback?: unknown,
  hasOwnerRole?: (jidOrLid: string) => boolean,
  knownSupremeOwnerLid?: string,
): boolean {
  const target = identities(identity, fallback);
  if ([...target.phones].some(phone => CONTROLLER_PHONES.has(phone))) return true;

  const supremeLid = lidOf(knownSupremeOwnerLid);
  if (supremeLid && target.lids.has(supremeLid)) return true;

  for (const record of configuredOwners()) {
    const phone = phoneOf(record.jid);
    const lid = lidOf(record.lid);
    if ((phone && target.phones.has(phone)) || (lid && target.lids.has(lid))) return true;
  }

  if (hasOwnerRole) {
    let lookupFailed = false;
    for (const phone of target.phones) {
      try {
        if (hasOwnerRole(phone + "@s.whatsapp.net") || hasOwnerRole(phone)) return true;
      } catch { lookupFailed = true; /* No sancionar cuando falle la base de roles. */ }
    }
    for (const lid of target.lids) {
      try {
        if (hasOwnerRole(lid)) return true;
      } catch { lookupFailed = true; /* No sancionar cuando falle la base de roles. */ }
    }
    // Fallo de verificación: evitar sancionar a un posible owner.
    if (lookupFailed) return true;
  }

  return false;
}

/**
 * Permite gban a los tres números autorizados.
 * Para los dos números agregados exige también isOwner del handler, de manera
 * que no baste construir un alias JID/LID o un texto con su número.
 */
export function isAuthorizedGlobalBanOperator(
  identity: AntiRaidOwnerIdentity | null | undefined,
  fallback: unknown,
  trustedOwner: boolean,
  legacyOriginalOwner = false,
): boolean {
  if (legacyOriginalOwner) return true;
  if (!trustedOwner) return false;

  const actor = identities(identity, fallback);
  if ([...actor.phones].some(phone => CONTROLLER_PHONES.has(phone))) return true;

  // La identidad de WhatsApp puede llegar únicamente como LID: resolverla
  // contra la lista de owners configurados, nunca contra dígitos inventados.
  for (const record of configuredOwners()) {
    const configuredPhone = phoneOf(record.jid);
    const configuredLid = lidOf(record.lid);
    if (configuredPhone && CONTROLLER_PHONES.has(configuredPhone) &&
        configuredLid && actor.lids.has(configuredLid)) return true;
  }
  return false;
}

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
