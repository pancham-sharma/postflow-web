UPDATE public.social_post_destinations
SET error_message = 'The added music mix did not run for this platform. This platform now publishes with the original video audio — retry it.'
WHERE error_message ILIKE '%music%'
  AND platform <> 'youtube';

UPDATE public.publishing_attempts
SET error_code = 'media_processor_route_not_found'
WHERE error_code = 'music_rights_blocked'
  AND COALESCE(error_message, '') ILIKE '%404%';