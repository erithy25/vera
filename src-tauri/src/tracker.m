#import <Cocoa/Cocoa.h>
#import <Foundation/Foundation.h>
#import <ApplicationServices/ApplicationServices.h>

typedef struct {
    char* app_name;
    char* bundle_id;
    char* window_title;
} AppActivity;

void free_app_activity(AppActivity activity) {
    if (activity.app_name) free(activity.app_name);
    if (activity.bundle_id) free(activity.bundle_id);
    if (activity.window_title) free(activity.window_title);
}

AppActivity get_active_app_activity() {
    AppActivity activity = {NULL, NULL, NULL};

    @autoreleasepool {
        NSRunningApplication* frontmostApp = [[NSWorkspace sharedWorkspace] frontmostApplication];
        if (frontmostApp) {
            NSString* appName = [frontmostApp localizedName];
            NSString* bundleId = [frontmostApp bundleIdentifier];

            // Log if localized name is literally "app" to help debug
            if (appName && [[appName lowercaseString] isEqualToString:@"app"]) {
                NSLog(@"[Vera Tracker Warning] Process with localizedName 'app' has bundle ID: %@", bundleId ? bundleId : @"Unknown");
            }

            BOOL nameIsGenericApp = !appName || [appName length] == 0 || [[appName lowercaseString] isEqualToString:@"app"];

            if (nameIsGenericApp) {
                // Try bundle display name/bundle name
                NSDictionary* info = [[NSBundle bundleWithIdentifier:bundleId] infoDictionary];
                NSString* dispName = [info objectForKey:@"CFBundleDisplayName"];
                if (!dispName || [dispName length] == 0) {
                    dispName = [info objectForKey:@"CFBundleName"];
                }

                if (dispName && [dispName length] > 0 && ![[dispName lowercaseString] isEqualToString:@"app"]) {
                    appName = dispName;
                } else {
                    // Fall back to bundle identifier
                    if (bundleId && [bundleId length] > 0 && ![[bundleId lowercaseString] isEqualToString:@"app"]) {
                        appName = bundleId;
                    } else {
                        // Fall back to executable last path component
                        NSString* execName = [[frontmostApp executableURL] lastPathComponent];
                        if (execName && [execName length] > 0 && ![[execName lowercaseString] isEqualToString:@"app"]) {
                            appName = execName;
                        } else {
                            appName = @"Unknown";
                        }
                    }
                }
            }

            if (appName) {
                activity.app_name = strdup([appName UTF8String]);
            }
            if (bundleId) {
                activity.bundle_id = strdup([bundleId UTF8String]);
            }

            pid_t pid = [frontmostApp processIdentifier];
            AXUIElementRef appElem = AXUIElementCreateApplication(pid);
            if (appElem) {
                AXUIElementRef windowElem = NULL;
                AXError err = AXUIElementCopyAttributeValue(appElem, kAXFocusedWindowAttribute, (CFTypeRef*)&windowElem);
                if (err == kAXErrorSuccess && windowElem) {
                    CFStringRef titleRef = NULL;
                    err = AXUIElementCopyAttributeValue(windowElem, kAXTitleAttribute, (CFTypeRef*)&titleRef);
                    if (err == kAXErrorSuccess && titleRef) {
                        NSString* title = (__bridge NSString*)titleRef;
                        activity.window_title = strdup([title UTF8String]);
                        CFRelease(titleRef);
                    }
                    CFRelease(windowElem);
                }
                CFRelease(appElem);
            }
        }
    }

    return activity;
}

bool is_screen_locked(void) {
    CFDictionaryRef sessionInfo = CGSessionCopyCurrentDictionary();
    if (!sessionInfo) {
        // No session info available — treat as locked so nothing gets tracked
        return true;
    }
    bool locked = false;
    CFBooleanRef lockedValue = (CFBooleanRef)CFDictionaryGetValue(sessionInfo, CFSTR("CGSSessionScreenIsLocked"));
    if (lockedValue) {
        locked = CFBooleanGetValue(lockedValue);
    }
    CFRelease(sessionInfo);
    return locked;
}

bool check_accessibility_permission() {
    #pragma clang diagnostic push
    #pragma clang diagnostic ignored "-Wdeprecated-declarations"
    return AXIsProcessTrusted();
    #pragma clang diagnostic pop
}

bool request_accessibility_permission() {
    #pragma clang diagnostic push
    #pragma clang diagnostic ignored "-Wdeprecated-declarations"
    NSDictionary *options = @{(__bridge id)kAXTrustedCheckOptionPrompt: @YES};
    return AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
    #pragma clang diagnostic pop
}
