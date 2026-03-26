// ============================================================
// DAILY MORNING BRIEFING — Google Apps Script
// Sends a curated news email at 8 AM PT via Anthropic API + Web Search
// ============================================================

// ── Configuration ───────────────────────────────────────────
var CONFIG = {
  ANTHROPIC_API_KEY: PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY"),
  RECIPIENT_EMAIL:   "zi@scopvc.com",
  MODEL:             "claude-haiku-4-5-20251001",
  MAX_TOKENS:        4096,
  SUBJECT_PREFIX:    "Morning Briefing",
};

// ── Main Entry Point ────────────────────────────────────────
function sendDailyBriefing() {
  var today = Utilities.formatDate(new Date(), "America/Los_Angeles", "EEEE, MMMM d, yyyy");
  var prompt = buildPrompt(today);

  Logger.log("Generating briefing for " + today);

  var briefingJson = callAnthropicWithWebSearch(prompt);

  if (!briefingJson) {
    Logger.log("ERROR: No content returned from Anthropic API.");
    return;
  }

  // Parse the JSON from Claude's response
  var briefing;
  try {
    briefing = extractJson(briefingJson);
  } catch (e) {
    Logger.log("ERROR parsing JSON: " + e.message);
    Logger.log("Raw response: " + briefingJson.substring(0, 500));
    return;
  }

  var htmlBody = buildHtmlEmail(briefing, today);

  GmailApp.sendEmail(CONFIG.RECIPIENT_EMAIL, CONFIG.SUBJECT_PREFIX + " \u2014 " + today, "", {
    htmlBody: htmlBody,
    name: "Morning Briefing",
  });

  Logger.log("Briefing sent successfully to " + CONFIG.RECIPIENT_EMAIL);
}

// ── Robust JSON Extraction ──────────────────────────────────
function extractJson(text) {
  // First, try stripping markdown fences and parsing directly
  var stripped = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(stripped);
  } catch (e) {
    // Fall through
  }

  // Find the first '{' and last '}' and try parsing that substring
  var start = text.indexOf("{");
  var end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    var candidate = text.substring(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch (e) {
      // Fall through
    }
  }

  throw new Error("No valid JSON object found in response");
}

// ── Prompt Construction ─────────────────────────────────────
function buildPrompt(todayFormatted) {
  return 'You are a daily news briefing assistant. Today is ' + todayFormatted + '.\n\n' +
    'Search the web for the most important news from the LAST 24 HOURS and return the results as a JSON object. Be rigorous about recency.\n\n' +
    'Return ONLY a valid JSON object with this exact structure (no markdown fences, no commentary, just raw JSON):\n\n' +
    '{\n' +
    '  "world_news": [\n' +
    '    { "headline": "...", "summary": "One sentence of context.", "source": "Reuters", "url": "https://..." }\n' +
    '  ],\n' +
    '  "tech_ai": [\n' +
    '    { "headline": "...", "summary": "One sentence of context.", "source": "TechCrunch", "url": "https://..." }\n' +
    '  ],\n' +
    '  "fundraises": [\n' +
    '    { "company": "...", "stage": "Series A", "amount": "$50M", "summary": "What they do and who led the round.", "source": "TechCrunch", "url": "https://..." }\n' +
    '  ]\n' +
    '}\n\n' +
    'SECTION REQUIREMENTS:\n\n' +
    '1. world_news: Exactly 5 items. Top world news headlines from Reuters, AP News, BBC, NYT, and other reputable sources.\n\n' +
    '2. tech_ai: Exactly 5 items. Most significant technology and AI developments. Prioritize frontier AI announcements (new models, products, research breakthroughs), major tech company news, deep tech. Sources: TechCrunch, The Verge, Ars Technica, VentureBeat.\n\n' +
    '3. fundraises: Up to 20 items. Startup funding rounds announced in the last 24 hours. Focus on vertical SaaS and AI infrastructure. Prioritize the biggest raises first, but include a few seed-stage announcements too (the reader is a pre-seed VC). Sources: TechCrunch, Crunchbase News, PitchBook. If fewer than 20 raises happened, just include what you find.\n\n' +
    'CRITICAL RULES:\n' +
    '- Strongly prefer items from the last 24 hours. If you cannot find enough, include the most recent items available.\n' +
    '- Every item MUST have a url to the source article.\n' +
    '- Return ONLY the raw JSON object. No text before or after it. Do not explain, apologize, or add caveats.\n' +
    '- If a section has no results, return an empty array for that key.\n' +
    '- Ensure the JSON is valid and parseable.';
}

