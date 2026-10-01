import { readWorkbook } from "./workbook";

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    self.postMessage({ text: await readWorkbook(event.data) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Unable to read this workbook.",
    });
  }
};
