/**
 * Sketch of a Supabase-backed repository. Not wired in — kept as a reference
 * for the migration. Install `@supabase/supabase-js`, create the tables below,
 * implement the remaining methods, and pass an instance to <StoreProvider repository={...}>.
 *
 *   create table sleep_records (
 *     id uuid primary key, user_id uuid references auth.users not null,
 *     bedtime timestamptz not null, wake_time timestamptz not null, timezone text not null,
 *     latency_min int, awake_min int, awakenings int, quality smallint, notes text,
 *     stages jsonb, source text not null, created_at timestamptz, updated_at timestamptz
 *   );
 *   create table journal_entries (id uuid primary key, user_id uuid not null, date date not null,
 *     data jsonb not null, created_at timestamptz, updated_at timestamptz, unique (user_id, date));
 *   create table user_settings (user_id uuid primary key, settings jsonb not null);
 *   create table active_sessions (user_id uuid primary key, started_at timestamptz, timezone text);
 *   -- enable RLS: using (auth.uid() = user_id)
 *
 * Example method:
 *
 *   async listRecords() {
 *     const { data, error } = await this.client.from('sleep_records').select('*');
 *     if (error) throw error;
 *     return data.map(fromRow);   // snake_case → SleepRecord
 *   }
 */
export {};
