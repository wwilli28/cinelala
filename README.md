This is a Next.js app for aggregating repertory and specialty screenings across Los Angeles theaters.

## Getting Started

1. Create a local env file:

```bash
cp .env.example .env.local
```

2. Add your TMDB bearer token to `.env.local`:

```bash
TMDB_API_KEY=your_tmdb_bearer_token_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## TMDB

TMDB enrichment is optional but recommended. When `TMDB_API_KEY` is configured, the app can fill in missing:

- release year
- director
- runtime
- overview
- TMDB poster fallback

Without it, theaters like Nuart may still show the correct title and poster from the source site, but some cards will be missing year/director metadata.

Use a TMDB v4 bearer token in `TMDB_API_KEY`.

## Supabase Login And Favorites

User accounts and persisted favorites use Supabase Auth plus a `favorites` table.

1. Create a Supabase project.
2. Copy your project URL and anon key into `.env.local`.
3. In the Supabase SQL editor, run [supabase/favorites.sql](/Users/wadsworth/Desktop/la_showtimes/supabase/favorites.sql).

The app now works like this:

- logged out: favorites stay local in the browser
- logged in: favorites are saved to Supabase and follow the user across visits

The login page is available at `/auth`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
