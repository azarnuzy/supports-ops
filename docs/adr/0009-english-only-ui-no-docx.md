# Removed i18n scaffolding; no DOCX support

Two capabilities that the starting point either shipped or the PRD listed have been deliberately taken out, and should not be reinstated as bug fixes.

**The dashboard is English only.** The boilerplate arrived with working i18next scaffolding in `packages/ui` and `apps/platform`, covering English and Indonesian with a language selector and tests. It is removed, because keeping it taxes every frontend ticket with a two-language resource entry for every string, and the PRD only ever governs the language the AI Agent replies in — never the dashboard's. The Web Widget is the exception: it faces Customers, and the AI Agent answers in the Customer's language, so English chrome around an Indonesian conversation reads as a defect. The widget carries a small two-language string table of its own, chosen from the browser locale — a single file, not a reintroduction of i18n.

**DOCX is not a supported Knowledge Source or Attachment format**, though the PRD lists it. Rendering DOCX faithfully requires headless LibreOffice in the worker image, roughly half a gigabyte of image and several hundred megabytes of RAM per conversion, which is not a good trade on a 4GB machine for the rarest of the supported formats. PDF, TXT, JPG, and PNG remain.
