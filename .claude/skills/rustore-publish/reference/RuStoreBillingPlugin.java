/**
 * @file RuStoreBillingPlugin.java
 * @description Capacitor bridge for the RuStore Pay SDK.
 *
 *   Built against BOM 2026.03.01 (Pay SDK 10.2.0). The BOM's package layout
 *   differs from 2025.11.01 — all model types are now flat under
 *   `ru.rustore.sdk.pay.model.*` (no more .product / .purchase / .domain
 *   sub-packages). Migration notes live in `pay-sdk-kit/docs/02-android-integration.md § 2.5`.
 *
 *   JS contract (unchanged — `window.Capacitor.Plugins.RuStoreBilling`):
 *     getProducts({productIds})       → {products:[{productId,title,description,priceLabel,price,currency}]}
 *     purchase({productId})           → {success, invoiceId, purchaseId, productId}
 *     getPurchases()                  → {purchases:[{purchaseId,invoiceId,productId,status}]}
 *     confirmPurchase({purchaseId})   → {confirmed:true}
 *     checkPurchasesAvailability()    → {available, reason?}
 *
 *   Every call is gated by a runtime check that the console app id is not a
 *   build-time placeholder — debug builds without real creds get
 *   `{error:'not_configured'}` instead of a native crash.
 * @verified-against RuStore Pay SDK 10.2 / BOM 2026.04.01
 * @verified-date 2026-04-25
 */
package com.rodrik.dailyinsight;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

import ru.rustore.sdk.pay.RuStorePayClient;
import ru.rustore.sdk.pay.model.PreferredPurchaseType;
import ru.rustore.sdk.pay.model.Product;
import ru.rustore.sdk.pay.model.ProductId;
import ru.rustore.sdk.pay.model.ProductPurchase;
import ru.rustore.sdk.pay.model.ProductPurchaseParams;
import ru.rustore.sdk.pay.model.Purchase;
import ru.rustore.sdk.pay.model.PurchaseId;
import ru.rustore.sdk.pay.model.RuStorePaymentException;
import ru.rustore.sdk.pay.model.SdkTheme;

@CapacitorPlugin(name = "RuStoreBilling")
public class RuStoreBillingPlugin extends Plugin {

    private static final String PLACEHOLDER_APP_ID = "YOUR_RUSTORE_CONSOLE_APP_ID";

