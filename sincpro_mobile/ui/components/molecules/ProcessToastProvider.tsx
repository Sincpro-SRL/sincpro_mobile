import type { ReactNode } from "react";

import ProcessToast from "./ProcessToast";

export function ProcessToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ProcessToast />
    </>
  );
}
