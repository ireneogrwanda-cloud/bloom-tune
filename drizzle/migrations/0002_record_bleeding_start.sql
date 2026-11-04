CREATE OR REPLACE FUNCTION public.record_bleeding_start(p_started_on date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owning public.cycles%ROWTYPE;
  v_next public.cycles%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in to record bleeding.'; END IF;
  IF p_started_on IS NULL OR p_started_on > (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'Choose today or an earlier bleeding start date.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_user::text));
  SELECT id INTO v_id FROM public.cycles WHERE user_id = v_user AND started_on = p_started_on LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT * INTO v_owning FROM public.cycles WHERE user_id = v_user AND started_on < p_started_on ORDER BY started_on DESC LIMIT 1 FOR UPDATE;
  SELECT * INTO v_next FROM public.cycles WHERE user_id = v_user AND started_on > p_started_on ORDER BY started_on ASC LIMIT 1 FOR UPDATE;
  INSERT INTO public.cycles(user_id, started_on, ended_on, status)
    VALUES (v_user, p_started_on, v_next.started_on, CASE WHEN v_next.id IS NULL THEN 'active'::public.cycle_status ELSE 'completed'::public.cycle_status END)
    RETURNING id INTO v_id;
  IF v_owning.id IS NOT NULL THEN
    UPDATE public.cycles SET ended_on = p_started_on, status = 'completed', ovulation_day = NULL,
      predicted_fertile_start = NULL, predicted_fertile_end = NULL
      WHERE id = v_owning.id AND user_id = v_user;
  END IF;
  UPDATE public.temperature_logs SET cycle_id = v_id
    WHERE user_id = v_user AND logged_for >= p_started_on
      AND (v_next.started_on IS NULL OR logged_for < v_next.started_on);
  UPDATE public.bot_messages SET cycle_id = v_id
    WHERE user_id = v_user AND cycle_id = v_owning.id
      AND created_at >= p_started_on::timestamp AT TIME ZONE 'UTC'
      AND (v_next.started_on IS NULL OR created_at < v_next.started_on::timestamp AT TIME ZONE 'UTC');
  IF v_next.id IS NULL THEN
    UPDATE public.profiles SET bot_state = '{}'::jsonb WHERE id = v_user;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_bleeding_start(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_bleeding_start(date) TO authenticated;