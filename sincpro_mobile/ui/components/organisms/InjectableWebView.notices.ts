export type WebViewReloadStep = "reload" | "clear-cache" | "done" | "failed";

export interface WebViewReloadNotice {
  variant: "loading" | "success" | "danger";
  title: string;
  message: string;
  duration?: number;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The toast of a reload the user asked for, one per step: it starts as a process and ends
 * as done (it fades) or failed (it stays with the reason).
 */
export function webViewReloadNotice(
  step: WebViewReloadStep,
  label: string,
): WebViewReloadNotice {
  if (step === "reload") {
    return { variant: "loading", title: "Recargando", message: capitalized(label) };
  }
  if (step === "clear-cache") {
    return {
      variant: "loading",
      title: "Limpiando caché",
      message: `Descargando ${label} de nuevo`,
    };
  }
  if (step === "done") {
    return {
      variant: "success",
      title: "Recarga completa",
      message: capitalized(label),
      duration: 1500,
    };
  }
  return {
    variant: "danger",
    title: "No se pudo cargar",
    message: `${capitalized(label)}: revisa la conexión e intenta de nuevo.`,
    duration: 8000,
  };
}
