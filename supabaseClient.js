const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const {createMeasuredFetch}=require('./beta/egress-metrics');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  {global:{fetch:createMeasuredFetch(globalThis.fetch.bind(globalThis))}}
);

module.exports = supabase;
