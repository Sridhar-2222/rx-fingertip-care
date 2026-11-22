# Rx Fingertip Care

Patient and chemist companion app for Telangana and Andhra Pradesh (Telugu / English).

- Live app: https://sridhar-2222.github.io/rx-fingertip-care/
- Plain HTML + JavaScript (no build step), served by GitHub Pages from `main`.
- Backend: Supabase (auth + Postgres with Row Level Security). Only the public publishable key is in the code.
- Never commit SMTP keys, the Supabase service-role key, database passwords or AI keys.

Separate from Fingertip Easy (hotel app) and the old Rx Fingertip app.
