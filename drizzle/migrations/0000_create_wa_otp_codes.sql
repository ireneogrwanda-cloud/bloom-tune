CREATE TABLE public.wa_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wa_otp_codes_phone_idx ON public.wa_otp_codes (phone, created_at DESC);

GRANT ALL ON public.wa_otp_codes TO service_role;

ALTER TABLE public.wa_otp_codes ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (server functions) may touch this table.