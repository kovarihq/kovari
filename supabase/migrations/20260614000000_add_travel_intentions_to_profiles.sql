-- Add travel_intentions to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS travel_intentions jsonb 
DEFAULT '[]'::jsonb;

-- Index for querying by intention destination
CREATE INDEX IF NOT EXISTS idx_profiles_travel_intentions 
ON public.profiles USING gin(travel_intentions);

COMMENT ON COLUMN public.profiles.travel_intentions IS 
'Array of travel intent objects: [{destination, destination_details, rough_dates, budget_range, travel_style, is_confirmed}]';
