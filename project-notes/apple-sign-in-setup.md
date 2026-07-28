# Sign in with Apple setup

The frontend calls Supabase OAuth with `provider: 'apple'`. It is visible in the auth modal, but it can complete only after the Apple Developer and Supabase configuration below is in place.

## Apple Developer

1. In **Certificates, Identifiers & Profiles**, create or select the Focamai **App ID** and enable **Sign in with Apple**.
2. Create a **Services ID** for the web OAuth flow (for example, `com.focamai.web`). Configure it with the **Supabase project domain** (not the Focamai/Vercel domain) and the Supabase callback URL:
   `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
3. Create a Sign in with Apple key, enable it for that primary App ID, and record its Key ID. Download the `.p8` key once and store it securely; Apple will not offer it for download again.

## Supabase

1. Open **Authentication → Providers → Apple** and enable Apple.
2. Enter the Apple Services ID as the Client ID, plus the Team ID, Key ID, and private `.p8` key contents.
3. Under **Authentication → URL Configuration**, set the Site URL to the production Focamai origin and add every permitted redirect URL, including:
   - `https://<production-focamai-domain>/`
   - local development origin(s), if used
   - `https://<production-focamai-domain>/reset-password`
4. Confirm Email and Apple are enabled under Auth providers as appropriate.

## Verify after deployment

1. Open the sign-in modal and choose **Continue with Apple**.
2. Complete the Apple consent screen. Test both a normal email and **Hide My Email**.
3. Confirm the browser returns to Focamai signed in, saved searches migrate/persist, and sign-out works.
4. Repeat on the production domain. Apple only sends a user's name on the first authorization, so test with a fresh Apple authorization if you need to validate first-login data.
5. Set a recurring six-month reminder to generate and replace the Apple OAuth client secret in Supabase. Apple OAuth secrets expire after six months; missing the rotation causes web sign-in to fail.

Do not put the Apple `.p8` key, Team ID, or Key ID in frontend environment variables or this repository. They belong in Apple/Supabase provider settings.
