/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// js/supabase-config.js
// Supabase project credentials — anon (public) key only.
// Never put a service_role key here; this file is shipped to the browser.

const SUPABASE_URL = "https://gpvktzfyjynifalikztx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_FP8LeJBozKxl8ohdt3nnIw_m1Iqg7QK";

// supabase global is exposed by the CDN <script> tag loaded before this module.
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export { supabaseClient };
