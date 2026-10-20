# promptdeck

A Claude Code mod with buttons in the band above the prompt box: **Enhance**, **Keepwarm**, **Clear** and **Undo**.

**Enhance** rewrites your draft prompt with haiku before you send it, sized to the draft: a small task becomes a sentence or two, a real feature at most 10 lines (the task, then only what adds something: at most 2 questions to ask you first, at most 3 "done when" checks, the installed skills that fit). It knows the session, so "fix it" becomes the concrete file and change: it reads your last prompt, Claude's last answer, the git branch and changed files, plus `CLAUDE.md`, `README.md` and `package.json`. It keeps the language you wrote in.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install promptdeck --marketplace trongld230289/promptdeck
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```sh
claude plugin install promptdeck --marketplace trongld230289/promptdeck
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `trongld230289/promptdeck`, then Add plugin.

## Use

- Type a draft, then press **[ Enhance ]** in the band above the prompt box. The rewrite replaces your draft so you can edit it, then press Enter.
- **« Original** appears after the rewrite and puts your own draft back.
- `/enhance <prompt>` does the same from a command.
- Keyboard: `ctrl+x tab` focuses the band, then `e` Enhance.
- If the prompt box can't take the text (a dialog is open), the band shows the rewrite with **[ Use this ]** to send it as is.

**Keepwarm** keeps this session's prompt cache warm while you are away. On a subscription the cache goes cold about an hour after the last turn, and the first prompt after that writes the whole conversation again, which costs far more than a warm turn.

- Press **☼ Keepwarm** before you leave, type how many pings (the first at once, then one every 50 minutes after the last turn; last time's number is filled in, 6 the first time) and press Enter.
- It stops by itself after that many pings, when you send a prompt, or when the 5-hour usage limit is reached. Press **☼ Warm** to stop it early.
- Only the session you press it in. Each ping is a short turn (`[keepwarm] ... reply with just: ok`) and counts toward your usage.
- Keyboard: `ctrl+x tab` focuses the band, then `w`.

**× Clear** empties the prompt box in one press (the keyboard way is `ctrl+l`); **Undo** then appears and puts that draft back. One step only: a second Clear replaces what Undo would restore.

Renamed from prompt-polish: `claude plugin uninstall prompt-polish`, then install promptdeck as above.

## Develop

`claude plugin test .` runs the tests. `/enhance-eval [id ...]` runs the real model over the sample drafts in `hooks/samples.ts` the way Enhance does and writes `~/promptdeck-enhance-eval.md` to grade; a change to `hooks/prompt.ts` is not done until that report reads well.
