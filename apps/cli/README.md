---
description: "The mew-ide npm installer's prerequisites, unattended first launch, managed database, background operation, alternative curl entry, and publication status. Includes the package license."
---

# Mew CLI

With Node.js 24 and npm installed, run:

```sh
npx mew-ide
```

For a shell installer that supplies its own Node runtime in an existing
WSL 2/Linux/macOS terminal, or for source setup, see the three installation
routes in the [project README](https://github.com/s-saens/mew#get-started).

The installer prepares Mew and local Postgres without asking for configuration,
then opens the first-administrator page in your browser. Windows users start in
CMD or PowerShell; Mew prepares its dedicated WSL environment. OS installation
may require administrator approval or a restart. npm may ask permission to
download the package; `npx --yes mew-ide` suppresses that npm-owned prompt.

On Linux/macOS, the normal command runs Mew in the background and registers
login startup. Run it again to reopen Mew. `npx mew-ide status` checks readiness;
`npx mew-ide stop` stops the instance while preserving data and login startup.
`npx mew-ide disable-autostart` removes Mew's login registration.
Use `--foreground` for terminal-owned execution and `--no-autostart` to omit
login registration. Windows uses the managed installation's launcher.

After administrator creation, the remote-access popup presents Mewlink,
Tailscale, and Cloudflare Tunnel. Return through **Menu → Mewlink**. Provider
login remains a browser action; installation does not register remote accounts.

The initial npm package and runtime releases have not yet been published or
accepted on clean supported hosts. Until publication, use the source installation
in the [project README](https://github.com/s-saens/mew#readme).

## License

[Mew Source Available License 1.0](LICENSE). Personal and internal business use,
private modifications, and free redistribution under the license are permitted.
Selling Mew or modified versions, or providing paid hosting, managed services,
or SaaS access to them, requires separate written permission. Renaming or
bundling Mew does not remove these restrictions. You may sell your own work
created using Mew.

The project owner retains commercial rights to code they own or are authorized
to license. Third-party licenses and earlier MIT grants remain in effect.
This is source-available software with commercial restrictions.
