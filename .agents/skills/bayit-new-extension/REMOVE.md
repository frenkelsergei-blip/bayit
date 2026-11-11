# Remove an extension made with this skill

This skill itself changes nothing in Bayit: it only writes packages into `local-extensions/<id>/`. Each extension it made is removed on its own:

1. Follow that package's `REMOVE.md` (for example, a parent first chooses another AI provider, or the owner deletes an installation secret).
2. `node app/scripts/bayit-extension.mjs remove <id>` deletes its files, its line(s) in the local registry files and its record in `shared/extensions/installed.json`, leaving the copy exactly as it was before apply.
3. Delete `local-extensions/<id>/` only if the person no longer wants to re-apply or share it.

Family data an extension created is never deleted on removal.
