# Daily Morning Briefing

A Google Apps Script that sends a curated daily news briefing email at 8 AM PT, powered by the Anthropic API with web search.

## What It Does

Every morning, the script:

1. Calls the Anthropic API (Claude) with web search enabled
2. Gathers the latest news across three categories:
   - **World News** — 5 top headlines from Reuters, AP, BBC, NYT, etc.
   - **Tech & AI** — 5 major technology and AI developments
   - **Startup Fundraises** — Up to 20 recent funding rounds (focused on vertical SaaS and AI infrastructure)
3. Formats everything into a clean HTML email and sends it via Gmail

## Setup

### 1. Create a Google Apps Script Project

1. Go to [script.google.com](https://script.google.com) and create a new project
2. Replace the contents of `Code.gs` with the code from this repo

### 2. Set Your API Key

Store your Anthropic API key as a script property (never hardcode it):

1. In the Apps Script editor, go to **Project Settings** (gear icon)
2. Scroll to **Script Properties** and click **Add script property**
3. Set the property name to `ANTHROPIC_API_KEY` and paste your key as the value

### 3. Configure the Recipient

Edit the `CONFIG.RECIPIENT_EMAIL` value in `Code.gs` to your email address.

### 4. Create the Daily Trigger

Run the `createDailyTrigger()` function once from the Apps Script editor. This sets up an automatic daily trigger at 8:00 AM Pacific.

### 5. Authorize

The first time you run the script, Google will ask you to authorize Gmail access. Follow the prompts to grant permission.

## Testing

- **`testBriefing()`** — Runs the full pipeline (API call + email send). Useful for verifying everything works end-to-end.
- **`testEmailFormatting()`** — Sends a test email with sample data. No API call needed — good for previewing the email layout.

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `RECIPIENT_EMAIL` | `zi@scopvc.com` | Email address to receive the briefing |
| `MODEL` | `claude-haiku-4-5-20251001` | Anthropic model to use |
| `MAX_TOKENS` | `4096` | Max tokens for the API response |
| `SUBJECT_PREFIX` | `Morning Briefing` | Email subject line prefix |

## Cost

Uses Claude Haiku with up to 20 web searches per run. Typical cost is a few cents per briefing.
