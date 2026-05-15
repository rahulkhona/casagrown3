-- Tighten CommunityRedirectCard trigger to only fire on explicit social intent.
-- Previously, "ask the community a question" was too broad — the model was
-- redirecting gardening advice questions to the community board instead of
-- answering them directly.

-- 1. Update the skill trigger rule
UPDATE public.growbot_skills
SET trigger_rules = 'Trigger ONLY when the user explicitly wants to post or share something with neighbors — e.g. "post this to the community", "ask my neighbors", "share this update", "poll the neighborhood". Do NOT trigger for gardening questions, planting advice, or any question the user is asking YOU to answer. If the user is asking GrowBot for help, answer directly — do not redirect.'
WHERE name = 'CommunityRedirectCard';

-- 2. Update the global rule
UPDATE public.growbot_rules
SET rule_text = 'COMMUNITY REDIRECT RULE: ONLY call CommunityRedirectCard when the user explicitly asks to post/share something with the community or poll their neighbors. Words like "post this", "share with neighbors", "ask the community" signal this intent. Do NOT call CommunityRedirectCard for gardening questions, planting advice, or any question where the user wants YOUR answer. You are the gardening expert — answer directly.'
WHERE rule_text LIKE 'COMMUNITY REDIRECT RULE:%';
