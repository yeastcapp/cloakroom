# Cloakroom

Hide private details before you paste text into an AI, then put them back afterwards.

You paste in "Our donor Jane Morrison (jane@x.com) gave $500." Claude only ever sees "Our donor [PERSON_3] ([EMAIL_1]) gave $500." When Claude's reply comes back, Cloakroom swaps every ticket back for the real detail.

## Getting the app

1. On GitHub, open **Actions → Build Cloakroom → Run workflow**. It takes about 15 minutes.
2. Open **Releases**. You'll find a draft release holding the installers.
   - **Mac:** the `.dmg` file (works on Apple Silicon and Intel)
   - **Windows:** the `-setup.exe` file

### First launch

The app isn't signed by Apple or Microsoft yet, so each system warns you once.

- **Mac:** open the `.dmg` and drag Cloakroom to Applications. The first time, right-click Cloakroom and choose **Open**, then **Open** again. If macOS says the app "is damaged", open Terminal and run `xattr -cr /Applications/Cloakroom.app`, then try again. When asked whether Cloakroom may use its Keychain item, choose **Always Allow**.
- **Windows:** run the setup file. If SmartScreen appears, click **More info → Run anyway**. No admin rights are needed.

## How it protects your data

- **No network.** The app contains no networking code and no networking plugins, and its content security policy forbids every outside connection.
- **Encrypted at rest.** Tickets are stored in one file in the app's private folder, encrypted with AES-256-GCM. The encryption key lives in the macOS Keychain or Windows Credential Manager, never next to the file.
- **Auto-erase.** Tickets not used for 3 days (adjustable) are deleted.
- **Erase everything.** After every pick-up you can wipe the tickets, all text boxes and your clipboard. Erasing also destroys the encryption key, so an old copy of the file in a backup can never be read.

What it can't do: Cloakroom only catches what it recognises. Names it has never seen can slip through, and context can identify people ("the ED of a land trust in Moncton"). Add regular names to the watch lists, and read the masked text before sending it.

## For later: Mac App Store

`src-tauri/Entitlements.appstore.plist` is ready for a sandboxed App Store build. Because it requests no network entitlement, macOS itself blocks all internet access. Publishing needs an Apple Developer account, signing certificates and a provisioning profile. See [Tauri's App Store guide](https://v2.tauri.app/distribute/app-store/).

## Developing

```
npm install
npm run dev       # run the app locally (needs Rust installed)
cargo test --manifest-path src-tauri/Cargo.toml
```

The interface is plain HTML, CSS and JavaScript in `src/`. Detection and masking logic is in `src/core.js`. The encrypted storage is in `src-tauri/src/lib.rs`.
