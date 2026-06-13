import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  || "https://ijrdkklzfqcwvknzzghx.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqcmRra2x6ZnFjd3Zrbnp6Z2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyODU1NDAsImV4cCI6MjA5Njg2MTU0MH0.01VNNScG2-4FOFcKP9WA2kFMKQKL89R4I13zkcbioNg";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
