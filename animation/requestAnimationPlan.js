// Minimal requester that asks GPT for compact animation plan JSON
// Validates against planSchema.json

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { OpenAI } = require('openai');

const schemaPath = path.join(__dirname, 'planSchema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PLAN_SYSTEM_PROMPT = `You are an animation planner. Output ONLY compact JSON matching the provided schema.\n- Do not include markdown, comments, or prose.\n- Ensure duration_ms closely matches provided duration (±50ms).`;

async function requestAnimationPlan({ persona, text, timings, context }) {
  const cacheKey = JSON.stringify({ persona: persona?.id || persona, text });
  const cacheDir = path.join(process.cwd(), '.cache');
  const cacheFile = path.join(cacheDir, 'plan-cache.json');
  try { if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir); } catch (_) {}
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (_) {}
  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  const userPayload = {
    schema: 'AnimationPlan',
    persona: persona || null,
    text,
    duration_ms: timings?.durationMs || 0,
    timings: {
      words: (timings?.words || []).slice(0, 50),
      phonemes: (timings?.phonemes || []).slice(0, 80)
    },
    context: context || null
  };

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: PLAN_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(userPayload) }
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' }
  });

  const choice = completion.choices?.[0]?.message?.content || '{}';
  let plan;
  try { plan = JSON.parse(choice); } catch (e) { throw new Error('Invalid JSON from model'); }
  const ok = validate(plan);
  if (!ok) {
    const errors = validate.errors?.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error('Plan validation failed: ' + errors);
  }

  // Sanity: duration match
  const diff = Math.abs((timings?.durationMs || 0) - (plan.duration_ms || 0));
  if (diff > 50) {
    throw new Error(`Plan duration mismatch: got ${plan.duration_ms}, expected ${timings?.durationMs}`);
  }

  cache[cacheKey] = plan;
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  return plan;
}

module.exports = { requestAnimationPlan };


