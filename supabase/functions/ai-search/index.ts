// Search with AI. POST with the user's JWT:
//   { workspace_id, mode: 'leads' | 'local', prompt }
//   -> { id, mode, suggested_mode, mode_reason, title, summary, notes, leads_filters, local_filters }
//
// Claude (claude-opus-5-5, structured output) turns the prompt into filters for both
// databases and says which one fits. The filters are sanitised against the whitelist and the
// real values in search_facets (translate.ts) and then searched by the browser through the
// same search_leads / search_local functions as Leads and Local businesses.
// Uses the official SDK (unlike the fetch-only Twilio/Stripe functions): this call is seconds
// long anyway, so the SDK's cold-start cost does not matter here.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { admin, corsHeaders, fail, getRole, getUser, json } from '../_shared/http.ts';
import { clip, OUTPUT_SCHEMA, sanitize, systemPrompt, type Facets, type Mode } from './translate.ts';

const MODEL = 'claude-opus-5-5';
const PER_USER_HOUR = 30;
const PER_WORKSPACE_DAY = 300;
const KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

let cached: { at: number; prompt: string; facets: { leads: Facets; local: Facets } } | null = null;

/** Facet values for both databases, refreshed every 10 minutes per function instance. */
async function vocabulary() {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached;
  // PostgREST returns at most 1,000 rows per request, so page through (about 2,800 rows)
  const rows: { source: string; facet: string; value: string }[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await admin().from('search_facets').select('source,facet,value,n').order('n', { ascending: false }).order('value').range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  const facets: { leads: Facets; local: Facets } = { leads: {}, local: {} };
  for (const r of rows) {
    const bucket = facets[r.source as Mode];
    (bucket[r.facet] ??= []).push(r.value);
  }
  // Yes/no filters that cannot match anything in the data right now (e.g. every local listing
  // has a website), so the AI explains that in a note instead of building an empty search.
  // Each probe uses a partial index from 0021, so these are instant.
  const probes = [
    { table: 'local_search', column: 'has_website', gap: 'Every local listing has a website, so "no website" cannot be searched. Do not use hasWebsite "no"; add a note saying so.' },
    { table: 'local_search', column: 'has_phone', gap: 'Every local listing has a phone number, so "no phone" cannot be searched. Do not use hasPhone "no"; add a note saying so.' },
    { table: 'lead_search', column: 'has_email', gap: 'Every lead has a work email, so "no email" cannot be searched. Do not use hasEmail "no"; add a note saying so.' },
  ];
  const gaps = (
    await Promise.all(
      probes.map(async (p) => {
        const { data, error } = await admin().from(p.table).select(p.column).eq(p.column, false).limit(1);
        return !error && (data ?? []).length === 0 ? p.gap : null;
      }),
    )
  ).filter((g): g is string => !!g);
  cached = { at: Date.now(), prompt: systemPrompt(facets, gaps), facets };
  return cached;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);
  const input = await req.json().catch(() => ({}));
  const workspaceId = String(input.workspace_id ?? '');
  const mode: Mode = input.mode === 'local' ? 'local' : 'leads';
  const prompt = clip(input.prompt, 1000);
  if (!prompt) return fail('empty_prompt', 400, { message: 'Describe who you want to find.' });
  if (!(await getRole(user.id, workspaceId))) return fail('forbidden', 403);
  if (!KEY) return fail('ai_not_configured', 503, { message: 'Search with AI is not switched on yet.' });

  const db = admin();
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const [{ count: mine }, { count: theirs }] = await Promise.all([
    db.from('ai_searches').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', hourAgo),
    db.from('ai_searches').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', dayAgo),
  ]);
  if ((mine ?? 0) >= PER_USER_HOUR) return fail('slow_down', 429, { message: 'You have run a lot of AI searches this hour. Try again shortly, or use the filters on Leads.' });
  if ((theirs ?? 0) >= PER_WORKSPACE_DAY) return fail('daily_limit', 429, { message: 'Your workspace has reached today’s AI search limit. It resets tomorrow.' });

  const vocab = await vocabulary();
  const today = new Date().toISOString().slice(0, 10);
  const client = new Anthropic({ apiKey: KEY });

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      // on a policy decline the API re-runs the request on Anthropic's recommended fallback model
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> } },
      system: [{ type: 'text', text: vocab.prompt, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `Selected search: ${mode === 'leads' ? 'leads (B2B decision-makers)' : 'local (local businesses)'}\nToday: ${today}\n\nRequest:\n${prompt}`,
        },
      ],
    });
  } catch (e) {
    console.error('ai-search claude error', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : (e as Error).message);
    if (e instanceof Anthropic.RateLimitError) return fail('busy', 429, { message: 'Search with AI is busy right now. Try again in a moment.' });
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return fail('ai_not_configured', 503, { message: 'Search with AI is not set up correctly.' });
    return fail('ai_error', 502, { message: 'The AI could not build that search. Try again or rephrase it.' });
  }

  const record = async (fields: Record<string, unknown>) =>
    db
      .from('ai_searches')
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        mode,
        prompt,
        model: response.model ?? MODEL,
        input_tokens: (response.usage.input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
        output_tokens: response.usage.output_tokens ?? 0,
        ...fields,
      })
      .select('id')
      .single();

  if (response.stop_reason === 'refusal') {
    await record({ ok: false, notes: ['refused'] });
    return fail('refused', 422, { message: 'That request can’t be turned into a search. Try describing the people or businesses you want to call.' });
  }
  const text = response.content.find((b) => b.type === 'text');
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = text && text.type === 'text' ? JSON.parse(text.text) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    await record({ ok: false, notes: [`unparsed: ${response.stop_reason}`] });
    return fail('ai_error', 502, { message: 'The AI could not build that search. Try again or rephrase it.' });
  }

  const leads = sanitize('leads', parsed.leads, vocab.facets.leads);
  const local = sanitize('local', parsed.local, vocab.facets.local);
  const suggested: Mode = parsed.suggested_mode === 'local' ? 'local' : 'leads';
  const notes = (Array.isArray(parsed.notes) ? parsed.notes : []).map((n) => clip(n, 200)).filter(Boolean).slice(0, 5);
  const title = clip(parsed.title, 80) || prompt.slice(0, 60);
  const summary = clip(parsed.summary, 300);

  const { data: row } = await record({
    suggested_mode: suggested,
    title,
    summary,
    leads_filters: leads.filters,
    local_filters: local.filters,
    notes,
  });

  return json({
    id: row?.id ?? null,
    mode,
    suggested_mode: suggested,
    mode_reason: clip(parsed.mode_reason, 200),
    title,
    summary,
    notes,
    leads_filters: leads.filters,
    local_filters: local.filters,
  });
});
