-- 1. Waitlist Table Enhancements
ALTER TABLE public.waitlist 
ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP WITH TIME ZONE;

-- 2. Users Table Enhancements
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS beta_status VARCHAR(50) DEFAULT 'not_invited' CHECK (beta_status IN ('not_invited', 'invited', 'activated')),
ADD COLUMN IF NOT EXISTS invite_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS activation_date TIMESTAMP WITH TIME ZONE;

-- 3. Feedback Table Enhancements
ALTER TABLE public.feedback 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'resolved'));

-- 4. Feedback Notes Table (Append-Only)
CREATE TABLE IF NOT EXISTS public.feedback_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id UUID NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES public.admins(id) ON DELETE SET NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_notes_feedback_id ON public.feedback_notes(feedback_id);
