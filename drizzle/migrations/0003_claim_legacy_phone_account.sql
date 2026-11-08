CREATE OR REPLACE FUNCTION public.claim_legacy_phone_account()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_phone text := regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g');
  v_legacy_id uuid;
  v_legacy public.profiles%ROWTYPE;
BEGIN
  IF v_user IS NULL OR length(v_phone) < 7 THEN
    RAISE EXCEPTION 'A verified phone sign-in is required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_phone));

  SELECT p.id INTO v_legacy_id
  FROM public.profiles AS p
  JOIN auth.users AS u ON u.id = p.id
  WHERE p.whatsapp_number = v_phone
    AND p.id <> v_user
    AND u.email = ('wa_' || v_phone || '@bot.local')
    AND u.phone IS NULL
  LIMIT 1;

  IF v_legacy_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.cycles WHERE user_id = v_user)
    OR EXISTS (SELECT 1 FROM public.temperature_logs WHERE user_id = v_user)
    OR EXISTS (SELECT 1 FROM public.bot_messages WHERE user_id = v_user)
    OR EXISTS (SELECT 1 FROM public.notifications WHERE user_id = v_user)
    OR EXISTS (SELECT 1 FROM public.push_tokens WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'This verified account already contains data; the legacy account cannot be merged automatically.';
  END IF;

  SELECT * INTO v_legacy FROM public.profiles WHERE id = v_legacy_id FOR UPDATE;

  UPDATE public.cycles SET user_id = v_user WHERE user_id = v_legacy_id;
  UPDATE public.temperature_logs SET user_id = v_user WHERE user_id = v_legacy_id;
  UPDATE public.bot_messages SET user_id = v_user WHERE user_id = v_legacy_id;
  UPDATE public.notifications SET user_id = v_user WHERE user_id = v_legacy_id;
  UPDATE public.push_tokens SET user_id = v_user WHERE user_id = v_legacy_id;

  DELETE FROM public.profiles WHERE id = v_legacy_id;
  UPDATE public.profiles
  SET display_name = v_legacy.display_name,
      whatsapp_number = v_legacy.whatsapp_number,
      avg_cycle_length = v_legacy.avg_cycle_length,
      period_length = v_legacy.period_length,
      disclaimer_accepted_at = v_legacy.disclaimer_accepted_at,
      bot_state = v_legacy.bot_state,
      created_at = v_legacy.created_at
  WHERE id = v_user;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_legacy_phone_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_legacy_phone_account() TO authenticated;