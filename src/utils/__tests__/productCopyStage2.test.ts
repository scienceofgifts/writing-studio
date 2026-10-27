import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { storage } from '../../services/storage';
import {
  createVersionSnapshot,
  restoreVersionSnapshot,
  hasProjectUnsavedChanges,
} from '../../services/versionHistoryService';
import {
  validateProductImageFile,
  compressProductMockupDataUrl,
  extractBase64AndMimeFromDataUrl,
  setPrimaryMockupImage,
  removeMockupImage,
} from '../productImageUtils';
import {
  extractProductFactsFromHtml,
  buildProductAnalysisPromptAndParts,
  normalizeProductResearchOutput,
} from '../productResearchUtils';
import { analyzeProductResearch } from '../../services/productResearchService';
import { handleApiRequest } from '../../../worker';
import { ProductMockupImage } from '../../types/project';

// Minimal valid 1x1 PNG data URL for deterministic tests
const SAMPLE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Minimal LocalStorage polyfill for Node environment
const createMemoryLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

describe('Stage 2: Product Input, Context Profiles, Mockup Compression, and Epistemic Analysis', () => {
  beforeEach(() => {
    const memStorage = createMemoryLocalStorage();
    (globalThis as any).localStorage = memStorage;
  });

  describe('1. Product Context Profiles CRUD & Default Profile Application', () => {
    it('loads default profiles and supports create, edit, set-default, and delete', () => {
      const initialProfiles = storage.getProductContextProfiles();
      assert.equal(initialProfiles.length >= 2, true);
      assert.equal(initialProfiles.some((p) => p.isDefault), true);

      // Create a new profile and mark as default
      const created = storage.saveProductContextProfile({
        name: 'Astronomy & Observatory Gifts',
        intendedRecipient: 'Amateur astronomers and astrophysics students',
        giftGuideOrOccasion: 'Stargazer Holiday Guide',
        targetAudience: 'Readers fascinated by celestial mechanics and brass optics',
        contextNotes: 'Reference historical star charts and avoid generic space puns.',
        isDefault: true,
      });

      assert.ok(created.id);
      assert.equal(created.isDefault, true);

      const afterCreate = storage.getProductContextProfiles();
      const defaults = afterCreate.filter((p) => p.isDefault);
      assert.equal(defaults.length, 1);
      assert.equal(defaults[0].id, created.id);

      // Edit the profile
      const updated = storage.saveProductContextProfile({
        id: created.id,
        name: 'Astronomy & Optics Collection',
        intendedRecipient: created.intendedRecipient,
        giftGuideOrOccasion: created.giftGuideOrOccasion,
        targetAudience: created.targetAudience,
        contextNotes: 'Updated tone note: emphasize optical clarity.',
        isDefault: true,
      });
      assert.equal(updated.name, 'Astronomy & Optics Collection');
      assert.equal(updated.contextNotes.includes('emphasize optical clarity'), true);

      // Change default to another profile
      const firstSeedId = initialProfiles[0].id;
      storage.setDefaultProductContextProfile(firstSeedId);
      assert.equal(storage.getDefaultProductContextProfile()?.id, firstSeedId);

      // Delete created profile
      storage.deleteProductContextProfile(created.id);
      assert.equal(storage.getProductContextProfileById(created.id), undefined);
    });

    it('automatically applies the default Product Context Profile when creating a new product_copy project', () => {
      const customDefault = storage.saveProductContextProfile({
        name: 'Botanical Illustration Lovers',
        intendedRecipient: 'Botanists, master gardeners, and natural history readers',
        giftGuideOrOccasion: 'Botanical Archive Guide',
        targetAudience: 'Appreciators of Linnaean taxonomy and copperplate engravings',
        contextNotes: 'Keep prose grounded in botanical accuracy.',
        isDefault: true,
      });

      const project = storage.createProject('product_copy', 'Herbarium Specimen Tee');
      assert.equal(project.productCopyMeta?.contextProfileId, customDefault.id);
      assert.equal(project.productCopyMeta?.intendedRecipient, customDefault.intendedRecipient);
      assert.equal(project.productCopyMeta?.giftGuideOrOccasion, customDefault.giftGuideOrOccasion);
      assert.equal(project.productCopyMeta?.targetAudience, customDefault.targetAudience);
      assert.equal(project.productCopyMeta?.contextNotes, customDefault.contextNotes);
    });
  });

  describe('2. Mockup Image Validation, Compression, Primary Selection & Snapshot Deduplication', () => {
    it('validates image file MIME types and size limits', () => {
      assert.deepEqual(
        validateProductImageFile({ name: 'hoodie.png', type: 'image/png', size: 120_000 }),
        { valid: true }
      );
      assert.deepEqual(
        validateProductImageFile({ name: 'mug.webp', type: 'image/webp', size: 85_000 }),
        { valid: true }
      );
      assert.equal(
        validateProductImageFile({ name: 'empty.png', type: 'image/png', size: 0 }).valid,
        false
      );
      assert.equal(
        validateProductImageFile({
          name: 'huge.png',
          type: 'image/png',
          size: 20 * 1024 * 1024,
        }).valid,
        false
      );
      assert.equal(
        validateProductImageFile({
          name: 'document.pdf',
          type: 'application/pdf',
          size: 50_000,
        }).valid,
        false
      );
    });

    it('extracts base64 and compresses data URLs deterministically with contentHash', async () => {
      const parsed = extractBase64AndMimeFromDataUrl(SAMPLE_PNG_DATA_URL);
      assert.ok(parsed);
      assert.equal(parsed?.mimeType, 'image/png');

      const compressed = await compressProductMockupDataUrl(SAMPLE_PNG_DATA_URL, {
        maxDimension: 800,
        quality: 0.75,
      });
      assert.equal(compressed.dataUrl.includes('data:image/'), true);
      assert.equal(compressed.compressedSizeBytes > 0, true);
      assert.equal(compressed.contentHash.startsWith('fnv1a-'), true);
    });

    it('manages primary-image selection and promotes next image on removal', () => {
      const images: ProductMockupImage[] = [
        {
          id: 'img-1',
          name: 'front.png',
          mimeType: 'image/png',
          isPrimary: true,
          addedAt: '2026-10-26T00:00:00.000Z',
          dataUrl: SAMPLE_PNG_DATA_URL,
        },
        {
          id: 'img-2',
          name: 'back.png',
          mimeType: 'image/png',
          isPrimary: false,
          addedAt: '2026-10-26T00:01:00.000Z',
          dataUrl: SAMPLE_PNG_DATA_URL,
        },
      ];

      const switched = setPrimaryMockupImage(images, 'img-2');
      assert.equal(switched.find((i) => i.id === 'img-1')?.isPrimary, false);
      assert.equal(switched.find((i) => i.id === 'img-2')?.isPrimary, true);

      // Removing primary image promotes remaining image to primary
      const afterRemove = removeMockupImage(switched, 'img-2');
      assert.equal(afterRemove.length, 1);
      assert.equal(afterRemove[0].id, 'img-1');
      assert.equal(afterRemove[0].isPrimary, true);
    });

    it('prevents duplicating base64 image payloads in localStorage projects and historical snapshots while preserving dirty-state detection', () => {
      const project = storage.createProject('product_copy', 'Norse Knotwork Hoodie');
      const baseline = JSON.parse(JSON.stringify(project));

      const mockup: ProductMockupImage = {
        id: 'mockup-test-1',
        name: 'norse-hoodie-front.png',
        mimeType: 'image/png',
        isPrimary: true,
        width: 800,
        height: 800,
        originalSizeBytes: 240000,
        compressedSizeBytes: 38000,
        contentHash: 'fnv1a-12345678-68',
        addedAt: new Date().toISOString(),
        dataUrl: SAMPLE_PNG_DATA_URL,
      };

      const working = {
        ...project,
        productCopyMeta: {
          ...project.productCopyMeta!,
          mockupImages: [mockup],
        },
      };

      // Dirty state detection must detect adding a mockup image
      assert.equal(hasProjectUnsavedChanges(working, baseline), true);

      // Create multiple version snapshots
      const history1 = createVersionSnapshot(working, 'manual_save', {
        label: 'Added mockup image',
      });
      const workingWithHistory = { ...working, versionHistory: history1 };

      // Verify snapshot does NOT contain raw base64 dataUrl
      const latestSnapshot = history1[0];
      const snapshotImages = latestSnapshot.structuredState.productCopyMeta?.mockupImages || [];
      assert.equal(snapshotImages.length, 1);
      assert.equal(snapshotImages[0].id, 'mockup-test-1');
      assert.equal(snapshotImages[0].contentHash, 'fnv1a-12345678-68');
      assert.equal(snapshotImages[0].dataUrl, undefined);

      // Save project to storage and verify raw STORAGE_KEY_PROJECTS in localStorage omits dataUrl
      storage.saveProject(workingWithHistory);
      const rawProjectsJson = localStorage.getItem('sog_writing_projects_v2') || '';
      assert.equal(
        rawProjectsJson.includes(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        ),
        false
      );

      // Yet storage.getProjectById() transparently re-hydrates dataUrl from the mockup asset store!
      const loaded = storage.getProjectById(project.id);
      assert.equal(loaded?.productCopyMeta?.mockupImages?.[0]?.dataUrl, SAMPLE_PNG_DATA_URL);

      // Restoring a version snapshot also preserves the hydrated dataUrl by image ID
      const restored = restoreVersionSnapshot(loaded!, latestSnapshot.id);
      assert.equal(
        restored?.updatedProject.productCopyMeta?.mockupImages?.[0]?.dataUrl,
        SAMPLE_PNG_DATA_URL
      );
    });
  });

  describe('3. URL-Only, Image-Only, and URL+Image Analysis & Epistemic Separation', () => {
    it('extracts JSON-LD Product specs, price, materials, variants, and canonical URL from HTML', () => {
      const sampleHtml = `
        <html>
          <head>
            <title>Archival Brass Pocket Sundial | Science of Gifts Shop</title>
            <link rel="canonical" href="https://shop.scienceofgifts.com/products/brass-sundial" />
            <meta property="og:image" content="https://shop.scienceofgifts.com/img/sundial.jpg" />
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Archival Brass Pocket Sundial",
                "category": "Navigation Instrument",
                "material": "Solid Turned C36000 Brass, Mineral Glass",
                "color": "Unlacquered Aged Brass",
                "width": "58mm",
                "height": "14mm",
                "offers": [
                  { "@type": "Offer", "name": "Standard Brass", "price": "78.00", "priceCurrency": "USD" },
                  { "@type": "Offer", "name": "Engraved Case", "price": "92.00", "priceCurrency": "USD" }
                ]
              }
            </script>
          </head>
          <body>
            <p>Hand-machined pocket sundial calibrated for northern latitudes.</p>
          </body>
        </html>
      `;

      const extracted = extractProductFactsFromHtml(
        sampleHtml,
        'https://shop.scienceofgifts.com/products/brass-sundial?ref=test'
      );
      assert.equal(extracted.productName, 'Archival Brass Pocket Sundial');
      assert.equal(
        extracted.canonicalUrl,
        'https://shop.scienceofgifts.com/products/brass-sundial'
      );
      assert.equal(extracted.price, '$78.00 USD');
      assert.equal(extracted.materials, 'Solid Turned C36000 Brass, Mineral Glass');
      assert.equal(extracted.colors, 'Unlacquered Aged Brass');
      assert.equal(extracted.dimensions.includes('Width: 58mm'), true);
      assert.equal(extracted.variants, 'Standard Brass, Engraved Case');
    });

    it('strictly prevents AI inferences from appearing as Verified Facts in Image-Only mode', () => {
      const { analysisMode } = buildProductAnalysisPromptAndParts({
        targetUrl: '',
        mockupImages: [
          {
            id: 'm1',
            name: 'schrodinger-hoodie.png',
            mimeType: 'image/png',
            dataUrl: SAMPLE_PNG_DATA_URL,
            isPrimary: true,
          },
        ],
      });
      assert.equal(analysisMode, 'image_only');

      // Suppose the model attempts to guess materials and price even though no URL was supplied
      const simulatedModelJson = {
        productName: 'Schrödinger Wave Equation Pullover Hoodie',
        productType: 'Apparel / Pullover Hoodie',
        verifiedFacts: {
          price: '$55.00',
          materials: '100% Organic Cotton 450gsm',
          dimensions: 'Standard unisex fit',
        },
        visibleObservations: {
          visibleText: 'iℏ ∂/∂t Ψ = ĤΨ — Copenhagen 1927',
          designAndImagery: 'Chalkboard-style wave function diagram and cat paradox emblem',
          garmentOrObjectStyle: 'Heavyweight pullover hoodie with kangaroo pocket',
          visibleColors: 'Charcoal heather garment with cream ink print',
          visualDetails: 'Centered chest print',
        },
        editorialInferences: {
          designConcept: 'Austere quantum mechanics diagram rendered as wearable academic apparatus',
          historicalOrCulturalContext: 'Erwin Schrödinger 1926 wave mechanics formulation',
          recipientResonance: 'Ideal for physics graduate students and lecturers',
          editorialCaution: 'Verify actual garment blank fabric composition before publishing.',
        },
      };

      const normalized = normalizeProductResearchOutput({
        analysisMode: 'image_only',
        targetUrl: '',
        extractedUrlFacts: null,
        parsedModelJson: simulatedModelJson,
      });

      // Epistemic rule check: In image_only mode, verifiedFacts specs MUST be empty and marked unverified!
      assert.equal(normalized.verifiedFacts?.price, '');
      assert.equal(normalized.verifiedFacts?.materials, '');
      assert.equal(normalized.verifiedFacts?.dimensions, '');
      assert.equal(normalized.verifiedFacts?.sourceUrl, '');
      assert.deepEqual(normalized.verifiedFacts?.unverifiedFields, [
        'price',
        'materials',
        'dimensions',
        'colors',
        'features',
        'variants',
      ]);
      // Legacy flat materials & dimensions also remain empty rather than fabricated
      assert.equal(normalized.materials, '');
      assert.equal(normalized.dimensions, '');

      // Meanwhile Visible Observations and Editorial Inferences are preserved accurately
      assert.equal(normalized.visibleObservations?.visibleText?.includes('Copenhagen 1927'), true);
      assert.equal(
        normalized.visibleObservations?.garmentOrObjectStyle?.includes('pullover hoodie'),
        true
      );
      assert.equal(
        normalized.editorialInferences?.designConcept?.includes('quantum mechanics'),
        true
      );
      assert.equal(
        normalized.editorialInferences?.historicalOrCulturalContext?.includes('Erwin Schrödinger'),
        true
      );
    });

    it('preserves Verified Facts, unverified field indicators, and Gift Guide Studio compatibility fields in URL + Image mode', () => {
      const extractedFacts = extractProductFactsFromHtml(
        `<html><head><title>History Teacher Mug</title><script type="application/ld+json">{"@type":"Product","name":"History Teacher Definition Ceramic Mug","material":"High-fire stoneware ceramic","offers":{"price":"22.00","priceCurrency":"USD"}}</script></head><body>15oz mug.</body></html>`,
        'https://shop.scienceofgifts.com/products/history-teacher-mug'
      );

      const normalized = normalizeProductResearchOutput({
        analysisMode: 'url_and_image',
        targetUrl: 'https://shop.scienceofgifts.com/products/history-teacher-mug',
        extractedUrlFacts: extractedFacts,
        parsedModelJson: {
          productName: 'History Teacher Definition Ceramic Mug',
          productType: 'Ceramic Drinkware',
          verifiedFacts: {
            features: 'C-handle, dishwasher safe',
          },
          visibleObservations: {
            visibleText: 'History Teacher (n.) One who makes the past unavoidable.',
            designAndImagery: 'Dictionary typography layout in serif ink',
            garmentOrObjectStyle: 'Cylindrical ceramic mug',
            visibleColors: 'Warm ivory glaze with black typography',
          },
          editorialInferences: {
            designConcept: 'Lexicographical tribute to classroom historians',
            historicalOrCulturalContext: 'inspired by 19th-century Oxford dictionary slips',
            recipientResonance: 'Resonates with high school history teachers and mentors',
          },
          whyItFits: 'Practical desk companion for educators.',
          bestFor: 'History teachers and department chairs.',
          buyerConsiderations: 'Hand wash recommended for longevity.',
        },
      });

      assert.equal(normalized.analysisMode, 'url_and_image');
      assert.equal(
        normalized.verifiedFacts?.sourceUrl,
        'https://shop.scienceofgifts.com/products/history-teacher-mug'
      );
      assert.equal(normalized.verifiedFacts?.price, '$22.00 USD');
      assert.equal(normalized.verifiedFacts?.materials, 'High-fire stoneware ceramic');
      assert.equal(normalized.verifiedFacts?.fieldStatus?.price, 'verified_from_url');
      assert.equal(normalized.verifiedFacts?.fieldStatus?.materials, 'verified_from_url');
      // Dimensions were not on the page, so it must be marked unverified
      assert.equal(normalized.verifiedFacts?.fieldStatus?.dimensions, 'unverified');
      assert.equal(normalized.verifiedFacts?.unverifiedFields?.includes('dimensions'), true);

      // Backward-compatible Gift Guide Studio fields
      assert.equal(normalized.productName, 'History Teacher Definition Ceramic Mug');
      assert.equal(normalized.productType, 'Ceramic Drinkware');
      assert.equal(
        normalized.productUrl,
        'https://shop.scienceofgifts.com/products/history-teacher-mug'
      );
      assert.equal(normalized.materials, 'High-fire stoneware ceramic');
      assert.equal(normalized.features, 'C-handle, dishwasher safe');
      assert.equal(normalized.whyItFits, 'Practical desk companion for educators.');
      assert.equal(normalized.bestFor, 'History teachers and department chairs.');
      assert.equal(normalized.buyerConsiderations, 'Hand wash recommended for longevity.');
    });

    it('returns clear validation errors when neither URL nor mockup image is provided', async () => {
      // Client service check
      const clientRes = await analyzeProductResearch('');
      assert.equal(clientRes.ok, false);
      assert.equal(
        clientRes.error?.includes('Please enter a product URL, upload at least one mockup image'),
        true
      );

      // Worker endpoint check
      const req = new Request('http://localhost/api/products/analyze-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: '', mockupImages: [] }),
      });
      const workerRes = await handleApiRequest(req, {
        GEMINI_API_KEY: 'test-key',
        ASSETS: { fetch: async () => new Response('ok') },
      });
      assert.equal(workerRes.status, 400);
      const data = await workerRes.json();
      assert.equal(data.ok, false);
      assert.equal(
        data.error?.includes('Please provide a product URL, upload at least one mockup image'),
        true
      );
    });
  });
});