// ── Anthropic API Call with Web Search ───────────────────────
function callAnthropicWithWebSearch(prompt) {
  var payload = {
    model: CONFIG.MODEL,
    max_tokens: CONFIG.MAX_TOKENS,
    system: "You are a JSON API. You MUST always respond with a valid JSON object and absolutely nothing else. No prose, no explanations, no apologies, no markdown fences. If you cannot find enough results for a section, return an empty array for that key. Never refuse to return JSON.",
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 20,
      }
    ],
    messages: [
      {
        role: "user",
        content: prompt,
      }
    ],
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-api-key": CONFIG.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", options);
  var statusCode = response.getResponseCode();
  var responseBody = response.getContentText();

  if (statusCode !== 200) {
    Logger.log("API Error (" + statusCode + "): " + responseBody);
    return null;
  }

  var json = JSON.parse(responseBody);

  // Extract text blocks from the response (skip web search result blocks)
  var textBlocks = json.content.filter(function(block) { return block.type === "text"; });
  if (textBlocks.length === 0) {
    Logger.log("No text content in API response.");
    return null;
  }

  return textBlocks.map(function(block) { return block.text; }).join("\n\n");
}

// ── HTML Email Builder ──────────────────────────────────────
function buildHtmlEmail(briefing, todayFormatted) {

  // --- Build World News rows ---
  var worldNewsHtml = "";
  var worldItems = briefing.world_news || [];
  for (var i = 0; i < worldItems.length; i++) {
    var item = worldItems[i];
    worldNewsHtml += buildNewsRow(item.headline, item.summary, item.url, item.source, i === worldItems.length - 1);
  }

  // --- Build Tech & AI rows ---
  var techHtml = "";
  var techItems = briefing.tech_ai || [];
  for (var i = 0; i < techItems.length; i++) {
    var item = techItems[i];
    techHtml += buildNewsRow(item.headline, item.summary, item.url, item.source, i === techItems.length - 1);
  }

  // --- Build Fundraise rows ---
  var fundraiseHtml = "";
  var fundItems = briefing.fundraises || [];
  for (var i = 0; i < fundItems.length; i++) {
    var item = fundItems[i];
    var headline = item.company + "  \u00B7  " + item.stage + "  \u00B7  " + item.amount;
    fundraiseHtml += buildNewsRow(headline, item.summary, item.url, item.source, i === fundItems.length - 1);
  }

  var fundraiseCount = fundItems.length;

  // --- Assemble full email ---
  return '<!DOCTYPE html>' +
  '<html lang="en">' +
  '<head>' +
  '<meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
  '<title>Morning Briefing</title>' +
  '</head>' +
  '<body style="margin:0; padding:0; background-color:#f4f4f5; -webkit-font-smoothing:antialiased;">' +

  // Outer wrapper table for email clients
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">' +
  '<tr><td align="center" style="padding:24px 16px;">' +

  // Inner content table
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.06);">' +

  // ── HEADER ──
  '<tr><td style="padding:32px 32px 24px; text-align:center; background-color:#111111;">' +
  '<p style="margin:0; font-family:Georgia,serif; font-size:24px; color:#ffffff; letter-spacing:0.5px;">Morning Briefing</p>' +
  '<p style="margin:8px 0 0; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:13px; color:#a1a1aa;">' + todayFormatted + '</p>' +
  '</td></tr>' +

  // ── WORLD NEWS SECTION ──
  buildSectionHeader("WORLD NEWS", "#1e40af") +
  '<tr><td style="padding:0 32px 24px;">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
  worldNewsHtml +
  '</table>' +
  '</td></tr>' +

  // ── TECH & AI SECTION ──
  buildSectionHeader("TECH & AI", "#7c3aed") +
  '<tr><td style="padding:0 32px 24px;">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
  techHtml +
  '</table>' +
  '</td></tr>' +

  // ── FUNDRAISES SECTION ──
  buildSectionHeader("STARTUP FUNDRAISES (" + fundraiseCount + ")", "#059669") +
  '<tr><td style="padding:0 32px 24px;">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
  fundraiseHtml +
  '</table>' +
  '</td></tr>' +

  // ── FOOTER ──
  '<tr><td style="padding:20px 32px; text-align:center; border-top:1px solid #e4e4e7; background-color:#fafafa;">' +
  '<p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:11px; color:#a1a1aa;">Generated by Claude \u00B7 Anthropic API + Web Search</p>' +
  '</td></tr>' +

  '</table>' + // end inner
  '</td></tr></table>' + // end outer
  '</body></html>';
}

// ── Section Header Builder ──────────────────────────────────
function buildSectionHeader(title, accentColor) {
  return '<tr><td style="padding:24px 32px 16px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr>' +
    '<td style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:1.5px; color:' + accentColor + '; text-transform:uppercase; padding-bottom:12px; border-bottom:2px solid ' + accentColor + ';">' +
    title +
    '</td>' +
    '</tr></table>' +
    '</td></tr>';
}

// ── Single News Row Builder ─────────────────────────────────
function buildNewsRow(headline, summary, url, source, isLast) {
  var borderStyle = isLast ? "none" : "1px solid #f0f0f0";
  var safeUrl = url || "#";
  var safeSource = source || "Source";

  return '<tr><td style="padding:14px 0; border-bottom:' + borderStyle + ';">' +
    '<p style="margin:0 0 4px; font-family:Georgia,serif; font-size:15px; line-height:1.4; color:#18181b; font-weight:600;">' +
    escapeHtml(headline) +
    '</p>' +
    '<p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:1.5; color:#52525b;">' +
    escapeHtml(summary) + '&nbsp;&nbsp;' +
    '<a href="' + safeUrl + '" style="color:#2563eb; text-decoration:none; font-weight:500;">Link \u2197</a>' +
    '</p>' +
    '</td></tr>';
}

