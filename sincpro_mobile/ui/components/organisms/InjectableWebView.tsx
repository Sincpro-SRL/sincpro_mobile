import { IInjectedScript } from "@sincpro/mobile/domain/webview";
import { loggerUseCases } from "@sincpro/mobile/infrastructure/logger";
import { webViewService } from "@sincpro/mobile/services/webview.service";
import { useToast } from "@sincpro/mobile-ui/Feedback";
import Spinner from "@sincpro/mobile-ui/Feedback/Feedback.Spinner";
import { useBottomInset } from "@sincpro/mobile-ui/layouts/BottomInset";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, NativeSyntheticEvent, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView, {
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";
import type { WebViewError } from "react-native-webview/lib/WebViewTypes";

export type WebViewErrorEvent = NativeSyntheticEvent<WebViewError>;

export interface InjectableWebViewProps {
  url: string;
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
  reloadKey?: number | string;
  hardRefreshKey?: number | string;
  maxRetries?: number;
  useDefaultCache?: boolean;
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
    <View style={[StyleSheet.absoluteFillObject, styles.loading, { backgroundColor }]}>
      <Spinner size="large" text="Cargando página..." />
    </View>
  );
}

function useWebView() {
  const toast = useToast();
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef = useRef(false);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
  }, []);

  const goBack = useCallback(() => {
    if (webViewRef.current && canGoBack) {
      webViewRef.current.goBack();
    }
  }, [canGoBack]);

  const reload = useCallback(() => {
    if (webViewRef.current) {
      loggerUseCases.info("Reloading WebView");
      webViewRef.current.reload();
    }
  }, []);

  const hardRefresh = useCallback(() => {
    if (webViewRef.current) {
      loggerUseCases.info("Hard refresh: Clearing cache and reloading");
      toast.show({
        variant: "info",
        title: "Limpiando caché...",
        message: "Descargando cliente fresco",
        duration: 2000,
      });

      if (webViewRef.current.clearCache) {
        webViewRef.current.clearCache(true);
      }

      setTimeout(() => {
        if (webViewRef.current) {
          webViewRef.current.reload();
        }
      }, 300);
    }
  }, [toast]);

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
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  return {
    webViewRef,
    canGoBack,
    handleNavigationStateChange,
    retryCount,
    setRetryCount,
    reload,
    hardRefresh,
    errorTimeoutRef,
    loadingTimeoutRef,
    isLoadingRef,
  };
}

function InjectableWebView({
  url,
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
}: InjectableWebViewProps) {
  const {
    webViewRef,
    handleNavigationStateChange,
    retryCount,
    setRetryCount,
    reload,
    hardRefresh,
    errorTimeoutRef,
    loadingTimeoutRef,
    isLoadingRef,
  } = useWebView();

  const bottomInset = useBottomInset();
  const finalScript = webViewService.combineScripts(scripts, injectedJavaScript);
  const [isLoading, setIsLoading] = useState(true);

  function handleMessage(event: WebViewMessageEvent) {
    onMessage?.(event);
  }

  function handleNavigationStateChangeInternal(navState: WebViewNavigation) {
    handleNavigationStateChange(navState);
    onNavigationChange?.(navState);
  }

  function handleLoadStart() {
    isLoadingRef.current = true;
    setIsLoading(true);

    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }

    loadingTimeoutRef.current = setTimeout(() => {
      if (isLoadingRef.current && webViewRef.current) {
        loggerUseCases.warn("WebView stuck loading for 15s, attempting reload");
        webViewRef.current.reload();
      }
    }, 15000);

    onLoadStart?.();
  }

  function handleLoadEnd() {
    isLoadingRef.current = false;
    setIsLoading(false);

    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }

    setRetryCount(0);
    onLoadEnd?.();
  }

  function handleError(error: WebViewErrorEvent) {
    const errorMsg = error.nativeEvent.description || "Error desconocido";
    const errorCode = error.nativeEvent.code || -1;

    loggerUseCases.warn(`WebView error (${errorCode}): ${errorMsg}`);

    if (retryCount < maxRetries) {
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 5000);
      loggerUseCases.info(
        `Reintentando carga en ${retryDelay}ms (intento ${retryCount + 1}/${maxRetries})`,
      );

      errorTimeoutRef.current = setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        reload();
      }, retryDelay);
    } else {
      loggerUseCases.error(`WebView falló después de ${maxRetries} reintentos`);
      onError?.(error);
    }
  }

  const prevReloadKeyRef = useRef(reloadKey);
  const prevHardRefreshKeyRef = useRef(hardRefreshKey);

  useEffect(() => {
    if (reloadKey === prevReloadKeyRef.current) return;
    prevReloadKeyRef.current = reloadKey;

    if (webViewRef.current) {
      loggerUseCases.info(`Reloading WebView due to key change: ${reloadKey}`);
      reload();
    }
  }, [reloadKey, reload]);

  useEffect(() => {
    if (hardRefreshKey === prevHardRefreshKeyRef.current) return;
    prevHardRefreshKeyRef.current = hardRefreshKey;

    if (webViewRef.current) {
      loggerUseCases.info(`Hard refresh WebView due to key change: ${hardRefreshKey}`);
      hardRefresh();
    }
  }, [hardRefreshKey, hardRefresh]);

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
          cacheEnabled={true}
          cacheMode={cacheMode}
          domStorageEnabled={true}
          injectedJavaScript={finalScript}
          javaScriptEnabled={true}
          mixedContentMode="compatibility"
          onError={handleError}
          onLoadEnd={handleLoadEnd}
          onLoadStart={handleLoadStart}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChangeInternal}
          ref={webViewRef}
          scalesPageToFit={true}
          sharedCookiesEnabled={true}
          source={{ uri: url }}
          style={{ flex: 1, backgroundColor }}
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
