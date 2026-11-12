// Port of Win7POS HistoricalSalesValueRules. Monetary values cross JSON as strings.
export const HEADER_NORMALIZATION_VERSION = "getnet-header-nfd-v1";
export const INT64_MIN = -BigInt("9223372036854775808");
export const INT64_MAX = BigInt("9223372036854775807");
export function checkedClp(value: bigint) {
    if (value < INT64_MIN || value > INT64_MAX)
        throw Error("getnet_amount_overflow");
    return value;
}
export function normalizeHeader(value: string) {
    return value.normalize("NFD").replace(/\p{Mn}/gu, "").trim().replace(/\s+/gu, " ").toUpperCase().normalize("NFC");
}
export function missingIdentifier(value: string) { return value.trim() === "" || ["-", "\u2212", "\u2013", "\u2014"].includes(value.trim()); }
export function parseClp(raw: string): bigint {
    const value = raw.trim();
    if (!value || value.length > 256)
        throw Error("getnet_amount_invalid");
    const match = /^([+-]?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]{1,4}))?$/.exec(value);
    if (!match)
        throw Error("getnet_amount_invalid");
    const fraction = match[3] ?? "", scale = fraction.length - Number(match[4] ?? 0);
    let digits = match[2] + fraction;
    if (scale > 0) {
        if (scale > digits.length) {
            if (/[^0]/.test(digits))
                throw Error("getnet_amount_fractional");
            return BigInt("0");
        }
        if (/[^0]/.test(digits.slice(digits.length - scale)))
            throw Error("getnet_amount_fractional");
        digits = digits.slice(0, digits.length - scale);
    }
    digits = digits.replace(/^0+/, "");
    if (!digits)
        return BigInt("0");
    if (scale < 0) {
        if (digits.length - scale > 19)
            throw Error("getnet_amount_overflow");
        digits += "0".repeat(-scale);
    }
    return checkedClp(BigInt((match[1] === "-" ? "-" : "") + digits));
}
export function parseIdentifier(raw: string, numeric = false, format = "General") {
    const value = raw.trim();
    if (missingIdentifier(value) || value.length > 256)
        throw Error("getnet_identifier_missing_or_invalid");
    if (/[\p{Cc}]/u.test(value))
        throw Error("getnet_identifier_invalid");
    if (!numeric) {
        if (/^[+-]?[0-9]+(?:\.[0-9]+|[eE][+-]?[0-9]+)$/.test(value))
            throw Error("getnet_identifier_numeric_precision");
        return value;
    }
    if (/[eE]/.test(value))
        throw Error("getnet_identifier_numeric_precision");
    const number = parseClp(value);
    if (number < BigInt("0"))
        throw Error("getnet_identifier_invalid");
    let digits = number.toString();
    if (digits.length > 15)
        throw Error("getnet_identifier_numeric_precision");
    if (format && format !== "General" && format !== "0") {
        if (format.length > 128 || !/^[0]+$/.test(format))
            throw Error("getnet_identifier_number_format_unsupported");
        digits = digits.padStart(format.length, "0");
    }
    return digits;
}
export function cardSubtype(rawType: string, rawPrepaid: string): "Debit" | "Credit" | "Prepaid" | "Unknown" {
    const prepaid = normalizeHeader(rawPrepaid);
    if (prepaid === "SI")
        return "Prepaid";
    if (prepaid && prepaid !== "NO" && prepaid !== "-")
        throw Error("getnet_prepaid_invalid");
    return ({ DEBITO: "Debit", CREDITO: "Credit", PREPAGO: "Prepaid" } as const)[normalizeHeader(rawType) as "DEBITO"] ?? "Unknown";
}