// ── HTML Escape Helper ──────────────────────────────────────
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Manual Test Function ────────────────────────────────────
function testBriefing() {
  Logger.log("Running manual test...");
  sendDailyBriefing();
}

// ── Test with Sample Data (no API call needed) ──────────────
function testEmailFormatting() {
  var sampleData = {
    world_news: [
      { headline: "G7 Leaders Agree on New Climate Framework", summary: "The group committed to reducing emissions by 50% by 2035 in a landmark agreement.", source: "Reuters", url: "https://reuters.com/example" },
      { headline: "EU and US Reach Trade Deal on Critical Minerals", summary: "The agreement eliminates tariffs on lithium and rare earth imports between both blocs.", source: "BBC", url: "https://bbc.com/example" },
      { headline: "India Launches Largest Solar Farm in History", summary: "The 10GW facility in Rajasthan will power 7 million homes across northern India.", source: "AP News", url: "https://apnews.com/example" },
      { headline: "UN Security Council Passes Resolution on AI Weapons", summary: "The non-binding resolution calls for international oversight of autonomous weapons systems.", source: "NYT", url: "https://nytimes.com/example" },
      { headline: "Japan Raises Interest Rates for Third Time This Year", summary: "The Bank of Japan increased rates to 1.5%, signaling confidence in the economic recovery.", source: "FT", url: "https://ft.com/example" }
    ],
    tech_ai: [
      { headline: "Anthropic Releases Claude 4.5 Opus with Extended Thinking", summary: "The new flagship model demonstrates state-of-the-art reasoning across math, coding, and analysis benchmarks.", source: "TechCrunch", url: "https://techcrunch.com/example" },
      { headline: "Apple Announces On-Device AI Engine for iPhone 17", summary: "The custom silicon enables running 70B parameter models locally without cloud connectivity.", source: "The Verge", url: "https://theverge.com/example" },
      { headline: "Google DeepMind Achieves Breakthrough in Protein Design", summary: "AlphaFold 4 can now design novel proteins for targeted drug delivery from scratch.", source: "Ars Technica", url: "https://arstechnica.com/example" },
      { headline: "NVIDIA Posts Record Q1 Revenue of $44B", summary: "Data center revenue alone hit $38B driven by continued demand for H200 and B100 chips.", source: "VentureBeat", url: "https://venturebeat.com/example" },
      { headline: "Meta Open-Sources Llama 4 with Native Multimodality", summary: "The 405B model processes text, images, video, and audio in a single unified architecture.", source: "TechCrunch", url: "https://techcrunch.com/example2" }
    ],
    fundraises: [
      { company: "Anduril Industries", stage: "Series F", amount: "$1.5B", summary: "Defense tech company building autonomous systems and sensor fusion platforms; led by Founders Fund.", source: "TechCrunch", url: "https://techcrunch.com/example3" },
      { company: "Weights & Biases", stage: "Series D", amount: "$400M", summary: "AI developer tools for experiment tracking and model management; led by Felicis Ventures.", source: "Crunchbase", url: "https://crunchbase.com/example" },
      { company: "Vanta", stage: "Series C", amount: "$250M", summary: "Automated security compliance platform for SOC 2 and ISO 27001; led by Sequoia.", source: "TechCrunch", url: "https://techcrunch.com/example4" },
      { company: "Sardine", stage: "Series C", amount: "$70M", summary: "Fraud prevention and compliance platform for fintech companies; led by a16z.", source: "PitchBook", url: "https://pitchbook.com/example" },
      { company: "Scope AI", stage: "Seed", amount: "$4.2M", summary: "AI infrastructure for real-time model monitoring in production; led by Y Combinator.", source: "TechCrunch", url: "https://techcrunch.com/example5" }
    ]
  };

  var today = Utilities.formatDate(new Date(), "America/Los_Angeles", "EEEE, MMMM d, yyyy");
  var htmlBody = buildHtmlEmail(sampleData, today);

  GmailApp.sendEmail(CONFIG.RECIPIENT_EMAIL, "[TEST] Morning Briefing \u2014 " + today, "", {
    htmlBody: htmlBody,
    name: "Morning Briefing",
  });

  Logger.log("Test email sent to " + CONFIG.RECIPIENT_EMAIL);
}

// ── Trigger Setup (run once) ────────────────────────────────
function createDailyTrigger() {
  // Delete any existing triggers for this function
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "sendDailyBriefing") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new daily trigger at 8 AM Pacific
  ScriptApp.newTrigger("sendDailyBriefing")
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .inTimezone("America/Los_Angeles")
    .create();

  Logger.log("Daily trigger created: 8:00 AM Pacific, every day.");
}
