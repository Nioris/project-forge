/**
 * @file RuStoreReviewPlugin.java
 * @description Capacitor bridge for the RuStore Review SDK.
 *
 * The SDK shows a native "rate this app" dialog. We can't tell whether the
 * user actually rated — the OS hides that for privacy. The plugin just
 * reports success if the dialog was launched, failure if not.
 *
 * Usage from JS:
 *   const { launched } = await RuStoreReview.requestReview();
 *
 * Docs: https://www.rustore.ru/help/en/sdk/reviews-ratings/kotlin-java/9-1-0
 *
 * 2026-04-18: migrated to BOM-managed dep (`ru.rustore.sdk:review` via
 * `ru.rustore.sdk:bom:2025.11.01`). Public API unchanged.
 * @verified-against RuStore Review SDK 8.0.0
 * @verified-date 2026-04-25
 */
package com.rodrik.dailyinsight;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import ru.rustore.sdk.review.RuStoreReviewManager;
import ru.rustore.sdk.review.RuStoreReviewManagerFactory;
import ru.rustore.sdk.review.model.ReviewInfo;

@CapacitorPlugin(name = "RuStoreReview")
public class RuStoreReviewPlugin extends Plugin {

    /** Lazy-initialized review manager. Created on first use. */
    private RuStoreReviewManager manager;

    /** Resolve the manager lazily so a broken SDK doesn't break app startup. */
    private RuStoreReviewManager getManager() {
        if (manager == null) {
            manager = RuStoreReviewManagerFactory.INSTANCE.create(getContext());
        }
        return manager;
    }

    /**
     * Two-step SDK flow:
     *   1. requestReviewFlow() — prepares a ReviewInfo token
     *   2. launchReviewFlow(info) — opens the rating dialog
     *
     * We collapse both steps into one JS call. If step 1 fails (SDK not
     * installed / RuStore app missing) we reject; client should fall back
     * to an external "open RuStore page" link.
     */
    @PluginMethod
    public void requestReview(PluginCall call) {
        try {
            getManager()
                .requestReviewFlow()
                .addOnSuccessListener(reviewInfo -> launch(reviewInfo, call))
                .addOnFailureListener(err -> {
                    call.reject("request_failed: " + err.getMessage());
                });
        } catch (Throwable t) {
            // SDK init can throw on devices without RuStore app installed
            call.reject("sdk_unavailable: " + t.getMessage());
        }
    }

    private void launch(ReviewInfo info, PluginCall call) {
        try {
            getManager()
                .launchReviewFlow(info)
                .addOnSuccessListener(unit -> {
                    JSObject ret = new JSObject();
                    ret.put("launched", true);
                    call.resolve(ret);
                })
                .addOnFailureListener(err -> {
                    call.reject("launch_failed: " + err.getMessage());
                });
        } catch (Throwable t) {
            call.reject("launch_threw: " + t.getMessage());
        }
    }
}
