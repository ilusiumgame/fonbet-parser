# Fonbet Parser

Project documentation.

## ACE Learned Strategies

<!-- ACE:START - Do not edit manually -->
skills[6	]{id	section	content	helpful	harmful	neutral}:
  api_integration-00001	api_integration	BetBoom payments API returns `history` field, not `payments`	1	0	0
  defensive_coding-00002	defensive_coding	Add AbortController timeout to all fetch() calls	2	1	0
  api_integration-00003	api_integration	"BetBoom fetch requests require `x-platform: web` header"	1	0	0
  api_integration-00004	api_integration	earlyInit fetch patch must skip BetBoom /api/access/ URLs	1	0	0
  api_integration-00005	api_integration	BetBoom GIB antibot: use injected <script> tag for fetch, not GM_xmlhttpRequest or unsafeWindow.fetch	1	0	0
  api_integration-00006	api_integration	BetBoom valid BET_STATUS_GROUPS: WIN, LOSE, PENDING (not RETURN/IN_PROGRESS — causes 504)	1	0	0
<!-- ACE:END -->
