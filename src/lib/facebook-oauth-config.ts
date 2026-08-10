/** Public Login for Business configuration metadata; never a secret. */
export const FACEBOOK_CONFIGURATION_ID_ENV = "FACEBOOK_CONFIGURATION_ID";

/** Parameters required by Meta's Facebook Login for Business dialog. */
export function facebookBusinessAuthorizeParams(configurationId: string) {
  return {
    config_id: configurationId,
    override_default_response_type: "true",
  } as const;
}
