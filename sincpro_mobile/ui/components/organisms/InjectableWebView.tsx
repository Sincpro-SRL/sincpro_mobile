import Spinner from "@sincpro/mobile-ui/Feedback/Feedback.Spinner";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, NativeSyntheticEvent, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import WebView, {
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";
import type { WebViewError } from "react-native-webview/lib/WebViewTypes";

import { IInjectedScript } from "../../../domain/webview";
import { loggerUseCases } from "../../../infrastructure/logger";
import { webViewService } from "../../../services/webview.service";

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
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
      Toast.show({
        type: "info",
        text1: "Limpiando caché...",
        text2: "Descargando cliente fresco",
        visibilityTime: 2000,
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
  }, []);

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

  const finalScript = webViewService.combineScripts(scripts, injectedJavaScript);

  function handleMessage(event: WebViewMessageEvent) {
    onMessage?.(event);
  }

  function handleNavigationStateChangeInternal(navState: WebViewNavigation) {
    handleNavigationStateChange(navState);
    onNavigationChange?.(navState);
  }

  function handleLoadStart() {
    isLoadingRef.current = true;

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
    <SafeAreaView className="flex-1" edges={["top", "bottom"]} style={{ backgroundColor }}>
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
        renderLoading={
          renderLoading ||
          (() => <WebViewLoadingIndicator backgroundColor={backgroundColor} />)
        }
        scalesPageToFit={true}
        sharedCookiesEnabled={true}
        source={{ uri: url }}
        startInLoadingState={true}
        style={{ flex: 1, backgroundColor }}
      />
    </SafeAreaView>
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
