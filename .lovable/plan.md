# WhatsApp Fertility Chatbot

A WhatsApp bot where users send their daily basal body temperature (BBT) and receive AI-powered predictions about fertile vs infertile windows, plus a companion dashboard to view history.

## What gets built

**1. Web dashboard (TanStack Start)**
- Email/password signup & login (Lovable Cloud auth)
- Onboarding: link WhatsApp number, last period date, average cycle length
- Cycle list (threaded per cycle) with day-by-day temperature chart
- Fertility window visualization per cycle
- Prominent "Not medical advice / not contraception" disclaimer on signup and footer

**2. WhatsApp Cloud API integration**
- Webhook endpoint: `/api/public/whatsapp/webhook` (GET verify, POST receive)
- HMAC-SHA256 signature verification on every incoming message
- Server function to send WhatsApp messages (text + images)
- Daily reminder cron-friendly endpoint

**3. Bot conversation logic**
- Onboarding via chat: ask period start date, cycle length
- Daily temperature entry: parse messages like "36.7" or "36.55 today"
- Response: fertility status, day of cycle, AI-generated explanation, and a generated chart image of cycle so far
- Commands: `help`, `chart`, `reset cycle`, `status`

**4. AI predictions (Lovable AI Gateway)**
- `google/gemini-3-flash-preview` for textual interpretation
- `google/gemini-3.1-flash-image-preview` for cycle/temperature chart images
- Fertility algorithm: 3-over-6 BBT rule + calendar method to identify ovulation and fertile window (days -5 to +1 around ovulation)

## Database schema (Lovable Cloud)

```text
profiles        (id pk → auth.users, whatsapp_number unique, display_name, avg_cycle_length, disclaimer_accepted_at)
cycles          (id, user_id, started_on date, ended_on date null, ovulation_day int null, status enum[active,completed])
temperature_logs(id, cycle_id, user_id, logged_for date, temp_celsius numeric, source enum[whatsapp,web], notes, created_at)
bot_messages    (id, user_id, cycle_id null, direction enum[in,out], wa_message_id, body, media_url null, created_at)
```
RLS: every row scoped to `auth.uid()`; webhook uses service-role to look up user by `whatsapp_number`.

## Secrets needed from you

Meta WhatsApp Business Cloud API (free dev tier works):
- `WHATSAPP_ACCESS_TOKEN` — permanent system-user token
- `WHATSAPP_PHONE_NUMBER_ID` — from Meta app's WhatsApp → API Setup
- `WHATSAPP_VERIFY_TOKEN` — any random string you pick; you'll paste it in Meta's webhook config
- `WHATSAPP_APP_SECRET` — Meta app's App Secret (for signature verification)

I'll request these via the secure secret form **after** the webhook URL is built, so you can paste it into Meta's webhook configuration in the same step.

## Out of scope (for now)
- Wearable integrations (Oura/Apple Watch sync)
- Multi-language support
- Payment / subscription

## Build order
1. Enable Lovable Cloud + create schema with RLS
2. Auth pages + onboarding flow + dashboard shell
3. WhatsApp webhook (verify + signature check + message router)
4. Bot state machine + temperature parsing + fertility algorithm
5. AI text + chart-image responses
6. Request Meta secrets and verify end-to-end