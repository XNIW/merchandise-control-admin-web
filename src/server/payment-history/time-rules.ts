export type ModernTimeInterpretation = "Unresolved" | "IsoUtc" | "ExportedLocal";
export type GetnetTimeOptions = {
    modernTimeInterpretation: ModernTimeInterpretation;
    temporalPolicyVersion: string;
    temporalEvidenceReference: string;
};
export type GetnetTimestamp = {
    rawTimestamp: string;
    rawOffset: string;
    offsetMinutes: number | null;
    businessDateTime: string | null;
    isoBusinessDateTime: string | null;
    exportedLocalDateTime: string | null;
    occurredAtUtc: string | null;
    interpretation: ModernTimeInterpretation;
    policyVersion: string;
    evidenceReference: string;
    needsEvidence: boolean;
};
const TICKS_PER_MINUTE = BigInt("600000000"), TICKS_PER_DAY = BigInt("864000000000");
function dateTicks(year: number, month: number, day: number, hour: number, minute: number, second: number, fraction = "") {
    const d = new Date(0);
    d.setUTCFullYear(year, month - 1, day);
    d.setUTCHours(hour, minute, second, 0);
    if (year < 1 || year > 9999 || d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day || d.getUTCHours() !== hour || d.getUTCMinutes() !== minute || d.getUTCSeconds() !== second)
        throw Error("getnet_timestamp_invalid");
    return BigInt(d.getTime()) * BigInt("10000") + BigInt(fraction.padEnd(7, "0") || "0");
}
function formatTicks(ticks: bigint) {
    let millis = ticks / BigInt("10000"), remainder = ticks % BigInt("10000");
    if (remainder < BigInt("0")) {
        millis -= BigInt("1");
        remainder += BigInt("10000");
    }
    const d = new Date(Number(millis));
    if (!Number.isFinite(d.getTime()) || d.getUTCFullYear() < 1 || d.getUTCFullYear() > 9999)
        throw Error("getnet_timestamp_invalid");
    return d.toISOString().slice(0, 23) + remainder.toString().padStart(4, "0");
}
function isoTicks(raw: string, requireZ = true) {
    const m = (requireZ ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.([0-9]{1,7}))?Z$/ : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.([0-9]{1,7}))?Z?$/).exec(raw);
    if (!m)
        throw Error("getnet_timestamp_invalid");
    return dateTicks(...m.slice(1, 7).map(Number) as [
        number,
        number,
        number,
        number,
        number,
        number
    ], m[7]);
}
export function commercialDateTimeTicks(raw:string) {
    return (isoTicks(raw,false)+BigInt("621355968000000000")).toString();
}
export function parseOffsetMinutes(raw: string) {
    const m = /^([+-]?)([0-9]{1,2})(?::([0-9]{2}))?$/.exec(raw.trim());
    if (!m)
        throw Error("getnet_offset_invalid");
    const h = Number(m[2]), minutes = Number(m[3] ?? 0);
    if (h > 14 || minutes > 59 || h === 14 && minutes !== 0)
        throw Error("getnet_offset_invalid");
    return (m[1] === "-" ? -1 : 1) * (h * 60 + minutes);
}
export function parseModernTimestamp(raw: string, offset: string, options: GetnetTimeOptions): GetnetTimestamp {
    const source = isoTicks(raw), minutes = parseOffsetMinutes(offset), isoLocal = source + BigInt(minutes) * TICKS_PER_MINUTE;
    const selected = options.modernTimeInterpretation;
    return { rawTimestamp: raw, rawOffset: offset, offsetMinutes: minutes,
        businessDateTime: selected === "IsoUtc" ? formatTicks(isoLocal) : selected === "ExportedLocal" ? formatTicks(source) : null,
        isoBusinessDateTime: formatTicks(isoLocal), exportedLocalDateTime: formatTicks(source),
        occurredAtUtc: selected === "IsoUtc" ? formatTicks(source) + "Z" : selected === "ExportedLocal" ? formatTicks(source - BigInt(minutes) * TICKS_PER_MINUTE) + "Z" : null,
        interpretation: selected, policyVersion: options.temporalPolicyVersion, evidenceReference: options.temporalEvidenceReference,
        needsEvidence: selected === "Unresolved" || !options.temporalEvidenceReference.trim() };
}
export function parseLegacyTimestamp(raw: string, parsedText: string, options: GetnetTimeOptions): GetnetTimestamp {
    const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})(?:\.([0-9]{1,7}))?$/.exec(parsedText);
    if (!m)
        throw Error("getnet_timestamp_invalid");
    const ticks = dateTicks(Number(m[3]), Number(m[2]), Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]), m[7]);
    return { rawTimestamp: raw, rawOffset: "", offsetMinutes: null, businessDateTime: formatTicks(ticks), isoBusinessDateTime: null, exportedLocalDateTime: null, occurredAtUtc: null, interpretation: "Unresolved", policyVersion: options.temporalPolicyVersion, evidenceReference: "", needsEvidence: false };
}
export function legacyCellTimestamp(raw: string, type: string, isDate: boolean, date1904: boolean) {
    let ticks: bigint;
    if (type === "d")
        ticks = isoTicks(raw, false);
    else if (type !== "n")
        return raw;
    else {
        if (!isDate || (raw.match(/[0-9]/g)?.length ?? 0) > 28 || raw.startsWith("-"))
            throw Error("getnet_timestamp_numeric_unsupported");
        const m = /^\+?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw);
        if (!m)
            throw Error("getnet_timestamp_numeric_unsupported");
        const fraction = m[2] ?? "", scale = fraction.length - Number(m[3] ?? 0);
        if (Math.abs(scale) > 100)
            throw Error("getnet_timestamp_numeric_unsupported");
        let numerator = BigInt(m[1] + fraction) * TICKS_PER_DAY;
        if (scale > 0) {
            const divisor = BigInt("10") ** BigInt(scale);
            if (numerator % divisor)
                throw Error("getnet_timestamp_precision");
            numerator /= divisor;
        }
        else
            numerator *= BigInt("10") ** BigInt(-scale);
        if (!date1904 && numerator >= BigInt("60") * TICKS_PER_DAY && numerator < BigInt("61") * TICKS_PER_DAY)
            throw Error("getnet_timestamp_excel_leap_day");
        ticks = dateTicks(date1904 ? 1904 : 1899, date1904 ? 1 : 12, date1904 ? 1 : numerator < BigInt("60") * TICKS_PER_DAY ? 31 : 30, 0, 0, 0) + numerator;
    }
    const value = formatTicks(ticks);
    return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)} ${value.slice(11)}`;
}
