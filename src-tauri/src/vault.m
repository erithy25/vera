// Vera media-key vault.
//
// Manages a 32-byte AES-256 master key for encrypting screen-recording media
// (HEVC segments + thumbnails). The key lives ONLY in the macOS Keychain,
// protected by a biometric (Touch ID) access control and hardware-backed by the
// Secure Enclave on Apple Silicon. It is never written to disk in plaintext and
// never embedded in the bundle. It is handed to the Rust process (in memory)
// only after a successful Touch ID unlock, and only for the current session.
//
// C ABI consumed by Rust:
//   int  vault_has_key(void);                 // 1 if a key exists, 0 otherwise (no prompt)
//   int  vault_get_or_create(uint8_t *out32); // Touch ID; fills 32 bytes; 0 = ok, <0 = error
//   int  vault_delete_key(void);              // remove the key (full reset)

#import <Foundation/Foundation.h>
#import <Security/Security.h>

static NSString *const kVaultService = @"app.vera.desktop.vault";
static NSString *const kVaultAccount = @"media-master-key";
static const size_t kVaultKeyLen = 32;

// Does a key exist? Uses kSecUseAuthenticationUISkip so it never triggers Touch ID.
int vault_has_key(void) {
    NSDictionary *query = @{
        (id)kSecClass: (id)kSecClassGenericPassword,
        (id)kSecAttrService: kVaultService,
        (id)kSecAttrAccount: kVaultAccount,
        (id)kSecUseAuthenticationUI: (id)kSecUseAuthenticationUISkip,
    };
    OSStatus st = SecItemCopyMatching((__bridge CFDictionaryRef)query, NULL);
    // errSecInteractionNotAllowed means the item exists but needs biometric auth.
    return (st == errSecSuccess || st == errSecInteractionNotAllowed) ? 1 : 0;
}

// Fetch the key, triggering the system Touch ID prompt. 0 on success.
static int vault_fetch(uint8_t *out) {
    NSDictionary *query = @{
        (id)kSecClass: (id)kSecClassGenericPassword,
        (id)kSecAttrService: kVaultService,
        (id)kSecAttrAccount: kVaultAccount,
        (id)kSecReturnData: @YES,
        (id)kSecUseOperationPrompt: @"Unlock Vera's screen recordings",
    };
    CFTypeRef result = NULL;
    OSStatus st = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    if (st != errSecSuccess || result == NULL) {
        return -1;
    }
    NSData *data = (__bridge_transfer NSData *)result;
    if (data.length != kVaultKeyLen) {
        return -2;
    }
    memcpy(out, data.bytes, kVaultKeyLen);
    return 0;
}

// Generate a fresh random key and store it with a biometry access control.
static int vault_create(uint8_t *out) {
    uint8_t key[kVaultKeyLen];
    if (SecRandomCopyBytes(kSecRandomDefault, kVaultKeyLen, key) != errSecSuccess) {
        return -10;
    }

    CFErrorRef acErr = NULL;
    SecAccessControlRef access = SecAccessControlCreateWithFlags(
        kCFAllocatorDefault,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly, // never syncs to iCloud
        kSecAccessControlBiometryCurrentSet,          // Touch ID; invalidated if biometrics change
        &acErr);
    if (access == NULL) {
        if (acErr) CFRelease(acErr);
        memset(key, 0, kVaultKeyLen);
        return -11;
    }

    NSData *keyData = [NSData dataWithBytes:key length:kVaultKeyLen];
    NSDictionary *attrs = @{
        (id)kSecClass: (id)kSecClassGenericPassword,
        (id)kSecAttrService: kVaultService,
        (id)kSecAttrAccount: kVaultAccount,
        (id)kSecValueData: keyData,
        (id)kSecAttrAccessControl: (__bridge id)access,
    };

    // Replace any prior item.
    NSDictionary *del = @{
        (id)kSecClass: (id)kSecClassGenericPassword,
        (id)kSecAttrService: kVaultService,
        (id)kSecAttrAccount: kVaultAccount,
    };
    SecItemDelete((__bridge CFDictionaryRef)del);

    OSStatus st = SecItemAdd((__bridge CFDictionaryRef)attrs, NULL);
    CFRelease(access);
    if (st != errSecSuccess) {
        memset(key, 0, kVaultKeyLen);
        return -12;
    }
    memcpy(out, key, kVaultKeyLen);
    memset(key, 0, kVaultKeyLen);
    return 0;
}

// Return the existing key (Touch ID) or create one on first use.
int vault_get_or_create(uint8_t *out) {
    if (vault_has_key()) {
        return vault_fetch(out);
    }
    return vault_create(out);
}

// Remove the key entirely (used by a full reset). 0 on success or not-found.
int vault_delete_key(void) {
    NSDictionary *del = @{
        (id)kSecClass: (id)kSecClassGenericPassword,
        (id)kSecAttrService: kVaultService,
        (id)kSecAttrAccount: kVaultAccount,
    };
    OSStatus st = SecItemDelete((__bridge CFDictionaryRef)del);
    return (st == errSecSuccess || st == errSecItemNotFound) ? 0 : -1;
}
