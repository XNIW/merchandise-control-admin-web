import "server-only";

const POS_REVISION_TIMESTAMP_PATTERN =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,6}))?(Z|\+00:00|\+0000)$/;

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidDateTime(parts: readonly number[]) {
  const [year, month, day, hour, minute, second] = parts;

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }

  const maximumDay =
    month === 2 && isLeapYear(year) ? 29 : DAYS_PER_MONTH[month - 1];
  return day >= 1 && day <= maximumDay;
}

export function canonicalizePosRevisionTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const match = POS_REVISION_TIMESTAMP_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const dateTime = match.slice(1, 7).map(Number);
  if (!isValidDateTime(dateTime)) {
    return null;
  }

  const fraction = (match[7] ?? "").padEnd(6, "0");
  return `${value.slice(0, 19)}.${fraction}Z`;
}
