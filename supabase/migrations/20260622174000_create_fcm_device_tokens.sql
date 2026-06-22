-- Create fcm_device_tokens table
CREATE TABLE IF NOT EXISTS public.fcm_device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    fcm_token TEXT NOT NULL UNIQUE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
    device_name TEXT NULL,
    app_version TEXT NULL,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT unique_user_device UNIQUE (user_id, device_id)
);

-- Index for lookup performance
CREATE INDEX IF NOT EXISTS idx_fcm_device_tokens_user_id ON public.fcm_device_tokens(user_id);

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_fcm_device_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger definition
CREATE OR REPLACE TRIGGER trigger_update_fcm_device_tokens_updated_at
    BEFORE UPDATE ON public.fcm_device_tokens
    FOR EACH ROW
    EXECUTE FUNCTION public.update_fcm_device_tokens_updated_at();
