# Foundry Desktop — Virtual Computers (v1.0.0)

A system-agnostic fictional computer explorer for **Foundry VTT 14**. GM authors computers; authorized players explore desktops, folders, mail, fictional websites, and clues.

## Install

From **Foundry Setup > Add-on Modules > Install Module**, paste the manifest URL **after publishing a GitHub release**:

`https://github.com/jeremyrobertdavison/foundry-desktop/releases/latest/download/module.json`

For manual installation, extract `foundry-desktop.zip` into your Foundry **User Data** `Data/modules/` directory; it must produce `Data/modules/foundry-desktop/module.json`. Restart Foundry and enable the module in your world.

## GM quick start

1. As GM open **Game Settings** and click **Computers** (or press **Ctrl+Shift+D**).
2. Click **New Computer**. Set hostname, displayed account username, optional account avatar and wallpaper. Use **Browse** to select Foundry assets. Wallpaper is per computer; select cover/contain/stretch/center/repeat.
3. Click **Add Item** to create folders or content (text, image, audio, video, email, web or spreadsheet text). For images/audio/video enter the Foundry asset URL in **Media Asset**. For web pages enter a fictional address such as `intranet.local` and HTML in Content.
4. Save Computer, then use **Open** to preview or select a connected player and **Grant Access**. The player gets an interactive virtual desktop window.
5. Use Start to open apps. Click icons/files to read content, enter passwords for protected files, search, or explore mail and fictional webpages.

## Important limitations of this first release

- v1 implements computer library, editor, wallpaper, username in Start menu, File Explorer, basic email/browser/search, Recycle Bin viewing, read/unlock state, player access, and JSON export/import.
- The desktop and its internal app panel are resizable **as one Foundry window**, not separately draggable OS windows.
- 'Hidden' items are excluded until GM changes them or they have been discovered previously. Browser addresses resolve **only** to GM-authored web items. Spreadsheets display their raw text/CSV content, not a full calculation grid.
- Player access grants are held in the GM client's memory. If the active GM reloads, grant access again; player read/unlock state is saved in the GM-only database.
- Currently a single active GM is recommended. Session granting does not target offline users.
- No scene-tile launch, network simulation, advanced terminal, email composition, or hacking game in v1.
- Only the GM can restore Recycle Bin items.
- Imported computers are untrusted story content. Only import files from sources you trust. Fictional web HTML is rendered inside a sandboxed iframe.

## Data and permissions

Computer information, passwords, unread clues, and discovery state are stored as module flags on a GM-only JournalEntry. **Do not change its ownership or share the Journal with players**. The GM grants an explicit session and sends the selected computer data over Foundry's socket. Player snapshots omit hidden entries and redact locked content and password values. This limits accidental client-side spoilers; however, any unlocked material that has been shared with an authorized player can be inspected using browser developer tools. This module is not an anti-cheat or secure document distribution service.

## GitHub publishing

Create repo `jeremyrobertdavison/foundry-desktop` and commit these source files. Tag `v1.0.0`, then attach both release assets `module.json` and `foundry-desktop.zip` to that release. The manifest URLs are configured for those assets. `foundry-desktop-source-v1.0.0.zip` is a source archive and should not be used as the Foundry install package.

## Development

No build tools required, plain ES modules + Handlebars + CSS; ApplicationV2 with HandlebarsApplicationMixin. Foundry 14 API reference: https://foundryvtt.com/api/modules/foundry.applications.html

Licensed MIT.
