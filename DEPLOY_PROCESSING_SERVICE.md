# Processing service

This service powers the heavier document operations. It is intentionally separate from the user-facing site.

You can deploy the Docker service in `cloudrun/converter/` to any compatible container host. The frontend only needs two Vercel environment variables afterward:

- `CONVERTER_API_URL`
- `CONVERTER_SHARED_SECRET`

After adding them, redeploy Vercel. Word/Excel automatically start using the stronger conversion path and the advanced tool cards become visible automatically.

There is no user-facing mode switch.
