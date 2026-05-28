DROP POLICY IF EXISTS "Users view own messages" ON public.bot_messages;
CREATE POLICY "Users view own messages" ON public.bot_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);