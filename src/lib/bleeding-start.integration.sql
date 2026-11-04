-- Run with a disposable authenticated fixture inside a transaction, then roll back.
-- The caller must supply an existing test owner and its fixture cycles/readings.
-- Never run against a real person's account.
-- Fixture: completed Sep 1–Oct 1 cycle, active Oct 1 cycle,
-- temperature logs Oct 6 (36.38) and Oct 8 (36.42).
DO $$
DECLARE v_id uuid; v_again uuid; v_old uuid;
BEGIN
  SELECT id INTO v_old FROM public.cycles WHERE user_id=auth.uid() AND started_on='2026-10-01';
  IF v_old IS NULL THEN RAISE EXCEPTION 'Disposable fixture required'; END IF;
  v_id := public.record_bleeding_start('2026-10-07');
  v_again := public.record_bleeding_start('2026-10-07');
  IF v_id <> v_again THEN RAISE EXCEPTION 'Duplicate bleeding cycle'; END IF;
  IF (SELECT count(*) FROM public.temperature_logs WHERE user_id=auth.uid()) <> 2 THEN RAISE EXCEPTION 'Reading loss'; END IF;
  IF (SELECT cycle_id FROM public.temperature_logs WHERE user_id=auth.uid() AND logged_for='2026-10-08') IS DISTINCT FROM v_id THEN RAISE EXCEPTION 'Reading not moved'; END IF;
  IF (SELECT cycle_id FROM public.temperature_logs WHERE user_id=auth.uid() AND logged_for='2026-10-06') IS DISTINCT FROM v_old THEN RAISE EXCEPTION 'Earlier reading moved'; END IF;
  IF (SELECT ended_on FROM public.cycles WHERE id=v_old) IS DISTINCT FROM '2026-10-07'::date THEN RAISE EXCEPTION 'Old boundary wrong'; END IF;
  v_id := public.record_bleeding_start('2026-09-20');
  IF (SELECT status FROM public.cycles WHERE id=v_id) <> 'completed' THEN RAISE EXCEPTION 'Historical cycle active'; END IF;
  IF (SELECT ended_on FROM public.cycles WHERE id=v_id) IS DISTINCT FROM '2026-10-01'::date THEN RAISE EXCEPTION 'Historical end wrong'; END IF;
  IF (SELECT count(*) FROM public.cycles WHERE user_id=auth.uid() AND status='active') <> 1 THEN RAISE EXCEPTION 'Active cycle count wrong'; END IF;
END $$;