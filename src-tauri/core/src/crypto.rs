//! AES-256-GCM encryption for media files.
//!
//! Extracted from `lib.rs`, algorithm unchanged — the audit explicitly rated
//! the crypto primitives correct: a fresh 96-bit nonce per encryption from
//! `OsRng`, no nonce reuse, length check before slicing.
//!
//! What is new is that it is now **tested**. Previously there was not a single
//! test covering the mechanism that protects all user data.

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};

/// File format: `b"VEG1" || nonce(12) || ciphertext+tag(16)`.
pub const VAULT_MAGIC: &[u8; 4] = b"VEG1";

/// Smallest possible valid file: magic + nonce + GCM tag.
pub const MIN_ENCRYPTED_LEN: usize = 4 + 12 + 16;

#[derive(Debug, PartialEq, Eq)]
pub enum CryptoError {
    /// File does not carry the Vera magic, or is too short.
    NotEncrypted,
    /// Wrong key or corrupted data.
    DecryptFailed,
    EncryptFailed,
}

impl std::fmt::Display for CryptoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CryptoError::NotEncrypted => write!(f, "not an encrypted Vera file"),
            CryptoError::DecryptFailed => {
                write!(f, "decryption failed (wrong key or corrupted)")
            }
            CryptoError::EncryptFailed => write!(f, "encryption failed"),
        }
    }
}

/// Does the buffer carry the Vera magic?
pub fn is_encrypted(data: &[u8]) -> bool {
    data.len() >= 4 && &data[0..4] == VAULT_MAGIC
}

pub fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ct = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| CryptoError::EncryptFailed)?;
    let mut out = Vec::with_capacity(MIN_ENCRYPTED_LEN + plaintext.len());
    out.extend_from_slice(VAULT_MAGIC);
    out.extend_from_slice(nonce.as_slice());
    out.extend_from_slice(&ct);
    Ok(out)
}

pub fn decrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if data.len() < MIN_ENCRYPTED_LEN || !is_encrypted(data) {
        return Err(CryptoError::NotEncrypted);
    }
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(&data[4..16]);
    cipher
        .decrypt(nonce, &data[16..])
        .map_err(|_| CryptoError::DecryptFailed)
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: [u8; 32] = [7u8; 32];
    const OTHER_KEY: [u8; 32] = [9u8; 32];

    #[test]
    fn roundtrip_preserves_content() {
        for payload in [
            b"".to_vec(),
            b"short".to_vec(),
            vec![0u8; 1024],
            (0..=255u8).cycle().take(100_000).collect(),
        ] {
            let ct = encrypt(&KEY, &payload).unwrap();
            assert_eq!(decrypt(&KEY, &ct).unwrap(), payload);
        }
    }

    #[test]
    fn ciphertext_carries_magic_and_is_longer_than_plaintext() {
        let ct = encrypt(&KEY, b"secret").unwrap();
        assert!(is_encrypted(&ct));
        assert!(ct.len() >= MIN_ENCRYPTED_LEN);
        assert!(ct.len() > b"secret".len());
    }

    #[test]
    fn plaintext_never_appears_in_ciphertext() {
        let secret = b"sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd";
        let ct = encrypt(&KEY, secret).unwrap();
        assert!(
            !ct.windows(secret.len()).any(|w| w == secret),
            "plaintext found inside ciphertext"
        );
    }

    #[test]
    fn nonce_differs_between_encryptions() {
        // Without a fresh nonce, AES-GCM would be catastrophically insecure.
        let a = encrypt(&KEY, b"same content").unwrap();
        let b = encrypt(&KEY, b"same content").unwrap();
        assert_ne!(&a[4..16], &b[4..16], "nonce reused");
        assert_ne!(a, b, "identical ciphertext for identical plaintext");
    }

    #[test]
    fn many_encryptions_never_repeat_a_nonce() {
        use std::collections::HashSet;
        let mut seen = HashSet::new();
        for _ in 0..2000 {
            let ct = encrypt(&KEY, b"x").unwrap();
            assert!(seen.insert(ct[4..16].to_vec()), "nonce collision");
        }
    }

    #[test]
    fn wrong_key_fails_cleanly() {
        let ct = encrypt(&KEY, b"secret").unwrap();
        assert_eq!(decrypt(&OTHER_KEY, &ct), Err(CryptoError::DecryptFailed));
    }

    #[test]
    fn tampering_is_detected() {
        let ct = encrypt(&KEY, b"a longer message to tamper with").unwrap();
        // Every single flipped bit must be detected — that is the point of GCM.
        for i in 0..ct.len() {
            let mut bad = ct.clone();
            bad[i] ^= 0x01;
            if i < 4 {
                // Magic destroyed -> reported as "not encrypted"
                assert_eq!(decrypt(&KEY, &bad), Err(CryptoError::NotEncrypted));
            } else {
                assert_eq!(
                    decrypt(&KEY, &bad),
                    Err(CryptoError::DecryptFailed),
                    "tampering at byte {i} not detected"
                );
            }
        }
    }

    #[test]
    fn truncated_input_does_not_panic() {
        let ct = encrypt(&KEY, b"secret").unwrap();
        for len in 0..ct.len() {
            let _ = decrypt(&KEY, &ct[..len]);
        }
    }

    #[test]
    fn garbage_input_does_not_panic() {
        for data in [
            vec![],
            vec![0u8],
            b"VEG1".to_vec(),
            b"not remotely a Vera file".to_vec(),
            vec![0xFF; MIN_ENCRYPTED_LEN],
        ] {
            let _ = decrypt(&KEY, &data);
        }
    }

    #[test]
    fn is_encrypted_is_conservative() {
        assert!(!is_encrypted(b""));
        assert!(!is_encrypted(b"VEG"));
        assert!(!is_encrypted(b"VEG2"));
        assert!(is_encrypted(b"VEG1"));
    }
}
