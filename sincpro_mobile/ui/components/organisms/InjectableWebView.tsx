import { IInjectedScript } from "@sincpro/mobile/domain/webview";
import { loggerUseCases } from "@sincpro/mobile/infrastructure/logger";
import { webViewService } from "@sincpro/mobile/services/webview.service";
import { useToast } from "@sincpro/mobile-ui/Feedback";
import Spinner from "@sincpro/mobile-ui/Feedback/Feedback.Spinner";
import { useBottomInset } from "@sincpro/mobile-ui/layouts/BottomInset";
import {
  type ComponentType,
  type Ref,
  type RefAttributes,
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { BackHandler, NativeSyntheticEvent, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import RawWebView, {
  type WebViewMessageEvent,
  type WebViewNavigation,
  type WebViewProps,
} from "react-native-webview";
import type { WebViewError } from "react-native-webview/lib/WebViewTypes";

import { webViewReloadNotice } from "./InjectableWebView.notices";

type WebViewHandle = RawWebView<Record<string, never>>;

// The library defaults its extra-props generic to `undefined`, and
// `WebViewProps & undefined` collapses to `never`. An empty record keeps the real props.
const WebView = RawWebView as unknown as ComponentType<
  WebViewProps & RefAttributes<WebViewHandle>
>;

const STUCK_LOAD_MS = 15000;
const CLEAR_CACHE_SETTLE_MS = 300;

export type WebViewErrorEvent = NativeSyntheticEvent<WebViewError>;

/** What a screen can ask of the page it shows: get it with `ref`. */
export interface InjectableWebViewHandle {
  /** Loads the page again. The HTTP cache serves what did not change, so it is fast. */
  reload(): void;
  /** Drops the WebView cache and loads the page again: a fresh client, slower. */
  clearCacheAndReload(): void;
}

export interface InjectableWebViewProps {
  url: string;
  ref?: Ref<InjectableWebViewHandle>;
  /** Names the page in the reload notices ("Odoo"). Default: "la página". */
  label?: string;
  scripts?: IInjectedScript[];
  injectedJavaScript?: string;
  onMessage?: (event: WebViewMessageEvent) => void;
  onNavigationChange?: (state: WebViewNavigation) => void;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onError?: (error: WebViewErrorEvent) => void;
  showControls?: boolean;
  renderLoading?: () => React.ReactElement;
  backgroundColor?: string;
  /** @deprecated Call `reload()` on the component's `ref`. */
  reloadKey?: number | string;
  /** @deprecated Call `clearCacheAndReload()` on the component's `ref`. */
  hardRefreshKey?: number | string;
  maxRetries?: number;
  /**
   * @deprecated The HTTP cache is always on: pages with fingerprinted assets (Odoo) stay
   * fresh with it, and without it every visit downloads the whole client again. For a fresh
   * client call `clearCacheAndReload()` on the component's `ref`.
   */
  useDefaultCache?: boolean;
  /**
   * Any other react-native-webview prop (user agent, navigation filter, downloads, media...).
   * They go last: the app overrides the defaults of this component.
   */
  webViewProps?: Partial<WebViewProps>;
}

interface WebViewControlsProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
}

function WebViewControls({
  canGoBack: _canGoBack,
  canGoForward: _canGoForward,
  onGoBack: _onGoBack,
  onGoForward: _onGoForward,
  onReload: _onReload,
}: WebViewControlsProps) {
  return <View />;
}

function WebViewLoadingIndicator({ backgroundColor }: { backgroundColor: string }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.loading, { backgroundColor }]}>
      <Spinner size="large" text="Cargando página..." />
    </View>
  );
}

function useWebView() {
  const webViewRef = useRef<WebViewHandle>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearCacheTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
  }, []);

  const goBack = useCallback(() => {
    if (webViewRef.current && canGoBack) {
      webViewRef.current.goBack();
    }
  }, [canGoBack]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        goBack();
        return true;
      }
      return false;
    });

    return () => backHandler.remove();
  }, [canGoBack, goBack]);

  useEffect(() => {
    return () => {
      for (const timer of [errorTimeoutRef, loadingTimeoutRef, clearCacheTimeoutRef]) {
        if (timer.current) clearTimeout(timer.current);
      }
    };
  }, []);

  return {
    webViewRef,
    canGoBack,
    handleNavigationStateChange,
    retryCount,
    setRetryCount,
    errorTimeoutRef,
    loadingTimeoutRef,
    clearCacheTimeoutRef,
  };
}

