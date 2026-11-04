ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS submitted_by_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.event_payments
    ADD COLUMN IF NOT EXISTS submitted_by_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL;
