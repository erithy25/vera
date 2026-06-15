// Vera media-key vault.
//
// Manages a 32-byte AES-256 master key for encrypting screen-recording media
// (HEVC segments + thumbnails). The key lives ONLY in the macOS Keychain and is
// handed to the Rust process (in memory) only for the current session.
//
// Robustness: it PREFERS a Touch-ID-gated item in the modern data-protection
// keychain (Secure Enclave). If that cannot be created on this Mac (biometry
// unavailable, keychain/entitlement quirks, etc.) it falls back to a plain item
// in the classic keychain — still encrypted at rest by macOS, just without the
// biometric gate — so recording can always be enabled. Never written to disk in
// plaintext and never embedded in the bundle.
//
// C ABI consumed by Rust:
//   int  vault_has_key(void);                 // 1 if a key exists, 0 otherwise (no prompt)
//   int  vault_get_or_create(uint8_t *out32); // fills 32 bytes; 0 = ok, <0 = error
//   int  vault_delete_key(void);              // remove the key (full reset)

#import <Foundation/Foundation.h>
#import <Security/Security.h>

static NSString *const kVaultService = @"app.vera.desktop.vault";
static NSString *const kVaultAccount = @"media-master-key";
static const size_t kVaultKeyLen = 32;

// Base identity. dataProtection=YES routes to the modern keychain (required for
// biometry access control); NO uses the classic file keychain (the most
// reliable fallback, needs no special entitlement).
static NSMutableDictionary *vault_query(BOOL dataProtection) {
    NSMutableDictionary *q = [@{
        (id)kSecClass: (id)kSecClassGenericPassword,
        (id)kSecAttrService: kVaultService,
        (id)kSecAttrAccount: kVaultAccount,
    } mutableCopy];
    if (dataProtection) {
        q[(id)kSecUseDataProtectionKeychain] = @YES;
    }
    return q;
}

int vault_has_key(void) {
    // Check both keychains; either may hold the key.
    BOOL dps[2] = {YES, NO};
    for (int i = 0; i < 2; i++) {
        NSMutableDictionary *q = vault_query(dps[i]);
        q[(id)kSecUseAuthenticationUI] = (id)kSecUseAuthenticationUISkip;
        OSStatus st = SecItemCopyMatching((__bridge CFDictionaryRef)q, NULL);
        if (st == errSecSuccess || st == errSecInteractionNotAllowed) {
            return 1;
        }
    }
    return 0;
}

static int vault_fetch(uint8_t *out) {
    BOOL dps[2] = {YES, NO};
    for (int i = 0; i < 2; i++) {
        NSMutableDictionary *q = vault_query(dps[i]);
        q[(id)kSecReturnData] = @YES;
        q[(id)kSecUseOperationPrompt] = @"Unlock Vera's screen recordings";
        CFTypeRef result = NULL;
        OSStatus st = SecItemCopyMatching((__bridge CFDictionaryRef)q, &result);
        if (st == errSecSuccess && result != NULL) {
            NSData *data = (__bridge_transfer NSData *)result;
            if (data.length == kVaultKeyLen) {
                memcpy(out, data.bytes, kVaultKeyLen);
                return 0;
            }
            return -2;
        }
        if (result) CFRelease(result);
    }
    return -1;
}

// Preferred: Touch-ID-gated item in the data-protection keychain.
static OSStatus vault_store_biometry(uint8_t *key) {
    CFErrorRef acErr = NULL;
    SecAccessControlRef access = SecAccessControlCreateWithFlags(
        kCFAllocatorDefault,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        kSecAccessControlBiometryCurrentSet,
        &acErr);
    if (acErr) CFRelease(acErr);
    if (access == NULL) {
        return errSecParam;
    }
    NSMutableDictionary *attrs = vault_query(YES);
    attrs[(id)kSecValueData] = [NSData dataWithBytes:key length:kVaultKeyLen];
    attrs[(id)kSecAttrAccessControl] = (__bridge id)access;
    SecItemDelete((__bridge CFDictionaryRef)vault_query(YES));
    OSStatus st = SecItemAdd((__bridge CFDictionaryRef)attrs, NULL);
    CFRelease(access);
    return st;
}

// Fallback: plain generic password in the classic keychain (always works for a
// signed app; encrypted at rest by the login keychain, no biometric gate).
static OSStatus vault_store_plain(uint8_t *key) {
    NSMutableDictionary *attrs = vault_query(NO);
    attrs[(id)kSecValueData] = [NSData dataWithBytes:key length:kVaultKeyLen];
    SecItemDelete((__bridge CFDictionaryRef)vault_query(NO));
    return SecItemAdd((__bridge CFDictionaryRef)attrs, NULL);
}

static int vault_create(uint8_t *out) {
    uint8_t key[kVaultKeyLen];
    if (SecRandomCopyBytes(kSecRandomDefault, kVaultKeyLen, key) != errSecSuccess) {
        return -10;
    }

    OSStatus st = vault_store_biometry(key);
    if (st != errSecSuccess) {
        st = vault_store_plain(key);
    }

    if (st != errSecSuccess) {
        memset(key, 0, kVaultKeyLen);
        return -12;
    }
    memcpy(out, key, kVaultKeyLen);
    memset(key, 0, kVaultKeyLen);
    return 0;
}

int vault_get_or_create(uint8_t *out) {
    if (vault_has_key()) {
        return vault_fetch(out);
    }
    return vault_create(out);
}

int vault_delete_key(void) {
    OSStatus s1 = SecItemDelete((__bridge CFDictionaryRef)vault_query(YES));
    OSStatus s2 = SecItemDelete((__bridge CFDictionaryRef)vault_query(NO));
    BOOL ok = (s1 == errSecSuccess || s1 == errSecItemNotFound) &&
              (s2 == errSecSuccess || s2 == errSecItemNotFound);
    return ok ? 0 : -1;
}
