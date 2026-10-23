//! Cloakroom's only native code: encrypted storage for the tickets and a native "Save as" dialog.
//!
//! How the storage works, in plain terms:
//! - The tickets are saved as one file, `vault.bin`, in the app's private data folder.
//! - That file is encrypted with AES-256-GCM. On its own it's unreadable.
//! - The 256-bit encryption key is kept in the operating system's secure store
//!   (macOS Keychain or Windows Credential Manager), never next to the file.
//! - "Erase" deletes the file AND destroys the key, so any old copy of the file
//!   (for example inside a backup) can never be decrypted again.

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use zeroize::Zeroize;

const SERVICE: &str = "Cloakroom";
const ACCOUNT: &str = "vault-key";
const NONCE_LEN: usize = 12;

fn vault_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("vault.bin"))
}

fn key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

/// Fetch the encryption key from the OS secure store, optionally creating a fresh one.
fn get_key(create: bool) -> Result<Option<[u8; 32]>, String> {
    let entry = key_entry()?;
    match entry.get_password() {
        Ok(encoded) => {
            let bytes = B64.decode(encoded).map_err(|e| e.to_string())?;
            let key: [u8; 32] = bytes
                .try_into()
                .map_err(|_| "stored key has the wrong length".to_string())?;
            Ok(Some(key))
        }
        Err(keyring::Error::NoEntry) if create => {
            let mut key = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut key);
            entry
                .set_password(&B64.encode(key))
                .map_err(|e| e.to_string())?;
            Ok(Some(key))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn seal(key: &[u8; 32], plain: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut nonce = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce);
    let sealed = cipher
        .encrypt(Nonce::from_slice(&nonce), plain)
        .map_err(|_| "encryption failed".to_string())?;
    let mut out = nonce.to_vec();
    out.extend(sealed);
    Ok(out)
}

fn open_sealed(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() <= NONCE_LEN {
        return Err("file too short".into());
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    cipher
        .decrypt(Nonce::from_slice(&data[..NONCE_LEN]), &data[NONCE_LEN..])
        .map_err(|_| "the saved tickets could not be decrypted".to_string())
}

#[tauri::command]
fn load_state(app: AppHandle) -> Result<Option<String>, String> {
    let path = vault_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    let Some(mut key) = get_key(false)? else {
        // The key was destroyed, so this file can never be read. Remove it.
        let _ = fs::remove_file(&path);
        return Ok(None);
    };
    let plain = open_sealed(&key, &data);
    key.zeroize();
    String::from_utf8(plain?).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_state(app: AppHandle, json: String) -> Result<(), String> {
    let mut key = get_key(true)?.ok_or("no encryption key")?;
    let out = seal(&key, json.as_bytes());
    key.zeroize();
    let out = out?;
    // Write to a temp file then rename, so a crash mid-save can't corrupt the tickets.
    let path = vault_path(&app)?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, &out).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn wipe_state(app: AppHandle) -> Result<(), String> {
    let path = vault_path(&app)?;
    if path.exists() {
        // Overwrite before deleting, then destroy the key as well.
        if let Ok(meta) = fs::metadata(&path) {
            let _ = fs::write(&path, vec![0u8; meta.len() as usize]);
        }
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    match key_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Show the native "Save as" dialog and write the text where the person chooses.
/// Returns false if they cancelled.
#[tauri::command]
async fn save_text_file(app: AppHandle, suggested_name: String, contents: String) -> Result<bool, String> {
    let picked = app
        .dialog()
        .file()
        .set_file_name(&suggested_name)
        .blocking_save_file();
    match picked {
        None => Ok(false),
        Some(file_path) => {
            let path = file_path.into_path().map_err(|e| e.to_string())?;
            fs::write(path, contents).map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            wipe_state,
            save_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cloakroom");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let key = [7u8; 32];
        let sealed = seal(&key, b"{\"tokens\":{\"PERSON_1\":\"Jane Morrison\"}}").unwrap();
        assert!(!String::from_utf8_lossy(&sealed).contains("Jane"), "plaintext leaked into file");
        assert_eq!(open_sealed(&key, &sealed).unwrap(), b"{\"tokens\":{\"PERSON_1\":\"Jane Morrison\"}}");
    }

    #[test]
    fn wrong_key_cannot_read() {
        let sealed = seal(&[1u8; 32], b"secret").unwrap();
        assert!(open_sealed(&[2u8; 32], &sealed).is_err());
    }

    #[test]
    fn tampering_is_detected() {
        let key = [3u8; 32];
        let mut sealed = seal(&key, b"secret").unwrap();
        let last = sealed.len() - 1;
        sealed[last] ^= 1;
        assert!(open_sealed(&key, &sealed).is_err());
    }

    #[test]
    fn same_text_encrypts_differently_each_time() {
        let key = [4u8; 32];
        assert_ne!(seal(&key, b"x").unwrap(), seal(&key, b"x").unwrap());
    }
}
