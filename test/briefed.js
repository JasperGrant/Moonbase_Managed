// An init script for the browser tests: every seat has already read its briefing, so the pop-up
// (docs/SPEC-guidance.md, role briefings) does not cover the buttons the tests press.
try { for (const r of ['astronaut', 'ops', 'tech', 'sci', 'all']) sessionStorage.setItem('moonbase-brief-' + r, '1'); } catch { /* no storage */ }
