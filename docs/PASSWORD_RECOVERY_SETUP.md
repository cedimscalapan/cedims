# Password recovery deployment

The application supports PKCE code links, legacy recovery session links, and direct recovery token-hash links. It exchanges the link, validates the resulting user with Supabase Auth, then allows a password update. Recovery credentials are removed from the address bar after verification. Reopening a cleaned page requires a fresh reset email.

## Hosted Supabase settings

1. Under Authentication URL Configuration, use the deployed production site URL. Allow both exact redirects because users access both hostnames:
   - https://cedimscalapan.com/auth/update-password
   - https://www.cedimscalapan.com/auth/update-password
   Add localhost redirects only for the development origins actually in use.
2. Configure a working production email provider under Authentication email/SMTP settings, including its verified sender. Supabase built-in delivery has recipient restrictions and is not a production delivery service.
3. Under Authentication Email Templates, Reset Password, paste `supabase/templates/recovery.html`. The direct token-hash link supports opening the reset email in another browser/device without the original PKCE verifier. The default template also works when opened in the browser and origin that requested it.
4. Deploy the app changes. No database migration is needed for this password recovery update.

## Acceptance check

Use an authorized test account whose inbox is available. Request recovery, check inbox/spam, open the latest link, set matching passwords, and sign in with the new password. Confirm the old password fails. Test a reused/expired link and an interrupted connection. Verify both production hostnames. When using the provided token-hash template, also test opening in a different browser. Never record reset tokens or passwords in screenshots/logs.

The application cannot confirm inbox delivery from Supabase's request acceptance alone. Live email delivery and project settings require verification in the hosted project.

References: https://supabase.com/docs/guides/auth/passwords and https://supabase.com/docs/guides/auth/auth-email-templates
