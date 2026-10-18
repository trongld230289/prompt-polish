# prompt-polish

A Claude Code mod that rewrites your draft prompt with haiku before you send it. The rewrite names the installed skills that fit the task, lists the decisions Claude should ask you about first, describes what "done" looks like, and adds project context from `CLAUDE.md`, `README.md` and `package.json`. It keeps the language you wrote in.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-polish --marketplace trongld230289/prompt-polish
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```sh
claude plugin install prompt-polish --marketplace trongld230289/prompt-polish
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `trongld230289/prompt-polish`, then Add plugin.

## Use

- Type a draft, then press **[ Enhance ]** in the band above the prompt box. The rewrite replaces your draft so you can edit it; press Enter or **[ Send ]**.
- `/enhance <prompt>` does the same from a command.
- Keyboard: `ctrl+x tab` focuses the band, then `e` Enhance, `s` Send.
- If the prompt box can't take the text (a dialog is open), the band shows the rewrite with **[ Use this ]** to send it as is.
