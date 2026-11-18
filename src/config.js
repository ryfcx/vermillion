// Public Supabase settings. Both values are safe to ship in a browser:
// the publishable key only allows what the database's RLS policies allow.
// NEVER put the service_role / secret key or the DB password in this repo.
export const ONLINE = Object.freeze({
  enabled: true,   // feature switch: false = fully offline game (v2 behaviour)
  url: 'https://bethbacmhbwinjsxhkvl.supabase.co',
  publishableKey: 'sb_publishable_y-EkQLa4U68DcGCKuO4bHA__XNeRFvw',
  functionsUrl: 'https://bethbacmhbwinjsxhkvl.supabase.co/functions/v1'
});
