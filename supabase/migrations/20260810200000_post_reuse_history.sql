-- Migration: Add reused_from_post_id to social_posts and fix platform_capabilities scopes

-- 1. Add tracking for reused posts
ALTER TABLE public.social_posts
ADD COLUMN reused_from_post_id uuid REFERENCES public.social_posts(id) ON DELETE SET NULL;

-- 2. Fix the validation error where missing scopes block publishing.
-- Facebook and Snapchat in our OAuth config use implicit/config-driven permissions or 
-- minimal explicit scopes. Instagram also has differing scope labels.
-- By setting them to empty here, we rely on the provider's API to enforce permissions 
-- rather than blocking eagerly in the UI with a false positive.

UPDATE public.platform_capabilities
SET required_scopes = '{}'
WHERE platform IN ('facebook', 'instagram', 'snapchat');
