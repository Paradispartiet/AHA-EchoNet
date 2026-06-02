// ahaChatReplyFormat.js
// Ren tekst-normalisering av AHA Chat sitt synlige hovedsvar, skilt ut fra ahaChat.js.
// Velger svarmodus (kort/normal/grundig), tolker JSON- eller seksjonsbaserte
// agentsvar, og bygger ett lesbart hovedsvar. AHA Innsiktsmotoren bygger
// innsikter, lister, stier, begreper, kart og etterarbeid som sekundære lag.
//
// Selvinneholdt: ingen DOM, lagring eller chamber-tilgang. Eksponerer
// window.AHAChatReplyFormat. Lastes før ahaChat.js.

(function (global) {
  "use strict";

  function stripTrailingPunctuation(text) {
    return String(text || "")
      .trim()
      .replace(/[.!?;,:\s…]+$/u, "")
      .trim();
  }

  function lowerFirst(text) {
    const value = String(text || "").trim();
    if (!value) return "";
    return value.charAt(0).toLowerCase() + value.slice(1);
  }

  function chooseAhaChatReplyMode(userText) {
    const raw = String(userText || "").trim();
    const text = raw.toLowerCase();
    const wordCount = raw.split(/\s+/).filter(Boolean).length;
    const wantsShort = /\b(kort svar|kort|oppsummer kort|gi meg kortversjon|ja eller nei|hva nå|er dette riktig)\b/i.test(text)
      || (/\bhva betyr dette\b/i.test(text) && wordCount <= 12);
    if (wantsShort) return "short";
    const wantsDetailed = /\b(grundig|forklar grundig|plan|arkitektur|vurder|analyser|hvordan bygger vi|hvordan gjør vi|strategi)\b/i.test(text)
      || wordCount >= 90
      || raw.length >= 650;
    if (wantsDetailed) return "detailed";
    return "normal";
  }

  function normalizeAhaChatSectionHeading(heading) {
    return String(heading || "")
      .toLowerCase()
      .replace(/[*/_`#>\d.:-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compactAhaChatReplyPart(value, maxLen = 420) {
    const text = String(value || "")
      .replace(/^[-*•]\s+/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || text.length <= maxLen) return text;
    const cut = text.slice(0, maxLen).replace(/\s+\S*$/, "").trim();
    return `${stripTrailingPunctuation(cut)} …`;
  }

  function parseLegacyAhaReplySections(rawReply) {
    const text = String(rawReply || "").replace(/\r\n?/g, "\n").trim();
    if (!text) return null;
    const headingPattern = /^\s*(?:#{1,4}\s*)?(?:\*\*)?(?:\d+[.)]\s*)?(Kort svar|Hva AHA ser|Begreper\s*\/\s*mønstre|Begreper\s*\/\s*monstre|Neste beste spørsmål|Neste beste sporsmal|Neste læringssteg|Neste laeringssteg|Neste beste spørsmål eller læringssteg|Neste beste sporsmal eller laeringssteg)\s*:?\s*(?:\*\*)?\s*$/gim;
    const matches = [];
    let match;
    while ((match = headingPattern.exec(text)) !== null) {
      matches.push({ label: normalizeAhaChatSectionHeading(match[1]), index: match.index, end: headingPattern.lastIndex });
    }
    if (matches.length < 2) return null;
    const sections = {};
    matches.forEach((item, index) => {
      const next = matches[index + 1];
      const content = text.slice(item.end, next ? next.index : text.length).trim();
      if (content) sections[item.label] = content;
    });
    return { sections, headingCount: matches.length };
  }

  function getLegacyAhaReplySection(parsed, aliases) {
    const sections = parsed?.sections || {};
    for (const alias of aliases) {
      const key = normalizeAhaChatSectionHeading(alias);
      if (sections[key]) return sections[key];
    }
    return "";
  }

  function tryNormalizeJsonAhaReply(rawReply, mode) {
    const text = String(rawReply || "").trim();
    if (!text || !/^[{[]/.test(text)) return "";
    try {
      const parsed = JSON.parse(text);
      const source = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!source || typeof source !== "object") return "";
      const candidate = source.reply || source.answer || source.message || source.summary || source.kortSvar || source.kort_svar;
      if (candidate) return compactAhaChatReplyPart(candidate, mode === "detailed" ? 1100 : mode === "normal" ? 650 : 260);
    } catch {
      return "";
    }
    return "";
  }

  function normalizeAhaVisibleReply(rawReply, userText) {
    const raw = String(rawReply || "").trim();
    if (!raw) return raw;
    const mode = chooseAhaChatReplyMode(userText);
    const jsonReply = tryNormalizeJsonAhaReply(raw, mode);
    if (jsonReply) return jsonReply;
    if (/^[{[]/.test(raw)) return "Jeg har analysert dette, men svaret kom tilbake som strukturdata. Bruk etterarbeidet under for innsikter, begreper og kart.";
    const parsed = parseLegacyAhaReplySections(raw);
    if (!parsed) return raw;

    const shortAnswer = compactAhaChatReplyPart(getLegacyAhaReplySection(parsed, ["Kort svar"]), mode === "detailed" ? 520 : 260);
    const ahaSees = compactAhaChatReplyPart(getLegacyAhaReplySection(parsed, ["Hva AHA ser"]), mode === "detailed" ? 620 : 320);
    const concepts = compactAhaChatReplyPart(getLegacyAhaReplySection(parsed, ["Begreper / mønstre", "Begreper / monstre"]), 300);
    const nextStep = compactAhaChatReplyPart(getLegacyAhaReplySection(parsed, ["Neste beste spørsmål", "Neste beste sporsmal", "Neste læringssteg", "Neste laeringssteg", "Neste beste spørsmål eller læringssteg", "Neste beste sporsmal eller laeringssteg"]), 220);

    if (mode === "short") return shortAnswer || ahaSees || nextStep || raw;

    const parts = [];
    if (shortAnswer) parts.push(shortAnswer);
    if (ahaSees) parts.push(ahaSees);
    if (mode === "detailed" && concepts) parts.push(`De viktigste begrepene eller mønstrene her er ${lowerFirst(stripTrailingPunctuation(concepts))}.`);
    if (nextStep) parts.push(`Et praktisk neste steg er å ${lowerFirst(stripTrailingPunctuation(nextStep))}.`);
    const visible = parts.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
    return visible || raw;
  }

  global.AHAChatReplyFormat = Object.assign({}, global.AHAChatReplyFormat || {}, {
    chooseAhaChatReplyMode,
    normalizeAhaChatSectionHeading,
    compactAhaChatReplyPart,
    parseLegacyAhaReplySections,
    getLegacyAhaReplySection,
    tryNormalizeJsonAhaReply,
    normalizeAhaVisibleReply
  });
})(window);
