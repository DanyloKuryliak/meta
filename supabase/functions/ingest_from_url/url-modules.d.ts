/**
 * Type declarations for Deno URL imports used by Supabase Edge Functions.
 * These resolve at runtime in the Deno edge runtime; this file only satisfies the TypeScript compiler.
 */
declare module "https://esm.sh/@supabase/supabase-js@2" {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, unknown>
  ): { from: (table: string) => unknown; [key: string]: unknown };
}
