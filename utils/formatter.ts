export function formatCount(valor: unknown): string {
  if (valor === null || valor === undefined) return "0";

  const raw = String(valor).trim();
  const normalized = raw.replace(/[,.]/g, "");
  const numero = Number(normalized);

  if (!raw) return "0";
  if (/^[\d,.]+[kKmMbBtT]$/.test(raw)) {
    return raw.replace(/[,.]/g, "").toUpperCase();
  }
  if (!Number.isFinite(numero)) return raw;
  if (numero >= 1e12) {
    return `${(numero / 1e12).toFixed(1)}T`;
  }
  if (numero >= 1e9) {
    return `${(numero / 1e9).toFixed(1)}B`;
  }
  if (numero >= 1e6) {
    return `${(numero / 1e6).toFixed(1)}M`;
  }
  if (numero >= 1e4) {
    return `${(numero / 1e4).toFixed(1)}K`;
  }
  return numero.toString();
}

export function formatMoney(value: unknown): string {
  if (value === null || value === undefined) return "0";

  const raw = String(value).trim();
  if (!raw) return "0";

  const number = Number(raw);
  if (!Number.isFinite(number)) return raw;

  return Math.max(0, Math.floor(number))
    .toLocaleString("en-US")
    .replace(/,/g, " ");
}

export function formatDuration(value: unknown): string {
  if (value === null || value === undefined) return "0s";

  const raw = String(value).trim();
  if (!raw) return "0s";

  const timeParts = raw.split(":").map((part) => part.trim());
  if (timeParts.length === 2 || timeParts.length === 3) {
    const parsed = timeParts.map((part) => Number(part));
    if (parsed.every((part) => !Number.isNaN(part))) {
      const [hoursOrMinutes, minutesOrSeconds, maybeSeconds] = parsed;
      const totalSeconds =
        timeParts.length === 2
          ? (hoursOrMinutes * 60) + minutesOrSeconds
          : (hoursOrMinutes * 3600) + (minutesOrSeconds * 60) + (maybeSeconds ?? 0);

      const safeSeconds = Math.max(0, Math.floor(totalSeconds));
      const hours = Math.floor(safeSeconds / 3600);
      const minutes = Math.floor((safeSeconds % 3600) / 60);
      const seconds = safeSeconds % 60;
      const parts: string[] = [];

      if (hours) parts.push(`${hours}h`);
      if (minutes) parts.push(`${minutes}m`);
      if (seconds || parts.length === 0) parts.push(`${seconds}s`);

      return parts.join(" ");
    }
  }

  const duration = Number(raw);
  if (!Number.isFinite(duration)) return raw;

  const totalSeconds = Math.max(0, Math.floor(duration));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(" ");
}

export function formatDate(value: unknown): string {
  if (value === null || value === undefined) return "Invalid Date";

  const raw = String(value).trim();
  if (!raw) return "Invalid Date";

  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const months: Record<string, number> = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    setiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12,
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    sept: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
  };
  let parts: [number, number, number] | undefined;

  const compact = normalized.match(/^(\d{2})(\d{2})(\d{4})$/);
  const separated = normalized.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})$/);
  const longDate = normalized.match(
    /^(\d{1,2})\s+de\s+([a-z]+)\s+del?\s+(\d{4})$/,
  );
  const englishLongDate = normalized.match(
    /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/,
  );
  const englishDayFirstDate = normalized.match(
    /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/,
  );

  if (compact) {
    parts = [Number(compact[3]), Number(compact[2]), Number(compact[1])];
  } else if (separated) {
    parts = separated[1].length === 4
      ? [Number(separated[1]), Number(separated[2]), Number(separated[3])]
      : [Number(separated[3]), Number(separated[2]), Number(separated[1])];
  } else if (longDate) {
    const month = months[longDate[2]];
    if (month) {
      parts = [Number(longDate[3]), month, Number(longDate[1])];
    }
  } else if (englishLongDate) {
    const month = months[englishLongDate[1]];
    if (month) {
      parts = [Number(englishLongDate[3]), month, Number(englishLongDate[2])];
    }
  } else if (englishDayFirstDate) {
    const month = months[englishDayFirstDate[2]];
    if (month) {
      parts = [Number(englishDayFirstDate[3]), month, Number(englishDayFirstDate[1])];
    }
  }

  let date: Date;
  if (parts) {
    const [year, month, day] = parts;
    date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return "Invalid Date";
    }
  } else {
    date = new Date(raw);
  }

  if (isNaN(date.getTime())) return "Invalid Date";

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatFileSize(value: unknown): string {
  if (value === null || value === undefined) return "0 B";

  const raw = String(value).trim();
  if (!raw) return "0 B";

  const number = Number(raw);
  if (!Number.isFinite(number)) return raw;

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Math.max(0, number);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

export function formatClock(value: unknown): string {
  if (value === null || value === undefined) return "00:00:00";

  const time = String(value).trim();
  if (!time) return "00:00:00";

  const parts = time.split(":").map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3) return time;
  if (parts.some((part) => !/^\d+$/.test(part))) return time;

  const normalizedParts = parts.length === 2
    ? [0, Number(parts[0]), Number(parts[1])]
    : [Number(parts[0]), Number(parts[1]), Number(parts[2])];

  const [hours, minutes, seconds] = normalizedParts;
  const formattedHours = String(hours).padStart(2, "0");
  const formattedMinutes = String(minutes).padStart(2, "0");
  const formattedSeconds = String(seconds).padStart(2, "0");

  return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
}