    /**
     * Pay SDK needs every incoming intent fed to its intentInteractor so it can
     * pick up the deep-link callback after the bank app returns to us.
     * Capacitor delivers intents here via plugin lifecycle hooks — cleaner than
     * overriding MainActivity.onNewIntent.
     */
    @Override
    public void load() {
        super.load();
        proceedIntentIfConfigured(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        proceedIntentIfConfigured(intent);
    }

    private void proceedIntentIfConfigured(Intent intent) {
        if (intent == null || getConfiguredAppId() == null) return;
        try {
            RuStorePayClient.Companion.getInstance().getIntentInteractor()
                .proceedIntent(intent, SdkTheme.LIGHT);
        } catch (Throwable ignored) {
            // SDK may not be initialized yet on very first intent — safe to ignore;
            // subsequent intents (bank return) will still be picked up.
        }
    }

    /**
     * Pull the console app id from the manifest meta-data the Pay SDK reads.
     * Returns null when the value is missing or still the build-time placeholder.
     */
    private String getConfiguredAppId() {
        try {
            Context ctx = getContext();
            ApplicationInfo ai = ctx.getPackageManager().getApplicationInfo(
                ctx.getPackageName(), PackageManager.GET_META_DATA);
            Bundle meta = ai.metaData;
            if (meta == null) return null;
            Object v = meta.get("console_app_id_value");
            if (v == null) return null;
            String id = String.valueOf(v);
            if (id.isEmpty() || id.equals(PLACEHOLDER_APP_ID)) return null;
            return id;
        } catch (Throwable t) {
            return null;
        }
    }

    @PluginMethod
    public void checkPurchasesAvailability(PluginCall call) {
        JSObject ret = new JSObject();
        if (getConfiguredAppId() == null) {
            ret.put("available", false);
            ret.put("reason", "not_configured");
        } else {
            ret.put("available", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        if (getConfiguredAppId() == null) { call.reject("not_configured"); return; }
        JSArray ids = call.getArray("productIds");
        if (ids == null) { call.reject("productIds required"); return; }

        List<ProductId> productIds = new ArrayList<>();
        try {
            for (int i = 0; i < ids.length(); i++) {
                productIds.add(new ProductId(ids.getString(i)));
            }
        } catch (Exception e) {
            call.reject("bad_productIds: " + e.getMessage());
            return;
        }

        try {
            RuStorePayClient.Companion.getInstance().getProductInteractor()
                .getProducts(productIds)
                .addOnSuccessListener(products -> {
                    JSArray arr = new JSArray();
                    for (Product p : products) {
                        JSObject item = new JSObject();
                        try { item.put("productId", p.getProductId().getValue()); } catch (Throwable ignored) {}
                        // All scalar fields on Product are wrapper types in BOM 2026.03.01 —
                        // call .getValue() to unwrap before passing to JS.
                        try { if (p.getTitle() != null) item.put("title", p.getTitle().getValue()); } catch (Throwable ignored) {}
                        try { if (p.getDescription() != null) item.put("description", p.getDescription().getValue()); } catch (Throwable ignored) {}
                        try { if (p.getAmountLabel() != null) item.put("priceLabel", p.getAmountLabel().getValue()); } catch (Throwable ignored) {}
                        try { if (p.getPrice() != null) item.put("price", p.getPrice().getValue()); } catch (Throwable ignored) {}
                        try { if (p.getCurrency() != null) item.put("currency", p.getCurrency().getValue()); } catch (Throwable ignored) {}
                        arr.put(item);
                    }
                    JSObject ret = new JSObject();
                    ret.put("products", arr);
                    call.resolve(ret);
                })
                .addOnFailureListener(err -> call.reject("get_products_failed: " + err.getMessage()));
        } catch (Throwable t) {
            call.reject("sdk_threw: " + t.getMessage());
        }
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        if (getConfiguredAppId() == null) { call.reject("not_configured"); return; }
        String productId = call.getString("productId");
        if (productId == null) { call.reject("productId required"); return; }

        try {
            // BOM 2026.03.01 ProductPurchaseParams: 6-arg constructor
            //   (ProductId, Quantity, OrderId, DeveloperPayload, AppUserId, AppUserEmail).
            // All optional fields are null — server-side order binding would slot in here.
            ProductPurchaseParams params = new ProductPurchaseParams(
                new ProductId(productId),
                null, null, null, null, null
            );
            // 4th arg (PurchaseEventListener) required in 2026.03.01 — null = no progress callbacks.
            RuStorePayClient.Companion.getInstance().getPurchaseInteractor()
                .purchase(params, PreferredPurchaseType.ONE_STEP, SdkTheme.LIGHT, null)
                .addOnSuccessListener(result -> {
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    // invoiceId — canonical for server-side Public API validation.
                    // purchaseId — legacy numeric id kept for compatibility.
                    // In BOM 2026.03.01 invoiceId is also a wrapper — unwrap defensively.
                    String invoice = null;
                    try {
                        Object iv = result.getInvoiceId();
                        if (iv != null) {
                            try { invoice = (String) iv.getClass().getMethod("getValue").invoke(iv); }
                            catch (Throwable ignored) { invoice = String.valueOf(iv); }
                        }
                    } catch (Throwable ignored) {}
                    if (invoice != null) ret.put("invoiceId", invoice);
                    try { ret.put("purchaseId", result.getPurchaseId().getValue()); } catch (Throwable ignored) {}
                    call.resolve(ret);
                })
                .addOnFailureListener(throwable -> {
                    // Cancelled is a distinct error path — signal it cleanly to JS so
                    // the UI can stay silent rather than showing "payment failed".
                    if (throwable instanceof RuStorePaymentException.ProductPurchaseCancelled) {
                        JSObject ret = new JSObject();
                        ret.put("success", false);
                        ret.put("status", "CANCELLED");
                        call.resolve(ret);
                        return;
                    }
                    String msg = throwable.getMessage() != null
                        ? throwable.getMessage()
                        : throwable.getClass().getSimpleName();
                    call.reject("purchase_failed: " + msg);
                });
        } catch (Throwable t) {
            call.reject("sdk_threw: " + t.getMessage());
        }
    }

    @PluginMethod
    public void getPurchases(PluginCall call) {
        if (getConfiguredAppId() == null) { call.reject("not_configured"); return; }
        try {
            // (ProductType, PurchaseStatus) — null/null = every purchase type/status.
            RuStorePayClient.Companion.getInstance().getPurchaseInteractor()
                .getPurchases(null, null)
                .addOnSuccessListener(purchases -> {
                    JSArray arr = new JSArray();
                    for (Purchase p : purchases) {
                        // Purchase is the abstract parent; ProductPurchase is the consumables side.
                        // Subscriptions are a different subtype we don't ship, so skip.
                        if (!(p instanceof ProductPurchase)) continue;
                        ProductPurchase pp = (ProductPurchase) p;
                        JSObject item = new JSObject();
                        try { item.put("purchaseId", pp.getPurchaseId().getValue()); } catch (Throwable ignored) {}
                        try { item.put("productId", pp.getProductId().getValue()); } catch (Throwable ignored) {}
                        // invoiceId on ProductPurchase is either String or wrapper depending on
                        // BOM version — unwrap defensively via reflection to avoid breakage
                        // when we bump BOM in future.
                        try {
                            Object iv = pp.getInvoiceId();
                            if (iv != null) {
                                String val;
                                try { val = (String) iv.getClass().getMethod("getValue").invoke(iv); }
                                catch (Throwable ignored) { val = String.valueOf(iv); }
                                item.put("invoiceId", val);
                            }
                        } catch (Throwable ignored) {}
                        try { item.put("status", pp.getStatus().name()); } catch (Throwable ignored) {}
                        arr.put(item);
                    }
                    JSObject ret = new JSObject();
                    ret.put("purchases", arr);
                    call.resolve(ret);
                })
                .addOnFailureListener(err -> call.reject("get_purchases_failed: " + err.getMessage()));
        } catch (Throwable t) {
            call.reject("sdk_threw: " + t.getMessage());
        }
    }

    /**
     * Two-step purchase consume. We use ONE_STEP purchases by default (Pay SDK
     * auto-consumes on success), but this is kept for SKUs that may opt into
     * TWO_STEP in the future (or for recovery sweeps that find a PAID-but-not-
     * confirmed purchase sitting in SDK state).
     */
    @PluginMethod
    public void confirmPurchase(PluginCall call) {
        if (getConfiguredAppId() == null) { call.reject("not_configured"); return; }
        String purchaseId = call.getString("purchaseId");
        if (purchaseId == null) { call.reject("purchaseId required"); return; }

        try {
            RuStorePayClient.Companion.getInstance().getPurchaseInteractor()
                .confirmTwoStepPurchase(new PurchaseId(purchaseId), null)
                .addOnSuccessListener(unit -> {
                    JSObject ret = new JSObject();
                    ret.put("confirmed", true);
                    call.resolve(ret);
                })
                .addOnFailureListener(err -> call.reject("confirm_failed: " + err.getMessage()));
        } catch (Throwable t) {
            call.reject("sdk_threw: " + t.getMessage());
        }
    }
}
