# Ideas Backlog

## 1. Increase retry advice query char limit to 100
Currently `MAX_QUERY_LENGTH` in `backend/lib/retry-advice.js` is capped at 80 chars. Raise it to 100 and update the prompt instruction and tests accordingly.

## 2. Misspelling detection — "showing results for X / did you mean Y?"
When weak results come in due to a misspelling, surface a banner like:
- "Showing results for **[corrected term]**"
- "Did you mean **[original]**?"

Behind the scenes, fire a background call to Oxylabs using the corrected term to fetch better results. Need to figure out where misspelling signals come from (SerpApi returns a `search_information.spelling_fix` field — check if Oxylabs equivalent exists).
