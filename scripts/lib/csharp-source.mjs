// Preserve offsets/newlines so scanner findings still point to the C# source.
// Literal text is preserved by maskCSharpComments, including comment markers.
export function csharpSourceViews(source) {
  const active = source.split("");
  const code = source.split("");
  const literalMask = new Uint8Array(source.length);
  const mask = (target, start, end) => {
    for (let index = start; index < end; index += 1) {
      if (source[index] !== "\n" && source[index] !== "\r") target[index] = " ";
    }
  };
  const comment = (start) => {
    if (source.startsWith("//", start)) {
      let end = start + 2;
      while (end < source.length && source[end] !== "\r" && source[end] !== "\n") end += 1;
      mask(active, start, end); mask(code, start, end);
      return end;
    }
    if (source.startsWith("/*", start)) {
      const close = source.indexOf("*/", start + 2);
      const end = close < 0 ? source.length : close + 2;
      mask(active, start, end); mask(code, start, end);
      return end;
    }
    return start;
  };
  function literal(start) {
    const prefix = /^(?:\$+@?|@\$?)?"/.exec(source.slice(start));
    if (!prefix && source[start] !== "'") return start;
    const quote = prefix ? start + prefix[0].length - 1 : start;
    const character = source[quote] === "'";
    const verbatim = prefix?.[0].includes("@") ?? false;
    const interpolated = prefix?.[0].includes("$") ?? false;
    const expressions = [];
    let end = quote + 1;
    const rawLength = character ? 0 : /^"{3,}/.exec(source.slice(quote))?.[0].length ?? 0;
    if (rawLength) {
      if (interpolated) throw new Error("Unsupported C# raw interpolated string; localization source review required");
      const close = source.indexOf('"'.repeat(rawLength), quote + rawLength);
      end = close < 0 ? source.length : close + rawLength;
    } else {
      while (end < source.length) {
        if (!verbatim && source[end] === "\\") { end += 2; continue; }
        if (source[end] === (character ? "'" : '"')) {
          if (verbatim && source[end + 1] === '"') { end += 2; continue; }
          end += 1; break;
        }
        if (interpolated && source[end] === "{") {
          if (source[end + 1] === "{") { end += 2; continue; }
          const start = end + 1;
          const expression = interpolation(start);
          expressions.push({ start, end: expression.codeEnd, code: code.slice(start, expression.codeEnd), literal: literalMask.slice(start, expression.codeEnd) });
          end = expression.end; continue;
        }
        end += 1;
      }
    }
    mask(code, start, Math.min(end, source.length));
    literalMask.fill(1, start, Math.min(end, source.length));
    for (const expression of expressions) {
      for (let index = expression.start; index < expression.end; index += 1) {
        code[index] = expression.code[index - expression.start];
        literalMask[index] = expression.literal[index - expression.start];
      }
    }
    return end;
  }
  function interpolation(start) {
    let depth = 1; let parentheses = 0; let brackets = 0; let index = start;
    while (index < source.length) {
      const afterComment = comment(index);
      if (afterComment !== index) { index = afterComment; continue; }
      const afterLiteral = literal(index);
      if (afterLiteral !== index) { index = afterLiteral; continue; }
      const value = source[index];
      if (value === "{") depth += 1;
      if (value === "}" && --depth === 0) return { end: index + 1, codeEnd: index };
      if (value === "(") parentheses += 1;
      if (value === ")") parentheses -= 1;
      if (value === "[") brackets += 1;
      if (value === "]") brackets -= 1;
      if (value === ":" && depth === 1 && parentheses === 0 && brackets === 0) {
        const close = source.indexOf("}", index + 1);
        return { end: close < 0 ? source.length : close + 1, codeEnd: index };
      }
      index += 1;
    }
    return { end: index, codeEnd: index };
  }
  let index = 0;
  while (index < source.length) {
    const afterComment = comment(index);
    if (afterComment !== index) { index = afterComment; continue; }
    const afterLiteral = literal(index);
    index = afterLiteral === index ? index + 1 : afterLiteral;
  }
  return { active: active.join(""), code: code.join(""), literal: literalMask };
}

export function maskCSharpComments(source) {
  return csharpSourceViews(source).active;
}
