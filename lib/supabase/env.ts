function isPlaceholderSupabaseValue(value: string) {
  return (
    value === "your_supabase_project_url" ||
    value === "your_supabase_anon_key" ||
    value.trim().length === 0
  );
}

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    !url ||
    !anonKey ||
    isPlaceholderSupabaseValue(url) ||
    isPlaceholderSupabaseValue(anonKey)
  ) {
    return null;
  }

  return { url, anonKey };
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseEnv());
}
