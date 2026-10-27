# Science of Gifts Writing Studio — Product Copy Architecture Audit, Implementation Plan & Unexpected Changes Investigation

**Document Path**: `/PRODUCT-COPY-AUDIT.md`  
**Generated**: 2026-10-26  
**Scope**: Phase 0 Read-Only Architecture Audit & Safe Implementation Plan for Product Copy + Investigation of Five Unexpected File Modifications

---

## Table of Contents

1. [Epistemic Classification & Evidence Boundaries](#1-epistemic-classification--evidence-boundaries)
2. [Part I: Phase 0 Read-Only Architecture Audit](#2-part-i-phase-0-read-only-architecture-audit)
   - [2.1 Current Architecture (`ProductCopyWorkspace`, Editor, Persistence, Gift Guide)](#21-current-architecture)
   - [2.2 Reuse Map](#22-reuse-map)
   - [2.3 Simplification & Field Disposition Plan](#23-simplification--field-disposition-plan)
   - [2.4 Proposed End-to-End Data Flow & Additive Schema](#24-proposed-end-to-end-data-flow--additive-schema)
   - [2.5 Data-Persistence Safeguards & API/AI Cost Controls](#25-data-persistence-safeguards--apiai-cost-controls)
   - [2.6 Phased Implementation Plan](#26-phased-implementation-plan)
   - [2.7 Verification Plan & Protected Article Workflow Regression Tests](#27-verification-plan--protected-article-workflow-regression-tests)
   - [2.8 Recommended First Implementation Stage & Acceptance Criteria](#28-recommended-first-implementation-stage--acceptance-criteria)
3. [Part II: Investigation of Five Unexpected File Changes](#3-part-ii-investigation-of-five-unexpected-file-changes)
   - [3.1 Timeline & Recovery Sources for Pre-Change Versions](#31-timeline--recovery-sources-for-pre-change-versions)
   - [3.2 Exact Diffs & File-by-File Analysis](#32-exact-diffs--file-by-file-analysis)
   - [3.3 Specific Technical Assessments (Port/HMR, TypeScript Imports, Dependencies, `editorialDevelopmentUtils.ts`)](#33-specific-technical-assessments)
   - [3.4 Environment Impact Assessment (Local Dev, Cloudflare Worker, Article Workflow)](#34-environment-impact-assessment)
   - [3.5 Checks Actually Executed and Their Results](#35-checks-actually-executed-and-their-results)
   - [3.6 Recommended Next Steps for the Five Modified Files](#36-recommended-next-steps-for-the-five-modified-files)
4. [Part III: Unresolved Questions](#4-part-iii-unresolved-questions)

---

## 1. Epistemic Classification & Evidence Boundaries

To ensure complete transparency, all findings in this document are categorized into four explicit evidence tiers:

### A. Findings Verified by Direct Source Inspection
- Inspected directly in the current workspace:
  - `/src/components/workspaces/ProductCopyWorkspace.tsx` (lines 1–1690)
  - `/src/components/workspaces/GiftGuideWorkspace.tsx` (lines 1–932)
  - `/src/components/workspaces/giftGuide/ProductCard.tsx` (lines 1–979)
  - `/src/components/Editor.tsx` (lines 1–1375)
  - `/src/App.tsx` (lines 1–2021)
  - `/src/types/project.ts` (lines 1–575)
  - `/src/types/giftGuide.ts` (lines 1–130)
  - `/src/services/productResearchService.ts` (lines 1–98)
  - `/src/server/urlMetadata.ts` (lines 1–969)
  - `/src/services/storage.ts` (lines 1–720)
  - `/src/services/syncEngine.ts` (lines 1–250)
  - `/src/services/versionHistoryService.ts` (lines 1–389)
  - `/src/services/draftPackageService.ts` (lines 1–250)
  - `/src/services/qualityControl.ts` (lines 1–200)
  - `/src/services/articleExport.ts` (lines 1–200)
  - `/src/utils/editingNotes.ts` (lines 1–918)
  - `/src/components/drawers/LinkOpportunitiesDrawer.tsx` (lines 1–200)
  - `/src/utils/editorialDevelopmentUtils.ts` (lines 1–504)
  - `/vite.config.ts`, `/server.ts`, `/package.json`, `/worker.ts`, `/wrangler.json`, `/tsconfig.json`, `/firestore.rules`
  - `/public/assets/aistudio/writing-studio_0660b0fc.zip` (inspected in-memory without modifying disk files)

### B. Tests Actually Executed and Their Results
- **TypeScript Typecheck (`npm run lint` -> `tsc --noEmit`)**: Executed in Turn 1; exited `0` with zero type or syntax errors.
- **Frontend Production Bundle (`npm run build` -> `vite build`)**: Executed in Turn 1; exited `0` and built `/dist`. *(Note: proves frontend Vite bundling only; does not prove server/Worker runtime behavior or UI interaction correctness.)*
- **Dev Server Startup (`tsx server.ts`)**: Executed in Turn 1; Express + Vite middleware bound cleanly to `http://0.0.0.0:3000`.
- **Editorial Development Unit Test Suite (`npm test` -> `tsx --test src/utils/__tests__/editorialDevelopmentWorkflow.test.ts`)**: Executed in Turn 1; all **15/15** tests passed (`pass 15, fail 0`).
- **Tests NOT Executed Yet**:
  - `/src/scripts/test-editing-notes.ts` and `/src/scripts/test-citation-studio.ts`
  - Cloudflare Worker runtime simulation (`wrangler dev` or `wrangler deploy --dry-run`)
  - Interactive browser E2E testing of the UI flows

### C. Inferences or External Assumptions
- **Separate *Product Studio* Application Source Code**: The separate *Product Studio* repository is not included in this workspace's file tree. All *Product Studio* target capabilities are inferred strictly from the 7-step workflow specification in your prompt and mapped onto *Science of Gifts Writing Studio*'s existing architecture.
- **Fourthwall DOM Structure Variations**: While standard Fourthwall storefronts expose Schema.org `Product` JSON-LD (`offers.price`, `offers.priceCurrency`, `name`, `description`, `image`) and OpenGraph meta tags, custom Fourthwall themes may place fabric/garment bullet specs in HTML lists outside JSON-LD; the extraction plan accounts for both JSON-LD and body-list parsing.

### D. Unresolved Questions
- Listed in [Section 4 (Part III: Unresolved Questions)](#4-part-iii-unresolved-questions) regarding specific *Product Studio* Context Profile fields, Copy Configuration toggles, Gift Guide primary image preference, and whether to revert the 5 modified files before Phase 1.

---

## 2. Part I: Phase 0 Read-Only Architecture Audit

### 2.1 Current Architecture

#### A. Product Copy Workspace (`/src/components/workspaces/ProductCopyWorkspace.tsx`)
- **Component Structure & Current User Workflow**:
  - `ProductCopyWorkspace` (1,690 lines) is rendered by `/src/App.tsx` (lines 1767–1778) when `currentView === 'workspace' && activeProject.type === 'product_copy'`.
  - Props passed from `App.tsx`:
    - `project: WritingProject`
    - `editorRef: React.MutableRefObject<any>`
    - `activePanel: ActivePanel`
    - `onTogglePanel: (panel: Exclude<ActivePanel, null>) => void`
    - `onChange: (updatedProject: WritingProject) => void` (bound to `handleUpdateActiveProject`)
    - `onRequestProposal: (proposal: DiffProposal) => void`
  - Top bar renders **6 horizontal workflow tabs** (`activeTab: 'canvas' | 'facts' | 'positioning' | 'copy_fields' | 'variants' | 'seo'`) plus right-hand drawer toggles (`Brief`, `Instructions`, `Rules`, `Links`, `Style & Length`, `Review`, `Check`, `History`) and an `Export` menu (`Markdown`, `HTML`, `JSON Package`).
  - **Tab 1 — `Editor Canvas` (`canvas`, lines 669–820)**:
    - Left sidebar (`w-80`):
      - `Raw Specification Notes` textarea bound to `meta.rawProductInfo`.
      - Quick read-only summary of `meta.materials`, `meta.features`, and `meta.historicalContext`.
      - Quick `Structured Copy Preview` showing `meta.headline`, `meta.standfirst`, and `meta.bestFor`.
      - `Assemble Fields into Canvas` button calling `handleCompileToEditor()` (lines 382–423).
    - Main center canvas:
      - Renders the shared `<Editor>` component (`/src/components/Editor.tsx`) with `projectId={project.id}`, `project={project}`, `content={project.content}`, `editingNotes={project.editingNotes || []}`, `onChangeWithNotes`, and `onEditingNotesChange`.
      - Renders a collapsible `<AiCommandBar>` at the bottom.
  - **Tab 2 — `1. Product Facts` (`facts`, lines 823–1104)**:
    - Product URL bar (`meta.productUrl`) + `Fetch & Analyze Product` button calling `handleFetchProductResearch` (lines 116–205).
    - `AI Autofill Missing Facts` button (`handleAutofillFacts`, lines 217–265) and `Extract from Raw Notes` button (`handleExtractFromRaw`, lines 267–311), both calling `geminiService.executeAction` (`POST /api/gemini/action`).
    - Text inputs/textareas for: `productName`, `productType`, `productUrl`, `imageUrl` (text URL string only — **no file upload or mockup image upload exists**), `materials`, `features`, `dimensions`, `colors`, `designConcept`, `historicalContext`, `intendedRecipient`, `targetAudience`, `additionalFacts`.
    - Non-destructive suggestion pills (`pendingFactSuggestions: Record<string, string>`, lines 72, 165–190): if a field already has content during URL fetch or AI autofill, the newly fetched value is held in component state (`pendingFactSuggestions`) with `Apply` / `Dismiss` buttons instead of overwriting the user's text.
  - **Tab 3 — `2. Positioning & Angles` (`positioning`, lines 1107–1242)**:
    - `AI Suggest Angles` button (`handleSuggestPositioning`, lines 313–347).
    - **8 manual textareas** mapped to `meta.positioning: ProductPositioning`:
      `whatMakesItInteresting`, `whyWouldSomeoneWantIt`, `suitedRecipient`, `whatToEmphasize`, `whatToAvoid`, `keySellingAngle`, `emotionalAngle`, `historicalAngle`.
  - **Tab 4 — `3. Copy Fields` (`copy_fields`, lines 1245–1477)**:
    - `AI Generate All Copy` (`handleGenerateCopyFields`, lines 349–380) and `Send to Editor Canvas` (`handleCompileToEditor`, lines 382–423).
    - Individual fields (`headline`, `standfirst`, `description`, `bestFor`) with per-field regenerate buttons (`handleRegenerateSingleField`, lines 425–465).
    - `handleCompileToEditor` overwrites `project.content` with a hardcoded HTML template:
      ```html
      <h2>${meta.headline || meta.productName}</h2>
      <p><em>${meta.standfirst}</em></p>
      <p>${meta.description}</p>
      <p><strong>Best Suited For:</strong> ${meta.bestFor}</p>
      <h3>Materials & Specifications</h3>
      <p>${meta.materials}</p>
      <p>${meta.features}</p>
      <h3>Historical & Craft Context</h3>
      <p>${meta.historicalContext}</p>
      ```
    - `Prompt Studio` panel (`handleBuildExternalPrompt`, lines 541–595) constructs a basic text prompt stored in `meta.generatedPrompt`.
  - **Tab 5 — `4. Variants (4)` (`variants`, lines 1480–1572)**:
    - `Generate All 4 Variants` (`handleGenerateVariants`, lines 467–505) runs a **4-iteration sequential `for` loop** calling `geminiService.executeAction` 4 separate times to populate `meta.variants` (`formalEditorial`, `emotionalStorytelling`, `conciseConversion`, `technicalHistorical`).
  - **Tab 6 — `5. SEO Metadata` (`seo`, lines 1575–1672)**:
    - `AI Generate SEO` (`handleGenerateSeo`, lines 507–539) populates `meta.seo` (`seoTitle`, `metaDescription`, `slug`, `primaryKeyword`).

- **Current Product-Page Fetch & Extraction Behavior**:
  - `/src/services/productResearchService.ts` (`analyzeProductResearch`, lines 66–97) sends `POST /api/products/analyze-research` with `{ url, modelOverride, guideContext }`.
  - Server handler `/src/server/urlMetadata.ts` (`handleAnalyzeProductResearch`, lines 739–968) and Worker handler `/worker.ts` (lines 1337–1405):
    1. Fetches the target HTML page with a browser `User-Agent`.
    2. Parses `<script type="application/ld+json">` (`@type: 'Product'`), OpenGraph/Twitter meta tags, `<title>`, `<link rel="canonical">`, and body text snippets.
    3. Extracts `productName`, `productType`, `imageUrl`, `materials`, `features`, `dimensions`, `colors`, `rawProductInfo`, and `canonicalUrl`.
    4. Calls Gemini (`responseMimeType: 'application/json'`) to synthesize `designConcept`, `historicalContext`, `whyItFits`, `bestFor`, `buyerConsiderations`, `intendedRecipient`, `targetAudience`, and `additionalFacts`.
  - **Verified Gaps Against Target Workflow**:
    1. **No Mockup Upload or Vision Analysis**: Cannot upload product mockup images (`File` / base64) or analyze visual design, printed text, or graphic details via multimodal Gemini calls.
    2. **URL Required**: Fails immediately if `url` is blank (`if (!inputUrl || !inputUrl.trim()) throw new Error(...)`); cannot run on mockup images alone.
    3. **Missing Price & Variant Extraction**: Does not extract `offers.price`, `offers.priceCurrency`, `offers.availability`, or product variant/size options from JSON-LD or Fourthwall product JSON.
    4. **No Epistemic Separation**: Mixes scraped page specifications (`materials`, `dimensions`) with AI-invented interpretations (`historicalContext`, `designConcept`, `whyItFits`) in a single flat object without distinguishing **Verified Facts**, **Visible Mockup Observations**, and **Editorial Inferences**.

#### B. Reusable Editing, Notes, Linking & Persistence Infrastructure
- **Rich-Text Editor (`/src/components/Editor.tsx`, lines 1–1375)**:
  - Uses TipTap (`StarterKit`, `Underline`, `Superscript`, `Link`, `Image`, `EditingNotesExtension`).
  - **Already mounted directly inside `ProductCopyWorkspace.tsx`** (lines 796–811) with full support for `editingNotes`, `onChangeWithNotes`, and `onEditingNotesChange`.
  - Strips noise on paste via `transformPastedHTML` (lines 204–223) while preserving headings, lists, bold/italic, links, and paragraphs.
- **Passage-Anchored Written & Voice Notes (`/src/components/editingNotes/*`, `/src/utils/editingNotes.ts`)**:
  - Highlighting any passage in `<Editor>` activates toolbar buttons: `Voice Note` (`Mic`) and `Write Note` (`MessageSquarePlus`).
  - `EditingNoteModal.tsx` records voice instructions using the browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), cleans conversational fillers deterministically via `cleanSpeechTranscriptLocally()` (`/src/utils/editingNotes.ts`, lines 680–723), and saves `{ id, quotedText, paragraphContext, headingContext, prefixContext, suffixContext, from, to, instruction, inputMethod: 'voice' | 'text', rawTranscript, cleanedTranscript, anchorStatus: 'resolved' | 'ambiguous' | 'unresolved' }` onto `project.editingNotes: ArticleEditingNote[]`. *(Note: speech transcripts are stored; raw audio binary blobs are not stored.)*
  - `EditingNotesExtension.ts` renders inline ProseMirror highlight decorations (toggled via `Show/Hide Notes` in the editor toolbar) and remaps `[from, to]` offsets on every edit transaction via `mapAndResolveNotesInDoc()` (`/src/utils/editingNotes.ts`, lines 328–473). Deleted passages are marked `'unresolved'` ("Needs attention") and never silently discarded.
- **Exporting Editing Notes as a Revision Brief (`/src/components/editingNotes/ExportEditingBriefModal.tsx`, `/src/utils/editingNotes.ts`)**:
  - Clicking `Export Editing Brief` in `<Editor>` opens `ExportEditingBriefModal`, which calls `buildConsolidatedEditingBrief(project, options)` (`/src/utils/editingNotes.ts`, lines 757–917).
  - Note: Line 791 of `editingNotes.ts` already checks `project.productCopyMeta?.standfirst`! It outputs a complete revision prompt for ChatGPT, Claude, or Universal AI containing revision rules, metadata, clean text (free of UI markers), anchored notes in document order, and any unresolved notes.
- **Internal Linking (`/src/components/Editor.tsx`, `/src/components/drawers/LinkOpportunitiesDrawer.tsx`, `/src/components/internalLinks/InternalLinksView.tsx`)**:
  - Saved links live in `storage.getInternalLinks()` (`sog_internal_links_v1`) and sync to Firestore (`users/{uid}/internalLinks/{id}`).
  - In `<Editor>`, the Link toolbar popover searches `storage.getInternalLinks()` and inserts `<a href="...">` using either the current selection or the link's `preferredAnchor`.
  - In `App.tsx` (lines 1907–1925), the `Links` drawer (`LinkOpportunitiesDrawer.tsx`) works for any active workspace project (`article`, `gift_guide`, or `product_copy`), scanning `project.content` against `storage.getInternalLinks()` and applying verified links with a `before_links` version snapshot.
- **Manual Save, Dirty-State Guard, Version History & Cloud Sync (`/src/App.tsx`, `/src/services/versionHistoryService.ts`, `/src/services/storage.ts`, `/src/services/syncEngine.ts`)**:
  - `handleUpdateActiveProject` in `App.tsx` (lines 336–357) updates in-memory React state only and computes `hasProjectUnsavedChanges(updatedProject, baseline)`.
  - `extractStructuredState` in `/src/services/versionHistoryService.ts` (lines 41–59) includes `productCopyMeta: project.productCopyMeta || null` and `editingNotes: normalizeEditingNotesForComparison(project.editingNotes)`.
  - `handleManualSave` in `App.tsx` (lines 362–565) creates a `ProjectVersionSnapshot`, saves to `localStorage` + `IndexedDB` (`storage.saveProject`), and when authenticated runs a transactional Firestore write (`syncEngine.saveProjectToCloud`) to `users/{uid}/projects/{projectId}` and `users/{uid}/projects/{projectId}/versions/{versionId}`.

#### C. Gift Guide Studio Architecture (`/src/components/workspaces/GiftGuideWorkspace.tsx`, `/src/components/workspaces/giftGuide/ProductCard.tsx`, `/src/types/giftGuide.ts`)
- Gift Guide projects (`type: 'gift_guide'`) store their catalog in `project.giftGuideMeta.products: GiftProduct[]`.
- `GiftProduct` fields (`/src/types/giftGuide.ts`, lines 8–42):
  `id`, `name`, `subtitle`, `productType`, `category`, `priceRange`, `status`, `summary`, `whyItFits`, `historicalContext`, `designDetails`, `materialDetails`, `bestFor`, `buyerConsiderations`, `featuredAngle`, `customCopy`, `productUrl`, `canonicalUrl`, `imageUrl`, `anchorTextSuggestion`, `internalLinkTarget`, `notes`, `order`, `rawProductInfo`.
- Currently, `GiftGuideWorkspace.tsx` only allows creating empty product cards (`handleAddProduct`) or batch-fetching URLs (`handleBulkImportUrls`). **There is no picker to import saved `product_copy` projects into a Gift Guide.**

#### D. Other Dependencies on `productCopyMeta` Across the Codebase
- Verified by full codebase search:
  1. `/src/services/qualityControl.ts` (lines 125–151): `runDeterministicQC` checks `if (project.type === 'product_copy')` and verifies `project.productCopyMeta?.productName?.trim()` (critical if missing) and `project.productCopyMeta?.productType?.trim()` (warning if missing). **Must keep `productName` and `productType` populated.**
  2. `/src/utils/editingNotes.ts` (line 791): Reads `project.productCopyMeta?.standfirst` for the subtitle in exported editing briefs.
  3. `/src/services/versionHistoryService.ts` (lines 53, 81, 187, 369): Serializes, compares, snapshots, and restores `project.productCopyMeta`.
  4. `/src/services/storage.ts`: Initializes default `productCopyMeta` on `createProject('product_copy')`.

---

### 2.2 Reuse Map

| Capability | Existing implementation | Reuse directly, adapt, or build | Required changes | Regression risk |
| :--- | :--- | :--- | :--- | :--- |
| **Product project persistence, manual save, dirty-state guard, version history, and Firestore sync** | `WritingProject` (`type: 'product_copy'`), `App.tsx` (`handleManualSave`, `executeWithUnsavedGuard`), `versionHistoryService.ts`, `storage.ts`, `syncEngine.ts` | **Reuse directly** | None to core services. Store new Product Copy workflow fields additively inside `ProductCopyMetadata` (`project.productCopyMeta`). | **None** — `article` and `gift_guide` projects use separate branches and identical `WritingProject` container semantics. |
| **Saved Context Profiles & Defaults** (recipient, gift guide/occasion, audience, tone/context notes) | None for Product Copy (`storage.ts` manages global stores like `styleProfiles` and `internalLinks`) | **Build** (lightweight storage slice + UI selector in Stage 1 of `ProductCopyWorkspace`) | Add `ProductContextProfile` type in `/src/types/project.ts` and `getProductContextProfiles` / `saveProductContextProfile` / `deleteProductContextProfile` in `/src/services/storage.ts` (persisted in `localStorage` + `IndexedDB` and included in `backupService.ts`). | **Low** — isolated storage key (`sog_product_context_profiles_v1`); does not touch existing project or article keys. |
| **Mockup Image Upload (1+ images) & Client-Side Compression** | None in `ProductCopyWorkspace` (`Editor.tsx` only has generic inline image insert) | **Build** (inside `ProductCopyWorkspace.tsx` + image utility `/src/utils/productImageUtils.ts`) | Build multi-image drag-and-drop / file picker in Stage 1 of `ProductCopyWorkspace`. Resize/compress uploaded mockups client-side (max `1024px–1200px`, WebP/JPEG quality `0.80`) so base64 data URLs stay compact (~35–75 KB each) and never exceed `localStorage` or Firestore's 1 MiB document limit. | **None** — scoped strictly to `ProductCopyWorkspace`. |
| **Fourthwall / Product URL Scraping & Multimodal Visual Analysis** | `/src/services/productResearchService.ts`, `/src/server/urlMetadata.ts` (`handleAnalyzeProductResearch`), `/worker.ts` | **Adapt** (extend existing endpoint & service backward-compatibly) | 1. Enhance HTML/JSON-LD extraction in `urlMetadata.ts` & `worker.ts` to capture `price`, `currency`, `variants/sizes`, `materials`, `dimensions`, `colors`, and Fourthwall-specific DOM/JSON data.<br>2. Allow `POST /api/products/analyze-research` to accept `mockupImages?: Array<{ mimeType: string; data: string }>` alongside optional `url` and `contextProfile`.<br>3. Return structured epistemic buckets: `verifiedFacts` (from URL/JSON-LD), `visibleObservations` (from mockup vision analysis: visible text, graphic/imagery, garment/object style, colors), and `inferences` (creative positioning, recipient fit).<br>4. Allow proceeding with mockup image(s) alone when `url` is omitted. | **Low** — keep existing flat response fields (`productName`, `materials`, `features`, etc.) populated for backward compatibility with `GiftGuideWorkspace`'s `Quick Add by URLs`. |
| **Title Options & Creative Angles Generation + Selection** | `ProductCopyWorkspace.tsx` (`handleSuggestPositioning` + `headline` in `copy_fields`) | **Adapt** | Replace the 8-box `Positioning` tab and separate `headline` field with **Stage 3: Editorial Decisions**: generate 4–6 distinct Title Options and 3–5 Creative Angles (each with hook, core argument, and why it fits the mockup + recipient + context profile) in a single structured JSON call. Let the user click to select/edit the active Title (syncing to `project.title`, `meta.productName`, and `meta.headline`) and active Angle. | **None** — confined to `ProductCopyWorkspace.tsx` and `ProductCopyMetadata`. |
| **Copy Configuration (Word Count & Focused Writing Options)** | `project.writingControls` (`StyleSettingsDrawer.tsx`) + `ProductCopyWorkspace` | **Adapt** | Add an inline **Stage 4: Copy Configuration** bar inside `ProductCopyWorkspace` with quick word-count presets (`Short ~120w`, `Standard ~220w`, `Detailed ~350w`, or custom) and 2–3 focused toggles (`Structure Format`, `Include Internal Link Candidates`), syncing `wordCountTarget` with `project.writingControls.wordCountTarget` for QC compatibility. | **None** — only reads/updates `productCopyMeta.copyConfig` and `project.writingControls.wordCountTarget`. |
| **Editorial Brief & External Writing Prompt Generator (ChatGPT / Claude)** | `ProductCopyWorkspace.tsx` (`handleBuildExternalPrompt`) + `draftPackageService.ts` (style distillation & link formatting patterns) | **Adapt** | Upgrade `handleBuildExternalPrompt` into **Stage 5: Editorial Brief & Writing Prompt**: deterministically assemble (a) a concise human-readable **Editorial Brief** (Selected Title, Selected Angle, Verified Facts, Visible Mockup Details, Editorial Inferences, Context Profile, Word Count) and (b) a one-click copyable **Complete Writing Prompt** for ChatGPT/Claude that enforces Science of Gifts voice rules (no hype, no em dashes, strict epistemic boundary between verified facts vs. creative framing). | **None** — self-contained in `ProductCopyWorkspace.tsx` and `/src/utils/productCopyWorkflow.ts`. |
| **Rich-Text Editor, Passage-Anchored Written & Voice Notes, Revision Brief Export, and Internal Links** | `/src/components/Editor.tsx`, `/src/components/editingNotes/*`, `/src/utils/editingNotes.ts`, `/src/components/drawers/LinkOpportunitiesDrawer.tsx` | **Reuse directly** | **Zero changes to `Editor.tsx`, `editingNotes/*`, or `LinkOpportunitiesDrawer.tsx`**. In **Stage 6: Editing & Persistence**, surface the existing `<Editor>` directly in the workflow with a clean "Paste / Import External Draft into Editor" helper (converting pasted Markdown or HTML cleanly via `markdownToHtml` / `ensureSemanticHtml` and reconciling existing notes via `reconcileNotesWithHtmlContent`) and one-click access to `Links` drawer, `Voice Note`, `Write Note`, and `Export Editing Brief`. | **Zero** — protected article editing components are reused untouched. |
| **Gift Guide Studio Integration (Selecting Saved Products)** | `/src/components/workspaces/GiftGuideWorkspace.tsx`, `/src/components/workspaces/giftGuide/ProductCard.tsx`, `/src/types/giftGuide.ts` | **Adapt** | Add an **"Import Saved Product"** button and modal picker in `GiftGuideWorkspace.tsx` (next to `Add Product` and `Quick Add by URLs`). Lists all saved projects where `p.type === 'product_copy'`. Selecting one (or more) maps `productCopyMeta` + `project.content` into a `GiftProduct` record (`sourceProductProjectId: productProject.id`, `name`, `productUrl`, `imageUrl`, `priceRange`, `materialDetails`, `designDetails`, `bestFor`, `customCopy`, `featuredAngle`). Also allow re-syncing an imported `GiftProduct` if the source `product_copy` project was revised. | **Low** — additive UI and mapping function in `GiftGuideWorkspace.tsx` and optional `sourceProductProjectId?: string` in `GiftProduct`; zero impact on `ArticleWorkspace`. |

---

### 2.3 Simplification & Field Disposition Plan

| Existing Field / Tab in `ProductCopyWorkspace` | Current Location | Disposition (`Retain`, `Repurpose`, `Hide/Collapse`) | Rationale & Backward-Compatibility Safeguard |
| :--- | :--- | :--- | :--- |
| `productUrl`, `productName`, `productType`, `imageUrl` | Tab 2 (`facts`) | **Retain & Upgrade** (Stages 1 & 2) | Core product identity and QC requirements (`qualityControl.ts` checks `productName` and `productType`). Added support for uploaded `mockupImages` and `price`/`variants`. |
| `intendedRecipient`, `targetAudience`, `additionalFacts` | Tab 2 (`facts`) | **Retain & Accelerate via Context Profiles** (Stage 1) | Populated automatically when selecting a saved `ProductContextProfile`, with inline override fields per product. |
| `materials`, `features`, `dimensions`, `colors` | Tab 2 (`facts`) | **Retain inside `Verified Facts`** (Stage 2) | Populated from URL scrape/JSON-LD or manual entry; kept synchronized with top-level `meta.materials`, `meta.features`, `meta.dimensions`, `meta.colors` so legacy exports and Gift Guide mappings continue working. |
| `designConcept`, `historicalContext` | Tab 2 (`facts`) | **Repurpose into `Visible Observations` & `Editorial Inferences`** (Stage 2) | Clearly separated so visual observations from the mockup (`visibleText`, `designAndImagery`) are never confused with verified physical specs or AI-suggested framing (`historicalContext`, `designConcept`). |
| `rawProductInfo` | Tab 1 sidebar & Tab 2 | **Retain as Collapsible Raw Specs / Paste Notes** (Stage 1/2) | Useful when pasting raw vendor specs alongside a mockup or URL. |
| `positioning` (8 manual textareas in `ProductPositioning`) | Tab 3 (`positioning`) | **Repurpose & Simplify** (Stage 3) | Replaced in the primary UI by **Stage 3: Title Options & Creative Angles** (selectable cards + custom angle editor). `meta.positioning.keySellingAngle` is synced from the selected angle. If an older saved project has text in the other 7 legacy positioning fields, they remain accessible in a collapsed *"Legacy Positioning Notes"* disclosure. |
| `headline`, `standfirst`, `description`, `bestFor` + `Assemble Fields into Canvas` | Tab 4 (`copy_fields`) & Tab 1 sidebar | **Repurpose & Remove Destructive Overwrite** (Stages 3 & 6) | `headline` is unified with the selected Title in Stage 3. `<Editor>` (`project.content`) becomes the primary canvas for pasting/editing the product description in Stage 6 (removing the destructive `<h2>/<h3>` template overwrite in `handleCompileToEditor`). `standfirst` and `bestFor` remain lightweight optional fields used by `editingNotes.ts` and Gift Guide cards. |
| `generatedPrompt` (`Prompt Studio`) | Tab 4 (`copy_fields`) | **Retain & Upgrade** (Stage 5) | Promoted to a first-class workflow step producing both a structured **Editorial Brief** and a copyable **ChatGPT / Claude Writing Prompt**. |
| `variants` (`formalEditorial`, `emotionalStorytelling`, `conciseConversion`, `technicalHistorical`) | Tab 5 (`variants`) | **Hide from Primary Workflow** (Collapse if legacy data exists) | Generating 4 variants fired 4 sequential LLM calls and duplicated the editor workflow. Kept in `ProductCopyMetadata` type for schema compatibility; only shown in a collapsed legacy viewer if a previously saved project has non-empty variant text. |
| `seo` (`seoTitle`, `metaDescription`, `slug`, `primaryKeyword`) | Tab 6 (`seo`) | **Collapse into Optional Accordion** (Bottom of Stage 6) | Removed from top-level step navigation to reduce clutter, while remaining accessible in a collapsible *"SEO & Slug Metadata (Optional)"* section in Stage 6. |

---

### 2.4 Proposed End-to-End Data Flow & Additive Schema

#### Workflow Progression inside `ProductCopyWorkspace`
1. **Stage 1 — Product Input & Context Profile**:
   - User selects a saved **Context Profile** (or auto-loads their default profile) populating `intendedRecipient`, `giftGuideOrOccasion`, `targetAudience`, and `contextNotes`.
   - User uploads 1 or more **Product Mockup Images** (drag-and-drop or file picker, compressed client-side into `meta.mockupImages`) and/or enters an optional **Fourthwall / Product URL** (`meta.productUrl`).
2. **Stage 2 — Extraction & Visual Analysis**:
   - Clicking **Analyze Product** sends `{ url, mockupImages, contextProfile, rawProductInfo }` to `POST /api/products/analyze-research`.
   - If `url` is provided, the server scrapes HTML, JSON-LD (`Product`, `offers.price`, `offers.priceCurrency`), OpenGraph tags, and spec lists.
   - If `mockupImages` are provided, Gemini multimodal vision analyzes the mockup(s).
   - If **no URL** is provided, the endpoint runs multimodal vision analysis on `mockupImages` alone without erroring.
   - Results populate three distinct, editable UI cards in `meta.epistemicAnalysis`:
     1. **Verified Facts (Source Page / Specs)**: `price`, `materials`, `dimensions`, `colors`, `features`, `variants`.
     2. **Visible Observations (From Mockup)**: `visibleText` (exact wording on the item), `designAndImagery`, `garmentOrObjectStyle`, `visibleColors`.
     3. **Editorial Inferences (Suggested Context & Hypotheses)**: `designConcept`, `historicalOrCulturalContext`, `recipientResonance`, `editorialCaution`.
3. **Stage 3 — Editorial Decisions (Titles & Angles)**:
   - User clicks **Generate Titles & Creative Angles** (1 structured JSON call to Gemini using Stage 1 + Stage 2 data).
   - Displays 4–6 **Title Options** (`meta.titleOptions`) and 3–5 **Creative Angles** (`meta.angleOptions`).
   - User clicks a Title (or edits it inline -> updates `project.title`, `meta.productName`, and `meta.headline`) and selects/customizes a Creative Angle (`meta.selectedAngle`).
4. **Stage 4 — Copy Configuration**:
   - User selects a **Target Word Count** preset (`Short: 100–150 words`, `Standard: 200–300 words`, `Detailed: 350–500 words`, or custom number) and streamlined options (`structureFormat: 'narrative_paragraphs' | 'narrative_plus_specs'`, `includeInternalLinks: boolean`).
5. **Stage 5 — Editorial Brief & Writing Prompt**:
   - Deterministic builder (`buildProductEditorialBriefAndPrompt`) generates:
     - **Concise Editorial Brief**: Clean summary of Product, Selected Title, Selected Angle, Target Recipient/Guide Context, Verified Facts, Visible Mockup Details, and Inferences.
     - **Complete External Writing Prompt (for ChatGPT / Claude)**: Self-contained prompt instructing the external model to write the product copy at the target word count using the selected title and angle, strictly honoring verified facts vs. inferences, applying active Science of Gifts style characteristics, and optionally weaving in relevant internal links from `storage.getInternalLinks()`.
   - User clicks **Copy Prompt for ChatGPT / Claude** (with an optional secondary button to generate an initial draft directly in-app if desired).
6. **Stage 6 — Editing, Anchored Notes, Internal Links & Persistence**:
   - User brings the externally written copy into the shared `<Editor>` (either by pasting directly into `<Editor>` or clicking **Paste / Import External Copy**, which converts Markdown or HTML via `markdownToHtml` + `ensureSemanticHtml` and preserves/reconciles any existing `project.editingNotes`).
   - User refines prose in `<Editor>`, highlights passages to attach **Written Notes** or **Voice Notes** (`EditingNoteModal`), exports a revision brief (`ExportEditingBriefModal`), and adds **Internal Links** via the editor toolbar or the `Links` drawer (`LinkOpportunitiesDrawer`).
   - Clicking **Save** in the top navigation bar runs `handleManualSave()` in `App.tsx`, saving a version snapshot and syncing to local storage, IndexedDB, and Firestore.
7. **Stage 7 — Gift Guide Studio Integration**:
   - In `GiftGuideWorkspace.tsx`, user clicks **Import Saved Product**, selects one or more saved `product_copy` projects from a modal picker, and imports them as `GiftProduct` cards (`sourceProductProjectId: productProject.id`) with their saved title, edited copy (`project.content`), primary mockup/product image, price, specs, and URL.

#### Additive TypeScript Schema Changes (`/src/types/project.ts` & `/src/types/giftGuide.ts`)
```ts
export interface ProductMockupImage {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string; // Compressed client-side (max ~1024-1200px WebP/JPEG)
  isPrimary?: boolean;
  width?: number;
  height?: number;
}

export interface ProductContextProfile {
  id: string;
  name: string;
  intendedRecipient: string;
  giftGuideOrOccasion: string;
  targetAudience: string;
  contextNotes: string;
  defaultWordCount?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductEpistemicAnalysis {
  verifiedFacts: {
    price?: string;
    currency?: string;
    availability?: string;
    materials?: string;
    dimensions?: string;
    colors?: string;
    features?: string;
    variants?: string;
    additionalSpecs?: string;
    sourceUrl?: string;
  };
  visibleObservations: {
    visibleText?: string;
    designAndImagery?: string;
    garmentOrObjectStyle?: string;
    visibleColors?: string;
    visualDetails?: string;
  };
  inferences: {
    designConcept?: string;
    historicalOrCulturalContext?: string;
    recipientResonance?: string;
    editorialCaution?: string;
  };
}

export interface ProductAngleOption {
  id: string;
  title: string;
  hook: string;
  coreArgument: string;
  whyItFitsRecipient: string;
  suggestedEmphasis: string[];
}

export interface ProductCopyConfig {
  wordCountPreset: 'short' | 'standard' | 'detailed' | 'custom';
  targetWordCount: string; // e.g. '100-150 words', '200-300 words', '350-500 words'
  structureFormat: 'flowing_narrative' | 'narrative_plus_specs' | 'concise_card';
  includeInternalLinks: boolean;
  customInstructions?: string;
}
```
All new fields on `ProductCopyMetadata` (`mockupImages?`, `contextProfileId?`, `giftGuideContext?`, `price?`, `variantsText?`, `epistemicAnalysis?`, `titleOptions?`, `angleOptions?`, `selectedAngleId?`, `selectedAngle?`, `copyConfig?`, `editorialBriefText?`) are optional (`?`) so existing saved projects deserialize without migration errors.

---

### 2.5 Data-Persistence Safeguards & API/AI Cost Controls

#### A. Data-Persistence & Firestore Document Size Safeguards
1. **Client-Side Image Compression Before State/Storage Persistence**:
   - Raw PNG mockups from Fourthwall or design tools are frequently 2–8 MB each, which would immediately blow past `localStorage` (~5 MB total quota) and Firestore's hard **1 MiB (1,048,576 bytes) per-document limit** (`users/{uid}/projects/{projectId}`).
   - **Safeguard**: When a user uploads mockup image(s), a client-side canvas resizer (`/src/utils/productImageUtils.ts`) downscales dimensions to a maximum of `1024px` on the longest edge and encodes to WebP/JPEG at `0.80` quality (~35–70 KB per image), capping a project at up to 4 compressed mockups (~250 KB total).
2. **Omitting Heavy Base64 Mockup Arrays from Embedded Version History**:
   - `syncEngine.ts` embeds up to `MAX_EMBEDDED_CLOUD_VERSIONS = 15` snapshots on the parent project document in addition to the `versions` subcollection.
   - **Safeguard**: If `productCopyMeta.mockupImages` were duplicated across 15 embedded `ProjectVersionSnapshot.structuredState` entries, 15 × 200 KB would equal 3 MB and fail Firestore writes!
   - Therefore, in `versionHistoryService.ts` (`extractStructuredState`), we will keep `productCopyMeta` in the dirty-check fingerprint (using mockup image IDs/hashes rather than repeating multi-megabyte data URLs inside every historical version snapshot) or strip raw base64 `dataUrl` strings from historical snapshots while keeping `mockupImages` intact on the live `WritingProject.productCopyMeta`. This guarantees Firestore transactional saves never exceed 1 MiB.
3. **Non-Destructive Editor Import**:
   - Importing or pasting external copy from ChatGPT/Claude into Stage 6 `<Editor>` will create a `before_ai_rewrite` version snapshot if `project.content` is non-empty and will run `reconcileNotesWithHtmlContent(newHtml, project.editingNotes)` so passage-anchored notes are never silently wiped.

#### B. API & AI Cost Controls
1. **Deterministic Local Assembly for Stage 5 (Zero LLM Calls for Prompt/Brief Generation)**:
   - Generating the **Editorial Brief** and the **ChatGPT/Claude Writing Prompt** in Stage 5 will be **100% deterministic local string assembly** from Stages 1–4 (`buildProductEditorialBriefAndPrompt`), requiring **0 API calls** and executing instantaneously.
2. **Single Combined Multimodal Call for Stage 2**:
   - URL scraping + mockup visual analysis in Stage 2 executes in **1 backend request** (`POST /api/products/analyze-research`) with `temperature: 0.2` and compressed image payloads.
3. **Single Combined Call for Stage 3 (Titles + Angles Together)**:
   - Generating Title Options (4–6) and Creative Angles (3–5) in Stage 3 executes in **1 structured JSON call** rather than separate requests.
4. **Elimination of the 4-Call Sequential Variants Loop**:
   - Removing the legacy `Generate All 4 Variants` button from the primary workflow eliminates the 4 sequential LLM calls that previously ran in Tab 5.
5. **User-Initiated Actions Only**:
   - Zero background/automatic LLM calls on keystrokes, tab switches, or project load. Every AI action requires an explicit button click with a visible loading state and abort/error handling.

---

### 2.6 Phased Implementation Plan

#### Phase 1: Additive Data Types, Context Profiles Storage & Multimodal Backend Analysis
- **Files to Create/Modify**:
  - `/src/types/project.ts`: Add `ProductMockupImage`, `ProductContextProfile`, `ProductEpistemicAnalysis`, `ProductAngleOption`, `ProductCopyConfig`, and optional fields on `ProductCopyMetadata`.
  - `/src/utils/productImageUtils.ts` *(new)*: Client-side image resize/compression (`compressMockupImageFile`) and base64 extraction for Gemini vision parts.
  - `/src/services/storage.ts` & `/src/services/backupService.ts`: Add `getProductContextProfiles`, `saveProductContextProfile`, `deleteProductContextProfile`, and default profile seeding under `sog_product_context_profiles_v1`.
  - `/src/services/productResearchService.ts`, `/src/server/urlMetadata.ts`, and `/worker.ts`: Upgrade `/api/products/analyze-research` to:
    1. Accept `{ url?, mockupImages?, contextProfile?, rawProductInfo?, modelOverride? }`.
    2. Extract `price`, `currency`, `availability`, and `variants` from JSON-LD / Fourthwall HTML when `url` is provided.
    3. Pass `mockupImages` (`inlineData: { mimeType, data }`) to Gemini when present.
    4. Support mockup-only analysis when `url` is empty.
    5. Return `epistemicAnalysis: { verifiedFacts, visibleObservations, inferences }` alongside legacy flat fields.
  - `/src/services/versionHistoryService.ts`: Ensure `extractStructuredState` stores lightweight mockup metadata references inside historical version snapshots so repeated manual saves with base64 mockups never bloat `localStorage` or Firestore documents past 1 MiB, while preserving full dirty-state detection on `productCopyMeta`.

#### Phase 2: Streamlined Product Copy Workspace (Stages 1–5)
- **Files to Create/Modify**:
  - `/src/utils/productCopyWorkflow.ts` *(new)*: Pure, testable functions for building the Stage 5 Editorial Brief and external ChatGPT/Claude prompt (`buildProductEditorialBriefAndPrompt`), syncing epistemic fields with legacy flat fields, and mapping saved `product_copy` projects to `GiftProduct` items.
  - `/src/components/workspaces/ProductCopyWorkspace.tsx`: Replace the 6-tab layout with the streamlined **Product Copy Studio** workflow:
    - **Stage 1**: Context Profile bar (select, create, edit, set default) + Mockup uploader (multi-image with primary badge & preview) + optional Fourthwall/Product URL input.
    - **Stage 2**: Epistemic Analysis panel with 3 clear, editable sections: **Verified Facts** (with source badge), **Visible Mockup Observations**, and **Editorial Inferences**.
    - **Stage 3**: **Editorial Decisions** panel to generate, select, and edit **Title Options** and **Creative Angles**.
    - **Stage 4**: **Copy Configuration** bar (word count presets + structure format + internal link toggle).
    - **Stage 5**: **Editorial Brief & External Writing Prompt** viewer with one-click **Copy Prompt for ChatGPT / Claude** and **Copy Brief**.

#### Phase 3: Editor Handoff, Revision Notes, Internal Links & Persistence (Stage 6)
- **Files to Modify**:
  - `/src/components/workspaces/ProductCopyWorkspace.tsx`
- **Deliverables**:
  - **Stage 6 (Writing Studio Editor & Revision)**:
    - Dedicated **Paste / Load External Copy into Editor** modal/action that accepts Markdown or HTML from ChatGPT/Claude, converts it via `markdownToHtml` + `ensureSemanticHtml`, creates a safety version checkpoint if replacing existing text, and reconciles `project.editingNotes`.
    - Direct access to the shared `<Editor>` (`Voice Note`, `Write Note`, `Show/Hide Notes`, `Export Editing Brief`, inline `Internal Link` insertion) plus top-bar drawers (`Links` opportunities drawer, `Check` QC drawer, `History` version history drawer).
    - Collapsible optional accordion at bottom for `SEO & Slug Metadata` and any legacy fields on older projects.

#### Phase 4: Gift Guide Studio Integration (Stage 7)
- **Files to Modify**:
  - `/src/types/giftGuide.ts`: Add optional `sourceProductProjectId?: string` and `mockupImages?: string[]` to `GiftProduct`.
  - `/src/components/workspaces/GiftGuideWorkspace.tsx` & `/src/components/workspaces/giftGuide/ProductCard.tsx`:
    - Add **Import Saved Product** button & modal in `GiftGuideWorkspace.tsx` listing all non-deleted `product_copy` projects from `storage.getProjects()`.
    - Map selected `product_copy` project(s) into `GiftProduct` entries (`name`, `productType`, `priceRange`, `productUrl`, `imageUrl`, `materialDetails`, `designDetails`, `historicalContext`, `bestFor`, `featuredAngle`, and `customCopy` from `project.content`).
    - Add a **Refresh from Saved Product** action on `ProductCard.tsx` when `product.sourceProductProjectId` matches an existing `product_copy` project.

---

### 2.7 Verification Plan & Protected Article Workflow Regression Tests

#### A. Automated Unit & Integration Tests
1. **New Unit Test Suite (`/src/utils/__tests__/productCopyWorkflow.test.ts`)**:
   - Verify epistemic separation structure (`verifiedFacts`, `visibleObservations`, `inferences`) for URL+Mockup, Mockup-only, and URL-only inputs.
   - Verify `buildProductEditorialBriefAndPrompt` outputs explicit sections distinguishing verified specs from visible observations and inferences, includes selected Title, Angle, Context Profile, and Target Word Count, and enforces Science of Gifts editorial constraints.
   - Verify `mapProductCopyProjectToGiftProduct` accurately transfers saved title, HTML/plain copy, primary image, price, specs, and `sourceProductProjectId`.
   - Verify `versionHistoryService` dirty-state detection (`hasProjectUnsavedChanges`) triggers when any `productCopyMeta` field changes, while keeping snapshot payload size bounded.
2. **Existing Automated Suites (Must Pass 100%)**:
   - `npm test` (`src/utils/__tests__/editorialDevelopmentWorkflow.test.ts` — 15/15 tests).
   - `npx tsx src/scripts/test-editing-notes.ts` (verifies ProseMirror note anchoring, offset mapping, disambiguation, speech transcript cleanup, and consolidated brief export).
   - `npx tsx src/scripts/test-citation-studio.ts` (verifies academic citation & research claim workflows).
   - `npm run lint` (`tsc --noEmit`) and `npm run build` (`vite build`).

#### B. Protected Article Workflow Regression Checklist
Because `<Editor>`, `editingNotes.ts`, `LinkOpportunitiesDrawer.tsx`, `ArticleWorkspace.tsx`, `EditorialDevelopmentWorkspace.tsx`, and `syncEngine.ts` are protected subsystems:
1. **Zero-Touch Guarantee on Core Article Files**:
   - `/src/components/workspaces/ArticleWorkspace.tsx`, `/src/components/workspaces/EditorialDevelopmentWorkspace.tsx`, `/src/components/Editor.tsx`, `/src/components/editingNotes/*`, `/src/utils/editingNotes.ts`, `/src/components/drawers/LinkOpportunitiesDrawer.tsx`, and `/src/services/articleExport.ts` **will not be modified**.
2. **End-to-End Article Regression Checks**:
   - Create/open an `article` project -> verify Idea -> 5 Angles -> Direction -> Editorial Brief -> Outline Studio -> Draft Package in `EditorialDevelopmentWorkspace`.
   - Open `ArticleWorkspace` -> edit rich text in `<Editor>`, attach a Written Note and a Voice Note, toggle note markers, click `Export Editing Brief`, open `Links` drawer and apply an internal link, run `Quality Control`, and click `Save` -> confirm version snapshot creation and cloud/local persistence work identically to baseline.

---

### 2.8 Recommended First Implementation Stage & Acceptance Criteria

- **Recommended First Implementation Stage**: **Phase 1 + Phase 2** (Data Schema, Context Profiles, Mockup Upload + URL/Vision Epistemic Analysis, Titles/Angles Generation, Copy Configuration, and Editorial Brief + External Writing Prompt).
- **Exact Acceptance Criteria for Stage 1**:
  1. User can create, edit, delete, and set a default **Context Profile** that persists in storage and auto-fills recipient, gift guide/occasion, audience, and context notes on new Product Copy projects.
  2. User can upload 1+ product mockup images (compressed client-side to safe dimensions/byte size) and optionally provide a Fourthwall/product URL.
  3. Clicking **Analyze Product** works both **with a URL + mockup(s)** and **with mockup(s) alone (no URL)**, populating three distinct, editable sections: **Verified Facts** (including price, materials, dimensions, colors, specs), **Visible Observations** (design, text on mockup, colors), and **Editorial Inferences**.
  4. User can generate, select, and edit **Title Options** and **Creative Angles** grounded in the mockup, verified facts, and context profile.
  5. User can select a **Word Count Target** and writing structure option, view a concise **Editorial Brief**, and copy a complete **Writing Prompt** for ChatGPT or Claude in one click.
  6. All existing tests (`npm test`, `test-editing-notes.ts`, `test-citation-studio.ts`, `npm run lint`, `npm run build`) pass with zero regressions to the article workflow.

---

## 3. Part II: Investigation of Five Unexpected File Changes

### 3.1 Timeline & Recovery Sources for Pre-Change Versions

1. **Why and When the Five Files Were Modified**:
   - Prior to your Phase 0 architecture audit request, the session received an initial error-recovery request (`"Fix the errors in the app"` with `error 0: Pre-warming failed: dev server process died...` and the Vite 8 `__dirname` deprecation warning).
   - In response to that initial error-recovery request (Turn 1), five files were edited:
     1. `/vite.config.ts`
     2. `/server.ts`
     3. `/worker.ts`
     4. `/src/utils/editorialDevelopmentUtils.ts`
     5. `/package.json`
   - **No files were modified during your Phase 0 Read-Only Architecture Audit turn**, and **no application files have been modified in the current turn**.

2. **Availability & Reliability of Pre-Change Versions**:
   - **Git History**: Unavailable — `/app/applet` does not contain a `.git` directory (`fatal: not a git repository`).
   - **Initial Session Context & Tool Call Logs (100% Reliable)**: The exact pre-change contents of `vite.config.ts`, `server.ts`, `package.json`, and the top of `worker.ts` were captured in the initial workspace snapshot at session start, and the exact `TargetContent` / `ReplacementContent` blocks for all 5 files are recorded verbatim in the Turn 1 tool logs.
   - **Project Archive (`/public/assets/aistudio/writing-studio_0660b0fc.zip`)**: Inspected in-memory (read-only). It contains the exact pre-change versions of `vite.config.ts`, `server.ts`, and `package.json`. *(Note: that `.zip` archive was created at an earlier milestone before `src/utils/editorialDevelopmentUtils.ts` existed, so it does not contain `src/utils/editorialDevelopmentUtils.ts` or the latest `worker.ts`.)*

---

### 3.2 Exact Diffs & File-by-File Analysis

#### 1. `/vite.config.ts`
```diff
--- a/vite.config.ts (Pre-Change)
+++ b/vite.config.ts (Current)
@@ -9,7 +9,7 @@
     plugins: [react(), tailwindcss()],
     resolve: {
       alias: {
-        '@': path.resolve(__dirname, '.'),
+        '@': path.resolve(import.meta.dirname, '.'),
       },
     },
     server: {
```
- **Exact Change**: Replaced `__dirname` with `import.meta.dirname` on line 11.
- **Error It Was Intended to Fix**: Vite 8 (`"vite": "^8.3.0"`) emitted a startup warning under its native config loader:
  `(!) Your Vite config uses features that are unsupported by configLoader: 'native' ... - '__dirname' (vite.config.ts:11:27). Use 'import.meta.dirname' instead.`
- **Runtime Behavior Impact Beyond the Fix**: None in Node 20.11+ / Node 22 (`import.meta.dirname` resolves to the exact same directory path as `__dirname`).

---

#### 2. `/server.ts`
```diff
--- a/server.ts (Pre-Change)
+++ b/server.ts (Current)
@@ -7,15 +7,16 @@
 import express from 'express';
+import { createServer as createHttpServer } from 'http';
 import path from 'path';
 import { fileURLToPath } from 'url';
 import dotenv from 'dotenv';
-import { handleApiRequest } from './worker';
+import { handleApiRequest } from './worker.ts';
 
-dotenv.config();
+dotenv.config({ quiet: true });
 
 const __filename = fileURLToPath(import.meta.url);
 const __dirname = path.dirname(__filename);
 
 const app = express();
-const PORT = parseInt(process.env.PORT || '3000', 10);
+const PORT = 3000;
 
 app.use(express.json({ limit: '50mb' }));
@@ -45,10 +46,16 @@
 // Vite dev server middleware or static serve in production
 async function startServer() {
+  const httpServer = createHttpServer(app);
   const isProd = process.env.NODE_ENV === 'production';
   if (!isProd) {
     const { createServer: createViteServer } = await import('vite');
+    const disableHmr = process.env.DISABLE_HMR === 'true';
     const vite = await createViteServer({
-      server: { middlewareMode: true },
+      server: {
+        middlewareMode: true,
+        hmr: disableHmr ? false : { server: httpServer },
+        watch: disableHmr ? null : {},
+      },
       appType: 'spa',
     });
     app.use(vite.middlewares);
@@ -60,7 +67,7 @@
     });
   }
 
-  app.listen(PORT, '0.0.0.0', () => {
+  httpServer.listen(PORT, '0.0.0.0', () => {
     console.log(`Science of Gifts Writing Studio running at http://0.0.0.0:${PORT}`);
   });
 }
```
- **Exact Changes**:
  1. Changed `import { handleApiRequest } from './worker';` to `'./worker.ts'`.
  2. Passed `{ quiet: true }` to `dotenv.config()`.
  3. Replaced `const PORT = parseInt(process.env.PORT || '3000', 10);` with `const PORT = 3000;`.
  4. Created an explicit `httpServer = createHttpServer(app)` and passed `hmr: disableHmr ? false : { server: httpServer }` and `watch: disableHmr ? null : {}` to `createViteServer(...)`, then called `httpServer.listen(...)`.
- **Error It Was Intended to Fix**:
  1. Prevent Vite's middleware mode from attempting to open a separate WebSocket port (`24678`) when `DISABLE_HMR` is not set or during rapid container restarts.
  2. Allow `node server.ts` (native Node 22 ESM loader) to resolve `./worker.ts`.
- **Runtime Behavior Impact Beyond the Fix**:
  - **Ignores `process.env.PORT`**: Hardcoding `const PORT = 3000` prevents overriding the port via `PORT=xxxx` in local or custom hosting environments.
  - **Duplicates `vite.config.ts` HMR config**: `vite.config.ts` already configured `hmr` and `watch` based on `process.env.DISABLE_HMR`.

---

#### 3. `/worker.ts`
```diff
--- a/worker.ts (Pre-Change)
+++ b/worker.ts (Current)
@@ -9,4 +9,4 @@
 import {
   validateBriefGenerationInputs,
   validateAndNormalizeEditorialBrief,
-} from './src/utils/editorialDevelopmentUtils';
+} from './src/utils/editorialDevelopmentUtils.ts';
```
- **Exact Change**: Added `.ts` extension to the import path `./src/utils/editorialDevelopmentUtils.ts` on line 12.
- **Error It Was Intended to Fix**: Native Node 22 execution (`node server.ts`) fails with `ERR_MODULE_NOT_FOUND` when importing relative TypeScript files without an explicit `.ts` extension.
- **Runtime Behavior Impact Beyond the Fix**: None. All 1,724 lines of API routing and Worker logic in `worker.ts` are untouched.

---

#### 4. `/src/utils/editorialDevelopmentUtils.ts`
```diff
--- a/src/utils/editorialDevelopmentUtils.ts (Pre-Change)
+++ b/src/utils/editorialDevelopmentUtils.ts (Current)
@@ -7,10 +7,10 @@
-import {
+import type {
   WritingProject,
   EditorialAngle,
   EditorialDirection,
   EditorialDevelopment,
   StructuredEditorialBrief,
   BriefReference,
   AngleRole,
-} from '../types/project';
-import { EditorialIdea } from '../types/ideaGenerator';
+} from '../types/project.ts';
+import type { EditorialIdea } from '../types/ideaGenerator.ts';
```
- **Exact Change**: Changed the two top-level imports (lines 7–16) to `import type` and appended `.ts` extensions (`../types/project.ts`, `../types/ideaGenerator.ts`).
- **Error It Was Intended to Fix**: When `node server.ts` imports `worker.ts`, which in turn imports `src/utils/editorialDevelopmentUtils.ts`, Node 22's native `--experimental-strip-types` loader throws `ERR_INVALID_TYPESCRIPT_SYNTAX` on value imports of pure TypeScript interfaces (`WritingProject`, `EditorialIdea`, etc.) and `ERR_MODULE_NOT_FOUND` on extensionless relative imports.
- **Runtime Behavior Impact Beyond the Fix**: **None.** Every imported symbol on lines 7–16 is a pure TypeScript interface or type alias that is erased at compile time. Lines 18–504 of `src/utils/editorialDevelopmentUtils.ts` are completely unchanged.

---

#### 5. `/package.json`
```diff
--- a/package.json (Pre-Change)
+++ b/package.json (Current)
@@ -8,7 +8,8 @@
   "scripts": {
     "dev": "tsx server.ts",
     "build": "vite build",
-    "start": "tsx server.ts",
+    "start": "node server.ts",
     "preview": "vite preview",
     "clean": "rm -rf dist server.js",
-    "lint": "tsc --noEmit"
+    "lint": "tsc --noEmit",
+    "test": "tsx --test src/utils/__tests__/editorialDevelopmentWorkflow.test.ts"
   },
```
- **Exact Changes**:
  1. Changed `"start": "tsx server.ts"` to `"start": "node server.ts"`.
  2. Added `"test": "tsx --test src/utils/__tests__/editorialDevelopmentWorkflow.test.ts"`.
  3. **Zero changes to `dependencies` or `devDependencies`.**
- **Error It Was Intended to Fix**: Aligned `"start"` with the generic AI Studio environment convention (`"start": "node server.ts"`), which in turn caused `node server.ts` to require `.ts` import extensions and `import type` in `server.ts`, `worker.ts`, and `editorialDevelopmentUtils.ts`.
- **Runtime Behavior Impact Beyond the Fix**:
  - **Yes**: `npm start` now runs `node server.ts` (Node's native strip-types loader) instead of `tsx server.ts`. If any file imported by `server.ts` or `worker.ts` in the future uses extensionless imports or non-erasable TypeScript syntax, `node server.ts` will fail whereas `tsx server.ts` would succeed.

---

### 3.3 Specific Technical Assessments

1. **Server Port & Vite HMR Changes (`server.ts`, `vite.config.ts`)**:
   - In `vite.config.ts`, replacing `__dirname` with `import.meta.dirname` is clean, standards-compliant in Node 20.11+/22, and resolves the Vite 8 deprecation warning.
   - In `server.ts`, hardcoding `const PORT = 3000` (removing `process.env.PORT`) and duplicating Vite's `hmr`/`watch` configuration was **unnecessary** because `process.env.PORT || '3000'` already defaults to `3000` and `vite.config.ts` already configures `hmr` and `watch`.
2. **TypeScript Import Changes (`server.ts`, `worker.ts`, `editorialDevelopmentUtils.ts`)**:
   - The `.ts` file extensions and `import type` changes were **only required because `"start"` in `package.json` was changed from `"tsx server.ts"` to `"node server.ts"`**.
   - `tsx`, Vite, Wrangler (esbuild), and TypeScript (`"moduleResolution": "bundler"`, `"allowImportingTsExtensions": true` in `tsconfig.json`) all handle both extensionless imports and `.ts` extensions seamlessly.
3. **Dependency Changes (`package.json`)**:
   - **None.** All 22 `dependencies` and 10 `devDependencies` in `package.json` are identical to the original pre-change `package.json`.
4. **Change to `src/utils/editorialDevelopmentUtils.ts`**:
   - Strictly limited to lines 7–16 (`import` -> `import type` and adding `.ts` to `../types/project.ts` and `../types/ideaGenerator.ts`). Zero executable code or logic was touched.

---

### 3.4 Environment Impact Assessment

| Target Environment / Subsystem | Impact of the 5 Modified Files | Assessment |
| :--- | :--- | :--- |
| **AI Studio Preview & Local Development (`npm run dev` -> `tsx server.ts`)** | Runs on port 3000 without the Vite 8 `__dirname` warning. However, if a developer runs `PORT=4000 npm run dev` locally, `server.ts` will ignore `PORT=4000` because `PORT` was hardcoded to `3000`. | Restoring `const PORT = parseInt(process.env.PORT || '3000', 10);` in `server.ts` is recommended so both AI Studio (port 3000) and custom local ports work. |
| **Production Start (`npm start`)** | Currently runs `node server.ts` instead of `tsx server.ts`. While `node server.ts` currently starts cleanly, `tsx server.ts` is far more resilient to standard bundler-style extensionless TypeScript imports across shared `src/` utilities. | Reverting `"start"` in `package.json` back to `"tsx server.ts"` (or keeping `"test"` while restoring `"start": "tsx server.ts"`) is safer for shared server/client TypeScript modules. |
| **Cloudflare Worker Deployment (`wrangler.json` -> `worker.ts`)** | Wrangler bundles `worker.ts` using `esbuild`, which natively supports `.ts` import extensions and strips `import type` declarations. | Does not break Cloudflare Worker builds, though reverting `worker.ts` and `editorialDevelopmentUtils.ts` to extensionless imports is cleaner once `"start": "tsx server.ts"` is restored. |
| **Existing Article-Development Workflow** | Zero executable code in `editorialDevelopmentUtils.ts`, `worker.ts`, or any React component was changed; all 15 unit tests in `editorialDevelopmentWorkflow.test.ts` pass. | **Zero impact** on article development, brief generation, outline studio, or editing. |

---

### 3.5 Checks Actually Executed and Their Results

| Check / Command | Scope | Result | Limitation of Check |
| :--- | :--- | :--- | :--- |
| `npm run lint` (`tsc --noEmit`) | Full TypeScript project type-checking | **Passed** (exit code `0`, 0 errors) | Verifies static types and imports only; does not execute code. |
| `npm run build` (`vite build`) | Frontend SPA production bundle (`dist/`) | **Passed** (exit code `0`) | Bundles client application only; does not test `server.ts`, `worker.ts`, or runtime UI behavior. |
| `restart_dev_server` (`tsx server.ts`) | Express + Vite dev server startup | **Passed** (listening on `http://0.0.0.0:3000`, no Vite 8 warning) | Confirms server startup only; does not test individual API routes under load. |
| `npm test` (`tsx --test src/utils/__tests__/editorialDevelopmentWorkflow.test.ts`) | 15 unit tests for Editorial Development workflow | **Passed** (`15 passed, 0 failed`) | Tests pure workflow & brief validation functions in `editorialDevelopmentUtils.ts`. |

---

### 3.6 Recommended Next Steps for the Five Modified Files

Before beginning Phase 1 of the Product Copy implementation, I recommend:
1. **Revert `server.ts`, `worker.ts`, `src/utils/editorialDevelopmentUtils.ts`, and `package.json` (`"start": "tsx server.ts"`)** back to their exact pre-change state (while optionally keeping `"test"` in `package.json` and the 1-line `import.meta.dirname` fix in `vite.config.ts` so Vite 8 does not emit a warning).
2. Confirm your answers to the Unresolved Questions below so we can proceed cleanly into Phase 1.

---

## 4. Part III: Unresolved Questions

1. **Reverting the 5 Modified Files**: Would you like me to revert `server.ts`, `worker.ts`, `src/utils/editorialDevelopmentUtils.ts`, and `package.json` (and either revert or keep the 1-line `import.meta.dirname` change in `vite.config.ts`) as the very first step before any Product Copy work begins?
2. **Context Profile Fields (Stage 1)**: I plan to include `Profile Name`, `Intended Recipient`, `Gift Guide / Occasion`, `Target Audience`, and `Editorial Context / Tone Notes` (with an `isDefault` toggle so your primary profile auto-loads). Are there any additional fields from your separate *Product Studio* app that should be part of a saved Context Profile?
3. **Copy Configuration Options (Stage 4)**: I plan to include **Target Word Count** (`Short ~120w`, `Standard ~220w`, `Detailed ~350w`, or custom) plus **Structure Format** (`Flowing Narrative Paragraphs` vs. `Narrative Intro + Specification Bullets`) and **Include Internal Link Candidates** (`On/Off`). Do these match the writing options you want carried over from *Product Studio*?
4. **Gift Guide Primary Image Preference (Stage 7)**: When importing a saved `product_copy` project that has both an uploaded mockup image and a scraped Fourthwall product URL image into a Gift Guide, should the `GiftProduct` card default to the **primary uploaded mockup image** or the **Fourthwall URL image**?
