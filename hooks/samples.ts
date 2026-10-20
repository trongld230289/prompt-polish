// Drafts the person really types, with what a good rewrite of each must do. `/enhance-eval` runs the real model over
// them the way Enhance does and writes a report to grade; a prompt change is not done until the report reads well.
export type Sample = { id: string; draft: string; session: string; project?: string; expect: string }

export const SAMPLES: readonly Sample[] = [
  {
    id: 'fix-image',
    draft: 'fix bug này đi',
    session:
      'Branch: feat/vi-voice\nChanged files:\n M hooks/register.tsx\n\nThe person\'s last prompt:\n[Image] bể UI, cách nào làm gọn lại\n\nClaude\'s last answer (cut):\nThe band wraps because the hover hint, the error text and the Clear/Undo buttons share one row; the status Text in hooks/register.tsx has no truncate. I propose a Box with flexGrow 1 and flexShrink 1 around the status and a flexShrink 0 Box for the buttons.',
    expect: '[fix]; names hooks/register.tsx and the wrap; verify by running the plugin tests; report what changed; 2-5 lines',
  },
  {
    id: 'diagnose-error',
    draft: "TypeError: Cannot read properties of undefined (reading 'text')\n    at enhance (hooks/register.tsx:131:38)\nbug ở đâu vậy, confirm rùi fix sau",
    session: 'Branch: feat/vi-voice\nChanged files:\n(clean)',
    expect: '[diagnose]; keeps the TypeError and the line verbatim; find cause, report file/line/why; no change until I confirm',
  },
  {
    id: 'diagnose-image',
    draft: 'Check lỗi này, nó bị gì, ko code',
    session: '',
    expect: "[diagnose]; 'theo ảnh đính kèm'; explain only, no code",
  },
  {
    id: 'git-merge',
    draft: 'Merge vào master đi',
    session: 'Branch: feat/vi-voice\nChanged files:\n(clean)',
    expect: '[git]; feat/vi-voice -> master; check tests/clean first; no force; 1-2 lines',
  },
  {
    id: 'git-push',
    draft: 'Push code đi',
    session: 'Branch: feat/vi-voice\nChanged files:\n M src/extension.ts\n M README.md',
    expect: '[git]; push feat/vi-voice; the 2 modified files are uncommitted: commit first (ask the message or propose one); no force',
  },
  {
    id: 'review-ext',
    draft: 'review ext này đi',
    session:
      'Branch: feat/vi-voice\nChanged files:\n(clean)\n\nThe person\'s last prompt:\nenhance viết hơi dài và lang mang phải ko\n\nClaude\'s last answer (cut):\nYes, the system prompt forces five sections on every draft.',
    project: '--- package.json ---\n{ "name": "noidle", "displayName": "NoIdle", "description": "VS Code extension: reads Claude Code\'s answers aloud in Vietnamese" }',
    expect: '[review]; names the NoIdle extension; default scope = the changes on feat/vi-voice, says so; Dùng skill code-review (or security-review); findings by severity with file+line; no code changes',
  },
  {
    id: 'nothing-word',
    draft: 'cai band',
    session: "Claude's last answer (cut):\nI only got the words 'cai band', not sure what you want with the band.",
    expect: '[nothing]; one short question about what to do with the band',
  },
  {
    id: 'continue',
    draft: 'làm đi ku',
    session:
      'The person\'s last prompt:\npromt zi đủ WOW ko hay bạn đang chấp vá\n\nClaude\'s last answer (cut):\nHonestly, patching. To stop: (1) a sample set of 10 drafts you really type with expectations, (2) a prompt that sorts the draft by kind first, one small shape per kind, (3) a script that runs haiku over the samples so you grade until 9/10 pass, then lock it.',
    expect: '[continue]; names the three steps; start with step 1; 1-2 lines',
  },
  {
    id: 'question-ctrl-l',
    draft: 'ctr L ko hoat động',
    session:
      'The person\'s last prompt:\nclick enhance xong ko thấy button nữa thì sao clear :)\n\nClaude\'s last answer (cut):\nThe engine hides the band when the prompt box is taller than half the terminal. Press Ctrl+L to clear the whole box, or Ctrl+G for the external editor.',
    expect: '[question] or [diagnose]; Ctrl+L to clear the prompt box did nothing after the band was hidden; why, and what to press instead; no code',
  },
  {
    id: 'change-buttons',
    draft: 'move 2 button qua phải dc ko',
    session:
      'Branch: main\nChanged files:\n(clean)\n\nClaude\'s last answer (cut):\nDone: promptdeck 0.2.5 reverts the two-line band. Clear and Undo sit after Enhance on the one row, drawn in hooks/register.tsx.',
    expect: '[change]; move the Clear and Undo buttons to the right edge of the band in hooks/register.tsx; short, no questions',
  },
  {
    id: 'change-ui-broken',
    draft: 'bể UI, cách nào làm gọn lại or đẹp hơn',
    session: "Claude's last answer (cut):\nDone: promptdeck 0.2.6, Clear and Undo at the band's right edge.",
    expect: '[change] (or [question]); the band\'s row overflows per the attached screenshot; propose a tidier layout; maybe 1 question (fix now or propose first)',
  },
  {
    id: 'nothing-number',
    draft: '12321321321312',
    session: '',
    expect: '[nothing]; one question; no structure',
  },
]
