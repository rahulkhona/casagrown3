ALTER TABLE public.provider_queue_status DROP CONSTRAINT IF EXISTS provider_queue_status_provider_check;
ALTER TABLE public.provider_queue_status ADD CONSTRAINT provider_queue_status_provider_check CHECK (provider IN ('tremendous', 'globalgiving', 'reloadly', 'stripe', 'paypal'));

INSERT INTO public.provider_queue_status (provider, is_queuing, updated_at) 
VALUES ('paypal', false, now()) 
ON CONFLICT (provider) DO UPDATE SET is_queuing = false, updated_at = now();

DELETE FROM public.provider_queue_status WHERE provider = 'stripe';
