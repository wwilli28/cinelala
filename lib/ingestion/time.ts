const LOS_ANGELES_TIME_ZONE = "America/Los_Angeles";

export function parseMonthDayYear(value: string) {
  const parsed = new Date(`${value} 12:00:00 GMT-0700`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse date "${value}"`);
  }

  return [
    parsed.getUTCFullYear(),
    String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    String(parsed.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function parseTimeTo24Hour(value: string) {
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/);

  if (!match) {
    return null;
  }

  let hours = Number.parseInt(match[1], 10);
  const minutes = match[2];
  const meridiem = match[3];

  if (hours === 12) {
    hours = 0;
  }

  if (meridiem === "PM") {
    hours += 12;
  }

  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

export function getBusinessDate(date: string, time: string | null) {
  if (!time) {
    return date;
  }

  if (time >= "00:00" && time < "07:00") {
    const businessDate = new Date(`${date}T12:00:00-07:00`);
    businessDate.setUTCDate(businessDate.getUTCDate() - 1);

    return [
      businessDate.getUTCFullYear(),
      String(businessDate.getUTCMonth() + 1).padStart(2, "0"),
      String(businessDate.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }

  return date;
}

export function formatTimeForDisplay(value: string | null) {
  if (!value) {
    return null;
  }

  const [hoursText, minutes] = value.split(":");
  const hours = Number.parseInt(hoursText, 10);
  const meridiem = hours >= 12 ? "PM" : "AM";
  const normalizedHours = hours % 12 || 12;

  return `${normalizedHours}:${minutes} ${meridiem}`;
}

export function isProgramUpcoming(date: string, now = new Date()) {
  const cutoff = new Date(`${date}T07:00:00-07:00`);
  cutoff.setUTCDate(cutoff.getUTCDate() + 1);
  return cutoff.getTime() > now.getTime();
}

export function formatDateHeading(dateString: string) {
  const date = new Date(`${dateString}T12:00:00-07:00`);

  return date.toLocaleDateString("en-US", {
    timeZone: LOS_ANGELES_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function compareProgramStarts(
  firstDate: string,
  firstTime: string | null,
  secondDate: string,
  secondTime: string | null
) {
  const first = new Date(
    `${firstDate}T${firstTime ?? "23:59"}:00-07:00`
  ).getTime();
  const second = new Date(
    `${secondDate}T${secondTime ?? "23:59"}:00-07:00`
  ).getTime();

  return first - second;
}
