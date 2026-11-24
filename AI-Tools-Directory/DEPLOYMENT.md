# All In On AI setup

The website uses Supabase for email/password and Google sign-in, and Razorpay for a one-time INR 299 membership. Tool listings are returned only by the authenticated, membership-checked API.

The QR image previously supplied is not used for automatic access: a static QR cannot reliably associate a payment with a signed-in account. Razorpay Checkout creates an order-specific UPI payment flow and the server verifies the payment before granting access. AI services linked from the directory may require separate accounts or subscriptions.

## 1. Supabase

1. Create a Supabase project.
2. Run (or rerun) `supabase/schema.sql` in the Supabase SQL Editor. The payment order amount is stored in paise (₹299 = 29,900 paise), and the schema applies the matching database constraint.
3. Enable Email auth and Google in Authentication > Providers.
4. Add the deployed site URL and its `/` callback URL to the Supabase redirect URL allow-list.
5. Copy the project URL, anon key, and service-role key into the hosting service's environment variables. Never put the service-role key in browser code or commit it.
6. Make a local `.env` from `.env.example`, fill the Supabase URL and service-role key, then run `npm run seed:tools` once. The seed data in `data/tools.json` is intentionally ignored by Git.

## 2. Razorpay

1. Use a Razorpay account approved for live payments; test keys only accept test payments.
2. Add the Key ID and Key Secret to the hosting environment.
3. Create a webhook pointing to `https://<your-render-host>/api/webhooks/razorpay` and subscribe to the `payment.captured` event.
4. Set the webhook secret in the hosting environment as `RAZORPAY_WEBHOOK_SECRET`.

The server always creates a ₹299 INR order. Access is granted only after the server verifies the signed checkout response or a valid Razorpay `payment.captured` webhook.

## 3. Render hosting

Create a Render Web Service from the GitHub repository, with **Root Directory** set to `AI-Tools-Directory`. Use `npm ci` as the build command and `npm start` as the start command. Set all variables listed in `.env.example` in Render's environment settings. The health-check route is `/healthz`.

Configure Supabase's allowed redirect URL to include the final domain. Configure Google OAuth's authorized redirect URI using the callback URL shown by Supabase.

## 4. BigRock DNS

Add `allinonai.in` as a custom domain in Render, then use the exact DNS records Render displays. In BigRock, remove the existing `127.0.0.1` A record and any conflicting parking records, and add Render's records for both the apex domain and `www` if desired. Wait for DNS propagation and enable HTTPS in Render.

GitHub Pages cannot host the authentication, payment-verification, or membership API. Deploy this app as the Render Web Service described above; the repository's Pages sync must remain disabled.
