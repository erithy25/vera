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
//   int  vault_protection_mode(void);         // 0 unknown, 1 biometry, 2 plain
//
// Generic secrets (API keys) — see the section at the end of this file:
//   int  vault_set_secret(const char *account, const char *value);
//   int  vault_get_secret(const char *account, char *out, int capacity);
//   int  vault_delete_secret(const char *account);

#import <Foundation/Foundation.h>
#import <Security/Security.h>

// Which protection actually took effect for the media key.
// 0 = unknown, 1 = biometry-gated (Secure Enclave), 2 = plain keychain item.
#define VAULT_MODE_UNKNOWN  0
#define VAULT_MODE_BIOMETRY 1
#define VAULT_MODE_PLAIN    2
static int g_vault_mode = VAULT_MODE_UNKNOWN;

// Reports the mode of the current session. Callers use this to tell the user
// the truth about how their key is protected.
int vault_protection_mode(void) { return g_vault_mode; }

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
    // kSecAccessControlUserPresence, NOT kSecAccessControlBiometryCurrentSet.
    //
    // BiometryCurrentSet invalidates the keychain item the moment the user adds
    // or removes a fingerprint. At that instant the media key is gone for good,
    // and with it every encrypted segment and thumbnail — silently, with no
    // warning, and with no way to recover. For a product whose entire value is
    // long-term memory, that was the most damaging behaviour in the codebase.
    //
    // UserPresence keeps the item across biometry changes and still requires an
    // explicit unlock: Touch ID, or the login password as fallback. That
    // fallback also covers a broken or missing Touch ID sensor, which
    // BiometryCurrentSet did not.
    //
    // kSecAttrAccessibleWhenUnlockedThisDeviceOnly stays. It is the deliberate
    // choice: the key never leaves this Mac and never enters a backup. Migrating
    // to a new machine therefore starts a fresh vault — documented, not silent.
    SecAccessControlRef access = SecAccessControlCreateWithFlags(
        kCFAllocatorDefault,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        kSecAccessControlUserPresence,
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

    // Records which mode actually took effect. Previously the fallback was
    // silent: a user promised "Touch ID / Secure Enclave" could end up with a
    // plain keychain item and never learn about it. vault_protection_mode()
    // now makes that answerable. (audit finding F-5)
    OSStatus st = vault_store_biometry(key);
    if (st == errSecSuccess) {
        g_vault_mode = VAULT_MODE_BIOMETRY;
    } else {
        st = vault_store_plain(key);
        g_vault_mode = (st == errSecSuccess) ? VAULT_MODE_PLAIN : VAULT_MODE_UNKNOWN;
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

// MARK: - Generic secret storage (audit finding F-1)
//
// Cloud API keys used to be written to the SQLite settings table in plaintext,
// while this file already implemented a correct Keychain vault for the media
// key. The mechanism was there; it just was not used for the more sensitive
// secret. These three functions close that gap.
//
// Deliberately a plain keychain item, not a biometry-gated one: the API key is
// read on every cloud request in the background. A Touch ID prompt per request
// would make the feature unusable, and users would go back to pasting keys into
// places that are worse than the Keychain.

static NSString *const kSecretService = @"app.vera.desktop.secrets";

static NSMutableDictionary *secret_query(NSString *account) {
    return [@{
        (id)kSecClass: (id)kSecClassGenericPassword,
        (id)kSecAttrService: kSecretService,
        (id)kSecAttrAccount: account,
        (id)kSecAttrAccessible: (id)kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    } mutableCopy];
}

// Stores or replaces a secret. 0 = ok, <0 = error.
int vault_set_secret(const char *account, const char *value) {
    if (account == NULL || value == NULL) return -1;
    NSString *acc = [NSString stringWithUTF8String:account];
    NSData *data = [[NSString stringWithUTF8String:value] dataUsingEncoding:NSUTF8StringEncoding];
    if (acc == nil || data == nil) return -1;

    SecItemDelete((__bridge CFDictionaryRef)secret_query(acc));
    NSMutableDictionary *attrs = secret_query(acc);
    attrs[(id)kSecValueData] = data;
    OSStatus st = SecItemAdd((__bridge CFDictionaryRef)attrs, NULL);
    return st == errSecSuccess ? 0 : -2;
}

// Reads a secret into `out` (caller-provided buffer of `capacity` bytes).
// Returns the byte length written, or <0 on error. The value is NUL-terminated
// when it fits.
int vault_get_secret(const char *account, char *out, int capacity) {
    if (account == NULL || out == NULL || capacity <= 0) return -1;
    NSString *acc = [NSString stringWithUTF8String:account];
    if (acc == nil) return -1;

    NSMutableDictionary *q = secret_query(acc);
    q[(id)kSecReturnData] = @YES;
    q[(id)kSecMatchLimit] = (id)kSecMatchLimitOne;

    CFTypeRef result = NULL;
    OSStatus st = SecItemCopyMatching((__bridge CFDictionaryRef)q, &result);
    if (st != errSecSuccess || result == NULL) return -3;

    NSData *data = (__bridge_transfer NSData *)result;
    if ((int)data.length >= capacity) return -4;  // caller must retry larger
    memcpy(out, data.bytes, data.length);
    out[data.length] = 0;
    return (int)data.length;
}

int vault_delete_secret(const char *account) {
    if (account == NULL) return -1;
    NSString *acc = [NSString stringWithUTF8String:account];
    if (acc == nil) return -1;
    OSStatus st = SecItemDelete((__bridge CFDictionaryRef)secret_query(acc));
    return (st == errSecSuccess || st == errSecItemNotFound) ? 0 : -2;
}
