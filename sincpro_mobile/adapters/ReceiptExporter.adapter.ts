import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { PDFDocument } from "pdf-lib";
import { RefObject } from "react";
import { Platform, View } from "react-native";
import { captureRef } from "react-native-view-shot";

const DEFAULT_CONFIG = {
  RECEIPT_WIDTH_MM: 72,
  MM_TO_POINTS: 2.83464567,
  IMAGE_QUALITY: 0.8,
} as const;

interface ExportOptions {
  fileName?: string;
  receiptWidthMm?: number;
  quality?: number;
  dialogTitle?: string;
}

interface ExportResult {
  success: boolean;
  fileUri?: string;
  error?: string;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, "_");
}

function generateFileName(baseName?: string, extension = "pdf"): string {
  const sanitized = sanitizeFileName(baseName || "comprobante");
  return `${sanitized}_${Date.now()}.${extension}`;
}

async function captureViewToTmpFile(
  viewRef: RefObject<View | null>,
  quality: number,
): Promise<string> {
  const tmpUri = await captureRef(viewRef, {
    format: "jpg",
    quality,
    result: "tmpfile",
    useRenderInContext: Platform.OS === "ios",
  });
  return tmpUri;
}

async function readImageAsBase64(tmpUri: string): Promise<string> {
  const tmpFile = new File(tmpUri);
  return await tmpFile.base64();
}

async function createPdfFromJpg(jpgBase64: string, receiptWidthMm: number): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const jpgImage = await pdfDoc.embedJpg(jpgBase64);

  const pageWidth = receiptWidthMm * DEFAULT_CONFIG.MM_TO_POINTS;
  const scale = pageWidth / jpgImage.width;
  const pageHeight = jpgImage.height * scale;

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  page.drawImage(jpgImage, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
  });

  return await pdfDoc.saveAsBase64();
}

async function savePdfToFile(pdfBase64: string, fileName: string): Promise<string> {
  const file = new File(Paths.document, fileName);
  await file.write(pdfBase64, { encoding: "base64" });
  return file.uri;
}

async function cleanupTmpFile(tmpUri: string): Promise<void> {
  try {
    const tmpFile = new File(tmpUri);
    await tmpFile.delete();
  } catch {
    // Ignore cleanup errors
  }
}

async function shareFile(fileUri: string, dialogTitle: string): Promise<void> {
  await Sharing.shareAsync(fileUri, {
    mimeType: "application/pdf",
    dialogTitle,
  });
}

async function captureViewToBase64(
  viewRef: RefObject<View | null>,
  quality: number,
): Promise<string | null> {
  if (!viewRef.current) return null;

  try {
    const base64 = await captureRef(viewRef, {
      format: "png",
      quality,
      result: "base64",
      useRenderInContext: Platform.OS === "ios",
    });
    return base64;
  } catch (error) {
    console.error("Error capturing view to base64:", error);
    return null;
  }
}

export const ReceiptExporterAdapter = {
  async captureAndShareAsPdf(
    viewRef: RefObject<View | null>,
    options?: ExportOptions,
  ): Promise<ExportResult> {
    if (!viewRef.current) {
      return { success: false, error: "View reference is not available" };
    }

    const quality = options?.quality ?? DEFAULT_CONFIG.IMAGE_QUALITY;
    const receiptWidthMm = options?.receiptWidthMm ?? DEFAULT_CONFIG.RECEIPT_WIDTH_MM;
    const fileName = generateFileName(options?.fileName);
    const dialogTitle = options?.dialogTitle ?? "Compartir comprobante";

    let tmpUri: string | null = null;

    try {
      tmpUri = await captureViewToTmpFile(viewRef, quality);
      const jpgBase64 = await readImageAsBase64(tmpUri);
      const pdfBase64 = await createPdfFromJpg(jpgBase64, receiptWidthMm);
      const fileUri = await savePdfToFile(pdfBase64, fileName);

      await shareFile(fileUri, dialogTitle);

      return { success: true, fileUri };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error exporting receipt:", errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      if (tmpUri) {
        await cleanupTmpFile(tmpUri);
      }
    }
  },

  async captureAsPdf(
    viewRef: RefObject<View | null>,
    options?: Omit<ExportOptions, "dialogTitle">,
  ): Promise<ExportResult> {
    if (!viewRef.current) {
      return { success: false, error: "View reference is not available" };
    }

    const quality = options?.quality ?? DEFAULT_CONFIG.IMAGE_QUALITY;
    const receiptWidthMm = options?.receiptWidthMm ?? DEFAULT_CONFIG.RECEIPT_WIDTH_MM;
    const fileName = generateFileName(options?.fileName);

    let tmpUri: string | null = null;

    try {
      tmpUri = await captureViewToTmpFile(viewRef, quality);
      const jpgBase64 = await readImageAsBase64(tmpUri);
      const pdfBase64 = await createPdfFromJpg(jpgBase64, receiptWidthMm);
      const fileUri = await savePdfToFile(pdfBase64, fileName);

      return { success: true, fileUri };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error creating PDF:", errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      if (tmpUri) {
        await cleanupTmpFile(tmpUri);
      }
    }
  },

  async captureAsImageBase64(
    viewRef: RefObject<View | null>,
    quality?: number,
  ): Promise<string | null> {
    const imageQuality = quality ?? DEFAULT_CONFIG.IMAGE_QUALITY;
    return captureViewToBase64(viewRef, imageQuality);
  },
};
