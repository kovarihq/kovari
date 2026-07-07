-- Create account_type_enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type_enum') THEN
        CREATE TYPE public.account_type_enum AS ENUM ('USER', 'INTERNAL', 'ADMIN');
    END IF;
END$$;

-- Add account_type, is_internal and test_role to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS account_type public.account_type_enum DEFAULT 'USER'::public.account_type_enum NOT NULL;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false NOT NULL;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS test_role VARCHAR(255);

-- Create trigger to automatically keep is_internal in sync with account_type
CREATE OR REPLACE FUNCTION public.sync_is_internal()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.account_type = 'INTERNAL'::public.account_type_enum OR NEW.account_type = 'ADMIN'::public.account_type_enum THEN
        NEW.is_internal := true;
    ELSE
        NEW.is_internal := false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_sync_is_internal
BEFORE INSERT OR UPDATE OF account_type ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_is_internal();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_account_type ON public.users(account_type);
CREATE INDEX IF NOT EXISTS idx_users_is_internal ON public.users(is_internal);