/**
 * A page with the app's scripts injected.
 * 1. The HTTP cache is always on: a page with fingerprinted assets loads from the phone.
 * 2. The loading overlay and the stuck check only cover the loads this component starts (the
 *    first one, a reload, a retry). Android reports every history change of a single-page
 *    app as a load start; covering those blanked the page on each menu and reloaded it
 *    after 15 s.
 * 3. `ref.reload()` and `ref.clearCacheAndReload()` show their progress in a toast.
 * 4. When the system ends the page's process (low memory, in the background) a new WebView
 *    loads the page instead of leaving it blank.
 */
function InjectableWebView({
  url,
  ref,
  label = "la página",
  scripts,
  injectedJavaScript,
  onMessage,
  onNavigationChange,
  onLoadStart,
  onLoadEnd,
  onError,
  renderLoading,
  backgroundColor = "#f8f8f8",
  reloadKey,
  hardRefreshKey,
  maxRetries = 2,
  useDefaultCache = true,
  webViewProps,
}: InjectableWebViewProps) {
  const {
    webViewRef,
    handleNavigationStateChange,
    retryCount,
    setRetryCount,
    errorTimeoutRef,
    loadingTimeoutRef,
    clearCacheTimeoutRef,
  } = useWebView();

  const toast = useToast();
  const bottomInset = useBottomInset();
  const finalScript = webViewService.combineScripts(scripts, injectedJavaScript);
  const [isLoading, setIsLoading] = useState(true);
  const [instance, setInstance] = useState(0);
  /** A load this component started: it shows the overlay and is checked for getting stuck. */
  const blockingRef = useRef(true);
  /** The current load ended in onError; its trailing onLoadEnd is not a success. */
  const failedRef = useRef(false);
  const stuckAttemptsRef = useRef(0);
  const reloadToastRef = useRef<string | null>(null);

  function settleReloadToast(step: "done" | "failed") {
    const id = reloadToastRef.current;
    if (!id) return;
    reloadToastRef.current = null;
    toast.show({ id, ...webViewReloadNotice(step, label) });
  }

  function watchStuckLoad() {
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    loadingTimeoutRef.current = setTimeout(() => {
      if (!blockingRef.current || !webViewRef.current) return;
      if (stuckAttemptsRef.current >= maxRetries) {
        blockingRef.current = false;
        setIsLoading(false);
        loggerUseCases.warn(`WebView stuck loading, stopped after ${maxRetries} reloads`);
        settleReloadToast("failed");
        return;
      }
      stuckAttemptsRef.current += 1;
      loggerUseCases.warn("WebView stuck loading for 15s, attempting reload");
      webViewRef.current.reload();
    }, STUCK_LOAD_MS);
  }

  function startReload(step: "reload" | "clear-cache") {
    const webView = webViewRef.current;
    if (!webView) return;
    loggerUseCases.info(`WebView ${step} requested`);
    reloadToastRef.current = toast.show({
      id: reloadToastRef.current ?? undefined,
      ...webViewReloadNotice(step, label),
    });
    stuckAttemptsRef.current = 0;
    setRetryCount(0);
    blockingRef.current = true;
    setIsLoading(true);
    if (step === "reload") {
      webView.reload();
      return;
    }
    webView.clearCache?.(true);
    if (clearCacheTimeoutRef.current) clearTimeout(clearCacheTimeoutRef.current);
    // iOS removes the website data asynchronously; reloading at once could reuse it.
    clearCacheTimeoutRef.current = setTimeout(
      () => webViewRef.current?.reload(),
      CLEAR_CACHE_SETTLE_MS,
    );
  }

  useImperativeHandle(ref, () => ({
    reload: () => startReload("reload"),
    clearCacheAndReload: () => startReload("clear-cache"),
  }));

  function handleMessage(event: WebViewMessageEvent) {
    onMessage?.(event);
  }

  function handleNavigationStateChangeInternal(navState: WebViewNavigation) {
    handleNavigationStateChange(navState);
    onNavigationChange?.(navState);
  }

  function handleLoadStart() {
    onLoadStart?.();
    if (!blockingRef.current) return;
    failedRef.current = false;
    setIsLoading(true);
    watchStuckLoad();
  }

  function handleLoadEnd() {
    setIsLoading(false);

    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }

    // react-native-webview also calls onLoadEnd right after onError. Resetting the counters
    // there kept retryCount at 0, so an offline portal reloaded every 2 s forever.
    if (failedRef.current) {
      failedRef.current = false;
    } else {
      setRetryCount(0);
      stuckAttemptsRef.current = 0;
      blockingRef.current = false;
      settleReloadToast("done");
    }
    onLoadEnd?.();
  }

  function handleError(error: WebViewErrorEvent) {
    const errorMsg = error.nativeEvent.description || "Error desconocido";
    const errorCode = error.nativeEvent.code || -1;

    loggerUseCases.warn(`WebView error (${errorCode}): ${errorMsg}`);
    failedRef.current = true;
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }

    if (retryCount < maxRetries) {
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 5000);
      loggerUseCases.info(
        `Reintentando carga en ${retryDelay}ms (intento ${retryCount + 1}/${maxRetries})`,
      );

      errorTimeoutRef.current = setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        blockingRef.current = true;
        webViewRef.current?.reload();
      }, retryDelay);
    } else {
      loggerUseCases.error(`WebView falló después de ${maxRetries} reintentos`);
      settleReloadToast("failed");
      onError?.(error);
    }
  }

  function handleProcessGone() {
    loggerUseCases.warn("WebView content process ended: loading the page in a new WebView");
    blockingRef.current = true;
    setIsLoading(true);
    setInstance((value) => value + 1);
  }

  useEffect(() => {
    stuckAttemptsRef.current = 0;
    blockingRef.current = true;
  }, [url]);

  const prevReloadKeyRef = useRef(reloadKey);
  const prevHardRefreshKeyRef = useRef(hardRefreshKey);
  const reloadFromKey = useEffectEvent(() => startReload("reload"));
  const clearCacheFromKey = useEffectEvent(() => startReload("clear-cache"));

  useEffect(() => {
    if (reloadKey === prevReloadKeyRef.current) return;
    prevReloadKeyRef.current = reloadKey;
    reloadFromKey();
  }, [reloadKey]);

  useEffect(() => {
    if (hardRefreshKey === prevHardRefreshKeyRef.current) return;
    prevHardRefreshKeyRef.current = hardRefreshKey;
    clearCacheFromKey();
  }, [hardRefreshKey]);

  const cacheMode = useDefaultCache ? "LOAD_DEFAULT" : "LOAD_NO_CACHE";

  return (
    // Outer full-bleed container: under edge-to-edge (SDK 54+ / targetSdk 36) the window
    // draws behind the transparent system bars. The loading overlay lives here (NOT inside
    // the inset SafeAreaView) so it covers the whole screen and also shows on reload/refresh.
    <View style={{ flex: 1, backgroundColor }}>
      <SafeAreaView
        className="flex-1"
        edges={["bottom"]}
        style={{ backgroundColor, marginBottom: bottomInset }}
      >
        <WebView
          allowsBackForwardNavigationGestures={true}
          androidLayerType="hardware"
          cacheEnabled={true}
          cacheMode={cacheMode}
          domStorageEnabled={true}
          injectedJavaScript={finalScript}
          javaScriptEnabled={true}
          key={instance}
          mixedContentMode="compatibility"
          onContentProcessDidTerminate={handleProcessGone}
          onError={handleError}
          onLoadEnd={handleLoadEnd}
          onLoadStart={handleLoadStart}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChangeInternal}
          onRenderProcessGone={handleProcessGone}
          ref={webViewRef}
          scalesPageToFit={true}
          sharedCookiesEnabled={true}
          source={{ uri: url }}
          style={{ flex: 1, backgroundColor }}
          {...webViewProps}
        />
      </SafeAreaView>
      {isLoading &&
        (renderLoading ? (
          renderLoading()
        ) : (
          <WebViewLoadingIndicator backgroundColor={backgroundColor} />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    justifyContent: "center",
  },
});

InjectableWebView.Controls = WebViewControls;

export { InjectableWebView };
