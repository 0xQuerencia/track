# Editor heartbeat adapter

This local adapter is off by default. Set `TRACK_PULSE_ENABLED=1` only if you want timestamps from actual editing events. It never accepts filenames, code, text, project paths, or keystrokes.

Run `node editor.mjs heartbeat` from an editor's edit-event hook, throttled to at most once every ten seconds, not from an unconditional timer. For example, a Neovim Lua configuration can use:

```lua
local last = 0
local script = vim.fn.expand("~/.local/share/track-pulse/editor.mjs")
vim.api.nvim_create_autocmd({"TextChanged", "TextChangedI"}, {
  callback = function()
    local now = vim.uv.now()
    if now - last >= 10000 then
      last = now
      vim.system({"node", script, "heartbeat"}, {env = {TRACK_PULSE_ENABLED = "1"}})
    end
  end,
})
```

The first event or a gap longer than one minute is unknown. Two close events estimate an interval; this is observed editing activity, not proof of uninterrupted attention. Offline data stays in the private editor queue. Use a separate activity-only token and run `node editor.mjs sync` from an opt-in periodic job with `TRACK_PULSE_URL`, `TRACK_PULSE_TOKEN`, and `TRACK_PULSE_ENABLED=1` set. Run `node editor.mjs reset` to forget the prior heartbeat when you stop collection. No token is needed in the editor itself. Overlap with browser/desktop observations is deduplicated by Pulse.
